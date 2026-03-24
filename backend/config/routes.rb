# frozen_string_literal: true

Rails.application.routes.draw do
  get 'up', to: 'rails/health#show', as: :rails_health_check

  devise_for :users, controllers: {
    sessions: 'users/sessions',
    registrations: 'users/registrations'
  }

  namespace :api do
    namespace :v1 do
      resources :groups do
        resources :expenses, only: %i[index create show update destroy]
        resources :settlements, only: %i[index create show destroy]
        resources :members, controller: 'group_members', only: [:create]
        get 'balances', to: 'balances#index'
      end
    end
  end
end
