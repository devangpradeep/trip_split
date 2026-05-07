# frozen_string_literal: true

Rails.application.routes.draw do
  get 'up', to: 'rails/health#show', as: :rails_health_check

  devise_for :users, controllers: {
    sessions: 'users/sessions',
    registrations: 'users/registrations'
  }

  namespace :api do
    namespace :v1 do
      get 'invites/:token', to: 'group_invites#show'
      post 'invites/:token/accept', to: 'group_invites#accept'
      resource :profile, only: %i[show update]
      resources :notifications, only: %i[index] do
        member do
          patch :read
        end

        collection do
          patch :mark_all_read
        end
      end

      resources :groups do
        member do
          post :archive
          post :restore
        end

        resources :expenses, only: %i[index create show update destroy]
        resources :settlements, only: %i[index create show destroy]
        resources :members, controller: 'group_members', only: %i[create destroy] do
          collection do
            get :suggestions
          end
        end
        resources :invites, controller: 'group_invites', only: %i[index create destroy]
        get 'balances', to: 'balances#index'
      end
    end
  end
end
