# frozen_string_literal: true

class CreatePushSubscriptions < ActiveRecord::Migration[8.1]
  def change
    create_table :push_subscriptions, id: :uuid do |t|
      t.references :user, null: false, type: :uuid, foreign_key: true
      t.text :endpoint, null: false
      t.text :p256dh_key, null: false
      t.text :auth_key, null: false
      t.text :user_agent
      t.datetime :last_used_at

      t.timestamps
    end

    add_index :push_subscriptions, :endpoint, unique: true
  end
end
