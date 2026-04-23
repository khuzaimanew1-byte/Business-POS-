import React, { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import {
  useSettings,
  matchesBinding,
  type ShortcutAction,
} from "./settings";

type Handler = {
  fn: (e: KeyboardEvent) => void;
  allowInInput?: boolean;
};

type Ctx = {
  register: (action: ShortcutAction, h: Handler) => () => void;
};

const ShortcutsContext = createContext<Ctx | null>(null);

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

export function ShortcutsProvider({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const [, setLocation] = useLocation();
  const navRef = useRef(setLocation);
  useEffect(() => {
    navRef.current = setLocation;
  }, [setLocation]);

  const registryRef = useRef<Map<ShortcutAction, Handler[]>>(new Map());

  const navHandlers = useMemo<Partial<Record<ShortcutAction, Handler>>>(
    () => ({
      openAnalytics: { fn: () => navRef.current("/analytics") },
      addProduct: { fn: () => navRef.current("/add-product") },
      openSettings: { fn: () => navRef.current("/settings") },
      back: {
        fn: () => {
          if (window.history.length > 1) window.history.back();
          else navRef.current("/");
        },
      },
    }),
    [],
  );

  const register: Ctx["register"] = (action, h) => {
    const reg = registryRef.current;
    const list = reg.get(action) ?? [];
    list.push(h);
    reg.set(action, list);
    return () => {
      const cur = reg.get(action);
      if (!cur) return;
      const idx = cur.lastIndexOf(h);
      if (idx >= 0) cur.splice(idx, 1);
      if (cur.length === 0) reg.delete(action);
    };
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = settingsRef.current;
      if (!s.shortcutsEnabled) return;

      const typing = isTypingTarget(e.target);

      for (const action of Object.keys(s.shortcuts) as ShortcutAction[]) {
        const binding = s.shortcuts[action];
        if (!binding) continue;
        if (!matchesBinding(e, binding)) continue;

        const list = registryRef.current.get(action);
        const pageHandler = list && list.length ? list[list.length - 1] : undefined;
        const navHandler = navHandlers[action];
        const handler = pageHandler ?? navHandler;

        // No active handler for this action in current context → silent ignore.
        if (!handler) return;
        if (typing && !handler.allowInInput) return;

        e.preventDefault();
        handler.fn(e);
        return;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navHandlers]);

  const ctx = useMemo<Ctx>(() => ({ register }), []);
  return <ShortcutsContext.Provider value={ctx}>{children}</ShortcutsContext.Provider>;
}

/**
 * Register a handler for a shortcut action while the calling component is mounted.
 * The latest mounted handler wins (LIFO), allowing pages to override defaults.
 *
 * - The binding is resolved live from settings, so edits apply instantly.
 * - Skipped silently when typing in inputs unless `allowInInput` is true.
 */
export function useShortcut(
  action: ShortcutAction,
  fn: (e: KeyboardEvent) => void,
  opts?: { allowInInput?: boolean; enabled?: boolean },
) {
  const ctx = useContext(ShortcutsContext);
  if (!ctx) throw new Error("useShortcut must be used inside <ShortcutsProvider>");

  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  const enabled = opts?.enabled ?? true;
  const allowInInput = opts?.allowInInput ?? false;

  useEffect(() => {
    if (!enabled) return;
    return ctx.register(action, {
      fn: (e) => fnRef.current(e),
      allowInInput,
    });
  }, [action, enabled, allowInInput, ctx]);
}
