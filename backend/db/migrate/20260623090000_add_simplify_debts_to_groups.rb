# frozen_string_literal: true

class AddSimplifyDebtsToGroups < ActiveRecord::Migration[8.1]
  def up
    add_column :groups, :simplify_debts, :boolean, default: false, null: false
    preserve_simplified_mode_for_registered_groups
  end

  def down
    remove_column :groups, :simplify_debts
  end

  private

  def preserve_simplified_mode_for_registered_groups
    execute <<~SQL.squish
      UPDATE groups
      SET simplify_debts = TRUE
      WHERE NOT EXISTS (
        SELECT 1 FROM group_memberships
        INNER JOIN users ON users.id = group_memberships.user_id
        WHERE group_memberships.group_id = groups.id AND users.is_guest = TRUE
      )
    SQL
  end
end
