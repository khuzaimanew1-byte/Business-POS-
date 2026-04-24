import { useLocation } from "wouter";
import { AlertTriangle, AlertOctagon, X } from "lucide-react";
import { useNotifications, type Notification } from "@/lib/notifications-store";

/**
 * Global toast surface — top-right on desktop, top full-width on mobile.
 * - Max stack of 3 (enforced in the store).
 * - Auto-dismiss managed by the store; this component only renders.
 * - Clicking the toast body navigates to the related product on POS.
 * - The dismiss button removes only the toast (not the persistent notification).
 *
 * Anti-spam guarantee comes from the store: the same (productId, kind) can
 * never produce more than one toast at a time.
 */
export function NotificationToaster() {
  const { toasts, dismissToast, requestProductFocus } = useNotifications();
  const [location, setLocation] = useLocation();

  if (toasts.length === 0) return null;

  const handleAction = (n: Notification) => {
    requestProductFocus(n.productId);
    if (location !== "/") setLocation("/");
    dismissToast(n.id);
  };

  return (
    <div
      className="fixed z-[60] pointer-events-none flex flex-col items-stretch sm:items-end gap-2 top-2 left-2 right-2 sm:left-auto sm:top-4 sm:right-4 sm:w-[360px]"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((n) => {
        const isAlert = n.type === "alert";
        const Icon = isAlert ? AlertOctagon : AlertTriangle;
        const accent = isAlert
          ? "border-red-500/35 bg-red-500/10"
          : "border-amber-500/35 bg-amber-500/10";
        const iconTone = isAlert ? "text-red-400" : "text-amber-400";

        return (
          <div
            key={n.id}
            role="status"
            className={`notif-toast-in pointer-events-auto group relative flex items-start gap-3 px-3.5 py-3 rounded-xl border ${accent} backdrop-blur-md shadow-xl bg-popover/85 cursor-pointer hover:bg-popover/95 transition-colors`}
            onClick={() => handleAction(n)}
            data-testid={`toast-${n.kind}-${n.productId}`}
          >
            <div className={`mt-0.5 shrink-0 ${iconTone}`}>
              <Icon className="w-4 h-4" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold leading-tight text-foreground truncate">
                {n.title}
              </p>
              <p className="text-[11.5px] text-muted-foreground mt-0.5 line-clamp-2">
                {n.description}
              </p>
            </div>

            <button
              onClick={(e) => { e.stopPropagation(); dismissToast(n.id); }}
              className="shrink-0 -mr-1 -mt-1 p-1 rounded-md text-muted-foreground/70 hover:text-foreground hover:bg-secondary/60 transition-colors"
              aria-label="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
