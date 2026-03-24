# TripSplit Frontend (React + Vite)

React frontend for TripSplit.

## Requirements
- Node.js `18+`
- npm

## Setup

```bash
npm install
```

Run development server:

```bash
npm run dev
```

Frontend runs on `http://localhost:5173` by default.

## Build

```bash
npm run build
npm run preview
```

## Backend Dependency

This app expects backend API at `http://localhost:3000` by default.

API URLs are configured via Vite env vars:
- `VITE_API_ORIGIN` (default: `http://localhost:3000`)
- `VITE_API_PREFIX` (default: `/api/v1`)
- `VITE_AUTH_BASE_URL` (optional; defaults to `VITE_API_ORIGIN`)

Create your local env file:

```bash
cp .env.example .env
```

If backend host/port changes, update values in `.env`.

## Auth Behavior

- JWT token is stored in `localStorage` as `token`.
- User profile is stored as `user`.
- Axios request interceptor attaches `Authorization: Bearer <token>`.
- On `401`, token and user are cleared.

## Scripts

- `npm run dev` start dev server
- `npm run build` create production build
- `npm run preview` preview production build locally
- `npm run lint` run ESLint
