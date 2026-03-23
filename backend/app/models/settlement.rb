class Settlement < ApplicationRecord
  belongs_to :group
  belongs_to :from_user, class_name: 'User'
  belongs_to :to_user, class_name: 'User'

  validates :amount, presence: true, numericality: { greater_than: 0 }
  validates :date, presence: true
end
