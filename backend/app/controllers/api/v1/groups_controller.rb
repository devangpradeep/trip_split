# frozen_string_literal: true

module Api
  module V1
    class GroupsController < ApplicationController
      before_action :authenticate_user!
      before_action :set_group, only: %i[show update destroy archive restore]
      before_action :ensure_can_manage_group!, only: %i[update]
      before_action :ensure_active_group!, only: %i[update archive]
      before_action :ensure_owner!, only: %i[archive restore destroy]
      before_action :ensure_balances_settled!, only: %i[archive destroy]
      before_action :ensure_currency_editable!, only: %i[update]

      def index
        @groups = current_user.groups.includes(:members, :group_memberships).order(created_at: :desc)
        render json: @groups.map { |group| group_payload(group) }
      end

      def show
        render json: group_payload(@group)
      end

      def create
        @group = Group.new(group_params)
        @group.created_by = current_user

        ActiveRecord::Base.transaction do
          @group.save!
          @group.group_memberships.create!(user: current_user, role: 'admin')
        end

        render json: group_payload(@group.reload), status: :created
      rescue ActiveRecord::RecordInvalid => e
        render json: e.record.errors, status: :unprocessable_entity
      end

      def update
        if @group.update(group_params)
          render json: group_payload(@group)
        else
          render json: @group.errors, status: :unprocessable_entity
        end
      end

      def archive
        @group.with_lock do
          @group.group_invites.active.update_all(revoked_at: Time.current)
          @group.update!(archived_at: Time.current)
        end
        render json: group_payload(@group)
      end

      def restore
        @group.update!(archived_at: nil)
        render json: group_payload(@group)
      end

      def destroy
        @group.destroy
        head :no_content
      end

      private

      def set_group
        @group = current_user.groups.includes(:members, :group_memberships).find(params[:id])
      end

      def group_params
        params.require(:group).permit(:name, :description, :currency)
      end

      def ensure_can_manage_group!
        return if @group.created_by_id == current_user.id
        return if @group.group_memberships.exists?(user_id: current_user.id, role: 'admin')

        render json: { error: 'Only group admins or the group creator can modify this group' }, status: :forbidden
      end

      def ensure_owner!
        return if @group.created_by_id == current_user.id

        render json: { error: 'Only the group owner can perform this action' }, status: :forbidden
      end

      def ensure_active_group!
        return unless @group.archived?

        render json: { error: 'Restore this group before making changes' }, status: :unprocessable_entity
      end

      def ensure_balances_settled!
        return if balances_settled?(@group)

        render json: { error: 'Settle all balances before archiving or deleting this group' },
               status: :unprocessable_entity
      end

      def ensure_currency_editable!
        requested_currency = group_params[:currency]
        return if requested_currency.blank? || requested_currency == @group.currency
        return unless group_has_financial_activity?(@group)

        render json: { error: 'Currency cannot be changed after expenses or settlements exist' },
               status: :unprocessable_entity
      end

      def group_payload(group)
        archived = group.archived?
        owner = group.created_by_id == current_user.id
        settled = balances_settled?(group)

        {
          id: group.id,
          name: group.name,
          description: group.description,
          currency: group.currency,
          created_by_id: group.created_by_id,
          archived_at: group.archived_at,
          status: archived ? 'archived' : 'active',
          members: group.members.map { |member| member_payload(group, member) },
          current_user_role: current_user_role(group),
          can_update: can_manage_group?(group) && !archived,
          can_archive: owner && !archived && settled,
          can_restore: owner && archived,
          can_delete: owner && settled,
          balances_settled: settled,
          expense_count: group.expenses.count,
          settlement_count: group.settlements.count
        }
      end

      def member_payload(group, member)
        {
          id: member.id,
          name: member.name,
          email: member.email,
          avatar_url: member.avatar_url,
          can_remove: member_removable?(group, member)
        }
      end

      def can_manage_group?(group)
        group.created_by_id == current_user.id ||
          group.group_memberships.exists?(user_id: current_user.id, role: 'admin')
      end

      def current_user_role(group)
        group.group_memberships.find { |membership| membership.user_id == current_user.id }&.role
      end

      def balances_settled?(group)
        Balances::Calculator.new(group).call.values.all? { |balance| balance.abs <= BigDecimal('0.01') }
      end

      def group_has_financial_activity?(group)
        group.expenses.exists? || group.settlements.exists?
      end

      def member_removable?(group, member)
        group.created_by_id == current_user.id &&
          !group.archived? &&
          member.id != current_user.id &&
          !member_has_financial_history?(group, member.id)
      end

      def member_has_financial_history?(group, user_id)
        group.expenses.exists?(paid_by_id: user_id) ||
          group.expenses.exists?(created_by_id: user_id) ||
          ExpenseSplit.joins(:expense)
                      .where(expenses: { group_id: group.id }, user_id: user_id)
                      .exists? ||
          group.settlements
               .where('from_user_id = :user_id OR to_user_id = :user_id', user_id: user_id)
               .exists?
      end
    end
  end
end
