# frozen_string_literal: true

class AllowNullExpiresAtForGroupInvites < ActiveRecord::Migration[8.1]
  def change
    change_column_null :group_invites, :expires_at, true
  end
end
