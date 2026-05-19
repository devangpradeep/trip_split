# frozen_string_literal: true

module Api
  module V1
    class AuthController < ApplicationController
      before_action :authenticate_user!

      # GET /api/v1/auth/me
      # Called by the frontend on every cold app load to validate the stored JWT
      # and return a fresh copy of the current user's data.
      # Returns 401 (via authenticate_user!) if the token is missing, expired,
      # or in the denylist — the frontend uses this to detect a stale session.
      def me
        render json: {
          user: {
            id: current_user.id,
            email: current_user.email,
            name: current_user.name,
            avatar_url: current_user.avatar_url
          }
        }
      end
    end
  end
end
