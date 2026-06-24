# frozen_string_literal: true

require 'test_helper'

class GroupSettlementModeTest < ActionDispatch::IntegrationTest
  setup do
    @owner = create_user(name: 'Trip organiser', email: 'organiser@example.com')
    @member = create_user(name: 'Traveller', email: 'traveller@example.com')
    @group = create_group(owner: @owner, members: [@member])
    @owner_headers = auth_headers_for(@owner)
  end

  test 'owner chooses simplified debts before anyone records a payment' do
    patch "/api/v1/groups/#{@group.id}", params: {
      group: { simplify_debts: true }
    }, headers: @owner_headers, as: :json

    assert_response :ok
    assert @group.reload.simplify_debts?
    assert_equal true, json_response.fetch('simplify_debts')
    assert_equal false, json_response.fetch('settlement_mode_locked')
  end

  test 'first real settlement permanently locks the selected method' do
    @group.update!(simplify_debts: true)
    create_expense(group: @group, paid_by: @owner, amount: '100.00', splits: { @member => '100.00' })
    member_headers = auth_headers_for(@member)

    post "/api/v1/groups/#{@group.id}/settlements", params: {
      settlement: { to_user_id: @owner.id, amount: '100.00', note: 'Paid by UPI' }
    }, headers: member_headers, as: :json
    assert_response :created

    patch "/api/v1/groups/#{@group.id}", params: {
      group: { simplify_debts: false }
    }, headers: @owner_headers, as: :json

    assert_response :unprocessable_entity
    assert @group.reload.simplify_debts?
    assert_equal(
      'Debt simplification cannot be changed after a settlement has been recorded',
      json_response.fetch('error')
    )
  end
end
