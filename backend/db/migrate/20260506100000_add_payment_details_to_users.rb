# frozen_string_literal: true

class AddPaymentDetailsToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :upi_id, :text
    add_column :users, :bank_account_holder_name, :text
    add_column :users, :bank_name, :text
    add_column :users, :bank_account_number, :text
    add_column :users, :bank_ifsc, :text
  end
end
