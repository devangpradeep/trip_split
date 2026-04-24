# frozen_string_literal: true

module Api
  module V1
    class GroupMembersController < ApplicationController
      before_action :authenticate_user!
      before_action :set_group
      before_action :ensure_admin!

      def suggestions
        shared_group_ids = current_user.group_ids
        query = suggestions_params[:q].to_s.strip.downcase

        friends = User.joins(:group_memberships)
                      .where(group_memberships: { group_id: shared_group_ids })
                      .where.not(id: current_user.id)
                      .where.not(id: @group.members.select(:id))
                      .distinct

        if query.present?
          escaped_query = ActiveRecord::Base.sanitize_sql_like(query)
          pattern = "%#{escaped_query}%"
          friends = friends.where(
            'LOWER(users.name) LIKE :pattern OR LOWER(users.email) LIKE :pattern',
            pattern: pattern
          )
        end

        friends = friends.order(:name, :email).limit(suggestion_limit)

        render json: {
          friends: friends.map do |friend|
            {
              id: friend.id,
              name: friend.name,
              email: friend.email,
              avatar_url: friend.avatar_url
            }
          end
        }
      end

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

      def suggestions_params
        params.permit(:q, :limit)
      end

      def suggestion_limit
        requested_limit = suggestions_params[:limit].to_i
        return 10 unless requested_limit.positive?

        [requested_limit, 20].min
      end
    end
  end
end
