# frozen_string_literal: true

# Be sure to restart your server when you modify this file.

# Avoid CORS issues when API is called from the frontend app.
# Handle Cross-Origin Resource Sharing (CORS) in order to accept cross-origin AJAX requests.

# Read more: https://github.com/cyu/rack-cors

default_origins = if Rails.env.production?
                    ''
                  else
                    'http://localhost:5173,http://127.0.0.1:5173'
                  end

allowed_origins = ENV.fetch('CORS_ALLOWED_ORIGINS', default_origins)
                     .split(',')
                     .map(&:strip)
                     .reject(&:blank?)

Rails.application.config.middleware.insert_before 0, Rack::Cors do
  next if allowed_origins.empty?

  allow do
    origins(*allowed_origins)

    resource '*',
             headers: :any,
             methods: %i[get post put patch delete options head],
             expose: ['Authorization']
  end
end
