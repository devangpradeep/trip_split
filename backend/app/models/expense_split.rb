# frozen_string_literal: true

class ExpenseSplit < ApplicationRecord
  belongs_to :expense
  belongs_to :user

  validates :amount, presence: true, numericality: { greater_than_or_equal_to: 0 }
end
