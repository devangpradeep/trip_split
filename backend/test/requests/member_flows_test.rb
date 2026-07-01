# frozen_string_literal: true

require 'test_helper'

# Covers: MEM-SUG, MEM-CREATE, MEM-DEL
class MemberFlowsTest < ActionDispatch::IntegrationTest
  setup do
    @owner   = create_user(name: 'Owner',   email: 'mem-owner@example.com')
    @member  = create_user(name: 'Member',  email: 'mem-member@example.com')
    @group   = create_group(owner: @owner, members: [@member])
    @friend_in_another_group = create_user(name: 'Shared friend', email: 'mem-shared@example.com')
    @shared_group = create_group(owner: @owner, members: [@friend_in_another_group])
    @owner_headers  = auth_headers_for(@owner)
    @member_headers = auth_headers_for(@member)
  end

  # ── SUGGESTIONS ──────────────────────────────────────────────────────────────

  test 'only the group owner can request member suggestions' do
    get "/api/v1/groups/#{@group.id}/members/suggestions",
        headers: @member_headers, as: :json

    assert_response :forbidden
  end

  test 'suggestions come from shared groups and exclude current and existing members' do
    get "/api/v1/groups/#{@group.id}/members/suggestions",
        headers: @owner_headers, as: :json

    assert_response :ok
    friend_ids = json_response.fetch('friends').map { |f| f['id'] }
    assert_includes friend_ids, @friend_in_another_group.id
    assert_not_includes friend_ids, @owner.id   # current user excluded
    assert_not_includes friend_ids, @member.id  # existing member excluded
  end

  test 'suggestions query is case-insensitive' do
    get "/api/v1/groups/#{@group.id}/members/suggestions",
        params: { q: 'SHARED' }, headers: @owner_headers, as: :json

    assert_response :ok
    assert_includes json_response.fetch('friends').map { |f| f['id'] },
                    @friend_in_another_group.id
  end

  test 'suggestion limit is capped at 20' do
    25.times do |i|
      u = create_user(name: "Extra #{i}", email: "mem-extra#{i}@example.com")
      @shared_group.group_memberships.create!(user: u, role: 'member')
    end

    get "/api/v1/groups/#{@group.id}/members/suggestions",
        params: { limit: 100 }, headers: @owner_headers, as: :json

    assert_response :ok
    assert json_response.fetch('friends').length <= 20
  end

  test 'suggestions are rejected for an archived group' do
    @group.update!(archived_at: Time.current)

    get "/api/v1/groups/#{@group.id}/members/suggestions",
        headers: @owner_headers, as: :json

    assert_response :unprocessable_entity
  end

  # ── ADD MEMBER ───────────────────────────────────────────────────────────────

  test 'ordinary member cannot add a new member' do
    new_user = create_user(name: 'New', email: 'mem-new@example.com')

    assert_no_difference 'GroupMembership.count' do
      post "/api/v1/groups/#{@group.id}/members",
           params: { member: { email: new_user.email } },
           headers: @member_headers, as: :json
    end

    assert_response :forbidden
  end

  test 'owner adds an existing registered user by email' do
    new_user = create_user(name: 'New Traveller', email: 'mem-new-traveller@example.com')

    assert_difference 'GroupMembership.count', 1 do
      post "/api/v1/groups/#{@group.id}/members",
           params: { member: { email: '  MEM-NEW-TRAVELLER@EXAMPLE.COM  ' } },
           headers: @owner_headers, as: :json
    end

    assert_response :created
    assert_equal false, json_response.dig('member', 'is_guest')
    assert @group.members.include?(new_user)
  end

  test 'unknown email with a display name creates a guest member' do
    assert_difference ['User.count', 'GroupMembership.count'], 1 do
      post "/api/v1/groups/#{@group.id}/members",
           params: { member: { email: 'cousin@family.example.com', name: 'Cousin' } },
           headers: @owner_headers, as: :json
    end

    assert_response :created
    assert_equal true, json_response.dig('member', 'is_guest')
    assert_equal 'Cousin', json_response.dig('member', 'name')
  end

  test 'unknown email without display name is rejected' do
    assert_no_difference ['User.count', 'GroupMembership.count'] do
      post "/api/v1/groups/#{@group.id}/members",
           params: { member: { email: 'nobody@new.example.com' } },
           headers: @owner_headers, as: :json
    end

    assert_response :unprocessable_entity
  end

  test 'invalid email is rejected without creating an orphan user' do
    assert_no_difference ['User.count', 'GroupMembership.count'] do
      post "/api/v1/groups/#{@group.id}/members",
           params: { member: { email: 'not-an-email', name: 'Ghost' } },
           headers: @owner_headers, as: :json
    end

    assert_response :unprocessable_entity
  end

  test 'adding an already existing member returns 409 with no duplicate row' do
    assert_no_difference 'GroupMembership.count' do
      post "/api/v1/groups/#{@group.id}/members",
           params: { member: { email: @member.email } },
           headers: @owner_headers, as: :json
    end

    assert_response :conflict
  end

  test 'adding a member to an archived group is rejected' do
    @group.update!(archived_at: Time.current)
    new_user = create_user(name: 'Late joiner', email: 'mem-late@example.com')

    assert_no_difference 'GroupMembership.count' do
      post "/api/v1/groups/#{@group.id}/members",
           params: { member: { email: new_user.email } },
           headers: @owner_headers, as: :json
    end

    assert_response :unprocessable_entity
  end

  # ── REMOVE MEMBER ────────────────────────────────────────────────────────────

  test 'ordinary member cannot remove another member' do
    assert_no_difference 'GroupMembership.count' do
      delete "/api/v1/groups/#{@group.id}/members/#{@member.id}",
             headers: @member_headers, as: :json
    end

    assert_response :forbidden
  end

  test 'owner cannot remove themselves from the group' do
    assert_no_difference 'GroupMembership.count' do
      delete "/api/v1/groups/#{@group.id}/members/#{@owner.id}",
             headers: @owner_headers, as: :json
    end

    assert_response :unprocessable_entity
  end

  test 'member who paid an expense cannot be removed' do
    create_expense(group: @group, paid_by: @member, amount: '50.00',
                   splits: { @owner => '50.00' })

    assert_no_difference 'GroupMembership.count' do
      delete "/api/v1/groups/#{@group.id}/members/#{@member.id}",
             headers: @owner_headers, as: :json
    end

    assert_response :unprocessable_entity
  end

  test 'member with no financial history is removed without deleting their user account' do
    assert_difference 'GroupMembership.count', -1 do
      delete "/api/v1/groups/#{@group.id}/members/#{@member.id}",
             headers: @owner_headers, as: :json
    end

    assert_response :no_content
    assert User.exists?(@member.id), 'User account should still exist after membership removal'
  end

  test 'unknown member ID returns 404' do
    delete "/api/v1/groups/#{@group.id}/members/00000000-0000-0000-0000-000000000000",
           headers: @owner_headers, as: :json

    assert_response :not_found
  end

  test 'removing a member from an archived group is rejected' do
    @group.update!(archived_at: Time.current)

    assert_no_difference 'GroupMembership.count' do
      delete "/api/v1/groups/#{@group.id}/members/#{@member.id}",
             headers: @owner_headers, as: :json
    end

    assert_response :unprocessable_entity
  end
end
