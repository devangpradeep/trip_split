# frozen_string_literal: true

require 'test_helper'

class NotificationFlowTest < ActionDispatch::IntegrationTest
  setup do
    @owner = create_user(name: 'Trip organiser', email: 'notification-owner@example.com')
    @actor = create_user(name: 'Friend who paid', email: 'notification-actor@example.com')
    @other_user = create_user(name: 'Another traveller', email: 'notification-other@example.com')
    @group = create_group(owner: @owner, name: 'Weekend hill trip', members: [@actor, @other_user])
    @headers = auth_headers_for(@owner)
  end

  test 'lists only current user notifications newest first and counts unread outside the page' do
    older_unread = create_notification(
      user: @owner,
      title: 'Older expense update',
      created_at: Time.zone.parse('2026-06-20 09:00:00')
    )
    already_read = create_notification(
      user: @owner,
      title: 'Read expense update',
      created_at: Time.zone.parse('2026-06-20 10:00:00'),
      read_at: Time.zone.parse('2026-06-20 10:30:00')
    )
    latest_unread = create_notification(
      user: @owner,
      title: 'Latest expense update',
      created_at: Time.zone.parse('2026-06-20 11:00:00')
    )
    other_notification = create_notification(
      user: @other_user,
      title: 'Other user update',
      created_at: Time.zone.parse('2026-06-20 12:00:00')
    )

    get '/api/v1/notifications', params: { limit: 2 }, headers: @headers, as: :json

    assert_response :ok
    body = json_response
    notifications = body.fetch('notifications')
    ids = notifications.map { |notification| notification.fetch('id') }

    assert_equal [latest_unread.id, already_read.id], ids
    assert_equal 2, body.fetch('unread_count')
    assert_equal false, notifications.first.fetch('read')
    assert_equal true, notifications.second.fetch('read')
    assert_equal @actor.id, notifications.first.dig('actor', 'id')
    assert_equal @group.id, notifications.first.dig('group', 'id')
    refute_includes ids, older_unread.id
    refute_includes ids, other_notification.id
  end

  test 'marks one notification as read and keeps the original read time on repeat clicks' do
    notification = create_notification(
      user: @owner,
      title: 'Settlement received',
      event_type: 'settlement_created',
      created_at: Time.zone.parse('2026-06-20 09:00:00')
    )
    first_read_at = nil

    travel_to Time.zone.parse('2026-06-20 12:00:00') do
      patch "/api/v1/notifications/#{notification.id}/read", headers: @headers, as: :json

      assert_response :ok
      assert_equal true, json_response.dig('notification', 'read')
      first_read_at = notification.reload.read_at
      assert_equal Time.current.to_i, first_read_at.to_i
    end

    travel_to Time.zone.parse('2026-06-20 13:00:00') do
      patch "/api/v1/notifications/#{notification.id}/read", headers: @headers, as: :json

      assert_response :ok
      assert_equal first_read_at.to_i, notification.reload.read_at.to_i
    end
  end

  test 'cannot mark another users notification as read' do
    notification = create_notification(
      user: @other_user,
      title: 'Private update',
      created_at: Time.zone.parse('2026-06-20 09:00:00')
    )

    patch "/api/v1/notifications/#{notification.id}/read", headers: @headers, as: :json

    assert_response :not_found
    assert_nil notification.reload.read_at
  end

  test 'marks all current user notifications read without touching another user' do
    unread_one = create_notification(
      user: @owner,
      title: 'First unread',
      created_at: Time.zone.parse('2026-06-20 09:00:00')
    )
    unread_two = create_notification(
      user: @owner,
      title: 'Second unread',
      created_at: Time.zone.parse('2026-06-20 10:00:00')
    )
    read_at = Time.zone.parse('2026-06-20 10:30:00')
    already_read = create_notification(
      user: @owner,
      title: 'Already read',
      created_at: Time.zone.parse('2026-06-20 11:00:00'),
      read_at: read_at
    )
    other_notification = create_notification(
      user: @other_user,
      title: 'Other unread',
      created_at: Time.zone.parse('2026-06-20 12:00:00')
    )

    travel_to Time.zone.parse('2026-06-20 14:00:00') do
      patch '/api/v1/notifications/mark_all_read', headers: @headers, as: :json
    end

    assert_response :ok
    assert_equal 0, json_response.fetch('unread_count')
    assert unread_one.reload.read?
    assert unread_two.reload.read?
    assert_equal read_at.to_i, already_read.reload.read_at.to_i
    assert_nil other_notification.reload.read_at
  end

  test 'limit=0 falls back to the default page size of 20' do
    25.times do |i|
      create_notification(user: @owner, title: "Notif #{i}",
                          created_at: Time.zone.parse('2026-06-20 09:00:00') + i.minutes)
    end

    get '/api/v1/notifications', params: { limit: 0 }, headers: @headers, as: :json

    assert_response :ok
    assert_equal 20, json_response.fetch('notifications').length
  end

  test 'limit exceeding maximum is capped at 50' do
    55.times do |i|
      create_notification(user: @owner, title: "Notif #{i}",
                          created_at: Time.zone.parse('2026-06-20 09:00:00') + i.minutes)
    end

    get '/api/v1/notifications', params: { limit: 100 }, headers: @headers, as: :json

    assert_response :ok
    assert_equal 50, json_response.fetch('notifications').length
  end

  test 'unread_count only reflects the current users unread notifications' do
    create_notification(user: @owner,      title: 'My notif',    created_at: 1.hour.ago)
    create_notification(user: @other_user, title: 'Other notif', created_at: 1.hour.ago)

    get '/api/v1/notifications', headers: @headers, as: :json

    assert_response :ok
    assert_equal 1, json_response.fetch('unread_count')
  end

  test 'after failing to read another users notification it remains unread' do
    notification = create_notification(
      user: @other_user,
      title: 'Still unread',
      created_at: Time.zone.parse('2026-06-20 09:00:00')
    )

    patch "/api/v1/notifications/#{notification.id}/read", headers: @headers, as: :json
    assert_response :not_found

    assert_nil notification.reload.read_at, 'Notification must still be unread after the failed attempt'
  end

  test 'listing notifications is safe when the actor or group record no longer exists' do
    notification = create_notification(
      user: @owner,
      title: 'Orphaned notification',
      created_at: 1.hour.ago
    )
    # Simulate actor deletion by setting actor_id to nil directly at DB level
    # (bypassing callbacks so the notification row survives).
    notification.update_columns(actor_id: nil, group_id: nil)

    get '/api/v1/notifications', headers: @headers, as: :json

    assert_response :ok
    entry = json_response.fetch('notifications').find { |n| n['id'] == notification.id }
    assert_not_nil entry, 'Orphaned notification must appear in the list'
    assert_nil entry.fetch('actor')
    assert_nil entry.fetch('group')
  end

  private

  def create_notification(user:, title:, created_at:, **attributes)
    notification_attributes = {
      actor: @actor,
      group: @group,
      event_type: 'expense_created',
      body: 'Trip activity changed'
    }.merge(attributes)
    group = notification_attributes.fetch(:group)

    Notification.create!(
      user: user,
      title: title,
      url: "/groups/#{group.id}",
      created_at: created_at,
      updated_at: created_at,
      **notification_attributes
    )
  end
end
