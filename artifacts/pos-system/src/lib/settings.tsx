import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type PerformanceMode = "smooth" | "fast" | "ultra";
export type CurrencyCode = "PKR" | "USD" | "OMR";
export type RoundingMode = "standard" | "floor" | "ceiling";
export type RetentionMode = "1y" | "2y" | "5y" | "all" | "custom";
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
  createProduct:    "Confirmation",
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

/**
 * Concatenation-ready currency prefixes — `${SYMBOL}${number}` always reads
 * naturally:  "$100"  •  "Rs 100"  •  "R.O 1.250"
 * USD has no trailing space; PKR/OMR include one because their multi-letter
 * codes need separation from the number. Use `getCurrencySymbol()` if you
 * need the bare symbol (e.g. as an input-field prefix where the row already
 * adds its own gap).
 */
export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  USD: "$",
  PKR: "Rs ",
  OMR: "R.O ",
};

/** Bare currency symbol (no trailing whitespace) — for input prefixes etc. */
export function getCurrencySymbol(currency: CurrencyCode): string {
  return CURRENCY_SYMBOLS[currency].trimEnd();
}

/** Decimal places enforced for a currency (OMR is always 3, others use the user's setting). */
export function currencyDecimals(currency: CurrencyCode, fallback: number): number {
  return currency === "OMR" ? 3 : fallback;
}

/**
 * Normalize a numeric input string to the canonical decimal precision for
 * the given currency. Used on input blur so OMR values always settle as
 * "1.000", "2.500", "0.000" etc. Empty / non-numeric strings are returned
 * unchanged so the user can keep typing freely.
 */
export function formatAmountForCurrency(value: string, currency: CurrencyCode): string {
  if (currency !== "OMR") return value;          // only OMR has the strict rule
  const trimmed = value.trim();
  if (trimmed === "") return value;
  const n = parseFloat(trimmed);
  if (isNaN(n)) return value;
  return n.toFixed(3);
}

// ── Region (timezone) ─────────────────────────────────────────────────────
export type RegionKey = "US" | "PK" | "OM";

export const REGIONS: Record<RegionKey, { label: string; timeZone: string }> = {
  US: { label: "United States", timeZone: "America/New_York" },
  PK: { label: "Pakistan",      timeZone: "Asia/Karachi" },
  OM: { label: "Oman",          timeZone: "Asia/Muscat" },
};

/** Best-effort detection of the user's region using the browser timezone. */
export function detectRegion(): RegionKey {
  if (typeof Intl === "undefined") return "US";
  let tz = "";
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { tz = ""; }
  if (tz === "Asia/Karachi") return "PK";
  if (tz === "Asia/Muscat" || tz === "Asia/Dubai") return "OM";
  if (tz.startsWith("America/")) return "US";
  // Fallback to UTC offset (hours east of UTC)
  const offset = -new Date().getTimezoneOffset() / 60;
  if (offset === 5) return "PK";
  if (offset === 4) return "OM";
  return "US";
}

// ── State ─────────────────────────────────────────────────────────────────
export type SettingsState = {
  performance: PerformanceMode;
  currency: CurrencyCode;
  region: RegionKey;
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
  /**
   * Demo Mode — when true the app runs as a sandboxed playground:
   *   • Cart bar starts pre-filled with sample items.
   *   • Cart History + Analytics show the stable demo dataset.
   *   • Any user action (add/remove cart items, edit products, checkout)
   *     works through the UI but is NOT persisted.
   *   • Toggling demo OFF discards every change made during the demo
   *     session and restores the real (pre-demo) state.
   * The legacy field name was `demoData`; `load()` migrates that on read.
   */
  demoMode: boolean;
  retention: RetentionMode;
  /** Days kept when `retention === "custom"`. Ignored otherwise. */
  retentionDays: number;
  confirmBeforeDelete: boolean;
  enableUndoDelete: boolean;
  bulkDeleteProtection: boolean;
  strictConfirm: boolean;
};

const DEFAULTS: SettingsState = {
  performance: "smooth",
  currency: "USD",
  region: "US",
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
  demoMode: true,
  retention: "all",
  retentionDays: 60,
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
    const parsed = JSON.parse(raw) as Partial<SettingsState> & { demoData?: boolean };
    // Migrate legacy retention values ("7d", "30d", "custom") to "all".
    const validRetention: RetentionMode[] = ["1y", "2y", "5y", "all", "custom"];
    const retention: RetentionMode = validRetention.includes(parsed?.retention as RetentionMode)
      ? (parsed.retention as RetentionMode)
      : "all";
    // Migrate legacy `demoData` field → `demoMode` (renamed for clarity since
    // the toggle now controls a sandboxed demo *mode*, not just demo data).
    const demoMode: boolean = typeof parsed.demoMode === "boolean"
      ? parsed.demoMode
      : typeof parsed.demoData === "boolean"
        ? parsed.demoData
        : DEFAULTS.demoMode;
    return {
      ...DEFAULTS,
      ...parsed,
      demoMode,
      retention,
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

  // Drive currency-aware spacing/scale through a global data attribute.
  // CSS reacts via :root[data-currency="OMR" | "PKR" | "USD"] selectors,
  // tightening tracking and gently shrinking hero displays for the
  // multi-character symbols ("Rs ", "R.O ") so they don't feel cramped
  // next to "$".
  useEffect(() => {
    document.documentElement.setAttribute("data-currency", settings.currency);
  }, [settings.currency]);

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
 * - USD: "$3.5"           (user-set decimals, trailing zeros trimmed)
 * - PKR: "Rs 980"         (user-set decimals, trailing zeros trimmed)
 * - OMR: "R.O 1.250"      (always 3 decimals, trailing zeros KEPT)
 *
 * OMR is the only currency with a strict precision rule — value `1` always
 * renders as `1.000`, `2.5` as `2.500`, and `0` as `0.000`.
 */
export function formatCurrency(v: number, s: SettingsState): string {
  const converted = convertFromUSD(v, s);
  const decimals = currencyDecimals(s.currency, s.decimals);
  const rounded = applyRounding(converted, decimals, s.rounding);
  const num = s.currency === "OMR"
    ? rounded.toFixed(3)                         // keep trailing zeros for OMR
    : formatNumberTrimmed(rounded, decimals);
  return `${CURRENCY_SYMBOLS[s.currency]}${num}`;
}

/**
 * Same as `formatCurrency()` but returns the symbol and value as separate
 * strings so callers can render them as independent elements with distinct
 * visual treatment (e.g. lighter symbol + emphasized value). The symbol
 * comes from `getCurrencySymbol()` so it never carries the trailing space —
 * spacing is owned by the consumer's layout (typically the `<Money>` flex
 * gap), which lets it scale per-currency.
 */
export function formatCurrencyParts(
  v: number,
  s: SettingsState,
): { symbol: string; value: string } {
  const converted = convertFromUSD(v, s);
  const decimals = currencyDecimals(s.currency, s.decimals);
  const rounded = applyRounding(converted, decimals, s.rounding);
  const value = s.currency === "OMR"
    ? rounded.toFixed(3)
    : formatNumberTrimmed(rounded, decimals);
  return { symbol: getCurrencySymbol(s.currency), value };
}

export function useCurrency() {
  const { settings } = useSettings();
  return useMemo(() => (v: number) => formatCurrency(v, settings), [settings]);
}

/**
 * Renders a currency amount as `{symbol}{gap}{value}` using two distinct
 * spans so that:
 *   - The symbol gets a lighter, slightly subdued treatment (font-weight
 *     500, opacity 0.7) — it reads as a label, not part of the digits.
 *   - The value carries the full emphasis from the parent (font-weight,
 *     color, size all inherit) plus tabular numerals for clean alignment.
 *   - The gap between them is currency-aware (set via the `--money-gap`
 *     CSS variable on `:root[data-currency=…]`), so "$" stays glued while
 *     "R.O" and "Rs" get the breathing room they need.
 *
 * Drop-in replacement anywhere `formatCurrency()` was being used inside
 * JSX. Keeps every existing parent class (size, color, weight) intact.
 */
export function Money({
  value,
  className = "",
  symbolClassName = "",
  valueClassName = "",
}: {
  value: number;
  className?: string;
  symbolClassName?: string;
  valueClassName?: string;
}) {
  const { settings } = useSettings();
  const { symbol, value: amount } = formatCurrencyParts(value, settings);
  return (
    <span className={`money ${className}`}>
      <span className={`money-symbol ${symbolClassName}`}>{symbol}</span>
      <span className={`money-value ${valueClassName}`}>{amount}</span>
    </span>
  );
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
