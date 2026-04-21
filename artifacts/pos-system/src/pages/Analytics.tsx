import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  Calendar as CalendarIcon,
  ChevronDown,
  DollarSign,
  TrendingUp,
  Search,
  X,
  Replace,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useAnalyticsEvents,
  loadBarSlots,
  saveBarSlots,
  seedDemoEventsIfEmpty,
  type SaleEvent,
} from "@/lib/analytics-store";

type Mode = "daily" | "weekly" | "monthly" | "yearly" | "custom";
type Metric = "sales" | "profit";

type ProductLite = {
  id: string;
  name: string;
  image?: string;
  price: number;
};

// ── Time window helpers ───────────────────────────────────────────────────
type Window = { start: number; end: number; label: string };

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
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x.getTime();
}

function getWindow(mode: Mode, customRange: { from: number; to: number } | null): Window {
  const now = new Date();
  switch (mode) {
    case "daily": {
      return {
        start: startOfDay(now),
        end: startOfDay(now) + 24 * 60 * 60 * 1000,
        label: now.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }),
      };
    }
    case "weekly": {
      const start = startOfDay(now) - 6 * 24 * 60 * 60 * 1000;
      return {
        start,
        end: startOfDay(now) + 24 * 60 * 60 * 1000,
        label: "Last 7 days",
      };
    }
    case "monthly": {
      const start = startOfMonth(now);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
      return {
        start,
        end,
        label: now.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
      };
    }
    case "yearly": {
      const start = startOfYear(now);
      const end = new Date(now.getFullYear() + 1, 0, 1).getTime();
      return {
        start,
        end,
        label: String(now.getFullYear()),
      };
    }
    case "custom": {
      if (customRange) {
        return {
          start: customRange.from,
          end: customRange.to,
          label: `${new Date(customRange.from).toLocaleDateString()} – ${new Date(customRange.to).toLocaleDateString()}`,
        };
      }
      return { start: startOfDay(now), end: endOfDay(now), label: "Custom" };
    }
  }
}

function getGridSegments(mode: Mode, win: Window): { ts: number; label: string }[] {
  const segs: { ts: number; label: string }[] = [];
  if (mode === "daily") {
    for (let h = 0; h <= 24; h += 3) {
      const t = win.start + h * 60 * 60 * 1000;
      segs.push({ ts: t, label: h === 24 ? "" : `${h.toString().padStart(2, "0")}:00` });
    }
  } else if (mode === "weekly") {
    for (let d = 0; d < 7; d++) {
      const t = win.start + d * 24 * 60 * 60 * 1000;
      const date = new Date(t);
      segs.push({ ts: t, label: date.toLocaleDateString(undefined, { weekday: "short" }) });
    }
  } else if (mode === "monthly") {
    const startDate = new Date(win.start);
    const daysInMonth = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0).getDate();
    const step = Math.max(1, Math.floor(daysInMonth / 8));
    for (let d = 1; d <= daysInMonth; d += step) {
      const t = new Date(startDate.getFullYear(), startDate.getMonth(), d).getTime();
      segs.push({ ts: t, label: String(d) });
    }
  } else if (mode === "yearly") {
    const yr = new Date(win.start).getFullYear();
    for (let m = 0; m < 12; m++) {
      const t = new Date(yr, m, 1).getTime();
      segs.push({
        ts: t,
        label: new Date(yr, m, 1).toLocaleDateString(undefined, { month: "short" }),
      });
    }
  } else {
    // Custom: ~8 even segments
    const count = 8;
    const step = (win.end - win.start) / count;
    for (let i = 0; i <= count; i++) {
      const t = win.start + i * step;
      segs.push({ ts: t, label: new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" }) });
    }
  }
  return segs;
}

function formatTooltipTs(ts: number, mode: Mode): string {
  const d = new Date(ts);
  if (mode === "daily") return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (mode === "weekly") return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  if (mode === "monthly") return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  if (mode === "yearly") return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return d.toLocaleString();
}

function formatValue(v: number, metric: Metric): string {
  if (metric === "profit" || metric === "sales") return `$${v.toFixed(2)}`;
  return String(v);
}

// ── Color palette (dark-mode friendly muted tones) ────────────────────────
const BAR_PALETTE = [
  "hsl(43 70% 55%)",   // soft amber
  "hsl(200 50% 55%)",  // soft sky
  "hsl(160 35% 50%)",  // muted teal
  "hsl(280 35% 60%)",  // muted lavender
  "hsl(15 55% 58%)",   // muted coral
  "hsl(95 30% 55%)",   // sage
  "hsl(220 30% 60%)",  // slate-blue
  "hsl(340 35% 60%)",  // dusty pink
];

function colorForProduct(productId: string, idx: number): string {
  // Stable hash for persistence across refresh
  let h = 0;
  for (let i = 0; i < productId.length; i++) h = (h * 31 + productId.charCodeAt(i)) | 0;
  const palette = BAR_PALETTE;
  const baseIdx = (Math.abs(h) + idx) % palette.length;
  return palette[baseIdx];
}

// ──────────────────────────────────────────────────────────────────────────
//  LINE GRAPH (Google-style, custom SVG)
// ──────────────────────────────────────────────────────────────────────────
type LinePoint = { ts: number; value: number; event: SaleEvent };

function LineGraph({
  points,
  win,
  mode,
  metric,
}: {
  points: LinePoint[];
  win: Window;
  mode: Mode;
  metric: Metric;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 320 });
  const [hover, setHover] = useState<{ x: number; idx: number | null } | null>(null);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setSize({ w: Math.max(280, e.contentRect.width), h: Math.max(220, e.contentRect.height) });
      }
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const padL = 48,
    padR = 16,
    padT = 16,
    padB = 28;
  const innerW = size.w - padL - padR;
  const innerH = size.h - padT - padB;

  const grid = getGridSegments(mode, win);

  const maxVal = useMemo(() => {
    if (points.length === 0) return 10;
    const m = Math.max(...points.map((p) => p.value));
    // Round up to a nice value
    const niceSteps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
    for (const s of niceSteps) if (m <= s) return s;
    return Math.ceil(m / 1000) * 1000;
  }, [points]);

  const xFor = (ts: number) => padL + ((ts - win.start) / (win.end - win.start)) * innerW;
  const yFor = (v: number) => padT + innerH - (v / maxVal) * innerH;

  // Build line path: start at (windowStart, 0), pass through real points, end at min(now, windowEnd)
  const baselineY = yFor(0);
  const sortedPts = [...points].sort((a, b) => a.ts - b.ts);
  const nowTs = Math.min(Date.now(), win.end);

  const pathPts: { x: number; y: number }[] = [];
  pathPts.push({ x: xFor(win.start), y: baselineY });
  for (const p of sortedPts) {
    pathPts.push({ x: xFor(p.ts), y: yFor(p.value) });
  }
  // Extend to "now" if there are points; flat at last value
  if (sortedPts.length > 0 && nowTs > sortedPts[sortedPts.length - 1].ts) {
    pathPts.push({ x: xFor(nowTs), y: yFor(sortedPts[sortedPts.length - 1].value) });
  } else if (sortedPts.length === 0) {
    pathPts.push({ x: xFor(nowTs), y: baselineY });
  }

  // Monotone cubic interpolation — smooth without overshoot or loops
  function buildSmoothPath(pts: { x: number; y: number }[]): string {
    if (pts.length === 0) return "";
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
    const n = pts.length;
    const dx: number[] = new Array(n - 1);
    const dy: number[] = new Array(n - 1);
    const m: number[] = new Array(n - 1); // secant slopes
    for (let i = 0; i < n - 1; i++) {
      dx[i] = pts[i + 1].x - pts[i].x || 1e-6;
      dy[i] = pts[i + 1].y - pts[i].y;
      m[i] = dy[i] / dx[i];
    }
    // Tangents at each point
    const t: number[] = new Array(n);
    t[0] = m[0];
    t[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) {
      if (m[i - 1] * m[i] <= 0) {
        t[i] = 0; // ensure monotonicity at extrema
      } else {
        t[i] = (m[i - 1] + m[i]) / 2;
      }
    }
    // Limit tangents (Fritsch-Carlson)
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

  const linePath = buildSmoothPath(pathPts);
  const areaPath =
    pathPts.length > 0
      ? linePath +
        ` L ${pathPts[pathPts.length - 1].x} ${baselineY} L ${pathPts[0].x} ${baselineY} Z`
      : "";

  // Y-axis ticks
  const yTicks = 4;
  const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) => (maxVal * i) / yTicks);

  // Hover: find nearest real point by x
  const handleMove = (e: React.MouseEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + padL; // adjust because rect is inner
    if (sortedPts.length === 0) {
      setHover({ x, idx: null });
      return;
    }
    let nearest = 0;
    let best = Infinity;
    for (let i = 0; i < sortedPts.length; i++) {
      const px = xFor(sortedPts[i].ts);
      const d = Math.abs(px - x);
      if (d < best) {
        best = d;
        nearest = i;
      }
    }
    setHover({ x, idx: nearest });
  };

  const handleLeave = () => setHover(null);

  const hoverPoint = hover && hover.idx !== null ? sortedPts[hover.idx] : null;

  return (
    <div ref={wrapRef} className="relative w-full" style={{ height: 320 }}>
      <svg width={size.w} height={size.h} className="block">
        <defs>
          <linearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(43 90% 55%)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="hsl(43 90% 55%)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Y grid + labels */}
        {yTickVals.map((v, i) => {
          const y = yFor(v);
          return (
            <g key={i}>
              <line
                x1={padL}
                x2={size.w - padR}
                y1={y}
                y2={y}
                stroke="hsl(240 10% 18%)"
                strokeWidth={1}
                strokeDasharray={i === 0 ? "0" : "2 4"}
              />
              <text
                x={padL - 8}
                y={y + 3}
                fontSize="10"
                fill="hsl(240 5% 55%)"
                textAnchor="end"
              >
                {metric === "sales" || metric === "profit" ? `$${v.toFixed(0)}` : v.toFixed(0)}
              </text>
            </g>
          );
        })}

        {/* X grid labels */}
        {grid.map((g, i) => {
          const x = xFor(g.ts);
          if (x < padL || x > size.w - padR) return null;
          return (
            <text
              key={i}
              x={x}
              y={size.h - 8}
              fontSize="10"
              fill="hsl(240 5% 55%)"
              textAnchor="middle"
            >
              {g.label}
            </text>
          );
        })}

        {/* Area + line */}
        {areaPath && <path d={areaPath} fill="url(#lineFill)" />}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke="hsl(43 90% 55%)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Hover guideline */}
        {hover && (
          <line
            x1={hover.x}
            x2={hover.x}
            y1={padT}
            y2={padT + innerH}
            stroke="hsl(240 5% 55%)"
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.5}
          />
        )}

        {/* Hovered point marker */}
        {hoverPoint && (
          <>
            <circle
              cx={xFor(hoverPoint.ts)}
              cy={yFor(hoverPoint.value)}
              r={6}
              fill="hsl(43 90% 55%)"
              opacity={0.18}
            />
            <circle
              cx={xFor(hoverPoint.ts)}
              cy={yFor(hoverPoint.value)}
              r={3.5}
              fill="hsl(43 90% 55%)"
              stroke="hsl(240 10% 8%)"
              strokeWidth={1.5}
            />
          </>
        )}

        {/* Capture rect (sits on top of inner area) */}
        <rect
          x={padL}
          y={padT}
          width={innerW}
          height={innerH}
          fill="transparent"
          onMouseMove={handleMove}
          onMouseLeave={handleLeave}
          style={{ cursor: "crosshair" }}
        />
      </svg>

      {/* Tooltip */}
      {hoverPoint && (
        <div
          className="pointer-events-none absolute z-10 px-2.5 py-1.5 rounded-lg border border-border bg-popover/95 backdrop-blur-sm shadow-xl text-xs"
          style={{
            left: Math.min(
              size.w - 160,
              Math.max(padL, xFor(hoverPoint.ts) - 70)
            ),
            top: Math.max(8, yFor(hoverPoint.value) - 56),
            minWidth: 140,
          }}
        >
          <div className="text-muted-foreground text-[10px] mb-0.5">
            {formatTooltipTs(hoverPoint.ts, mode)}
          </div>
          <div className="font-semibold text-foreground">
            {formatValue(hoverPoint.value, metric)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {hoverPoint.event.items.length} item{hoverPoint.event.items.length !== 1 ? "s" : ""}
          </div>
        </div>
      )}

      {/* Empty state */}
      {points.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-muted-foreground text-sm">No activity in this period yet</p>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
//  BAR GRAPH (Top 5, custom SVG, with replacement)
// ──────────────────────────────────────────────────────────────────────────
type BarDatum = {
  productId: string;
  name: string;
  image?: string;
  value: number;
};

function BarGraph({
  bars,
  metric,
  allProducts,
  onReplace,
}: {
  bars: (BarDatum | null)[]; // length 5; null = empty slot waiting for replacement (rare)
  metric: Metric;
  allProducts: ProductLite[];
  onReplace: (slot: number, productId: string | null) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(700);
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setW(Math.max(300, e.contentRect.width));
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const valueRowH = 18;
  const barAreaH = 170;
  const imageSize = 36;
  const nameRowH = 18;
  const baselineGap = 6;
  const totalH = valueRowH + barAreaH + baselineGap + imageSize + 6 + nameRowH;

  const max = Math.max(...bars.map((b) => (b ? b.value : 0)), 1);
  const slotCount = 5;
  const slotW = w / slotCount;
  const barWidth = Math.min(48, slotW * 0.5);

  const [search, setSearch] = useState("");
  const [openSlot, setOpenSlot] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allProducts;
    return allProducts.filter((p) => p.name.toLowerCase().includes(q));
  }, [search, allProducts]);

  return (
    <div ref={wrapRef} className="w-full">
      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(${slotCount}, 1fr)`, height: totalH }}
      >
        {bars.map((b, i) => {
          const value = b ? b.value : 0;
          const ratio = value / max;
          const barH = b ? Math.max(value > 0 ? 6 : 4, ratio * (barAreaH - 8)) : 4;
          const color = b ? colorForProduct(b.productId, i) : "hsl(240 10% 22%)";
          return (
            <div key={i} className="relative flex flex-col items-stretch">
              {/* Replace button */}
              <Popover
                open={openSlot === i}
                onOpenChange={(o) => {
                  setOpenSlot(o ? i : null);
                  if (o) setSearch("");
                }}
              >
                <PopoverTrigger asChild>
                  <button
                    className="absolute top-0 right-1 z-10 w-6 h-6 rounded-full bg-secondary/70 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center opacity-50 hover:opacity-100"
                    aria-label="Replace product"
                  >
                    <Replace className="w-3 h-3" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0 border-border" align="end">
                  <div className="p-2 border-b border-border">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        autoFocus
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search product…"
                        className="w-full bg-secondary/40 rounded-md pl-7 pr-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring/30"
                      />
                    </div>
                  </div>
                  <ScrollArea className="max-h-64">
                    <div className="p-1">
                      {b && (
                        <button
                          onClick={() => {
                            onReplace(i, null);
                            setOpenSlot(null);
                          }}
                          className="w-full text-left px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-secondary rounded-md flex items-center gap-2"
                        >
                          <X className="w-3 h-3" />
                          Reset to auto top
                        </button>
                      )}
                      {filtered.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => {
                            onReplace(i, p.id);
                            setOpenSlot(null);
                          }}
                          className="w-full text-left px-2 py-1.5 text-xs hover:bg-secondary rounded-md flex items-center gap-2"
                        >
                          <div className="w-6 h-6 rounded bg-secondary shrink-0 overflow-hidden flex items-center justify-center">
                            {p.image ? (
                              <img src={p.image} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-[9px] font-bold text-muted-foreground">
                                {p.name.slice(0, 2).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <span className="truncate">{p.name}</span>
                        </button>
                      ))}
                      {filtered.length === 0 && (
                        <div className="text-center text-xs text-muted-foreground py-4">
                          No products
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>

              {/* Value label row */}
              <div className="flex items-end justify-center" style={{ height: valueRowH }}>
                {b && value > 0 && (
                  <div className="text-[11px] font-mono font-semibold text-foreground/90 leading-none">
                    {formatValue(value, metric)}
                  </div>
                )}
              </div>

              {/* Bar area (bar grows from bottom) */}
              <div className="relative flex items-end justify-center" style={{ height: barAreaH }}>
                <div
                  className="rounded-t-md transition-[height] duration-500 ease-out"
                  style={{
                    width: barWidth,
                    height: barH,
                    background: b
                      ? `linear-gradient(180deg, ${color} 0%, ${color.replace(
                          "55%)",
                          "42%)"
                        )} 100%)`
                      : "hsl(240 10% 14%)",
                    opacity: b ? 1 : 0.55,
                    boxShadow: b ? `0 -2px 12px ${color}30` : "none",
                  }}
                />
              </div>

              {/* Baseline */}
              <div
                className="bg-border/60"
                style={{ height: 1, marginTop: baselineGap - 1 }}
              />

              {/* Image */}
              <div
                className="mx-auto mt-1.5 rounded-md overflow-hidden bg-secondary border border-border"
                style={{ width: imageSize, height: imageSize }}
              >
                {b?.image ? (
                  <img src={b.image} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[9px] font-bold text-muted-foreground">
                    {b ? b.name.slice(0, 2).toUpperCase() : "—"}
                  </div>
                )}
              </div>

              {/* Name (single) */}
              <div className="px-1 mt-1 text-center" style={{ height: nameRowH }}>
                <div className="text-[10px] font-medium text-foreground/85 truncate leading-tight">
                  {b?.name ?? "—"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
//  ANALYTICS PAGE
// ──────────────────────────────────────────────────────────────────────────
const PRODUCTS_KEY = "pos.products.snapshot.v1";

function loadProductsSnapshot(): ProductLite[] {
  try {
    const raw = localStorage.getItem(PRODUCTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export default function Analytics() {
  const [, setLocation] = useLocation();
  const events = useAnalyticsEvents();

  // Self-seed demo data if a user lands here directly with no events recorded yet
  useEffect(() => {
    const snap = loadProductsSnapshot();
    if (snap.length > 0) {
      seedDemoEventsIfEmpty(
        snap.map((p) => ({ ...p, profit: Math.max(0.5, p.price * 0.3) }))
      );
    }
  }, []);

  const [mode, setMode] = useState<Mode>("weekly");
  const [metric, setMetric] = useState<Metric>("sales");
  const [customRange, setCustomRange] = useState<{ from: number; to: number } | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customFromStr, setCustomFromStr] = useState("");
  const [customToStr, setCustomToStr] = useState("");
  const [barSlots, setBarSlots] = useState<(string | null)[]>(loadBarSlots());

  const win = getWindow(mode, customRange);

  // Filter events to window
  const inWindow = useMemo(
    () => events.filter((e) => e.ts >= win.start && e.ts <= win.end).sort((a, b) => a.ts - b.ts),
    [events, win.start, win.end]
  );

  // Line points: per-event metric value
  const linePoints: LinePoint[] = useMemo(
    () =>
      inWindow.map((ev) => ({
        ts: ev.ts,
        value: metric === "sales" ? ev.total : ev.totalProfit,
        event: ev,
      })),
    [inWindow, metric]
  );

  // Per-product aggregation for bars + top list
  const productAgg = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; image?: string; sales: number; profit: number; qty: number }
    >();
    for (const ev of inWindow) {
      for (const it of ev.items) {
        const cur = map.get(it.productId) ?? {
          id: it.productId,
          name: it.name,
          image: it.image,
          sales: 0,
          profit: 0,
          qty: 0,
        };
        cur.sales += it.price * it.qty;
        cur.profit += it.profit * it.qty;
        cur.qty += it.qty;
        // Keep latest name/image
        cur.name = it.name;
        cur.image = it.image ?? cur.image;
        map.set(it.productId, cur);
      }
    }
    return Array.from(map.values());
  }, [inWindow]);

  const allProducts: ProductLite[] = useMemo(() => {
    const snap = loadProductsSnapshot();
    if (snap.length > 0) return snap;
    // Fallback: products derived from events
    const seen = new Map<string, ProductLite>();
    for (const ev of events) {
      for (const it of ev.items) {
        if (!seen.has(it.productId)) {
          seen.set(it.productId, { id: it.productId, name: it.name, image: it.image, price: it.price });
        }
      }
    }
    return Array.from(seen.values());
  }, [events]);

  // Build top-5 bars: respect custom slots first, then auto-fill remaining with top performers
  const topBars: (BarDatum | null)[] = useMemo(() => {
    const sorted = [...productAgg].sort((a, b) =>
      metric === "sales" ? b.sales - a.sales : b.profit - a.profit
    );
    const auto = sorted.slice();
    const used = new Set<string>();
    const result: (BarDatum | null)[] = [];

    for (let i = 0; i < 5; i++) {
      const customId = barSlots[i];
      if (customId) {
        const fromAgg = productAgg.find((p) => p.id === customId);
        const fromList = allProducts.find((p) => p.id === customId);
        if (fromAgg) {
          used.add(fromAgg.id);
          result.push({
            productId: fromAgg.id,
            name: fromAgg.name,
            image: fromAgg.image,
            value: metric === "sales" ? fromAgg.sales : fromAgg.profit,
          });
        } else if (fromList) {
          used.add(fromList.id);
          result.push({
            productId: fromList.id,
            name: fromList.name,
            image: fromList.image,
            value: 0,
          });
        } else {
          result.push(null);
        }
      } else {
        result.push(null); // placeholder, filled below
      }
    }
    // Fill nulls with auto top performers not yet used
    let autoIdx = 0;
    for (let i = 0; i < 5; i++) {
      if (result[i] !== null) continue;
      while (autoIdx < auto.length && used.has(auto[autoIdx].id)) autoIdx++;
      const a = auto[autoIdx];
      if (a) {
        used.add(a.id);
        result[i] = {
          productId: a.id,
          name: a.name,
          image: a.image,
          value: metric === "sales" ? a.sales : a.profit,
        };
        autoIdx++;
      }
    }
    return result;
  }, [productAgg, barSlots, metric, allProducts]);

  const top10 = useMemo(() => {
    const sorted = [...productAgg].sort((a, b) =>
      metric === "sales" ? b.sales - a.sales : b.profit - a.profit
    );
    return sorted.slice(0, 10);
  }, [productAgg, metric]);

  const top10Max = useMemo(
    () => Math.max(...top10.map((p) => (metric === "sales" ? p.sales : p.profit)), 1),
    [top10, metric]
  );

  const totalForWindow = useMemo(
    () =>
      inWindow.reduce(
        (s, e) => s + (metric === "sales" ? e.total : e.totalProfit),
        0
      ),
    [inWindow, metric]
  );

  const replaceSlot = (slot: number, productId: string | null) => {
    setBarSlots((prev) => {
      const next = [...prev];
      next[slot] = productId;
      saveBarSlots(next);
      return next;
    });
  };

  const applyCustomRange = () => {
    const from = new Date(customFromStr).getTime();
    const to = new Date(customToStr).getTime();
    if (!isNaN(from) && !isNaN(to) && from < to) {
      setCustomRange({ from, to: to + 24 * 60 * 60 * 1000 - 1 });
      setMode("custom");
      setCustomOpen(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-background text-foreground dark">
      {/* Header */}
      <header className="h-14 sm:h-16 border-b border-border flex items-center px-3 sm:px-6 shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-20">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/")}
          className="rounded-full mr-2"
          aria-label="Back"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="text-base sm:text-lg font-semibold">Analytics</h1>
        <span className="ml-3 text-xs text-muted-foreground hidden sm:inline">
          {win.label}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {metric === "sales" ? "Total Sales" : "Total Profit"}
            </div>
            <div className="font-bold text-primary tracking-tight text-base sm:text-lg">
              ${totalForWindow.toFixed(2)}
            </div>
          </div>
        </div>
      </header>

      <ScrollArea className="flex-1">
        <div className="flex">
          {/* Main content */}
          <div className="flex-1 min-w-0 p-3 sm:p-6 space-y-4 sm:space-y-6 pb-24">
            {/* Top filter bar */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
              {(["daily", "weekly", "monthly", "yearly"] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setMode(m);
                    setCustomRange(null);
                  }}
                  className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all duration-250 capitalize ${
                    mode === m
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                >
                  {m}
                </button>
              ))}
              <Popover open={customOpen} onOpenChange={setCustomOpen}>
                <PopoverTrigger asChild>
                  <button
                    className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all duration-250 flex items-center gap-1.5 ${
                      mode === "custom"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary"
                    }`}
                  >
                    <CalendarIcon className="w-3.5 h-3.5" />
                    Custom
                    <ChevronDown className="w-3 h-3 opacity-70" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-3" align="start">
                  <div className="text-xs font-medium mb-2">Date range</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground">From</label>
                      <input
                        type="date"
                        value={customFromStr}
                        onChange={(e) => setCustomFromStr(e.target.value)}
                        className="w-full bg-secondary/40 rounded-md px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring/30"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">To</label>
                      <input
                        type="date"
                        value={customToStr}
                        onChange={(e) => setCustomToStr(e.target.value)}
                        className="w-full bg-secondary/40 rounded-md px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring/30"
                      />
                    </div>
                  </div>
                  <Button onClick={applyCustomRange} className="w-full mt-3 h-8 text-xs">
                    Apply
                  </Button>
                </PopoverContent>
              </Popover>
            </div>

            {/* Line graph card */}
            <div className="bg-card border border-card-border rounded-2xl p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-sm sm:text-base font-semibold">
                    {metric === "sales" ? "Sales over time" : "Profit over time"}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {inWindow.length} event{inWindow.length !== 1 ? "s" : ""} · {win.label}
                  </p>
                </div>
              </div>
              <LineGraph points={linePoints} win={win} mode={mode} metric={metric} />
            </div>

            {/* Bar graph card */}
            <div className="bg-card border border-card-border rounded-2xl p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-sm sm:text-base font-semibold">Top 5 products</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Tap the swap icon on any bar to replace
                  </p>
                </div>
              </div>
              <BarGraph
                bars={topBars}
                metric={metric}
                allProducts={allProducts}
                onReplace={replaceSlot}
              />
            </div>

            {/* Top 10 list */}
            <div className="bg-card border border-card-border rounded-2xl p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm sm:text-base font-semibold">Top 10 products</h2>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  by {metric}
                </span>
              </div>
              {top10.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  No data in this period
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {top10.map((p, i) => {
                    const value = metric === "sales" ? p.sales : p.profit;
                    const ratio = value / top10Max;
                    return (
                      <div key={p.id} className="flex items-center gap-3 py-1.5">
                        <div className="w-5 text-[11px] font-mono text-muted-foreground text-center shrink-0">
                          {i + 1}
                        </div>
                        <div className="w-9 h-9 rounded-md overflow-hidden bg-secondary shrink-0 border border-border">
                          {p.image ? (
                            <img src={p.image} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                              {p.name.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{p.name}</div>
                          <div className="mt-1 h-1.5 rounded-full bg-secondary/60 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500 ease-out"
                              style={{
                                width: `${Math.max(2, ratio * 100)}%`,
                                background: colorForProduct(p.id, i),
                              }}
                            />
                          </div>
                        </div>
                        <div className="text-xs font-mono font-semibold tabular-nums shrink-0 w-20 text-right">
                          {metric === "sales"
                            ? `$${p.sales.toFixed(2)}`
                            : `$${p.profit.toFixed(2)}`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right fixed Sales/Profit toggle */}
          <div className="hidden sm:flex sticky top-16 h-[calc(100vh-4rem)] w-[64px] shrink-0 items-start justify-center pt-6">
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
      </ScrollArea>

      {/* Mobile: floating Sales/Profit toggle */}
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
