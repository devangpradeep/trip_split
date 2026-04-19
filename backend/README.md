# TripSplit Backend (Rails API)

Rails 8 API backend for TripSplit, providing authentication and expense-splitting endpoints.

## Requirements
- Ruby `3.2.0`
- Bundler
- PostgreSQL

## Setup

```bash
cp .env.example .env
bundle install
bin/rails db:prepare
```

Run the server:

```bash
bin/rails server
```

Backend runs on `http://localhost:3000` by default.

## Environment Variables

Local development:
- Create `backend/.env` from `backend/.env.example`.
- `dotenv-rails` loads values from `.env` automatically in `development` and `test`.

Database (`config/database.yml`):
- `DB_USERNAME` (default: `postgres`)
- `DB_PASSWORD` (default: `postgres`)
- `DB_HOST` (default: `localhost`)
- `DATABASE_URL` (optional in local, required in production; use Neon URL on Northflank)

JWT/Auth (`config/initializers/devise.rb`):
- `DEVISE_JWT_SECRET_KEY` (set this in real environments)
- `DEVISE_JWT_EXPIRATION_HOURS` (default: `24`)

Production/security:
- `RAILS_MASTER_KEY` (required in production)
- `FORCE_SSL` (default: `true` in production)
- `CORS_ALLOWED_ORIGINS` (comma-separated, for example `https://app.example.com`)
- `FRONTEND_APP_URL` (used to generate shareable invite links)

Northflank + Neon deployment notes:
- Set env vars in Northflank project settings (do not upload `.env`).
- Point `DATABASE_URL` to your Neon connection string.
- Ensure `RAILS_MASTER_KEY` and `DEVISE_JWT_SECRET_KEY` are both set.

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

Health check:
- `GET /up`

Main resources:
- `groups`
- nested `expenses`
- nested `settlements`
- nested `invites` (create/list/revoke invite links)
- `GET /api/v1/invites/:token`
- `POST /api/v1/invites/:token/accept`
- `GET /api/v1/groups/:group_id/balances`

## Dev Notes
- CORS is configured via `CORS_ALLOWED_ORIGINS` in `config/initializers/cors.rb`.
- Current app is API-only with Devise configured for JSON auth flows.
