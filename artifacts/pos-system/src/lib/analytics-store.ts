// Lightweight in-app transaction store that powers the Analytics page.
// Sales are recorded only when the user submits the cart (Checkout).
// Persisted in localStorage so the data survives reloads.

export type AnalyticsTxn = {
  id: string;
  t: number;         // unix ms — the moment of the sale
  productId: string;
  productName: string;
  qty: number;
  unitPrice: number;
  unitProfit: number;
  total: number;     // qty * unitPrice
  profit: number;    // qty * unitProfit
};

const STORAGE_KEY = "pos.analytics.txns.v1";
const MAX_TXNS = 5000;

type Listener = () => void;
const listeners = new Set<Listener>();

let cache: AnalyticsTxn[] | null = null;

function load(): AnalyticsTxn[] {
  if (cache) return cache;
  if (typeof window === "undefined") { cache = []; return cache; }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) { cache = parsed as AnalyticsTxn[]; return cache; }
    }
  } catch { /* noop */ }
  cache = [];
  return cache;
}

function persist() {
  if (typeof window === "undefined" || !cache) return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache)); } catch { /* noop */ }
}

function emit() { listeners.forEach(l => { try { l(); } catch { /* noop */ } }); }

export function getTransactions(): AnalyticsTxn[] {
  return load();
}

export function recordSale(items: {
  productId: string;
  productName: string;
  qty: number;
  unitPrice: number;
  unitProfit: number;
}[], at: number = Date.now()): AnalyticsTxn[] {
  const list = load();
  const created: AnalyticsTxn[] = items
    .filter(i => i.qty > 0)
    .map((i, idx) => ({
      id: `${at}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      t: at,
      productId: i.productId,
      productName: i.productName,
      qty: i.qty,
      unitPrice: i.unitPrice,
      unitProfit: i.unitProfit,
      total: +(i.qty * i.unitPrice).toFixed(2),
      profit: +(i.qty * i.unitProfit).toFixed(2),
    }));
  if (!created.length) return list;
  list.push(...created);
  // Keep size bounded
  if (list.length > MAX_TXNS) list.splice(0, list.length - MAX_TXNS);
  persist();
  emit();
  return list;
}

export function clearTransactions() {
  cache = [];
  persist();
  emit();
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// Cross-tab sync via the storage event
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) {
      cache = null;
      emit();
    }
  });
}
