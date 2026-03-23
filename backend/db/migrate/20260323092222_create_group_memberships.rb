class CreateGroupMemberships < ActiveRecord::Migration[7.0]
  def change
    create_table :group_memberships, id: :uuid do |t|
      t.references :user, null: false, type: :uuid, foreign_key: true
      t.references :group, null: false, type: :uuid, foreign_key: true
      t.string :role

      t.timestamps
    end
  end
end
