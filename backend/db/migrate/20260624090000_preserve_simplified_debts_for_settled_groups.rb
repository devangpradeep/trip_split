# frozen_string_literal: true

class PreserveSimplifiedDebtsForSettledGroups < ActiveRecord::Migration[8.1]
  def up
    execute <<~SQL.squish
      UPDATE groups
      SET simplify_debts = TRUE
      WHERE simplify_debts = FALSE AND EXISTS (
        SELECT 1 FROM settlements
        WHERE settlements.group_id = groups.id
      )
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration, 'Previous settlement modes cannot be inferred safely'
  end
end
