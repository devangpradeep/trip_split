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
            user: { id: user&.id, name: user&.name, avatar_url: user&.avatar_url, upi_id: user&.upi_id, is_guest: user&.is_guest? },
            balance: amount.to_f
          }
        end

        suggested = Balances::SettlementSimplifier.new(balances).call.map do |s|
          from_user = users_by_id[s[:from_user_id]]
          to_user   = users_by_id[s[:to_user_id]]
          {
            from: { id: from_user&.id, name: from_user&.name, upi_id: from_user&.upi_id, is_guest: from_user&.is_guest? },
            to:   { id: to_user&.id,   name: to_user&.name,   upi_id: to_user&.upi_id,   is_guest: to_user&.is_guest? },
            amount: s[:amount].to_f
          }
        end

        render json: { balances: result, suggested_settlements: suggested }
      end

      private

      def set_group
        @group = current_user.groups.find(params[:group_id])
      end
    end
  end
end
