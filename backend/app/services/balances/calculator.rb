# frozen_string_literal: true

module Balances
  class Calculator
    def initialize(group)
      @group = group
    end

    def call
      balances = Hash.new(0.to_d)

      apply_expenses!(balances)
      apply_settlements!(balances)

      balances
    end

    private

    def apply_expenses!(balances)
      @group.expenses.includes(:expense_splits).find_each do |expense|
        balances[expense.paid_by_id] += expense.amount.to_d
        expense.expense_splits.each do |split|
          balances[split.user_id] -= split.amount.to_d
        end
      end
    end

    def apply_settlements!(balances)
      @group.settlements.find_each do |settlement|
        balances[settlement.from_user_id] += settlement.amount.to_d
        balances[settlement.to_user_id] -= settlement.amount.to_d
      end
    end
  end
end
