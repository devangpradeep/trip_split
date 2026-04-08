# frozen_string_literal: true

module Api
  module V1
    class BalancesController < ApplicationController
      before_action :authenticate_user!
      before_action :set_group

      def index
        balances = Balances::Calculator.new(@group).call
        users_by_id = User.where(id: balances.keys).index_by(&:id)

        result = balances.map do |user_id, amount|
          user = users_by_id[user_id]
          {
            user: { id: user&.id, name: user&.name, avatar_url: user&.avatar_url },
            balance: amount.to_f
          }
        end

        render json: { balances: result }
      end

      private

      def set_group
        @group = current_user.groups.find(params[:group_id])
      end
    end
  end
end
