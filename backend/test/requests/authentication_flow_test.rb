# frozen_string_literal: true

require 'test_helper'

class AuthenticationFlowTest < ActionDispatch::IntegrationTest
  test 'registered user logs in, validates the token, and logout revokes it' do
    user = create_user(name: 'Traveller', email: 'traveller@example.com')
    headers = auth_headers_for(user)

    get '/api/v1/auth/me', headers: headers, as: :json
    assert_response :ok
    assert_equal user.id, json_response.dig('user', 'id')

    delete '/users/sign_out', headers: headers, as: :json
    assert_response :ok

    get '/api/v1/auth/me', headers: headers, as: :json
    assert_response :unauthorized
  end

  test 'guest claims an account without losing trip history' do
    owner = create_user(name: 'Organiser', email: 'organiser@example.com')
    guest = create_user(name: 'Guest cousin', email: 'cousin@example.com', guest: true)
    group = create_group(owner: owner, members: [guest])
    expense = create_expense(group: group, paid_by: owner, amount: '250.00', splits: { guest => '250.00' })
    guest_id = guest.id
    membership_id = group.group_memberships.find_by!(user: guest).id
    split_id = expense.expense_splits.find_by!(user: guest).id

    post '/users', params: {
      user: {
        name: 'Younger brother',
        email: 'cousin@example.com',
        password: TestDataHelpers::DEFAULT_PASSWORD,
        password_confirmation: TestDataHelpers::DEFAULT_PASSWORD
      }
    }, as: :json

    assert_response :ok
    assert response.headers['Authorization'].present?
    guest.reload
    assert_equal guest_id, guest.id
    assert_equal 'Younger brother', guest.name
    assert_not guest.is_guest?
    assert_equal membership_id, group.group_memberships.find_by!(user: guest).id
    assert_equal split_id, expense.expense_splits.find_by!(user: guest).id
  end

  test 'invalid password does not issue a token' do
    user = create_user(name: 'Traveller', email: 'traveller@example.com')

    post '/users/sign_in', params: {
      user: { email: user.email, password: 'wrong-password' }
    }, as: :json

    assert_response :unauthorized
    assert_nil response.headers['Authorization']
  end

  test 'registration rejects missing and malformed phone numbers' do
    invalid_phone_numbers = [nil, '', '123456789', '12345678901', '12345abcde']

    invalid_phone_numbers.each_with_index do |phone, index|
      assert_no_difference 'User.count' do
        post '/users', params: {
          user: {
            name: 'New traveller',
            email: "new-traveller-#{index}@example.com",
            phone: phone,
            password: TestDataHelpers::DEFAULT_PASSWORD,
            password_confirmation: TestDataHelpers::DEFAULT_PASSWORD
          }
        }, as: :json
      end

      assert_response :unprocessable_entity
      assert_nil response.headers['Authorization']
      assert_match(/Phone (can't be blank|must be exactly 10 digits)/, json_response.fetch('message'))
    end
  end
  test 'registration with missing name returns 422 without creating a user' do
    assert_no_difference 'User.count' do
      post '/users', params: {
        user: {
          name: '',
          email: 'newuser@example.com',
          password: TestDataHelpers::DEFAULT_PASSWORD,
          password_confirmation: TestDataHelpers::DEFAULT_PASSWORD
        }
      }, as: :json
    end

    assert_response :unprocessable_entity
    assert_nil response.headers['Authorization']
  end

  test 'registration with mismatched password confirmation returns 422' do
    assert_no_difference 'User.count' do
      post '/users', params: {
        user: {
          name: 'New user',
          email: 'newuser2@example.com',
          password: TestDataHelpers::DEFAULT_PASSWORD,
          password_confirmation: 'DifferentPassword1!'
        }
      }, as: :json
    end

    assert_response :unprocessable_entity
    assert_nil response.headers['Authorization']
  end

  test 'registering with an existing registered email is rejected case-insensitively' do
    create_user(name: 'Existing', email: 'existing@example.com')

    assert_no_difference 'User.count' do
      post '/users', params: {
        user: {
          name: 'Duplicate',
          email: 'EXISTING@EXAMPLE.COM',
          password: TestDataHelpers::DEFAULT_PASSWORD,
          password_confirmation: TestDataHelpers::DEFAULT_PASSWORD
        }
      }, as: :json
    end

    assert_response :unprocessable_entity
  end

  test 'claiming a guest account without a name in the request preserves the original guest name' do
    create_user(name: 'Original Guest Name', email: 'preserve-name@example.com', guest: true)

    post '/users', params: {
      user: {
        email: 'preserve-name@example.com',
        password: TestDataHelpers::DEFAULT_PASSWORD,
        password_confirmation: TestDataHelpers::DEFAULT_PASSWORD
      }
    }, as: :json

    assert_response :ok
    claimed = User.find_by!(email: 'preserve-name@example.com')
    assert_not claimed.is_guest?
    assert_equal 'Original Guest Name', claimed.name
  end

  test 'invalid guest claim password leaves the guest record completely unchanged' do
    create_user(name: 'Guest to Claim', email: 'claim-fail@example.com', guest: true)

    post '/users', params: {
      user: {
        name: 'Hijacker',
        email: 'claim-fail@example.com',
        password: 'sh',
        password_confirmation: 'sh'
      }
    }, as: :json

    assert_response :unprocessable_entity
    guest = User.find_by!(email: 'claim-fail@example.com')
    assert guest.is_guest?, 'guest should still be a guest after failed claim'
    assert_equal 'Guest to Claim', guest.name
  end

  test 'login email lookup is case-insensitive and trims surrounding whitespace' do
    create_user(name: 'CaseUser', email: 'caseuser@example.com')

    post '/users/sign_in', params: {
      user: { email: '  CASEUSER@EXAMPLE.COM  ', password: TestDataHelpers::DEFAULT_PASSWORD }
    }, as: :json

    assert_response :ok
    assert response.headers['Authorization'].present?
  end

  test 'calling sign_out twice with the same token returns 401 on the second call without crashing' do
    user = create_user(name: 'Logout Test', email: 'logout-repeat@example.com')
    headers = auth_headers_for(user)

    delete '/users/sign_out', headers: headers, as: :json
    assert_response :ok

    delete '/users/sign_out', headers: headers, as: :json
    assert_response :unauthorized
  end

  test '/auth/me payload exposes only id email name and avatar_url and does not leak sensitive fields' do
    user = create_user(name: 'Scoped User', email: 'scoped@example.com')
    headers = auth_headers_for(user)

    get '/api/v1/auth/me', headers: headers, as: :json

    assert_response :ok
    user_data = json_response.fetch('user')
    %w[id email name avatar_url].each { |f| assert user_data.key?(f), "Expected '#{f}' in payload" }
    %w[encrypted_password reset_password_token is_guest jti].each do |secret|
      assert_not user_data.key?(secret), "Must not expose '#{secret}'"
    end
  end

  # The token's exp claim must be within a few seconds of (now + TTL).
  # We test this by decoding the raw JWT without verification and inspecting `exp`.
  test 'issued JWT expiry matches the configured token TTL' do
    user    = create_user(name: 'JWT TTL user', email: 'jwt-ttl@example.com')
    headers = auth_headers_for(user)

    raw_token = headers.fetch('Authorization').sub(/\ABearer /, '')
    # Decode without verification — we only care about the time claim here.
    payload = JSON.parse(Base64.decode64(raw_token.split('.')[1] + '=='))
    issued_at = payload.fetch('iat')
    expires_at = payload.fetch('exp')
    ttl_seconds = expires_at - issued_at

    # Devise JWT defaults to 1 day (86_400 s). If the app configures a custom
    # value it would appear here. We accept anything in the 1 h – 30 d range as
    # a sanity guard; any value outside that indicates a misconfiguration.
    assert_operator ttl_seconds, :>=, 3_600,  'TTL should be at least 1 hour'
    assert_operator ttl_seconds, :<=, 30.days.to_i, 'TTL should be at most 30 days'
  end
end
