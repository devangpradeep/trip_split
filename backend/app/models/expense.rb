# frozen_string_literal: true

class Expense < ApplicationRecord
  belongs_to :group
  belongs_to :paid_by, class_name: 'User'
  belongs_to :created_by, class_name: 'User'
  has_many :expense_splits, dependent: :destroy

  validates :description, presence: true
  validates :amount, presence: true, numericality: { greater_than: 0 }
  validates :currency, presence: true
  validates :split_type, presence: true, inclusion: { in: %w[equal exact percentage] }
  validates :date, presence: true
end
