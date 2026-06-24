# frozen_string_literal: true

ENV['RAILS_ENV'] ||= 'test'
require_relative '../config/environment'
require 'rails/test_help'

Dir[Rails.root.join('test/support/**/*.rb')].each { |file| require file }

module ActiveSupport
  class TestCase
    include TestDataHelpers

    parallelize(workers: 1)
  end
end

module ActionDispatch
  class IntegrationTest
    include ApiTestHelpers
  end
end
