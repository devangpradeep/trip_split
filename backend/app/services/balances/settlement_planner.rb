# frozen_string_literal: true

module Balances
  # Uses one settlement strategy for the entire group. A zero-net group is
  # always settled, which cancels closed payment cycles from prior activity.
  class SettlementPlanner
    EPSILON = BigDecimal('0.01')

    def initialize(group, balances: nil)
      @group = group
      @balances = balances
    end

    def call
      return [] if balances.values.all? { |amount| amount.abs <= EPSILON }

      return SettlementSimplifier.new(balances).call if @group.simplify_debts?

      PairwiseSettlementCalculator.new(@group).call
    end

    private

    def balances
      @balances ||= Calculator.new(@group).call
    end
  end
end
