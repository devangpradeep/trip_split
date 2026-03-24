# frozen_string_literal: true

module Api
  module V1
    class BalancesController < ApplicationController
      before_action :authenticate_user!
      before_action :set_group

      def index
        # Calculate balances dynamically for MVP
        # A positive balance means the user is owed money
        # A negative balance means the user owes money

        balances = Hash.new(0)

        # 1. Process expenses
        @group.expenses.includes(:expense_splits).find_each do |expense|
          # The person who paid getting the full amount
          balances[expense.paid_by_id] += expense.amount

          # Subtract each split amount from the corresponding user
          expense.expense_splits.each do |split|
            balances[split.user_id] -= split.amount
          end
        end

        # 2. Process settlements
        @group.settlements.find_each do |settlement|
          balances[settlement.from_user_id] += settlement.amount
          balances[settlement.to_user_id] -= settlement.amount
        end

        # 3. Format response
        result = balances.map do |user_id, amount|
          user = User.find_by(id: user_id)
          {
            user: { id: user&.id, name: user&.name, avatar_url: user&.avatar_url },
            balance: amount.to_f
          }
        end

        render json: { balances: result }
      end

      private

      def set_group
        @group = current_user.groups.find(params[:group_id])
      end
    end
  end
end
