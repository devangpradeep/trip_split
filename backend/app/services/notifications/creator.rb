# frozen_string_literal: true

module Notifications
  class Creator
    EVENT_PREFERENCE_ATTRIBUTES = {
      'expense_created' => :notify_expense_created,
      'expense_updated' => :notify_expense_updated,
      'expense_deleted' => :notify_expense_deleted,
      'settlement_created' => :notify_settlement_created,
      'settlement_deleted' => :notify_settlement_deleted,
      'group_member_added' => :notify_group_member_added
    }.freeze

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
      @recipients.uniq(&:id)
                 .reject { |recipient| recipient.id == actor&.id }
                 .select { |recipient| notification_enabled?(recipient) }
    end

    def notification_enabled?(recipient)
      preference_attribute = EVENT_PREFERENCE_ATTRIBUTES[event_type]
      return true unless preference_attribute

      recipient.public_send(preference_attribute)
    end
  end
end
