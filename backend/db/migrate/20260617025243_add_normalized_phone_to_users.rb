class AddNormalizedPhoneToUsers < ActiveRecord::Migration[8.1]
  class MigrationUser < ApplicationRecord
    self.table_name = "users"
  end

  def up
    add_column :users, :normalized_phone, :string

    say_with_time "Backfilling normalized phone values" do
      MigrationUser.reset_column_information
      MigrationUser.find_each do |user|
        normalized_phone = normalize_phone(user.phone)
        next if normalized_phone.blank?

        user.update_columns(normalized_phone: normalized_phone)
      end
    end

    add_index :users,
              :normalized_phone,
              unique: true,
              where: "normalized_phone IS NOT NULL",
              name: "index_users_on_normalized_phone"
  end

  def down
    remove_index :users, name: "index_users_on_normalized_phone"
    remove_column :users, :normalized_phone
  end

  private

  def normalize_phone(value)
    normalized_value = value.to_s.strip
    return normalized_value if normalized_value.match?(/\A\d{10}\z/)

    nil
  end
end
