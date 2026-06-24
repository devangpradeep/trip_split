# frozen_string_literal: true

module TestDataHelpers
  DEFAULT_PASSWORD = 'Password123!'

  def create_user(name:, email: nil, guest: false, password: DEFAULT_PASSWORD)
    email ||= "#{name.parameterize}-#{SecureRandom.hex(4)}@example.com"
    attributes = { name: name, email: email, is_guest: guest }
    attributes.merge!(password: password, password_confirmation: password) unless guest
    User.create!(attributes)
  end

  def create_group(owner:, name: 'Weekend trip', members: [], simplify_debts: false)
    Group.transaction do
      group = Group.create!(
        name: name,
        currency: 'INR',
        created_by: owner,
        simplify_debts: simplify_debts
      )
      group.group_memberships.create!(user: owner, role: 'admin')
      members.each { |member| group.group_memberships.create!(user: member, role: 'member') }
      group
    end
  end

  def create_expense(group:, paid_by:, amount:, splits:, **attributes)
    expense_attributes = {
      description: 'Trip expense',
      currency: group.currency,
      split_type: 'exact',
      date: Date.new(2026, 6, 20),
      created_by: paid_by
    }.merge(attributes)

    Expense.transaction do
      expense = group.expenses.create!(
        **expense_attributes,
        amount: amount,
        paid_by: paid_by
      )
      splits.each do |user, split_amount|
        expense.expense_splits.create!(user: user, amount: split_amount)
      end
      expense
    end
  end

  def create_settlement(group:, from:, to:, amount:, **attributes)
    settlement_attributes = { date: Date.new(2026, 6, 22) }.merge(attributes)
    group.settlements.create!(**settlement_attributes, from_user: from, to_user: to, amount: amount)
  end

  def assert_decimal(expected, actual)
    assert_equal BigDecimal(expected.to_s), actual.to_d
  end

  def assert_settlements(expected, actual)
    normalized_actual = actual.map do |settlement|
      [settlement.fetch(:from_user_id), settlement.fetch(:to_user_id), settlement.fetch(:amount).to_d]
    end
    normalized_expected = expected.map do |from, to, amount|
      [from.id, to.id, BigDecimal(amount.to_s)]
    end

    assert_equal normalized_expected, normalized_actual
  end
end
