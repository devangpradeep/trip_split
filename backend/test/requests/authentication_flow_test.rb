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
end
