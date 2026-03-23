module Api
  module V1
    class SettlementsController < ApplicationController
      before_action :authenticate_user!
      before_action :set_group
      before_action :set_settlement, only: %i[show destroy]

      def index
        @settlements = @group.settlements.includes(:from_user, :to_user).order(date: :desc)
        render json: @settlements, include: {
          from_user: { only: [:id, :name, :avatar_url] },
          to_user: { only: [:id, :name, :avatar_url] }
        }
      end

      def create
        @settlement = @group.settlements.build(settlement_params)
        
        if @settlement.save
          render json: @settlement, status: :created, include: {
            from_user: { only: [:id, :name, :avatar_url] },
            to_user: { only: [:id, :name, :avatar_url] }
          }
        else
          render json: { errors: @settlement.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def show
        render json: @settlement, include: {
          from_user: { only: [:id, :name, :avatar_url] },
          to_user: { only: [:id, :name, :avatar_url] }
        }
      end

      def destroy
        @settlement.destroy
        head :no_content
      end

      private

      def set_group
        @group = current_user.groups.find(params[:group_id])
      end

      def set_settlement
        @settlement = @group.settlements.find(params[:id])
      end

      def settlement_params
        params.require(:settlement).permit(:from_user_id, :to_user_id, :amount, :date, :note)
      end
    end
  end
end
