# frozen_string_literal: true

module ApiTestHelpers
  def auth_headers_for(user, password: TestDataHelpers::DEFAULT_PASSWORD)
    post '/users/sign_in', params: {
      user: { email: user.email, password: password }
    }, as: :json

    assert_response :ok
    token = response.headers['Authorization']
    assert token.present?, 'Expected login response to include an Authorization header'

    { 'Authorization' => token }
  end

  def json_response
    JSON.parse(response.body)
  end
end
