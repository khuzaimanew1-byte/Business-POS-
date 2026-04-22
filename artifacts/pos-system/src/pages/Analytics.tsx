import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, DollarSign, TrendingUp, Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSaleEvents, type SaleEvent } from "@/lib/analytics-store";

type Mode = "daily" | "weekly" | "monthly" | "yearly" | "custom";
type Metric = "sales" | "profit";

const MODES: { id: Mode; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "yearly", label: "Yearly" },
  { id: "custom", label: "Custom" },
];

// ── Time helpers ──────────────────────────────────────────────────────────
function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}
function startOfYear(d: Date) {
  return new Date(d.getFullYear(), 0, 1).getTime();
}

type SeriesPoint = { ts: number; value: number };
type AxisTick = { ts: number; label: string };
type Series = {
  points: SeriesPoint[];
  range: { from: number; to: number };
  xTicks: AxisTick[];
  rangeLabel: string;
};

function buildSeries(
  mode: Mode,
  events: SaleEvent[],
  metric: Metric,
  custom: { from: number; to: number } | null,
): Series {
  const now = new Date();
  const valueOf = (e: SaleEvent) => (metric === "sales" ? e.totalQty : e.totalProfit);

  let from: number, to: number, rangeLabel: string;
  let xTicks: AxisTick[] = [];

  if (mode === "daily") {
    from = startOfDay(now);
    to = from + 86400000;
    rangeLabel = now.toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
    // Hourly ticks every 3 hours
    for (let h = 0; h <= 24; h += 3) {
      xTicks.push({
        ts: from + h * 3600000,
        label: h === 24 ? "" : `${((h + 11) % 12) + 1}${h < 12 ? "a" : "p"}`,
      });
    }
  } else if (mode === "weekly") {
    to = startOfDay(now) + 86400000;
    from = to - 7 * 86400000;
    rangeLabel = "Last 7 days";
    for (let d = 0; d < 7; d++) {
      const ts = from + d * 86400000;
      xTicks.push({
        ts,
        label: new Date(ts).toLocaleDateString(undefined, { weekday: "short" }),
      });
    }
  } else if (mode === "monthly") {
    from = startOfMonth(now);
    to = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
    rangeLabel = now.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    const days = Math.round((to - from) / 86400000);
    const stepDays = days > 20 ? 3 : 2;
    for (let d = 0; d < days; d += stepDays) {
      const ts = from + d * 86400000;
      xTicks.push({ ts, label: String(d + 1) });
    }
  } else if (mode === "yearly") {
    from = startOfYear(now);
    to = new Date(now.getFullYear() + 1, 0, 1).getTime();
    rangeLabel = String(now.getFullYear());
    for (let m = 0; m < 12; m++) {
      const ts = new Date(now.getFullYear(), m, 1).getTime();
      xTicks.push({
        ts,
        label: new Date(ts).toLocaleDateString(undefined, { month: "short" }),
      });
    }
  } else {
    const range = custom ?? {
      from: startOfDay(now) - 6 * 86400000,
      to: startOfDay(now) + 86400000,
    };
    from = range.from;
    to = range.to;
    rangeLabel = `${new Date(from).toLocaleDateString()} – ${new Date(to).toLocaleDateString()}`;
    const span = Math.max(1, to - from);
    const useHours = span <= 2 * 86400000;
    const targetTicks = 7;
    const step = span / targetTicks;
    for (let i = 0; i <= targetTicks; i++) {
      const ts = from + i * step;
      xTicks.push({
        ts,
        label: useHours
          ? new Date(ts).toLocaleTimeString(undefined, {
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            })
          : new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      });
    }
  }

  const points: SeriesPoint[] = events
    .filter((e) => e.ts >= from && e.ts < to)
    .sort((a, b) => a.ts - b.ts)
    .map((e) => ({ ts: e.ts, value: valueOf(e) }));

  return { points, range: { from, to }, xTicks, rangeLabel };
}

// ── Y axis helpers ────────────────────────────────────────────────────────
function computeYTicks(minVal: number, maxVal: number, maxTicks = 5): number[] {
  const span = Math.max(1, maxVal - minVal);
  const rough = span / Math.max(1, maxTicks - 1);
  const pow10 = 10 ** Math.floor(Math.log10(rough));
  const err = rough / pow10;
  let step = pow10;
  if (err >= 7.5) step = 10 * pow10;
  else if (err >= 3.5) step = 5 * pow10;
  else if (err >= 1.5) step = 2 * pow10;
  const ticks: number[] = [];
  const start = Math.floor(minVal / step) * step;
  let t = start;
  let i = 0;
  while (t <= maxVal + step * 0.01 && i < maxTicks * 6) {
    if (t >= minVal - step * 0.01) ticks.push(t);
    t += step;
    i++;
  }
  if (ticks.length === 0) ticks.push(minVal, maxVal);
  return ticks;
}

function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  const n = pts.length;
  const dx: number[] = [], dy: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1].x - pts[i].x || 1e-6;
    dy[i] = pts[i + 1].y - pts[i].y;
    m[i] = dy[i] / dx[i];
  }
  const t: number[] = new Array(n);
  t[0] = m[0];
  t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) {
    t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
    } else {
      const a = t[i] / m[i];
      const b = t[i + 1] / m[i];
      const h = Math.hypot(a, b);
      if (h > 3) {
        const k = 3 / h;
        t[i] = k * a * m[i];
        t[i + 1] = k * b * m[i];
      }
    }
  }
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const c1x = pts[i].x + dx[i] / 3;
    const c1y = pts[i].y + (t[i] * dx[i]) / 3;
    const c2x = pts[i + 1].x - dx[i] / 3;
    const c2y = pts[i + 1].y - (t[i + 1] * dx[i]) / 3;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${pts[i + 1].x} ${pts[i + 1].y}`;
  }
  return d;
}

function fmtMetric(v: number, metric: Metric) {
  if (metric === "profit") {
    if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(1)}K`;
    return `$${v.toFixed(2)}`;
  }
  const n = Math.round(v);
  return `${n} item${n === 1 ? "" : "s"}`;
}

function fmtYTick(v: number, metric: Metric) {
  if (metric === "profit") {
    if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
    return `$${Math.round(v)}`;
  }
  return String(Math.round(v));
}

function fmtTooltipTime(ts: number, mode: Mode) {
  const d = new Date(ts);
  if (mode === "daily") {
    return d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }
  if (mode === "yearly") {
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }
  if (mode === "weekly") {
    return d.toLocaleString(undefined, {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }
  if (mode === "monthly") {
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// ──────────────────────────────────────────────────────────────────────────
//  CHART  (event-based — one vertex per real sale)
// ──────────────────────────────────────────────────────────────────────────
function Chart({
  series,
  metric,
  loadingKey,
  mode,
}: {
  series: Series;
  metric: Metric;
  loadingKey: string;
  mode: Mode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 360 });
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    setHoverIdx(null);
    setAnimKey((k) => k + 1);
  }, [loadingKey]);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setSize({
          w: Math.max(280, e.contentRect.width),
          h: Math.max(240, e.contentRect.height),
        });
      }
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const { points, range, xTicks } = series;
  const max = Math.max(0, ...points.map((p) => p.value));
  const padTop = max === 0 ? 1 : max * 0.15;
  const yMin = 0;
  const yMax = max + padTop;

  const yTicks = computeYTicks(yMin, yMax, 5);
  const maxTickStr = fmtYTick(yTicks[yTicks.length - 1] ?? yMax, metric);
  const leftPad = Math.min(76, Math.max(44, 14 + maxTickStr.length * 7));

  const margin = { top: 14, right: 18, bottom: 28, left: leftPad };
  const plotW = Math.max(10, size.w - margin.left - margin.right);
  const plotH = Math.max(10, size.h - margin.top - margin.bottom);
  const baseY = margin.top + plotH;

  // Time-based X: position by actual timestamp within the range
  const span = Math.max(1, range.to - range.from);
  const xAtTs = (ts: number) =>
    margin.left + (plotW * (ts - range.from)) / span;
  const yAt = (v: number) =>
    margin.top + plotH * (1 - (v - yMin) / Math.max(1e-6, yMax - yMin));

  // Render line: connect real events. Anchor at baseline at range start/end so
  // the area fill is well-formed but no fake mid-range data points are added.
  const renderPts = points.map((p) => ({ x: xAtTs(p.ts), y: yAt(p.value) }));
  const lineD = smoothPath(renderPts);
  const areaD =
    renderPts.length > 0 && lineD
      ? `${lineD} L ${renderPts[renderPts.length - 1].x} ${baseY} L ${renderPts[0].x} ${baseY} Z`
      : "";

  // Hover: find nearest point by X distance (no virtual buckets)
  const handleMove = (e: React.MouseEvent<SVGRectElement>) => {
    if (points.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xRel = ((e.clientX - rect.left) / rect.width) * plotW;
    const cursorX = margin.left + xRel;
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < renderPts.length; i++) {
      const dx = Math.abs(renderPts[i].x - cursorX);
      if (dx < bestDist) {
        bestDist = dx;
        bestIdx = i;
      }
    }
    setHoverIdx(bestIdx);
  };
  const handleLeave = () => setHoverIdx(null);

  const hover = hoverIdx !== null ? points[hoverIdx] : null;
  const hoverPx = hover ? xAtTs(hover.ts) : 0;
  const hoverPy = hover ? yAt(hover.value) : 0;

  // Tooltip — locked at the top, only horizontal motion
  const TT_W_EST = metric === "profit" ? 200 : 220;
  let ttLeft = 0;
  const ttTop = 8;
  if (hover) {
    ttLeft = Math.max(
      margin.left + 4,
      Math.min(size.w - TT_W_EST - 4, hoverPx - TT_W_EST / 2),
    );
  }

  return (
    <div
      ref={wrapRef}
      className="relative w-full bg-card/40 rounded-xl border border-card-border overflow-hidden"
      style={{ height: 360 }}
    >
      <svg width={size.w} height={size.h} className="block">
        <defs>
          <linearGradient id="aFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(43 90% 55%)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="hsl(43 90% 55%)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Y grid + labels */}
        {yTicks.map((v, i) => {
          const y = yAt(v);
          return (
            <g key={i}>
              <line
                x1={margin.left}
                x2={margin.left + plotW}
                y1={y}
                y2={y}
                stroke="hsl(240 6% 22%)"
                strokeWidth={1}
                strokeDasharray={i === 0 ? "0" : "3 3"}
                strokeOpacity={i === 0 ? 0.9 : 0.55}
              />
              <text
                x={margin.left - 10}
                y={y + 4}
                fontSize="11"
                fill="hsl(240 5% 60%)"
                textAnchor="end"
              >
                {fmtYTick(v, metric)}
              </text>
            </g>
          );
        })}

        {/* X labels — generated from the timeline, NOT from points */}
        {xTicks.map((t, i) => {
          if (!t.label) return null;
          const x = xAtTs(t.ts);
          if (x < margin.left - 1 || x > margin.left + plotW + 1) return null;
          return (
            <text
              key={i}
              x={x}
              y={baseY + 18}
              fontSize="11"
              fill="hsl(240 5% 60%)"
              textAnchor="middle"
            >
              {t.label}
            </text>
          );
        })}

        {/* Line + area */}
        <g key={animKey} className="chart-reveal">
          {areaD && <path d={areaD} fill="url(#aFill)" />}
          {lineD && (
            <path
              d={lineD}
              fill="none"
              stroke="hsl(43 90% 55%)"
              strokeWidth={2.25}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </g>

        {/* Crosshair + active marker */}
        {hover && (
          <>
            <line
              x1={hoverPx}
              x2={hoverPx}
              y1={margin.top}
              y2={baseY}
              stroke="hsl(240 5% 65%)"
              strokeWidth={1}
              strokeDasharray="4 4"
              opacity={0.6}
            />
            <circle
              cx={hoverPx}
              cy={hoverPy}
              r={7}
              fill="hsl(43 90% 55%)"
              opacity={0.18}
            />
            <circle
              cx={hoverPx}
              cy={hoverPy}
              r={4}
              fill="hsl(43 90% 55%)"
              stroke="hsl(240 10% 8%)"
              strokeWidth={1.75}
            />
          </>
        )}

        {/* Hit layer */}
        <rect
          x={margin.left}
          y={margin.top}
          width={plotW}
          height={plotH}
          fill="transparent"
          onMouseMove={handleMove}
          onMouseLeave={handleLeave}
          style={{ cursor: "crosshair" }}
        />
      </svg>

      {/* Tooltip — top-anchored, X-only motion */}
      {hover && (
        <div
          className="pointer-events-none absolute z-10 px-3 py-1.5 rounded-full border border-border bg-popover/95 backdrop-blur-md shadow-xl text-xs flex items-center gap-3 whitespace-nowrap transition-[left] duration-100 ease-out"
          style={{ left: ttLeft, top: ttTop }}
        >
          <span className="text-muted-foreground">{fmtTooltipTime(hover.ts, mode)}</span>
          <span className="w-px h-3 bg-border" />
          <span className="font-semibold text-foreground">
            {fmtMetric(hover.value, metric)}
          </span>
        </div>
      )}

      {/* Empty state */}
      {points.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-xs text-muted-foreground">No activity in this period</p>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
//  PAGE
// ──────────────────────────────────────────────────────────────────────────
export default function Analytics() {
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<Mode>("monthly");
  const [metric, setMetric] = useState<Metric>("sales");
  const [custom, setCustom] = useState<{ from: number; to: number } | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [fromStr, setFromStr] = useState("");
  const [toStr, setToStr] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const events = useSaleEvents({ seedIfEmpty: true });

  useEffect(() => {
    setIsLoading(true);
    const t = setTimeout(() => setIsLoading(false), 280);
    return () => clearTimeout(t);
  }, [mode, metric, custom?.from, custom?.to]);

  const series = useMemo(
    () => buildSeries(mode, events, metric, custom),
    [mode, events, metric, custom],
  );

  const totalValue = useMemo(
    () => series.points.reduce((s, p) => s + p.value, 0),
    [series],
  );

  const applyCustom = () => {
    const f = new Date(fromStr).getTime();
    const t = new Date(toStr).getTime();
    if (Number.isFinite(f) && Number.isFinite(t) && t > f) {
      setCustom({ from: f, to: t });
      setMode("custom");
      setCustomOpen(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-20 bg-background/85 backdrop-blur-md border-b border-border">
        <div className="flex items-center gap-3 px-3 sm:px-5 h-14">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={() => setLocation("/")}
            aria-label="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-semibold leading-tight">Analytics</h1>
            <p className="text-[11px] text-muted-foreground truncate">{series.rangeLabel}</p>
          </div>

          <div className="ml-auto flex items-center gap-1 p-1 bg-card border border-card-border rounded-full overflow-x-auto">
            {MODES.map((m) => {
              if (m.id === "custom") {
                return (
                  <Popover key={m.id} open={customOpen} onOpenChange={setCustomOpen}>
                    <PopoverTrigger asChild>
                      <button
                        className={`px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-medium transition-colors flex items-center gap-1.5 ${
                          mode === m.id
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                        }`}
                      >
                        <CalendarIcon className="w-3 h-3" />
                        {m.label}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-3 border-border" align="end">
                      <p className="text-[11px] font-medium text-muted-foreground mb-2">
                        Custom range
                      </p>
                      <label className="block text-[11px] text-muted-foreground mb-1">From</label>
                      <input
                        type="date"
                        value={fromStr}
                        onChange={(e) => setFromStr(e.target.value)}
                        className="w-full mb-2 bg-secondary/50 rounded-md px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring/40"
                      />
                      <label className="block text-[11px] text-muted-foreground mb-1">To</label>
                      <input
                        type="date"
                        value={toStr}
                        onChange={(e) => setToStr(e.target.value)}
                        className="w-full mb-3 bg-secondary/50 rounded-md px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring/40"
                      />
                      <Button size="sm" className="w-full" onClick={applyCustom}>
                        Apply
                      </Button>
                    </PopoverContent>
                  </Popover>
                );
              }
              return (
                <button
                  key={m.id}
                  onClick={() => {
                    setMode(m.id);
                    setCustom(null);
                  }}
                  className={`px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-medium transition-colors ${
                    mode === m.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <div className="flex-1 flex">
        <main className="flex-1 min-w-0 p-3 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {metric === "sales" ? "Total items sold" : "Total profit"}
              </p>
              <p className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">
                {fmtMetric(totalValue, metric)}
              </p>
            </div>
            <div className="text-[11px] text-muted-foreground hidden sm:block">
              {series.points.length} sale{series.points.length === 1 ? "" : "s"}
            </div>
          </div>

          <div className="relative">
            {isLoading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-card/30 backdrop-blur-[1px]">
                <div className="w-6 h-6 rounded-full border-2 border-secondary border-t-primary animate-spin" />
              </div>
            )}
            <Chart
              series={series}
              metric={metric}
              mode={mode}
              loadingKey={`${mode}-${metric}-${custom?.from ?? 0}-${custom?.to ?? 0}`}
            />
          </div>
        </main>

        <div className="hidden sm:flex sticky top-14 h-[calc(100vh-3.5rem)] w-[68px] shrink-0 items-start justify-center pt-6">
          <div className="flex flex-col gap-2 p-1.5 bg-card border border-card-border rounded-full">
            <button
              onClick={() => setMetric("sales")}
              className={`relative w-11 h-11 rounded-full flex flex-col items-center justify-center transition-all duration-300 ${
                metric === "sales"
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
              title="Sales"
            >
              <DollarSign className="w-4 h-4" />
              <span className="text-[8px] mt-0.5 font-semibold tracking-wider">SALES</span>
            </button>
            <button
              onClick={() => setMetric("profit")}
              className={`relative w-11 h-11 rounded-full flex flex-col items-center justify-center transition-all duration-300 ${
                metric === "profit"
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
              title="Profit"
            >
              <TrendingUp className="w-4 h-4" />
              <span className="text-[8px] mt-0.5 font-semibold tracking-wider">PROFIT</span>
            </button>
          </div>
        </div>
      </div>

      <div className="sm:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex p-1 bg-card/95 backdrop-blur-md border border-card-border rounded-full shadow-2xl">
        <button
          onClick={() => setMetric("sales")}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all duration-300 ${
            metric === "sales" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
          }`}
        >
          <DollarSign className="w-3.5 h-3.5" />
          Sales
        </button>
        <button
          onClick={() => setMetric("profit")}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all duration-300 ${
            metric === "profit" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          Profit
        </button>
      </div>
    </div>
  );
}
