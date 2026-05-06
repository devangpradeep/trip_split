# frozen_string_literal: true

class AddCreatedByToExpenses < ActiveRecord::Migration[8.1]
  def up
    add_reference :expenses, :created_by, type: :uuid, foreign_key: { to_table: :users }

    execute <<~SQL.squish
      UPDATE expenses
      SET created_by_id = paid_by_id
      WHERE created_by_id IS NULL
    SQL

    change_column_null :expenses, :created_by_id, false
  end

  def down
    remove_reference :expenses, :created_by, type: :uuid, foreign_key: { to_table: :users }
  end
end
