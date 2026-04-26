import { useEffect, useState } from "react";

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

const LS_KEY = "pos.analytics.events.v3";

// Clean up legacy seed buckets so users see the upgraded dataset
try {
  localStorage.removeItem("pos.analytics.events.v2");
  localStorage.removeItem("pos.analytics.events");
} catch {
  /* noop */
}

function load(): SaleEvent[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as SaleEvent[];
  } catch {
    return [];
  }
}

function save(events: SaleEvent[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(events));
    window.dispatchEvent(new CustomEvent("pos:analytics-changed"));
  } catch {
    /* noop */
  }
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
  const events = load();
  events.push(evt);
  save(events);
}

export function useSaleEvents(opts?: { seedIfEmpty?: boolean }): SaleEvent[] {
  const [events, setEvents] = useState<SaleEvent[]>(() => {
    if (opts?.seedIfEmpty) {
      seedDemoIfEmpty();
      seedCurrentWeekIfEmpty();
    }
    return load();
  });
  useEffect(() => {
    const refresh = () => setEvents(load());
    window.addEventListener("pos:analytics-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("pos:analytics-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return events;
}

// ── Demo seed ──────────────────────────────────────────────────────────────
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

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export function seedDemoIfEmpty() {
  if (load().length > 0) return;
  const now = Date.now();
  const events: SaleEvent[] = [];

  // Day-of-week multipliers (0=Sun … 6=Sat) — captures realistic weekly rhythm
  const dowMul = [0.7, 1.05, 1.0, 1.05, 1.15, 1.4, 1.25];

  // Hourly density curve for a typical retail/cafe day (24 entries, sums roughly to 1)
  const hourCurve = [
    0.005, 0.003, 0.002, 0.002, 0.003, 0.008, // 0-5 night
    0.02, 0.04, 0.07, 0.085, 0.075, 0.065,    // 6-11 morning rush
    0.085, 0.09, 0.07, 0.055, 0.05, 0.06,     // 12-17 lunch + afternoon
    0.075, 0.065, 0.04, 0.025, 0.015, 0.008,  // 18-23 evening
  ];

  // ~14 months of history with denser recent activity
  for (let daysAgo = 420; daysAgo >= 0; daysAgo--) {
    const dt0 = new Date(now - daysAgo * 86400000);
    const recencyBoost = Math.max(0.35, 1 - daysAgo / 420);

    // Random "closed" / no-activity days — ~7% chance, slightly higher on Sundays
    const dow = dt0.getDay();
    const closedChance = dow === 0 ? 0.18 : 0.07;
    if (Math.random() < closedChance && daysAgo > 1) continue;

    // Average events for the day (skew higher recent + by weekday)
    const baseEvents = rand(8, 22) * recencyBoost * dowMul[dow];
    const eventsToday = Math.max(0, Math.round(baseEvents * (0.7 + Math.random() * 0.6)));

    // Pre-pick which hours fire today, weighted by hourCurve
    for (let k = 0; k < eventsToday; k++) {
      // Weighted hour pick
      let r = Math.random();
      let hour = 12;
      for (let h = 0; h < 24; h++) {
        if (r < hourCurve[h]) { hour = h; break; }
        r -= hourCurve[h];
      }
      const minute = Math.floor(Math.random() * 60);
      const second = Math.floor(Math.random() * 60);
      const dt = new Date(dt0);
      dt.setHours(hour, minute, second, 0);
      // Don't generate future events on the current day
      if (daysAgo === 0 && dt.getTime() > now) continue;

      const itemCount = Math.max(1, Math.round(rand(1, 4)));
      const items: SaleItem[] = [];
      for (let i = 0; i < itemCount; i++) {
        const p = DEMO_PRODUCTS[Math.floor(Math.random() * DEMO_PRODUCTS.length)];
        const qty = Math.max(1, Math.round(rand(1, 3)));
        items.push({
          productId: p.id,
          name: p.name,
          qty,
          price: p.price,
          profit: p.profit,
        });
      }
      events.push({
        id: `seed-${dt.getTime()}-${k}`,
        ts: dt.getTime(),
        items,
        totalQty: items.reduce((s, i) => s + i.qty, 0),
        totalSales: items.reduce((s, i) => s + i.price * i.qty, 0),
        totalProfit: items.reduce((s, i) => s + i.profit * i.qty, 0),
      });
    }
  }
  events.sort((a, b) => a.ts - b.ts);
  save(events);
}

// Top up the current Mon→Sun week with demo events on a per-day basis.
// Any day in the current week with fewer than MIN_PER_DAY events gets
// extra demo activity to bring it up to a healthy baseline. Pre-existing
// real sales are left untouched.
export function seedCurrentWeekIfEmpty() {
  const MIN_PER_DAY = 6;
  const now = Date.now();
  const d = new Date(now);
  const dayOfWeek = d.getDay(); // 0 = Sun … 6 = Sat
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const weekStart = new Date(d);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - daysSinceMonday);
  const weekStartMs = weekStart.getTime();

  const existing = load();
  const dowMul = [0.7, 1.05, 1.0, 1.05, 1.15, 1.4, 1.25];
  const hourCurve = [
    0.005, 0.003, 0.002, 0.002, 0.003, 0.008,
    0.02, 0.04, 0.07, 0.085, 0.075, 0.065,
    0.085, 0.09, 0.07, 0.055, 0.05, 0.06,
    0.075, 0.065, 0.04, 0.025, 0.015, 0.008,
  ];

  const newEvents: SaleEvent[] = [];
  for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
    const dayStartMs = weekStartMs + dayIdx * 86400000;
    const dayEndMs = dayStartMs + 86400000;
    if (dayStartMs > now) break; // don't fabricate future days

    const existingForDay = existing.filter(
      (e) => e.ts >= dayStartMs && e.ts < dayEndMs,
    ).length;
    if (existingForDay >= MIN_PER_DAY) continue;

    const dayStart = new Date(dayStartMs);
    const dow = dayStart.getDay();
    const baseEvents = rand(10, 22) * dowMul[dow];
    const targetTotal = Math.max(
      MIN_PER_DAY,
      Math.round(baseEvents * (0.8 + Math.random() * 0.4)),
    );
    const need = targetTotal - existingForDay;

    for (let k = 0; k < need; k++) {
      let r = Math.random();
      let hour = 12;
      for (let h = 0; h < 24; h++) {
        if (r < hourCurve[h]) { hour = h; break; }
        r -= hourCurve[h];
      }
      const minute = Math.floor(Math.random() * 60);
      const second = Math.floor(Math.random() * 60);
      const dt = new Date(dayStart);
      dt.setHours(hour, minute, second, 0);
      if (dt.getTime() > now) continue;

      const itemCount = Math.max(1, Math.round(rand(1, 4)));
      const items: SaleItem[] = [];
      for (let i = 0; i < itemCount; i++) {
        const p = DEMO_PRODUCTS[Math.floor(Math.random() * DEMO_PRODUCTS.length)];
        const qty = Math.max(1, Math.round(rand(1, 3)));
        items.push({
          productId: p.id,
          name: p.name,
          qty,
          price: p.price,
          profit: p.profit,
        });
      }
      newEvents.push({
        id: `seed-week-${dt.getTime()}-${k}-${Math.random().toString(36).slice(2, 6)}`,
        ts: dt.getTime(),
        items,
        totalQty: items.reduce((s, i) => s + i.qty, 0),
        totalSales: items.reduce((s, i) => s + i.price * i.qty, 0),
        totalProfit: items.reduce((s, i) => s + i.profit * i.qty, 0),
      });
    }
  }

  if (newEvents.length === 0) return;
  const merged = existing.concat(newEvents).sort((a, b) => a.ts - b.ts);
  save(merged);
}
