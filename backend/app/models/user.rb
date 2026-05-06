# frozen_string_literal: true

class User < ApplicationRecord
  PAYMENT_DETAIL_ATTRIBUTES = %i[
    upi_id
    bank_account_holder_name
    bank_name
    bank_account_number
    bank_ifsc
  ].freeze

  # Include default devise modules. Others available are:
  # :confirmable, :lockable, :timeoutable, :trackable and :omniauthable
  devise :database_authenticatable, :registerable,
         :recoverable, :validatable,
         :jwt_authenticatable, jwt_revocation_strategy: JwtDenylist

  encrypts(*PAYMENT_DETAIL_ATTRIBUTES)

  has_many :group_memberships, dependent: :destroy
  has_many :groups, through: :group_memberships
  has_many :group_invites_created, class_name: 'GroupInvite', foreign_key: 'created_by_id', dependent: :nullify
  has_many :expenses_paid, class_name: 'Expense', foreign_key: 'paid_by_id'
  has_many :expense_splits, dependent: :destroy
  has_many :settlements_sent, class_name: 'Settlement', foreign_key: 'from_user_id'
  has_many :settlements_received, class_name: 'Settlement', foreign_key: 'to_user_id'

  validates :name, presence: true
  validates :upi_id,
            format: { with: /\A[a-z0-9._-]+@[a-z0-9._-]+\z/i, message: 'must look like name@bank' },
            allow_blank: true
  validates :bank_ifsc,
            format: { with: /\A[A-Z]{4}0[A-Z0-9]{6}\z/, message: 'must be a valid IFSC code' },
            allow_blank: true
  validates :bank_account_number,
            format: { with: /\A\d{6,18}\z/, message: 'must be 6 to 18 digits' },
            allow_blank: true

  before_validation :normalize_profile_fields

  private

  def normalize_profile_fields
    normalize_identity_fields
    normalize_payment_fields
  end

  def normalize_identity_fields
    self.name = name.to_s.strip
    self.phone = phone.to_s.strip.presence
  end

  def normalize_payment_fields
    PAYMENT_DETAIL_ATTRIBUTES.each { |attribute| normalize_payment_field(attribute) }
  end

  def normalize_payment_field(attribute)
    self[attribute] = normalized_payment_value(attribute)
  end

  def normalized_payment_value(attribute)
    case attribute
    when :upi_id
      normalized_text(public_send(attribute))&.downcase
    when :bank_account_number
      public_send(attribute).to_s.gsub(/\D/, '').presence
    when :bank_ifsc
      normalized_text(public_send(attribute))&.upcase
    else
      normalized_text(public_send(attribute))
    end
  end

  def normalized_text(value)
    value.to_s.strip.presence
  end
end
