# frozen_string_literal: true

module Api
  module V1
    class NotificationsController < ApplicationController
      before_action :authenticate_user!
      before_action :set_notification, only: %i[read]

      def index
        notifications = current_user.notifications
                                    .includes(:actor, :group)
                                    .recent
                                    .limit(notification_limit)

        render json: {
          notifications: notifications.map { |notification| notification_payload(notification) },
          unread_count: current_user.notifications.unread.count
        }
      end

      def read
        @notification.update!(read_at: Time.current) unless @notification.read?

        render json: { notification: notification_payload(@notification) }
      end

      def mark_all_read
        current_user.notifications.unread.update_all(read_at: Time.current, updated_at: Time.current)

        render json: { unread_count: 0 }
      end

      private

      def set_notification
        @notification = current_user.notifications.find(params[:id])
      end

      def notification_limit
        requested_limit = params[:limit].to_i
        return 20 unless requested_limit.positive?

        [requested_limit, 50].min
      end

      def notification_payload(notification)
        {
          id: notification.id,
          event_type: notification.event_type,
          title: notification.title,
          body: notification.body,
          url: notification.url,
          read: notification.read?,
          read_at: notification.read_at,
          created_at: notification.created_at,
          actor: user_payload(notification.actor),
          group: group_payload(notification.group)
        }
      end

      def user_payload(user)
        return unless user

        {
          id: user.id,
          name: user.name,
          avatar_url: user.avatar_url
        }
      end

      def group_payload(group)
        return unless group

        {
          id: group.id,
          name: group.name
        }
      end
    end
  end
end
