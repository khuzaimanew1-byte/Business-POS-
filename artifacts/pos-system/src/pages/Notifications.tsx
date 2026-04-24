import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  AlertOctagon,
  AlertTriangle,
  BellOff,
} from "lucide-react";
import {
  useNotifications,
  formatRelativeTime,
  type Notification,
} from "@/lib/notifications-store";

type TabId = "alerts" | "warnings";

export default function NotificationsPage() {
  const [, setLocation] = useLocation();
  const { notifications, markAllRead, dismiss, requestProductFocus } = useNotifications();
  const [tab, setTab] = useState<TabId>("alerts");

  // Mark everything as read the first time the page is opened in this session.
  // (Done in an effect so the badge doesn't clear before paint.)
  useEffect(() => {
    markAllRead();
  }, [markAllRead]);

  // Keep "time ago" labels live without re-rendering on every notification mutation.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(v => v + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const alerts = useMemo(
    () => notifications.filter(n => n.type === "alert"),
    [notifications]
  );
  const warnings = useMemo(
    () => notifications.filter(n => n.type === "warning"),
    [notifications]
  );

  const visible = tab === "alerts" ? alerts : warnings;

  const handleAction = (n: Notification) => {
    requestProductFocus(n.productId);
    setLocation("/");
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Header — back arrow + title (matches Analytics header treatment) */}
        <header className="sticky top-0 z-20 bg-background/95 backdrop-blur-md h-14 flex items-center gap-3 px-3 sm:px-5 border-b border-border/40">
          <button
            onClick={() => setLocation("/")}
            className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
            aria-label="Back to POS"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-[15px] font-semibold tracking-tight">Notifications</h1>
          <div className="flex-1" />
        </header>

        {/* Tabs */}
        <div className="px-3 sm:px-5 pt-4">
          <div className="max-w-3xl mx-auto w-full flex items-center gap-1">
            <TabButton
              label="Alerts"
              count={alerts.length}
              tone="alert"
              active={tab === "alerts"}
              onClick={() => setTab("alerts")}
            />
            <TabButton
              label="Warnings"
              count={warnings.length}
              tone="warning"
              active={tab === "warnings"}
              onClick={() => setTab("warnings")}
            />
          </div>
        </div>

        {/* List */}
        <main className="flex-1 overflow-y-auto px-3 sm:px-5 py-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <div className="max-w-3xl mx-auto w-full flex flex-col gap-2">
            {visible.length === 0 ? (
              <EmptyState tab={tab} />
            ) : (
              visible.map(n => (
                <NotificationBar
                  key={n.id}
                  notification={n}
                  onAction={() => handleAction(n)}
                  onDismiss={() => dismiss(n.id)}
                />
              ))
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function TabButton({
  label,
  count,
  tone,
  active,
  onClick,
}: {
  label: string;
  count: number;
  tone: "alert" | "warning";
  active: boolean;
  onClick: () => void;
}) {
  const dot = tone === "alert" ? "bg-red-400" : "bg-amber-400";
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors ${
        active
          ? "bg-secondary text-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
      }`}
      data-testid={`tab-${tone}`}
    >
      <span>{label}</span>
      {count > 0 && (
        <span className="flex items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground">
          <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
          {count}
        </span>
      )}
    </button>
  );
}

function NotificationBar({
  notification,
  onAction,
  onDismiss,
}: {
  notification: Notification;
  onAction: () => void;
  onDismiss: () => void;
}) {
  const isAlert = notification.type === "alert";
  const Icon = isAlert ? AlertOctagon : AlertTriangle;

  const accent = isAlert
    ? "border-red-500/30 hover:border-red-500/50 bg-red-500/[0.04]"
    : "border-amber-500/30 hover:border-amber-500/50 bg-amber-500/[0.04]";
  const iconBg = isAlert ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400";
  const btnTone = isAlert
    ? "bg-red-500/15 text-red-300 hover:bg-red-500/25"
    : "bg-amber-500/15 text-amber-300 hover:bg-amber-500/25";

  return (
    <div
      className={`notif-bar group flex items-center gap-3 px-3 sm:px-4 py-3 rounded-xl border ${accent} transition-colors`}
      data-testid={`notif-${notification.kind}-${notification.productId}`}
    >
      <div className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${iconBg}`}>
        <Icon className="w-4 h-4" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold leading-tight truncate">
          {notification.title}
        </p>
        <p className="text-[12px] text-muted-foreground mt-0.5 truncate">
          {notification.description}
        </p>
      </div>

      <button
        onClick={onAction}
        className={`shrink-0 px-3 py-1.5 rounded-full text-[11.5px] font-medium transition-all duration-150 active:scale-95 ${btnTone}`}
      >
        {notification.actionLabel}
      </button>

      <span className="shrink-0 hidden sm:inline text-[11px] tabular-nums text-muted-foreground/70 w-16 text-right">
        {formatRelativeTime(notification.timestamp)}
      </span>

      <button
        onClick={onDismiss}
        className="shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-muted-foreground/70 hover:text-foreground text-[11px] px-1.5 transition-opacity"
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  );
}

function EmptyState({ tab }: { tab: TabId }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-12 h-12 rounded-full bg-secondary/50 flex items-center justify-center text-muted-foreground/60 mb-3">
        <BellOff className="w-5 h-5" />
      </div>
      <p className="text-sm font-medium text-foreground/80">
        {tab === "alerts" ? "No alerts" : "No warnings"}
      </p>
      <p className="text-[11.5px] text-muted-foreground mt-1 max-w-[260px]">
        Nothing needs your attention right now.
      </p>
    </div>
  );
}
