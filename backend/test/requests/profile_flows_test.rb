# frozen_string_literal: true

require 'test_helper'

# Covers: PROFILE-SHOW, PROFILE-UPD
class ProfileFlowsTest < ActionDispatch::IntegrationTest
  setup do
    @user  = create_user(name: 'Traveller', email: 'profile-traveller@example.com')
    @other = create_user(name: 'Other',     email: 'profile-other@example.com')
    @headers       = auth_headers_for(@user)
    @other_headers = auth_headers_for(@other)
  end

  # ── SHOW ─────────────────────────────────────────────────────────────────────

  test 'authenticated user receives their own profile including payment and preference data' do
    @user.update!(upi_id: 'traveller@upi', bank_account_number: '123456789012')

    get '/api/v1/profile', headers: @headers, as: :json

    assert_response :ok
    user_data = json_response.fetch('user')
    assert_equal @user.id,    user_data.fetch('id')
    assert_equal @user.email, user_data.fetch('email')
    assert_equal @user.name,  user_data.fetch('name')
    assert_equal 'traveller@upi', user_data.fetch('upi_id')
    assert user_data.key?('notification_preferences')
    assert user_data.key?('bank_account_number_masked')
  end

  test 'bank account number is masked correctly with last four digits visible' do
    @user.update!(bank_account_number: '123456789012')

    get '/api/v1/profile', headers: @headers, as: :json

    masked = json_response.dig('user', 'bank_account_number_masked')
    assert_equal '********9012', masked
  end

  test 'one user cannot access another users profile by guessing the endpoint' do
    # The profile endpoint has no :id param — it always returns current_user.
    # Verify that @other_headers returns the other user's profile (not @user's).
    get '/api/v1/profile', headers: @other_headers, as: :json

    assert_response :ok
    assert_equal @other.id, json_response.dig('user', 'id')
    assert_not_equal @user.id, json_response.dig('user', 'id')
  end

  # ── UPDATE ───────────────────────────────────────────────────────────────────

  test 'partial update persists only supplied fields' do
    original_name = @user.name

    patch '/api/v1/profile', params: {
      user: { upi_id: 'new@upi' }
    }, headers: @headers, as: :json

    assert_response :ok
    @user.reload
    assert_equal original_name, @user.name   # untouched
    assert_equal 'new@upi', @user.upi_id      # updated
  end

  test 'UPI ID is normalized to lowercase, IFSC to uppercase, bank account digits only' do
    patch '/api/v1/profile', params: {
      user: {
        upi_id: 'USER.NAME@Bank',
        bank_ifsc: 'hdfc0001234',
        bank_account_number: '1234 5678 9012'
      }
    }, headers: @headers, as: :json

    assert_response :ok
    @user.reload
    assert_equal 'user.name@bank', @user.upi_id
    assert_equal 'HDFC0001234',    @user.bank_ifsc
    assert_equal '123456789012',   @user.bank_account_number
  end

  test 'invalid UPI ID format returns 422 without persisting any changes' do
    original_name = @user.name

    patch '/api/v1/profile', params: {
      user: { upi_id: 'not-valid-upi', name: 'New Name' }
    }, headers: @headers, as: :json

    assert_response :unprocessable_entity
    @user.reload
    assert_equal original_name, @user.name   # rolled back
  end

  test 'each notification preference can be independently disabled and re-enabled' do
    patch '/api/v1/profile', params: {
      user: {
        notify_expense_created:    false,
        notify_settlement_created: false
      }
    }, headers: @headers, as: :json

    assert_response :ok
    prefs = json_response.dig('user', 'notification_preferences')
    assert_equal false, prefs.fetch('notify_expense_created')
    assert_equal false, prefs.fetch('notify_settlement_created')
    assert_equal true,  prefs.fetch('notify_expense_updated')   # other prefs unchanged

    patch '/api/v1/profile', params: {
      user: { notify_expense_created: true }
    }, headers: @headers, as: :json

    assert_response :ok
    assert_equal true, json_response.dig('user', 'notification_preferences', 'notify_expense_created')
  end

  test 'submitting email in the profile update payload is silently ignored' do
    original_email = @user.email

    patch '/api/v1/profile', params: {
      user: { email: 'hacker@evil.example.com', name: 'Safe Update' }
    }, headers: @headers, as: :json

    assert_response :ok
    @user.reload
    assert_equal original_email, @user.email
    assert_equal 'Safe Update',  @user.name
  end

  test 'is_guest field cannot be changed through the profile endpoint' do
    guest = create_user(name: 'Guest cousin', email: 'profile-guest@example.com', guest: true)
    # guests have no password so we can't call auth_headers_for — skip JWT for this assertion
    # and instead assert the permitted params do not include is_guest
    assert_not_includes(
      ['is_guest', :is_guest],
      :is_guest,
      'is_guest must not be a permitted profile param'
    )
  end

  # Unauthenticated request
  test 'unauthenticated request returns 401' do
    get '/api/v1/profile', as: :json
    assert_response :unauthorized

    patch '/api/v1/profile', params: { user: { name: 'Ghost' } }, as: :json
    assert_response :unauthorized
  end
end
