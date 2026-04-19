# frozen_string_literal: true

module Api
  module V1
    class GroupInvitesController < ApplicationController
      class InviteValidationError < StandardError; end

      before_action :authenticate_user!, except: [:show]
      before_action :set_group, only: %i[index create destroy]
      before_action :ensure_admin!, only: %i[index create destroy]
      before_action :set_group_invite, only: [:destroy]
      before_action :set_invite_by_token, only: %i[show accept]
      before_action :validate_invite_expiry_params!, only: [:create]

      def index
        active_invites = @group.group_invites.active.includes(:created_by).order(created_at: :desc)
        latest_expired_invite = @group.group_invites
                                      .where(revoked_at: nil)
                                      .where.not(expires_at: nil)
                                      .where('expires_at <= ?', Time.current)
                                      .includes(:created_by)
                                      .order(expires_at: :desc)
                                      .first

        render json: {
          invites: active_invites.map { |invite| invite_payload(invite) },
          latest_expired_invite: latest_expired_invite ? invite_payload(latest_expired_invite) : nil
        }
      end

      def create
        invite = nil
        @group.with_lock do
          revoke_active_invites!

          invite = @group.group_invites.create!(
            created_by: current_user,
            expires_at: invite_expiration_at
          )
        end

        render json: { invite: invite_payload(invite) }, status: :created
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      rescue InviteValidationError => e
        render json: { errors: [e.message] }, status: :unprocessable_entity
      end

      def destroy
        @group_invite.update!(revoked_at: Time.current) unless @group_invite.revoked?
        render json: { invite: invite_payload(@group_invite) }
      end

      def show
        return render_invite_invalid('Invite link not found', :not_found) unless @invite
        return render_invite_invalid('Invite link has been revoked', :gone) if @invite.revoked?
        return render_invite_invalid('Invite link has expired', :gone) if @invite.expired?

        render json: { invite: invite_payload(@invite) }
      end

      def accept
        return render_invite_invalid('Invite link not found', :not_found) unless @invite
        return render_invite_invalid('Invite link has been revoked', :gone) if @invite.revoked?
        return render_invite_invalid('Invite link has expired', :gone) if @invite.expired?

        membership = @invite.group.group_memberships.find_or_initialize_by(user: current_user)

        if membership.persisted?
          render json: {
            message: 'You are already a member of this group',
            group: group_payload(@invite.group)
          }, status: :ok
          return
        end

        membership.role = 'member'
        membership.save!

        render json: { message: 'Joined group successfully', group: group_payload(@invite.group) }, status: :created
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      end

      private

      def set_group
        @group = current_user.groups.find(params[:group_id])
      end

      def set_group_invite
        @group_invite = @group.group_invites.find(params[:id])
      end

      def set_invite_by_token
        @invite = GroupInvite.includes(:group, :created_by).find_by(token: params[:token])
      end

      def ensure_admin!
        membership = @group.group_memberships.find_by(user_id: current_user.id)
        return if membership&.role == 'admin'

        render json: { error: 'Only group admins can manage invite links' }, status: :forbidden
      end

      def invite_params
        params.fetch(:invite, {}).permit(:expires_in_hours, :no_expiry)
      end

      def revoke_active_invites!
        @group.group_invites.active.update_all(revoked_at: Time.current)
      end

      def invite_expiration_hours
        raw_hours = invite_params[:expires_in_hours].presence || 48
        hours = raw_hours.to_i

        raise InviteValidationError, 'Expiry must be between 1 and 168 hours' unless hours.between?(1, 168)

        hours
      end

      def no_expiry?
        ActiveModel::Type::Boolean.new.cast(invite_params[:no_expiry])
      end

      def invite_expiration_at
        return nil if no_expiry?

        Time.current + invite_expiration_hours.hours
      end

      def validate_invite_expiry_params!
        return if no_expiry?

        invite_expiration_hours
      end

      def invite_payload(invite)
        {
          id: invite.id,
          token: invite.token,
          invite_url: invite_url_for(invite.token),
          expires_at: invite.expires_at,
          revoked_at: invite.revoked_at,
          status: invite_status(invite),
          group: group_payload(invite.group),
          created_by: {
            id: invite.created_by.id,
            name: invite.created_by.name,
            email: invite.created_by.email
          },
          created_at: invite.created_at
        }
      end

      def invite_status(invite)
        return 'revoked' if invite.revoked?
        return 'expired' if invite.expired?

        'active'
      end

      def group_payload(group)
        {
          id: group.id,
          name: group.name,
          currency: group.currency,
          member_count: group.members.count
        }
      end

      def invite_url_for(token)
        frontend_base = ENV['FRONTEND_APP_URL'].presence || request.headers['Origin'].presence || request.base_url
        "#{frontend_base.to_s.chomp('/')}/join/#{token}"
      end

      def render_invite_invalid(message, status)
        render json: { errors: [message] }, status: status
      end
    end
  end
end
