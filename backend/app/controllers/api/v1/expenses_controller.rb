module Api
  module V1
    class ExpensesController < ApplicationController
      before_action :authenticate_user!
      before_action :set_group
      before_action :set_expense, only: %i[show update destroy]

      def index
        @expenses = @group.expenses.includes(:paid_by, expense_splits: :user).order(date: :desc)
        render json: @expenses, include: {
          paid_by: { only: [:id, :name, :avatar_url] },
          expense_splits: { include: { user: { only: [:id, :name, :avatar_url] } } }
        }
      end

      def create
        @expense = @group.expenses.build(expense_params)
        @expense.paid_by ||= current_user
        
        # Build splits from params
        # Format expects: params[:expense][:splits] = [ { user_id: UUID, amount: DECIMAL } ]
        if params[:expense][:splits].present?
          params[:expense][:splits].each do |split_param|
            @expense.expense_splits.build(
              user_id: split_param[:user_id],
              amount: split_param[:amount]
            )
          end
        end

        if @expense.save
          render json: @expense, status: :created, include: {
            paid_by: { only: [:id, :name, :avatar_url] },
            expense_splits: { include: { user: { only: [:id, :name, :avatar_url] } } }
          }
        else
          render json: { errors: @expense.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def show
        render json: @expense, include: {
          paid_by: { only: [:id, :name, :avatar_url] },
          expense_splits: { include: { user: { only: [:id, :name, :avatar_url] } } }
        }
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

      def expense_params
        params.require(:expense).permit(:description, :amount, :currency, :split_type, :date, :category, :paid_by_id)
      end
    end
  end
end
