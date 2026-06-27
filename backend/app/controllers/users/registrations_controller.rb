# frozen_string_literal: true

module Users
  class RegistrationsController < Devise::RegistrationsController
    respond_to :json

    def create
      guest = User.find_by(email: sign_up_params[:email]&.downcase&.strip, is_guest: true)

      if guest
        claim_guest_account(guest)
      else
        super
      end
    end

    private

    def claim_guest_account(guest)
      if guest.update(
        name: sign_up_params[:name].presence || guest.name,
        phone: sign_up_params[:phone],
        password: sign_up_params[:password],
        password_confirmation: sign_up_params[:password_confirmation],
        is_guest: false
      )
        sign_in(guest)
        render json: {
          message: 'Account claimed successfully. Welcome!',
          user: {
            id: guest.id,
            email: guest.email,
            name: guest.name,
            phone: guest.phone,
            avatar_url: guest.avatar_url
          }
        }, status: :ok
      else
        render json: {
          message: "Account couldn't be claimed. #{guest.errors.full_messages.to_sentence}"
        }, status: :unprocessable_entity
      end
    end

    def respond_with(current_user, _opts = {})
      if resource.persisted?
        render json: {
          message: 'Signed up successfully.',
          user: {
            id: current_user.id,
            email: current_user.email,
            name: current_user.name,
            phone: current_user.phone,
            avatar_url: current_user.avatar_url
          }
        }, status: :ok
      else
        render json: {
          message: "User couldn't be created successfully. #{current_user.errors.full_messages.to_sentence}"
        }, status: :unprocessable_entity
      end
    end
  end
end
