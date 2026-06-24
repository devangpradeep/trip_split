# frozen_string_literal: true

require 'test_helper'

module Balances
  class RealLifeTripRegressionTest < ActiveSupport::TestCase
    setup do
      @organiser = create_user(name: 'Trip organiser')
      @friend_one = create_user(name: 'Friend one')
      @younger_brother = create_user(name: 'Younger brother', guest: true)
      @friend_two = create_user(name: 'Friend two')
      @group = create_group(
        owner: @organiser,
        name: 'Real-life trip regression',
        members: [@friend_one, @younger_brother, @friend_two],
        simplify_debts: true
      )

      add_verified_expenses
      create_settlement(group: @group, from: @younger_brother, to: @organiser, amount: '975.00')
    end

    test 'verified expenses and splits have the same total' do
      expense_total = @group.expenses.sum(:amount)
      split_total = ExpenseSplit.joins(:expense).where(expenses: { group_id: @group.id }).sum(:amount)

      assert_decimal '11980.00', expense_total
      assert_decimal '11980.00', split_total
    end

    test 'verified ledger produces the expected member balances' do
      balances = Calculator.new(@group).call

      assert_decimal '-82.75', balances[@organiser.id]
      assert_decimal '-2051.75', balances[@younger_brother.id]
      assert_decimal '1804.25', balances[@friend_one.id]
      assert_decimal '330.25', balances[@friend_two.id]
      assert_decimal '0.00', balances.values.sum
    end

    test 'simplified mode preserves the verified routing' do
      settlements = SettlementPlanner.new(@group).call

      assert_settlements(
        [
          [@younger_brother, @friend_one, '1804.25'],
          [@younger_brother, @friend_two, '247.50'],
          [@organiser, @friend_two, '82.75']
        ],
        settlements
      )
    end

    test 'direct mode preserves the verified payer relationships' do
      settlements = PairwiseSettlementCalculator.new(@group).call

      assert_settlements(
        [
          [@younger_brother, @friend_one, '1166.75'],
          [@younger_brother, @friend_two, '885.00'],
          [@friend_two, @friend_one, '415.75'],
          [@organiser, @friend_one, '221.75'],
          [@friend_two, @organiser, '139.00']
        ],
        settlements
      )
    end

    private

    def add_verified_expenses
      add_equal_expense('Shell', '228.00', @friend_one)
      add_equal_expense('BF', '540.00', @friend_one)
      add_equal_expense('Entry toll fee', '50.00', @friend_one)
      add_equal_expense('Room', '3267.00', @friend_one)
      add_equal_expense('Park', '210.00', @friend_one)
      add_equal_expense('Water bottle', '32.00', @friend_one)
      create_expense(
        group: @group,
        paid_by: @friend_one,
        amount: '30.00',
        description: 'Campa',
        splits: { @organiser => '30.00' }
      )
      create_expense(
        group: @group,
        paid_by: @friend_two,
        amount: '2561.00',
        description: 'Lunch',
        splits: {
          @organiser => '678.00',
          @younger_brother => '677.00',
          @friend_two => '603.00',
          @friend_one => '603.00'
        }
      )
      create_expense(
        group: @group,
        paid_by: @organiser,
        amount: '50.00',
        description: 'Key chain',
        splits: { @friend_two => '50.00' },
        date: Date.new(2026, 6, 21)
      )
      add_equal_expense('Paddle boat', '340.00', @friend_one, date: Date.new(2026, 6, 21))
      create_expense(
        group: @group,
        paid_by: @friend_two,
        amount: '772.00',
        description: 'BF day two',
        splits: {
          @organiser => '208.00',
          @younger_brother => '208.00',
          @friend_two => '208.00',
          @friend_one => '148.00'
        },
        date: Date.new(2026, 6, 21)
      )
      create_expense(
        group: @group,
        paid_by: @organiser,
        amount: '3900.00',
        description: 'Diesel',
        splits: {
          @organiser => '975.00',
          @friend_one => '975.00',
          @younger_brother => '975.00',
          @friend_two => '975.00'
        },
        date: Date.new(2026, 6, 22)
      )
    end

    def add_equal_expense(description, amount, payer, date: Date.new(2026, 6, 20))
      share = (BigDecimal(amount) / 4).round(2)
      create_expense(
        group: @group,
        paid_by: payer,
        amount: amount,
        description: description,
        splits: {
          @organiser => share,
          @friend_one => share,
          @younger_brother => share,
          @friend_two => share
        },
        date: date
      )
    end
  end
end
