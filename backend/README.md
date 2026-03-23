# TripSplit Backend (Rails API)

Rails 7 API backend for TripSplit, providing authentication and expense-splitting endpoints.

## Requirements
- Ruby `3.2.0`
- Bundler
- PostgreSQL

## Setup

```bash
bundle install
bin/rails db:prepare
```

Run the server:

```bash
bin/rails server
```

Backend runs on `http://localhost:3000` by default.

## Environment Variables

Database (`config/database.yml`):
- `DB_USERNAME` (default: `postgres`)
- `DB_PASSWORD` (default: `postgres`)
- `DB_HOST` (default: `localhost`)

JWT/Auth (`config/initializers/devise.rb`):
- `DEVISE_JWT_SECRET_KEY` (set this in real environments)
- `DEVISE_JWT_EXPIRATION_HOURS` (default: `24`)

## Authentication

Uses Devise + JWT.

Auth endpoints:
- `POST /users` (register)
- `POST /users/sign_in` (login)
- `DELETE /users/sign_out` (logout)

For protected routes, send:
- `Authorization: Bearer <jwt_token>`

## API Routes

Versioned API routes are under `/api/v1`.

Main resources:
- `groups`
- nested `expenses`
- nested `settlements`
- `GET /api/v1/groups/:group_id/balances`

## Dev Notes
- CORS currently allows all origins in `config/initializers/cors.rb`.
- Current app is API-only with Devise configured for JSON auth flows.
