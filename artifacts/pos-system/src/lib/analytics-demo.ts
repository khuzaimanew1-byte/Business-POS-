// Temporary demo dataset for the Analytics page.
// This generates a realistic-looking transaction log used purely for
// validating UI/UX, animations, and graph behaviour. It will be removed
// once real transaction data flows in from the POS exclusively.

import { AnalyticsTxn, setTransactions, setDemoSeeded } from "./analytics-store";

type DemoProduct = {
  id: string;
  name: string;
  price: number;
  unitProfit: number;
  popularity: number; // 0..1, higher = more frequently sold
};

const DEMO_PRODUCTS: DemoProduct[] = [
  { id: "1",  name: "Espresso",         price: 3.50,  unitProfit: 1.40, popularity: 0.95 },
  { id: "2",  name: "Latte",            price: 4.50,  unitProfit: 1.85, popularity: 1.00 },
  { id: "3",  name: "Cappuccino",       price: 4.00,  unitProfit: 1.70, popularity: 0.90 },
  { id: "12", name: "Sandwich",         price: 6.99,  unitProfit: 2.60, popularity: 0.78 },
  { id: "13", name: "Salad Bowl",       price: 8.99,  unitProfit: 3.40, popularity: 0.55 },
  { id: "4",  name: "Trail Mix",        price: 2.99,  unitProfit: 1.10, popularity: 0.50 },
  { id: "5",  name: "Granola Bar",      price: 1.99,  unitProfit: 0.75, popularity: 0.62 },
  { id: "6",  name: "Chips Pack",       price: 1.49,  unitProfit: 0.55, popularity: 0.48 },
  { id: "7",  name: "Wireless Earbuds", price: 29.99, unitProfit: 9.90, popularity: 0.18 },
  { id: "8",  name: "USB Cable",        price: 9.99,  unitProfit: 3.30, popularity: 0.34 },
  { id: "9",  name: "Phone Stand",      price: 14.99, unitProfit: 5.10, popularity: 0.22 },
  { id: "10", name: "T-Shirt",          price: 19.99, unitProfit: 7.20, popularity: 0.20 },
  { id: "11", name: "Cap",              price: 12.99, unitProfit: 4.50, popularity: 0.16 },
];

// Deterministic RNG so the dataset is stable across reloads.
function makeRng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let s = h >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xFFFFFFFF;
  };
}

function startOfDay(d: Date): Date { const x = new Date(d); x.setHours(0,0,0,0); return x; }

function pickProduct(rnd: () => number): DemoProduct {
  // Weighted by popularity
  const total = DEMO_PRODUCTS.reduce((s, p) => s + p.popularity, 0);
  let pick = rnd() * total;
  for (const p of DEMO_PRODUCTS) {
    pick -= p.popularity;
    if (pick <= 0) return p;
  }
  return DEMO_PRODUCTS[0];
}

/**
 * Build a year of realistic demo transactions:
 *   - Some days have no activity (intentional gaps)
 *   - More activity on weekends and recent days
 *   - Time-of-day clusters around lunch (11–13) and evening (18–20)
 *   - Quantity 1–5, weighted toward 1–2
 */
export function buildDemoTransactions(now: Date = new Date()): AnalyticsTxn[] {
  const rnd = makeRng("pos-analytics-demo-v1");
  const today = startOfDay(now);
  const txns: AnalyticsTxn[] = [];

  const DAYS_BACK = 365;
  for (let dayOffset = DAYS_BACK; dayOffset >= 0; dayOffset--) {
    const day = new Date(today);
    day.setDate(day.getDate() - dayOffset);
    const dow = day.getDay(); // 0=Sun..6=Sat
    const isWeekend = dow === 0 || dow === 6;

    // Recency boost — last 60 days more active than older days
    const recencyBoost = dayOffset < 60 ? 1.25 : dayOffset < 180 ? 1.0 : 0.85;

    // Probability the shop has activity at all today
    const skipChance = isWeekend ? 0.08 : 0.18;
    if (rnd() < skipChance) continue;

    // Number of transactions today
    const baseN = (isWeekend ? 14 : 10) * recencyBoost;
    const variance = rnd() * 12;
    const n = Math.max(2, Math.round(baseN + variance - 6));

    for (let i = 0; i < n; i++) {
      // Pick an hour with bias toward lunch/evening
      const r = rnd();
      let hour: number;
      if (r < 0.35) hour = 11 + rnd() * 2.2;        // lunch 11:00–13:12
      else if (r < 0.65) hour = 18 + rnd() * 2.5;   // evening 18:00–20:30
      else if (r < 0.85) hour = 8 + rnd() * 3;      // morning 8:00–11:00
      else hour = 14 + rnd() * 4;                   // afternoon 14:00–18:00

      const minute = Math.floor(rnd() * 60);
      const second = Math.floor(rnd() * 60);
      const t = +day + Math.floor(hour * 3_600_000) + minute * 60_000 + second * 1_000;
      // Don't generate transactions in the future
      if (t > +now) continue;

      const product = pickProduct(rnd);
      // Quantity weighted toward 1-2
      const qr = rnd();
      const qty = qr < 0.55 ? 1 : qr < 0.85 ? 2 : qr < 0.95 ? 3 : qr < 0.99 ? 4 : 5;

      txns.push({
        id: `demo-${t}-${i}-${product.id}`,
        t,
        productId: product.id,
        productName: product.name,
        qty,
        unitPrice: product.price,
        unitProfit: product.unitProfit,
        total: +(qty * product.price).toFixed(2),
        profit: +(qty * product.unitProfit).toFixed(2),
      });
    }
  }

  txns.sort((a, b) => a.t - b.t);
  return txns;
}

/** Replace the store with a fresh demo dataset and mark demo as seeded. */
export function seedDemoData() {
  const txns = buildDemoTransactions();
  setTransactions(txns);
  setDemoSeeded(true);
}
