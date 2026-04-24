import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type PerformanceMode = "smooth" | "fast" | "ultra";
export type CurrencyCode = "PKR" | "USD" | "OMR";
export type RoundingMode = "standard" | "floor" | "ceiling";
export type RetentionMode = "7d" | "30d" | "all";
export type DecimalPrecision = 0 | 1 | 2 | 3;

// ── Shortcuts ─────────────────────────────────────────────────────────────
export type ShortcutAction =
  | "addProduct"
  | "openAnalytics"
  | "openNotifications"
  | "toggleSearch"
  | "openCart"
  | "createProduct"
  | "createAndAnother"
  | "toggleEditMode"
  | "back"
  | "openSettings"
  | "prevCategory"
  | "nextCategory"
  | "prevSettingsTab"
  | "nextSettingsTab";

export type ShortcutBinding = {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  /** Normalized to lowercase. Special: "enter", "backspace", "`" etc. */
  key: string;
} | null;

export const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  addProduct:       "Add Product",
  openAnalytics:    "Open Analytics",
  openNotifications: "Open Notifications",
  toggleSearch:     "Toggle Search",
  openCart:         "Open Cart",
  createProduct:    "Create Product",
  createAndAnother: "Create & Add Another",
  toggleEditMode:   "Toggle Edit Mode",
  back:             "Back / Exit",
  openSettings:     "Open Settings",
  prevCategory:     "Previous Category",
  nextCategory:     "Next Category",
  prevSettingsTab:  "Previous Settings Tab",
  nextSettingsTab:  "Next Settings Tab",
};

export const DEFAULT_SHORTCUTS: Record<ShortcutAction, ShortcutBinding> = {
  addProduct:       { ctrl: false, shift: true,  alt: false, meta: false, key: "p" },
  openAnalytics:    { ctrl: false, shift: true,  alt: false, meta: false, key: "a" },
  openNotifications:{ ctrl: false, shift: true,  alt: false, meta: false, key: "n" },
  toggleSearch:     { ctrl: true,  shift: false, alt: false, meta: false, key: "`" },
  openCart:         { ctrl: false, shift: true,  alt: false, meta: false, key: "c" },
  createProduct:    { ctrl: false, shift: false, alt: false, meta: false, key: "enter" },
  createAndAnother: { ctrl: false, shift: true,  alt: false, meta: false, key: "enter" },
  toggleEditMode:   { ctrl: false, shift: true,  alt: false, meta: false, key: "e" },
  back:             { ctrl: false, shift: true,  alt: false, meta: false, key: "backspace" },
  openSettings:     null,
  prevCategory:     { ctrl: true,  shift: false, alt: false, meta: false, key: "arrowleft" },
  nextCategory:     { ctrl: true,  shift: false, alt: false, meta: false, key: "arrowright" },
  prevSettingsTab:  { ctrl: true,  shift: false, alt: false, meta: false, key: "arrowup" },
  nextSettingsTab:  { ctrl: true,  shift: false, alt: false, meta: false, key: "arrowdown" },
};

// ── Currency ──────────────────────────────────────────────────────────────
/** USD is the base reference. 1 USD = X of target currency. */
export type ExchangeRates = Record<Exclude<CurrencyCode, "USD">, number>;

export const DEFAULT_RATES: ExchangeRates = {
  PKR: 280,
  OMR: 0.385,
};

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  USD: "$",
  PKR: "Rs ",
  OMR: "", // OMR uses suffix format instead — see formatCurrency
};

// ── State ─────────────────────────────────────────────────────────────────
export type SettingsState = {
  performance: PerformanceMode;
  currency: CurrencyCode;
  decimals: DecimalPrecision;
  rounding: RoundingMode;
  rates: ExchangeRates;
  shortcutsEnabled: boolean;
  shortcuts: Record<ShortcutAction, ShortcutBinding>;
  enterNavigation: boolean;
  autoFocusNext: boolean;
  inputShake: boolean;
  inlineErrors: boolean;
  defaultProfit: string;
  defaultStock: string;
  defaultCategory: string;
  demoData: boolean;
  retention: RetentionMode;
  confirmBeforeDelete: boolean;
  enableUndoDelete: boolean;
  bulkDeleteProtection: boolean;
  strictConfirm: boolean;
};

const DEFAULTS: SettingsState = {
  performance: "smooth",
  currency: "USD",
  decimals: 2,
  rounding: "standard",
  rates: DEFAULT_RATES,
  shortcutsEnabled: true,
  shortcuts: DEFAULT_SHORTCUTS,
  enterNavigation: true,
  autoFocusNext: true,
  inputShake: true,
  inlineErrors: true,
  defaultProfit: "",
  defaultStock: "",
  defaultCategory: "",
  demoData: true,
  retention: "all",
  confirmBeforeDelete: true,
  enableUndoDelete: false,
  bulkDeleteProtection: true,
  strictConfirm: false,
};

const STORAGE_KEY = "pos.settings.v1";

type Ctx = {
  settings: SettingsState;
  update: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
  reset: () => void;
};

const SettingsContext = createContext<Ctx | null>(null);

function load(): SettingsState {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULTS,
      ...parsed,
      rates:     { ...DEFAULTS.rates,     ...(parsed.rates     ?? {}) },
      shortcuts: { ...DEFAULTS.shortcuts, ...(parsed.shortcuts ?? {}) },
    };
  } catch {
    return DEFAULTS;
  }
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SettingsState>(load);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch {}
  }, [settings]);

  useEffect(() => {
    document.documentElement.setAttribute("data-perf", settings.performance);
  }, [settings.performance]);

  const value = useMemo<Ctx>(() => ({
    settings,
    update: (k, v) => setSettings(prev => ({ ...prev, [k]: v })),
    reset: () => setSettings(DEFAULTS),
  }), [settings]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): Ctx {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside <SettingsProvider>");
  return ctx;
}

// ── Currency helpers ──────────────────────────────────────────────────────
export function applyRounding(v: number, decimals: number, mode: RoundingMode): number {
  const f = Math.pow(10, decimals);
  if (mode === "floor")   return Math.floor(v * f) / f;
  if (mode === "ceiling") return Math.ceil(v * f)  / f;
  return Math.round(v * f) / f;
}

/** Convert a USD-base value to the active currency. */
export function convertFromUSD(usd: number, s: SettingsState): number {
  if (s.currency === "USD") return usd;
  const rates = s.rates ?? DEFAULT_RATES;
  const rate = rates[s.currency] ?? DEFAULT_RATES[s.currency];
  return usd * (rate ?? 1);
}

/** Format with no forced trailing zeros (3.4 stays 3.4 even at decimals=2). */
function formatNumberTrimmed(v: number, decimals: number): string {
  const fixed = v.toFixed(decimals);
  if (!fixed.includes(".")) return fixed;
  return fixed.replace(/\.?0+$/, "");
}

/**
 * Format `v` (assumed USD-base) into the active currency string.
 * - USD: "$3.5"
 * - PKR: "Rs 980"
 * - OMR: "1.348 (OMR)"
 */
export function formatCurrency(v: number, s: SettingsState): string {
  const converted = convertFromUSD(v, s);
  const rounded = applyRounding(converted, s.decimals, s.rounding);
  const num = formatNumberTrimmed(rounded, s.decimals);
  if (s.currency === "OMR") return `${num} OMR`;
  return `${CURRENCY_SYMBOLS[s.currency]}${num}`;
}

export function useCurrency() {
  const { settings } = useSettings();
  return useMemo(() => (v: number) => formatCurrency(v, settings), [settings]);
}

// ── Shortcut helpers ──────────────────────────────────────────────────────
export function shortcutToString(b: ShortcutBinding): string {
  if (!b) return "Unassigned";
  const parts: string[] = [];
  if (b.ctrl)  parts.push("Ctrl");
  if (b.shift) parts.push("Shift");
  if (b.alt)   parts.push("Alt");
  if (b.meta)  parts.push("Meta");
  const k = b.key === "enter" ? "Enter"
    : b.key === "backspace" ? "⌫"
    : b.key === " " ? "Space"
    : b.key === "arrowup" ? "↑"
    : b.key === "arrowdown" ? "↓"
    : b.key === "arrowleft" ? "←"
    : b.key === "arrowright" ? "→"
    : b.key.length === 1 ? b.key.toUpperCase()
    : b.key.charAt(0).toUpperCase() + b.key.slice(1);
  parts.push(k);
  return parts.join(" + ");
}

export function bindingsEqual(a: ShortcutBinding, b: ShortcutBinding): boolean {
  if (!a || !b) return false;
  return a.ctrl === b.ctrl && a.shift === b.shift && a.alt === b.alt && a.meta === b.meta && a.key === b.key;
}

/** Returns the set of action keys that share their binding with another action. */
export function detectConflicts(map: Record<ShortcutAction, ShortcutBinding>): Set<ShortcutAction> {
  const seen = new Map<string, ShortcutAction>();
  const conflicts = new Set<ShortcutAction>();
  (Object.keys(map) as ShortcutAction[]).forEach(action => {
    const b = map[action];
    if (!b) return;
    const sig = `${b.ctrl}|${b.shift}|${b.alt}|${b.meta}|${b.key}`;
    const prev = seen.get(sig);
    if (prev) {
      conflicts.add(prev);
      conflicts.add(action);
    } else {
      seen.set(sig, action);
    }
  });
  return conflicts;
}

export function bindingFromKeyEvent(e: KeyboardEvent | React.KeyboardEvent): ShortcutBinding {
  const k = e.key.toLowerCase();
  // Reject pure modifier presses
  if (k === "control" || k === "shift" || k === "alt" || k === "meta") return null;
  return {
    ctrl: e.ctrlKey,
    shift: e.shiftKey,
    alt: e.altKey,
    meta: e.metaKey,
    key: k,
  };
}

export function matchesBinding(e: KeyboardEvent, b: ShortcutBinding): boolean {
  if (!b) return false;
  return (
    e.ctrlKey === b.ctrl &&
    e.shiftKey === b.shift &&
    e.altKey === b.alt &&
    e.metaKey === b.meta &&
    e.key.toLowerCase() === b.key
  );
}
