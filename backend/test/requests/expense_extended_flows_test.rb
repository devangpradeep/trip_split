# frozen_string_literal: true

require 'test_helper'

# Covers: EXP-IDX, EXP-SHOW, EXP-CREATE (missing cases), EXP-UPD, EXP-DEL, EXP-REC
# SPLIT-EQ-006/007, SPLIT-EX-004, SPLIT-PC-001/002, SPLIT-SH-003
class ExpenseExtendedFlowsTest < ActionDispatch::IntegrationTest
  setup do
    @organiser = create_user(name: 'Organiser', email: 'exp-ext-organiser@example.com')
    @friend    = create_user(name: 'Friend',    email: 'exp-ext-friend@example.com')
    @creator   = create_user(name: 'Creator',   email: 'exp-ext-creator@example.com')
    @outsider  = create_user(name: 'Outsider',  email: 'exp-ext-outsider@example.com')
    @group     = create_group(owner: @organiser, members: [@friend, @creator])
    @organiser_headers = auth_headers_for(@organiser)
    @friend_headers    = auth_headers_for(@friend)
    @creator_headers   = auth_headers_for(@creator)
  end

  # ── INDEX ────────────────────────────────────────────────────────────────────

  test 'index returns only this group expenses for a member' do
    expense = create_expense(group: @group, paid_by: @organiser, amount: '50.00',
                             splits: { @friend => '50.00' }, description: 'Lunch')
    other_group = create_group(owner: @organiser)
    other_expense = create_expense(group: other_group, paid_by: @organiser,
                                   amount: '30.00', splits: { @organiser => '30.00' })

    get "/api/v1/groups/#{@group.id}/expenses", headers: @organiser_headers, as: :json

    assert_response :ok
    ids = json_response.map { |e| e.fetch('id') }
    assert_includes ids, expense.id
    assert_not_includes ids, other_expense.id
  end

  test 'expenses are ordered by date descending then created_at descending' do
    travel_to Time.zone.parse('2026-06-20 10:00:00') do
      @older_same_day = create_expense(group: @group, paid_by: @organiser, amount: '10.00',
                                       splits: { @friend => '10.00' }, description: 'A',
                                       date: Date.new(2026, 6, 20))
    end
    travel_to Time.zone.parse('2026-06-20 11:00:00') do
      @newer_same_day = create_expense(group: @group, paid_by: @organiser, amount: '20.00',
                                       splits: { @friend => '20.00' }, description: 'B',
                                       date: Date.new(2026, 6, 20))
    end
    @earlier_date = create_expense(group: @group, paid_by: @organiser, amount: '30.00',
                                   splits: { @friend => '30.00' }, description: 'C',
                                   date: Date.new(2026, 6, 19))

    get "/api/v1/groups/#{@group.id}/expenses", headers: @organiser_headers, as: :json

    ids = json_response.map { |e| e.fetch('id') }
    assert_equal [@newer_same_day.id, @older_same_day.id, @earlier_date.id], ids
  end

  test 'expenses in an archived group can still be listed' do
    create_expense(group: @group, paid_by: @organiser, amount: '50.00',
                   splits: { @friend => '50.00' })
    @group.update!(archived_at: Time.current)

    get "/api/v1/groups/#{@group.id}/expenses", headers: @organiser_headers, as: :json

    assert_response :ok
    assert_equal 1, json_response.length
  end

  # ── SHOW ─────────────────────────────────────────────────────────────────────

  test 'member can retrieve a single expense with splits' do
    expense = create_expense(group: @group, paid_by: @organiser, amount: '90.00',
                             splits: { @organiser => '30.00', @friend => '60.00' })

    get "/api/v1/groups/#{@group.id}/expenses/#{expense.id}", headers: @organiser_headers, as: :json

    assert_response :ok
    body = json_response
    assert_equal expense.id, body.fetch('id')
    assert_equal 2, body.fetch('expense_splits').length
    assert_nil body.fetch('receipt_url')
    assert_nil body.fetch('receipt_filename')
  end

  test 'expense from another group returns 404' do
    other_group   = create_group(owner: @organiser)
    other_expense = create_expense(group: other_group, paid_by: @organiser,
                                   amount: '50.00', splits: { @organiser => '50.00' })

    get "/api/v1/groups/#{@group.id}/expenses/#{other_expense.id}",
        headers: @organiser_headers, as: :json

    assert_response :not_found
  end

  # ── CREATE — missing scenarios ───────────────────────────────────────────────

  test 'created_by is set to the acting user regardless of who the payer is' do
    post "/api/v1/groups/#{@group.id}/expenses", params: {
      expense: {
        description: 'Hotel',
        amount: '200.00',
        currency: 'INR',
        split_type: 'equal',
        date: '2026-06-20',
        paid_by_id: @friend.id,
        splits: [{ user_id: @organiser.id }, { user_id: @friend.id }]
      }
    }, headers: @organiser_headers, as: :json

    assert_response :created
    expense = Expense.find(json_response.fetch('id'))
    assert_equal @organiser.id, expense.created_by_id
    assert_equal @friend.id,    expense.paid_by_id
  end

  test 'payer defaults to the current user when paid_by_id is omitted' do
    post "/api/v1/groups/#{@group.id}/expenses", params: {
      expense: {
        description: 'Fuel',
        amount: '300.00',
        currency: 'INR',
        split_type: 'equal',
        date: '2026-06-20',
        splits: [{ user_id: @organiser.id }, { user_id: @friend.id }]
      }
    }, headers: @organiser_headers, as: :json

    assert_response :created
    expense = Expense.find(json_response.fetch('id'))
    assert_equal @organiser.id, expense.paid_by_id
  end

  test 'legacy split_type amount is silently normalized to exact' do
    assert_difference 'Expense.count', 1 do
      post "/api/v1/groups/#{@group.id}/expenses", params: {
        expense: {
          description: 'Old format',
          amount: '100.00',
          currency: 'INR',
          split_type: 'amount',
          date: '2026-06-20',
          splits: [
            { user_id: @organiser.id, amount: '50.00' },
            { user_id: @friend.id,    amount: '50.00' }
          ]
        }
      }, headers: @organiser_headers, as: :json
    end

    assert_response :created
    assert_equal 'exact', Expense.find(json_response.fetch('id')).split_type
  end

  test 'missing description returns 422' do
    assert_no_difference 'Expense.count' do
      post "/api/v1/groups/#{@group.id}/expenses", params: {
        expense: { amount: '100.00', currency: 'INR', split_type: 'equal', date: '2026-06-20',
                   splits: [{ user_id: @organiser.id }] }
      }, headers: @organiser_headers, as: :json
    end

    assert_response :unprocessable_entity
  end

  test 'zero expense amount is rejected' do
    assert_no_difference 'Expense.count' do
      post "/api/v1/groups/#{@group.id}/expenses", params: {
        expense: { description: 'Free lunch', amount: '0.00', currency: 'INR',
                   split_type: 'equal', date: '2026-06-20',
                   splits: [{ user_id: @organiser.id }] }
      }, headers: @organiser_headers, as: :json
    end

    assert_response :unprocessable_entity
  end

  test 'creating an expense in an archived group returns 422' do
    @group.update!(archived_at: Time.current)

    assert_no_difference 'Expense.count' do
      post "/api/v1/groups/#{@group.id}/expenses", params: {
        expense: { description: 'Ghost expense', amount: '50.00', currency: 'INR',
                   split_type: 'equal', date: '2026-06-20',
                   splits: [{ user_id: @organiser.id }] }
      }, headers: @organiser_headers, as: :json
    end

    assert_response :unprocessable_entity
  end

  test 'omitting the splits array splits equally among all current group members' do
    post "/api/v1/groups/#{@group.id}/expenses", params: {
      expense: {
        description: 'Group snacks',
        amount: '90.00',
        currency: 'INR',
        split_type: 'equal',
        date: '2026-06-20'
        # no splits key
      }
    }, headers: @organiser_headers, as: :json

    assert_response :created
    expense = Expense.find(json_response.fetch('id'))
    # 3 members: organiser, friend, creator
    assert_equal 3, expense.expense_splits.count
    assert_decimal '90.00', expense.expense_splits.sum(:amount)
  end

  test 'duplicate participant IDs are deduplicated and do not create extra splits' do
    assert_difference 'ExpenseSplit.count', 2 do
      post "/api/v1/groups/#{@group.id}/expenses", params: {
        expense: {
          description: 'Dinner',
          amount: '100.00',
          currency: 'INR',
          split_type: 'equal',
          date: '2026-06-20',
          splits: [
            { user_id: @organiser.id },
            { user_id: @organiser.id },  # duplicate
            { user_id: @friend.id }
          ]
        }
      }, headers: @organiser_headers, as: :json
    end

    assert_response :created
  end

  test 'negative amount in an exact split is rejected without creating any records' do
    assert_no_difference ['Expense.count', 'ExpenseSplit.count'] do
      post "/api/v1/groups/#{@group.id}/expenses", params: {
        expense: {
          description: 'Invalid',
          amount: '100.00',
          currency: 'INR',
          split_type: 'exact',
          date: '2026-06-20',
          splits: [
            { user_id: @organiser.id, amount: '150.00' },
            { user_id: @friend.id,    amount: '-50.00' }
          ]
        }
      }, headers: @organiser_headers, as: :json
    end

    assert_response :unprocessable_entity
  end

  test 'participant from a different group is rejected without creating any records' do
    assert_no_difference ['Expense.count', 'ExpenseSplit.count'] do
      post "/api/v1/groups/#{@group.id}/expenses", params: {
        expense: {
          description: 'Cross group',
          amount: '100.00',
          currency: 'INR',
          split_type: 'equal',
          date: '2026-06-20',
          splits: [{ user_id: @outsider.id }]
        }
      }, headers: @organiser_headers, as: :json
    end

    assert_response :unprocessable_entity
  end

  test '50/50 percentage split produces correct amounts' do
    assert_difference 'Expense.count', 1 do
      post "/api/v1/groups/#{@group.id}/expenses", params: {
        expense: {
          description: 'Cab fare',
          amount: '200.00',
          currency: 'INR',
          split_type: 'percentage',
          date: '2026-06-20',
          splits: [
            { user_id: @organiser.id, percentage: '50' },
            { user_id: @friend.id,    percentage: '50' }
          ]
        }
      }, headers: @organiser_headers, as: :json
    end

    assert_response :created
    expense = Expense.find(json_response.fetch('id'))
    amounts = expense.expense_splits.order(:created_at).pluck(:amount)
    assert_equal [BigDecimal('100.00'), BigDecimal('100.00')], amounts
  end

  test 'percentages not summing to 100 are rejected' do
    assert_no_difference ['Expense.count', 'ExpenseSplit.count'] do
      post "/api/v1/groups/#{@group.id}/expenses", params: {
        expense: {
          description: 'Bad pct',
          amount: '100.00',
          currency: 'INR',
          split_type: 'percentage',
          date: '2026-06-20',
          splits: [
            { user_id: @organiser.id, percentage: '60' },
            { user_id: @friend.id,    percentage: '60' }  # 120% total
          ]
        }
      }, headers: @organiser_headers, as: :json
    end

    assert_response :unprocessable_entity
  end

  # ── UPDATE ───────────────────────────────────────────────────────────────────

  test 'original creator can update an expense even if they are not the payer' do
    expense = create_expense(
      group: @group,
      paid_by: @friend,
      amount: '100.00',
      splits: { @creator => '100.00' },
      description: 'Original',
      created_by: @creator
    )
    expense.update!(created_by: @creator)

    patch "/api/v1/groups/#{@group.id}/expenses/#{expense.id}", params: {
      expense: {
        description: 'Updated by creator',
        amount: '100.00',
        currency: 'INR',
        split_type: 'exact',
        date: '2026-06-20',
        splits: [{ user_id: @creator.id, amount: '100.00' }]
      }
    }, headers: @creator_headers, as: :json

    assert_response :ok
    assert_equal 'Updated by creator', expense.reload.description
  end

  test 'an unrelated group member cannot edit an expense' do
    expense = create_expense(group: @group, paid_by: @organiser, amount: '100.00',
                             splits: { @friend => '100.00' })

    patch "/api/v1/groups/#{@group.id}/expenses/#{expense.id}", params: {
      expense: { description: 'Sneaky', amount: '100.00', currency: 'INR',
                 split_type: 'exact', date: '2026-06-20',
                 splits: [{ user_id: @friend.id, amount: '100.00' }] }
    }, headers: @friend_headers, as: :json

    assert_response :forbidden
  end

  test 'updating an expense in an archived group is rejected' do
    expense = create_expense(group: @group, paid_by: @organiser, amount: '100.00',
                             splits: { @friend => '100.00' })
    @group.update!(archived_at: Time.current)

    patch "/api/v1/groups/#{@group.id}/expenses/#{expense.id}", params: {
      expense: { description: 'Ghost edit', amount: '100.00', currency: 'INR',
                 split_type: 'exact', date: '2026-06-20',
                 splits: [{ user_id: @friend.id, amount: '100.00' }] }
    }, headers: @organiser_headers, as: :json

    assert_response :unprocessable_entity
  end

  test 'invalid replacement split rolls back all changes' do
    expense = create_expense(group: @group, paid_by: @organiser, amount: '100.00',
                             splits: { @friend => '100.00' }, description: 'Original desc')

    patch "/api/v1/groups/#{@group.id}/expenses/#{expense.id}", params: {
      expense: {
        description: 'Updated desc',
        amount: '200.00',
        currency: 'INR',
        split_type: 'exact',
        date: '2026-06-20',
        splits: [{ user_id: @friend.id, amount: '100.00' }]  # only 100 but amount is 200
      }
    }, headers: @organiser_headers, as: :json

    assert_response :unprocessable_entity
    expense.reload
    assert_equal 'Original desc', expense.description
    assert_decimal '100.00', expense.amount
  end

  # ── DELETE ───────────────────────────────────────────────────────────────────

  test 'expense creator alone cannot delete the expense if they are not the payer or owner' do
    expense = create_expense(
      group: @group,
      paid_by: @friend,
      amount: '100.00',
      splits: { @creator => '100.00' }
    )
    expense.update!(created_by: @creator)

    assert_no_difference 'Expense.count' do
      delete "/api/v1/groups/#{@group.id}/expenses/#{expense.id}",
             headers: @creator_headers, as: :json
    end

    assert_response :forbidden
  end

  test 'deleting an expense from an archived group is rejected' do
    expense = create_expense(group: @group, paid_by: @organiser, amount: '100.00',
                             splits: { @friend => '100.00' })
    @group.update!(archived_at: Time.current)

    assert_no_difference 'Expense.count' do
      delete "/api/v1/groups/#{@group.id}/expenses/#{expense.id}",
             headers: @organiser_headers, as: :json
    end

    assert_response :unprocessable_entity
  end

  test 'deleting an expense reverts balances correctly' do
    expense = create_expense(group: @group, paid_by: @organiser, amount: '100.00',
                             splits: { @friend => '100.00' })

    get "/api/v1/groups/#{@group.id}/balances", headers: @organiser_headers, as: :json
    before_balances = json_response.fetch('balances').to_h { |b| [b.dig('user', 'id'), b['balance']] }
    assert_in_delta 100.0, before_balances[@organiser.id], 0.01

    delete "/api/v1/groups/#{@group.id}/expenses/#{expense.id}",
           headers: @organiser_headers, as: :json
    assert_response :no_content

    get "/api/v1/groups/#{@group.id}/balances", headers: @organiser_headers, as: :json
    after_balances = json_response.fetch('balances')
    assert_empty after_balances
  end

  # ── REMOVE RECEIPT ───────────────────────────────────────────────────────────

  test 'removing a receipt when none is attached is idempotent' do
    expense = create_expense(group: @group, paid_by: @organiser, amount: '50.00',
                             splits: { @friend => '50.00' })

    delete "/api/v1/groups/#{@group.id}/expenses/#{expense.id}/remove_receipt",
           headers: @organiser_headers, as: :json

    assert_response :ok
    assert_nil json_response.fetch('receipt_url')
  end

  test 'removing a receipt in an archived group is rejected' do
    expense = create_expense(group: @group, paid_by: @organiser, amount: '50.00',
                             splits: { @friend => '50.00' })
    @group.update!(archived_at: Time.current)

    delete "/api/v1/groups/#{@group.id}/expenses/#{expense.id}/remove_receipt",
           headers: @organiser_headers, as: :json

    assert_response :unprocessable_entity
  end
end
