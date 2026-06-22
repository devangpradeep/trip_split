# frozen_string_literal: true

module Api
  module V1
    class SettlementsController < ApplicationController
      class SettlementValidationError < StandardError; end

      before_action :authenticate_user!
      before_action :set_group
      before_action :ensure_active_group!, only: %i[create destroy]
      before_action :set_settlement, only: %i[show destroy]
      before_action :ensure_can_delete_settlement!, only: %i[destroy]

      def index
        @settlements = @group.settlements.includes(:from_user, :to_user).order(date: :desc)
        render json: @settlements, include: {
          from_user: { only: %i[id name avatar_url is_guest] },
          to_user: { only: %i[id name avatar_url is_guest] }
        }
      end

      def create
        from_user = resolve_from_user!
        to_user = find_settlement_recipient!(from_user)
        amount = settlement_amount!
        max_payable = if proxy_settlement?
                        max_pairwise_payable_to(to_user.id, from_user.id)
                      else
                        max_payable_to(to_user.id, from_user.id)
                      end
        raise SettlementValidationError, 'No payable balance found for this member' if max_payable <= 0

        if amount > max_payable
          raise SettlementValidationError, "Amount exceeds payable limit of #{format('%.2f', max_payable.to_f)}"
        end

        @settlement = @group.settlements.build(
          from_user: from_user,
          to_user: to_user,
          amount: amount,
          date: settlement_params[:date].presence || Date.current,
          note: settlement_params[:note]
        )

        @settlement.save!
        notify_settlement_created(@settlement) unless from_user.is_guest?

        render json: @settlement, status: :created, include: {
          from_user: { only: %i[id name avatar_url is_guest] },
          to_user: { only: %i[id name avatar_url is_guest] }
        }
      rescue SettlementValidationError => e
        render json: { errors: [e.message] }, status: :unprocessable_entity
      rescue ActiveRecord::RecordInvalid
        render json: { errors: @settlement.errors.full_messages }, status: :unprocessable_entity
      end

      def show
        render json: @settlement, include: {
          from_user: { only: %i[id name avatar_url is_guest] },
          to_user: { only: %i[id name avatar_url is_guest] }
        }
      end

      def destroy
        recipients = [@settlement.from_user, @settlement.to_user]
        amount = @settlement.amount

        @settlement.destroy
        notify_settlement_deleted(recipients, amount)

        head :no_content
      end

      private

      def set_group
        @group = current_user.groups.find(params[:group_id])
      end

      def ensure_active_group!
        return unless @group.archived?

        render json: { error: 'Restore this group before changing settlements' }, status: :unprocessable_entity
      end

      def set_settlement
        @settlement = @group.settlements.find(params[:id])
      end

      def settlement_params
        params.require(:settlement).permit(:to_user_id, :from_user_id, :amount, :date, :note)
      end

      def resolve_from_user!
        from_id = settlement_params[:from_user_id]
        return current_user if from_id.blank?

        # Proxy settlement: current_user must be admin/owner, target must be a guest
        unless @group.created_by_id == current_user.id ||
               @group.group_memberships.exists?(user_id: current_user.id, role: 'admin')
          raise SettlementValidationError, 'Only admins can settle on behalf of others'
        end

        proxy = @group.members.find_by(id: from_id)
        raise SettlementValidationError, 'Member not found in group' unless proxy
        raise SettlementValidationError, 'Can only settle on behalf of guest members' unless proxy.is_guest?

        proxy
      end

      def find_settlement_recipient!(from_user)
        recipient_id = settlement_params[:to_user_id]
        raise SettlementValidationError, 'Recipient is required' if recipient_id.blank?

        recipient = @group.members.find_by(id: recipient_id)
        raise SettlementValidationError, 'Recipient must be a member of this group' unless recipient
        raise SettlementValidationError, 'Cannot settle with the same person' if recipient.id == from_user.id

        recipient
      end

      def settlement_amount!
        amount = BigDecimal(settlement_params[:amount].to_s)
        raise SettlementValidationError, 'Amount must be greater than zero' if amount <= 0

        amount.round(2)
      rescue ArgumentError
        raise SettlementValidationError, 'Invalid settlement amount'
      end

      def max_payable_to(recipient_id, from_user_id = current_user.id)
        balances = current_group_balances
        payer_owes = [-(balances[from_user_id] || 0), 0].max
        recipient_is_owed = [balances[recipient_id] || 0, 0].max
        [payer_owes, recipient_is_owed].min
      end

      def max_pairwise_payable_to(recipient_id, from_user_id)
        settlement = Balances::PairwiseSettlementCalculator.new(@group).call.find do |candidate|
          candidate[:from_user_id] == from_user_id && candidate[:to_user_id] == recipient_id
        end

        settlement&.fetch(:amount, 0) || 0
      end

      def proxy_settlement?
        settlement_params[:from_user_id].present?
      end

      def current_group_balances
        Balances::Calculator.new(@group).call
      end

      def ensure_can_delete_settlement!
        return if @settlement.from_user_id == current_user.id
        return if @group.group_memberships.exists?(user_id: current_user.id, role: 'admin')

        render json: { error: 'Only group admins or the member who recorded this settlement can delete it' },
               status: :forbidden
      end

      def notify_settlement_created(settlement)
        Notifications::Creator.call(
          recipients: [settlement.to_user],
          actor: current_user,
          group: @group,
          notifiable: settlement,
          event_type: 'settlement_created',
          title: "Settlement recorded in #{@group.name}",
          body: "#{current_user.name} recorded #{notification_amount(settlement.amount)}",
          url: "/groups/#{@group.id}"
        )
      end

      def notify_settlement_deleted(recipients, amount)
        Notifications::Creator.call(
          recipients: recipients,
          actor: current_user,
          group: @group,
          event_type: 'settlement_deleted',
          title: "Settlement deleted in #{@group.name}",
          body: "#{current_user.name} deleted a settlement for #{notification_amount(amount)}",
          url: "/groups/#{@group.id}"
        )
      end

      def notification_amount(amount)
        "#{@group.currency} #{format('%.2f', amount.to_d)}"
      end
    end
  end
end
