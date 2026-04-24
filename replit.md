# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## POS System — Notification System

Actionable-only notification system in `artifacts/pos-system`. Architected around a single source of truth (`src/lib/notifications-store.tsx`) that watches the products store and surfaces notifications when human action is required.

- **Triggers**: `low_stock` (warning, stock ≤ 10 and > 0) and `out_of_stock` (alert, stock = 0). No success/info events ever.
- **Anti-spam**: per-product `triggered` map ensures each (product, kind) fires at most once until the underlying condition resolves; resolution auto-removes the notification & toast.
- **Surfaces**: live unread badge with soft halo on the bell (POS desktop header, mobile bottom nav, Analytics header), top-right toast stack (max 3, auto-dismiss ~4.5s, replaced by `src/components/NotificationToaster.tsx`), and dedicated page at `/notifications` (`src/pages/Notifications.tsx`) with Alerts/Warnings tabs.
- **Deep-linking**: action button calls `requestProductFocus(productId)`. POS consumes this on mount/change, switches category if needed, scrolls the card into view, and applies a 2-cycle `product-card-highlight` pulse. Context-aware: navigating to `/` is a no-op when already there.
- **Animations** (in `src/index.css`): `notif-bell-pulse-anim`, `notif-toast-in-anim`, `product-card-highlight-anim` — all short, subtle, and respect `data-perf` modes.
