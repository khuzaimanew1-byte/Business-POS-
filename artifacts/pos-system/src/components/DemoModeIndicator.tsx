import { useEffect, useState } from "react";
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
            "demo-mode-indicator fixed left-3 sm:left-4 z-40",
            "flex items-center gap-2.5 pl-3 pr-2 py-1.5",
            "rounded-full border border-white/10",
            "bg-[rgba(24,24,28,0.92)] backdrop-blur-md",
            "shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)]",
            "text-[12px] sm:text-[13px] text-foreground/90 font-medium",
            "select-none",
            "transition-all duration-200 ease-out",
            entered
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-2 pointer-events-none",
          ].join(" ")}
          style={{
            bottom:
              "calc(var(--mobile-nav-height, 0px) + 4rem + env(safe-area-inset-bottom, 0px) + 12px)",
          }}
        >
          <span
            aria-hidden="true"
            className="demo-mode-dot inline-block w-1.5 h-1.5 rounded-full bg-emerald-400"
          />
          <span className="leading-none">Demo Mode</span>
          <button
            type="button"
            aria-label="Turn off Demo Mode"
            onClick={() => setConfirmOpen(true)}
            className="ml-0.5 -mr-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full text-foreground/60 hover:text-foreground/95 transition-colors duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-foreground/40"
            data-testid="demo-mode-close"
          >
            <X className="w-3.5 h-3.5" strokeWidth={2.25} />
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

export default DemoModeIndicator;
