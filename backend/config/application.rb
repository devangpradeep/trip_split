# frozen_string_literal: true

require_relative 'boot'

require 'rails'
# Pick the frameworks you want:
require 'active_model/railtie'
require 'active_job/railtie'
require 'active_record/railtie'
require 'active_storage/engine'
require 'action_controller/railtie'
require 'action_mailer/railtie'
require 'action_mailbox/engine'
require 'action_text/engine'
require 'action_view/railtie'
require 'action_cable/engine'
# require "rails/test_unit/railtie"

# Require the gems listed in Gemfile, including any gems
# you've limited to :test, :development, or :production.
Bundler.require(*Rails.groups)

module Backend
  class Application < Rails::Application
    # Initialize configuration defaults for originally generated Rails version.
    config.load_defaults 8.1

    # Configuration for the application, engines, and railties goes here.
    #
    # These settings can be overridden in specific environments using the files
    # in config/environments, which are processed later.
    #
    # config.time_zone = "Central Time (US & Canada)"
    # config.eager_load_paths << Rails.root.join("extras")

    # Only loads a smaller set of middleware suitable for API only apps.
    # Middleware like session, flash, cookies can be added back manually.
    # Skip views, helpers and assets when generating a new resource.
    config.api_only = true

    active_record_encryption_keys = {
      primary_key: ENV.fetch('ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY', nil),
      deterministic_key: ENV.fetch('ACTIVE_RECORD_ENCRYPTION_DETERMINISTIC_KEY', nil),
      key_derivation_salt: ENV.fetch('ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT', nil)
    }

    if active_record_encryption_keys.values.any?(&:present?)
      missing_keys = active_record_encryption_keys.select { |_key, value| value.blank? }.keys
      raise KeyError, "Missing Active Record encryption keys: #{missing_keys.join(', ')}" if missing_keys.any?

      config.active_record.encryption.primary_key = active_record_encryption_keys[:primary_key]
      config.active_record.encryption.deterministic_key = active_record_encryption_keys[:deterministic_key]
      config.active_record.encryption.key_derivation_salt = active_record_encryption_keys[:key_derivation_salt]
    end

    # Required for Devise in API only mode
    config.session_store :cookie_store, key: '_tripsplit_session'
    config.middleware.use ActionDispatch::Cookies
    config.middleware.use config.session_store, config.session_options
  end
end
