import React, { useState, useMemo, useEffect, useCallback, useSyncExternalStore } from "react";
import { Link, useLocation } from "wouter";
import {
  Home, BarChart2, Plus, Settings, ArrowLeft, Calendar as CalendarIcon,
  TrendingUp, DollarSign, Check, Inbox,
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
import {
  AnalyticsTxn, getTransactions, subscribe,
} from "@/lib/analytics-store";

// ── Types ─────────────────────────────────────────────────────────────────────
type Mode = "sales" | "profit";
type Range = "daily" | "weekly" | "monthly" | "yearly" | "custom";

type ProductMeta = {
  id: string;
  name: string;
  image?: string;
};

// Mirror the POS catalog so we can show product images/avatars in the lists.
// Analytics derives all values strictly from recorded transactions; this map is
// only used for visual metadata (image, fallback name).
const PRODUCT_META: Record<string, ProductMeta> = Object.fromEntries([
  { id: "1",  name: "Espresso",         image: "/images/espresso.png" },
  { id: "2",  name: "Latte",            image: "/images/latte.png" },
  { id: "3",  name: "Cappuccino",       image: "/images/cappuccino.png" },
  { id: "4",  name: "Trail Mix",        image: "/images/trail-mix.png" },
  { id: "5",  name: "Granola Bar",      image: "/images/granola-bar.png" },
  { id: "6",  name: "Chips Pack" },
  { id: "7",  name: "Wireless Earbuds", image: "/images/earbuds.png" },
  { id: "8",  name: "USB Cable",        image: "/images/usb-cable.png" },
  { id: "9",  name: "Phone Stand",      image: "/images/phone-stand.png" },
  { id: "10", name: "T-Shirt" },
  { id: "11", name: "Cap" },
  { id: "12", name: "Sandwich" },
  { id: "13", name: "Salad Bowl" },
].map(p => [p.id, p]));

// ── Muted, dark-mode-friendly color palette ───────────────────────────────────
const BAR_PALETTE = [
  "#D9A441", // warm gold
  "#7AA9C7", // dusty blue
  "#8FB587", // sage
  "#C58CA6", // muted rose
  "#C2895E", // terracotta
  "#9B8DC4", // lavender
  "#5FA8A1", // teal
  "#B8B07A", // olive
  "#B97A6E", // brick
  "#7FA0B8", // slate
];

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0);
}

// Deterministic color assignment with adjacent-clash avoidance done at render time.
function baseColorFor(productId: string): string {
  return BAR_PALETTE[hash(`c-${productId}`) % BAR_PALETTE.length];
}

// Given an ordered list of product ids, return colors that minimise adjacency clashes.
function colorsForOrdered(ids: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < ids.length; i++) {
    let c = baseColorFor(ids[i]);
    if (i > 0 && out[i - 1] === c) {
      // shift to next palette entry that differs
      const startIdx = BAR_PALETTE.indexOf(c);
      for (let k = 1; k < BAR_PALETTE.length; k++) {
        const cand = BAR_PALETTE[(startIdx + k) % BAR_PALETTE.length];
        if (cand !== out[i - 1]) { c = cand; break; }
      }
    }
    out.push(c);
  }
  return out;
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
  if (range === "daily") return { from: +today, to: +today + 86_400_000 - 1 };
  if (range === "weekly") return { from: +today - 6 * 86_400_000, to: +endOfDay(new Date()) };
  if (range === "monthly") return { from: +today - 29 * 86_400_000, to: +endOfDay(new Date()) };
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

// ── Series builders (purely from real transactions) ──────────────────────────
type Pt = { t: number; sales: number; profit: number };

// Daily: one point per real transaction at its exact timestamp.
function buildDailySeries(events: AnalyticsTxn[]): Pt[] {
  return events.map(e => ({ t: e.t, sales: e.qty, profit: e.profit }));
}

// Aggregate by calendar day — only days with at least one event.
function buildDailyAggregateSeries(events: AnalyticsTxn[]): Pt[] {
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
function buildMonthlyAggregateSeries(events: AnalyticsTxn[]): Pt[] {
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

// ── Live store hook ──────────────────────────────────────────────────────────
function useTransactions(): AnalyticsTxn[] {
  return useSyncExternalStore(subscribe, getTransactions, getTransactions);
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

  const allTxns = useTransactions();

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

  const win = useMemo(() => rangeWindow(range, customRange), [range, customKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter the real transaction log to the current range.
  const events = useMemo(() => {
    if (!win) return [];
    return allTxns.filter(e => e.t >= win.from && e.t <= win.to);
  }, [allTxns, win]);

  const series = useMemo<Pt[]>(() => {
    if (range === "daily") return buildDailySeries(events);
    if (range === "yearly") return buildMonthlyAggregateSeries(events);
    return buildDailyAggregateSeries(events);
  }, [events, range]);

  // Per-product totals from the same events
  const totals = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; sales: number; profit: number }>();
    for (const e of events) {
      const cur = byId.get(e.productId) ?? { id: e.productId, name: e.productName, sales: 0, profit: 0 };
      cur.sales += e.qty;
      cur.profit = +(cur.profit + e.profit).toFixed(2);
      byId.set(e.productId, cur);
    }
    return Array.from(byId.values());
  }, [events]);

  const sortedTotals = useMemo(() => {
    return [...totals].sort((a, b) =>
      mode === "sales" ? b.sales - a.sales : b.profit - a.profit
    );
  }, [totals, mode]);

  // Universe of known product ids (from store + meta) for the swap popover
  const knownProducts = useMemo(() => {
    const ids = new Set<string>(Object.keys(PRODUCT_META));
    for (const t of allTxns) ids.add(t.productId);
    return Array.from(ids).map(id => ({
      id,
      name: PRODUCT_META[id]?.name ?? (allTxns.find(t => t.productId === id)?.productName ?? id),
      image: PRODUCT_META[id]?.image,
    }));
  }, [allTxns]);

  // Top 5 with custom slot overrides
  const top5 = useMemo(() => {
    const used = new Set<string>();
    const auto = sortedTotals.slice();
    return barSlots.map((slotId, idx) => {
      if (slotId) {
        const t = totals.find(t => t.id === slotId);
        if (t) { used.add(t.id); return t; }
        // slot points to a product with no sales in this range
        const meta = knownProducts.find(p => p.id === slotId);
        if (meta) {
          used.add(slotId);
          return { id: slotId, name: meta.name, sales: 0, profit: 0 };
        }
      }
      while (auto.length) {
        const next = auto.shift()!;
        if (!used.has(next.id)) { used.add(next.id); return next; }
      }
      return sortedTotals[idx] ?? { id: `empty-${idx}`, name: "—", sales: 0, profit: 0 };
    });
  }, [barSlots, sortedTotals, totals, knownProducts]);

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
      const out: number[] = [];
      for (let h = 0; h <= 24; h += 3) out.push(win.from + h * 3_600_000);
      return out;
    }
    if (range === "yearly") {
      const ticks: number[] = [];
      const start = new Date(win.from);
      for (let i = 0; i < 12; i++) ticks.push(+new Date(start.getFullYear(), start.getMonth() + i, 15));
      return ticks;
    }
    return undefined;
  }, [win, range]);

  const hasAnyTxns = allTxns.length > 0;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground dark analytics-root">
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

            {!hasAnyTxns && (
              <div className="mb-4 sm:mb-6 rounded-2xl border border-border/70 bg-card/40 backdrop-blur-sm p-5 sm:p-6 flex items-start gap-3">
                <div className="shrink-0 w-9 h-9 rounded-full bg-secondary/60 flex items-center justify-center text-muted-foreground">
                  <Inbox size={16} />
                </div>
                <div className="text-sm">
                  <div className="font-medium">No sales recorded yet</div>
                  <div className="text-muted-foreground text-xs sm:text-[13px] mt-0.5">
                    Add items to your cart in the POS and tap <span className="font-medium text-foreground">Checkout</span> — each submission adds a real data point here.
                  </div>
                </div>
              </div>
            )}

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
                      key={`${range}-${mode}-${customKey}-${series.length}`}
                      margin={{ top: 10, right: 8, bottom: 0, left: 0 }}
                    >
                      <defs>
                        <linearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={ACCENT} stopOpacity={0.22} />
                          <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 6" vertical={false} opacity={0.28} />
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
                      {/* Filled area under the line */}
                      <Line
                        type="monotone"
                        dataKey={mode}
                        stroke="transparent"
                        fill="url(#lineFill)"
                        dot={false}
                        activeDot={false}
                        isAnimationActive={false}
                        legendType="none"
                      />
                      {/* The visible line itself — dots hidden by default, only on hover */}
                      <Line
                        type="monotone"
                        dataKey={mode}
                        stroke={ACCENT}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 5, stroke: "hsl(var(--background))", strokeWidth: 2, fill: ACCENT }}
                        isAnimationActive
                        animationDuration={800}
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
                    Click a slot below to swap in another product
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
                allProducts={knownProducts}
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
              {top10.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground/70">
                  No product activity in this range yet.
                </div>
              ) : (
                <Top10List items={top10} mode={mode} />
              )}
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

// ── Top 5 vertical bars (recharts BarChart with muted distinct colors) ────────
type Top5Item = { id: string; name: string; sales: number; profit: number };
function Top5Bars({
  items, mode, onReplace, onResetSlot, allProducts, rangeKey,
}: {
  items: Top5Item[];
  mode: Mode;
  onReplace: (slotIdx: number, productId: string) => void;
  onResetSlot: (slotIdx: number) => void;
  allProducts: ProductMeta[];
  rangeKey: string;
}) {
  const colors = useMemo(() => colorsForOrdered(items.map(i => i.id)), [items]);
  const data = items.map((it, idx) => ({
    idx,
    name: it.name,
    productId: it.id,
    value: mode === "sales" ? it.sales : it.profit,
    color: colors[idx],
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
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 6" vertical={false} opacity={0.28} />
            <XAxis dataKey="name" tick={false} axisLine={{ stroke: "hsl(var(--border))" }} height={4} />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={48}
              tickFormatter={(v) => mode === "profit" ? `$${shortNum(v)}` : shortNum(v)}
            />
            <RTooltip
              cursor={{ fill: "hsl(var(--secondary) / 0.45)" }}
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
              radius={[8, 8, 2, 2]}
              isAnimationActive
              animationDuration={750}
              animationEasing="ease-out"
            >
              {data.map((d, i) => (
                <Cell key={`${d.productId}-${i}`} fill={d.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Single product label row under the chart: image + name + value */}
      <div className="grid grid-cols-5 gap-2 sm:gap-4 mt-3">
        {items.map((it, idx) => {
          const meta = allProducts.find(p => p.id === it.id);
          const value = mode === "sales" ? it.sales : it.profit;
          const valueLabel = it.id.startsWith("empty-")
            ? "—"
            : mode === "profit" ? `$${value.toFixed(2)}` : `${value.toLocaleString()}${value === 1 ? " unit" : ""}`;
          return (
            <Popover key={`${it.id}-${idx}`} open={openIdx === idx} onOpenChange={(o) => setOpenIdx(o ? idx : null)}>
              <PopoverTrigger asChild>
                <button
                  className="flex flex-col items-center gap-1.5 rounded-lg p-1.5 hover:bg-secondary/40 transition-colors text-center"
                  aria-label={`Replace ${it.name}`}
                  data-testid={`top5-bar-${idx}`}
                >
                  <ProductAvatar p={meta ?? { id: it.id, name: it.name }} size={36} />
                  <div
                    className="text-[10px] sm:text-xs font-medium text-foreground/90 line-clamp-1 w-full"
                    title={it.name}
                  >
                    {it.name}
                  </div>
                  <div
                    className="text-[10px] sm:text-[11px] font-mono tabular-nums text-muted-foreground"
                    style={{ color: colors[idx] }}
                  >
                    {valueLabel}
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
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm hover:bg-secondary/70 transition-colors ${p.id === it.id ? "bg-secondary/60" : ""}`}
                      >
                        <ProductAvatar p={p} size={24} />
                        <span className="flex-1 truncate">{p.name}</span>
                        <span className="w-2 h-2 rounded-full" style={{ background: baseColorFor(p.id) }} />
                        {p.id === it.id && <Check size={14} className="text-primary shrink-0" />}
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
          );
        })}
      </div>
    </div>
  );
}

// ── Top 10 list ──────────────────────────────────────────────────────────────
function Top10List({ items, mode }: {
  items: { id: string; name: string; sales: number; profit: number }[];
  mode: Mode;
}) {
  const max = Math.max(1, ...items.map(it => mode === "sales" ? it.sales : it.profit));
  const colors = colorsForOrdered(items.map(it => it.id));
  return (
    <ul className="flex flex-col">
      {items.map((it, i) => {
        const v = mode === "sales" ? it.sales : it.profit;
        const pct = Math.max(2, (v / max) * 100);
        const meta = PRODUCT_META[it.id] ?? { id: it.id, name: it.name };
        const color = colors[i];
        return (
          <li
            key={it.id}
            className="grid grid-cols-[24px_36px_1fr_auto] sm:grid-cols-[28px_40px_1fr_auto] items-center gap-2 sm:gap-3 py-2 sm:py-2.5 border-b border-border/40 last:border-b-0"
            data-testid={`top10-item-${i}`}
          >
            <span className="text-xs text-muted-foreground font-mono tabular-nums">{i + 1}</span>
            <ProductAvatar p={meta} size={36} />
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{it.name}</div>
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

function ProductAvatar({ p, size = 36 }: { p: ProductMeta; size?: number }) {
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
