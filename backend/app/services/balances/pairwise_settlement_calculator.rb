# frozen_string_literal: true

module Balances
  # Calculates outstanding debts between the members who incurred them.
  # Unlike SettlementSimplifier, this preserves the expense payer as the
  # recipient instead of redirecting payments based on group-wide net balances.
  class PairwiseSettlementCalculator
    EPSILON = BigDecimal('0.01')

    def initialize(group)
      @group = group
    end

    def call
      obligations = Hash.new(0.to_d)

      apply_expenses!(obligations)
      apply_settlements!(obligations)

      settlements_for(obligations).sort_by { |settlement| -settlement[:amount] }
    end

    private

    def settlements_for(obligations)
      obligations.filter_map do |member_ids, amount|
        next if amount.abs < EPSILON

        from_user_id, to_user_id = directed_member_ids(member_ids, amount)
        {
          from_user_id: from_user_id,
          to_user_id: to_user_id,
          amount: amount.abs.round(2)
        }
      end
    end

    def apply_expenses!(obligations)
      @group.expenses.includes(:expense_splits).find_each do |expense|
        expense.expense_splits.each do |split|
          add_obligation!(obligations, split.user_id, expense.paid_by_id, split.amount)
        end
      end
    end

    def apply_settlements!(obligations)
      @group.settlements.find_each do |settlement|
        add_obligation!(
          obligations,
          settlement.from_user_id,
          settlement.to_user_id,
          -settlement.amount
        )
      end
    end

    def add_obligation!(obligations, debtor_id, creditor_id, amount)
      return if debtor_id == creditor_id

      member_ids = [debtor_id, creditor_id].sort
      direction = debtor_id == member_ids.first ? 1 : -1
      obligations[member_ids] += amount.to_d * direction
    end

    def directed_member_ids(member_ids, amount)
      amount.positive? ? member_ids : member_ids.reverse
    end
  end
end
