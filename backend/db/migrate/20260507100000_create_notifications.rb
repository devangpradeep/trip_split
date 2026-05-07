# frozen_string_literal: true

class CreateNotifications < ActiveRecord::Migration[8.1]
  # rubocop:disable Metrics/MethodLength
  def change
    create_table :notifications, id: :uuid do |t|
      t.references :user, null: false, type: :uuid, foreign_key: true
      t.references :actor, type: :uuid, foreign_key: { to_table: :users, on_delete: :nullify }
      t.references :group, type: :uuid, foreign_key: { on_delete: :nullify }
      t.references :notifiable, polymorphic: true, type: :uuid
      t.string :event_type, null: false
      t.string :title, null: false
      t.text :body
      t.string :url
      t.datetime :read_at

      t.timestamps
    end

    add_index :notifications, %i[user_id read_at created_at]
  end
  # rubocop:enable Metrics/MethodLength
end
