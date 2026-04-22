import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Calendar as CalendarIcon, ChevronDown, Search, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSaleEvents, type SaleEvent, type SaleItem } from "@/lib/analytics-store";
import { PRODUCTS_META, getProductMeta, colorForProduct, type ProductMeta } from "@/lib/products-meta";

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

type Bin = { ts: number; value: number; visible: boolean };
type XTick = { ts: number; label: string };
type ChartData = {
  bins: Bin[];
  rangeStart: number;
  rangeEnd: number;
  rangeLabel: string;
  xTicks: XTick[];
};

function withZeroAnchors(
  realPoints: Bin[],
  rangeStart: number,
  rangeEnd: number,
  anchorOffsetMs: number,
): Bin[] {
  if (realPoints.length === 0) {
    return [
      { ts: rangeStart, value: 0, visible: false },
      { ts: rangeEnd, value: 0, visible: false },
    ];
  }
  const out: Bin[] = [{ ts: rangeStart, value: 0, visible: false }];
  for (let i = 0; i < realPoints.length; i++) {
    const cur = realPoints[i];
    const prevTs = i === 0 ? rangeStart : realPoints[i - 1].ts;
    const nextTs = i === realPoints.length - 1 ? rangeEnd : realPoints[i + 1].ts;
    if (cur.ts - prevTs > 2 * anchorOffsetMs) {
      out.push({ ts: cur.ts - anchorOffsetMs, value: 0, visible: false });
    }
    out.push(cur);
    if (nextTs - cur.ts > 2 * anchorOffsetMs) {
      out.push({ ts: cur.ts + anchorOffsetMs, value: 0, visible: false });
    }
  }
  out.push({ ts: rangeEnd, value: 0, visible: false });
  out.sort((a, b) => a.ts - b.ts);
  return out;
}

function buildChartData(
  mode: Mode,
  events: SaleEvent[],
  metric: Metric,
  custom: { from: number; to: number } | null,
): ChartData {
  const now = new Date();
  const valueOf = (e: SaleEvent) => (metric === "sales" ? e.totalQty : e.totalProfit);

  if (mode === "daily") {
    const rangeStart = startOfDay(now);
    const rangeEnd = rangeStart + 86400000;
    const byMinute = new Map<number, number>();
    for (const e of events) {
      if (e.ts < rangeStart || e.ts >= rangeEnd) continue;
      const k = Math.floor(e.ts / 60000) * 60000;
      byMinute.set(k, (byMinute.get(k) ?? 0) + valueOf(e));
    }
    const real: Bin[] = Array.from(byMinute.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([ts, value]) => ({ ts, value, visible: true }));
    const xTicks: XTick[] = [];
    for (let h = 0; h <= 24; h += 3) {
      xTicks.push({
        ts: rangeStart + h * 3600000,
        label: h === 24 ? "24:00" : `${String(h).padStart(2, "0")}:00`,
      });
    }
    return {
      bins: withZeroAnchors(real, rangeStart, rangeEnd, 2 * 60000),
      rangeStart,
      rangeEnd,
      rangeLabel: now.toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      }),
      xTicks,
    };
  }

  let rangeStart: number;
  let rangeEnd: number;
  let rangeLabel: string;
  let xTicks: XTick[] = [];

  if (mode === "weekly") {
    rangeStart = startOfDay(now) - 6 * 86400000;
    rangeEnd = startOfDay(now) + 86400000;
    rangeLabel = "Last 7 days";
    for (let d = 0; d < 7; d++) {
      const ts = rangeStart + d * 86400000 + 43200000;
      xTicks.push({
        ts,
        label: new Date(ts).toLocaleDateString(undefined, { weekday: "short" }),
      });
    }
  } else if (mode === "monthly") {
    rangeStart = startOfMonth(now);
    const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
    rangeLabel = now.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    const stride = days <= 14 ? 2 : days <= 21 ? 3 : 4;
    for (let d = 1; d <= days; d += stride) {
      const ts = new Date(now.getFullYear(), now.getMonth(), d, 12, 0, 0).getTime();
      xTicks.push({ ts, label: String(d) });
    }
  } else if (mode === "yearly") {
    const yr = now.getFullYear();
    rangeStart = startOfYear(now);
    rangeEnd = new Date(yr + 1, 0, 1).getTime();
    rangeLabel = String(yr);
    for (let m = 0; m < 12; m++) {
      const ts = new Date(yr, m, 15, 0, 0, 0).getTime();
      xTicks.push({
        ts,
        label: new Date(yr, m, 1).toLocaleDateString(undefined, { month: "short" }),
      });
    }
  } else {
    const range = custom ?? {
      from: startOfDay(now) - 6 * 86400000,
      to: startOfDay(now) + 86400000,
    };
    rangeStart = range.from;
    rangeEnd = range.to;
    rangeLabel = `${new Date(rangeStart).toLocaleDateString()} – ${new Date(rangeEnd).toLocaleDateString()}`;
    const span = rangeEnd - rangeStart;
    const tickCount = 6;
    for (let i = 0; i <= tickCount; i++) {
      const ts = rangeStart + (span * i) / tickCount;
      xTicks.push({
        ts,
        label:
          span <= 2 * 86400000
            ? new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
            : new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      });
    }
  }

  const byDay = new Map<number, number>();
  for (const e of events) {
    if (e.ts < rangeStart || e.ts >= rangeEnd) continue;
    const dayStart = startOfDay(new Date(e.ts));
    byDay.set(dayStart, (byDay.get(dayStart) ?? 0) + valueOf(e));
  }
  const real: Bin[] = Array.from(byDay.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([dayStart, value]) => ({ ts: dayStart + 43200000, value, visible: true }));

  const bins = withZeroAnchors(real, rangeStart, rangeEnd, 12 * 3600000);
  return { bins, rangeStart, rangeEnd, rangeLabel, xTicks };
}

// ── Y axis helpers ─────────────────────────────────────────────────────────
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

function fmtBarLabel(v: number, metric: Metric) {
  if (metric === "profit") {
    if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(1)}K`;
    if (Math.abs(v) >= 100) return `$${Math.round(v)}`;
    return `$${v.toFixed(1)}`;
  }
  return String(Math.round(v));
}

function fmtYTick(v: number, metric: Metric) {
  if (metric === "profit") {
    if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
    return `$${Math.round(v)}`;
  }
  return String(Math.round(v));
}

// ── Product aggregation ────────────────────────────────────────────────────
type ProductAgg = {
  id: string;
  name: string;
  image?: string;
  color: string;
  value: number;
};

function aggregateProducts(
  events: SaleEvent[],
  metric: Metric,
  rangeStart: number,
  rangeEnd: number,
): ProductAgg[] {
  const totals = new Map<string, { name: string; value: number }>();
  const valueOf = (it: SaleItem) =>
    metric === "sales" ? it.qty : it.profit * it.qty;
  for (const e of events) {
    if (e.ts < rangeStart || e.ts >= rangeEnd) continue;
    for (const it of e.items) {
      const cur = totals.get(it.productId) ?? { name: it.name, value: 0 };
      cur.value += valueOf(it);
      cur.name = it.name;
      totals.set(it.productId, cur);
    }
  }
  return Array.from(totals.entries())
    .map(([id, v]) => {
      const meta = getProductMeta(id, v.name);
      return { id, name: meta.name, image: meta.image, color: colorForProduct(id), value: v.value };
    })
    .sort((a, b) => b.value - a.value);
}

// ──────────────────────────────────────────────────────────────────────────
//  SHARED COMPONENTS
// ──────────────────────────────────────────────────────────────────────────
function ProductThumb({ meta, size = 28 }: { meta: ProductMeta; size?: number }) {
  const initials = meta.name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      className="inline-flex items-center justify-center overflow-hidden bg-secondary/60 text-[9px] font-bold text-muted-foreground shrink-0 border border-white/8 shadow-[0_1px_3px_rgba(0,0,0,0.4)] rounded-md"
      style={{ width: size, height: size }}
    >
      {meta.image ? (
        <img
          src={meta.image}
          alt={meta.name}
          className="w-full h-full object-cover"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
      ) : (
        initials
      )}
    </span>
  );
}

function ProductPicker({
  currentId,
  excludeIds,
  onPick,
}: {
  currentId: string;
  excludeIds: Set<string>;
  onPick: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const items = useMemo(() => {
    const term = q.trim().toLowerCase();
    return PRODUCTS_META.filter((p) => {
      if (p.id !== currentId && excludeIds.has(p.id)) return false;
      if (!term) return true;
      return p.name.toLowerCase().includes(term);
    });
  }, [q, currentId, excludeIds]);

  return (
    <div className="w-52">
      <div className="relative mb-2">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search products…"
          className="w-full pl-7 pr-2 py-1.5 text-xs bg-secondary/40 rounded-md outline-none focus:ring-1 focus:ring-ring/50 placeholder:text-muted-foreground/50"
        />
      </div>
      <div className="max-h-52 overflow-y-auto -mx-1 pr-0.5">
        {items.length === 0 && (
          <p className="text-[11px] text-muted-foreground/70 text-center py-3">No matches</p>
        )}
        {items.map((p) => {
          const isCurrent = p.id === currentId;
          return (
            <button
              key={p.id}
              onClick={() => onPick(p.id)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-xs transition-colors ${
                isCurrent ? "bg-primary/12 text-foreground" : "hover:bg-secondary/50 text-foreground/85"
              }`}
            >
              <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: colorForProduct(p.id) }} />
              <ProductThumb meta={p} size={18} />
              <span className="truncate flex-1">{p.name}</span>
              {isCurrent && <Check className="w-3 h-3 text-primary shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
//  LINE CHART
// ──────────────────────────────────────────────────────────────────────────
function Chart({
  data,
  metric,
  loadingKey,
  mode,
}: {
  data: ChartData;
  metric: Metric;
  loadingKey: string;
  mode: Mode;
}) {
  const { bins, rangeStart, rangeEnd, xTicks } = data;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 300 });
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
          h: Math.max(200, e.contentRect.height),
        });
      }
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const max = Math.max(...bins.map((b) => b.value), 0);
  const padTop = max === 0 ? 1 : max * 0.15;
  const yMin = 0;
  const yMax = max + padTop;
  const yTicks = computeYTicks(yMin, yMax, 5);
  const maxTickStr = fmtYTick(yTicks[yTicks.length - 1] ?? yMax, metric);
  const leftPad = Math.min(76, Math.max(44, 14 + maxTickStr.length * 7));
  const margin = { top: 16, right: 18, bottom: 28, left: leftPad };
  const plotW = Math.max(10, size.w - margin.left - margin.right);
  const plotH = Math.max(10, size.h - margin.top - margin.bottom);
  const baseY = margin.top + plotH;
  const span = Math.max(1, rangeEnd - rangeStart);
  const xAt = (ts: number) => margin.left + (plotW * (ts - rangeStart)) / span;
  const yAt = (v: number) =>
    margin.top + plotH * (1 - (v - yMin) / Math.max(1e-6, yMax - yMin));

  const pts = bins.map((b) => ({ x: xAt(b.ts), y: yAt(b.value) }));
  const lineD = smoothPath(pts);
  const areaD =
    pts.length > 0
      ? `${lineD} L ${pts[pts.length - 1].x} ${baseY} L ${pts[0].x} ${baseY} Z`
      : "";

  const handleMove = (e: React.MouseEvent<SVGRectElement>) => {
    if (bins.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const rel = x / rect.width;
    const ts = rangeStart + rel * span;
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < bins.length; i++) {
      if (!bins[i].visible) continue;
      const d = Math.abs(bins[i].ts - ts);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    setHoverIdx(bestIdx >= 0 ? bestIdx : null);
  };
  const handleLeave = () => setHoverIdx(null);
  const TT_W_EST = metric === "profit" ? 180 : 200;
  const hover = hoverIdx !== null ? bins[hoverIdx] : null;
  const hoverPx = hover ? xAt(hover.ts) : 0;
  const hoverPy = hover ? yAt(hover.value) : 0;
  let ttLeft = 0;
  if (hover) {
    ttLeft = Math.max(margin.left + 4, Math.min(size.w - TT_W_EST - 4, hoverPx - TT_W_EST / 2));
  }
  const fmtTooltipTime = (ts: number) => {
    const d = new Date(ts);
    if (mode === "daily") return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true });
    if (mode === "yearly") return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    if (mode === "weekly") return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    if (mode === "monthly") return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
  };

  const gridCols = 6;
  const gridRows = yTicks.length - 1;

  return (
    <div
      ref={wrapRef}
      className="relative w-full bg-card/40 rounded-xl border border-card-border overflow-hidden"
      style={{ height: 300 }}
    >
      <svg width={size.w} height={size.h} className="block">
        <defs>
          <linearGradient id="aFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(43 90% 55%)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="hsl(43 90% 55%)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Subtle grid — vertical lines */}
        {Array.from({ length: gridCols + 1 }).map((_, i) => {
          const x = margin.left + (plotW * i) / gridCols;
          return (
            <line
              key={`vg-${i}`}
              x1={x} x2={x} y1={margin.top} y2={baseY}
              stroke="hsl(240 6% 20%)" strokeWidth={1} strokeOpacity={0.45}
            />
          );
        })}

        {/* Horizontal grid + Y labels */}
        {yTicks.map((v, i) => {
          const y = yAt(v);
          return (
            <g key={i}>
              <line
                x1={margin.left} x2={margin.left + plotW} y1={y} y2={y}
                stroke="hsl(240 6% 22%)" strokeWidth={1}
                strokeDasharray={i === 0 ? "0" : "3 3"}
                strokeOpacity={i === 0 ? 0.9 : 0.5}
              />
              <text x={margin.left - 10} y={y + 4} fontSize="10" fill="hsl(240 5% 55%)" textAnchor="end">
                {fmtYTick(v, metric)}
              </text>
            </g>
          );
        })}

        {/* Subtle grid — cell fills for every other row */}
        {gridRows > 0 && yTicks.slice(0, -1).map((v, i) => {
          const y1 = yAt(yTicks[i + 1]);
          const y2 = yAt(v);
          return i % 2 === 0 ? (
            <rect
              key={`gcell-${i}`}
              x={margin.left} y={y1} width={plotW} height={y2 - y1}
              fill="hsl(240 6% 14%)" fillOpacity={0.35}
            />
          ) : null;
        })}

        {/* X labels */}
        {xTicks.map((t, i) => (
          <text key={i} x={xAt(t.ts)} y={baseY + 17} fontSize="10" fill="hsl(240 5% 55%)" textAnchor="middle">
            {t.label}
          </text>
        ))}

        {/* Line + area */}
        <g key={animKey} className="chart-reveal">
          {areaD && <path d={areaD} fill="url(#aFill)" />}
          {lineD && (
            <path d={lineD} fill="none" stroke="hsl(43 90% 55%)" strokeWidth={2.25}
              strokeLinecap="round" strokeLinejoin="round" />
          )}
        </g>

        {/* Crosshair + active point */}
        {hover && (
          <>
            <line x1={hoverPx} x2={hoverPx} y1={margin.top} y2={baseY}
              stroke="hsl(240 5% 65%)" strokeWidth={1} strokeDasharray="4 4" opacity={0.6} />
            <circle cx={hoverPx} cy={hoverPy} r={7} fill="hsl(43 90% 55%)" opacity={0.18} />
            <circle cx={hoverPx} cy={hoverPy} r={4} fill="hsl(43 90% 55%)"
              stroke="hsl(240 10% 8%)" strokeWidth={1.75} />
          </>
        )}

        <rect x={margin.left} y={margin.top} width={plotW} height={plotH}
          fill="transparent" onMouseMove={handleMove} onMouseLeave={handleLeave}
          style={{ cursor: "crosshair" }} />
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute z-10 px-3 py-1.5 rounded-full border border-border bg-popover/95 backdrop-blur-md shadow-xl text-xs flex items-center gap-3 whitespace-nowrap transition-[left] duration-100 ease-out"
          style={{ left: ttLeft, top: 8 }}
        >
          <span className="text-muted-foreground">{fmtTooltipTime(hover.ts)}</span>
          <span className="w-px h-3 bg-border" />
          <span className="font-semibold text-foreground">{fmtMetric(hover.value, metric)}</span>
        </div>
      )}

      {bins.every((b) => b.value === 0) && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-xs text-muted-foreground/70">No activity in this period</p>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
//  TOP 5 PRODUCTS BAR CHART
// ──────────────────────────────────────────────────────────────────────────
const BAR_CHART_H = 180;

function TopProductsBar({
  slots,
  metric,
  excludeIds,
  onSwap,
}: {
  slots: ProductAgg[];
  metric: Metric;
  excludeIds: Set<string>;
  onSwap: (slotIdx: number, newId: string) => void;
}) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const max = Math.max(1, ...slots.map((s) => s.value));

  return (
    <div className="px-5 sm:px-6 pt-5 pb-4">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Top 5 Products</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Highest performers · click a bar to swap
          </p>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 sm:gap-4 items-end">
        {slots.map((p, i) => {
          const isZero = p.value === 0;
          const pct = isZero ? 0 : (p.value / max) * 100;
          const barH = isZero ? 4 : Math.max(8, (pct / 100) * BAR_CHART_H);
          const isHover = hoverIdx === i;
          const color = p.color;

          return (
            <Popover
              key={`${i}-${p.id}`}
              open={openIdx === i}
              onOpenChange={(o) => setOpenIdx(o ? i : null)}
            >
              <PopoverTrigger asChild>
                <button
                  onMouseEnter={() => setHoverIdx(i)}
                  onMouseLeave={() => setHoverIdx((c) => (c === i ? null : c))}
                  className="flex flex-col items-center gap-0 focus:outline-none group"
                  style={{ minWidth: 0 }}
                >
                  {/* Value label */}
                  <span
                    className={`text-[10px] sm:text-[11px] font-semibold tabular-nums mb-1.5 transition-colors duration-150 ${
                      isZero ? "text-muted-foreground/40" : isHover ? "text-foreground" : "text-foreground/80"
                    }`}
                  >
                    {isZero ? "—" : fmtBarLabel(p.value, metric)}
                  </span>

                  {/* Bar container */}
                  <div
                    className="relative w-full flex items-end"
                    style={{ height: BAR_CHART_H }}
                  >
                    {/* Grid lines inside bar area */}
                    {[25, 50, 75].map((pctLine) => (
                      <div
                        key={pctLine}
                        className="absolute left-0 right-0 border-t border-dashed border-white/5"
                        style={{ bottom: `${pctLine}%` }}
                      />
                    ))}

                    {/* The bar itself */}
                    <div
                      className="relative w-full transition-all duration-500 ease-out rounded-t-sm"
                      style={{
                        height: barH,
                        background: isZero
                          ? "hsl(240 6% 20%)"
                          : `linear-gradient(180deg, ${color} 0%, color-mix(in oklab, ${color} 50%, hsl(240 10% 8%)) 100%)`,
                        boxShadow: isHover && !isZero
                          ? `0 0 20px -4px ${color}88, inset 0 1px 0 rgba(255,255,255,0.2)`
                          : !isZero
                          ? `inset 0 1px 0 rgba(255,255,255,0.12)`
                          : undefined,
                      }}
                    >
                      {/* Top glow / highlight stripe */}
                      {!isZero && (
                        <div
                          className="absolute top-0 left-0 right-0 h-[3px] rounded-t-sm transition-opacity duration-300"
                          style={{
                            background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
                            opacity: isHover ? 1 : 0.7,
                            boxShadow: `0 0 8px 1px ${color}`,
                          }}
                        />
                      )}
                    </div>
                  </div>

                  {/* Label: image + name + chevron */}
                  <div className="mt-2.5 flex flex-col items-center gap-1 w-full">
                    <ProductThumb meta={getProductMeta(p.id, p.name)} size={28} />
                    <div className="flex items-center gap-0.5 max-w-full px-0.5">
                      <span className="text-[10px] truncate text-muted-foreground/80 group-hover:text-foreground transition-colors leading-tight text-center">
                        {p.name}
                      </span>
                      <ChevronDown className="w-2.5 h-2.5 text-muted-foreground/40 shrink-0" />
                    </div>
                  </div>
                </button>
              </PopoverTrigger>
              <PopoverContent align="center" side="top" className="p-2 border-border">
                <ProductPicker
                  currentId={p.id}
                  excludeIds={excludeIds}
                  onPick={(id) => { onSwap(i, id); setOpenIdx(null); }}
                />
              </PopoverContent>
            </Popover>
          );
        })}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
//  TOP 10 PRODUCTS LIST
// ──────────────────────────────────────────────────────────────────────────
function TopProductsList({
  items,
  metric,
}: {
  items: ProductAgg[];
  metric: Metric;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0) return null;

  return (
    <div className="px-5 sm:px-6 pt-1 pb-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground/70">
          Full ranking · top {items.length}
        </h3>
      </div>
      <ul className="flex flex-col gap-0">
        {items.map((p, i) => {
          const isZero = p.value === 0;
          const widthPct = isZero ? 1 : Math.max(3, (p.value / max) * 100);
          return (
            <li
              key={p.id}
              className="group flex items-center gap-3 py-2 px-2 -mx-2 rounded-lg hover:bg-secondary/20 transition-colors"
            >
              <span className="w-5 text-[11px] font-bold tabular-nums text-muted-foreground/50 text-right shrink-0">
                {i + 1}
              </span>
              <ProductThumb meta={getProductMeta(p.id, p.name)} size={28} />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium truncate text-foreground/85 group-hover:text-foreground transition-colors mb-1">
                  {p.name}
                </p>
                <div className="h-[5px] w-full bg-secondary/30 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{
                      width: `${widthPct}%`,
                      background: isZero
                        ? "hsl(240 6% 25%)"
                        : `linear-gradient(90deg, color-mix(in oklab, ${p.color} 60%, transparent), ${p.color})`,
                      boxShadow: !isZero ? `0 0 6px -2px ${p.color}` : undefined,
                      opacity: isZero ? 0.4 : 1,
                    }}
                  />
                </div>
              </div>
              <span className="text-[12px] font-semibold tabular-nums shrink-0 text-foreground/80 group-hover:text-foreground transition-colors">
                {isZero ? "—" : fmtBarLabel(p.value, metric)}
              </span>
            </li>
          );
        })}
      </ul>
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

  const data = useMemo(
    () => buildChartData(mode, events, metric, custom),
    [mode, events, metric, custom],
  );
  const { bins, rangeLabel } = data;

  const visibleBins = useMemo(() => bins.filter((b) => b.visible), [bins]);
  const totalValue = useMemo(
    () => visibleBins.reduce((s, b) => s + b.value, 0),
    [visibleBins],
  );

  const ranked = useMemo(
    () => aggregateProducts(events, metric, data.rangeStart, data.rangeEnd),
    [events, metric, data.rangeStart, data.rangeEnd],
  );

  const [barOverrides, setBarOverrides] = useState<Record<number, string>>({});

  const barSlots = useMemo<ProductAgg[]>(() => {
    const result: ProductAgg[] = [];
    const used = new Set<string>();
    const overrideIds = new Set(Object.values(barOverrides));
    for (let i = 0; i < 5; i++) {
      const overrideId = barOverrides[i];
      if (overrideId) {
        const found = ranked.find((p) => p.id === overrideId);
        if (found) {
          result.push(found);
        } else {
          const meta = getProductMeta(overrideId);
          result.push({ id: overrideId, name: meta.name, image: meta.image, color: colorForProduct(overrideId), value: 0 });
        }
        used.add(overrideId);
      } else {
        const next = ranked.find((p) => !used.has(p.id) && !overrideIds.has(p.id));
        if (next) {
          result.push(next);
          used.add(next.id);
        } else {
          const fallback = PRODUCTS_META.find((m) => !used.has(m.id) && !overrideIds.has(m.id));
          if (!fallback) break;
          result.push({ id: fallback.id, name: fallback.name, image: fallback.image, color: colorForProduct(fallback.id), value: 0 });
          used.add(fallback.id);
        }
      }
    }
    return result;
  }, [ranked, barOverrides]);

  const barIds = useMemo(() => new Set(barSlots.map((s) => s.id)), [barSlots]);

  const listItems = useMemo(
    () => ranked.slice(0, 10),
    [ranked],
  );

  const swapSlot = (slotIdx: number, newId: string) => {
    setBarOverrides((prev) => {
      const next = { ...prev };
      const existingSlot = Object.entries(next).find(([, id]) => id === newId)?.[0];
      if (existingSlot !== undefined && Number(existingSlot) !== slotIdx) {
        const oldId = barSlots[slotIdx]?.id;
        if (oldId) next[Number(existingSlot)] = oldId;
        else delete next[Number(existingSlot)];
      }
      next[slotIdx] = newId;
      return next;
    });
  };

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
      {/* Header */}
      <header className="sticky top-0 z-20 bg-background/90 backdrop-blur-md border-b border-border">
        <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 h-14">
          {/* Back */}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={() => setLocation("/")}
            aria-label="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>

          {/* Title */}
          <div className="min-w-0 shrink-0">
            <h1 className="text-base font-semibold leading-tight">Analytics</h1>
            <p className="text-[10px] text-muted-foreground truncate max-w-[120px] sm:max-w-none">{rangeLabel}</p>
          </div>

          {/* Sales / Profit toggle — centered */}
          <div className="flex-1 flex justify-center">
            <div className="flex items-center p-0.5 bg-card border border-card-border rounded-full gap-0.5">
              <button
                onClick={() => setMetric("sales")}
                className={`px-3 py-1 rounded-full text-[11px] sm:text-xs font-semibold flex items-center gap-1.5 transition-all duration-200 ${
                  metric === "sales"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="hidden sm:inline">Sales</span>
                <span className="sm:hidden">$</span>
              </button>
              <button
                onClick={() => setMetric("profit")}
                className={`px-3 py-1 rounded-full text-[11px] sm:text-xs font-semibold flex items-center gap-1.5 transition-all duration-200 ${
                  metric === "profit"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="hidden sm:inline">Profit</span>
                <span className="sm:hidden">%</span>
              </button>
            </div>
          </div>

          {/* Time mode pills */}
          <div className="flex items-center gap-0.5 p-0.5 bg-card border border-card-border rounded-full overflow-x-auto shrink-0">
            {MODES.map((m) => {
              if (m.id === "custom") {
                return (
                  <Popover key={m.id} open={customOpen} onOpenChange={setCustomOpen}>
                    <PopoverTrigger asChild>
                      <button
                        className={`px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-medium transition-colors flex items-center gap-1 ${
                          mode === m.id
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                        }`}
                      >
                        <CalendarIcon className="w-3 h-3" />
                        <span className="hidden sm:inline">{m.label}</span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-60 p-3 border-border" align="end">
                      <p className="text-[11px] font-semibold text-muted-foreground mb-3">Custom range</p>
                      <label className="block text-[10px] text-muted-foreground mb-1">From</label>
                      <input
                        type="date"
                        value={fromStr}
                        onChange={(e) => setFromStr(e.target.value)}
                        className="w-full mb-2.5 bg-secondary/50 rounded-md px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring/40"
                      />
                      <label className="block text-[10px] text-muted-foreground mb-1">To</label>
                      <input
                        type="date"
                        value={toStr}
                        onChange={(e) => setToStr(e.target.value)}
                        className="w-full mb-3 bg-secondary/50 rounded-md px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring/40"
                      />
                      <Button size="sm" className="w-full" onClick={applyCustom}>Apply</Button>
                    </PopoverContent>
                  </Popover>
                );
              }
              return (
                <button
                  key={m.id}
                  onClick={() => { setMode(m.id); setCustom(null); }}
                  className={`px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-medium transition-colors ${
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

      {/* Body */}
      <main className="flex-1 min-w-0 p-3 sm:p-5 max-w-5xl w-full mx-auto">
        {/* Summary */}
        <div className="mb-4 flex items-end gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
              {metric === "sales" ? "Total items sold" : "Total profit"}
            </p>
            <p className="text-3xl sm:text-4xl font-bold tracking-tight mt-0.5">
              {fmtMetric(totalValue, metric)}
            </p>
          </div>
          <p className="text-[11px] text-muted-foreground/60 pb-1">
            {visibleBins.length} data point{visibleBins.length === 1 ? "" : "s"}
          </p>
        </div>

        {/* Line chart */}
        <div className="relative mb-6">
          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-card/40 backdrop-blur-[2px]">
              <div className="w-5 h-5 rounded-full border-2 border-secondary border-t-primary animate-spin" />
            </div>
          )}
          <Chart
            data={data}
            metric={metric}
            mode={mode}
            loadingKey={`${mode}-${metric}-${custom?.from ?? 0}-${custom?.to ?? 0}`}
          />
        </div>

        {/* Product analytics card */}
        <section className="rounded-2xl bg-card/35 border border-card-border overflow-hidden shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]">
          <TopProductsBar
            slots={barSlots}
            metric={metric}
            excludeIds={barIds}
            onSwap={swapSlot}
          />
          {listItems.length > 0 && (
            <>
              <div className="h-px bg-gradient-to-r from-transparent via-border/50 to-transparent mx-5 sm:mx-6" />
              <TopProductsList items={listItems} metric={metric} />
            </>
          )}
        </section>
      </main>
    </div>
  );
}
