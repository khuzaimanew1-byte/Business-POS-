import { useEffect, useState } from "react";

export type SaleLineItem = {
  productId: string;
  name: string;
  image?: string;
  qty: number;
  price: number;
  profit: number;
};

export type SaleEvent = {
  id: string;
  ts: number;
  items: SaleLineItem[];
  total: number;
  totalProfit: number;
};

const LS_KEY = "pos.analytics.events.v1";

function loadEvents(): SaleEvent[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function saveEvents(events: SaleEvent[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(events));
  } catch {
    /* noop */
  }
}

let events: SaleEvent[] = loadEvents();
const listeners = new Set<() => void>();

function emit() {
  saveEvents(events);
  listeners.forEach((l) => l());
}

export function getEvents(): SaleEvent[] {
  return events;
}

export function recordSale(items: SaleLineItem[]) {
  const cleaned = items
    .filter((i) => i.qty > 0)
    .map((i) => ({
      ...i,
      price: Number(i.price) || 0,
      profit: Number(i.profit) || 0,
    }));
  if (cleaned.length === 0) return;
  const total = cleaned.reduce((s, i) => s + i.price * i.qty, 0);
  const totalProfit = cleaned.reduce((s, i) => s + i.profit * i.qty, 0);
  const ev: SaleEvent = {
    id:
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? (crypto as Crypto).randomUUID()
        : Math.random().toString(36).slice(2)) + "",
    ts: Date.now(),
    items: cleaned,
    total,
    totalProfit,
  };
  events = [...events, ev];
  emit();
}

export function clearEvents() {
  events = [];
  emit();
}

export function seedDemoEventsIfEmpty(
  products: { id: string; name: string; price: number; image?: string; profit?: number }[]
) {
  if (events.length > 0) return;
  if (products.length === 0) return;

  const now = Date.now();
  const seeded: SaleEvent[] = [];
  // Spread ~80 events across the last 30 days, with some empty days.
  const TARGET = 80;
  for (let i = 0; i < TARGET; i++) {
    // Random day offset 0..29, skewed toward recent
    const dayOffset = Math.floor(Math.pow(Math.random(), 1.4) * 30);
    // Skip a few "empty" days
    if (dayOffset === 5 || dayOffset === 12 || dayOffset === 19) continue;
    const hour = 8 + Math.floor(Math.random() * 12); // 8am - 8pm
    const minute = Math.floor(Math.random() * 60);
    const ts =
      now -
      dayOffset * 24 * 60 * 60 * 1000 -
      (new Date().getHours() - hour) * 60 * 60 * 1000 -
      (new Date().getMinutes() - minute) * 60 * 1000;

    const itemCount = 1 + Math.floor(Math.random() * 3);
    const items: SaleLineItem[] = [];
    const usedIdx = new Set<number>();
    for (let j = 0; j < itemCount; j++) {
      let idx = Math.floor(Math.random() * products.length);
      let guard = 0;
      while (usedIdx.has(idx) && guard < 10) {
        idx = Math.floor(Math.random() * products.length);
        guard++;
      }
      usedIdx.add(idx);
      const p = products[idx];
      const qty = 1 + Math.floor(Math.random() * 3);
      const profit = p.profit ?? Math.max(0.5, p.price * 0.3);
      items.push({
        productId: p.id,
        name: p.name,
        image: p.image,
        qty,
        price: p.price,
        profit,
      });
    }
    const total = items.reduce((s, i) => s + i.price * i.qty, 0);
    const totalProfit = items.reduce((s, i) => s + i.profit * i.qty, 0);
    seeded.push({
      id: `demo-${i}`,
      ts,
      items,
      total,
      totalProfit,
    });
  }
  seeded.sort((a, b) => a.ts - b.ts);
  events = seeded;
  emit();
}

export function useAnalyticsEvents(): SaleEvent[] {
  const [snapshot, setSnapshot] = useState<SaleEvent[]>(events);
  useEffect(() => {
    const l = () => setSnapshot(events);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return snapshot;
}

// ── Bar slot persistence ────────────────────────────────────────────────
const BAR_KEY = "pos.analytics.barSlots.v1";

export function loadBarSlots(): (string | null)[] {
  try {
    const raw = localStorage.getItem(BAR_KEY);
    if (!raw) return [null, null, null, null, null];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [null, null, null, null, null];
    const arr = parsed.slice(0, 5);
    while (arr.length < 5) arr.push(null);
    return arr;
  } catch {
    return [null, null, null, null, null];
  }
}

export function saveBarSlots(slots: (string | null)[]) {
  try {
    localStorage.setItem(BAR_KEY, JSON.stringify(slots.slice(0, 5)));
  } catch {
    /* noop */
  }
}
