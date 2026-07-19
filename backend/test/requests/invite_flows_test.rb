# frozen_string_literal: true

require 'test_helper'

# Covers: INV-IDX, INV-CREATE, INV-DEL, INV-SHOW, INV-ACCEPT
class InviteFlowsTest < ActionDispatch::IntegrationTest
  setup do
    @admin  = create_user(name: 'Admin',  email: 'inv-admin@example.com')
    @member = create_user(name: 'Member', email: 'inv-member@example.com')
    @joiner = create_user(name: 'Joiner', email: 'inv-joiner@example.com')
    @group  = create_group(owner: @admin, members: [@member])
    @admin_headers  = auth_headers_for(@admin)
    @member_headers = auth_headers_for(@member)
    @joiner_headers = auth_headers_for(@joiner)
  end

  # ── LIST INVITES ──────────────────────────────────────────────────────────────

  test 'only a group admin can list invite links' do
    get "/api/v1/groups/#{@group.id}/invites", headers: @member_headers, as: :json

    assert_response :forbidden
  end

  test 'admin sees active invites newest first and the latest expired invite separately' do
    expired = travel_to(2.days.ago) { create_group_invite(group: @group, created_by: @admin) }
    active  = create_group_invite(group: @group, created_by: @admin, no_expiry: true)

    get "/api/v1/groups/#{@group.id}/invites", headers: @admin_headers, as: :json

    assert_response :ok
    body = json_response
    active_ids = body.fetch('invites').map { |i| i['id'] }
    assert_includes active_ids, active.id
    assert_not_includes active_ids, expired.id
    assert_equal expired.id, body.dig('latest_expired_invite', 'id')
  end

  # ── CREATE INVITE ─────────────────────────────────────────────────────────────

  test 'non-admin member cannot create an invite' do
    assert_no_difference 'GroupInvite.count' do
      post "/api/v1/groups/#{@group.id}/invites", headers: @member_headers, as: :json
    end

    assert_response :forbidden
  end

  test 'creating an invite in an archived group is rejected' do
    @group.update!(archived_at: Time.current)

    assert_no_difference 'GroupInvite.count' do
      post "/api/v1/groups/#{@group.id}/invites", headers: @admin_headers, as: :json
    end

    assert_response :unprocessable_entity
  end

  test 'default invite expires in 48 hours' do
    travel_to Time.zone.parse('2026-06-20 10:00:00') do
      post "/api/v1/groups/#{@group.id}/invites", headers: @admin_headers, as: :json
    end

    assert_response :created
    invite = GroupInvite.find(json_response.dig('invite', 'id'))
    assert_equal Time.zone.parse('2026-06-22 10:00:00').to_i, invite.expires_at.to_i
  end

  test 'expiry outside 1-168 hours is rejected' do
    assert_no_difference 'GroupInvite.count' do
      post "/api/v1/groups/#{@group.id}/invites",
           params: { invite: { expires_in_hours: 200 } },
           headers: @admin_headers, as: :json
    end

    assert_response :unprocessable_entity

    assert_no_difference 'GroupInvite.count' do
      post "/api/v1/groups/#{@group.id}/invites",
           params: { invite: { expires_in_hours: 0 } },
           headers: @admin_headers, as: :json
    end

    assert_response :unprocessable_entity
  end

  test 'no_expiry flag creates an invite with nil expiration' do
    post "/api/v1/groups/#{@group.id}/invites",
         params: { invite: { no_expiry: true } },
         headers: @admin_headers, as: :json

    assert_response :created
    invite = GroupInvite.find(json_response.dig('invite', 'id'))
    assert_nil invite.expires_at
  end

  test 'creating a new invite revokes all previous active invites for the group' do
    first_invite = create_group_invite(group: @group, created_by: @admin, no_expiry: true)

    post "/api/v1/groups/#{@group.id}/invites",
         params: { invite: { no_expiry: true } },
         headers: @admin_headers, as: :json

    assert_response :created
    assert first_invite.reload.revoked?
    assert_equal 1, @group.group_invites.active.count
  end

  # ── DELETE (REVOKE) INVITE ────────────────────────────────────────────────────

  test 'admin can revoke an invite and the operation is idempotent' do
    invite = create_group_invite(group: @group, created_by: @admin, no_expiry: true)

    delete "/api/v1/groups/#{@group.id}/invites/#{invite.id}",
           headers: @admin_headers, as: :json
    assert_response :ok
    assert invite.reload.revoked?

    # Idempotent second revocation
    delete "/api/v1/groups/#{@group.id}/invites/#{invite.id}",
           headers: @admin_headers, as: :json
    assert_response :ok
  end

  test 'non-admin cannot revoke an invite' do
    invite = create_group_invite(group: @group, created_by: @admin, no_expiry: true)

    delete "/api/v1/groups/#{@group.id}/invites/#{invite.id}",
           headers: @member_headers, as: :json

    assert_response :forbidden
    assert_not invite.reload.revoked?
  end

  # ── PUBLIC SHOW ───────────────────────────────────────────────────────────────

  test 'valid active token returns public invite summary without authentication' do
    invite = create_group_invite(group: @group, created_by: @admin, no_expiry: true)

    get "/api/v1/invites/#{invite.token}", as: :json

    assert_response :ok
    assert_equal invite.id, json_response.dig('invite', 'id')
    assert_equal @group.id, json_response.dig('invite', 'group', 'id')
  end

  test 'unknown token returns 404' do
    get '/api/v1/invites/totally-fake-token-xyz', as: :json

    assert_response :not_found
  end

  test 'revoked token returns 410' do
    invite = create_group_invite(group: @group, created_by: @admin, revoked: true)

    get "/api/v1/invites/#{invite.token}", as: :json

    assert_response :gone
  end

  test 'expired token returns 410' do
    invite = travel_to(3.days.ago) do
      create_group_invite(group: @group, created_by: @admin, expires_in_hours: 1)
    end

    get "/api/v1/invites/#{invite.token}", as: :json

    assert_response :gone
  end

  test 'invite from an archived group returns 410' do
    invite = create_group_invite(group: @group, created_by: @admin, no_expiry: true)
    @group.update!(archived_at: Time.current)

    get "/api/v1/invites/#{invite.token}", as: :json

    assert_response :gone
  end

  test 'public invite response does not expose member emails or private data' do
    invite = create_group_invite(group: @group, created_by: @admin, no_expiry: true)

    get "/api/v1/invites/#{invite.token}", as: :json

    body_string = response.body
    assert_not_includes body_string, @admin.email
    assert_not_includes body_string, @member.email
  end

  # ── ACCEPT INVITE ─────────────────────────────────────────────────────────────

  test 'accepting an invite requires authentication' do
    invite = create_group_invite(group: @group, created_by: @admin, no_expiry: true)

    post "/api/v1/invites/#{invite.token}/accept", as: :json

    assert_response :unauthorized
  end

  test 'valid token creates a member-role membership and returns 201' do
    invite = create_group_invite(group: @group, created_by: @admin, no_expiry: true)

    assert_difference 'GroupMembership.count', 1 do
      post "/api/v1/invites/#{invite.token}/accept",
           headers: @joiner_headers, as: :json
    end

    assert_response :created
    assert @group.members.include?(@joiner)
    membership = @group.group_memberships.find_by!(user: @joiner)
    assert_equal 'member', membership.role
  end

  test 'existing member accepting an invite gets 200 with no duplicate membership' do
    invite = create_group_invite(group: @group, created_by: @admin, no_expiry: true)

    assert_no_difference 'GroupMembership.count' do
      post "/api/v1/invites/#{invite.token}/accept",
           headers: @member_headers, as: :json
    end

    assert_response :ok
    assert_includes json_response.fetch('message'), 'already a member'
  end

  test 'revoked invite cannot be accepted' do
    invite = create_group_invite(group: @group, created_by: @admin, revoked: true)

    assert_no_difference 'GroupMembership.count' do
      post "/api/v1/invites/#{invite.token}/accept",
           headers: @joiner_headers, as: :json
    end

    assert_response :gone
  end
end
