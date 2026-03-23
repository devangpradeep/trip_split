class CreateExpenses < ActiveRecord::Migration[7.0]
  def change
    create_table :expenses, id: :uuid do |t|
      t.references :group, null: false, type: :uuid, foreign_key: true
      t.references :paid_by, null: false, type: :uuid, foreign_key: { to_table: :users }
      t.string :description
      t.decimal :amount
      t.string :currency
      t.string :split_type
      t.date :date
      t.string :category

      t.timestamps
    end
  end
end
