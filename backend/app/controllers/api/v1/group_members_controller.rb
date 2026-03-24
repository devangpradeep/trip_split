# frozen_string_literal: true

module Api
  module V1
    class GroupMembersController < ApplicationController
      before_action :authenticate_user!
      before_action :set_group
      before_action :ensure_admin!

      def create
        user = User.find_by(email: member_params[:email].to_s.strip.downcase)
        return render json: { error: 'User not found' }, status: :not_found unless user

        membership = @group.group_memberships.find_or_initialize_by(user: user)
        if membership.persisted?
          return render json: { error: 'User is already a member of this group' }, status: :conflict
        end

        membership.role = 'member'

        if membership.save
          render json: {
            message: 'Member added successfully',
            member: {
              id: user.id,
              name: user.name,
              email: user.email,
              avatar_url: user.avatar_url
            }
          }, status: :created
        else
          render json: { errors: membership.errors.full_messages }, status: :unprocessable_entity
        end
      end

      private

      def set_group
        @group = current_user.groups.find(params[:group_id])
      end

      def ensure_admin!
        current_membership = @group.group_memberships.find_by(user_id: current_user.id)
        return if current_membership&.role == 'admin'

        render json: { error: 'Only group admins can add members' }, status: :forbidden
      end

      def member_params
        params.require(:member).permit(:email)
      end
    end
  end
end
