# frozen_string_literal: true

class CreateGroupInvites < ActiveRecord::Migration[8.1]
  def change
    create_table :group_invites, id: :uuid, default: 'gen_random_uuid()' do |t|
      t.references :group, type: :uuid, null: false, foreign_key: true
      t.references :created_by, type: :uuid, null: false, foreign_key: { to_table: :users }
      t.string :token, null: false
      t.datetime :expires_at, null: false
      t.datetime :revoked_at

      t.timestamps
    end

    add_index :group_invites, :token, unique: true
    add_index :group_invites, :revoked_at
  end
end
