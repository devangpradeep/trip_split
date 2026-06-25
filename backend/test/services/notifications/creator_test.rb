# frozen_string_literal: true

require 'test_helper'

module Notifications
  class CreatorTest < ActiveSupport::TestCase
    setup do
      @actor = create_user(name: 'Trip organiser', email: 'creator-actor@example.com')
      @recipient = create_user(name: 'Traveller', email: 'creator-recipient@example.com')
      @muted_recipient = create_user(name: 'Quiet traveller', email: 'creator-muted@example.com')
      @group = create_group(owner: @actor, name: 'Weekend hill trip', members: [@recipient, @muted_recipient])
      @expense = create_expense(
        group: @group,
        paid_by: @actor,
        amount: '120.00',
        splits: { @actor => '60.00', @recipient => '60.00' },
        description: 'Shared dinner'
      )
    end

    test 'creates one notification per eligible recipient and sends push once per notification' do
      @muted_recipient.update!(notify_expense_created: false)
      pushed_notification_ids = []

      PushNotifications::Sender.stub(:call, ->(notification) { pushed_notification_ids << notification.id }) do
        assert_difference 'Notification.count', 1 do
          Notifications::Creator.call(
            recipients: [@actor, @recipient, @recipient, @muted_recipient, nil],
            actor: @actor,
            group: @group,
            notifiable: @expense,
            event_type: 'expense_created',
            title: 'Expense added',
            body: 'A shared dinner was added',
            url: "/groups/#{@group.id}"
          )
        end
      end

      notification = @recipient.notifications.order(:created_at).last
      assert_equal @actor, notification.actor
      assert_equal @group, notification.group
      assert_equal @expense, notification.notifiable
      assert_equal 'expense_created', notification.event_type
      assert_equal 'Expense added', notification.title
      assert_equal 'A shared dinner was added', notification.body
      assert_equal "/groups/#{@group.id}", notification.url
      assert_equal [notification.id], pushed_notification_ids
      assert_empty @actor.notifications
      assert_empty @muted_recipient.notifications
    end

    test 'unknown event types default to enabled' do
      @recipient.update!(notify_expense_created: false)

      PushNotifications::Sender.stub(:call, nil) do
        assert_difference 'Notification.count', 1 do
          Notifications::Creator.call(
            recipients: [@recipient],
            actor: @actor,
            group: @group,
            event_type: 'custom_trip_update',
            title: 'Trip update',
            body: 'A custom update was posted',
            url: "/groups/#{@group.id}"
          )
        end
      end

      assert_equal 'custom_trip_update', @recipient.notifications.last.event_type
    end

    test 'push failure does not roll back the stored notification' do
      PushNotifications::Sender.stub(:call, ->(_notification) { raise StandardError, 'push unavailable' }) do
        assert_difference 'Notification.count', 1 do
          Notifications::Creator.call(
            recipients: [@recipient],
            actor: @actor,
            group: @group,
            event_type: 'settlement_created',
            title: 'Settlement recorded',
            body: 'A payment was recorded',
            url: "/groups/#{@group.id}"
          )
        end
      end

      assert_equal 'settlement_created', @recipient.notifications.last.event_type
    end
  end
end
