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
          from_user: { only: %i[id name avatar_url] },
          to_user: { only: %i[id name avatar_url] }
        }
      end

      def create
        to_user = find_settlement_recipient!
        amount = settlement_amount!
        max_payable = max_payable_to(to_user.id)
        raise SettlementValidationError, 'No payable balance found for this member' if max_payable <= 0

        if amount > max_payable
          raise SettlementValidationError, "Amount exceeds payable limit of #{format('%.2f', max_payable.to_f)}"
        end

        @settlement = @group.settlements.build(
          from_user: current_user,
          to_user: to_user,
          amount: amount,
          date: settlement_params[:date].presence || Date.current,
          note: settlement_params[:note]
        )

        @settlement.save!
        notify_settlement_created(@settlement)

        render json: @settlement, status: :created, include: {
          from_user: { only: %i[id name avatar_url] },
          to_user: { only: %i[id name avatar_url] }
        }
      rescue SettlementValidationError => e
        render json: { errors: [e.message] }, status: :unprocessable_entity
      rescue ActiveRecord::RecordInvalid
        render json: { errors: @settlement.errors.full_messages }, status: :unprocessable_entity
      end

      def show
        render json: @settlement, include: {
          from_user: { only: %i[id name avatar_url] },
          to_user: { only: %i[id name avatar_url] }
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
        params.require(:settlement).permit(:to_user_id, :amount, :date, :note)
      end

      def find_settlement_recipient!
        recipient_id = settlement_params[:to_user_id]
        raise SettlementValidationError, 'Recipient is required' if recipient_id.blank?

        recipient = @group.members.find_by(id: recipient_id)
        raise SettlementValidationError, 'Recipient must be a member of this group' unless recipient
        raise SettlementValidationError, 'You cannot settle with yourself' if recipient.id == current_user.id

        recipient
      end

      def settlement_amount!
        amount = BigDecimal(settlement_params[:amount].to_s)
        raise SettlementValidationError, 'Amount must be greater than zero' if amount <= 0

        amount.round(2)
      rescue ArgumentError
        raise SettlementValidationError, 'Invalid settlement amount'
      end

      def max_payable_to(recipient_id)
        balances = current_group_balances
        current_user_owes = [-(balances[current_user.id] || 0), 0].max
        recipient_is_owed = [balances[recipient_id] || 0, 0].max
        [current_user_owes, recipient_is_owed].min
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
