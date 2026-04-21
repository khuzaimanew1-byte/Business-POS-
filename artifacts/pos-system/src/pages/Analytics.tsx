import React, { useState, useMemo, useEffect, useCallback } from "react";
import { Link, useLocation } from "wouter";
import {
  Home, BarChart2, Plus, Settings, ArrowLeft, Calendar as CalendarIcon,
  TrendingUp, DollarSign, Check,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip as RTooltip,
  CartesianGrid, BarChart, Bar, Cell,
} from "recharts";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────────
type Mode = "sales" | "profit";
type Range = "daily" | "weekly" | "monthly" | "yearly" | "custom";

type Product = {
  id: string;
  name: string;
  image?: string;
  category: string;
  price: number;
};

type Txn = {
  t: number;          // unix ms
  productId: string;
  qty: number;
  profit: number;     // dollars
};

// Mirror the POS catalog so Analytics is self-contained.
const PRODUCTS: Product[] = [
  { id: "1",  name: "Espresso",        category: "Drinks",      price: 3.50,  image: "/images/espresso.png" },
  { id: "2",  name: "Latte",           category: "Drinks",      price: 4.50,  image: "/images/latte.png" },
  { id: "3",  name: "Cappuccino",      category: "Drinks",      price: 4.00,  image: "/images/cappuccino.png" },
  { id: "4",  name: "Trail Mix",       category: "Snacks",      price: 2.99,  image: "/images/trail-mix.png" },
  { id: "5",  name: "Granola Bar",     category: "Snacks",      price: 1.99,  image: "/images/granola-bar.png" },
  { id: "6",  name: "Chips Pack",      category: "Snacks",      price: 1.49 },
  { id: "7",  name: "Wireless Earbuds",category: "Electronics", price: 29.99, image: "/images/earbuds.png" },
  { id: "8",  name: "USB Cable",       category: "Electronics", price: 9.99,  image: "/images/usb-cable.png" },
  { id: "9",  name: "Phone Stand",     category: "Electronics", price: 14.99, image: "/images/phone-stand.png" },
  { id: "10", name: "T-Shirt",         category: "Clothing",    price: 19.99 },
  { id: "11", name: "Cap",             category: "Clothing",    price: 12.99 },
  { id: "12", name: "Sandwich",        category: "Food",        price: 6.99 },
  { id: "13", name: "Salad Bowl",      category: "Food",        price: 8.99 },
];

// ── Deterministic pseudo-random helpers ───────────────────────────────────────
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0);
}
function rand(seed: string): number {
  return (hash(seed) % 100000) / 100000;
}

// Per-product profit-per-unit (mirrors a value that would be set in product edit).
const PROFIT_PER_UNIT: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  for (const p of PRODUCTS) {
    const margin = 0.24 + rand(`pm-${p.id}`) * 0.22; // 24%–46%
    map[p.id] = +(p.price * margin).toFixed(2);
  }
  return map;
})();

// Distinct color per product for bar graph.
const BAR_PALETTE = [
  "#F5B642", "#5DA5FF", "#7AD992", "#E47CC8", "#FF8366",
  "#9C7BFF", "#3FC9C7", "#FFD166", "#A0D14F", "#F0596B",
  "#5BC0DE", "#C29CFF", "#FFA34D",
];
function colorFor(productId: string): string {
  return BAR_PALETTE[hash(`c-${productId}`) % BAR_PALETTE.length];
}

// ── Range → time window ──────────────────────────────────────────────────────
function startOfDay(d: Date): Date {
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x;
}
function endOfDay(d: Date): Date {
  const x = new Date(d); x.setHours(23, 59, 59, 999); return x;
}
function rangeWindow(range: Range, custom: { from?: Date; to?: Date }): { from: number; to: number } | null {
  const today = startOfDay(new Date());
  if (range === "daily") {
    return { from: +today, to: +today + 86_400_000 - 1 };
  }
  if (range === "weekly") {
    return { from: +today - 6 * 86_400_000, to: +endOfDay(new Date()) };
  }
  if (range === "monthly") {
    return { from: +today - 29 * 86_400_000, to: +endOfDay(new Date()) };
  }
  if (range === "yearly") {
    const start = new Date(today);
    start.setMonth(start.getMonth() - 11, 1);
    start.setHours(0, 0, 0, 0);
    return { from: +start, to: +endOfDay(new Date()) };
  }
  if (range === "custom" && custom.from && custom.to) {
    return { from: +startOfDay(custom.from), to: +endOfDay(custom.to) };
  }
  return null;
}

// ── Event-log generator (deterministic) ──────────────────────────────────────
// Produces real, individually-timestamped transactions across the window.
// Some days/months may have ZERO transactions — those are intentionally absent.
function makeEvents(range: Range, custom: { from?: Date; to?: Date }): Txn[] {
  const win = rangeWindow(range, custom);
  if (!win) return [];

  const events: Txn[] = [];
  const dayMs = 86_400_000;
  const dayCount = Math.max(1, Math.ceil((win.to - win.from + 1) / dayMs));

  for (let i = 0; i < dayCount; i++) {
    const dayStart = startOfDay(new Date(win.from + i * dayMs));
    if (+dayStart > win.to) break;
    const dayKey = format(dayStart, "yyyy-MM-dd");

    // Skip some days entirely — only "daily" guarantees today has activity.
    const skipChance =
      range === "daily" ? 0 :
      range === "yearly" ? 0.06 :
      range === "monthly" ? 0.18 :
      range === "weekly" ? 0.10 : 0.12;
    if (range !== "daily" && rand(`skip-${dayKey}`) < skipChance) continue;

    // Number of transactions this day
    const baseN =
      range === "daily" ? 14 + Math.floor(rand(`nt-${dayKey}`) * 14) : // 14–27 today
                          6  + Math.floor(rand(`nt-${dayKey}`) * 14);  // 6–19 per day
    for (let j = 0; j < baseN; j++) {
      const seed = `${dayKey}-${j}`;
      // Active hours 7:00–22:00, biased toward lunch + evening
      const r = rand(`h-${seed}`);
      let hour = 7 + r * 15;
      // Bias: pull a few toward 12 and 19
      const bias = rand(`b-${seed}`);
      if (bias < 0.25) hour = 11.5 + rand(`bl-${seed}`) * 2;
      else if (bias < 0.5) hour = 18 + rand(`be-${seed}`) * 2.5;
      const minute = Math.floor(rand(`m-${seed}`) * 60);
      const t = +dayStart + Math.floor(hour * 3_600_000) + minute * 60_000;
      if (t > win.to) continue;

      const p = PRODUCTS[Math.floor(rand(`p-${seed}`) * PRODUCTS.length)];
      const qty = 1 + Math.floor(rand(`q-${seed}`) * 3); // 1–3
      const profit = +(qty * PROFIT_PER_UNIT[p.id]).toFixed(2);
      events.push({ t, productId: p.id, qty, profit });
    }
  }

  events.sort((a, b) => a.t - b.t);
  return events;
}

// ── Series builders ──────────────────────────────────────────────────────────
type Pt = { t: number; sales: number; profit: number };

// Daily: every transaction is its own point at its exact timestamp.
function buildDailySeries(events: Txn[]): Pt[] {
  return events.map(e => ({ t: e.t, sales: e.qty, profit: e.profit }));
}

// Aggregate by calendar day — only days with at least one event.
function buildDailyAggregateSeries(events: Txn[]): Pt[] {
  const buckets = new Map<number, Pt>();
  for (const e of events) {
    const d = startOfDay(new Date(e.t));
    const k = +d;
    const cur = buckets.get(k) ?? { t: k + 12 * 3_600_000, sales: 0, profit: 0 };
    cur.sales += e.qty;
    cur.profit = +(cur.profit + e.profit).toFixed(2);
    buckets.set(k, cur);
  }
  return Array.from(buckets.values()).sort((a, b) => a.t - b.t);
}

// Aggregate by calendar month — only months with at least one event.
function buildMonthlyAggregateSeries(events: Txn[]): Pt[] {
  const buckets = new Map<string, Pt>();
  for (const e of events) {
    const d = new Date(e.t);
    const k = `${d.getFullYear()}-${d.getMonth()}`;
    const mid = new Date(d.getFullYear(), d.getMonth(), 15).getTime();
    const cur = buckets.get(k) ?? { t: mid, sales: 0, profit: 0 };
    cur.sales += e.qty;
    cur.profit = +(cur.profit + e.profit).toFixed(2);
    buckets.set(k, cur);
  }
  return Array.from(buckets.values()).sort((a, b) => a.t - b.t);
}

// ── Page ──────────────────────────────────────────────────────────────────────
const ACCENT = "hsl(43 90% 55%)";
const STORAGE_KEY = "pos.analytics.barSelections.v1";

export default function Analytics() {
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<Mode>("sales");
  const [range, setRange] = useState<Range>("weekly");
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});
  const [customOpen, setCustomOpen] = useState(false);

  const [barSlots, setBarSlots] = useState<(string | null)[]>(() => {
    if (typeof window === "undefined") return [null, null, null, null, null];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length === 5) return parsed;
      }
    } catch { /* noop */ }
    return [null, null, null, null, null];
  });
  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(barSlots)); } catch { /* noop */ }
  }, [barSlots]);

  const customKey = customRange.from && customRange.to
    ? `${+customRange.from}-${+customRange.to}`
    : "none";

  // Single source of truth: an event log of real transactions.
  const events = useMemo(
    () => makeEvents(range, customRange),
    [range, customKey] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Series chosen per range
  const series = useMemo<Pt[]>(() => {
    if (range === "daily") return buildDailySeries(events);
    if (range === "yearly") return buildMonthlyAggregateSeries(events);
    return buildDailyAggregateSeries(events); // weekly, monthly, custom
  }, [events, range]);

  // X-axis domain = the requested window, so empty days create real gaps.
  const win = useMemo(() => rangeWindow(range, customRange), [range, customKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Per-product totals from the same event log
  const totals = useMemo(() => {
    const byId = new Map<string, { sales: number; profit: number }>();
    for (const e of events) {
      const cur = byId.get(e.productId) ?? { sales: 0, profit: 0 };
      cur.sales += e.qty;
      cur.profit = +(cur.profit + e.profit).toFixed(2);
      byId.set(e.productId, cur);
    }
    return PRODUCTS.map(p => ({
      product: p,
      sales: byId.get(p.id)?.sales ?? 0,
      profit: byId.get(p.id)?.profit ?? 0,
    }));
  }, [events]);

  const sortedTotals = useMemo(() => {
    return [...totals].sort((a, b) =>
      mode === "sales" ? b.sales - a.sales : b.profit - a.profit
    );
  }, [totals, mode]);

  // Top 5 with custom slot overrides
  const top5 = useMemo(() => {
    const used = new Set<string>();
    const auto = sortedTotals.slice();
    return barSlots.map((slotId, idx) => {
      if (slotId) {
        const t = totals.find(t => t.product.id === slotId);
        if (t) { used.add(t.product.id); return t; }
      }
      while (auto.length) {
        const next = auto.shift()!;
        if (!used.has(next.product.id)) { used.add(next.product.id); return next; }
      }
      return sortedTotals[idx];
    });
  }, [barSlots, sortedTotals, totals]);

  const top10 = useMemo(() => sortedTotals.slice(0, 10), [sortedTotals]);

  const seriesTotal = useMemo(() => {
    const sum = series.reduce((s, p) => s + (mode === "sales" ? p.sales : p.profit), 0);
    return mode === "sales" ? Math.round(sum).toLocaleString() : `$${sum.toFixed(2)}`;
  }, [series, mode]);

  const goHome = useCallback(() => setLocation("/"), [setLocation]);

  // X-axis tick formatter & ticks
  const tickFormatter = useCallback((v: number) => {
    if (range === "daily") return format(v, "h a");
    if (range === "yearly") return format(v, "MMM");
    return format(v, "MMM d");
  }, [range]);

  const xTicks = useMemo(() => {
    if (!win) return undefined;
    if (range === "daily") {
      // Every 3 hours
      const out: number[] = [];
      for (let h = 0; h <= 24; h += 3) out.push(win.from + h * 3_600_000);
      return out;
    }
    if (range === "yearly") {
      const ticks: number[] = [];
      const start = new Date(win.from);
      for (let i = 0; i < 12; i++) {
        ticks.push(+new Date(start.getFullYear(), start.getMonth() + i, 15));
      }
      return ticks;
    }
    return undefined;
  }, [win, range]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground dark analytics-root">
      {/* Desktop sidebar */}
      <aside className="hidden sm:flex w-[60px] shrink-0 border-r border-border bg-sidebar flex-col items-center py-4 z-20">
        <div className="flex flex-col gap-6">
          <TooltipProvider delayDuration={100}>
            <SideItem icon={<Home size={20} />} label="Home" onClick={goHome} />
            <SideItem icon={<BarChart2 size={20} />} label="Analytics" active />
            <SideItem icon={<Plus size={20} />} label="Add Product" onClick={goHome} />
            <SideItem icon={<Settings size={20} />} label="Settings" />
          </TooltipProvider>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 relative">
        <header className="h-14 sm:h-16 border-b border-border bg-background/80 backdrop-blur-sm flex items-center justify-between px-3 sm:px-6 shrink-0 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/">
              <button
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Back to POS"
                data-testid="analytics-back"
              >
                <ArrowLeft size={16} />
                <span className="hidden sm:inline">Back</span>
              </button>
            </Link>
            <div className="h-5 w-px bg-border hidden sm:block" />
            <h1 className="font-semibold text-sm sm:text-base truncate">Analytics</h1>
          </div>
          <div className="hidden sm:flex items-baseline gap-2 text-sm">
            <span className="text-muted-foreground">{mode === "sales" ? "Total units" : "Total profit"}</span>
            <span className="font-mono font-semibold text-foreground tabular-nums">{seriesTotal}</span>
          </div>
        </header>

        <div className="px-3 sm:px-6 py-3 sm:py-4 border-b border-border/60 bg-background/60 backdrop-blur-sm sticky top-14 sm:top-16 z-10">
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            {(["daily","weekly","monthly","yearly"] as Range[]).map(r => (
              <RangePill
                key={r}
                active={range === r}
                onClick={() => setRange(r)}
                label={r[0].toUpperCase() + r.slice(1)}
              />
            ))}
            <Popover open={customOpen} onOpenChange={setCustomOpen}>
              <PopoverTrigger asChild>
                <button
                  data-testid="range-custom"
                  onClick={() => setRange("custom")}
                  className={`range-pill ${range === "custom" ? "range-pill-active" : ""}`}
                >
                  <CalendarIcon size={13} className="opacity-70" />
                  <span>
                    {range === "custom" && customRange.from && customRange.to
                      ? `${format(customRange.from, "MMM d")} – ${format(customRange.to, "MMM d")}`
                      : "Custom"}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-0">
                <Calendar
                  mode="range"
                  selected={customRange as any}
                  onSelect={(r: any) => {
                    setCustomRange(r ?? {});
                    if (r?.from && r?.to) {
                      setRange("custom");
                      setCustomOpen(false);
                    }
                  }}
                  numberOfMonths={1}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="px-3 sm:px-6 py-4 sm:py-6 pb-24 sm:pb-12 max-w-[1400px] mx-auto w-full pr-12 sm:pr-20">

            {/* ── Line chart card ─────────────────────────────────── */}
            <section className="rounded-2xl border border-border/70 bg-card/40 backdrop-blur-sm p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <div>
                  <h2 className="font-semibold text-sm sm:text-base">
                    {mode === "sales" ? "Sales Overview" : "Profit Overview"}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {rangeLabel(range, customRange)}
                    <span className="ml-2 opacity-70">· {series.length} {series.length === 1 ? "data point" : "data points"}</span>
                  </p>
                </div>
              </div>
              <div className="h-[260px] sm:h-[320px] -ml-2 sm:-ml-3">
                {series.length === 0 ? (
                  <EmptyState />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={series}
                      key={`${range}-${mode}-${customKey}`}
                      margin={{ top: 10, right: 8, bottom: 0, left: 0 }}
                    >
                      <defs>
                        <linearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={ACCENT} stopOpacity={0.28} />
                          <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 6" vertical={false} opacity={0.4} />
                      <XAxis
                        type="number"
                        dataKey="t"
                        domain={win ? [win.from, win.to] : ["auto", "auto"]}
                        scale="time"
                        ticks={xTicks}
                        tickFormatter={tickFormatter}
                        stroke="hsl(var(--muted-foreground))"
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={{ stroke: "hsl(var(--border))" }}
                        minTickGap={20}
                      />
                      <YAxis
                        stroke="hsl(var(--muted-foreground))"
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        width={48}
                        tickFormatter={(v) => mode === "profit" ? `$${shortNum(v)}` : shortNum(v)}
                      />
                      <RTooltip
                        cursor={{ stroke: "hsl(var(--border))", strokeDasharray: "3 3" }}
                        content={<ChartTooltip mode={mode} range={range} />}
                      />
                      <Line
                        type="monotone"
                        dataKey={mode}
                        stroke={ACCENT}
                        strokeWidth={2}
                        fill="url(#lineFill)"
                        dot={{ r: 2.5, stroke: ACCENT, strokeWidth: 1.5, fill: "hsl(var(--background))" }}
                        activeDot={{ r: 5, stroke: "hsl(var(--background))", strokeWidth: 2, fill: ACCENT }}
                        isAnimationActive
                        animationDuration={900}
                        animationEasing="ease-out"
                        connectNulls={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>

            {/* ── Top 5 bar chart ─────────────────────────────────── */}
            <section className="mt-4 sm:mt-6 rounded-2xl border border-border/70 bg-card/40 backdrop-blur-sm p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <div>
                  <h2 className="font-semibold text-sm sm:text-base">Top 5 Products</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Click a bar to swap in another product
                  </p>
                </div>
              </div>

              <Top5Bars
                items={top5}
                mode={mode}
                onReplace={(slotIdx, productId) => {
                  setBarSlots(prev => {
                    const copy = [...prev];
                    copy[slotIdx] = productId;
                    return copy;
                  });
                }}
                onResetSlot={(slotIdx) => {
                  setBarSlots(prev => {
                    const copy = [...prev];
                    copy[slotIdx] = null;
                    return copy;
                  });
                }}
                allProducts={PRODUCTS}
                rangeKey={`${range}-${customKey}`}
              />
            </section>

            {/* ── Top 10 list ─────────────────────────────────────── */}
            <section className="mt-4 sm:mt-6 rounded-2xl border border-border/70 bg-card/40 backdrop-blur-sm p-4 sm:p-6">
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <h2 className="font-semibold text-sm sm:text-base">Top 10 Products</h2>
                <span className="text-xs text-muted-foreground">
                  Sorted by {mode === "sales" ? "units sold" : "profit"}
                </span>
              </div>
              <Top10List items={top10} mode={mode} />
            </section>
          </div>
        </ScrollArea>

        <ModeToggle mode={mode} setMode={setMode} />
      </main>
    </div>
  );
}

// ── Helpers / Subcomponents ───────────────────────────────────────────────────

function rangeLabel(r: Range, c: { from?: Date; to?: Date }) {
  if (r === "daily") return `Today — ${format(new Date(), "MMM d, yyyy")}`;
  if (r === "weekly") return "Last 7 days";
  if (r === "monthly") return "Last 30 days";
  if (r === "yearly") return "Last 12 months";
  if (c.from && c.to) return `${format(c.from, "MMM d, yyyy")} – ${format(c.to, "MMM d, yyyy")}`;
  return "Pick a custom date range";
}

function shortNum(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return `${v}`;
}

function ChartTooltip({ active, payload, mode, range }: any) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as Pt;
  const v = mode === "sales" ? point.sales : point.profit;
  const labelDate = new Date(point.t);
  const dateLabel =
    range === "daily" ? format(labelDate, "h:mm a") :
    range === "yearly" ? format(labelDate, "MMM yyyy") :
    format(labelDate, "EEE, MMM d, yyyy");
  return (
    <div className="rounded-lg border border-border/80 bg-popover/95 backdrop-blur-md px-3 py-2 shadow-xl">
      <div className="text-[11px] text-muted-foreground">{dateLabel}</div>
      <div className="text-sm font-mono font-semibold tabular-nums mt-0.5">
        {mode === "profit" ? `$${(+v).toFixed(2)}` : `${(+v).toLocaleString()} ${v === 1 ? "unit" : "units"}`}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center gap-1 text-muted-foreground/70">
      <div className="text-sm font-medium">No activity in this range</div>
      <div className="text-xs">Try a different time filter or date range.</div>
    </div>
  );
}

function RangePill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`range-pill ${active ? "range-pill-active" : ""}`}
      data-testid={`range-${label.toLowerCase()}`}
    >
      {label}
    </button>
  );
}

function SideItem({ icon, label, active = false, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className={`relative p-3 rounded-xl transition-all duration-250 ease-in-out group ${active ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}
        >
          {icon}
          {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-r-md" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="ml-2 font-medium text-white border-0 px-2 py-1 rounded-md" style={{ background: 'rgba(10,10,16,0.88)', backdropFilter: 'blur(6px)', fontSize: 12 }}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function ModeToggle({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  return (
    <div className="mode-toggle fixed right-2 sm:right-4 top-1/2 -translate-y-1/2 z-30">
      <div className="flex flex-col items-stretch gap-1 p-1 rounded-2xl border border-border/70 bg-popover/90 backdrop-blur-md shadow-xl">
        <ToggleBtn active={mode === "sales"}  onClick={() => setMode("sales")}  icon={<TrendingUp size={14} />} label="Sales" />
        <ToggleBtn active={mode === "profit"} onClick={() => setMode("profit")} icon={<DollarSign size={14} />} label="Profit" />
      </div>
    </div>
  );
}
function ToggleBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      data-testid={`mode-${label.toLowerCase()}`}
      className={`flex flex-col items-center justify-center gap-0.5 px-2.5 py-2 rounded-xl text-[10px] font-medium tracking-wide transition-all duration-300 ${active
        ? "bg-primary/15 text-primary"
        : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"}`}
      aria-pressed={active}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

// ── Top 5 vertical bars (recharts BarChart with distinct colors) ──────────────
function Top5Bars({
  items, mode, onReplace, onResetSlot, allProducts, rangeKey,
}: {
  items: { product: Product; sales: number; profit: number }[];
  mode: Mode;
  onReplace: (slotIdx: number, productId: string) => void;
  onResetSlot: (slotIdx: number) => void;
  allProducts: Product[];
  rangeKey: string;
}) {
  const data = items.map((it, idx) => ({
    idx,
    name: it.product.name,
    productId: it.product.id,
    value: mode === "sales" ? it.sales : it.profit,
    color: colorFor(it.product.id),
  }));

  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <div>
      <div className="h-[200px] sm:h-[260px] -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 16, right: 8, left: 0, bottom: 0 }}
            key={`${rangeKey}-${mode}`}
            barCategoryGap="22%"
          >
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 6" vertical={false} opacity={0.4} />
            <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} interval={0} />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={48}
              tickFormatter={(v) => mode === "profit" ? `$${shortNum(v)}` : shortNum(v)}
            />
            <RTooltip
              cursor={{ fill: "hsl(var(--secondary) / 0.5)" }}
              content={({ active, payload }: any) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload;
                return (
                  <div className="rounded-lg border border-border/80 bg-popover/95 backdrop-blur-md px-3 py-2 shadow-xl">
                    <div className="text-[11px] text-muted-foreground">{p.name}</div>
                    <div className="text-sm font-mono font-semibold tabular-nums mt-0.5">
                      {mode === "profit" ? `$${(+p.value).toFixed(2)}` : `${(+p.value).toLocaleString()} units`}
                    </div>
                  </div>
                );
              }}
            />
            <Bar
              dataKey="value"
              radius={[10, 10, 4, 4]}
              isAnimationActive
              animationDuration={750}
              animationEasing="ease-out"
              onClick={(_, idx) => setOpenIdx(idx)}
              cursor="pointer"
            >
              {data.map((d) => (
                <Cell key={d.productId} fill={d.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Image strip + replace popovers under bars */}
      <div className="grid grid-cols-5 gap-2 sm:gap-4 mt-2">
        {items.map((it, idx) => (
          <Popover key={`${it.product.id}-${idx}`} open={openIdx === idx} onOpenChange={(o) => setOpenIdx(o ? idx : null)}>
            <PopoverTrigger asChild>
              <button
                className="flex flex-col items-center gap-1 rounded-lg p-1.5 hover:bg-secondary/40 transition-colors"
                aria-label={`Replace ${it.product.name}`}
                data-testid={`top5-bar-${idx}`}
              >
                <div className="relative">
                  <ProductAvatar p={it.product} size={36} />
                  <span
                    className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background"
                    style={{ background: colorFor(it.product.id) }}
                  />
                </div>
                <div className="text-[10px] sm:text-xs text-center text-muted-foreground line-clamp-1 w-full" title={it.product.name}>
                  {it.product.name}
                </div>
              </button>
            </PopoverTrigger>
            <PopoverContent className="p-1 w-56" align="center">
              <div className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground flex items-center justify-between">
                <span>Replace product</span>
                <button
                  onClick={() => { onResetSlot(idx); setOpenIdx(null); }}
                  className="text-[10px] uppercase tracking-wide hover:text-foreground transition-colors"
                >
                  Auto
                </button>
              </div>
              <ScrollArea className="h-56">
                <div className="flex flex-col">
                  {allProducts.map(p => (
                    <button
                      key={p.id}
                      onClick={() => { onReplace(idx, p.id); setOpenIdx(null); }}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm hover:bg-secondary/70 transition-colors ${p.id === it.product.id ? "bg-secondary/60" : ""}`}
                    >
                      <ProductAvatar p={p} size={24} />
                      <span className="flex-1 truncate">{p.name}</span>
                      <span className="w-2 h-2 rounded-full" style={{ background: colorFor(p.id) }} />
                      {p.id === it.product.id && <Check size={14} className="text-primary shrink-0" />}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>
        ))}
      </div>
    </div>
  );
}

// ── Top 10 list ──────────────────────────────────────────────────────────────
function Top10List({ items, mode }: { items: { product: Product; sales: number; profit: number }[]; mode: Mode }) {
  const max = Math.max(1, ...items.map(it => mode === "sales" ? it.sales : it.profit));
  return (
    <ul className="flex flex-col">
      {items.map((it, i) => {
        const v = mode === "sales" ? it.sales : it.profit;
        const pct = Math.max(2, (v / max) * 100);
        const color = colorFor(it.product.id);
        return (
          <li
            key={it.product.id}
            className="grid grid-cols-[24px_36px_1fr_auto] sm:grid-cols-[28px_40px_1fr_auto] items-center gap-2 sm:gap-3 py-2 sm:py-2.5 border-b border-border/40 last:border-b-0"
            data-testid={`top10-item-${i}`}
          >
            <span className="text-xs text-muted-foreground font-mono tabular-nums">{i + 1}</span>
            <ProductAvatar p={it.product} size={36} />
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{it.product.name}</div>
              <div className="mt-1 h-1.5 rounded-full bg-secondary/60 overflow-hidden">
                <div
                  className="h-full rounded-full perf-bar"
                  style={{
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${color} 0%, ${color}66 100%)`,
                  }}
                />
              </div>
            </div>
            <span className="text-sm font-mono font-semibold tabular-nums whitespace-nowrap">
              {mode === "profit" ? `$${v.toFixed(2)}` : v.toLocaleString()}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function ProductAvatar({ p, size = 36 }: { p: Product; size?: number }) {
  const initials = p.name.split(" ").map(s => s[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div
      className="rounded-lg bg-secondary/70 flex items-center justify-center overflow-hidden shrink-0 border border-border/40"
      style={{ width: size, height: size }}
    >
      {p.image ? (
        <img
          src={p.image}
          alt={p.name}
          className="w-full h-full object-cover"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
      ) : (
        <span className="text-[10px] font-semibold text-muted-foreground">{initials}</span>
      )}
    </div>
  );
}
