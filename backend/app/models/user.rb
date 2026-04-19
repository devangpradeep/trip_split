# frozen_string_literal: true

class User < ApplicationRecord
  # Include default devise modules. Others available are:
  # :confirmable, :lockable, :timeoutable, :trackable and :omniauthable
  devise :database_authenticatable, :registerable,
         :recoverable, :validatable,
         :jwt_authenticatable, jwt_revocation_strategy: JwtDenylist

  has_many :group_memberships, dependent: :destroy
  has_many :groups, through: :group_memberships
  has_many :group_invites_created, class_name: 'GroupInvite', foreign_key: 'created_by_id', dependent: :nullify
  has_many :expenses_paid, class_name: 'Expense', foreign_key: 'paid_by_id'
  has_many :expense_splits, dependent: :destroy
  has_many :settlements_sent, class_name: 'Settlement', foreign_key: 'from_user_id'
  has_many :settlements_received, class_name: 'Settlement', foreign_key: 'to_user_id'

  validates :name, presence: true
end
