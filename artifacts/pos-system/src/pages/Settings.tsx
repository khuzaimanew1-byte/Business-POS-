import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  Home, BarChart2, Plus, Settings as SettingsIcon, ArrowLeft,
  Zap, DollarSign, Keyboard, Package, BarChart3, ShieldCheck, Sliders,
} from "lucide-react";
import { useSettings, type PerformanceMode, type CurrencyCode, type RoundingMode, type RetentionMode } from "@/lib/settings";
import { useStore } from "@/lib/store";
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

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Desktop sidebar (matches POS) */}
      <aside className="hidden sm:flex w-16 bg-card flex-col items-center justify-between py-6 shrink-0">
        <div className="flex flex-col items-center gap-3">
          <button onClick={() => setLocation('/')} className="p-2 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors duration-200" aria-label="Home"><Home size={20} /></button>
          <button onClick={() => setLocation('/analytics')} className="p-2 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors duration-200" aria-label="Analytics"><BarChart2 size={20} /></button>
          <button onClick={() => setLocation('/add-product')} className="p-2 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors duration-200" aria-label="Add Product"><Plus size={20} /></button>
          <button className="p-2 rounded-full bg-secondary text-foreground" aria-label="Settings"><SettingsIcon size={20} /></button>
        </div>
      </aside>

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
      <Block label="Currency">
        <Segmented
          value={settings.currency}
          onChange={v => update("currency", v)}
          options={[
            { value: "USD", label: "USD", sub: "$ • US Dollar" },
            { value: "PKR", label: "PKR", sub: "Rs • Pakistani Rupee" },
            { value: "OMR", label: "OMR", sub: "OMR • Omani Rial" },
          ]}
        />
      </Block>
      <Block>
        <Row label="Decimal precision" desc="Number of digits shown after the decimal point.">
          <Select
            value={String(settings.decimals) as "2" | "3"}
            onChange={v => update("decimals", Number(v) as 2 | 3)}
            options={[{ value: "2", label: "2 (e.g. 12.34)" }, { value: "3", label: "3 (e.g. 12.345)" }]}
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
  const shortcuts: { keys: React.ReactNode; label: string }[] = [
    { keys: <><Kbd>Shift</Kbd>+<Kbd>P</Kbd></>, label: "Add Product" },
    { keys: <Kbd>Enter</Kbd>,                   label: "Create / confirm" },
    { keys: <><Kbd>Shift</Kbd>+<Kbd>Enter</Kbd></>, label: "Create & continue" },
    { keys: <><Kbd>Shift</Kbd>+<Kbd>A</Kbd></>, label: "Open Analytics" },
    { keys: <><Kbd>Shift</Kbd>+<Kbd>E</Kbd></>, label: "Toggle edit mode" },
    { keys: <><Kbd>Shift</Kbd>+<Kbd>C</Kbd></>, label: "Toggle cart" },
    { keys: <><Kbd>Ctrl</Kbd>+<Kbd>`</Kbd></>, label: "Toggle search focus" },
    { keys: <><Kbd>Shift</Kbd>+<Kbd>⌫</Kbd></>, label: "Back / exit" },
  ];
  return (
    <>
      <SectionHeader title="Keyboard Shortcuts" desc="Speed up your most common actions." />
      <Block>
        <Toggle checked={settings.shortcutsEnabled} onChange={v => update("shortcutsEnabled", v)} label="Enable keyboard shortcuts" desc="Master switch for all global hotkeys." />
      </Block>
      <Block label="Available shortcuts">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
          {shortcuts.map((s, i) => (
            <div key={i} className={`flex items-center justify-between py-2.5 ${settings.shortcutsEnabled ? '' : 'opacity-40'}`}>
              <span className="text-sm text-foreground/85">{s.label}</span>
              <span className="flex items-center gap-1">{s.keys}</span>
            </div>
          ))}
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
      </Block>
    </>
  );
}
