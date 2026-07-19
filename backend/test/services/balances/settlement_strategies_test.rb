# frozen_string_literal: true

require 'test_helper'

module Balances
  class SettlementStrategiesTest < ActiveSupport::TestCase
    setup do
      @hotel_payer = create_user(name: 'Hotel payer')
      @taxi_payer = create_user(name: 'Taxi payer')
      @third_traveller = create_user(name: 'Third traveller')
      @group = create_group(owner: @hotel_payer, members: [@taxi_payer, @third_traveller])

      create_expense(
        group: @group,
        paid_by: @hotel_payer,
        amount: '900.00',
        description: 'Hotel',
        splits: { @hotel_payer => '300.00', @taxi_payer => '300.00', @third_traveller => '300.00' }
      )
      create_expense(
        group: @group,
        paid_by: @taxi_payer,
        amount: '300.00',
        description: 'Taxi',
        splits: { @taxi_payer => '150.00', @third_traveller => '150.00' }
      )
      create_expense(
        group: @group,
        paid_by: @third_traveller,
        amount: '120.00',
        description: 'Snacks',
        splits: { @hotel_payer => '60.00', @third_traveller => '60.00' }
      )
    end

    test 'direct payments preserve the people who actually paid' do
      settlements = PairwiseSettlementCalculator.new(@group).call

      assert_settlements(
        [
          [@taxi_payer, @hotel_payer, '300.00'],
          [@third_traveller, @hotel_payer, '240.00'],
          [@third_traveller, @taxi_payer, '150.00']
        ],
        settlements
      )
    end

    test 'a partial direct payment reduces only that pair' do
      create_settlement(group: @group, from: @third_traveller, to: @hotel_payer, amount: '100.00')

      settlements = PairwiseSettlementCalculator.new(@group).call

      assert_settlements(
        [
          [@taxi_payer, @hotel_payer, '300.00'],
          [@third_traveller, @taxi_payer, '150.00'],
          [@third_traveller, @hotel_payer, '140.00']
        ],
        settlements
      )
    end

    test 'simplification uses net balances and reduces the number of payments' do
      balances = Calculator.new(@group).call
      settlements = SettlementSimplifier.new(balances).call

      assert_settlements(
        [
          [@third_traveller, @hotel_payer, '390.00'],
          [@taxi_payer, @hotel_payer, '150.00']
        ],
        settlements
      )
    end

    test 'planner selects one strategy for the entire group' do
      assert_equal 3, SettlementPlanner.new(@group).call.length

      @group.update!(simplify_debts: true)

      assert_equal 2, SettlementPlanner.new(@group).call.length
    end

    test 'planner considers a zero-net group settled even when pairwise history forms a cycle' do
      create_settlement(group: @group, from: @taxi_payer, to: @hotel_payer, amount: '300.00')
      create_settlement(group: @group, from: @third_traveller, to: @hotel_payer, amount: '240.00')
      create_settlement(group: @group, from: @third_traveller, to: @taxi_payer, amount: '150.00')

      assert_empty SettlementPlanner.new(@group).call
    end
  end
end
