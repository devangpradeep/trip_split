# frozen_string_literal: true

class GroupInvite < ApplicationRecord
  belongs_to :group
  belongs_to :created_by, class_name: 'User'

  before_validation :ensure_token, on: :create

  validates :token, presence: true, uniqueness: true

  scope :active, lambda {
    where(revoked_at: nil).where('expires_at IS NULL OR expires_at > ?', Time.current)
  }

  def revoked?
    revoked_at.present?
  end

  def expired?
    expires_at.present? && expires_at <= Time.current
  end

  def active?
    !revoked? && !expired?
  end

  private

  def ensure_token
    self.token ||= SecureRandom.urlsafe_base64(32)
  end
end
