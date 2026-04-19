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

      resources :groups do
        resources :expenses, only: %i[index create show update destroy]
        resources :settlements, only: %i[index create show destroy]
        resources :members, controller: 'group_members', only: [:create]
        resources :invites, controller: 'group_invites', only: %i[index create destroy]
        get 'balances', to: 'balances#index'
      end
    end
  end
end
