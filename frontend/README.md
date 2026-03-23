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

This app expects backend API at `http://localhost:3000`.

Current API URLs are set in `src/lib/api.js`:
- Base API: `http://localhost:3000/api/v1`
- Auth endpoints: `http://localhost:3000/users/...`

If backend host/port changes, update `src/lib/api.js`.

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
