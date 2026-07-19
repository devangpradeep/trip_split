# frozen_string_literal: true

require 'test_helper'

class NotificationProducingFlowsTest < ActionDispatch::IntegrationTest
  setup do
    @owner = create_user(name: 'Trip organiser', email: 'flow-owner@example.com')
    @traveller = create_user(name: 'Traveller', email: 'flow-traveller@example.com')
    @quiet_traveller = create_user(name: 'Quiet traveller', email: 'flow-quiet@example.com')
    @guest = create_user(name: 'Younger sibling', email: 'flow-younger-sibling@example.com', guest: true)
    @group = create_group(
      owner: @owner,
      name: 'Weekend hill trip',
      members: [@traveller, @quiet_traveller, @guest]
    )
    @owner_headers = auth_headers_for(@owner)
    @traveller_headers = auth_headers_for(@traveller)
  end

  test 'expense creation notifies eligible participants except the actor' do
    @quiet_traveller.update!(notify_expense_created: false)

    without_push_delivery do
      assert_difference 'Notification.count', 1 do
        post "/api/v1/groups/#{@group.id}/expenses", params: {
          expense: {
            description: 'Shared snacks',
            amount: '90.00',
            currency: 'INR',
            split_type: 'equal',
            date: '2026-06-20',
            paid_by_id: @owner.id,
            splits: [
              { user_id: @owner.id },
              { user_id: @traveller.id },
              { user_id: @quiet_traveller.id }
            ]
          }
        }, headers: @owner_headers, as: :json
      end
    end

    assert_response :created
    expense = Expense.find(json_response.fetch('id'))
    notification = assert_single_notification_for(@traveller, 'expense_created')
    assert_equal @owner, notification.actor
    assert_equal @group, notification.group
    assert_equal expense, notification.notifiable
    assert_equal "New expense in #{@group.name}", notification.title
    assert_includes notification.body, 'Shared snacks'
    assert_no_notification_for(@owner, 'expense_created')
    assert_no_notification_for(@quiet_traveller, 'expense_created')
  end

  test 'expense update notifies current eligible participants except the actor' do
    @quiet_traveller.update!(notify_expense_updated: false)
    expense = create_expense(
      group: @group,
      paid_by: @owner,
      amount: '90.00',
      splits: { @owner => '30.00', @traveller => '30.00', @quiet_traveller => '30.00' },
      description: 'Shared snacks'
    )

    without_push_delivery do
      assert_difference 'Notification.count', 1 do
        patch "/api/v1/groups/#{@group.id}/expenses/#{expense.id}", params: {
          expense: {
            description: 'Updated shared snacks',
            amount: '120.00',
            currency: 'INR',
            split_type: 'exact',
            date: '2026-06-20',
            splits: [
              { user_id: @owner.id, amount: '40.00' },
              { user_id: @traveller.id, amount: '40.00' },
              { user_id: @quiet_traveller.id, amount: '40.00' }
            ]
          }
        }, headers: @owner_headers, as: :json
      end
    end

    assert_response :ok
    notification = assert_single_notification_for(@traveller, 'expense_updated')
    assert_equal expense, notification.notifiable
    assert_equal "Expense updated in #{@group.name}", notification.title
    assert_includes notification.body, 'Updated shared snacks'
    assert_no_notification_for(@owner, 'expense_updated')
    assert_no_notification_for(@quiet_traveller, 'expense_updated')
  end

  test 'expense deletion notifies eligible participants captured before deletion' do
    @quiet_traveller.update!(notify_expense_deleted: false)
    expense = create_expense(
      group: @group,
      paid_by: @owner,
      amount: '90.00',
      splits: { @owner => '30.00', @traveller => '30.00', @quiet_traveller => '30.00' },
      description: 'Shared snacks'
    )

    without_push_delivery do
      assert_difference 'Notification.count', 1 do
        assert_difference 'Expense.count', -1 do
          delete "/api/v1/groups/#{@group.id}/expenses/#{expense.id}", headers: @owner_headers, as: :json
        end
      end
    end

    assert_response :no_content
    notification = assert_single_notification_for(@traveller, 'expense_deleted')
    assert_nil notification.notifiable
    assert_equal "Expense deleted in #{@group.name}", notification.title
    assert_includes notification.body, 'Shared snacks'
    assert_no_notification_for(@owner, 'expense_deleted')
    assert_no_notification_for(@quiet_traveller, 'expense_deleted')
  end

  test 'registered settlement creation notifies the recipient' do
    create_expense(
      group: @group,
      paid_by: @owner,
      amount: '100.00',
      splits: { @traveller => '100.00' },
      description: 'Room advance'
    )

    without_push_delivery do
      assert_difference({ 'Settlement.count' => 1, 'Notification.count' => 1 }) do
        post "/api/v1/groups/#{@group.id}/settlements", params: {
          settlement: {
            to_user_id: @owner.id,
            amount: '40.00',
            date: '2026-06-21',
            note: 'Partial payment'
          }
        }, headers: @traveller_headers, as: :json
      end
    end

    assert_response :created
    settlement = Settlement.find(json_response.fetch('id'))
    notification = assert_single_notification_for(@owner, 'settlement_created')
    assert_equal @traveller, notification.actor
    assert_equal @group, notification.group
    assert_equal settlement, notification.notifiable
    assert_equal "Settlement recorded in #{@group.name}", notification.title
    assert_includes notification.body, 'INR 40.00'
    assert_no_notification_for(@traveller, 'settlement_created')
  end

  test 'guest proxy settlement records payment without guest-authored notification' do
    create_expense(
      group: @group,
      paid_by: @owner,
      amount: '50.00',
      splits: { @guest => '50.00' },
      description: 'Guest share'
    )

    without_push_delivery do
      assert_difference 'Settlement.count', 1 do
        assert_no_difference 'Notification.count' do
          post "/api/v1/groups/#{@group.id}/settlements", params: {
            settlement: {
              from_user_id: @guest.id,
              to_user_id: @owner.id,
              amount: '50.00',
              date: '2026-06-21',
              note: 'Settled by organiser'
            }
          }, headers: @owner_headers, as: :json
        end
      end
    end

    assert_response :created
  end

  test 'settlement deletion notifies the other party except the actor' do
    settlement = create_settlement(group: @group, from: @traveller, to: @owner, amount: '25.00')

    without_push_delivery do
      assert_difference 'Notification.count', 1 do
        assert_difference 'Settlement.count', -1 do
          delete "/api/v1/groups/#{@group.id}/settlements/#{settlement.id}", headers: @owner_headers, as: :json
        end
      end
    end

    assert_response :no_content
    notification = assert_single_notification_for(@traveller, 'settlement_deleted')
    assert_equal @owner, notification.actor
    assert_equal @group, notification.group
    assert_nil notification.notifiable
    assert_equal "Settlement deleted in #{@group.name}", notification.title
    assert_includes notification.body, 'INR 25.00'
    assert_no_notification_for(@owner, 'settlement_deleted')
  end

  test 'adding a registered member notifies the added member' do
    new_member = create_user(name: 'New traveller', email: 'flow-new-traveller@example.com')

    without_push_delivery do
      assert_difference({ 'GroupMembership.count' => 1, 'Notification.count' => 1 }) do
        post "/api/v1/groups/#{@group.id}/members", params: {
          member: { email: new_member.email }
        }, headers: @owner_headers, as: :json
      end
    end

    assert_response :created
    notification = assert_single_notification_for(new_member, 'group_member_added')
    assert_equal @owner, notification.actor
    assert_equal @group, notification.group
    assert_equal @group, notification.notifiable
    assert_equal "Added to #{@group.name}", notification.title
    assert_includes notification.body, 'added you to the group'
    assert_no_notification_for(@owner, 'group_member_added')
  end

  test 'adding a guest member does not create a notification' do
    without_push_delivery do
      assert_difference({ 'User.count' => 1, 'GroupMembership.count' => 1 }) do
        assert_no_difference 'Notification.count' do
          post "/api/v1/groups/#{@group.id}/members", params: {
            member: {
              name: 'Younger sibling',
              email: 'flow-new-younger-sibling@example.com'
            }
          }, headers: @owner_headers, as: :json
        end
      end
    end

    assert_response :created
    assert_equal true, json_response.dig('member', 'is_guest')
  end

  test 'payer who is excluded from the expense splits still receives a notification' do
    # @owner is payer but is intentionally not in the splits list
    without_push_delivery do
      assert_difference 'Notification.count', 1 do
        post "/api/v1/groups/#{@group.id}/expenses", params: {
          expense: {
            description: 'Payer excluded from split',
            amount: '60.00',
            currency: 'INR',
            split_type: 'exact',
            date: '2026-06-20',
            paid_by_id: @owner.id,
            splits: [{ user_id: @traveller.id, amount: '60.00' }]
          }
        }, headers: @traveller_headers, as: :json
      end
    end

    assert_response :created
    # Traveller created the expense so is the actor — owner should be notified (is payer)
    assert_single_notification_for(@owner, 'expense_created')
    assert_no_notification_for(@traveller, 'expense_created')
  end

  # notify_settlement_created preference respected for recipient
  test 'settlement recipient who disabled the preference does not get a notification' do
    @owner.update!(notify_settlement_created: false)
    create_expense(group: @group, paid_by: @owner, amount: '80.00',
                   splits: { @traveller => '80.00' })

    without_push_delivery do
      assert_no_difference 'Notification.count' do
        post "/api/v1/groups/#{@group.id}/settlements", params: {
          settlement: { to_user_id: @owner.id, amount: '80.00' }
        }, headers: @traveller_headers, as: :json
      end
    end

    assert_response :created
  end

  private

  def without_push_delivery(&)
    PushNotifications::Sender.stub(:call, nil, &)
  end

  def assert_single_notification_for(user, event_type)
    notifications = user.notifications.where(event_type: event_type).to_a
    assert_equal 1, notifications.size
    notifications.first
  end

  def assert_no_notification_for(user, event_type)
    assert_empty user.notifications.where(event_type: event_type).to_a
  end
end
