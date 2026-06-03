# frozen_string_literal: true

module Balances
  # Given a Hash of { user_id => net_balance }, produces the minimum set of
  # transfers needed to settle all debts (greedy simplification algorithm).
  #
  # Returns an array of { from_user_id:, to_user_id:, amount: } hashes.
  class SettlementSimplifier
    EPSILON = 0.01

    def initialize(balances)
      @balances = balances
    end

    def call
      # Debtors: owe money (negative balance). Sort largest debt first.
      debtors   = @balances.select { |_, v| v < -EPSILON }
                            .map    { |uid, v| [uid, v.to_f.abs] }
                            .sort_by { |_, amt| -amt }

      # Creditors: are owed money (positive balance). Sort largest credit first.
      creditors = @balances.select { |_, v| v > EPSILON }
                            .map    { |uid, v| [uid, v.to_f] }
                            .sort_by { |_, amt| -amt }

      settlements = []
      d_idx = 0
      c_idx = 0

      while d_idx < debtors.length && c_idx < creditors.length
        debtor_id,   debt   = debtors[d_idx]
        creditor_id, credit = creditors[c_idx]

        amount = [debt, credit].min.round(2)
        next if amount < EPSILON

        settlements << { from_user_id: debtor_id, to_user_id: creditor_id, amount: amount }

        debtors[d_idx][1]   = (debt   - amount).round(2)
        creditors[c_idx][1] = (credit - amount).round(2)

        d_idx += 1 if debtors[d_idx][1]   < EPSILON
        c_idx += 1 if creditors[c_idx][1] < EPSILON
      end

      settlements
    end
  end
end
