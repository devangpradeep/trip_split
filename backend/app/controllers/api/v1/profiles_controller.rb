# frozen_string_literal: true

module Api
  module V1
    class ProfilesController < ApplicationController
      before_action :authenticate_user!

      def show
        render json: { user: profile_payload(current_user) }
      end

      def update
        if current_user.update(profile_params)
          render json: { user: profile_payload(current_user) }
        else
          render json: { errors: current_user.errors.full_messages }, status: :unprocessable_entity
        end
      end

      private

      def profile_params
        params.require(:user).permit(
          :name,
          :phone,
          :upi_id,
          :bank_account_holder_name,
          :bank_name,
          :bank_account_number,
          :bank_ifsc,
          *User::NOTIFICATION_PREFERENCE_ATTRIBUTES
        )
      end

      def profile_payload(user)
        {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          avatar_url: user.avatar_url,
          upi_id: user.upi_id,
          bank_account_holder_name: user.bank_account_holder_name,
          bank_name: user.bank_name,
          bank_account_number: user.bank_account_number,
          bank_account_number_masked: masked_account_number(user.bank_account_number),
          bank_ifsc: user.bank_ifsc,
          notification_preferences: notification_preferences(user)
        }
      end

      def notification_preferences(user)
        User::NOTIFICATION_PREFERENCE_ATTRIBUTES.index_with do |attribute|
          user.public_send(attribute)
        end
      end

      def masked_account_number(account_number)
        return nil if account_number.blank?

        last_four = account_number.last(4)
        "#{'*' * [account_number.length - 4, 0].max}#{last_four}"
      end
    end
  end
end
