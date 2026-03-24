# frozen_string_literal: true

module Api
  module V1
    class GroupsController < ApplicationController
      before_action :authenticate_user!
      before_action :set_group, only: %i[show update destroy]

      def index
        @groups = current_user.groups.includes(:members)
        render json: @groups, include: { members: { only: %i[id name avatar_url] } }
      end

      def show
        render json: @group, include: {
          members: { only: %i[id name email avatar_url] },
          expenses: { include: %i[paid_by expense_splits] },
          settlements: { include: %i[from_user to_user] }
        }
      end

      def create
        @group = Group.new(group_params)
        @group.created_by = current_user

        if @group.save
          @group.group_memberships.create(user: current_user, role: 'admin')
          render json: @group, status: :created
        else
          render json: @group.errors, status: :unprocessable_entity
        end
      end

      def update
        if @group.update(group_params)
          render json: @group
        else
          render json: @group.errors, status: :unprocessable_entity
        end
      end

      def destroy
        @group.destroy
        head :no_content
      end

      private

      def set_group
        @group = current_user.groups.find(params[:id])
      end

      def group_params
        params.require(:group).permit(:name, :description, :currency)
      end
    end
  end
end
