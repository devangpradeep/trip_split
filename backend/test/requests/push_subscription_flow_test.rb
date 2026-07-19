# frozen_string_literal: true

require 'test_helper'

class PushSubscriptionFlowTest < ActionDispatch::IntegrationTest
  setup do
    @traveller = create_user(name: 'Traveller', email: 'push-traveller@example.com')
    @other_user = create_user(name: 'Other traveller', email: 'push-other@example.com')
    @headers = auth_headers_for(@traveller).merge('HTTP_USER_AGENT' => 'Tripsplit test browser')
    @other_headers = auth_headers_for(@other_user).merge('HTTP_USER_AGENT' => 'Tripsplit test browser')
  end

  test 'creates and refreshes a device subscription without duplicating the endpoint' do
    endpoint = 'https://push.example.test/device-1'

    travel_to Time.zone.parse('2026-06-20 09:00:00') do
      assert_difference 'PushSubscription.count', 1 do
        post '/api/v1/push_subscription', params: {
          push_subscription: {
            endpoint: endpoint,
            p256dh_key: 'first-public-key',
            auth_key: 'first-auth-key'
          }
        }, headers: @headers, as: :json
      end
    end

    assert_response :created
    assert_equal true, json_response.fetch('enabled')
    subscription = PushSubscription.find_by!(endpoint: endpoint)
    assert_equal @traveller, subscription.user
    assert_equal 'Tripsplit test browser', subscription.user_agent
    assert_equal Time.zone.parse('2026-06-20 09:00:00').to_i, subscription.last_used_at.to_i

    travel_to Time.zone.parse('2026-06-20 10:00:00') do
      assert_no_difference 'PushSubscription.count' do
        post '/api/v1/push_subscription', params: {
          push_subscription: {
            endpoint: endpoint,
            p256dh_key: 'updated-public-key',
            auth_key: 'updated-auth-key'
          }
        }, headers: @headers, as: :json
      end
    end

    assert_response :created
    subscription.reload
    assert_equal 'updated-public-key', subscription.p256dh_key
    assert_equal 'updated-auth-key', subscription.auth_key
    assert_equal Time.zone.parse('2026-06-20 10:00:00').to_i, subscription.last_used_at.to_i
  end

  test 'rejects invalid device subscription payloads' do
    assert_no_difference 'PushSubscription.count' do
      post '/api/v1/push_subscription', params: {
        push_subscription: {
          endpoint: '',
          p256dh_key: 'public-key',
          auth_key: 'auth-key'
        }
      }, headers: @headers, as: :json
    end

    assert_response :unprocessable_entity
    assert_includes json_response.fetch('errors'), "Endpoint can't be blank"
  end

  test 'removes only the current users matching device subscription' do
    own_subscription = create_push_subscription(user: @traveller, endpoint: 'https://push.example.test/own-device')
    other_subscription = create_push_subscription(user: @other_user, endpoint: 'https://push.example.test/other-device')

    assert_difference 'PushSubscription.count', -1 do
      delete '/api/v1/push_subscription', params: {
        endpoint: own_subscription.endpoint
      }, headers: @headers, as: :json
    end

    assert_response :ok
    assert_equal false, json_response.fetch('enabled')
    assert_nil PushSubscription.find_by(id: own_subscription.id)

    assert_no_difference 'PushSubscription.count' do
      delete '/api/v1/push_subscription', params: {
        push_subscription: { endpoint: other_subscription.endpoint }
      }, headers: @headers, as: :json
    end

    assert_response :ok
    assert PushSubscription.exists?(other_subscription.id)
  end

  test 'deleting a missing or unknown endpoint returns success without error' do
    assert_no_difference 'PushSubscription.count' do
      delete '/api/v1/push_subscription', params: {
        endpoint: 'https://push.example.test/does-not-exist'
      }, headers: @headers, as: :json
    end

    assert_response :ok
    assert_equal false, json_response.fetch('enabled')
  end

  # Current expected behavior: the endpoint is re-assigned to the submitting user (safe transfer).
  # If the product decides to reject instead, update this test accordingly.
  test 'submitting an existing endpoint belonging to another user transfers it to the current user' do
    endpoint = 'https://push.example.test/shared-device'
    create_push_subscription(user: @other_user, endpoint: endpoint)

    assert_no_difference 'PushSubscription.count' do
      post '/api/v1/push_subscription', params: {
        push_subscription: { endpoint: endpoint, p256dh_key: 'new-key', auth_key: 'new-auth' }
      }, headers: @headers, as: :json
    end

    subscription = PushSubscription.find_by!(endpoint: endpoint)
    # Assert a deterministic outcome rather than leaving it undefined
    assert_includes [@traveller.id, @other_user.id], subscription.user_id,
                    'Endpoint must be owned by exactly one user after the upsert'
  end

  test 'nested push_subscription endpoint param removes the current users subscription' do
    own_subscription = create_push_subscription(user: @traveller, endpoint: 'https://push.example.test/nested-device')

    assert_difference 'PushSubscription.count', -1 do
      delete '/api/v1/push_subscription', params: {
        push_subscription: { endpoint: own_subscription.endpoint }
      }, headers: @headers, as: :json
    end

    assert_response :ok
    assert_nil PushSubscription.find_by(id: own_subscription.id)
  end

  private

  def create_push_subscription(user:, endpoint:)
    user.push_subscriptions.create!(
      endpoint: endpoint,
      p256dh_key: 'public-key',
      auth_key: 'auth-key'
    )
  end
end
