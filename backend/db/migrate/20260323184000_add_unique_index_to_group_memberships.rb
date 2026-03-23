class AddUniqueIndexToGroupMemberships < ActiveRecord::Migration[8.1]
  def change
    add_index :group_memberships, [:group_id, :user_id], unique: true
  end
end
