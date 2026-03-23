Rails.application.routes.draw do
  devise_for :users, controllers: {
    sessions: 'users/sessions',
    registrations: 'users/registrations'
  }

  namespace :api do
    namespace :v1 do
      resources :groups do
        resources :expenses, only: [:index, :create, :show, :update, :destroy]
        resources :settlements, only: [:index, :create, :show, :destroy]
        resources :members, controller: 'group_members', only: [:create]
        get 'balances', to: 'balances#index'
      end
    end
  end
end
