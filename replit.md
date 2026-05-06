# POS System — Replit Project

A full-featured Point of Sale (POS) system built as a pnpm monorepo with a cinematic dark glass UI.

## Run & Operate

- **Frontend dev**: `PORT=5000 pnpm --filter @workspace/pos-system run dev`
- **API dev**: `PORT=3000 pnpm --filter @workspace/api-server run dev`
- **Build API**: `pnpm --filter @workspace/api-server run build`

## Stack

- **Package manager**: pnpm workspace monorepo
- **Frontend**: React 19, Vite 7, TailwindCSS 4 (CSS-first `@theme inline`), Wouter, Radix UI, Sonner
- **Backend**: Express 5, Pino, CORS
- **DB**: Drizzle ORM + PostgreSQL (schema not yet populated)
- **Fonts**: DM Sans (UI), DM Mono (prices/codes) via Google Fonts

## Where Things Live

```
artifacts/pos-system/    — React + Vite frontend
  src/pages/POS.tsx      — main POS UI (all canvas + glass styling in-file)
  src/index.css          — Tailwind v4 theme + global tokens
  index.html             — font imports
artifacts/api-server/    — Express 5 API
lib/api-zod/             — shared Zod schemas
lib/db/                  — Drizzle ORM schema
```

## Architecture Decisions

- **Canvas layers**: Two fixed `<canvas>` elements at z-index 0/1; nebula static (redraws on resize), stars animated with mouse spring interaction
- **Glass system**: All panels use `rgba(...)` + `backdrop-filter: blur()` inline styles since Tailwind v4 doesn't support arbitrary rgba in class names cleanly
- **Gold prices**: `.pos-card-price` and `.pos-gold` utility use `hsl(43,90%,56%)` + DM Mono throughout
- **Demo badge placement**: Controlled via `--demo-indicator-bottom` CSS var set by `useDemoIndicatorPlacement()` hook in each host page
- **Cart persistence**: localStorage (`pos.cart.items.v1`); demo cart is memory-only

## Product

- Product catalogue: categories, stock, quick codes, image upload
- Shopping cart: qty controls (teal), gold prices, solid teal checkout button
- Demo Mode: sample products + seeded cart, floated pill badge (bottom-left, 76px from sidebar)
- Analytics, Cart History, Notifications, Settings pages
- Keyboard shortcuts

## User Preferences

- Color palette: desaturated bio-teal primary, gold prices (`hsl(43,90%,56%)`), no yellow, no indigo
- Glass UI: deep dark glass panels, asymmetric card borders, hover-lift spring on cards
- Fonts: DM Sans everywhere, DM Mono for all prices and quick codes
- Product grid: `minmax(100/120/140/160px)` across breakpoints 640/768/1024/1280

## Gotchas

- Tailwind v4 uses `@theme inline` — no `tailwind.config.js`; tokens live in `index.css`
- Canvas z-index: nebula=0, stars=1, main content `.pos-main-layer`=2, sidebar inline z=20
- `backdrop-filter` requires non-`transparent` background on the element to work in Safari
- API server rebuilds on each `dev` start via esbuild (`build.mjs`)
