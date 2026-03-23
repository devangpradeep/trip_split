# TripSplit

TripSplit is a split-expense app with:
- `backend/`: Rails 7 API (JWT auth with Devise)
- `frontend/`: React + Vite UI

## Tech Stack
- Backend: Ruby 3.2, Rails 7, PostgreSQL, Devise JWT
- Frontend: React 19, Vite 8, Axios, React Router

## Project Structure
- `backend/` Rails API server on `http://localhost:3000`
- `frontend/` Vite dev server on `http://localhost:5173`

## Prerequisites
- Ruby `3.2.0`
- Bundler
- Node.js `18+` and npm
- PostgreSQL `13+`

## Quick Start

1. Start PostgreSQL.
2. Start backend:

```bash
cd backend
bundle install
bin/rails db:prepare
bin/rails server
```

3. Start frontend in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

4. Open `http://localhost:5173`.

## Environment Variables

Backend (`backend/config/database.yml`, `backend/config/initializers/devise.rb`) supports:
- `DB_USERNAME` (default: `postgres`)
- `DB_PASSWORD` (default: `postgres`)
- `DB_HOST` (default: `localhost`)
- `DEVISE_JWT_SECRET_KEY` (recommended to set in non-local envs)
- `DEVISE_JWT_EXPIRATION_HOURS` (default: `24`)

## Notes
- CORS is currently open (`origins "*"`) for development.
- Frontend API base URL is currently hardcoded to `http://localhost:3000` in `frontend/src/lib/api.js`.
