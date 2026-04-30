import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  Home, BarChart2, Plus, Settings as SettingsIcon, ArrowLeft,
  Zap, Keyboard, Package, BarChart3, ShieldCheck, Sliders, Globe, ArrowRight,
  CornerDownLeft, ArrowUpRight, Info,
  Database, FlaskConical, Clock, RotateCcw, Undo2, ShieldAlert, Lock, Layers,
} from "lucide-react";
import {
  useSettings,
  type PerformanceMode, type CurrencyCode, type RoundingMode, type RetentionMode, type DecimalPrecision,
  type ShortcutAction, type ShortcutBinding, type RegionKey,
  SHORTCUT_LABELS, DEFAULT_RATES, REGIONS, detectRegion,
  shortcutToString, detectConflicts, bindingFromKeyEvent,
} from "@/lib/settings";
import { AlertTriangle } from "lucide-react";
import { useStore } from "@/lib/store";
import { useShortcut } from "@/lib/shortcuts";
import { toast } from "sonner";

type SectionId = "experience" | "region" | "shortcuts" | "defaults" | "dataSafety";

const SECTIONS: { id: SectionId; label: string; icon: React.ReactNode }[] = [
  { id: "experience",  label: "Experience",     icon: <Sliders size={15} /> },
  { id: "region",      label: "Region",         icon: <Globe size={15} /> },
  { id: "shortcuts",   label: "Shortcuts",      icon: <Keyboard size={15} /> },
  { id: "defaults",    label: "Defaults",       icon: <Package size={15} /> },
  { id: "dataSafety",  label: "Data & Safety",  icon: <Database size={15} /> },
];

export default function SettingsPage() {
  const [, setLocation] = useLocation();
  const [section, setSection] = useState<SectionId>("experience");
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
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
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
              {section === "experience"  && <ExperienceSection />}
              {section === "region"      && <RegionSection />}
              {section === "shortcuts"   && <ShortcutsSection />}
              {section === "defaults"    && <DefaultsSection />}
              {section === "dataSafety"  && <DataSafetySection />}
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

/* ── Experience tab ────────────────────────────────────────────────────────
   Combines what used to be two separate tabs (Performance + Input Behavior)
   into a single, scannable surface:
     • Left column  — Animation Speed: 3 selectable cards (radio-style),
                      one per motion preset, each with a glyph that
                      visually represents the curve (sine / zigzag / flat).
     • Right column — Input Behaviour: 4 toggle rows for keyboard-flow
                      preferences during fast data entry.
   On mobile both columns stack: Animation Speed first, then Input
   Behaviour, preserving the same row anatomy. */

// Custom glyphs for the speed cards. Lucide doesn't ship clean sine /
// zigzag / flat-line single-glyph icons, so we draw them inline. They all
// share the same 24×24 canvas and a 1.75 stroke so they read as a set.
function WaveSineIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12 C 5 5, 8 5, 11 12 S 17 19, 20 12" />
    </svg>
  );
}
function WaveZigIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="2,16 6,8 10,16 14,8 18,16 22,8" />
    </svg>
  );
}
function WaveFlatIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="3" y1="12" x2="21" y2="12" />
    </svg>
  );
}

// Shared row-icon tile — small rounded square that holds the glyph. Visual
// weight shifts based on whether its row is "active" (selected speed card
// or any toggle row, since toggles always feel "on" structurally).
function RowIconTile({ children, active = false }: { children: React.ReactNode; active?: boolean }) {
  return (
    <div
      className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-colors duration-200 ${
        active
          ? 'bg-primary/15 text-primary'
          : 'bg-secondary/60 text-muted-foreground'
      }`}
      aria-hidden
    >
      {children}
    </div>
  );
}

function ExperienceSection() {
  const { settings, update } = useSettings();

  const SPEEDS: { value: PerformanceMode; label: string; hint: string; icon: React.ReactNode }[] = [
    { value: "smooth", label: "Smooth",     hint: "Full motion", icon: <WaveSineIcon /> },
    { value: "fast",   label: "Fast",       hint: "Reduced",     icon: <WaveZigIcon  /> },
    { value: "ultra",  label: "Ultra Fast", hint: "No motion",   icon: <WaveFlatIcon /> },
  ];

  // `key` here matches the SettingsState boolean field. Order mirrors the
  // reference image: Enter → Auto-focus → Shake → Inline errors.
  const TOGGLES: { key: "enterNavigation" | "autoFocusNext" | "inputShake" | "inlineErrors";
                   label: string; sub: string; icon: React.ReactNode }[] = [
    { key: "enterNavigation", label: "Enter navigates", sub: "Jump to next field",   icon: <CornerDownLeft size={18} strokeWidth={2} /> },
    { key: "autoFocusNext",   label: "Auto-focus",      sub: "Focus on field fill",  icon: <ArrowUpRight   size={18} strokeWidth={2} /> },
    { key: "inputShake",      label: "Shake on error",  sub: "Vibrate on rejection", icon: <Zap            size={18} strokeWidth={2} /> },
    { key: "inlineErrors",    label: "Inline errors",   sub: "Show under field",     icon: <Info           size={18} strokeWidth={2} /> },
  ];

  return (
    <>
      <SectionHeader title="Experience" desc="Motion and input-flow preferences in one place." />

      {/* Two columns on laptop, stacked on mobile. Same row anatomy
          (icon left, text right) used for both groups so the surface
          reads as one cohesive setting. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6">
        {/* ── Animation Speed ─────────────────────────────────────────── */}
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80 mb-3">
            Animation Speed
          </h3>
          <div className="flex flex-col gap-2">
            {SPEEDS.map(opt => {
              const active = settings.performance === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => update("performance", opt.value)}
                  aria-pressed={active}
                  data-testid={`speed-${opt.value}`}
                  className={`flex items-center gap-3 px-3.5 py-3 rounded-xl border text-left transition-all duration-200 ${
                    active
                      ? 'border-primary/55 bg-primary/[0.07] shadow-[0_0_0_1px_rgba(212,175,90,0.12)]'
                      : 'border-border/50 bg-white/[0.015] hover:border-border hover:bg-white/[0.03]'
                  }`}
                >
                  <RowIconTile active={active}>{opt.icon}</RowIconTile>
                  <div className="min-w-0 flex flex-col leading-tight">
                    <span className={`text-sm font-medium ${active ? 'text-foreground' : 'text-foreground/85'}`}>
                      {opt.label}
                    </span>
                    <span className="text-xs text-muted-foreground mt-0.5">{opt.hint}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Input Behaviour ─────────────────────────────────────────── */}
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80 mb-3">
            Input Behaviour
          </h3>
          <div className="rounded-2xl bg-white/[0.025] divide-y divide-white/[0.06] overflow-hidden">
            {TOGGLES.map(t => {
              const checked = settings[t.key];
              const isInlineErrors = t.key === "inlineErrors";
              return (
                <div
                  key={t.key}
                  className="flex items-center gap-4 px-4 py-3.5"
                  data-testid={`toggle-row-${t.key}`}
                >
                  <div
                    className={`shrink-0 flex items-center justify-center ${
                      isInlineErrors ? 'text-[#b3372f]' : 'text-muted-foreground/80'
                    }`}
                    aria-hidden
                  >
                    {t.icon}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col leading-tight">
                    <span className="text-sm font-medium text-foreground">{t.label}</span>
                    <span className="text-xs text-muted-foreground mt-0.5">{t.sub}</span>
                  </div>
                  <button
                    role="switch"
                    aria-checked={checked}
                    aria-label={t.label}
                    onClick={() => update(t.key, !checked)}
                    data-testid={`toggle-${t.key}`}
                    className={`relative shrink-0 w-10 h-6 rounded-full transition-all duration-200 ${
                      checked
                        ? 'bg-primary shadow-[0_0_0_3px_rgba(212,175,90,0.18)]'
                        : 'bg-secondary'
                    }`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Region tab — visual hierarchy ────────────────────────────────────────
   T1  page title          — text-lg sm:text-xl font-semibold
   T2  block heading       — text-sm  font-semibold
   T3  card eyebrow        — text-[11px] font-semibold (codes uppercase+tracked,
                             country names in normal case)
   T4  primary value       — text-base font-mono font-semibold (rate / time)
   T4  unit prefix         — text-base font-semibold (matches value baseline)
   T5  card meta line      — text-[10px] uppercase tracking-wider font-medium
   T6  badges              — text-[9px]  font-semibold
   B   buttons             — text-xs    font-medium
   Spacing is intentionally tight: the whole tab is one compact, scannable
   surface with no wasted vertical real-estate. */

function RegionSection() {
  return (
    <>
      {/* Compact T1 page title — overrides the global SectionHeader's larger
          spacing so the Region tab feels denser. */}
      <div className="mb-4">
        <h2 className="text-lg sm:text-xl font-semibold tracking-tight">Region</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Set your active currency, exchange rates, and time zone.</p>
      </div>
      <CurrencyRatesBlock />
      <div className="h-px bg-border/40 my-4" />
      <TimeZoneBlock />
    </>
  );
}

/* ── Currency block ────────────────────────────────────────────────────────
   Section title "Currency" on the left, "Edit rates" button on the right.
   Below: three cards in a horizontal row — USD, then a tall right-pointing
   arrow, then PKR and OMR. USD shows "$1" and is never editable. PKR and OMR
   show their rate (1-decimal / 3-decimal). When editing, PKR and OMR cards
   expose inline number inputs and the button toggles to "Save". On Save,
   values are re-formatted to their fixed precision. */
function CurrencyRatesBlock() {
  const { settings, update } = useSettings();
  const [editing, setEditing] = useState(false);
  const [pkr, setPkr] = useState(settings.rates.PKR.toFixed(1));
  const [omr, setOmr] = useState(settings.rates.OMR.toFixed(3));

  const enterEdit = () => {
    setPkr(settings.rates.PKR.toFixed(1));
    setOmr(settings.rates.OMR.toFixed(3));
    setEditing(true);
  };

  const save = () => {
    const nextPkr = Number(pkr);
    const nextOmr = Number(omr);
    if (!Number.isFinite(nextPkr) || !Number.isFinite(nextOmr) || nextPkr <= 0 || nextOmr <= 0) {
      toast.error("Rates must be greater than zero");
      return;
    }
    const fixedPkr = Number(nextPkr.toFixed(1));
    const fixedOmr = Number(nextOmr.toFixed(3));
    update("rates", { PKR: fixedPkr, OMR: fixedOmr });
    setEditing(false);
    toast.success("Exchange rates updated");
  };

  const select = (c: CurrencyCode) => { if (!editing) update("currency", c); };

  // Display formatters — fixed precision per currency, per spec.
  const dispPkr = settings.rates.PKR.toFixed(1);
  const dispOmr = settings.rates.OMR.toFixed(3);

  // Card chrome shared across USD / PKR / OMR.
  const cardBase =
    "group relative text-left px-3 py-2.5 rounded-xl border transition-all duration-300";
  const cardActive =
    "border-primary/55 bg-primary/[0.07] shadow-[0_0_0_1px_rgba(212,175,90,0.14)]";
  const cardInactive =
    "border-border/50 bg-white/[0.015] hover:border-border hover:bg-white/[0.03]";

  // Tier classes — single source of truth so all three cards stay in lockstep.
  const eyebrowCls = "text-sm uppercase tracking-wider text-muted-foreground/80 font-semibold mb-1";
  const valueCls   = "text-base font-mono font-semibold text-foreground tabular-nums leading-none";
  const unitCls    = "text-xs font-semibold text-muted-foreground leading-none";

  return (
    <div>
      {/* Section title left, action button right — same row */}
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="text-sm font-semibold tracking-tight">Currency</h3>
        {editing ? (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setEditing(false)}
              className="h-8 px-3 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all duration-200"
            >
              Cancel
            </button>
            <button
              onClick={save}
              className="h-8 px-3.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 active:scale-[0.97] transition-all duration-200"
              data-testid="btn-save-rates"
            >
              Save
            </button>
          </div>
        ) : (
          <button
            onClick={enterEdit}
            className="h-8 px-3.5 rounded-lg border border-border/60 bg-secondary/40 text-xs font-medium text-foreground hover:border-border hover:bg-secondary/60 transition-all duration-200 shrink-0"
            data-testid="btn-edit-rates"
          >
            Edit rates
          </button>
        )}
      </div>

      {/* Layout —
            • Mobile (<sm):   USD (full width)
                              ↓ arrow
                              [PKR | OMR] side-by-side
            • Desktop (sm+):  USD → PKR  OMR  (single row)
          The PKR+OMR sub-wrapper uses `sm:contents` so on desktop it
          collapses out of the layout and PKR/OMR become direct children of
          the outer flex row, giving all three cards equal share. */}
      <div className="flex flex-col sm:flex-row sm:items-stretch gap-2">
        {/* USD card — locked base, never editable */}
        <button
          type="button"
          onClick={() => select("USD")}
          disabled={editing}
          className={`sm:flex-1 ${cardBase} ${settings.currency === "USD" ? cardActive : cardInactive} ${editing ? "cursor-default" : "cursor-pointer"}`}
          data-testid="card-usd"
        >
          {/* Single horizontal row — code on left, symbol+value on right */}
          <div className="flex items-center justify-between gap-2">
            <div className={`${eyebrowCls} !mb-0`}>USD</div>
            <div className="flex items-baseline gap-1">
              <span className={`${unitCls} text-primary`}>$</span>
              <span className={valueCls}>1</span>
            </div>
          </div>
        </button>

        {/* Arrow — points down on mobile, right on desktop. self-stretch
            on the cross-axis makes it span the full card height on desktop;
            on mobile it just sits in its own thin row, horizontally centered. */}
        <div
          className="flex items-center justify-center shrink-0 self-stretch px-1 py-0.5 sm:py-0 text-muted-foreground/60"
          aria-hidden="true"
        >
          <ArrowRight size={26} strokeWidth={1.5} className="rotate-90 sm:rotate-0" />
        </div>

        {/* PKR + OMR — own flex row on mobile, dissolved into outer row on desktop */}
        <div className="flex gap-2 sm:contents">
        {/* PKR card */}
        <button
          type="button"
          onClick={() => select("PKR")}
          disabled={editing}
          className={`flex-1 ${cardBase} ${settings.currency === "PKR" ? cardActive : cardInactive} ${editing ? "cursor-default" : "cursor-pointer"}`}
          data-testid="card-pkr"
        >
          {/* Single horizontal row — code on left, symbol+value on right */}
          <div className="flex items-center justify-between gap-2">
            <div className={`${eyebrowCls} !mb-0`}>PKR</div>
            {editing ? (
              <div className="relative h-6 -my-0.5 flex-1 max-w-[7rem]">
                <span className={`absolute left-0 top-1/2 -translate-y-1/2 ${unitCls} pointer-events-none`}>Rs</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={pkr}
                  onChange={e => setPkr(e.target.value.replace(/[^0-9.]/g, ''))}
                  onClick={e => e.stopPropagation()}
                  autoFocus
                  className={`w-full h-full pl-7 pr-1 text-right bg-transparent border-0 border-b border-primary/50 focus:border-primary outline-none transition-colors duration-200 ${valueCls}`}
                  data-testid="input-rate-pkr"
                />
              </div>
            ) : (
              <div className="flex items-baseline gap-1.5">
                <span className={unitCls}>Rs</span>
                <span className={valueCls}>{dispPkr}</span>
              </div>
            )}
          </div>
        </button>

        {/* OMR card — no arrow before it */}
        <button
          type="button"
          onClick={() => select("OMR")}
          disabled={editing}
          className={`flex-1 ${cardBase} ${settings.currency === "OMR" ? cardActive : cardInactive} ${editing ? "cursor-default" : "cursor-pointer"}`}
          data-testid="card-omr"
        >
          {/* Single horizontal row — code on left, symbol+value on right */}
          <div className="flex items-center justify-between gap-2">
            <div className={`${eyebrowCls} !mb-0`}>OMR</div>
            {editing ? (
              <div className="relative h-6 -my-0.5 flex-1 max-w-[7rem]">
                <span className={`absolute left-0 top-1/2 -translate-y-1/2 ${unitCls} pointer-events-none`}>R.O</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={omr}
                  onChange={e => setOmr(e.target.value.replace(/[^0-9.]/g, ''))}
                  onClick={e => e.stopPropagation()}
                  className={`w-full h-full pl-10 pr-1 text-right bg-transparent border-0 border-b border-primary/50 focus:border-primary outline-none transition-colors duration-200 ${valueCls}`}
                  data-testid="input-rate-omr"
                />
              </div>
            ) : (
              <div className="flex items-baseline gap-1.5">
                <span className={unitCls}>R.O</span>
                <span className={valueCls}>{dispOmr}</span>
              </div>
            )}
          </div>
        </button>
        </div>
      </div>
    </div>
  );
}

/* ── Time-zone block ───────────────────────────────────────────────────────
   Three cards (United States / Pakistan / Oman). Each shows a live 12-hour
   clock (HH:MM only) and the timezone abbreviation + UTC offset, computed
   from the IANA zone via `Intl.DateTimeFormat`. The browser-detected region
   is marked with a small "auto-detected" badge; the user's manual selection
   is persisted in settings and shown via a dot in the top-right corner.
   The clock ticks once a minute. */
function TimeZoneBlock() {
  const { settings, update } = useSettings();
  const detected = useMemo<RegionKey>(() => detectRegion(), []);

  // Live "now" that updates every minute, aligned to the next minute boundary
  // so all three clocks tick together on the :00 second.
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const msToNextMinute = 60000 - (Date.now() % 60000);
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const timeoutId = setTimeout(() => {
      tick();
      intervalId = setInterval(tick, 60000);
    }, msToNextMinute);
    return () => {
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  const order: RegionKey[] = ["US", "PK", "OM"];

  return (
    <div>
      <h3 className="text-sm font-semibold tracking-tight mb-2.5">Time zone</h3>
      {/* Cards: stacked full-width on mobile, 3-column row on desktop. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {order.map(key => {
          const meta = REGIONS[key];
          const isActive = settings.region === key;
          const isAuto = detected === key;
          const time = formatTime12h(now, meta.timeZone);
          const { abbr, offset } = formatZone(now, meta.timeZone);
          return (
            <button
              key={key}
              type="button"
              onClick={() => update("region", key)}
              className={`relative text-left px-3 py-2.5 rounded-xl border transition-all duration-300 cursor-pointer ${
                isActive
                  ? "border-primary/55 bg-primary/[0.07] shadow-[0_0_0_1px_rgba(212,175,90,0.14)]"
                  : "border-border/50 bg-white/[0.015] hover:border-border hover:bg-white/[0.03]"
              }`}
              data-testid={`card-region-${key.toLowerCase()}`}
              aria-pressed={isActive}
            >
              {/* Active dot — top-right corner, both layouts */}
              <span
                className={`absolute top-2.5 right-2.5 inline-block w-2 h-2 rounded-full transition-all duration-200 ${
                  isActive ? "bg-primary shadow-[0_0_6px_rgba(212,175,90,0.7)]" : "bg-muted-foreground/25"
                }`}
                aria-hidden="true"
              />
              {/* Row container — name+subtitle stacked on the LEFT, live
                  clock on the RIGHT, vertically centered against the stack.
                  pr-5 reserves space on the right for the absolute dot. */}
              <div className="flex items-center justify-between gap-3 pr-5">
                {/* Left column: country name (+ Auto badge) above subtitle */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[11px] font-semibold text-foreground/95 leading-none truncate">
                      {meta.label}
                    </span>
                    {isAuto && (
                      <span
                        className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-semibold leading-none"
                        title="Detected from your browser"
                      >
                        <span className="w-1 h-1 rounded-full bg-primary" />
                        Auto
                      </span>
                    )}
                  </div>
                  {/* Subtitle: abbr + UTC offset */}
                  <div className="mt-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium leading-none">
                    {abbr === offset ? offset : <>{abbr} <span className="opacity-70">· {offset}</span></>}
                  </div>
                </div>
                {/* Right side: live clock — middle-aligned with the left stack */}
                <div className="shrink-0 text-base font-mono font-semibold tabular-nums text-foreground leading-none whitespace-nowrap">
                  {time}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Format a moment as "h:mm AM/PM" in the given IANA zone (no seconds). */
function formatTime12h(d: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d);
  } catch {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
  }
}

/** Hand-curated fallback short names for zones where Intl returns "GMT±N"
 *  rather than a real abbreviation. Keeps display tight. */
const ZONE_ABBR_FALLBACK: Record<string, string> = {
  "Asia/Karachi": "PKT",
  "Asia/Muscat":  "GST",
};

/** Resolve the timezone short-name (e.g. "EST") and signed UTC offset
 *  ("UTC-5" / "UTC+5:30") for a moment in the given IANA zone. */
function formatZone(d: Date, timeZone: string): { abbr: string; offset: string } {
  let abbr = "";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "short",
      hour: "numeric",
    }).formatToParts(d);
    abbr = parts.find(p => p.type === "timeZoneName")?.value ?? "";
  } catch {}

  // If the runtime returns a generic GMT±N string, normalise it; otherwise
  // keep the locale's short name (e.g. "EST", "PKT").
  let offset = "";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortOffset",
      hour: "numeric",
    }).formatToParts(d);
    const raw = parts.find(p => p.type === "timeZoneName")?.value ?? "";
    // raw is like "GMT-5" or "GMT+5:30"; relabel with "UTC".
    offset = raw.replace(/^GMT/, "UTC") || raw;
  } catch {}

  if (!offset) {
    // Fallback: compute from the difference between zone-local and UTC strings.
    try {
      const local = new Date(d.toLocaleString("en-US", { timeZone }));
      const utc = new Date(d.toLocaleString("en-US", { timeZone: "UTC" }));
      const diffMin = Math.round((local.getTime() - utc.getTime()) / 60000);
      const sign = diffMin >= 0 ? "+" : "-";
      const h = Math.floor(Math.abs(diffMin) / 60);
      const m = Math.abs(diffMin) % 60;
      offset = `UTC${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
    } catch {
      offset = "UTC";
    }
  }

  if (!abbr || /^GMT[+\-0-9:]/.test(abbr)) {
    // No locale-friendly abbreviation available — prefer a curated fallback,
    // otherwise show the offset itself (caller will dedupe).
    abbr = ZONE_ABBR_FALLBACK[timeZone] ?? offset;
  }

  return { abbr, offset };
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
        <div className={`${settings.shortcutsEnabled ? '' : 'opacity-40 pointer-events-none'}`}>
          {(() => {
            const SHORTCUT_DESCRIPTIONS: Partial<Record<ShortcutAction, string>> = {
              createProduct: "Confirm, save, or create — works everywhere.",
            };

            const GROUPS: { title: string; actions: ShortcutAction[] }[] = [
              {
                title: "Navigation",
                actions: [
                  "openAnalytics",
                  "openNotifications",
                  "openCart",
                  "openSettings",
                  "back",
                ],
              },
              {
                title: "Actions",
                actions: [
                  "toggleSearch",
                  "prevCategory",
                  "nextCategory",
                  "prevSettingsTab",
                  "nextSettingsTab",
                ],
              },
              {
                title: "Products",
                actions: [
                  "addProduct",
                  "createAndAnother",
                  "toggleEditMode",
                ],
              },
            ];
            // Actions shown only in System: don't let orphan-sweep dump them
            // into one of the visible groups.
            const SYSTEM_ONLY_ACTIONS: ShortcutAction[] = ["createProduct"];
            const known = new Set<ShortcutAction>([
              ...GROUPS.flatMap(g => g.actions),
              ...SYSTEM_ONLY_ACTIONS,
            ]);
            const orphans = actions.filter(a => !known.has(a));
            if (orphans.length) GROUPS[GROUPS.length - 1].actions.push(...orphans);

            const renderRow = (action: ShortcutAction) => {
              const binding = settings.shortcuts[action];
              const isRecording = recordingFor === action;
              const hasConflict = conflicts.has(action);
              const desc = SHORTCUT_DESCRIPTIONS[action];
              return (
                <div key={action} className="flex items-center justify-between gap-3 py-2.5 border-b border-border/20 last:border-b-0">
                  <div className="min-w-0 flex flex-col leading-tight">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-foreground/90 truncate">{SHORTCUT_LABELS[action]}</span>
                      {hasConflict && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-amber-400/90 bg-amber-400/10 px-1.5 py-0.5 rounded">
                          <AlertTriangle size={10} /> Conflict
                        </span>
                      )}
                    </div>
                    {desc && (
                      <span className="text-xs text-muted-foreground mt-0.5">{desc}</span>
                    )}
                  </div>
                  <div className="shrink-0">
                    <button
                      onClick={() => startRecording(action)}
                      onKeyDown={isRecording ? onRecordKey : undefined}
                      onBlur={() => isRecording && setRecordingFor(null)}
                      autoFocus={isRecording}
                      className={`min-w-[120px] text-center px-3 py-1.5 rounded-full text-xs font-mono border transition-all duration-200 ${
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
            };

            const SYSTEM_ROWS: { label: string; binding: string; title: string }[] = [
              {
                label: "Adjust Cart Item Quantity",
                binding: "C + 1–9 + ↑/↓",
                title: "System shortcut — cannot be changed",
              },
            ];

            // Layout intent (lg+):
            //   col 1                col 2
            //   ┌──────────────┐  ┌──────────────┐
            //   │ Navigation   │  │ Actions      │
            //   ├──────────────┤  ├──────────────┤
            //   │ Products     │  │ System       │
            //   └──────────────┘  └──────────────┘
            // Achieved by emitting Nav, Actions, Products, System into the
            // same grid in that exact order so auto-placement does the work.
            return (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-8">
                {GROUPS.map(group => (
                  <div key={group.title}>
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80 mb-2">
                      {group.title}
                    </h3>
                    <div className="flex flex-col">
                      {group.actions.map(renderRow)}
                    </div>
                  </div>
                ))}

                <div>
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80 mb-2">
                    System
                  </h3>
                  <div className="flex flex-col">
                    {renderRow("createProduct")}
                    {SYSTEM_ROWS.map(row => (
                      <div
                        key={row.label}
                        className="flex items-center justify-between gap-3 py-2.5 border-b border-border/20 last:border-b-0"
                      >
                        <div className="min-w-0 flex items-center gap-2">
                          <span className="text-sm text-foreground/90 truncate">{row.label}</span>
                        </div>
                        <div className="shrink-0">
                          <div
                            title={row.title}
                            aria-disabled="true"
                            className="min-w-[120px] text-center px-3 py-1.5 rounded-full text-xs font-mono border border-border/40 bg-secondary/20 text-muted-foreground cursor-not-allowed select-none"
                          >
                            {row.binding}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}
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

/* ── Data & Safety ─────────────────────────────────────────────────────────
   Minimal, heading-only layout. No cards, no chips, no descriptions — just
   tight rows with naked icons. The Data Retention bar reflects how full the
   selected window actually is, based on the oldest stored sale event. */

const RETENTION_OPTIONS: { value: RetentionMode; label: string }[] = [
  { value: "1y",     label: "1 Year" },
  { value: "2y",     label: "2 Years" },
  { value: "5y",     label: "5 Years" },
  { value: "all",    label: "All Time" },
  { value: "custom", label: "Custom" },
];

function MiniSwitch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-disabled={disabled || undefined}
      onClick={() => !disabled && onChange(!checked)}
      data-testid={`toggle-${label.toLowerCase().replace(/\s+/g, "-")}`}
      className={`relative shrink-0 w-10 h-6 rounded-full transition-all duration-200 ${
        disabled ? 'opacity-40 cursor-not-allowed' : ''
      } ${
        checked
          ? 'bg-primary shadow-[0_0_0_3px_rgba(212,175,90,0.18)]'
          : 'bg-secondary'
      }`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  );
}

function OptionRow({
  icon,
  label,
  control,
  disabled,
  hint,
  destructive,
  children,
}: {
  icon: React.ReactNode;
  label: React.ReactNode;
  control?: React.ReactNode;
  disabled?: boolean;
  hint?: React.ReactNode;
  destructive?: boolean;
  children?: React.ReactNode;
}) {
  const testId = typeof label === "string"
    ? label.toLowerCase().replace(/\s+/g, "-")
    : "row";
  return (
    <div
      className={`py-3 transition-opacity duration-200 ${disabled ? 'opacity-50' : ''}`}
      data-testid={`row-${testId}`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`shrink-0 inline-flex items-center justify-center ${
            destructive ? 'text-destructive' : 'text-muted-foreground'
          }`}
          aria-hidden
        >
          {icon}
        </span>
        <span className={`flex-1 min-w-0 text-sm font-medium ${destructive ? 'text-destructive' : 'text-foreground'}`}>
          {label}
        </span>
        {control && <div className="shrink-0">{control}</div>}
      </div>
      {hint && (
        <div className="mt-1.5 ml-7 text-[11px] text-amber-300/90 inline-flex items-center gap-1.5">
          <Info size={12} /> {hint}
        </div>
      )}
      {children && <div className="mt-3 ml-7">{children}</div>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80 mb-1">
      {children}
    </h3>
  );
}

function DataSafetySection() {
  const { settings, update } = useSettings();

  // Lightweight undo counter persisted across sessions.
  const [undoCount, setUndoCount] = useState<number>(() => {
    try { return parseInt(localStorage.getItem("pos.undo-delete.count.v1") || "0", 10) || 0; }
    catch { return 0; }
  });
  useEffect(() => {
    const refresh = () => {
      try { setUndoCount(parseInt(localStorage.getItem("pos.undo-delete.count.v1") || "0", 10) || 0); }
      catch { /* noop */ }
    };
    window.addEventListener("storage", refresh);
    window.addEventListener("pos:undo-delete-count", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("pos:undo-delete-count", refresh);
    };
  }, []);

  const strictDisabled = !settings.confirmBeforeDelete;

  return (
    <>
      <SectionHeader title="Data & Safety" />

      <div className="flex flex-col gap-7">
        {/* ── Analytics ─────────────────────────────────────────────────── */}
        <section>
          <SectionTitle>Analytics</SectionTitle>
          <div className="divide-y divide-white/[0.05]">
            <OptionRow
              icon={<FlaskConical size={18} strokeWidth={1.75} />}
              label="Demo data"
              control={
                <MiniSwitch checked={settings.demoData} onChange={v => update("demoData", v)} label="Demo data" />
              }
            />

            <OptionRow
              icon={<Clock size={18} strokeWidth={1.75} />}
              label="Data retention"
              control={
                <div className="flex items-center gap-2">
                  <select
                    value={settings.retention}
                    onChange={e => update("retention", e.target.value as RetentionMode)}
                    data-testid="select-retention"
                    className="bg-input/50 border border-border/50 rounded-lg px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-ring/60 focus:ring-1 focus:ring-ring/20 transition-all duration-200 min-w-[120px]"
                  >
                    {RETENTION_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  {settings.retention === "custom" && (
                    <div className="inline-flex items-center gap-1.5 text-xs">
                      <input
                        type="number"
                        min={1}
                        max={3650}
                        value={settings.retentionDays}
                        onChange={e => {
                          const n = parseInt(e.target.value, 10);
                          update("retentionDays", isNaN(n) ? 1 : Math.max(1, Math.min(3650, n)));
                        }}
                        data-testid="input-retention-days"
                        className="w-16 px-2 py-1.5 rounded-lg bg-input/50 border border-border/50 text-foreground text-xs focus:outline-none focus:border-ring/60"
                      />
                      <span className="text-muted-foreground">days</span>
                    </div>
                  )}
                </div>
              }
            />

            <OptionRow
              icon={<RotateCcw size={18} strokeWidth={1.75} />}
              label="Reset analytics"
              destructive
              control={
                <button
                  onClick={() => {
                    try { localStorage.removeItem("pos.analytics.events.v3"); } catch {}
                    toast.success("Analytics data cleared");
                  }}
                  data-testid="button-reset-analytics"
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-destructive border border-destructive/30 hover:bg-destructive/10 active:scale-[0.97] transition-all duration-200"
                >
                  Reset
                </button>
              }
            />
          </div>
        </section>

        {/* ── Deletion Protection ───────────────────────────────────────── */}
        <section>
          <SectionTitle>Deletion Protection</SectionTitle>
          <div className="divide-y divide-white/[0.05]">
            <OptionRow
              icon={<Undo2 size={18} strokeWidth={1.75} />}
              label={
                <span className="inline-flex items-baseline gap-2">
                  Undo delete
                  <span
                    className="text-[11px] font-normal tabular-nums text-muted-foreground"
                    data-testid="text-undo-count"
                  >
                    · {undoCount}
                  </span>
                </span>
              }
              control={
                <MiniSwitch checked={settings.enableUndoDelete} onChange={v => update("enableUndoDelete", v)} label="Undo delete" />
              }
            />
            <OptionRow
              icon={<ShieldAlert size={18} strokeWidth={1.75} />}
              label="Confirm before delete"
              control={
                <MiniSwitch checked={settings.confirmBeforeDelete} onChange={v => update("confirmBeforeDelete", v)} label="Confirm before delete" />
              }
            />
            <OptionRow
              icon={<Layers size={18} strokeWidth={1.75} />}
              label="Bulk delete protection"
              control={
                <MiniSwitch checked={settings.bulkDeleteProtection} onChange={v => update("bulkDeleteProtection", v)} label="Bulk delete protection" />
              }
            />
            <OptionRow
              icon={<Lock size={18} strokeWidth={1.75} />}
              label="Strict confirmation"
              disabled={strictDisabled}
              control={
                <MiniSwitch
                  checked={settings.strictConfirm}
                  onChange={v => update("strictConfirm", v)}
                  disabled={strictDisabled}
                  label="Strict confirmation"
                />
              }
            />
          </div>
        </section>
      </div>
    </>
  );
}
