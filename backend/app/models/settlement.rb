# frozen_string_literal: true

class Settlement < ApplicationRecord
  belongs_to :group, touch: true
  belongs_to :from_user, class_name: 'User'
  belongs_to :to_user, class_name: 'User'

  validates :amount, presence: true, numericality: { greater_than: 0 }
  validates :date, presence: true
end
