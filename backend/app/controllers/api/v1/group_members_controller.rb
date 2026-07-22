# frozen_string_literal: true

module Api
  module V1
    class GroupMembersController < ApplicationController
      before_action :authenticate_user!
      before_action :set_group
      before_action :ensure_owner!, only: %i[suggestions create destroy]
      before_action :ensure_active_group!, only: %i[suggestions create destroy]
      before_action :set_membership, only: %i[destroy]
      before_action :ensure_not_self!, only: %i[destroy]
      before_action :ensure_no_financial_history!, only: %i[destroy]

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
        phone = member_params[:phone].to_s.gsub(/\D/, '')[0, 10].presence
        email = member_params[:email].to_s.strip.downcase.presence

        # -----------------------------------------------------------------------
        # Resolve which identifier was provided and find/build the user
        # -----------------------------------------------------------------------
        if phone.present?
          # Phone-first path — look up a real user by their 10-digit phone
          user = User.find_by(normalized_phone: phone)

          if user.nil?
            # No account yet — create a phone-only guest placeholder
            display_name = member_params[:name].to_s.strip
            if display_name.blank?
              return render json: { error: 'Display name is required when adding a guest by phone' },
                            status: :unprocessable_entity
            end

            placeholder_email = "guest+phone#{phone}@tripsplit.internal"
            user = User.find_by(email: placeholder_email) ||
                   User.new(
                     email: placeholder_email,
                     phone: phone,
                     name: display_name,
                     is_guest: true,
                     password: SecureRandom.hex(32)
                   )

            unless user.persisted? || user.save
              return render json: { errors: user.errors.full_messages }, status: :unprocessable_entity
            end
          end
        elsif email.present?
          # Email-first path (existing behaviour)
          user = User.find_by(email: email)

          if user.nil?
            display_name = member_params[:name].to_s.strip
            if display_name.blank?
              return render json: { error: 'Display name is required when adding a guest member' },
                            status: :unprocessable_entity
            end

            user = User.new(
              email: email,
              name: display_name,
              is_guest: true,
              password: SecureRandom.hex(32)
            )

            unless user.save
              return render json: { errors: user.errors.full_messages }, status: :unprocessable_entity
            end
          end
        else
          return render json: { error: 'Provide an email address or a phone number to add a member' },
                        status: :unprocessable_entity
        end

        membership = @group.group_memberships.find_or_initialize_by(user: user)
        if membership.persisted?
          return render json: { error: 'User is already a member of this group' }, status: :conflict
        end

        membership.role = 'member'

        if membership.save
          notify_member_added(user) unless user.is_guest?

          render json: {
            message: user.is_guest? ? 'Guest member added successfully' : 'Member added successfully',
            member: {
              id: user.id,
              name: user.name,
              email: user.email,
              phone: user.phone,
              avatar_url: user.avatar_url,
              is_guest: user.is_guest?,
              can_remove: member_removable?(user.id)
            }
          }, status: :created
        else
          render json: { errors: membership.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def destroy
        @membership.destroy
        head :no_content
      end

      private

      def set_group
        @group = current_user.groups.find(params[:group_id])
      end

      def set_membership
        @membership = @group.group_memberships.find_by(user_id: params[:id])
        return if @membership

        render json: { error: 'Member not found in this group' }, status: :not_found
      end

      def ensure_active_group!
        return unless @group.archived?

        render json: { error: 'Restore this group before managing members' }, status: :unprocessable_entity
      end

      def ensure_owner!
        return if @group.created_by_id == current_user.id

        render json: { error: 'Only the group owner can manage members' }, status: :forbidden
      end

      def ensure_not_self!
        return unless @membership.user_id == current_user.id

        render json: { error: 'Group owners cannot remove themselves from the group' }, status: :unprocessable_entity
      end

      def ensure_no_financial_history!
        return unless member_has_financial_history?(@membership.user_id)

        render json: {
          error: 'Remove this member from related expenses or settlements before deleting them from the group'
        }, status: :unprocessable_entity
      end

      def member_has_financial_history?(user_id)
        @group.expenses.exists?(paid_by_id: user_id) ||
          @group.expenses.exists?(created_by_id: user_id) ||
          ExpenseSplit.joins(:expense)
                      .where(expenses: { group_id: @group.id }, user_id: user_id)
                      .exists? ||
          @group.settlements
                .where('from_user_id = :user_id OR to_user_id = :user_id', user_id: user_id)
                .exists?
      end

      def member_removable?(user_id)
        @group.created_by_id == current_user.id &&
          !@group.archived? &&
          user_id != current_user.id &&
          !member_has_financial_history?(user_id)
      end

      def notify_member_added(user)
        Notifications::Creator.call(
          recipients: [user],
          actor: current_user,
          group: @group,
          notifiable: @group,
          event_type: 'group_member_added',
          title: "Added to #{@group.name}",
          body: "#{current_user.name} added you to the group",
          url: "/groups/#{@group.id}"
        )
      end

      def member_params
        params.require(:member).permit(:email, :phone, :name)
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
