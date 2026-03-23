class CreateExpenseSplits < ActiveRecord::Migration[7.0]
  def change
    create_table :expense_splits, id: :uuid do |t|
      t.references :expense, null: false, type: :uuid, foreign_key: true
      t.references :user, null: false, type: :uuid, foreign_key: true
      t.decimal :amount

      t.timestamps
    end
  end
end
