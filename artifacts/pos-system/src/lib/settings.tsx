import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type PerformanceMode = "smooth" | "fast" | "ultra";
export type CurrencyCode = "PKR" | "USD" | "OMR";
export type RoundingMode = "standard" | "floor" | "ceiling";
export type RetentionMode = "7d" | "30d" | "all";

export type SettingsState = {
  performance: PerformanceMode;
  currency: CurrencyCode;
  decimals: 2 | 3;
  rounding: RoundingMode;
  shortcutsEnabled: boolean;
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
};

const DEFAULTS: SettingsState = {
  performance: "smooth",
  currency: "USD",
  decimals: 2,
  rounding: "standard",
  shortcutsEnabled: true,
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
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SettingsState>(load);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch {}
  }, [settings]);

  // Apply performance mode globally via data attribute (CSS hooks read this)
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-perf", settings.performance);
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

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = { PKR: "Rs ", USD: "$", OMR: "OMR " };
const SYMBOLS = CURRENCY_SYMBOLS;

export function applyRounding(v: number, decimals: number, mode: RoundingMode): number {
  const f = Math.pow(10, decimals);
  if (mode === "floor")   return Math.floor(v * f) / f;
  if (mode === "ceiling") return Math.ceil(v * f)  / f;
  return Math.round(v * f) / f;
}

export function formatCurrency(v: number, s: SettingsState): string {
  const rounded = applyRounding(v, s.decimals, s.rounding);
  const sym = SYMBOLS[s.currency];
  return `${sym}${rounded.toFixed(s.decimals)}`;
}

export function useCurrency() {
  const { settings } = useSettings();
  return useMemo(() => (v: number) => formatCurrency(v, settings), [settings]);
}
