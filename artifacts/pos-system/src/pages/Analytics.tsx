import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import {
  Home, BarChart2, Plus, Settings, ArrowLeft, Calendar as CalendarIcon,
  TrendingUp, DollarSign, ChevronDown, Check,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip as RTooltip,
  CartesianGrid, BarChart, Bar, Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
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
  // Returns 0..1 deterministic
  return (hash(seed) % 100000) / 100000;
}

// ── Time-series generator ────────────────────────────────────────────────────
type Point = { label: string; sales: number; profit: number; key: string };

function makeSeries(range: Range, custom: { from?: Date; to?: Date }): Point[] {
  if (range === "daily") {
    return Array.from({ length: 24 }, (_, h) => {
      const r = rand(`d-${h}`);
      const r2 = rand(`d2-${h}`);
      // Lower at night, peaks at lunch + evening
      const curve =
        0.25 + Math.max(0, Math.sin(((h - 6) / 18) * Math.PI)) * 0.85 +
        (h >= 11 && h <= 13 ? 0.35 : 0) + (h >= 18 && h <= 20 ? 0.4 : 0);
      const sales = Math.round((40 + r * 60) * curve);
      const profit = +((sales * (0.28 + r2 * 0.12))).toFixed(2);
      return { label: `${String(h).padStart(2, "0")}:00`, sales, profit, key: `h${h}` };
    });
  }
  if (range === "weekly") {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    return days.map((d, i) => {
      const r = rand(`w-${i}`); const r2 = rand(`w2-${i}`);
      const weekend = i >= 5 ? 1.35 : 1;
      const sales = Math.round((220 + r * 320) * weekend);
      const profit = +((sales * (0.3 + r2 * 0.15))).toFixed(2);
      return { label: d, sales, profit, key: `wd${i}` };
    });
  }
  if (range === "monthly") {
    return Array.from({ length: 30 }, (_, i) => {
      const r = rand(`m-${i}`); const r2 = rand(`m2-${i}`);
      const sales = Math.round(180 + r * 360 + Math.sin(i / 4) * 40);
      const profit = +((sales * (0.28 + r2 * 0.14))).toFixed(2);
      return { label: `${i + 1}`, sales, profit, key: `md${i}` };
    });
  }
  if (range === "yearly") {
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return months.map((m, i) => {
      const r = rand(`y-${i}`); const r2 = rand(`y2-${i}`);
      const seasonal = 1 + Math.sin((i / 12) * Math.PI * 2) * 0.18;
      const sales = Math.round((4800 + r * 4200) * seasonal);
      const profit = +((sales * (0.29 + r2 * 0.12))).toFixed(2);
      return { label: m, sales, profit, key: `mo${i}` };
    });
  }
  // custom
  const from = custom.from ?? new Date();
  const to = custom.to ?? from;
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.max(1, Math.round((+to - +from) / dayMs) + 1);
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(+from + i * dayMs);
    const key = format(date, "yyyy-MM-dd");
    const r = rand(`c-${key}`); const r2 = rand(`c2-${key}`);
    const sales = Math.round(200 + r * 380);
    const profit = +((sales * (0.28 + r2 * 0.14))).toFixed(2);
    return { label: format(date, days <= 14 ? "MMM d" : "M/d"), sales, profit, key };
  });
}

// ── Per-product aggregation for given range ───────────────────────────────────
function makeProductTotals(range: Range, customKey: string) {
  return PRODUCTS.map(p => {
    const seed = `${p.id}-${range}-${customKey}`;
    const r = rand(seed);
    const r2 = rand(seed + "x");
    // Volume baseline
    const baseUnits =
      range === "daily" ? 25 + r * 80 :
      range === "weekly" ? 140 + r * 380 :
      range === "monthly" ? 580 + r * 1500 :
      range === "yearly" ? 6800 + r * 18000 :
      60 + r * 220;
    const units = Math.round(baseUnits);
    const margin = 0.26 + r2 * 0.18;
    const sales = units; // "Sales" displayed as numeric units sold
    const profit = +((units * p.price * margin)).toFixed(2);
    return { product: p, sales, profit };
  });
}

// ── Page ──────────────────────────────────────────────────────────────────────
const ACCENT = "hsl(43 90% 55%)";
const ACCENT_SOFT = "hsl(43 90% 55% / 0.18)";

const STORAGE_KEY = "pos.analytics.barSelections.v1";

export default function Analytics() {
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<Mode>("sales");
  const [range, setRange] = useState<Range>("weekly");
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});
  const [customOpen, setCustomOpen] = useState(false);

  // Persisted custom bar selections (id-or-null per slot 0..4)
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

  const series = useMemo(
    () => makeSeries(range, customRange),
    [range, customRange.from, customRange.to]
  );

  const totals = useMemo(
    () => makeProductTotals(range, customKey),
    [range, customKey]
  );

  // Sorted descending by current mode
  const sortedTotals = useMemo(() => {
    return [...totals].sort((a, b) =>
      mode === "sales" ? b.sales - a.sales : b.profit - a.profit
    );
  }, [totals, mode]);

  // Top 5 with custom slot overrides
  const top5 = useMemo(() => {
    const used = new Set<string>();
    const auto = sortedTotals.slice(); // mutable
    return barSlots.map((slotId, idx) => {
      if (slotId) {
        const t = totals.find(t => t.product.id === slotId);
        if (t) { used.add(t.product.id); return t; }
      }
      // Find next auto entry not used
      while (auto.length) {
        const next = auto.shift()!;
        if (!used.has(next.product.id)) {
          used.add(next.product.id);
          return next;
        }
      }
      return sortedTotals[idx];
    });
  }, [barSlots, sortedTotals, totals]);

  // Top 10 list (always derived from sorted; not affected by custom bar slots)
  const top10 = useMemo(() => sortedTotals.slice(0, 10), [sortedTotals]);

  // Totals for header KPI
  const seriesTotal = useMemo(() => {
    const sum = series.reduce((s, p) => s + (mode === "sales" ? p.sales : p.profit), 0);
    return mode === "sales" ? Math.round(sum).toLocaleString() : `$${sum.toFixed(2)}`;
  }, [series, mode]);

  const goHome = useCallback(() => setLocation("/"), [setLocation]);

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
        {/* Top header */}
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

        {/* Time filter bar */}
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

        {/* Scrollable content */}
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
                  </p>
                </div>
              </div>
              <div className="h-[260px] sm:h-[320px] -ml-2 sm:-ml-3">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={series}
                    key={`${range}-${mode}-${customKey}`}
                    margin={{ top: 10, right: 8, bottom: 0, left: 0 }}
                  >
                    <defs>
                      <linearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 6" vertical={false} opacity={0.4} />
                    <XAxis
                      dataKey="label"
                      stroke="hsl(var(--muted-foreground))"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={{ stroke: "hsl(var(--border))" }}
                      interval="preserveStartEnd"
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
                      content={<ChartTooltip mode={mode} />}
                    />
                    <Line
                      type="monotone"
                      dataKey={mode}
                      stroke={ACCENT}
                      strokeWidth={2}
                      fill="url(#lineFill)"
                      dot={false}
                      activeDot={{ r: 5, stroke: "hsl(var(--background))", strokeWidth: 2, fill: ACCENT }}
                      isAnimationActive
                      animationDuration={900}
                      animationEasing="ease-out"
                    />
                  </LineChart>
                </ResponsiveContainer>
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

        {/* Sales / Profit toggle — fixed right side, vertically centered */}
        <ModeToggle mode={mode} setMode={setMode} />
      </main>
    </div>
  );
}

// ── Helpers / Subcomponents ───────────────────────────────────────────────────

function rangeLabel(r: Range, c: { from?: Date; to?: Date }) {
  if (r === "daily") return "Hourly breakdown — today";
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

function ChartTooltip({ active, payload, label, mode }: any) {
  if (!active || !payload?.length) return null;
  const v = payload[0].value;
  return (
    <div className="rounded-lg border border-border/80 bg-popover/95 backdrop-blur-md px-3 py-2 shadow-xl">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-sm font-mono font-semibold tabular-nums mt-0.5">
        {mode === "profit" ? `$${(+v).toFixed(2)}` : `${(+v).toLocaleString()} units`}
      </div>
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

// ── Top 5 vertical bars ──────────────────────────────────────────────────────
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
  const max = Math.max(1, ...items.map(it => mode === "sales" ? it.sales : it.profit));
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <div className="grid grid-cols-5 gap-2 sm:gap-4">
      {items.map((it, idx) => {
        const v = mode === "sales" ? it.sales : it.profit;
        const pct = Math.max(6, (v / max) * 100);
        return (
          <div key={`${it.product.id}-${idx}-${rangeKey}`} className="flex flex-col items-center gap-2">
            {/* Bar */}
            <Popover open={openIdx === idx} onOpenChange={(o) => setOpenIdx(o ? idx : null)}>
              <PopoverTrigger asChild>
                <button
                  className="bar-track w-full h-[160px] sm:h-[220px] flex items-end rounded-xl bg-secondary/50 hover:bg-secondary/70 transition-colors duration-300 overflow-hidden relative group"
                  aria-label={`Replace ${it.product.name}`}
                  data-testid={`top5-bar-${idx}`}
                >
                  <div
                    className="w-full rounded-xl bar-fill"
                    style={{
                      height: `${pct}%`,
                      background: `linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_SOFT} 100%)`,
                    }}
                  />
                  <div className="absolute inset-x-0 top-2 text-center">
                    <span className="font-mono text-[10px] sm:text-xs font-semibold tabular-nums text-foreground/90">
                      {mode === "profit" ? `$${shortNum(v)}` : shortNum(v)}
                    </span>
                  </div>
                  <div className="absolute inset-0 flex items-end justify-center pb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Tap to swap</span>
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
                        {p.id === it.product.id && <Check size={14} className="text-primary shrink-0" />}
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>

            {/* Image + name */}
            <ProductAvatar p={it.product} size={36} />
            <div className="text-[10px] sm:text-xs text-center text-muted-foreground line-clamp-1 w-full" title={it.product.name}>
              {it.product.name}
            </div>
          </div>
        );
      })}
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
                    background: `linear-gradient(90deg, ${ACCENT} 0%, ${ACCENT_SOFT} 100%)`,
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
        // eslint-disable-next-line @next/next/no-img-element
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
