# frozen_string_literal: true

module Notifications
  class Creator
    def self.call(**attributes)
      new(attributes).call
    end

    def initialize(attributes)
      @recipients = Array(attributes.fetch(:recipients)).compact
      @actor = attributes.fetch(:actor)
      @group = attributes.fetch(:group)
      @event_type = attributes.fetch(:event_type)
      @title = attributes.fetch(:title)
      @body = attributes.fetch(:body)
      @url = attributes.fetch(:url)
      @notifiable = attributes[:notifiable]
    end

    def call
      recipients.each do |recipient|
        Notification.create!(notification_attributes(recipient))
      end
    rescue StandardError => e
      Rails.logger.error("[Notifications::Creator] #{e.class}: #{e.message}")
    end

    private

    attr_reader :actor, :group, :event_type, :title, :body, :url, :notifiable

    def notification_attributes(recipient)
      {
        user: recipient,
        actor: actor,
        group: group,
        notifiable: notifiable,
        event_type: event_type,
        title: title,
        body: body,
        url: url
      }
    end

    def recipients
      @recipients.uniq(&:id).reject { |recipient| recipient.id == actor&.id }
    end
  end
end
