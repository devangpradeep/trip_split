# frozen_string_literal: true

class Group < ApplicationRecord
  belongs_to :created_by, class_name: 'User'

  has_many :group_memberships, dependent: :destroy
  has_many :members, through: :group_memberships, source: :user
  has_many :group_invites, dependent: :destroy
  has_many :expenses, dependent: :destroy
  has_many :settlements, dependent: :destroy

  attribute :currency, :string, default: 'INR'

  validates :name, presence: true
  validates :currency, presence: true

  def archived?
    archived_at.present?
  end

  def active?
    !archived?
  end
end
