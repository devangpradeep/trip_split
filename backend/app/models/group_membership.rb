class GroupMembership < ApplicationRecord
  belongs_to :user
  belongs_to :group

  validates :role, inclusion: { in: %w[admin member] }
end
