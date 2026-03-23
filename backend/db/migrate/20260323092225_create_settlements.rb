class CreateSettlements < ActiveRecord::Migration[7.0]
  def change
    create_table :settlements, id: :uuid do |t|
      t.references :group, null: false, type: :uuid, foreign_key: true
      t.references :from_user, null: false, type: :uuid, foreign_key: { to_table: :users }
      t.references :to_user, null: false, type: :uuid, foreign_key: { to_table: :users }
      t.decimal :amount
      t.date :date
      t.text :note

      t.timestamps
    end
  end
end
