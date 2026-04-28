import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, ChevronDown, ChevronRight, CircleDollarSign, Clock, Receipt,
  ShoppingCart, TrendingUp,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useSaleEvents,
  getTodayResetTimestamp,
  type SaleItem,
} from "@/lib/analytics-store";
import { useSettings, formatCurrency } from "@/lib/settings";
import { getProductMeta } from "@/lib/products-meta";

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function renderInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// ── Atom: order item row ───────────────────────────────────────────────────
// Visually identical to the cart-panel item rows in POS.tsx — square image
// thumbnail, name + total on top, unit price + qty on bottom — but with no
// quantity controls (these are completed, immutable orders).
function OrderItemRow({
  item,
  fmtCur,
}: {
  item: SaleItem;
  fmtCur: (v: number) => string;
}) {
  const meta = getProductMeta(item.productId, item.name);
  return (
    <div
      className="flex bg-secondary/30 rounded-xl border border-border/50 overflow-hidden"
      data-testid={`history-item-${item.productId}`}
    >
      <div className="w-[72px] h-[72px] shrink-0 bg-secondary">
        {meta.image ? (
          <img
            src={meta.image}
            alt={item.name}
            className="w-full h-full object-cover block"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-xs font-bold text-muted-foreground">
              {renderInitials(item.name)}
            </span>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0 flex flex-col justify-center px-3 py-2.5">
        <div className="flex justify-between items-start mb-1 gap-2">
          <h4 className="font-medium text-sm truncate">{item.name}</h4>
          <span className="font-semibold text-sm tabular-nums shrink-0">
            {fmtCur(item.price * item.qty)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {fmtCur(item.price)} / ea
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            × {item.qty}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Atom: empty state ──────────────────────────────────────────────────────
// Large cart icon with a small clock badge in the bottom-right corner.
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      <div className="relative mb-5 opacity-55">
        <ShoppingCart
          className="w-16 h-16 text-muted-foreground"
          strokeWidth={1.5}
        />
        <div className="absolute -bottom-1 -right-1 bg-background rounded-full p-1 border border-border/50">
          <Clock
            className="w-4 h-4 text-muted-foreground"
            strokeWidth={2}
          />
        </div>
      </div>
      <p className="text-sm font-semibold text-muted-foreground">
        No orders today
      </p>
      <p className="text-[12px] text-muted-foreground/70 mt-1">
        Completed checkouts will appear here
      </p>
      <p className="text-[11px] text-muted-foreground/55 mt-2">
        History resets automatically at 7 AM
      </p>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function CartHistory() {
  const [, setLocation] = useLocation();
  const allEvents = useSaleEvents();
  const { settings } = useSettings();
  const fmtCur = (v: number) => formatCurrency(v, settings);

  // Recompute the 7 AM boundary on every render — cheap and keeps the view
  // honest if the user happens to be sitting on the page across the boundary.
  const resetTs = getTodayResetTimestamp();

  const orders = useMemo(
    () =>
      allEvents
        .filter((e) => e.ts >= resetTs)
        .sort((a, b) => b.ts - a.ts), // newest first
    [allEvents, resetTs],
  );

  const totalRevenue = orders.reduce((s, o) => s + o.totalSales, 0);
  const totalProfit = orders.reduce((s, o) => s + o.totalProfit, 0);
  const orderCountLabel = `${orders.length} ${
    orders.length === 1 ? "order" : "orders"
  }`;

  // Mobile: which order cards are expanded (all start collapsed)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Desktop: one order is always selected when the list is non-empty.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    if (orders.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!selectedId || !orders.some((o) => o.id === selectedId)) {
      setSelectedId(orders[0].id);
    }
  }, [orders, selectedId]);
  const selectedOrder = orders.find((o) => o.id === selectedId) ?? null;
  const selectedOrderTotal = selectedOrder?.totalSales ?? 0;

  // ── Sub-views ────────────────────────────────────────────────────────────
  // Subtitle stays minimal — the order count moves into a left-aligned pill
  // sitting next to the title (matches the mobile pill style, just placed
  // on the left rather than floating on the far right).
  const headerSubtitle = (
    <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
      Resets at 7 AM
    </p>
  );

  // Reusable pill — same look as the mobile right-aligned badge.
  const countPillClasses =
    "bg-primary/15 text-primary text-[11px] font-semibold px-2.5 py-1 rounded-full tabular-nums shrink-0";

  // Footer segments — each is a self-contained labelled stat. Layout
  // (column counts, dividers) is driven by the wrapper, not the segment.
  const RevenueSegment = (
    <div className="flex-1 min-w-0 px-4 sm:px-5 py-3 flex items-center gap-3">
      <CircleDollarSign className="w-5 h-5 text-primary/70 shrink-0" strokeWidth={1.75} />
      <div className="flex flex-col min-w-0">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground leading-tight">
          Revenue
        </span>
        <span
          className="text-base sm:text-lg font-bold text-primary tabular-nums leading-tight mt-0.5 truncate"
          data-testid="text-revenue"
        >
          {fmtCur(totalRevenue)}
        </span>
      </div>
    </div>
  );

  const ProfitSegment = (
    <div className="flex-1 min-w-0 px-4 sm:px-5 py-3 flex flex-col justify-center">
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground leading-tight">
        Profit
      </span>
      <div className="flex items-baseline gap-1.5 mt-0.5 min-w-0">
        <TrendingUp className="w-3.5 h-3.5 text-primary/80 shrink-0 self-center" strokeWidth={2.25} />
        <span
          className="text-base sm:text-lg font-bold text-primary tabular-nums leading-tight truncate"
          data-testid="text-profit"
        >
          {fmtCur(totalProfit)}
        </span>
      </div>
    </div>
  );

  const OrderTotalSegment = (
    <div className="flex-1 min-w-0 px-6 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <Receipt className="w-4 h-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground truncate">
          Order Total
        </span>
      </div>
      <span
        className="text-lg lg:text-xl font-bold text-primary tabular-nums shrink-0"
        data-testid="text-order-total"
      >
        {fmtCur(selectedOrderTotal)}
      </span>
    </div>
  );

  // ── Render ───────────────────────────────────────────────────────────────
  // Root is locked to viewport height with overflow-hidden so the bottom bar
  // is always pinned. The middle <main> owns its own scroll regions.
  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* ── HEADER ──────────────────────────────────────────────────── */}
      <header className="h-14 sm:h-16 flex items-center gap-3 px-3 sm:px-6 border-b border-border bg-background/90 backdrop-blur-sm shrink-0">
        <button
          onClick={() => setLocation("/")}
          className="p-2 rounded-full hover:bg-secondary transition-colors"
          aria-label="Back"
          data-testid="btn-back"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-[15px] sm:text-base font-semibold tracking-tight leading-tight truncate">
            Today's Orders
          </h1>
          {headerSubtitle}
        </div>
        {/* Count pill — right side of the top bar on every viewport. */}
        {orders.length > 0 && (
          <div
            className={countPillClasses}
            data-testid="badge-order-count"
          >
            {orderCountLabel}
          </div>
        )}
      </header>

      {/* ── BODY ────────────────────────────────────────────────────── */}
      <main className="flex-1 min-h-0 flex flex-col sm:flex-row">
        {orders.length === 0 ? (
          <div className="flex-1 flex items-center justify-center min-h-0">
            <EmptyState />
          </div>
        ) : (
          <>
            {/* ── MOBILE: collapsible card list ────────────────────── */}
            <div className="sm:hidden flex-1 min-h-0">
              <ScrollArea className="h-full">
                <div className="flex flex-col gap-2 p-3">
                  {orders.map((order, idx) => {
                    const isOpen = expanded.has(order.id);
                    // Most-recent → solid; older → progressively dimmed dot.
                    const dotOpacity = Math.max(0.3, 1 - idx * 0.18);
                    return (
                      // Note: no `overflow-hidden` here — that would scope
                      // the sticky header to the card itself (which has no
                      // internal scroll) and stop it from sticking to the
                      // ScrollArea viewport. Rounded corners are preserved
                      // by giving the header/footer rows their own matching
                      // border-radius.
                      <div
                        key={order.id}
                        className="bg-secondary/30 rounded-xl border border-border/50"
                        data-testid={`order-card-${order.id}`}
                      >
                        <button
                          type="button"
                          onClick={() => toggle(order.id)}
                          className={`w-full flex items-center gap-3 px-3.5 py-3 text-left transition-colors rounded-t-xl ${
                            isOpen
                              // Sticky scope = the ScrollArea viewport.
                              // When the card scrolls past, the header
                              // travels with it and naturally disappears.
                              ? "sticky top-0 z-10 bg-secondary/95 backdrop-blur-sm border-b border-border/40 hover:bg-secondary"
                              : "rounded-b-xl hover:bg-secondary/40"
                          }`}
                          aria-expanded={isOpen}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-primary shrink-0"
                            style={{ opacity: dotOpacity }}
                            aria-hidden="true"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold leading-tight tabular-nums">
                              {fmtTime(order.ts)}
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {order.totalQty}{" "}
                              {order.totalQty === 1 ? "item" : "items"} ·{" "}
                              {fmtCur(order.totalSales)}
                            </p>
                          </div>
                          <ChevronDown
                            className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200 ${
                              isOpen ? "rotate-180" : ""
                            }`}
                          />
                        </button>
                        {isOpen && (
                          // Divider is now provided by the sticky header's
                          // border-b above, so no border-t is needed here.
                          <div className="px-3 pb-3 pt-3 flex flex-col gap-2">
                            {order.items.map((item, i) => (
                              <OrderItemRow
                                key={`${order.id}-${i}`}
                                item={item}
                                fmtCur={fmtCur}
                              />
                            ))}
                            <div className="flex items-center justify-between pt-1 px-1">
                              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                                Order Total
                              </span>
                              <span className="text-sm font-semibold text-primary tabular-nums">
                                {fmtCur(order.totalSales)}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>

            {/* ── DESKTOP: 320px order list ────────────────────────── */}
            <aside className="hidden sm:flex flex-col w-[320px] border-r border-border min-h-0 shrink-0">
              <div className="px-4 pt-4 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground shrink-0">
                Orders
              </div>
              <ScrollArea className="flex-1 min-h-0">
                <div className="flex flex-col gap-1.5 px-3 pb-3">
                  {orders.map((order, idx) => {
                    const isActive = order.id === selectedId;
                    const dotOpacity = Math.max(0.4, 1 - idx * 0.15);
                    return (
                      <button
                        key={order.id}
                        type="button"
                        onClick={() => setSelectedId(order.id)}
                        data-testid={`order-row-${order.id}`}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors border ${
                          isActive
                            ? "bg-primary/10 border-primary/40"
                            : "border-transparent hover:bg-secondary/40"
                        }`}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-primary shrink-0"
                          style={{ opacity: isActive ? 1 : dotOpacity }}
                          aria-hidden="true"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold leading-tight tabular-nums">
                            {fmtTime(order.ts)}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {order.totalQty}{" "}
                            {order.totalQty === 1 ? "item" : "items"} ·{" "}
                            {fmtCur(order.totalSales)}
                          </p>
                        </div>
                        <ChevronRight
                          className={`w-4 h-4 shrink-0 transition-colors ${
                            isActive
                              ? "text-primary"
                              : "text-muted-foreground/40"
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </aside>

            {/* ── DESKTOP: order detail ────────────────────────────── */}
            <section className="hidden sm:flex flex-col flex-1 min-h-0">
              {selectedOrder && (
                <>
                  <div className="px-6 pt-4 pb-3 border-b border-border/60 shrink-0">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Order Detail
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mx-1.5">
                      ·
                    </span>
                    <span className="text-[12px] text-foreground/85 font-medium tabular-nums">
                      {fmtTime(selectedOrder.ts)}
                    </span>
                  </div>
                  <ScrollArea className="flex-1 min-h-0">
                    <div className="flex flex-col gap-2 p-4">
                      {selectedOrder.items.map((item, i) => (
                        <OrderItemRow
                          key={`detail-${selectedOrder.id}-${i}`}
                          item={item}
                          fmtCur={fmtCur}
                        />
                      ))}
                    </div>
                  </ScrollArea>
                </>
              )}
            </section>
          </>
        )}
      </main>

      {/* ── BOTTOM BAR (always visible, never scrolls) ──────────────── */}

      {/* Desktop: 3 segments — left half (320px wide, mirroring the orders
          aside above) holds Revenue + Profit; right half holds Order Total. */}
      <footer className="hidden sm:flex shrink-0 border-t border-border bg-background/95 backdrop-blur-sm">
        <div className="w-[320px] flex border-r border-border shrink-0">
          {RevenueSegment}
          <div className="w-px bg-border/60 self-stretch my-2" aria-hidden="true" />
          {ProfitSegment}
        </div>
        {OrderTotalSegment}
      </footer>

      {/* Mobile: 2 segments — Revenue + Profit. There's no permanent
          "selected order" on mobile (cards are independently expandable),
          so we omit Order Total here. */}
      <footer className="sm:hidden shrink-0 border-t border-border bg-background/95 backdrop-blur-sm flex">
        {RevenueSegment}
        <div className="w-px bg-border/60 self-stretch my-2" aria-hidden="true" />
        {ProfitSegment}
      </footer>
    </div>
  );
}
