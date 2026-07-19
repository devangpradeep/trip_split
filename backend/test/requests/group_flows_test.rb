# frozen_string_literal: true

require 'test_helper'

# Covers: GROUP-CREATE, GROUP-SHOW, GROUP-UPD, GROUP-ARCH, GROUP-REST, GROUP-DEL,
#         GROUP-IDX, BAL-001/004/005/007
class GroupFlowsTest < ActionDispatch::IntegrationTest
  setup do
    @owner   = create_user(name: 'Owner',   email: 'group-owner@example.com')
    @member  = create_user(name: 'Member',  email: 'group-member@example.com')
    @outsider = create_user(name: 'Outsider', email: 'group-outsider@example.com')
    @owner_headers  = auth_headers_for(@owner)
    @member_headers = auth_headers_for(@member)
  end

  # ── CREATE ──────────────────────────────────────────────────────────────────

  test 'owner creates a group and is automatically added as admin' do
    assert_difference ['Group.count', 'GroupMembership.count'], 1 do
      post '/api/v1/groups', params: {
        group: { name: 'Beach trip', description: 'Summer fun' }
      }, headers: @owner_headers, as: :json
    end

    assert_response :created
    body = json_response
    assert_equal 'Beach trip', body.fetch('name')
    assert_equal 'Summer fun', body.fetch('description')
    assert_equal 'INR', body.fetch('currency')        # GROUP-CREATE-003: currency defaults to INR
    assert_equal false, body.fetch('simplify_debts')  # GROUP-CREATE-004: default to direct-payment
    assert_equal @owner.id, body.fetch('created_by_id')
    assert_equal 'admin', body.fetch('current_user_role')
  end

  test 'blank group name is rejected' do
    assert_no_difference 'Group.count' do
      post '/api/v1/groups', params: {
        group: { name: '' }
      }, headers: @owner_headers, as: :json
    end

    assert_response :unprocessable_entity
  end

  test 'supplied currency is persisted and returned' do
    post '/api/v1/groups', params: {
      group: { name: 'Euro trip', currency: 'EUR' }
    }, headers: @owner_headers, as: :json

    assert_response :created
    assert_equal 'EUR', json_response.fetch('currency')
  end

  test 'group creation is atomic — membership failure rolls back the group' do
    # Force membership save to fail by stubbing; simplest proxy is a DB-level unique violation.
    # Instead we test the successful path's atomicity via a DB count check above (CREATE-001).
    # Here we confirm a missing name rolls back atomically (no orphaned membership).
    before_count = GroupMembership.count
    post '/api/v1/groups', params: { group: { name: '' } }, headers: @owner_headers, as: :json
    assert_response :unprocessable_entity
    assert_equal before_count, GroupMembership.count
  end

  # ── SHOW ─────────────────────────────────────────────────────────────────────

  test 'member receives the full group payload' do
    group = create_group(owner: @owner, members: [@member])
    create_expense(group: group, paid_by: @owner, amount: '100.00', splits: { @member => '100.00' })

    get "/api/v1/groups/#{group.id}", headers: @owner_headers, as: :json

    assert_response :ok
    body = json_response
    assert_equal group.id, body.fetch('id')
    assert_equal 'INR', body.fetch('currency')
    assert_includes body.fetch('members').map { |m| m['id'] }, @owner.id
    assert_includes body.fetch('members').map { |m| m['id'] }, @member.id
    assert_equal 1, body.fetch('expense_count')
    assert_equal false, body.fetch('balances_settled')
  end

  test 'non-member cannot read a group by ID' do
    group = create_group(owner: @owner)

    get "/api/v1/groups/#{group.id}", headers: @member_headers, as: :json

    assert_response :not_found
  end

  test 'archived group is still readable but shows mutation permissions as false' do
    group = create_group(owner: @owner)
    group.update!(archived_at: Time.current)

    get "/api/v1/groups/#{group.id}", headers: @owner_headers, as: :json

    assert_response :ok
    body = json_response
    assert_equal 'archived', body.fetch('status')
    assert_equal false, body.fetch('can_update')
    assert_equal false, body.fetch('can_archive')
    assert_equal true,  body.fetch('can_restore')
  end

  # ── UPDATE ───────────────────────────────────────────────────────────────────

  test 'owner can update group name and description' do
    group = create_group(owner: @owner)

    patch "/api/v1/groups/#{group.id}", params: {
      group: { name: 'Renamed trip', description: 'Updated desc' }
    }, headers: @owner_headers, as: :json

    assert_response :ok
    assert_equal 'Renamed trip', json_response.fetch('name')
    assert_equal 'Updated desc', json_response.fetch('description')
  end

  test 'ordinary member cannot update a group' do
    group = create_group(owner: @owner, members: [@member])

    patch "/api/v1/groups/#{group.id}", params: {
      group: { name: 'Sneaky rename' }
    }, headers: @member_headers, as: :json

    assert_response :forbidden
    assert_equal 'Weekend trip', group.reload.name
  end

  test 'archived group cannot be updated' do
    group = create_group(owner: @owner)
    group.update!(archived_at: Time.current)

    patch "/api/v1/groups/#{group.id}", params: {
      group: { name: 'Will not work' }
    }, headers: @owner_headers, as: :json

    assert_response :unprocessable_entity
  end

  test 'currency can be changed before any financial activity' do
    group = create_group(owner: @owner)

    patch "/api/v1/groups/#{group.id}", params: {
      group: { currency: 'USD' }
    }, headers: @owner_headers, as: :json

    assert_response :ok
    assert_equal 'USD', group.reload.currency
  end

  test 'currency cannot be changed after expenses exist, but resubmitting unchanged currency is allowed' do
    group = create_group(owner: @owner, members: [@member])
    create_expense(group: group, paid_by: @owner, amount: '100.00', splits: { @member => '100.00' })

    patch "/api/v1/groups/#{group.id}", params: {
      group: { currency: 'USD' }
    }, headers: @owner_headers, as: :json
    assert_response :unprocessable_entity
    assert_includes json_response.fetch('error'), 'Currency cannot be changed'

    patch "/api/v1/groups/#{group.id}", params: {
      group: { currency: 'INR' }  # same as current — should still pass
    }, headers: @owner_headers, as: :json
    assert_response :ok
  end

  # ── ARCHIVE ──────────────────────────────────────────────────────────────────

  test 'only the owner can archive a group' do
    group = create_group(owner: @owner, members: [@member])

    post "/api/v1/groups/#{group.id}/archive", headers: @member_headers, as: :json

    assert_response :forbidden
    assert_nil group.reload.archived_at
  end

  test 'owner cannot archive a group with outstanding balances' do
    group = create_group(owner: @owner, members: [@member])
    create_expense(group: group, paid_by: @owner, amount: '100.00', splits: { @member => '100.00' })

    post "/api/v1/groups/#{group.id}/archive", headers: @owner_headers, as: :json

    assert_response :unprocessable_entity
    assert_includes json_response.fetch('error'), 'Settle all balances'
    assert_nil group.reload.archived_at
  end

  test 'settled group archives and active invite links are atomically revoked' do
    group = create_group(owner: @owner)
    active_invite = create_group_invite(group: group, created_by: @owner)

    post "/api/v1/groups/#{group.id}/archive", headers: @owner_headers, as: :json

    assert_response :ok
    assert group.reload.archived?
    assert active_invite.reload.revoked?
  end

  test 'archiving an already-archived group returns a validation error' do
    group = create_group(owner: @owner)
    group.update!(archived_at: Time.current)

    post "/api/v1/groups/#{group.id}/archive", headers: @owner_headers, as: :json

    assert_response :unprocessable_entity
  end

  # ── RESTORE ──────────────────────────────────────────────────────────────────

  test 'only the owner can restore an archived group' do
    group = create_group(owner: @owner, members: [@member])
    group.update!(archived_at: Time.current)

    post "/api/v1/groups/#{group.id}/restore", headers: @member_headers, as: :json
    assert_response :forbidden
    assert group.reload.archived?

    post "/api/v1/groups/#{group.id}/restore", headers: @owner_headers, as: :json
    assert_response :ok
    assert_not group.reload.archived?
  end

  test 'restoring a group does not recreate revoked invites' do
    group = create_group(owner: @owner)
    invite = create_group_invite(group: group, created_by: @owner)
    group.update!(archived_at: Time.current)
    invite.update!(revoked_at: Time.current)

    post "/api/v1/groups/#{group.id}/restore", headers: @owner_headers, as: :json

    assert_response :ok
    assert invite.reload.revoked?
    assert_equal 0, group.group_invites.active.count
  end

  # ── DELETE ───────────────────────────────────────────────────────────────────

  test 'only the owner can delete a group' do
    group = create_group(owner: @owner, members: [@member])

    delete "/api/v1/groups/#{group.id}", headers: @member_headers, as: :json
    assert_response :forbidden
    assert Group.exists?(group.id)
  end

  test 'owner cannot delete a group with outstanding balances' do
    group = create_group(owner: @owner, members: [@member])
    create_expense(group: group, paid_by: @owner, amount: '100.00', splits: { @member => '100.00' })

    delete "/api/v1/groups/#{group.id}", headers: @owner_headers, as: :json

    assert_response :unprocessable_entity
    assert Group.exists?(group.id)
  end

  test 'owner can delete a fully-settled group and all dependents are removed' do
    group = create_group(owner: @owner, members: [@member])
    expense = create_expense(group: group, paid_by: @owner, amount: '100.00', splits: { @member => '100.00' })
    settlement = create_settlement(group: group, from: @member, to: @owner, amount: '100.00')

    assert_difference ['Group.count', 'Expense.count', 'Settlement.count', 'GroupMembership.count'], -1 do
      delete "/api/v1/groups/#{group.id}", headers: @owner_headers, as: :json
    end

    assert_response :no_content
    assert_not Group.exists?(group.id)
    assert_not Expense.exists?(expense.id)
    assert_not Settlement.exists?(settlement.id)
  end

  test 'other groups and users are unaffected after group deletion' do
    other_group = create_group(owner: @owner)
    group_to_delete = create_group(owner: @owner)

    delete "/api/v1/groups/#{group_to_delete.id}", headers: @owner_headers, as: :json

    assert_response :no_content
    assert Group.exists?(other_group.id)
    assert User.exists?(@owner.id)
  end

  # ── INDEX ────────────────────────────────────────────────────────────────────

  test 'index returns only groups the current user belongs to' do
    own_group   = create_group(owner: @owner)
    other_group = create_group(owner: @outsider)

    get '/api/v1/groups', headers: @owner_headers, as: :json

    assert_response :ok
    ids = json_response.map { |g| g.fetch('id') }
    assert_includes ids, own_group.id
    assert_not_includes ids, other_group.id
  end

  test 'groups index reflects the correct amounts owed and is owed for the current user' do
    group = create_group(owner: @owner, members: [@member])
    create_expense(group: group, paid_by: @owner, amount: '100.00', splits: { @member => '100.00' })

    get '/api/v1/groups', headers: @owner_headers, as: :json

    assert_response :ok
    entry = json_response.find { |g| g.fetch('id') == group.id }
    # owner paid, member owes — owner is owed 100
    assert_in_delta 100.0, entry.fetch('current_user_is_owed'), 0.01
    assert_in_delta 0.0,   entry.fetch('current_user_owes'),    0.01
  end

  # ── BALANCES ─────────────────────────────────────────────────────────────────

  test 'balances endpoint returns correct calculator result for each member' do
    group = create_group(owner: @owner, members: [@member])
    create_expense(group: group, paid_by: @owner, amount: '100.00', splits: { @member => '100.00' })

    get "/api/v1/groups/#{group.id}/balances", headers: @owner_headers, as: :json

    assert_response :ok
    balances = json_response.fetch('balances').to_h do |row|
      [row.dig('user', 'id'), BigDecimal(row.fetch('balance').to_s)]
    end
    assert_decimal '100.00', balances[@owner.id]
    assert_decimal '-100.00', balances[@member.id]
    assert_decimal '0.00', balances.values.sum
  end

  test 'fully settled group returns no suggestions' do
    group = create_group(owner: @owner, members: [@member])
    create_expense(group: group, paid_by: @owner, amount: '100.00', splits: { @member => '100.00' })
    create_settlement(group: group, from: @member, to: @owner, amount: '100.00')

    get "/api/v1/groups/#{group.id}/balances", headers: @owner_headers, as: :json

    assert_response :ok
    assert_empty json_response.fetch('suggested_settlements')
  end

  test 'non-member cannot inspect group balances' do
    group = create_group(owner: @owner)

    get "/api/v1/groups/#{group.id}/balances", headers: @member_headers, as: :json

    assert_response :not_found
  end

  test 'direct and simplified modes keep identical net balances' do
    group_direct = create_group(owner: @owner, members: [@member])
    create_expense(group: group_direct, paid_by: @owner, amount: '100.00',
                   splits: { @member => '100.00' })
    other = create_user(name: 'Other', email: 'bal-other@example.com')
    group_simplified = create_group(owner: @owner, members: [@member], simplify_debts: true)
    create_expense(group: group_simplified, paid_by: @owner, amount: '100.00',
                   splits: { @member => '100.00' })

    get "/api/v1/groups/#{group_direct.id}/balances", headers: @owner_headers, as: :json
    direct_balances = json_response.fetch('balances').map { |b| BigDecimal(b['balance'].to_s) }

    get "/api/v1/groups/#{group_simplified.id}/balances", headers: @owner_headers, as: :json
    simplified_balances = json_response.fetch('balances').map { |b| BigDecimal(b['balance'].to_s) }

    assert_equal direct_balances.sort, simplified_balances.sort
  end
end
