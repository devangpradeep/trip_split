# frozen_string_literal: true

require 'test_helper'

module Balances
  class CalculatorTest < ActiveSupport::TestCase
    test 'calculates a realistic shared weekend with different payers and participants' do
      organiser = create_user(name: 'Trip organiser')
      friend = create_user(name: 'Friend')
      younger_brother = create_user(name: 'Younger brother', guest: true)
      colleague = create_user(name: 'Colleague')
      group = create_group(owner: organiser, members: [friend, younger_brother, colleague])

      create_expense(
        group: group,
        paid_by: organiser,
        amount: '1200.00',
        description: 'Dinner',
        splits: { organiser => '300.00', friend => '300.00', younger_brother => '300.00', colleague => '300.00' }
      )
      create_expense(
        group: group,
        paid_by: friend,
        amount: '600.00',
        description: 'Taxi',
        splits: { organiser => '300.00', friend => '300.00' }
      )

      balances = Calculator.new(group).call

      assert_decimal '600.00', balances[organiser.id]
      assert_decimal '0.00', balances[friend.id]
      assert_decimal '-300.00', balances[younger_brother.id]
      assert_decimal '-300.00', balances[colleague.id]
      assert_decimal '0.00', balances.values.sum
    end

    test 'partial payment changes sender and recipient equally without changing group total' do
      payer = create_user(name: 'Payer')
      guest = create_user(name: 'Guest cousin', guest: true)
      group = create_group(owner: payer, members: [guest])
      create_expense(group: group, paid_by: payer, amount: '500.00', splits: { guest => '500.00' })
      create_settlement(group: group, from: guest, to: payer, amount: '175.00')

      balances = Calculator.new(group).call

      assert_decimal '325.00', balances[payer.id]
      assert_decimal '-325.00', balances[guest.id]
      assert_decimal '0.00', balances.values.sum
    end
  end
end
