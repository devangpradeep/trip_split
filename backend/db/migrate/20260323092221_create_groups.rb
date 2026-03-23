class CreateGroups < ActiveRecord::Migration[7.0]
  def change
    create_table :groups, id: :uuid do |t|
      t.string :name
      t.text :description
      t.string :currency
      t.references :created_by, null: false, type: :uuid, foreign_key: { to_table: :users }

      t.timestamps
    end
  end
end
