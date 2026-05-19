# frozen_string_literal: true

module Api
  module V1
    class PushSubscriptionsController < ApplicationController
      before_action :authenticate_user!

      def create
        subscription = PushSubscription.find_or_initialize_by(endpoint: subscription_params[:endpoint])
        subscription.assign_attributes(
          user: current_user,
          p256dh_key: subscription_params[:p256dh_key],
          auth_key: subscription_params[:auth_key],
          user_agent: request.user_agent,
          last_used_at: Time.current
        )
        subscription.save!

        render json: { enabled: true }, status: :created
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      end

      def destroy
        current_user.push_subscriptions.where(endpoint: params[:endpoint]).destroy_all if params[:endpoint].present?

        render json: { enabled: false }
      end

      private

      def subscription_params
        params.require(:push_subscription).permit(:endpoint, :p256dh_key, :auth_key)
      end
    end
  end
end
