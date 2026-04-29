# frozen_string_literal: true

class AddArchivedAtToGroups < ActiveRecord::Migration[8.1]
  def change
    add_column :groups, :archived_at, :datetime
    add_index :groups, :archived_at
  end
end
