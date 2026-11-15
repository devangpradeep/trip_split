# frozen_string_literal: true

require 'test_helper'

class ExpenseCategoryFlowsTest < ActionDispatch::IntegrationTest
  setup do
    @owner = User.create!(name: 'Trip owner', email: 'owner@example.com', phone: '9876543210',
                          password: TestDataHelpers::DEFAULT_PASSWORD)
    @group = create_group(owner: @owner)
    @headers = auth_headers_for(@owner)
    @expenses_path = "/api/v1/groups/#{@group.id}/expenses"
  end

  test 'suggestions use whole words and leave ambiguous descriptions uncategorized' do
    examples = {
      'DIESEL at Shell' => 'fuel',
      'Dinner at the café' => 'food_and_drink',
      'Train tickets' => 'transport',
      'Museum tickets' => 'activities',
      'Guest-house booking' => 'accommodation',
      'Tickets' => nil,
      'Dieselgate' => nil,
      'Fuel and parking' => nil
    }

    assert_no_difference 'Expense.count' do
      examples.each do |description, category|
        post "#{@expenses_path}/category_suggestion", params: { description: description }, headers: @headers, as: :json
        assert_response :ok
        assert_equal({ 'category' => category }, json_response, description)
      end
    end
  end

  test 'create assigns a suggestion if the client omits the category' do
    post @expenses_path, params: { expense: expense_attributes }, headers: @headers, as: :json

    assert_response :created
    assert_equal 'fuel', json_response.fetch('category')
    assert_equal 'fuel', Expense.find(json_response.fetch('id')).category
  end

  test 'create accepts an explicit category and an explicit uncategorized choice' do
    post @expenses_path, params: { expense: expense_attributes.merge(category: 'transport') },
                         headers: @headers, as: :json
    assert_response :created
    assert_equal 'transport', json_response.fetch('category')

    post @expenses_path, params: { expense: expense_attributes.merge(category: '') }, headers: @headers
    assert_response :created
    assert_nil json_response.fetch('category')
  end

  test 'edit preserves a stored category when omitted and allows changing or clearing it' do
    expense = create_expense(group: @group, paid_by: @owner, amount: '50', splits: [[@owner, '50']],
                             category: 'legacy-category')
    path = "#{@expenses_path}/#{expense.id}"

    patch path, params: { expense: expense_attributes }, headers: @headers, as: :json
    assert_response :ok
    assert_equal 'legacy-category', json_response.fetch('category')

    patch path, params: { expense: expense_attributes.merge(category: 'fuel') }, headers: @headers, as: :json
    assert_response :ok
    assert_equal 'fuel', json_response.fetch('category')

    patch path, params: { expense: expense_attributes.merge(category: nil) }, headers: @headers, as: :json
    assert_response :ok
    assert_nil expense.reload.category
  end

  private

  def expense_attributes
    { description: 'Diesel', amount: '50.00', currency: 'INR', split_type: 'equal', date: '2026-06-20' }
  end
end
