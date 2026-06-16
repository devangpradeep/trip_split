class AddIsGuestToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :is_guest, :boolean, default: false, null: false
  end
end
