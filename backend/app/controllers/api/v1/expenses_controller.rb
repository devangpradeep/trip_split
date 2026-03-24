# frozen_string_literal: true

module Api
  module V1
    class ExpensesController < ApplicationController
      class SplitValidationError < StandardError; end

      before_action :authenticate_user!
      before_action :set_group
      before_action :set_expense, only: %i[show update destroy]
      before_action :ensure_can_edit_expense!, only: %i[update]
      before_action :ensure_can_delete_expense!, only: %i[destroy]

      def index
        @expenses = @group.expenses.includes(:paid_by, expense_splits: :user).order(date: :desc)
        render json: @expenses, include: {
          paid_by: { only: %i[id name avatar_url] },
          expense_splits: { include: { user: { only: %i[id name avatar_url] } } }
        }
      end

      def create
        @expense = @group.expenses.build(expense_params)
        @expense.split_type = normalized_split_type
        @expense.paid_by ||= current_user

        begin
          ActiveRecord::Base.transaction do
            @expense.save!
            replace_splits!(@expense)
          end
          render_expense(@expense, :created)
        rescue SplitValidationError => e
          render json: { errors: [e.message] }, status: :unprocessable_entity
        rescue ActiveRecord::RecordInvalid
          render json: { errors: @expense.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def show
        render_expense(@expense)
      end

      def update
        @expense.assign_attributes(expense_params)
        @expense.split_type = normalized_split_type

        begin
          ActiveRecord::Base.transaction do
            @expense.save!
            replace_splits!(@expense)
          end
          render_expense(@expense)
        rescue SplitValidationError => e
          render json: { errors: [e.message] }, status: :unprocessable_entity
        rescue ActiveRecord::RecordInvalid
          render json: { errors: @expense.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def destroy
        @expense.destroy
        head :no_content
      end

      private

      def set_group
        @group = current_user.groups.find(params[:group_id])
      end

      def set_expense
        @expense = @group.expenses.find(params[:id])
      end

      def ensure_can_edit_expense!
        return if @expense.paid_by_id == current_user.id
        return if @group.group_memberships.exists?(user_id: current_user.id, role: 'admin')

        render json: { error: 'Only group admins or the expense payer can edit this expense' }, status: :forbidden
      end

      def ensure_can_delete_expense!
        return if @expense.paid_by_id == current_user.id
        return if @group.group_memberships.exists?(user_id: current_user.id, role: 'admin')

        render json: { error: 'Only group admins or the expense payer can delete this expense' }, status: :forbidden
      end

      def normalized_split_type
        raw = params.dig(:expense, :split_type).to_s
        raw = @expense&.split_type.to_s if raw.blank? && @expense.present?
        raw = 'equal' if raw.blank?
        raw == 'amount' ? 'exact' : raw
      end

      def replace_splits!(expense)
        split_rows = build_split_rows(expense)
        expense.expense_splits.delete_all
        split_rows.each do |row|
          expense.expense_splits.create!(row)
        end
      end

      def build_split_rows(expense)
        split_type = expense.split_type
        total_amount = decimal_value(expense.amount, 'expense amount')
        raise SplitValidationError, 'Expense amount must be greater than zero' if total_amount <= 0

        group_member_ids = @group.members.pluck(:id).map(&:to_s)
        split_params = Array(params.dig(:expense, :splits)).map do |row|
          row.respond_to?(:to_unsafe_h) ? row.to_unsafe_h : row.to_h
        end

        participant_ids =
          if split_params.present?
            split_params.map { |row| row['user_id'] || row[:user_id] }.compact.map(&:to_s).uniq
          else
            group_member_ids
          end

        raise SplitValidationError, 'At least one participant is required' if participant_ids.empty?

        invalid_ids = participant_ids - group_member_ids
        raise SplitValidationError, 'All split participants must belong to the group' if invalid_ids.any?

        case split_type
        when 'equal'
          equal_amounts = equal_split_amounts(total_amount, participant_ids.length)
          participant_ids.each_with_index.map do |user_id, index|
            { user_id: user_id, amount: equal_amounts[index] }
          end
        when 'exact'
          amount_rows = split_params.select { |row| participant_ids.include?((row['user_id'] || row[:user_id]).to_s) }
          if amount_rows.length != participant_ids.length
            raise SplitValidationError,
                  'Exact split amounts are required for all participants'
          end

          amounts_by_user = {}
          amount_rows.each do |row|
            user_id = (row['user_id'] || row[:user_id]).to_s
            amounts_by_user[user_id] = decimal_value(row['amount'] || row[:amount], 'split amount')
          end

          exact_total = amounts_by_user.values.sum
          if (exact_total - total_amount).abs > BigDecimal('0.01')
            raise SplitValidationError, 'Exact split amounts must add up to the expense amount'
          end

          participant_ids.map { |user_id| { user_id: user_id, amount: amounts_by_user[user_id] } }
        when 'percentage'
          percentage_rows = split_params.select do |row|
            participant_ids.include?((row['user_id'] || row[:user_id]).to_s)
          end
          if percentage_rows.length != participant_ids.length
            raise SplitValidationError,
                  'Percentages are required for all participants'
          end

          percentages_by_user = {}
          percentage_rows.each do |row|
            user_id = (row['user_id'] || row[:user_id]).to_s
            percentages_by_user[user_id] = decimal_value(row['percentage'] || row[:percentage], 'split percentage')
          end

          percentage_total = percentages_by_user.values.sum
          if (percentage_total - BigDecimal('100')).abs > BigDecimal('0.01')
            raise SplitValidationError, 'Split percentages must add up to 100'
          end

          split_amounts = participant_ids.map do |user_id|
            (total_amount * percentages_by_user[user_id] / BigDecimal('100')).round(2)
          end

          rounding_diff = total_amount.round(2) - split_amounts.sum
          split_amounts[-1] = (split_amounts[-1] + rounding_diff).round(2)

          participant_ids.each_with_index.map do |user_id, index|
            { user_id: user_id, amount: split_amounts[index] }
          end
        else
          raise SplitValidationError, 'Unsupported split type'
        end
      end

      def equal_split_amounts(total_amount, participant_count)
        total_cents = (total_amount * 100).round(0).to_i
        base_cents = total_cents / participant_count
        remainder_cents = total_cents % participant_count

        Array.new(participant_count).each_with_index.map do |_item, index|
          cents = base_cents + (index < remainder_cents ? 1 : 0)
          BigDecimal(cents.to_s) / 100
        end
      end

      def decimal_value(raw_value, field_name)
        value = BigDecimal(raw_value.to_s)
        raise SplitValidationError, "#{field_name} cannot be negative" if value.negative?

        value
      rescue ArgumentError
        raise SplitValidationError, "Invalid #{field_name}"
      end

      def render_expense(expense, status = :ok)
        render json: expense, status: status, include: {
          paid_by: { only: %i[id name avatar_url] },
          expense_splits: { include: { user: { only: %i[id name avatar_url] } } }
        }
      end

      def expense_params
        params.require(:expense).permit(:description, :amount, :currency, :split_type, :date, :category, :paid_by_id)
      end
    end
  end
end
