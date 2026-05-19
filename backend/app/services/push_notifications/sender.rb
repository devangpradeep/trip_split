# frozen_string_literal: true

require 'web_push'

module PushNotifications
  class Sender
    def self.call(notification)
      new(notification).call
    end

    def initialize(notification)
      @notification = notification
    end

    def call
      return unless configured?

      notification.user.push_subscriptions.find_each do |subscription|
        deliver(subscription)
      end
    rescue StandardError => e
      Rails.logger.error("[PushNotifications::Sender] #{e.class}: #{e.message}")
    end

    private

    attr_reader :notification

    def deliver(subscription)
      WebPush.payload_send(**delivery_options(subscription))
      subscription.update_column(:last_used_at, Time.current)
    rescue WebPush::ExpiredSubscription, WebPush::InvalidSubscription
      subscription.destroy
    rescue StandardError => e
      Rails.logger.error("[PushNotifications::Sender] #{e.class}: #{e.message}")
    end

    def delivery_options(subscription)
      {
        message: payload,
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh_key,
        auth: subscription.auth_key,
        vapid: vapid_options
      }
    end

    def payload
      {
        title: notification.title,
        body: notification.body,
        url: notification.url || '/',
        notification_id: notification.id
      }.to_json
    end

    def vapid_options
      {
        subject: ENV.fetch('VAPID_SUBJECT'),
        public_key: ENV.fetch('VAPID_PUBLIC_KEY'),
        private_key: ENV.fetch('VAPID_PRIVATE_KEY')
      }
    end

    def configured?
      ENV['VAPID_PUBLIC_KEY'].present? &&
        ENV['VAPID_PRIVATE_KEY'].present? &&
        ENV['VAPID_SUBJECT'].present?
    end
  end
end
