# frozen_string_literal: true

require 'test_helper'

class ExpenseFlowsTest < ActionDispatch::IntegrationTest
  setup do
    @organiser = create_user(name: 'Trip organiser', email: 'organiser@example.com')
    @friend = create_user(name: 'Friend', email: 'friend@example.com')
    @guest = create_user(name: 'Guest cousin', email: 'guest@example.com', guest: true)
    @group = create_group(owner: @organiser, members: [@friend, @guest])
    @headers = auth_headers_for(@organiser)
  end

  test 'creates a real shared expense and distributes remainder paise exactly once' do
    assert_difference({ 'Expense.count' => 1, 'ExpenseSplit.count' => 3 }) do
      post "/api/v1/groups/#{@group.id}/expenses", params: {
        expense: {
          description: 'Dinner',
          amount: '100.00',
          currency: 'INR',
          split_type: 'equal',
          date: '2026-06-20',
          paid_by_id: @organiser.id,
          splits: [
            { user_id: @organiser.id },
            { user_id: @friend.id },
            { user_id: @guest.id }
          ]
        }
      }, headers: @headers, as: :json
    end

    assert_response :created
    amounts = Expense.find(json_response.fetch('id')).expense_splits.order(:created_at).pluck(:amount)
    assert_equal [BigDecimal('33.34'), BigDecimal('33.33'), BigDecimal('33.33')], amounts
    assert_decimal '100.00', amounts.sum

    get "/api/v1/groups/#{@group.id}/balances", headers: @headers, as: :json
    assert_response :ok
    balances = json_response.fetch('balances').to_h do |row|
      [row.dig('user', 'id'), BigDecimal(row.fetch('balance').to_s)]
    end
    assert_decimal '66.66', balances[@organiser.id]
    assert_decimal '-33.33', balances[@friend.id]
    assert_decimal '-33.33', balances[@guest.id]
  end

  test 'invalid exact split rolls back the expense and all split rows' do
    assert_no_difference ['Expense.count', 'ExpenseSplit.count'] do
      post "/api/v1/groups/#{@group.id}/expenses", params: {
        expense: {
          description: 'Hotel',
          amount: '1000.00',
          currency: 'INR',
          split_type: 'exact',
          date: '2026-06-20',
          splits: [
            { user_id: @organiser.id, amount: '500.00' },
            { user_id: @friend.id, amount: '400.00' }
          ]
        }
      }, headers: @headers, as: :json
    end

    assert_response :unprocessable_entity
    assert_includes json_response.fetch('errors'), 'Exact split amounts must add up to the expense amount'
  end

  test 'a non-member cannot be used as payer or split participant' do
    outsider = create_user(name: 'Outsider')

    assert_no_difference 'Expense.count' do
      post "/api/v1/groups/#{@group.id}/expenses", params: {
        expense: {
          description: 'Invalid payer',
          amount: '100.00',
          currency: 'INR',
          split_type: 'equal',
          date: '2026-06-20',
          paid_by_id: outsider.id,
          splits: [{ user_id: @organiser.id }]
        }
      }, headers: @headers, as: :json
    end

    assert_response :unprocessable_entity
    assert_includes json_response.fetch('errors'), 'Payer must be a member of this group'
  end
end
