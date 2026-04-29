import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Check, X, ChevronDown, FolderPlus, Loader2, Trash2, Upload } from "lucide-react";
import { useStore, normalizeCode, type Product } from "@/lib/store";
import { useSettings, getCurrencySymbol, formatAmountForCurrency } from "@/lib/settings";
import { useShortcut } from "@/lib/shortcuts";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

// ─────────────────────────────────────────────────────────────────────────────
// Floating-label, border-trace input
// ─────────────────────────────────────────────────────────────────────────────
type TraceFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  type?: string;
  placeholder?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  invalid?: boolean;
  hint?: React.ReactNode;
  required?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  step?: string;
  min?: string;
  max?: string;
  maxLength?: number;
  autoFocus?: boolean;
  inputClassName?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  testId?: string;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  rightOverlay?: React.ReactNode;
};

const TraceField = React.forwardRef<HTMLInputElement, TraceFieldProps>(function TraceField(
  {
    id, label, value, onChange, onFocus, onBlur,
    type = "text", placeholder, prefix, suffix,
    invalid = false, hint, required = false,
    inputMode, step, min, max, maxLength, autoFocus,
    inputClassName = "",
    inputRef, testId, onKeyDown, rightOverlay,
  },
  _outerRef
) {
  const [focused, setFocused] = useState(false);
  const localRef = useRef<HTMLInputElement>(null);
  const ref = (inputRef as React.RefObject<HTMLInputElement>) ?? localRef;

  const lifted = focused || value.length > 0;

  return (
    <div className="trace-wrap">
      <div
        className={`trace-field ${focused ? 'is-focused' : ''} ${invalid ? 'is-invalid' : ''} ${prefix ? 'has-prefix' : ''}`}
        onClick={() => ref.current?.focus()}
      >
        {/* Animated SVG border */}
        <svg className="trace-svg" aria-hidden="true">
          <rect x="0.75" y="0.75" rx="10" ry="10"
            width="calc(100% - 1.5px)" height="calc(100% - 1.5px)"
            pathLength={100}
            className="trace-rect-bg" />
          <rect x="0.75" y="0.75" rx="10" ry="10"
            width="calc(100% - 1.5px)" height="calc(100% - 1.5px)"
            pathLength={100}
            className="trace-rect-fg" />
        </svg>

        <label
          htmlFor={id}
          className={`trace-label ${lifted ? 'is-lifted' : ''} ${invalid ? 'is-invalid' : ''}`}
        >
          {label}
        </label>

        <div className="trace-row">
          {prefix && <span className="trace-prefix">{prefix}</span>}
          <input
            id={id}
            ref={ref}
            type={type}
            value={value}
            onChange={e => onChange(e.target.value)}
            onFocus={() => { setFocused(true); onFocus?.(); }}
            onBlur={() => { setFocused(false); onBlur?.(); }}
            onKeyDown={onKeyDown}
            placeholder={lifted ? placeholder : ''}
            inputMode={inputMode}
            step={step}
            min={min}
            max={max}
            maxLength={maxLength}
            autoFocus={autoFocus}
            data-testid={testId}
            className={`trace-input ${inputClassName}`}
          />
          {suffix && <span className="trace-suffix">{suffix}</span>}
        </div>
        {rightOverlay}
      </div>
      {hint && <div className={`trace-hint ${invalid ? 'is-invalid' : ''}`}>{hint}</div>}
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// AddProduct page
// ─────────────────────────────────────────────────────────────────────────────
export default function AddProduct() {
  const [, setLocation] = useLocation();
  const { products, setProducts, categories, customCategories, addCustomCategory, removeCategory } = useStore();
  const { settings } = useSettings();

  // Form state (defaults pre-filled from Settings → Defaults)
  const [name, setName] = useState("");
  const [quickCodeRaw, setQuickCodeRaw] = useState("");
  const [price, setPrice] = useState("");
  const [profit, setProfit] = useState(settings.defaultProfit);
  const [stock, setStock] = useState(settings.defaultStock);
  const [category, setCategory] = useState<string>(settings.defaultCategory);
  const [image, setImage] = useState<string | null>(null);

  // UI state
  const [dragOver, setDragOver] = useState(false);
  const [profitFocused, setProfitFocused] = useState(false);
  const [isCatDropdownOpen, setIsCatDropdownOpen] = useState(false);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [submittingMode, setSubmittingMode] = useState<null | 'redirect' | 'another'>(null);
  const [imageFading, setImageFading] = useState(false);

  // Per-field shake + transient error messages
  type FieldKey = 'name' | 'quickCode' | 'price' | 'profit' | 'stock' | 'category';
  const fieldOrder: FieldKey[] = ['name', 'quickCode', 'price', 'profit', 'stock', 'category'];
  const [shake, setShake] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [transientError, setTransientError] = useState<Partial<Record<FieldKey, string>>>({});

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const quickCodeInputRef = useRef<HTMLInputElement>(null);
  const priceInputRef = useRef<HTMLInputElement>(null);
  const profitInputRef = useRef<HTMLInputElement>(null);
  const stockInputRef = useRef<HTMLInputElement>(null);
  const categoryButtonRef = useRef<HTMLButtonElement>(null);
  // Timestamp of the last category selection from the dropdown. Used to swallow
  // the *same* Enter keystroke that picked an option so it cannot also trigger
  // form submission on the trigger button — selecting a category and creating
  // the product must always be two distinct, intentional Enter presses.
  const categorySelectGuardRef = useRef<number>(0);

  const fieldRefs: Record<FieldKey, React.RefObject<HTMLElement>> = {
    name: nameInputRef as React.RefObject<HTMLElement>,
    quickCode: quickCodeInputRef as React.RefObject<HTMLElement>,
    price: priceInputRef as React.RefObject<HTMLElement>,
    profit: profitInputRef as React.RefObject<HTMLElement>,
    stock: stockInputRef as React.RefObject<HTMLElement>,
    category: categoryButtonRef as React.RefObject<HTMLElement>,
  };

  // Derived
  const priceNum = parseFloat(price);
  const profitNum = parseFloat(profit);
  const stockNum = parseInt(stock, 10);

  // Active currency symbol (USD → "$", PKR → "Rs", OMR → "R.O") — recomputed
  // on every render so a Settings change updates Price/Profit prefixes
  // instantly without a refresh.
  const currencySymbol = getCurrencySymbol(settings.currency);

  /** On blur of a money input, snap OMR values to exactly 3 decimals. */
  const normalizeMoney = (raw: string) => formatAmountForCurrency(raw, settings.currency);

  const fullQuickCode = `#${quickCodeRaw}`;
  const codeIsDuplicate = useMemo(() => {
    if (!quickCodeRaw) return false;
    const norm = normalizeCode(fullQuickCode);
    return products.some(p => p.quickCode && normalizeCode(p.quickCode) === norm);
  }, [products, quickCodeRaw, fullQuickCode]);

  const profitTooHigh = !isNaN(priceNum) && !isNaN(profitNum) && profitNum > priceNum;

  const margin = useMemo(() => {
    if (isNaN(priceNum) || priceNum <= 0 || isNaN(profitNum) || profitNum < 0) return null;
    return Math.max(0, Math.min(100, (profitNum / priceNum) * 100));
  }, [priceNum, profitNum]);

  const isFormValid =
    name.trim().length > 0 &&
    !isNaN(priceNum) && priceNum >= 0 &&
    !isNaN(profitNum) && profitNum >= 0 &&
    !profitTooHigh &&
    !isNaN(stockNum) && stockNum >= 0 &&
    category && category !== "All" &&
    quickCodeRaw.length > 0 &&
    !codeIsDuplicate;

  // If selected category gets deleted elsewhere, clear it (user must re-pick)
  useEffect(() => {
    if (category && !categories.includes(category)) {
      setCategory("");
    }
  }, [categories, category]);

  // Profit shake when too high
  useEffect(() => {
    if (!profitTooHigh) return;
    triggerShake('profit');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profitTooHigh, profit]);

  // Focus name on mount
  useEffect(() => { nameInputRef.current?.focus(); }, []);

  // ── Intelligent flow helpers ───────────────────────────────────────────
  function triggerShake(f: FieldKey) {
    setShake(s => ({ ...s, [f]: false }));
    requestAnimationFrame(() => {
      setShake(s => ({ ...s, [f]: true }));
      setTimeout(() => setShake(s => ({ ...s, [f]: false })), 480);
    });
  }
  function setError(f: FieldKey, msg: string) {
    setTransientError(e => ({ ...e, [f]: msg }));
  }
  function clearError(f: FieldKey) {
    setTransientError(e => {
      if (!e[f]) return e;
      const { [f]: _omit, ...rest } = e;
      return rest;
    });
  }

  function isFieldFilled(f: FieldKey): boolean {
    switch (f) {
      case 'name': return name.trim().length > 0;
      case 'quickCode': return quickCodeRaw.length > 0;
      case 'price': return price.trim().length > 0 && !isNaN(parseFloat(price));
      case 'profit': return profit.trim().length > 0 && !isNaN(parseFloat(profit));
      case 'stock': return stock.trim().length > 0 && !isNaN(parseInt(stock, 10));
      case 'category': return !!category && category !== 'All';
    }
  }
  function fieldValidationMsg(f: FieldKey): string | null {
    if (!isFieldFilled(f)) return 'This field is required';
    if (f === 'quickCode' && codeIsDuplicate) return 'Quick code already in use';
    if (f === 'profit' && profitTooHigh) return 'Profit cannot exceed price';
    return null;
  }
  function focusField(f: FieldKey) {
    const el = fieldRefs[f].current;
    if (!el) return;
    el.focus();
    if (el instanceof HTMLInputElement) {
      try { el.select(); } catch { /* number inputs throw */ }
    }
  }
  function firstInvalidField(): FieldKey | null {
    for (const f of fieldOrder) {
      if (fieldValidationMsg(f)) return f;
    }
    return null;
  }
  const trySubmitOrFocusFirstError = useCallback(() => {
    const bad = firstInvalidField();
    if (bad) {
      setError(bad, fieldValidationMsg(bad)!);
      focusField(bad);
      triggerShake(bad);
      return;
    }
    submit('redirect');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, quickCodeRaw, price, profit, stock, category, codeIsDuplicate, profitTooHigh]);

  function handleFieldEnter(current: FieldKey, e: React.KeyboardEvent) {
    if (e.key !== 'Enter') return;

    // Shift FIRST — Shift+Enter ALWAYS means "Create & Add Another" (stay on page).
    // Must never fall through to the plain-Enter path.
    if (e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      const bad = firstInvalidField();
      if (bad) {
        setError(bad, fieldValidationMsg(bad)!);
        focusField(bad);
        triggerShake(bad);
        return;
      }
      void submit('another');
      return;
    }

    // Plain Enter — advance to next field, or submit-and-redirect on last field.
    e.preventDefault();
    e.stopPropagation();
    const msg = fieldValidationMsg(current);
    if (msg) {
      setError(current, msg);
      triggerShake(current);
      return;
    }
    const idx = fieldOrder.indexOf(current);
    if (idx === fieldOrder.length - 1) {
      trySubmitOrFocusFirstError();
    } else {
      focusField(fieldOrder[idx + 1]);
    }
  }

  // ── handlers ──────────────────────────────────────────────────────────
  const handleFile = (file: File | null | undefined) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImageFading(false);
    setImage(url);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  const resetForm = () => {
    setName("");
    setQuickCodeRaw("");
    setPrice("");
    setProfit(settings.defaultProfit);
    setStock(settings.defaultStock);
    setIsAddingCategory(false);
    setNewCategoryName("");
    setImageFading(true);
    setTimeout(() => { setImage(null); setImageFading(false); }, 240);
    setTimeout(() => nameInputRef.current?.focus(), 80);
  };

  const buildProduct = (): Product => ({
    id: Math.random().toString(36).slice(2, 11),
    quickCode: fullQuickCode,
    name: name.trim(),
    price: priceNum,
    profit: profitNum,
    stock: stockNum,
    category,
    image: image ?? undefined,
  });

  const submit = useCallback(async (mode: 'redirect' | 'another') => {
    if (!isFormValid || submittingMode) return;
    setSubmittingMode(mode);
    const product = buildProduct();
    await new Promise(r => setTimeout(r, 240));
    setProducts(prev => [...prev, product]);
    toast.success(`${product.name} created`, { icon: <Check className="text-green-500" /> });
    if (mode === 'redirect') {
      setTimeout(() => { setSubmittingMode(null); setLocation('/'); }, 200);
    } else {
      setSubmittingMode(null);
      resetForm();
    }
  }, [isFormValid, submittingMode, buildProduct, setProducts, setLocation]);

  const commitNewCategory = () => {
    const cat = newCategoryName.trim();
    if (!cat) { setIsAddingCategory(false); return; }
    if (cat.toLowerCase() === 'all') { toast.error('Reserved name'); return; }
    // "Sold Out" is a system status (auto-applied at stock 0), not a category.
    if (/^sold[\s_-]*out$/i.test(cat)) {
      toast.error('"Sold Out" is a system state, not a category');
      return;
    }
    if (categories.some(c => c.toLowerCase() === cat.toLowerCase())) {
      toast.error('Category already exists');
      return;
    }
    addCustomCategory(cat);
    setCategory(cat);
    setNewCategoryName('');
    setIsAddingCategory(false);
    setIsCatDropdownOpen(false);
    // Selecting a brand-new category from the dropdown immediately returns
    // focus to the trigger; arm the same guard the menu uses so the same
    // Enter keystroke can't fall through and submit the form.
    categorySelectGuardRef.current = Date.now();
  };

  const confirmDelete = (cat: string) => {
    removeCategory(cat);
    if (category === cat) {
      setCategory(categories.find(c => c !== "All" && c !== cat) ?? "");
    }
    setPendingDelete(null);
    toast.success(`Removed "${cat}"`);
  };

  // ── keyboard shortcuts ─────────────────────────────────────────────
  // Enter handling for individual form fields lives in field-level handlers.
  // The global shortcut engine handles configurable bindings; we register the
  // contextual ones here. The pending-delete modal keeps its own listener.
  useShortcut('createProduct', () => { void submit('redirect'); });
  useShortcut('createAndAnother', () => { void submit('another'); });

  useEffect(() => {
    if (!pendingDelete) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setPendingDelete(null);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        confirmDelete(pendingDelete);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [pendingDelete]);

  // ── render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen w-full bg-background text-foreground dark add-product-page">
      {/* Header (page-local, no global nav) */}
      <header className="h-14 sm:h-16 flex items-center justify-between px-3 sm:px-7 sticky top-0 z-20 bg-background/85 backdrop-blur-md border-b border-border/40">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            onClick={() => setLocation('/')}
            className="p-2 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Back"
            data-testid="btn-back"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <h1 className="text-[15px] sm:text-[17px] font-semibold leading-tight truncate">Add Product</h1>
            <p className="hidden sm:block text-[11px] text-muted-foreground leading-tight mt-0.5">New item for your inventory</p>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <kbd className="px-1.5 py-0.5 rounded bg-secondary border border-border/60 text-[10px] font-mono">Enter</kbd> Create
          <span className="opacity-50">·</span>
          <kbd className="px-1.5 py-0.5 rounded bg-secondary border border-border/60 text-[10px] font-mono">⇧+Enter</kbd> Create &amp; Add
        </div>
      </header>

      {/* Body */}
      <main className="max-w-5xl mx-auto px-3 sm:px-8 pt-6 sm:pt-9 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(160px,200px)_minmax(0,1fr)] gap-6 sm:gap-8">
          {/* ── LEFT: IMAGE ─────────────────────────────────────── */}
          {/* Entry animation: form sections soft-fade upward in sequence.
              Stagger via inline animationDelay keeps the cascade subtle. */}
          <section
            className="form-section-in md:sticky md:top-20 self-start max-w-[200px] mx-auto md:mx-0 w-full"
            style={{ animationDelay: "0ms" }}
          >
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragEnter={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`relative aspect-square w-full rounded-2xl overflow-hidden cursor-pointer select-none transition-all duration-300 group ${
                dragOver
                  ? 'ring-2 ring-primary/70 ring-offset-2 ring-offset-background scale-[1.012]'
                  : ''
              }`}
              data-testid="image-dropzone"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => handleFile(e.target.files?.[0])}
              />

              {/* Image or empty bg */}
              {image ? (
                <img
                  src={image}
                  alt="Product preview"
                  className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${imageFading ? 'opacity-0' : 'opacity-100'}`}
                />
              ) : (
                <div className={`absolute inset-0 transition-colors duration-300 ${dragOver ? 'bg-primary/8' : 'bg-secondary/35'}`}
                  style={{
                    backgroundImage: !dragOver
                      ? 'radial-gradient(circle at 50% 40%, rgba(255,255,255,0.025), transparent 65%)'
                      : undefined,
                  }}
                />
              )}

              {/* Centered upload icon (clear, minimal blur) */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div
                  className={`upload-icon flex items-center justify-center rounded-full transition-all duration-300 shadow-[0_4px_18px_rgba(0,0,0,0.28)] ${
                    image
                      ? 'w-12 h-12 bg-black/60 text-white scale-100 opacity-100 md:opacity-0 md:scale-90 md:group-hover:opacity-100 md:group-hover:scale-100 md:group-active:opacity-100'
                      : dragOver
                        ? 'w-16 h-16 bg-primary text-primary-foreground scale-110'
                        : 'w-14 h-14 bg-secondary text-foreground/85 group-hover:bg-primary/15 group-hover:text-primary'
                  }`}
                >
                  <Upload size={image ? 20 : 24} strokeWidth={2.1} />
                </div>
              </div>

              {/* Subtle dashed outline only when empty */}
              {!image && (
                <div className={`absolute inset-0 rounded-2xl border-2 border-dashed pointer-events-none transition-colors duration-300 ${
                  dragOver ? 'border-primary/70' : 'border-border/55 group-hover:border-primary/40'
                }`} />
              )}

              {/* Helper text — empty state only */}
              {!image && (
                <div className="absolute left-0 right-0 bottom-3 text-center text-[11px] text-muted-foreground/85 pointer-events-none">
                  {dragOver ? 'Drop to upload' : 'Click or drop an image'}
                </div>
              )}
            </div>
          </section>

          {/* ── RIGHT: STRUCTURED INPUT FLOW ─────────────────────── */}
          <section
            className="form-section-in flex flex-col gap-5"
            style={{ animationDelay: "90ms" }}
          >
            {/* Row 1: Product Name | Quick Code */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TraceField
                id="ap-name"
                label="Product Name"
                value={name}
                onChange={v => { setName(v); if (transientError.name) clearError('name'); }}
                placeholder="e.g. Avocado Wrap"
                required
                inputRef={nameInputRef}
                testId="input-name"
                inputClassName={`text-[15px] font-medium ${shake.name ? 'shake-anim-input' : ''}`}
                onKeyDown={(e) => handleFieldEnter('name', e)}
                invalid={!!transientError.name}
                hint={transientError.name
                  ? <span className="flex items-center gap-1"><X size={11} /> {transientError.name}</span>
                  : null}
              />
              <TraceField
                id="ap-quickcode"
                label="Quick Code"
                value={quickCodeRaw}
                onChange={v => {
                  setQuickCodeRaw(v.toLowerCase().replace(/[^a-z0-9\-]/g, ''));
                  if (transientError.quickCode) clearError('quickCode');
                }}
                placeholder="wi-e"
                required
                maxLength={8}
                prefix={<span className="text-muted-foreground font-mono select-none">#</span>}
                invalid={codeIsDuplicate || !!transientError.quickCode}
                hint={
                  transientError.quickCode
                    ? <span className="flex items-center gap-1"><X size={11} /> {transientError.quickCode}</span>
                    : codeIsDuplicate
                      ? <span className="flex items-center gap-1"><X size={11} /> This quick code is already in use</span>
                      : null
                }
                inputRef={quickCodeInputRef}
                testId="input-quickcode"
                inputClassName={`font-mono ${shake.quickCode ? 'shake-anim-input' : ''}`}
                onKeyDown={(e) => handleFieldEnter('quickCode', e)}
              />
            </div>

            {/* Row 2: Price | Profit (with margin overlay anchored to Profit) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TraceField
                id="ap-price"
                label="Price"
                value={price}
                onChange={v => { setPrice(v); if (transientError.price) clearError('price'); }}
                onBlur={() => setPrice(p => normalizeMoney(p))}
                type="number"
                step={settings.currency === 'OMR' ? '0.001' : '0.01'}
                min="0"
                inputMode="decimal"
                placeholder={settings.currency === 'OMR' ? '0.000' : '0.00'}
                required
                inputRef={priceInputRef}
                prefix={
                  // Default = neutral; only an active validation error promotes
                  // the symbol to the destructive tone, matching the rule used
                  // throughout the app (no yellow on input icons).
                  <span
                    className={`font-semibold transition-colors duration-200 ${
                      transientError.price ? 'text-destructive' : 'text-muted-foreground'
                    }`}
                  >
                    {currencySymbol}
                  </span>
                }
                testId="input-price"
                inputClassName={`no-spinners-ap tabular-nums ${shake.price ? 'shake-anim-input' : ''}`}
                onKeyDown={(e) => handleFieldEnter('price', e)}
                invalid={!!transientError.price}
                hint={transientError.price
                  ? <span className="flex items-center gap-1"><X size={11} /> {transientError.price}</span>
                  : null}
              />
              <div className="relative">
                {/* Margin overlay — absolute, floats above Profit when focused */}
                <div
                  className={`pointer-events-none absolute left-0 right-0 z-10 transition-all duration-300 ease-out ${
                    profitFocused
                      ? 'opacity-100 translate-y-0'
                      : 'opacity-0 translate-y-2'
                  }`}
                  style={{ bottom: 'calc(100% + 8px)' }}
                  aria-hidden={!profitFocused}
                >
                  <div
                    className="relative overflow-hidden rounded-xl border border-border/50 px-3.5 py-2.5 shadow-[0_10px_30px_rgba(0,0,0,0.4)]"
                    style={{
                      background:
                        'linear-gradient(135deg, hsl(var(--popover)/0.92) 0%, hsl(var(--secondary)/0.6) 100%)',
                      backdropFilter: 'blur(10px)',
                      WebkitBackdropFilter: 'blur(10px)',
                    }}
                  >
                    {/* Soft primary glow */}
                    <div
                      className="pointer-events-none absolute -inset-px rounded-xl opacity-60"
                      style={{
                        background:
                          'radial-gradient(120% 80% at 100% 0%, hsl(var(--primary)/0.12), transparent 60%)',
                      }}
                    />
                    <div className="relative flex items-center gap-3">
                      <div className="flex flex-col leading-tight">
                        <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/85">
                          Margin
                        </span>
                        <span className="text-[18px] font-bold font-mono tabular-nums text-foreground leading-none mt-0.5">
                          {(margin ?? 0).toFixed(margin && margin >= 10 ? 0 : 1)}
                          <span className="text-[12px] text-muted-foreground/80 font-semibold ml-0.5">%</span>
                        </span>
                      </div>
                      <div className="flex-1 h-2 bg-secondary/60 rounded-full overflow-hidden shadow-inner">
                        <div
                          className="h-full rounded-full transition-[width] duration-700 ease-out"
                          style={{
                            width: `${profitFocused ? (margin ?? 0) : 0}%`,
                            background:
                              'linear-gradient(90deg, hsl(var(--primary)/0.55) 0%, hsl(var(--primary)) 100%)',
                            boxShadow: '0 0 12px hsl(var(--primary)/0.45)',
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <TraceField
                  id="ap-profit"
                  label="Profit"
                  value={profit}
                  onChange={v => { setProfit(v); if (transientError.profit) clearError('profit'); }}
                  type="number"
                  step={settings.currency === 'OMR' ? '0.001' : '0.01'}
                  min="0"
                  inputMode="decimal"
                  placeholder={settings.currency === 'OMR' ? '0.000' : '0.00'}
                  required
                  inputRef={profitInputRef}
                  invalid={profitTooHigh || !!transientError.profit}
                  onFocus={() => setProfitFocused(true)}
                  onBlur={() => { setProfitFocused(false); setProfit(p => normalizeMoney(p)); }}
                  prefix={
                    // Same rule as Price: default neutral, destructive only when
                    // the input is in an error state (overshoot or hard error).
                    <span
                      className={`font-semibold transition-colors duration-200 ${
                        (profitTooHigh || transientError.profit) ? 'text-destructive' : 'text-muted-foreground'
                      }`}
                    >
                      {currencySymbol}
                    </span>
                  }
                  hint={
                    transientError.profit
                      ? <span className="flex items-center gap-1"><X size={11} /> {transientError.profit}</span>
                      : profitTooHigh
                        ? <span className="flex items-center gap-1"><X size={11} /> Profit cannot exceed price</span>
                        : null
                  }
                  testId="input-profit"
                  inputClassName={`no-spinners-ap tabular-nums ${shake.profit ? 'shake-anim-input' : ''}`}
                  onKeyDown={(e) => handleFieldEnter('profit', e)}
                />
              </div>
            </div>

            {/* Row 3: Stock | Category */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TraceField
                id="ap-stock"
                label="Stock"
                value={stock}
                onChange={v => { setStock(v); if (transientError.stock) clearError('stock'); }}
                type="number"
                min="0"
                inputMode="numeric"
                placeholder="100"
                required
                inputRef={stockInputRef}
                testId="input-stock"
                inputClassName={`no-spinners-ap tabular-nums ${shake.stock ? 'shake-anim-input' : ''}`}
                onKeyDown={(e) => handleFieldEnter('stock', e)}
                invalid={!!transientError.stock}
                hint={transientError.stock
                  ? <span className="flex items-center gap-1"><X size={11} /> {transientError.stock}</span>
                  : null}
              />

              <div className="trace-wrap">
                <DropdownMenu
                  open={isCatDropdownOpen}
                  onOpenChange={open => {
                    setIsCatDropdownOpen(open);
                    if (!open) { setIsAddingCategory(false); setPendingDelete(null); }
                  }}
                >
                  <DropdownMenuTrigger asChild>
                    <button
                      ref={categoryButtonRef}
                      type="button"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          // The Enter that selected an option from the dropdown
                          // bubbles up to this button. Swallow it so the same
                          // keystroke can't also submit the form — selection
                          // and creation must be two intentional presses.
                          if (Date.now() - categorySelectGuardRef.current < 350) {
                            e.preventDefault();
                            return;
                          }
                          if (!isFieldFilled('category')) {
                            e.preventDefault();
                            setError('category', 'Please select a category');
                            triggerShake('category');
                            return;
                          }
                          e.preventDefault();
                          trySubmitOrFocusFirstError();
                        }
                      }}
                      className={`trace-field trace-field-button w-full ${transientError.category ? 'is-invalid' : ''} ${shake.category ? 'shake-anim-input' : ''} ${isCatDropdownOpen ? 'is-focused' : ''}`}
                      data-testid="btn-category"
                    >
                      {/* Animated SVG border (matches TraceField) */}
                      <svg className="trace-svg" aria-hidden="true">
                        <rect x="0.75" y="0.75" rx="10" ry="10"
                          width="calc(100% - 1.5px)" height="calc(100% - 1.5px)"
                          pathLength={100}
                          className="trace-rect-bg" />
                        <rect x="0.75" y="0.75" rx="10" ry="10"
                          width="calc(100% - 1.5px)" height="calc(100% - 1.5px)"
                          pathLength={100}
                          className="trace-rect-fg" />
                      </svg>
                      {/* Always-lifted label */}
                      <label className={`trace-label is-lifted ${transientError.category ? 'is-invalid' : ''}`}>
                        Category
                      </label>
                      <div className="trace-row">
                        <span className={category ? 'flex-1 text-foreground text-[14px]' : 'flex-1 text-muted-foreground/55 text-[14px] italic'}>
                          {category || 'Select Category'}
                        </span>
                        <ChevronDown size={15} className={`text-muted-foreground transition-transform duration-200 ${isCatDropdownOpen ? 'rotate-180' : ''}`} />
                      </div>
                    </button>
                  </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] sm:w-60 max-h-72 overflow-y-auto">
                  {categories.filter(c => c !== 'All').map(c => {
                    const isCustom = customCategories.has(c);
                    const isPending = pendingDelete === c;
                    return (
                      <div key={c} className="relative">
                        <DropdownMenuItem
                          onSelect={(e) => {
                            if (isPending) { e.preventDefault(); return; }
                            setCategory(c);
                            setIsCatDropdownOpen(false);
                            // Guard against the same Enter keystroke also
                            // triggering a form submission once focus returns
                            // to the trigger button.
                            categorySelectGuardRef.current = Date.now();
                          }}
                          className="flex items-center justify-between gap-2 group/cat pr-2"
                        >
                          <span className="truncate">{c}</span>
                          <div className="flex items-center gap-1.5">
                            {c === category && !isPending && <Check size={14} className="text-primary" />}
                            {isCustom && !isPending && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setPendingDelete(c); }}
                                className="p-1 rounded-md text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover/cat:opacity-100 focus:opacity-100 transition-all duration-150"
                                aria-label={`Delete ${c}`}
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </DropdownMenuItem>

                        {/* Soft delete confirmation overlay */}
                        {isPending && (
                          <div
                            className="absolute inset-0 flex items-center gap-1.5 px-2 bg-destructive/10 border border-destructive/40 rounded-sm animate-in fade-in zoom-in-95 duration-150"
                            onClick={e => e.stopPropagation()}
                          >
                            <span className="flex-1 text-[12px] text-destructive truncate">Delete "{c}"?</span>
                            <button
                              type="button"
                              onClick={() => setPendingDelete(null)}
                              className="px-1.5 py-0.5 text-[11px] rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => confirmDelete(c)}
                              className="px-1.5 py-0.5 text-[11px] rounded bg-destructive text-destructive-foreground hover:brightness-110 transition"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <DropdownMenuSeparator />
                  {isAddingCategory ? (
                    <div className="px-1.5 py-1" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <input
                          autoFocus
                          value={newCategoryName}
                          onChange={e => setNewCategoryName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); commitNewCategory(); }
                            if (e.key === 'Escape') { e.preventDefault(); setIsAddingCategory(false); setNewCategoryName(''); }
                          }}
                          placeholder="Category name"
                          className="flex-1 bg-secondary border border-border/60 rounded-md px-2 py-1.5 text-xs outline-none focus:border-primary/60"
                        />
                        <button
                          type="button"
                          onClick={commitNewCategory}
                          className="p-1.5 rounded-md bg-primary text-primary-foreground hover:brightness-110 transition"
                          aria-label="Create"
                        >
                          <Check size={13} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <DropdownMenuItem
                      onSelect={(e) => { e.preventDefault(); setIsAddingCategory(true); setPendingDelete(null); }}
                      className="text-primary focus:text-primary focus:bg-primary/10"
                    >
                      <FolderPlus size={13} className="mr-2" /> Add Category
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              </div>
            </div>
          </section>
        </div>

        {/* ── BOTTOM ACTIONS (clean, inline) ───────────────────── */}
        <div className="mt-10 sm:mt-12 flex items-center gap-3 justify-end">
          <button
            type="button"
            onClick={() => setLocation('/')}
            className="hidden sm:inline-flex px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition active:scale-[0.97]"
            data-testid="btn-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!isFormValid || submittingMode !== null}
            onClick={() => submit('another')}
            className="px-4 py-2.5 rounded-lg text-sm font-medium border border-border/60 bg-secondary/40 hover:bg-secondary text-foreground transition active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            data-testid="btn-create-another"
          >
            {submittingMode === 'another' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {submittingMode === 'another' ? 'Adding…' : 'Create & Add Another'}
          </button>
          <button
            type="button"
            disabled={!isFormValid || submittingMode !== null}
            onClick={() => submit('redirect')}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:brightness-110 transition active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5 shadow-[0_4px_14px_rgba(99,102,241,0.35)]"
            data-testid="btn-create"
          >
            {submittingMode === 'redirect' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {submittingMode === 'redirect' ? 'Creating…' : 'Create'}
          </button>
        </div>
      </main>

      <style>{`
        .add-product-page .no-spinners-ap::-webkit-outer-spin-button,
        .add-product-page .no-spinners-ap::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .add-product-page .no-spinners-ap { -moz-appearance: textfield; }

        /* ── Autofill / suggestion styling: keep it dark, no harsh yellow ── */
        .add-product-page input:-webkit-autofill,
        .add-product-page input:-webkit-autofill:hover,
        .add-product-page input:-webkit-autofill:focus,
        .add-product-page input:-webkit-autofill:active {
          -webkit-text-fill-color: hsl(var(--foreground)) !important;
          -webkit-box-shadow: 0 0 0 1000px hsl(var(--secondary) / 0.55) inset !important;
          box-shadow: 0 0 0 1000px hsl(var(--secondary) / 0.55) inset !important;
          caret-color: hsl(var(--foreground));
          transition: background-color 9999s ease-in-out 0s;
        }

        /* ── Border-trace input ───────────────────────────────── */
        .trace-wrap { position: relative; }
        .trace-field {
          position: relative;
          height: 56px;
          padding: 0 14px;
          border-radius: 10px;
          background: hsl(var(--secondary) / 0.32);
          cursor: text;
          transition: background 220ms ease;
        }
        .trace-field:hover { background: hsl(var(--secondary) / 0.42); }
        .trace-field.is-focused { background: hsl(var(--secondary) / 0.5); }

        .trace-svg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          overflow: visible;
        }
        .trace-rect-bg, .trace-rect-fg {
          fill: none;
          stroke-width: 1.25;
        }
        .trace-rect-bg {
          stroke: hsl(var(--border) / 0.7);
        }
        .trace-rect-fg {
          stroke: hsl(var(--primary));
          stroke-dasharray: 100;
          stroke-dashoffset: 100;
          transition: stroke-dashoffset 520ms cubic-bezier(0.65, 0, 0.35, 1), stroke 220ms ease, filter 220ms ease;
          filter: drop-shadow(0 0 0 transparent);
        }
        .trace-field.is-focused .trace-rect-fg {
          stroke-dashoffset: 0;
          filter: drop-shadow(0 0 4px hsl(var(--primary) / 0.35));
        }
        .trace-field.is-invalid .trace-rect-fg {
          stroke: hsl(var(--destructive));
          stroke-dashoffset: 0;
          filter: drop-shadow(0 0 4px hsl(var(--destructive) / 0.35));
        }
        .trace-field.is-invalid .trace-rect-bg {
          stroke: hsl(var(--destructive) / 0.45);
        }

        .trace-row {
          position: relative;
          display: flex;
          align-items: center;
          height: 100%;
          gap: 6px;
        }
        .trace-prefix, .trace-suffix {
          font-size: 14px;
          line-height: 1;
          display: inline-flex;
          align-items: center;
          height: 100%;
        }
        .trace-input {
          flex: 1;
          min-width: 0;
          height: 100%;
          background: transparent;
          border: 0;
          outline: 0;
          padding: 0;
          font-size: 14px;
          color: hsl(var(--foreground));
          font-variant-numeric: tabular-nums;
        }
        .trace-input::placeholder {
          color: hsl(var(--muted-foreground) / 0.4);
          opacity: 0;
          transition: opacity 220ms ease 120ms;
        }
        .trace-field.is-focused .trace-input::placeholder { opacity: 1; }

        .trace-label {
          position: absolute;
          left: 14px;
          top: 50%;
          transform-origin: 0 50%;
          transform: translateY(-50%) translateZ(0) scale(1);
          font-size: 14px;
          font-weight: 400;
          letter-spacing: 0;
          color: hsl(var(--muted-foreground) / 0.55);
          pointer-events: none;
          padding: 0 4px;
          margin-left: -4px;       /* visually align text with input padding when unlifted */
          background: transparent;
          will-change: transform, color, background;
          transition:
            transform 360ms cubic-bezier(0.22, 1, 0.36, 1),
            color 240ms ease,
            background-color 240ms ease,
            letter-spacing 360ms cubic-bezier(0.22, 1, 0.36, 1);
          z-index: 2;
          white-space: nowrap;
          line-height: 1;
        }
        .trace-label.is-lifted {
          /* Lift to the top border line and shrink to a chip */
          transform: translateY(calc(-50% - 28px)) translateZ(0) scale(0.78);
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: hsl(var(--muted-foreground) / 0.95);
          background-color: hsl(var(--background));
        }
        /* When a prefix exists, push label right while unlifted so it doesn't sit on top of the prefix */
        .trace-field.has-prefix .trace-label {
          left: 36px;
        }
        /* But on lift, snap back to the start of the border line */
        .trace-field.has-prefix .trace-label.is-lifted {
          left: 14px;
        }

        .trace-field.is-focused .trace-label.is-lifted {
          color: hsl(var(--primary));
        }
        .trace-field.is-invalid .trace-label.is-lifted {
          color: hsl(var(--destructive));
        }

        .trace-hint {
          font-size: 11px;
          color: hsl(var(--muted-foreground) / 0.85);
          margin-top: 6px;
          padding-left: 4px;
          line-height: 1.35;
        }
        .trace-hint.is-invalid { color: hsl(var(--destructive)); }

        /* Button variant of trace-field (Category) */
        .trace-field-button {
          cursor: pointer;
          text-align: left;
          width: 100%;
          border: 0;
          font: inherit;
          color: inherit;
          appearance: none;
          -webkit-appearance: none;
        }
        .trace-field-button:focus { outline: none; }
        .trace-field-button:focus-visible .trace-rect-fg {
          stroke-dashoffset: 0;
          filter: drop-shadow(0 0 4px hsl(var(--primary) / 0.35));
        }

        @keyframes shake-anim-input {
          0%, 100% { transform: translateX(0); }
          20%      { transform: translateX(-3px); }
          40%      { transform: translateX(3px); }
          60%      { transform: translateX(-2px); }
          80%      { transform: translateX(2px); }
        }
        .shake-anim-input { animation: shake-anim-input 380ms cubic-bezier(0.36, 0.07, 0.19, 0.97); }
      `}</style>
    </div>
  );
}
