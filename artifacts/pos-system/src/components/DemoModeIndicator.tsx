import { useEffect, useLayoutEffect, useState } from "react";
import { useLocation } from "wouter";
import { X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/lib/settings";

const VISIBLE_ROUTES = new Set(["/", "/analytics", "/add-product"]);

/**
 * Page-aware placement for the floating Demo Mode pill.
 *
 * Each of the three host pages calls this with a CSS `bottom` expression
 * that respects its own layout chrome (cart strip, mobile nav, action
 * bars, etc). The hook publishes the value to a `:root` custom property
 * the indicator reads — no hardcoded pixel positions, no per-page if/else
 * inside the indicator, and a clean revert when the page unmounts so the
 * fallback (`1rem`) takes over for any non-host route.
 */
export function useDemoIndicatorPlacement(bottomCss: string): void {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const prev = root.style.getPropertyValue("--demo-indicator-bottom");
    root.style.setProperty("--demo-indicator-bottom", bottomCss);
    return () => {
      if (prev) root.style.setProperty("--demo-indicator-bottom", prev);
      else root.style.removeProperty("--demo-indicator-bottom");
    };
  }, [bottomCss]);
}

export function DemoModeIndicator() {
  const { settings, update } = useSettings();
  const [location] = useLocation();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const onAllowedRoute = VISIBLE_ROUTES.has(location);
  const shouldShow = settings.demoMode && onAllowedRoute;

  const [mounted, setMounted] = useState(shouldShow);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (shouldShow) {
      setMounted(true);
      const id = window.requestAnimationFrame(() => setEntered(true));
      return () => window.cancelAnimationFrame(id);
    }
    setEntered(false);
    const t = window.setTimeout(() => setMounted(false), 220);
    return () => window.clearTimeout(t);
  }, [shouldShow]);

  useEffect(() => {
    if (!settings.demoMode && confirmOpen) setConfirmOpen(false);
  }, [settings.demoMode, confirmOpen]);

  const handleTurnOff = () => {
    update("demoMode", false);
    setConfirmOpen(false);
  };

  return (
    <>
      {mounted && (
        <div
          role="status"
          aria-live="polite"
          data-testid="demo-mode-indicator"
          className={[
            "demo-mode-indicator fixed left-[76px] z-20",
            "flex items-center gap-2 pl-3 pr-1.5 py-1.5",
            "select-none",
            "transition-opacity duration-200 ease-out",
            entered
              ? "opacity-100"
              : "opacity-0 pointer-events-none",
          ].join(" ")}
          style={{
            bottom: "calc(var(--demo-indicator-bottom, 1rem) + env(safe-area-inset-bottom, 0px))",
            background: "rgba(4,8,12,0.70)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "20px",
            animation: entered ? "demo-float 5s ease-in-out infinite" : undefined,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: "inline-block",
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: "#2db87a",
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: 10,
              color: "rgba(255,255,255,0.45)",
              lineHeight: 1,
              fontWeight: 500,
            }}
          >
            Demo Mode
          </span>
          <button
            type="button"
            aria-label="Turn off Demo Mode"
            onClick={() => setConfirmOpen(true)}
            className={[
              "inline-flex items-center justify-center w-5 h-5 rounded-full",
              "hover:bg-white/10 active:scale-95",
              "transition-[color,background-color,transform] duration-150",
              "focus:outline-none focus-visible:ring-1 focus-visible:ring-foreground/40",
            ].join(" ")}
            style={{ color: "rgba(255,255,255,0.35)" }}
            data-testid="demo-mode-close"
          >
            <X className="w-3 h-3" strokeWidth={2} />
          </button>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm sm:rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              Turn off Demo Mode?
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              You'll switch from sample data to real data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              data-testid="demo-mode-cancel"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleTurnOff}
              data-testid="demo-mode-confirm"
            >
              Turn Off
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
