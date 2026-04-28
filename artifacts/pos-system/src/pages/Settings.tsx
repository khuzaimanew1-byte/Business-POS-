import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  Home, BarChart2, Plus, Settings as SettingsIcon, ArrowLeft,
  Zap, DollarSign, Keyboard, Package, BarChart3, ShieldCheck, Sliders,
} from "lucide-react";
import {
  useSettings,
  type PerformanceMode, type CurrencyCode, type RoundingMode, type RetentionMode, type DecimalPrecision,
  type ShortcutAction, type ShortcutBinding,
  SHORTCUT_LABELS, DEFAULT_RATES,
  shortcutToString, detectConflicts, bindingFromKeyEvent,
} from "@/lib/settings";
import { AlertTriangle } from "lucide-react";
import { useStore } from "@/lib/store";
import { useShortcut } from "@/lib/shortcuts";
import { toast } from "sonner";

type SectionId = "performance" | "currency" | "input" | "shortcuts" | "defaults" | "data" | "safety";

const SECTIONS: { id: SectionId; label: string; icon: React.ReactNode }[] = [
  { id: "performance", label: "Performance",     icon: <Zap size={15} /> },
  { id: "currency",    label: "Currency",        icon: <DollarSign size={15} /> },
  { id: "input",       label: "Input Behavior",  icon: <Sliders size={15} /> },
  { id: "shortcuts",   label: "Shortcuts",       icon: <Keyboard size={15} /> },
  { id: "defaults",    label: "Defaults",        icon: <Package size={15} /> },
  { id: "data",        label: "Data & Analytics",icon: <BarChart3 size={15} /> },
  { id: "safety",      label: "Safety",          icon: <ShieldCheck size={15} /> },
];

export default function SettingsPage() {
  const [, setLocation] = useLocation();
  const [section, setSection] = useState<SectionId>("performance");
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 10); return () => clearTimeout(t); }, []);

  // Settings-only tab navigation: Ctrl+↑ / Ctrl+↓ cycles through sections.
  const cycleSection = (dir: 1 | -1) => {
    const idx = SECTIONS.findIndex(s => s.id === section);
    const start = idx < 0 ? 0 : idx;
    const next = (start + dir + SECTIONS.length) % SECTIONS.length;
    setSection(SECTIONS[next].id);
  };
  useShortcut('prevSettingsTab', () => cycleSection(-1));
  useShortcut('nextSettingsTab', () => cycleSection(1));

  return (
    <div className="page-enter-vertical flex h-screen bg-background text-foreground overflow-hidden">
<main className={`flex-1 flex flex-col min-w-0 transition-all duration-400 ease-out ${mounted ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'}`}>
        {/* Top bar */}
        <header className="h-14 sm:h-16 flex items-center px-3 sm:px-6 shrink-0 bg-background/90 backdrop-blur-sm sticky top-0 z-10 shadow-[0_1px_0_rgba(255,255,255,0.04),0_4px_24px_rgba(0,0,0,0.22)]">
          <button
            onClick={() => setLocation('/')}
            className="p-2 -ml-2 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors duration-200"
            aria-label="Back"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="ml-2 text-base sm:text-lg font-semibold tracking-tight">Settings</h1>
        </header>

        <div className="flex-1 overflow-y-auto">
          {/* Mobile section selector */}
          <div className="sm:hidden px-3 pt-3 pb-1">
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-2 -mx-3 px-3">
              {SECTIONS.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSection(s.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 whitespace-nowrap ${section === s.id ? 'bg-primary text-primary-foreground' : 'bg-secondary/50 text-muted-foreground'}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex max-w-6xl mx-auto w-full px-4 sm:px-8 py-6 sm:py-10 gap-8 sm:gap-12">
            {/* Desktop nav */}
            <nav className="hidden sm:block w-52 shrink-0 sticky top-6 self-start">
              <ul className="flex flex-col gap-0.5">
                {SECTIONS.map(s => (
                  <li key={s.id}>
                    <button
                      onClick={() => setSection(s.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                        section === s.id
                          ? 'bg-secondary/70 text-foreground'
                          : 'text-muted-foreground hover:text-foreground hover:bg-secondary/30'
                      }`}
                    >
                      <span className={section === s.id ? 'text-primary' : 'text-muted-foreground/70'}>{s.icon}</span>
                      <span>{s.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </nav>

            {/* Content */}
            <div key={section} className="flex-1 min-w-0 animate-in fade-in slide-in-from-right-2 duration-300">
              {section === "performance" && <PerformanceSection />}
              {section === "currency"    && <CurrencySection />}
              {section === "input"       && <InputBehaviorSection />}
              {section === "shortcuts"   && <ShortcutsSection />}
              {section === "defaults"    && <DefaultsSection />}
              {section === "data"        && <DataSection />}
              {section === "safety"      && <SafetySection />}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ── Reusable primitives ───────────────────────────────────────────────────
function SectionHeader({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">{title}</h2>
      {desc && <p className="text-sm text-muted-foreground mt-1">{desc}</p>}
    </div>
  );
}

function Block({ children, label, desc }: { children: React.ReactNode; label?: string; desc?: string }) {
  return (
    <div className="py-5 first:pt-0 border-b border-border/40 last:border-b-0">
      {(label || desc) && (
        <div className="mb-3">
          {label && <div className="text-sm font-medium text-foreground">{label}</div>}
          {desc && <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, label, desc }: { checked: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {desc && <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative shrink-0 w-10 h-6 rounded-full transition-colors duration-200 ${checked ? 'bg-primary' : 'bg-secondary'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
      </button>
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string; sub?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {options.map(opt => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`text-left px-4 py-3 rounded-xl border transition-all duration-200 ${
              active
                ? 'border-primary/50 bg-primary/[0.06] shadow-[0_0_0_1px_rgba(212,175,90,0.12)]'
                : 'border-border/50 bg-white/[0.015] hover:border-border hover:bg-white/[0.03]'
            }`}
          >
            <div className={`text-sm font-medium ${active ? 'text-foreground' : 'text-foreground/85'}`}>{opt.label}</div>
            {opt.sub && <div className="text-xs text-muted-foreground mt-0.5">{opt.sub}</div>}
          </button>
        );
      })}
    </div>
  );
}

function Select<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as T)}
      className="bg-input/50 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-ring/60 focus:ring-1 focus:ring-ring/20 transition-all duration-200 min-w-[140px]"
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function NumberInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value}
      onChange={e => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
      placeholder={placeholder}
      className="bg-input/50 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-ring/60 focus:ring-1 focus:ring-ring/20 transition-all duration-200 min-w-[140px] placeholder:text-muted-foreground/60"
    />
  );
}

function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {desc && <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[26px] h-7 px-2 rounded-md bg-secondary/80 border border-border/60 text-[11px] font-mono font-semibold text-foreground/90 shadow-[0_1px_0_rgba(255,255,255,0.05),0_1px_2px_rgba(0,0,0,0.4)]">
      {children}
    </kbd>
  );
}

// ── Sections ──────────────────────────────────────────────────────────────
function PerformanceSection() {
  const { settings, update } = useSettings();
  return (
    <>
      <SectionHeader title="Performance" desc="Tune system-wide motion to match your hardware and preference." />
      <Block label="Animation speed" desc="Applies instantly across the system.">
        <Segmented
          value={settings.performance}
          onChange={v => update("performance", v)}
          options={[
            { value: "smooth", label: "Smooth",     sub: "Default — full motion" },
            { value: "fast",   label: "Fast",       sub: "Reduced animation" },
            { value: "ultra",  label: "Ultra Fast", sub: "No animation" },
          ]}
        />
      </Block>
    </>
  );
}

function CurrencySection() {
  const { settings, update } = useSettings();
  return (
    <>
      <SectionHeader title="Currency" desc="Affects every price, total, and analytics figure." />
      <CurrencyCardSelector />
      <Block>
        <Row label="Decimal precision" desc="Maximum digits after the decimal. Trailing zeros are not shown.">
          <Select
            value={String(settings.decimals)}
            onChange={v => update("decimals", Number(v) as DecimalPrecision)}
            options={[
              { value: "0", label: "0 (e.g. 12)" },
              { value: "1", label: "1 (e.g. 12.3)" },
              { value: "2", label: "2 (e.g. 12.34)" },
              { value: "3", label: "3 (e.g. 12.345)" },
            ]}
          />
        </Row>
        <Row label="Rounding mode" desc="How fractional values are resolved.">
          <Select
            value={settings.rounding}
            onChange={v => update("rounding", v)}
            options={[
              { value: "standard", label: "Standard" },
              { value: "floor",    label: "Floor" },
              { value: "ceiling",  label: "Ceiling" },
            ]}
          />
        </Row>
      </Block>
    </>
  );
}

function CurrencyCardSelector() {
  const { settings, update } = useSettings();
  const [editing, setEditing] = useState(false);
  const [pkr, setPkr] = useState(String(settings.rates.PKR));
  const [omr, setOmr] = useState(String(settings.rates.OMR));

  const enterEdit = () => {
    setPkr(String(settings.rates.PKR));
    setOmr(String(settings.rates.OMR));
    setEditing(true);
  };

  const save = () => {
    const nextPkr = Number(pkr) || 0;
    const nextOmr = Number(omr) || 0;
    if (nextPkr <= 0 || nextOmr <= 0) {
      toast.error("Rates must be greater than zero");
      return;
    }
    update("rates", { PKR: nextPkr, OMR: nextOmr });
    setEditing(false);
    toast.success("Exchange rates updated");
  };

  const fmt = (n: number) =>
    n >= 100 ? n.toFixed(0) : n >= 1 ? n.toFixed(2).replace(/\.?0+$/, '') : n.toFixed(3).replace(/\.?0+$/, '');

  const select = (c: CurrencyCode) => { if (!editing) update("currency", c); };

  return (
    <Block>
      {/* Header row with Change/Save button */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs text-muted-foreground mt-0.5">Tap a card to set the active currency. USD is the base — all values derive from it.</div>
        </div>
        {editing ? (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setEditing(false)}
              className="h-9 px-3 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all duration-200"
            >
              Cancel
            </button>
            <button
              onClick={save}
              className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 active:scale-[0.97] transition-all duration-200"
              data-testid="btn-save-rates"
            >
              Save
            </button>
          </div>
        ) : (
          <button
            onClick={enterEdit}
            className="h-9 px-4 rounded-lg border border-border/60 bg-secondary/40 text-xs font-medium text-foreground hover:border-border hover:bg-secondary/60 transition-all duration-200 shrink-0"
            data-testid="btn-change-rates"
          >
            Change
          </button>
        )}
      </div>

      {/* 3-card row */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {/* USD — locked base */}
        <button
          type="button"
          onClick={() => select("USD")}
          disabled={editing}
          className={`group relative text-left px-3 sm:px-4 py-3 rounded-xl border transition-all duration-300 ${
            settings.currency === "USD"
              ? 'border-primary/55 bg-primary/[0.07] shadow-[0_0_0_1px_rgba(212,175,90,0.14)]'
              : 'border-border/50 bg-white/[0.015] hover:border-border hover:bg-white/[0.03]'
          } ${editing ? 'cursor-default' : 'cursor-pointer'}`}
          data-testid="card-usd"
        >
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-semibold">USD</span>
            {/* Source-direction arrow — only on USD */}
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary/15 text-primary text-[10px] leading-none" aria-label="Source currency">→</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-base sm:text-lg font-bold text-primary leading-none">$</span>
            <span className="text-[15px] sm:text-base font-mono font-semibold text-foreground tabular-nums leading-none">1</span>
          </div>
        </button>

        {/* PKR */}
        <button
          type="button"
          onClick={() => select("PKR")}
          disabled={editing}
          className={`group relative text-left px-3 sm:px-4 py-3 rounded-xl border transition-all duration-300 ${
            settings.currency === "PKR"
              ? 'border-primary/55 bg-primary/[0.07] shadow-[0_0_0_1px_rgba(212,175,90,0.14)]'
              : 'border-border/50 bg-white/[0.015] hover:border-border hover:bg-white/[0.03]'
          } ${editing ? 'cursor-default' : 'cursor-pointer'}`}
          data-testid="card-pkr"
        >
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-semibold">PKR</span>
          </div>
          {editing ? (
            <div className="relative h-7 -my-0.5">
              <span className="absolute left-0 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground pointer-events-none">₨</span>
              <input
                type="text"
                inputMode="decimal"
                value={pkr}
                onChange={e => setPkr(e.target.value.replace(/[^0-9.]/g, ''))}
                onClick={e => e.stopPropagation()}
                autoFocus
                className="w-full h-full pl-5 pr-1 bg-transparent border-0 border-b border-primary/50 focus:border-primary text-[15px] sm:text-base font-mono font-semibold text-foreground outline-none transition-colors duration-200 tabular-nums"
                data-testid="input-rate-pkr"
              />
            </div>
          ) : (
            <div className="flex items-baseline gap-1.5">
              <span className="text-base sm:text-lg font-bold text-muted-foreground leading-none">₨</span>
              <span className="text-[15px] sm:text-base font-mono font-semibold text-foreground tabular-nums leading-none">{fmt(settings.rates.PKR)}</span>
            </div>
          )}
        </button>

        {/* OMR — label on right */}
        <button
          type="button"
          onClick={() => select("OMR")}
          disabled={editing}
          className={`group relative text-left px-3 sm:px-4 py-3 rounded-xl border transition-all duration-300 ${
            settings.currency === "OMR"
              ? 'border-primary/55 bg-primary/[0.07] shadow-[0_0_0_1px_rgba(212,175,90,0.14)]'
              : 'border-border/50 bg-white/[0.015] hover:border-border hover:bg-white/[0.03]'
          } ${editing ? 'cursor-default' : 'cursor-pointer'}`}
          data-testid="card-omr"
        >
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-semibold">OMR</span>
          </div>
          {editing ? (
            <div className="relative h-7 -my-0.5">
              <input
                type="text"
                inputMode="decimal"
                value={omr}
                onChange={e => setOmr(e.target.value.replace(/[^0-9.]/g, ''))}
                onClick={e => e.stopPropagation()}
                className="w-full h-full pl-0 pr-10 bg-transparent border-0 border-b border-primary/50 focus:border-primary text-[15px] sm:text-base font-mono font-semibold text-foreground outline-none transition-colors duration-200 tabular-nums"
                data-testid="input-rate-omr"
              />
              <span className="absolute right-0 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground pointer-events-none">OMR</span>
            </div>
          ) : (
            <div className="flex items-baseline justify-between gap-1.5">
              <span className="text-[15px] sm:text-base font-mono font-semibold text-foreground tabular-nums leading-none">{fmt(settings.rates.OMR)}</span>
              <span className="text-[10px] font-bold text-muted-foreground leading-none">OMR</span>
            </div>
          )}
        </button>
      </div>
    </Block>
  );
}

function InputBehaviorSection() {
  const { settings, update } = useSettings();
  return (
    <>
      <SectionHeader title="Input Behavior" desc="Tweak how form inputs behave during fast data entry." />
      <Block>
        <Toggle checked={settings.enterNavigation} onChange={v => update("enterNavigation", v)} label="Enter navigates fields" desc="Press Enter to advance to the next input." />
        <Toggle checked={settings.autoFocusNext}   onChange={v => update("autoFocusNext", v)}   label="Auto-focus next input" desc="Move focus automatically when a field is filled." />
        <Toggle checked={settings.inputShake}      onChange={v => update("inputShake", v)}      label="Shake on invalid input" desc="Subtle vibration when a value is rejected." />
        <Toggle checked={settings.inlineErrors}    onChange={v => update("inlineErrors", v)}    label="Show inline errors" desc="Display validation messages under the field." />
      </Block>
    </>
  );
}

function ShortcutsSection() {
  const { settings, update } = useSettings();
  const [recordingFor, setRecordingFor] = useState<ShortcutAction | null>(null);
  const conflicts = useMemo(() => detectConflicts(settings.shortcuts), [settings.shortcuts]);
  const actions = Object.keys(SHORTCUT_LABELS) as ShortcutAction[];

  const startRecording = (action: ShortcutAction) => setRecordingFor(action);

  const onRecordKey = (e: React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") { setRecordingFor(null); return; }
    const binding = bindingFromKeyEvent(e);
    if (!binding || !recordingFor) return;

    // Detect conflict against bindings already assigned to other actions.
    const conflictWith = (Object.keys(settings.shortcuts) as ShortcutAction[]).find(a => {
      if (a === recordingFor) return false;
      const b = settings.shortcuts[a];
      if (!b) return false;
      return (
        b.ctrl === binding.ctrl &&
        b.shift === binding.shift &&
        b.alt === binding.alt &&
        b.meta === binding.meta &&
        b.key === binding.key
      );
    });

    update("shortcuts", { ...settings.shortcuts, [recordingFor]: binding });
    setRecordingFor(null);

    if (conflictWith) {
      toast.warning(`Shortcut conflicts with "${SHORTCUT_LABELS[conflictWith]}"`, {
        description: "Both actions are bound to the same key.",
      });
    } else {
      toast.success(`Shortcut updated`);
    }
  };

  return (
    <>
      <SectionHeader title="Keyboard Shortcuts" desc="Speed up your most common actions. Click any binding to reassign — changes apply instantly." />
      <Block>
        <Toggle checked={settings.shortcutsEnabled} onChange={v => update("shortcutsEnabled", v)} label="Enable keyboard shortcuts" desc="Master switch for all global hotkeys." />
      </Block>
      <Block>
        <div className={`flex flex-col divide-y divide-border/30 ${settings.shortcutsEnabled ? '' : 'opacity-40 pointer-events-none'}`}>
          {actions.map(action => {
            const binding = settings.shortcuts[action];
            const isRecording = recordingFor === action;
            const hasConflict = conflicts.has(action);
            return (
              <div key={action} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0 flex items-center gap-2">
                  <span className="text-sm text-foreground/90">{SHORTCUT_LABELS[action]}</span>
                  {hasConflict && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-amber-400/90 bg-amber-400/10 px-1.5 py-0.5 rounded">
                      <AlertTriangle size={10} /> Conflict
                    </span>
                  )}
                </div>
                <div className="shrink-0">
                  <button
                    onClick={() => startRecording(action)}
                    onKeyDown={isRecording ? onRecordKey : undefined}
                    onBlur={() => isRecording && setRecordingFor(null)}
                    autoFocus={isRecording}
                    className={`min-w-[140px] text-center px-3 py-1.5 rounded-md text-xs font-mono border transition-all duration-200 ${
                      isRecording
                        ? 'border-primary/60 bg-primary/[0.08] text-primary animate-pulse'
                        : hasConflict
                        ? 'border-amber-400/40 bg-amber-400/[0.05] text-foreground hover:border-amber-400/60'
                        : !binding
                        ? 'border-dashed border-border/60 text-muted-foreground hover:border-border'
                        : 'border-border/60 bg-secondary/40 text-foreground hover:border-border'
                    }`}
                  >
                    {isRecording ? "Press keys…" : shortcutToString(binding)}
                  </button>
                </div>
              </div>
            );
          })}

          {/* System / Locked shortcut — visible but not editable */}
          <div className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0 flex items-center gap-2">
              <span className="text-sm text-foreground/90">Adjust Cart Item Quantity</span>
              <span className="inline-flex items-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground bg-secondary/60 px-1.5 py-0.5 rounded">
                System
              </span>
            </div>
            <div className="shrink-0">
              <div
                title="System shortcut — cannot be changed"
                aria-disabled="true"
                className="min-w-[140px] text-center px-3 py-1.5 rounded-md text-xs font-mono border border-border/40 bg-secondary/20 text-muted-foreground cursor-not-allowed select-none"
              >
                C + 1–9 + ↑/↓
              </div>
            </div>
          </div>
        </div>
      </Block>
    </>
  );
}

function DefaultsSection() {
  const { settings, update } = useSettings();
  const { categories } = useStore();
  const catOptions = useMemo(() => [{ value: "", label: "— None —" }, ...categories.filter(c => c !== "All").map(c => ({ value: c, label: c }))], [categories]);
  return (
    <>
      <SectionHeader title="Defaults" desc="Auto-fill these values when adding a new product." />
      <Block>
        <Row label="Default profit" desc="Pre-filled in the Profit field on Add Product.">
          <NumberInput value={settings.defaultProfit} onChange={v => update("defaultProfit", v)} placeholder="0.00" />
        </Row>
        <Row label="Default stock" desc="Pre-filled in the Stock field on Add Product.">
          <NumberInput value={settings.defaultStock} onChange={v => update("defaultStock", v)} placeholder="0" />
        </Row>
        <Row label="Default category" desc="Pre-selected in the category dropdown.">
          <Select
            value={settings.defaultCategory}
            onChange={v => update("defaultCategory", v)}
            options={catOptions}
          />
        </Row>
      </Block>
    </>
  );
}

function DataSection() {
  const { settings, update } = useSettings();
  return (
    <>
      <SectionHeader title="Data & Analytics" desc="Manage stored sales and analytics history." />
      <Block>
        <Toggle checked={settings.demoData} onChange={v => update("demoData", v)} label="Demo data" desc="Use sample data for charts when no real activity exists." />
        <Row label="Data retention" desc="How long analytics history is kept.">
          <Select
            value={settings.retention}
            onChange={v => update("retention", v)}
            options={[
              { value: "7d",  label: "7 days" },
              { value: "30d", label: "30 days" },
              { value: "all", label: "All time" },
            ]}
          />
        </Row>
      </Block>
      <Block label="Reset" desc="Clears stored analytics events. This cannot be undone.">
        <button
          onClick={() => {
            try { localStorage.removeItem("pos.analytics.v1"); } catch {}
            toast.success("Analytics data cleared");
          }}
          className="px-4 py-2 rounded-lg text-sm font-medium text-destructive border border-destructive/30 hover:bg-destructive/10 active:scale-[0.97] transition-all duration-200"
        >
          Reset analytics data
        </button>
      </Block>
    </>
  );
}

function SafetySection() {
  const { settings, update } = useSettings();
  return (
    <>
      <SectionHeader title="Safety" desc="Guardrails to prevent accidental data loss." />
      <Block>
        <Toggle checked={settings.confirmBeforeDelete}   onChange={v => update("confirmBeforeDelete", v)}   label="Confirm before delete"     desc="Show a confirmation dialog for destructive actions." />
        <Toggle checked={settings.enableUndoDelete}      onChange={v => update("enableUndoDelete", v)}      label="Enable undo delete"        desc="Show a brief undo toast after deleting." />
        <Toggle checked={settings.bulkDeleteProtection}  onChange={v => update("bulkDeleteProtection", v)}  label="Bulk delete protection"    desc="Always require confirmation when deleting more than one item." />
        <Toggle checked={settings.strictConfirm}         onChange={v => update("strictConfirm", v)}         label="Strict confirmation"       desc="Require typing the item name to confirm destructive actions." />
      </Block>
    </>
  );
}
