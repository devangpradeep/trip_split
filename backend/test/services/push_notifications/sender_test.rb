# frozen_string_literal: true

require 'test_helper'

module PushNotifications
  class SenderTest < ActiveSupport::TestCase
    setup do
      @recipient = create_user(name: 'Traveller', email: 'sender-recipient@example.com')
      @group = create_group(owner: @recipient, name: 'Weekend hill trip')
      @notification = Notification.create!(
        user: @recipient,
        actor: @recipient,
        group: @group,
        event_type: 'expense_created',
        title: 'Expense added',
        body: 'A shared expense was added',
        url: "/groups/#{@group.id}"
      )
    end

    test 'does nothing when VAPID configuration is missing' do
      subscription = create_push_subscription(endpoint: 'https://push.example.test/not-configured')

      without_vapid_configuration do
        WebPush.stub(:payload_send, ->(**_options) { flunk 'Push should not be attempted without VAPID keys' }) do
          PushNotifications::Sender.call(@notification)
        end
      end

      assert_nil subscription.reload.last_used_at
    end

    test 'sends the expected payload to every subscription and updates last used time' do
      first_subscription = create_push_subscription(endpoint: 'https://push.example.test/device-1')
      second_subscription = create_push_subscription(endpoint: 'https://push.example.test/device-2')
      deliveries = []

      with_vapid_configuration do
        WebPush.stub(:payload_send, ->(**options) { deliveries << options }) do
          travel_to Time.zone.parse('2026-06-20 12:00:00') do
            PushNotifications::Sender.call(@notification)
          end
        end
      end

      assert_equal 2, deliveries.size
      assert_equal(
        ['https://push.example.test/device-1', 'https://push.example.test/device-2'],
        deliveries.map { |delivery| delivery.fetch(:endpoint) }.sort
      )

      payload = JSON.parse(deliveries.first.fetch(:message))
      assert_equal 'Expense added', payload.fetch('title')
      assert_equal 'A shared expense was added', payload.fetch('body')
      assert_equal "/groups/#{@group.id}", payload.fetch('url')
      assert_equal @notification.id, payload.fetch('notification_id')
      assert_equal Time.zone.parse('2026-06-20 12:00:00').to_i, first_subscription.reload.last_used_at.to_i
      assert_equal Time.zone.parse('2026-06-20 12:00:00').to_i, second_subscription.reload.last_used_at.to_i
    end

    test 'removes expired subscriptions without failing the notification flow' do
      subscription = create_push_subscription(endpoint: 'https://push.example.test/expired-device')
      expired_response = Struct.new(:body).new('expired')

      with_vapid_configuration do
        WebPush.stub(:payload_send, lambda { |**_options|
          raise WebPush::ExpiredSubscription.new(expired_response, 'push.example.test')
        }) do
          PushNotifications::Sender.call(@notification)
        end
      end

      assert_nil PushSubscription.find_by(id: subscription.id)
    end

    test 'keeps valid subscriptions when a temporary push error happens' do
      subscription = create_push_subscription(endpoint: 'https://push.example.test/temporary-error')

      with_vapid_configuration do
        WebPush.stub(:payload_send, ->(**_options) { raise StandardError, 'temporary push failure' }) do
          PushNotifications::Sender.call(@notification)
        end
      end

      assert PushSubscription.exists?(subscription.id)
      assert_nil subscription.reload.last_used_at
    end

    private

    def create_push_subscription(endpoint:)
      @recipient.push_subscriptions.create!(
        endpoint: endpoint,
        p256dh_key: 'public-key',
        auth_key: 'auth-key'
      )
    end

    def with_vapid_configuration(&)
      with_vapid_env(
        'VAPID_PUBLIC_KEY' => 'public-key',
        'VAPID_PRIVATE_KEY' => 'private-key',
        'VAPID_SUBJECT' => 'mailto:notifications@example.test',
        &
      )
    end

    def without_vapid_configuration(&)
      with_vapid_env(
        'VAPID_PUBLIC_KEY' => nil,
        'VAPID_PRIVATE_KEY' => nil,
        'VAPID_SUBJECT' => nil,
        &
      )
    end

    def with_vapid_env(values)
      previous_values = values.keys.to_h { |key| [key, ENV.fetch(key, nil)] }
      values.each do |key, value|
        value.nil? ? ENV.delete(key) : ENV[key] = value
      end

      yield
    ensure
      previous_values.each do |key, value|
        value.nil? ? ENV.delete(key) : ENV[key] = value
      end
    end
  end
end
