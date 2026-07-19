# frozen_string_literal: true

require 'test_helper'

class GuestSettlementFlowTest < ActionDispatch::IntegrationTest
  setup do
    @owner = create_user(name: 'Owner', email: 'owner@example.com')
    @member = create_user(name: 'Member', email: 'member@example.com')
    @guest = create_user(name: 'Guest cousin', email: 'cousin@example.com', guest: true)
    @group = create_group(owner: @owner, members: [@member, @guest])
    create_expense(group: @group, paid_by: @owner, amount: '100.00', splits: { @guest => '100.00' })
    @owner_headers = auth_headers_for(@owner)
  end

  test 'owner records a partial guest payment and only the remaining amount is suggested' do
    assert_difference '@group.settlements.count', 1 do
      post "/api/v1/groups/#{@group.id}/settlements", params: {
        settlement: {
          from_user_id: @guest.id,
          to_user_id: @owner.id,
          amount: '40.00',
          date: '2026-06-22',
          note: 'Cash received'
        }
      }, headers: @owner_headers, as: :json
    end

    assert_response :created
    settlement = @group.settlements.order(:created_at).last
    assert_equal @guest.id, settlement.from_user_id
    assert_equal @owner.id, settlement.to_user_id
    assert_decimal '40.00', settlement.amount

    get "/api/v1/groups/#{@group.id}/balances", headers: @owner_headers, as: :json
    assert_response :ok
    guest_suggestions = json_response.fetch('guest_settlement_suggestions')
    assert_equal 1, guest_suggestions.length
    assert_equal @guest.id, guest_suggestions.first.dig('from', 'id')
    assert_equal @owner.id, guest_suggestions.first.dig('to', 'id')
    assert_decimal '60.00', guest_suggestions.first.fetch('amount')
  end

  test 'sequential overpayment is rejected without changing the ledger' do
    post "/api/v1/groups/#{@group.id}/settlements", params: {
      settlement: { from_user_id: @guest.id, to_user_id: @owner.id, amount: '40.00' }
    }, headers: @owner_headers, as: :json
    assert_response :created

    assert_no_difference '@group.settlements.count' do
      post "/api/v1/groups/#{@group.id}/settlements", params: {
        settlement: { from_user_id: @guest.id, to_user_id: @owner.id, amount: '60.01' }
      }, headers: @owner_headers, as: :json
    end

    assert_response :unprocessable_entity
    assert_includes json_response.fetch('errors').first, 'Amount exceeds payable limit of 60.00'
  end

  test 'ordinary member cannot settle on behalf of a guest' do
    member_headers = auth_headers_for(@member)

    assert_no_difference '@group.settlements.count' do
      post "/api/v1/groups/#{@group.id}/settlements", params: {
        settlement: { from_user_id: @guest.id, to_user_id: @owner.id, amount: '40.00' }
      }, headers: member_headers, as: :json
    end

    assert_response :unprocessable_entity
    assert_includes json_response.fetch('errors'), 'Only admins can settle on behalf of others'
  end

  # ('settling for the exact suggested amount is accepted')

  test 'attempting to record a settlement to someone with no open suggestion is rejected' do
    # Guest owes Owner, so Owner should NOT be able to record Guest → Member (no such suggestion)
    assert_no_difference '@group.settlements.count' do
      post "/api/v1/groups/#{@group.id}/settlements", params: {
        settlement: { from_user_id: @guest.id, to_user_id: @member.id, amount: '50.00' }
      }, headers: @owner_headers, as: :json
    end

    assert_response :unprocessable_entity
  end

  # ('admin cannot use from_user_id to proxy-settle for a registered non-guest user')
end
