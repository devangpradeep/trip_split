# frozen_string_literal: true

require 'test_helper'

# Covers: SET-IDX, SET-SHOW, SET-DEL, and missing SET-CREATE cases
# (partial-coverage gaps from guest_settlement_flow_test.rb)
class SettlementFlowsTest < ActionDispatch::IntegrationTest
  setup do
    @owner  = create_user(name: 'Owner',  email: 'set-owner@example.com')
    @payer  = create_user(name: 'Payer',  email: 'set-payer@example.com')
    @other  = create_user(name: 'Other',  email: 'set-other@example.com')
    @guest  = create_user(name: 'Guest',  email: 'set-guest@example.com', guest: true)
    @group  = create_group(owner: @owner, members: [@payer, @other, @guest])
    create_expense(group: @group, paid_by: @owner, amount: '300.00',
                   splits: { @payer => '100.00', @other => '100.00', @guest => '100.00' })
    @owner_headers = auth_headers_for(@owner)
    @payer_headers = auth_headers_for(@payer)
    @other_headers = auth_headers_for(@other)
  end

  # ── INDEX ────────────────────────────────────────────────────────────────────

  test 'index returns only this group settlements with sender and recipient data' do
    settlement = create_settlement(group: @group, from: @payer, to: @owner, amount: '100.00')

    other_group = create_group(owner: @owner)
    other_settlement = create_settlement(group: other_group, from: @owner, to: @owner,
                                         amount: '10.00')

    get "/api/v1/groups/#{@group.id}/settlements", headers: @owner_headers, as: :json

    assert_response :ok
    ids = json_response.map { |s| s.fetch('id') }
    assert_includes ids, settlement.id
    assert_not_includes ids, other_settlement.id

    entry = json_response.find { |s| s['id'] == settlement.id }
    assert_equal @payer.id, entry.dig('from_user', 'id')
    assert_equal @owner.id, entry.dig('to_user',   'id')
  end

  test 'settlements are ordered by date descending then created_at descending' do
    travel_to Time.zone.parse('2026-06-22 09:00:00') do
      @older_same_day = create_settlement(group: @group, from: @payer, to: @owner, amount: '20.00',
                                          date: Date.new(2026, 6, 22))
    end
    travel_to Time.zone.parse('2026-06-22 11:00:00') do
      @newer_same_day = create_settlement(group: @group, from: @other, to: @owner, amount: '20.00',
                                          date: Date.new(2026, 6, 22))
    end
    @earlier_date = create_settlement(group: @group, from: @payer, to: @owner, amount: '60.00',
                                      date: Date.new(2026, 6, 20))

    get "/api/v1/groups/#{@group.id}/settlements", headers: @owner_headers, as: :json

    ids = json_response.map { |s| s.fetch('id') }
    assert_equal [@newer_same_day.id, @older_same_day.id, @earlier_date.id], ids
  end

  test 'settlements in an archived group remain readable' do
    create_settlement(group: @group, from: @payer, to: @owner, amount: '100.00')
    create_settlement(group: @group, from: @other, to: @owner, amount: '100.00')
    create_settlement(group: @group, from: @guest, to: @owner, amount: '100.00')
    @group.update!(archived_at: Time.current)

    get "/api/v1/groups/#{@group.id}/settlements", headers: @owner_headers, as: :json

    assert_response :ok
    assert_equal 3, json_response.length
  end

  # ── SHOW ─────────────────────────────────────────────────────────────────────

  test 'member can retrieve a single in-group settlement' do
    settlement = create_settlement(group: @group, from: @payer, to: @owner, amount: '50.00')

    get "/api/v1/groups/#{@group.id}/settlements/#{settlement.id}",
        headers: @payer_headers, as: :json

    assert_response :ok
    assert_equal settlement.id, json_response.fetch('id')
    assert_equal @payer.id, json_response.dig('from_user', 'id')
  end

  test 'cross-group settlement ID returns 404' do
    other_group = create_group(owner: @owner)
    other_settlement = create_settlement(group: other_group, from: @owner, to: @owner,
                                         amount: '10.00')

    get "/api/v1/groups/#{@group.id}/settlements/#{other_settlement.id}",
        headers: @owner_headers, as: :json

    assert_response :not_found
  end

  # ── CREATE — additional scenarios ────────────────────────────────────────────

  test 'settling for the exact suggested amount is accepted' do
    assert_difference '@group.settlements.count', 1 do
      post "/api/v1/groups/#{@group.id}/settlements", params: {
        settlement: { to_user_id: @owner.id, amount: '100.00' }
      }, headers: @payer_headers, as: :json
    end

    assert_response :created
    assert_decimal '100.00', @group.settlements.last.amount
  end

  test 'settling to someone who is not a suggested creditor is rejected' do
    # @payer owes @owner, not @other — so paying @other should fail
    assert_no_difference '@group.settlements.count' do
      post "/api/v1/groups/#{@group.id}/settlements", params: {
        settlement: { to_user_id: @other.id, amount: '50.00' }
      }, headers: @payer_headers, as: :json
    end

    assert_response :unprocessable_entity
  end

  test 'admin cannot use from_user_id to proxy-settle for a registered non-guest user' do
    assert_no_difference '@group.settlements.count' do
      post "/api/v1/groups/#{@group.id}/settlements", params: {
        settlement: { from_user_id: @payer.id, to_user_id: @owner.id, amount: '50.00' }
      }, headers: @owner_headers, as: :json
    end

    assert_response :unprocessable_entity
    assert_includes json_response.fetch('errors'), 'Can only settle on behalf of guest members'
  end

  test 'creating a settlement in an archived group is rejected' do
    @group.update!(archived_at: Time.current)

    assert_no_difference '@group.settlements.count' do
      post "/api/v1/groups/#{@group.id}/settlements", params: {
        settlement: { to_user_id: @owner.id, amount: '50.00' }
      }, headers: @payer_headers, as: :json
    end

    assert_response :unprocessable_entity
  end

  # ── DELETE ───────────────────────────────────────────────────────────────────

  test 'an ordinary member who is not the sender cannot delete a settlement' do
    settlement = create_settlement(group: @group, from: @payer, to: @owner, amount: '100.00')

    assert_no_difference '@group.settlements.count' do
      delete "/api/v1/groups/#{@group.id}/settlements/#{settlement.id}",
             headers: @other_headers, as: :json
    end

    assert_response :forbidden
  end

  test 'the sender can delete their own settlement' do
    settlement = create_settlement(group: @group, from: @payer, to: @owner, amount: '100.00')

    assert_difference '@group.settlements.count', -1 do
      delete "/api/v1/groups/#{@group.id}/settlements/#{settlement.id}",
             headers: @payer_headers, as: :json
    end

    assert_response :no_content
  end

  test 'admin can delete a settlement that originated from a guest' do
    guest_settlement = create_settlement(group: @group, from: @guest, to: @owner, amount: '100.00')

    assert_difference '@group.settlements.count', -1 do
      delete "/api/v1/groups/#{@group.id}/settlements/#{guest_settlement.id}",
             headers: @owner_headers, as: :json
    end

    assert_response :no_content
  end

  test 'deleting a settlement from an archived group is rejected' do
    settlement = create_settlement(group: @group, from: @payer, to: @owner, amount: '100.00')
    @group.update!(archived_at: Time.current)

    assert_no_difference '@group.settlements.count' do
      delete "/api/v1/groups/#{@group.id}/settlements/#{settlement.id}",
             headers: @payer_headers, as: :json
    end

    assert_response :unprocessable_entity
  end

  test 'deleting a settlement restores balances correctly' do
    settlement = create_settlement(group: @group, from: @payer, to: @owner, amount: '100.00')

    get "/api/v1/groups/#{@group.id}/balances", headers: @owner_headers, as: :json
    owner_after_payment = BigDecimal(
      json_response.fetch('balances').find { |b| b.dig('user', 'id') == @owner.id }.fetch('balance').to_s
    )

    delete "/api/v1/groups/#{@group.id}/settlements/#{settlement.id}",
           headers: @owner_headers, as: :json
    assert_response :no_content

    get "/api/v1/groups/#{@group.id}/balances", headers: @owner_headers, as: :json
    owner_after_delete = BigDecimal(
      json_response.fetch('balances').find { |b| b.dig('user', 'id') == @owner.id }.fetch('balance').to_s
    )

    # reverting a 100.00 payment means owner is owed 100 more again
    assert_decimal '100.00', (owner_after_delete - owner_after_payment)
  end
end
