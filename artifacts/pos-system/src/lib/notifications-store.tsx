import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useStore, type Product } from "./store";

// ─────────────────────────────────────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type NotificationType = "alert" | "warning";

/** All actionable events the system understands. Keep this list small. */
export type EventKind = "out_of_stock" | "low_stock";

export type Notification = {
  id: string;                 // stable: `${kind}:${productId}`
  kind: EventKind;
  type: NotificationType;     // visual severity
  title: string;
  description: string;
  actionLabel: string;
  productId: string;
  quickCode: string;
  timestamp: number;
  isRead: boolean;
};

type NotificationsValue = {
  notifications: Notification[];
  toasts: Notification[];
  unreadCount: number;

  /** Mark every notification as read (called when user opens the page). */
  markAllRead: () => void;
  /** Manually dismiss a notification (also clears its triggered flag so it can re-fire when condition repeats). */
  dismiss: (id: string) => void;
  /** Dismiss a transient toast without affecting the persistent list. */
  dismissToast: (id: string) => void;

  /** Request focus on a product. POS reads + consumes this on mount/change. */
  requestProductFocus: (productId: string) => void;
  /** Returns the pending focus target (or null) and clears it atomically. */
  consumeProductFocus: () => string | null;
  /** Subscribe to focus changes (POS uses this so requests work even when POS is already mounted). */
  pendingFocusId: string | null;
};

const NotificationsContext = createContext<NotificationsValue | null>(null);

// ─────────────────────────────────────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────────────────────────────────────

/** Threshold at or below which a product counts as "low stock" (but still > 0). */
const LOW_STOCK_THRESHOLD = 10;

/** Toasts auto-dismiss after this many ms. */
const TOAST_TTL_MS = 4500;

/** Maximum number of stacked toasts shown at once. */
export const MAX_TOAST_STACK = 3;

// ─────────────────────────────────────────────────────────────────────────────
//  EVENT MODEL
//
//  For each product we track which event kinds are currently "armed" — i.e.
//  already produced a notification that has not yet been auto-resolved. This
//  is the anti-spam guarantee:
//    - Each (productId, kind) can fire AT MOST one notification at a time.
//    - It re-fires only after the underlying condition resolves (stock goes
//      back above threshold) and then re-triggers.
// ─────────────────────────────────────────────────────────────────────────────

function eventKindFor(p: Product): EventKind | null {
  if (p.stock <= 0) return "out_of_stock";
  if (p.stock <= LOW_STOCK_THRESHOLD) return "low_stock";
  return null;
}

function buildNotification(p: Product, kind: EventKind): Notification {
  const quickCode = p.quickCode ?? "";
  if (kind === "out_of_stock") {
    return {
      id: `out_of_stock:${p.id}`,
      kind,
      type: "alert",
      title: "Out of stock",
      description: `${p.name}${quickCode ? ` (${quickCode})` : ""} is out of stock.`,
      actionLabel: "Restock",
      productId: p.id,
      quickCode,
      timestamp: Date.now(),
      isRead: false,
    };
  }
  return {
    id: `low_stock:${p.id}`,
    kind,
    type: "warning",
    title: "Low stock",
    description: `${p.name}${quickCode ? ` (${quickCode})` : ""} is running low — ${p.stock} left.`,
    actionLabel: "Restock",
    productId: p.id,
    quickCode,
    timestamp: Date.now(),
    isRead: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  PROVIDER
// ─────────────────────────────────────────────────────────────────────────────

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { products } = useStore();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [toasts, setToasts] = useState<Notification[]>([]);
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);

  // Triggered map: per-product, the kind currently armed (or null).
  // Survives renders via ref so the watcher stays cheap.
  const triggeredRef = useRef<Map<string, EventKind>>(new Map());

  // Track previous product ids so removed products clean up.
  const knownIdsRef = useRef<Set<string>>(new Set());

  // ── Toast lifecycle ──────────────────────────────────────────────────────
  // Each toast has its own setTimeout that removes it after TTL. We hold the
  // timer ids in a ref so unmounts cancel them cleanly.
  const toastTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const tm = toastTimers.current.get(id);
    if (tm) {
      clearTimeout(tm);
      toastTimers.current.delete(id);
    }
  }, []);

  const pushToast = useCallback((n: Notification) => {
    setToasts(prev => {
      // Replace existing toast with the same id rather than stacking duplicates.
      const filtered = prev.filter(t => t.id !== n.id);
      const next = [...filtered, n];
      // Cap stack size — drop oldest if needed.
      while (next.length > MAX_TOAST_STACK) next.shift();
      return next;
    });
    const existing = toastTimers.current.get(n.id);
    if (existing) clearTimeout(existing);
    const tm = setTimeout(() => dismissToast(n.id), TOAST_TTL_MS);
    toastTimers.current.set(n.id, tm);
  }, [dismissToast]);

  useEffect(() => {
    return () => {
      toastTimers.current.forEach(t => clearTimeout(t));
      toastTimers.current.clear();
    };
  }, []);

  // ── Public actions ───────────────────────────────────────────────────────

  const markAllRead = useCallback(() => {
    setNotifications(prev => {
      if (prev.every(n => n.isRead)) return prev;
      return prev.map(n => (n.isRead ? n : { ...n, isRead: true }));
    });
  }, []);

  const dismiss = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    // Also clear the triggered flag for the underlying (productId, kind) so
    // the same condition can re-fire if it recurs.
    const [kind, productId] = id.split(":") as [EventKind, string];
    if (productId && triggeredRef.current.get(productId) === kind) {
      triggeredRef.current.delete(productId);
    }
    dismissToast(id);
  }, [dismissToast]);

  const requestProductFocus = useCallback((productId: string) => {
    // Always set, even if same value — POS effect re-runs on every set via
    // the timestamp-suffixed ref pattern below. We expose the bare id so
    // consumers can match against products[].id directly.
    setPendingFocusId(productId);
  }, []);

  const consumeProductFocus = useCallback(() => {
    let consumed: string | null = null;
    setPendingFocusId(prev => {
      consumed = prev;
      return null;
    });
    return consumed;
  }, []);

  // ── Event-detection / auto-cleanup watcher ──────────────────────────────
  // Runs whenever the products list changes. Walks every product and:
  //   1. If its current kind != triggered kind → arm new notification & toast.
  //      (If a different kind was previously armed, replace it.)
  //   2. If its current kind == null but something was triggered → resolve.
  // Also drops notifications/triggered entries for products that no longer exist.
  useEffect(() => {
    const triggered = triggeredRef.current;
    const currentIds = new Set(products.map(p => p.id));

    // Handle removed products first.
    const removedNotifIds: string[] = [];
    knownIdsRef.current.forEach(id => {
      if (!currentIds.has(id)) {
        const armed = triggered.get(id);
        if (armed) {
          removedNotifIds.push(`${armed}:${id}`);
          triggered.delete(id);
        }
      }
    });
    knownIdsRef.current = currentIds;

    const toAdd: Notification[] = [];
    const toRemove: string[] = [...removedNotifIds];

    for (const p of products) {
      const kind = eventKindFor(p);
      const armed = triggered.get(p.id) ?? null;

      if (kind === armed) continue; // No state change for this product.

      if (armed && kind !== armed) {
        // Old condition resolved (or escalated to a different kind).
        toRemove.push(`${armed}:${p.id}`);
        triggered.delete(p.id);
      }

      if (kind) {
        // Arm new notification.
        triggered.set(p.id, kind);
        toAdd.push(buildNotification(p, kind));
      }
    }

    if (toRemove.length === 0 && toAdd.length === 0) return;

    setNotifications(prev => {
      const removed = prev.filter(n => !toRemove.includes(n.id));
      // De-dup adds against current list (defensive — should never collide).
      const existingIds = new Set(removed.map(n => n.id));
      const fresh = toAdd.filter(n => !existingIds.has(n.id));
      // Newest first.
      return [...fresh, ...removed];
    });

    // Clean up toasts for resolved conditions and surface new ones.
    toRemove.forEach(id => dismissToast(id));
    toAdd.forEach(n => pushToast(n));
  }, [products, pushToast, dismissToast]);

  // ── Memoized value ───────────────────────────────────────────────────────

  const unreadCount = useMemo(
    () => notifications.reduce((acc, n) => acc + (n.isRead ? 0 : 1), 0),
    [notifications]
  );

  const value = useMemo<NotificationsValue>(() => ({
    notifications,
    toasts,
    unreadCount,
    markAllRead,
    dismiss,
    dismissToast,
    requestProductFocus,
    consumeProductFocus,
    pendingFocusId,
  }), [
    notifications, toasts, unreadCount,
    markAllRead, dismiss, dismissToast,
    requestProductFocus, consumeProductFocus, pendingFocusId,
  ]);

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used inside <NotificationsProvider>");
  return ctx;
}

// ─────────────────────────────────────────────────────────────────────────────
//  RELATIVE TIME HELPER
// ─────────────────────────────────────────────────────────────────────────────

export function formatRelativeTime(ts: number, now: number = Date.now()): string {
  const diffSec = Math.max(0, Math.floor((now - ts) / 1000));
  if (diffSec < 45) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}
