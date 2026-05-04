# POS System — Replit Project

## Overview

A full-featured Point of Sale (POS) system built as a pnpm monorepo. It includes a React frontend for the POS interface and an Express API backend.

## Architecture

### Monorepo Structure

```
artifacts/
  pos-system/    — React + Vite frontend (POS UI)
  api-server/    — Express 5 API server (Node.js)
lib/
  api-zod/       — Shared Zod schema definitions
  db/            — Drizzle ORM + PostgreSQL database layer
```

### Tech Stack

- **Package manager**: pnpm (workspace monorepo)
- **Frontend**: React 19, Vite 7, TailwindCSS 4, TanStack Query, Wouter (routing), Radix UI, Sonner
- **Backend**: Express 5, Pino (logging), CORS
- **Database**: Drizzle ORM + PostgreSQL (schema not yet populated)
- **Language**: TypeScript throughout

## Ports

- **Frontend** (pos-system): port 5000 — served via Vite dev server
- **Backend** (api-server): port 3000 — Express server

## Workflows

- `Start application` — `PORT=5000 pnpm --filter @workspace/pos-system run dev` (webview, port 5000)
- `API Server` — `PORT=3000 pnpm --filter @workspace/api-server run dev` (console, port 3000)

## Key Features

- Product catalogue with categories, stock tracking, quick codes
- Shopping cart with checkout
- Demo Mode (toggle in Settings) — loads sample products without affecting real data
- Analytics page
- Cart history
- Notifications system
- Keyboard shortcuts

## Development Notes

- Frontend stores user products in `localStorage` (key: `pos.products.v1`)
- Demo products are memory-only and reset on each demo session
- Vite config already sets `allowedHosts: true` and `host: 0.0.0.0` for Replit proxy compatibility
- API server builds with esbuild (`build.mjs`) before starting

## Deployment

Configured as `autoscale` deployment:
- **Build**: builds api-server and pos-system
- **Run**: starts the API server on port 5000
