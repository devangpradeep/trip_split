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
            user: {
              id: user&.id,
              name: user&.name,
              avatar_url: user&.avatar_url,
              upi_id: user&.upi_id,
              is_guest: user&.is_guest?
            },
            balance: amount.to_f
          }
        end

        pairwise = Balances::SettlementPlanner.new(@group, balances: balances).call
        suggested = pairwise.map { |settlement| settlement_payload(settlement, users_by_id) }
        guest_suggested = suggested.select { |settlement| settlement.dig(:from, :is_guest) }

        render json: {
          balances: result,
          suggested_settlements: suggested,
          guest_settlement_suggestions: guest_suggested
        }
      end

      private

      def settlement_payload(settlement, users_by_id)
        from_user = users_by_id[settlement[:from_user_id]]
        to_user = users_by_id[settlement[:to_user_id]]

        {
          from: settlement_user_payload(from_user),
          to: settlement_user_payload(to_user),
          amount: settlement[:amount].to_f
        }
      end

      def settlement_user_payload(user)
        {
          id: user&.id,
          name: user&.name,
          upi_id: user&.upi_id,
          is_guest: user&.is_guest?
        }
      end

      def set_group
        @group = current_user.groups.find(params[:group_id])
      end
    end
  end
end
