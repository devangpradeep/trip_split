# frozen_string_literal: true

class AddNotificationPreferencesToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :notify_expense_created, :boolean, null: false, default: true
    add_column :users, :notify_expense_updated, :boolean, null: false, default: true
    add_column :users, :notify_expense_deleted, :boolean, null: false, default: true
    add_column :users, :notify_settlement_created, :boolean, null: false, default: true
    add_column :users, :notify_settlement_deleted, :boolean, null: false, default: true
    add_column :users, :notify_group_member_added, :boolean, null: false, default: true
  end
end
