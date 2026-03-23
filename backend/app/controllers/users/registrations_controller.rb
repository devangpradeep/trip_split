class Users::RegistrationsController < Devise::RegistrationsController
  respond_to :json

  private

  def respond_with(current_user, _opts = {})
    if resource.persisted?
      render json: {
        message: 'Signed up successfully.',
        user: {
          id: current_user.id,
          email: current_user.email,
          name: current_user.name,
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
