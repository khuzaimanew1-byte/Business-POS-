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

const LS_KEY = "pos.analytics.events.v2";

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
    if (opts?.seedIfEmpty) seedDemoIfEmpty();
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
  // Generate ~14 months of activity, more density in recent months
  for (let daysAgo = 420; daysAgo >= 0; daysAgo--) {
    const recencyBoost = Math.max(0.3, 1 - daysAgo / 420);
    const base = daysAgo === 0 ? rand(2, 6) : rand(1, 7);
    const eventsToday = Math.max(0, Math.round(base * recencyBoost * (0.6 + Math.random() * 0.9)));
    for (let k = 0; k < eventsToday; k++) {
      // Hour skewed toward business hours (8–20)
      const hour = Math.min(23, Math.max(0, Math.round(rand(8, 20) + rand(-2, 2))));
      const minute = Math.floor(rand(0, 60));
      const dt = new Date(now - daysAgo * 86400000);
      dt.setHours(hour, minute, Math.floor(rand(0, 60)), 0);
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
