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

  test 're-submitting the unchanged settlement mode after it is locked is accepted' do
    @group.update!(simplify_debts: true)
    create_expense(group: @group, paid_by: @owner, amount: '100.00', splits: { @member => '100.00' })
    auth_headers_for(@member).tap do |h|
      post "/api/v1/groups/#{@group.id}/settlements",
           params: { settlement: { to_user_id: @owner.id, amount: '100.00' } },
           headers: h, as: :json
    end
    assert_response :created

    # Resubmit the same mode — must not be rejected
    patch "/api/v1/groups/#{@group.id}", params: {
      group: { simplify_debts: true }
    }, headers: @owner_headers, as: :json

    assert_response :ok
    assert @group.reload.simplify_debts?
  end



  test 'currency cannot be changed after expenses exist but resubmitting the unchanged value passes' do
    create_expense(group: @group, paid_by: @owner, amount: '100.00', splits: { @member => '100.00' })

    patch "/api/v1/groups/#{@group.id}", params: {
      group: { currency: 'USD' }
    }, headers: @owner_headers, as: :json
    assert_response :unprocessable_entity

    patch "/api/v1/groups/#{@group.id}", params: {
      group: { currency: 'INR' }
    }, headers: @owner_headers, as: :json
    assert_response :ok
  end

  test 'recording a guest proxy settlement permanently locks the settlement mode' do
    @group.update!(simplify_debts: true)

    assert_no_difference '@group.reload.simplify_debts?' do
      post "/api/v1/groups/#{@group.id}/settlements", params: {
        settlement: { from_user_id: @guest.id, to_user_id: @owner.id, amount: '100.00' }
      }, headers: @owner_headers, as: :json
    end
    assert_response :created

    # Mode is now locked — trying to change it must be rejected
    patch "/api/v1/groups/#{@group.id}", params: {
      group: { simplify_debts: false }
    }, headers: @owner_headers, as: :json

    assert_response :unprocessable_entity
    assert @group.reload.simplify_debts?
  end

  test 'switching mode before any settlement changes routing but preserves member net balances' do
    create_expense(group: @group, paid_by: @owner, amount: '900.00',
                   splits: { @owner => '300.00', @member => '600.00' })
    third = create_user(name: 'Third', email: 'gsmthird@example.com')
    @group.group_memberships.create!(user: third, role: 'member')
    create_expense(group: @group, paid_by: @member, amount: '300.00',
                   splits: { @owner => '150.00', third => '150.00' })

    get "/api/v1/groups/#{@group.id}/balances", headers: @owner_headers, as: :json
    direct_balances = json_response.fetch('balances').to_h do |b|
      [b.dig('user', 'id'), BigDecimal(b['balance'].to_s)]
    end
    direct_suggestion_count = json_response.fetch('suggested_settlements').length

    # Switch to simplified mode
    patch "/api/v1/groups/#{@group.id}", params: {
      group: { simplify_debts: true }
    }, headers: @owner_headers, as: :json
    assert_response :ok

    get "/api/v1/groups/#{@group.id}/balances", headers: @owner_headers, as: :json
    simplified_balances = json_response.fetch('balances').to_h do |b|
      [b.dig('user', 'id'), BigDecimal(b['balance'].to_s)]
    end
    simplified_suggestion_count = json_response.fetch('suggested_settlements').length

    # Net balances must be identical; suggestion count typically decreases with simplification
    assert_equal direct_balances, simplified_balances
    assert simplified_suggestion_count <= direct_suggestion_count
  end
end
