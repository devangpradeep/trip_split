# frozen_string_literal: true

class Expense < ApplicationRecord
  belongs_to :group, touch: true
  belongs_to :paid_by, class_name: 'User'
  belongs_to :created_by, class_name: 'User'
  has_many :expense_splits, dependent: :destroy

  has_one_attached :receipt

  validates :description, presence: true
  validates :amount, presence: true, numericality: { greater_than: 0 }
  validates :currency, presence: true
  validates :split_type, presence: true, inclusion: { in: %w[equal exact percentage] }
  validates :date, presence: true
  validate :acceptable_receipt

  private

  def acceptable_receipt
    return unless receipt.attached?

    unless receipt.blob.byte_size <= 5.megabytes
      errors.add(:receipt, 'is too large (max 5 MB)')
    end

    acceptable_types = %w[image/jpeg image/png image/webp image/heic]
    unless acceptable_types.include?(receipt.blob.content_type)
      errors.add(:receipt, 'must be JPEG, PNG, WebP, or HEIC')
    end
  end
end
