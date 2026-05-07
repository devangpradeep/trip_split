# frozen_string_literal: true

class Notification < ApplicationRecord
  belongs_to :user
  belongs_to :actor, class_name: 'User', optional: true
  belongs_to :group, optional: true
  belongs_to :notifiable, polymorphic: true, optional: true

  validates :event_type, presence: true
  validates :title, presence: true

  scope :recent, -> { order(created_at: :desc) }
  scope :unread, -> { where(read_at: nil) }

  def read?
    read_at.present?
  end
end
