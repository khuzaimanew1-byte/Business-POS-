import { useEffect, useState } from "react";
import { useSettings } from "@/lib/settings";

export type SaleItem = {
  productId: string;
  name: string;
  qty: number;
  price: number;
  profit: number;
};

export type SaleEvent = {
  id: string;
  ts: number;
  items: SaleItem[];
  totalQty: number;
  totalSales: number;
  totalProfit: number;
};

// Real (user-recorded) events live under their own key. Demo events are
// generated in-memory and never written to localStorage so the two streams
// stay strictly separate — toggling Demo Data off must reveal pristine real
// data and never leak demo entries.
const REAL_KEY = "pos.analytics.events.real.v1";

// Wipe legacy seed buckets — they were always demo data, written under the
// "real" key by older versions of this store.
try {
  localStorage.removeItem("pos.analytics.events.v3");
  localStorage.removeItem("pos.analytics.events.v2");
  localStorage.removeItem("pos.analytics.events");
} catch {
  /* noop */
}

function loadReal(): SaleEvent[] {
  try {
    const raw = localStorage.getItem(REAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as SaleEvent[];
  } catch {
    return [];
  }
}

function saveReal(events: SaleEvent[]) {
  try {
    localStorage.setItem(REAL_KEY, JSON.stringify(events));
  } catch {
    /* noop */
  }
  notifyChange();
}

function notifyChange() {
  try {
    window.dispatchEvent(new CustomEvent("pos:analytics-changed"));
  } catch {
    /* noop */
  }
}

// ── Demo session bridge ────────────────────────────────────────────────────
// `recordSale` is a plain module function, so it can't `useSettings()`. The
// hook below mirrors `settings.demoData` into a module-level flag that
// `recordSale` can consult synchronously. Mounted once via DemoSessionSync.
let _demoActive = false;
const _demoSessionEvents: SaleEvent[] = [];

export function _setDemoActive(active: boolean) {
  if (_demoActive === active) return;
  _demoActive = active;
  // Exiting demo mode discards every sale recorded during the session so no
  // demo activity ever leaks into the real analytics stream.
  if (!active) {
    _demoSessionEvents.length = 0;
  }
  notifyChange();
}

// Daily-reset boundary used by Cart History.
//   • The boundary is the most recent 7 AM (local time).
//   • Before 7 AM today → boundary is yesterday's 7 AM.
//   • At/after 7 AM today → boundary is today's 7 AM.
// Cart History filters orders to those with ts >= this value, which gives
// the user a fresh "today's orders" list every morning without ever
// mutating the underlying analytics data. Callers can pass a custom "now"
// (e.g. the demo anchor) so the boundary aligns with the data being shown.
export function getTodayResetTimestamp(nowOverride?: Date): number {
  const now = nowOverride ?? new Date();
  const reset = new Date(now);
  reset.setHours(7, 0, 0, 0);
  if (reset.getTime() > now.getTime()) {
    reset.setDate(reset.getDate() - 1);
  }
  return reset.getTime();
}

export function recordSale(items: SaleItem[]) {
  if (!items.length) return;
  const evt: SaleEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    items,
    totalQty: items.reduce((s, i) => s + i.qty, 0),
    totalSales: items.reduce((s, i) => s + i.price * i.qty, 0),
    totalProfit: items.reduce((s, i) => s + i.profit * i.qty, 0),
  };
  if (_demoActive) {
    // Sales recorded during a demo session are ephemeral: they show up live
    // in charts and history while Demo Mode is on, then vanish on exit.
    _demoSessionEvents.push(evt);
    notifyChange();
  } else {
    const events = loadReal();
    events.push(evt);
    saveReal(events);
  }
}

export function clearRealEvents() {
  try {
    localStorage.removeItem(REAL_KEY);
  } catch {
    /* noop */
  }
  notifyChange();
}

/**
 * Returns the events that should drive analytics for the current settings:
 *   • Demo Data ON  → 2025-anchored seed dataset + live demo session sales.
 *   • Demo Data OFF → only events recorded by `recordSale` (the real stream).
 * Toggling the setting flips the source instantly with no mixed state.
 */
export function useSaleEvents(): SaleEvent[] {
  const { settings } = useSettings();
  const [, forceTick] = useState(0);

  useEffect(() => {
    const refresh = () => forceTick((n) => n + 1);
    window.addEventListener("pos:analytics-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("pos:analytics-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  if (settings.demoData) {
    if (_demoSessionEvents.length === 0) return getDemoEvents2025();
    // Merge seed + session, keeping the array sorted by timestamp so the
    // chart-builders (which assume ascending order) stay correct.
    const merged = [...getDemoEvents2025(), ..._demoSessionEvents];
    merged.sort((a, b) => a.ts - b.ts);
    return merged;
  }
  return loadReal();
}

// ── Demo seed (anchored to calendar year 2025) ────────────────────────────
const DEMO_PRODUCTS: { id: string; name: string; price: number; profit: number }[] = [
  { id: "1", name: "Espresso", price: 3.5, profit: 1.4 },
  { id: "2", name: "Latte", price: 4.5, profit: 1.8 },
  { id: "3", name: "Cappuccino", price: 4.0, profit: 1.6 },
  { id: "4", name: "Trail Mix", price: 2.99, profit: 1.0 },
  { id: "5", name: "Granola Bar", price: 1.99, profit: 0.7 },
  { id: "7", name: "Wireless Earbuds", price: 29.99, profit: 12.0 },
  { id: "8", name: "USB Cable", price: 9.99, profit: 4.0 },
  { id: "12", name: "Sandwich", price: 6.99, profit: 2.5 },
  { id: "13", name: "Salad Bowl", price: 8.99, profit: 3.2 },
];

// Tiny seedable PRNG so the demo dataset is deterministic across reloads —
// users see the same charts every time Demo Data is enabled, which makes the
// Settings preview behaviour predictable.
function mulberry32(seed: number) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let _demoCache: SaleEvent[] | null = null;

/**
 * Generates a fixed, deterministic dataset spanning the entire calendar year
 * 2025 (Jan 1 → Dec 31). Cached after first generation; consumers should
 * treat the returned array as immutable.
 */
export function getDemoEvents2025(): SaleEvent[] {
  if (_demoCache) return _demoCache;
  const rand = mulberry32(20250101);
  const events: SaleEvent[] = [];

  // Day-of-week multipliers (0=Sun … 6=Sat) — captures realistic weekly rhythm
  const dowMul = [0.7, 1.05, 1.0, 1.05, 1.15, 1.4, 1.25];
  // Hourly density curve for a typical retail/cafe day
  const hourCurve = [
    0.005, 0.003, 0.002, 0.002, 0.003, 0.008,
    0.02, 0.04, 0.07, 0.085, 0.075, 0.065,
    0.085, 0.09, 0.07, 0.055, 0.05, 0.06,
    0.075, 0.065, 0.04, 0.025, 0.015, 0.008,
  ];

  const start = new Date(2025, 0, 1).getTime();   // Jan 1 2025 local time
  const end = new Date(2026, 0, 1).getTime();     // exclusive upper bound
  const totalDays = Math.round((end - start) / 86_400_000);

  const between = (lo: number, hi: number) => lo + rand() * (hi - lo);

  for (let d = 0; d < totalDays; d++) {
    const dt0 = new Date(start + d * 86_400_000);
    const dow = dt0.getDay();

    // Light seasonality: a gentle bump toward late November / December and
    // again in summer so the yearly chart isn't a flat line.
    const month = dt0.getMonth();
    const seasonal =
      month === 11 ? 1.3 :
      month === 10 ? 1.15 :
      (month === 6 || month === 7) ? 1.1 :
      1.0;

    const closedChance = dow === 0 ? 0.18 : 0.07;
    if (rand() < closedChance) continue;

    const baseEvents = between(8, 22) * dowMul[dow] * seasonal;
    const eventsToday = Math.max(0, Math.round(baseEvents * (0.7 + rand() * 0.6)));

    for (let k = 0; k < eventsToday; k++) {
      let r = rand();
      let hour = 12;
      for (let h = 0; h < 24; h++) {
        if (r < hourCurve[h]) { hour = h; break; }
        r -= hourCurve[h];
      }
      const minute = Math.floor(rand() * 60);
      const second = Math.floor(rand() * 60);
      const dt = new Date(dt0);
      dt.setHours(hour, minute, second, 0);

      const itemCount = Math.max(1, Math.round(between(1, 4)));
      const items: SaleItem[] = [];
      for (let i = 0; i < itemCount; i++) {
        const p = DEMO_PRODUCTS[Math.floor(rand() * DEMO_PRODUCTS.length)];
        const qty = Math.max(1, Math.round(between(1, 3)));
        items.push({
          productId: p.id,
          name: p.name,
          qty,
          price: p.price,
          profit: p.profit,
        });
      }
      events.push({
        id: `demo-${dt.getTime()}-${k}`,
        ts: dt.getTime(),
        items,
        totalQty: items.reduce((s, i) => s + i.qty, 0),
        totalSales: items.reduce((s, i) => s + i.price * i.qty, 0),
        totalProfit: items.reduce((s, i) => s + i.profit * i.qty, 0),
      });
    }
  }

  events.sort((a, b) => a.ts - b.ts);
  _demoCache = events;
  return events;
}
