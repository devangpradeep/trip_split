# frozen_string_literal: true

module Users
  class RegistrationsController < Devise::RegistrationsController
    respond_to :json

    def create
      # 1. Try to find a guest whose email matches the registration email
      guest = User.find_by(email: sign_up_params[:email]&.downcase&.strip, is_guest: true)

      # 2. If no email match, look for a guest created via phone-only flow.
      #    Those guests have a placeholder email like guest+phoneXXXXXXXXXX@tripsplit.internal
      #    and their normalized_phone will equal the submitted phone number.
      if guest.nil? && (phone = sign_up_params[:phone].to_s.gsub(/\D/, '')[0, 10]).present?
        guest = User.find_by(normalized_phone: phone, is_guest: true)
      end

      if guest
        claim_guest_account(guest)
      else
        super
      end
    end

    private

    def claim_guest_account(guest)
      # Phone-only guests were created with a placeholder email; give them the real one.
      real_email = sign_up_params[:email]&.downcase&.strip
      update_attrs = {
        name: sign_up_params[:name].presence || guest.name,
        phone: sign_up_params[:phone],
        password: sign_up_params[:password],
        password_confirmation: sign_up_params[:password_confirmation],
        is_guest: false
      }
      update_attrs[:email] = real_email if guest.email.end_with?('@tripsplit.internal') && real_email.present?

      if guest.update(update_attrs)
        sign_in(guest)
        render json: {
          message: 'Account claimed successfully. Welcome!',
          user: {
            id: guest.id,
            email: guest.email,
            name: guest.name,
            phone: guest.phone,
            avatar_url: guest.avatar_url,
            is_guest: guest.is_guest?
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
            avatar_url: current_user.avatar_url,
            is_guest: current_user.is_guest?
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
