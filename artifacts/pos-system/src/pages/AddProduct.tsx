import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Check, X, ChevronDown, FolderPlus, Loader2, Trash2 } from "lucide-react";
import { useStore, normalizeCode, type Product } from "@/lib/store";
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
};

const TraceField = React.forwardRef<HTMLInputElement, TraceFieldProps>(function TraceField(
  {
    id, label, value, onChange, onFocus, onBlur,
    type = "text", placeholder, prefix, suffix,
    invalid = false, hint, required = false,
    inputMode, step, min, max, maxLength, autoFocus,
    inputClassName = "",
    inputRef, testId,
  },
  _outerRef
) {
  const [focused, setFocused] = useState(false);
  const localRef = useRef<HTMLInputElement>(null);
  const ref = (inputRef as React.RefObject<HTMLInputElement>) ?? localRef;

  const lifted = focused || value.length > 0 || !!placeholder;

  return (
    <div className="trace-wrap">
      <div
        className={`trace-field ${focused ? 'is-focused' : ''} ${invalid ? 'is-invalid' : ''}`}
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
          {label}{required && <span className="text-destructive ml-0.5">*</span>}
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
            placeholder={focused ? placeholder : ''}
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

  // Form state
  const [name, setName] = useState("");
  const [quickCodeRaw, setQuickCodeRaw] = useState("");
  const [price, setPrice] = useState("");
  const [profit, setProfit] = useState("");
  const [stock, setStock] = useState("");
  const initialCat = useMemo(() => categories.find(c => c !== "All") ?? "", [categories]);
  const [category, setCategory] = useState<string>(initialCat);
  const [image, setImage] = useState<string | null>(null);

  // UI state
  const [dragOver, setDragOver] = useState(false);
  const [profitFocused, setProfitFocused] = useState(false);
  const [profitShake, setProfitShake] = useState(false);
  const [isCatDropdownOpen, setIsCatDropdownOpen] = useState(false);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [submittingMode, setSubmittingMode] = useState<null | 'redirect' | 'another'>(null);
  const [imageFading, setImageFading] = useState(false);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const quickCodeInputRef = useRef<HTMLInputElement>(null);

  // Derived
  const priceNum = parseFloat(price);
  const profitNum = parseFloat(profit);
  const stockNum = parseInt(stock, 10);

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

  // Sync default category if none yet
  useEffect(() => {
    if (!category && initialCat) setCategory(initialCat);
  }, [initialCat, category]);

  // If selected category gets deleted elsewhere, fall back
  useEffect(() => {
    if (category && !categories.includes(category)) {
      setCategory(categories.find(c => c !== "All") ?? "");
    }
  }, [categories, category]);

  // Profit shake when too high
  useEffect(() => {
    if (!profitTooHigh) return;
    setProfitShake(false);
    const id = requestAnimationFrame(() => setProfitShake(true));
    const t = setTimeout(() => setProfitShake(false), 480);
    return () => { cancelAnimationFrame(id); clearTimeout(t); };
  }, [profitTooHigh, profit]);

  // Focus name on mount
  useEffect(() => { nameInputRef.current?.focus(); }, []);

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
    setProfit("");
    setStock("");
    setIsAddingCategory(false);
    setNewCategoryName("");
    setImageFading(true);
    setTimeout(() => { setImage(null); setImageFading(false); }, 240);
    setTimeout(() => nameInputRef.current?.focus(), 80);
  };

  const buildProduct = (): Product => ({
    id: Math.random().toString(36).slice(2, 11),
    code: `#${1000 + products.length + 1}`,
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
    if (categories.some(c => c.toLowerCase() === cat.toLowerCase())) {
      toast.error('Category already exists');
      return;
    }
    addCustomCategory(cat);
    setCategory(cat);
    setNewCategoryName('');
    setIsAddingCategory(false);
    setIsCatDropdownOpen(false);
  };

  const confirmDelete = (cat: string) => {
    removeCategory(cat);
    if (category === cat) {
      setCategory(categories.find(c => c !== "All" && c !== cat) ?? "");
    }
    setPendingDelete(null);
    toast.success(`Removed "${cat}"`);
  };

  // ── keyboard shortcuts ───────────────────────────────────────────────
  useEffect(() => {
    const isTextarea = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (el.tagName === 'TEXTAREA' || el.isContentEditable);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault();
        nameInputRef.current?.focus();
        nameInputRef.current?.select();
        return;
      }
      if (e.key === 'Enter' && !isTextarea(e.target)) {
        if (isFormValid && !submittingMode) {
          e.preventDefault();
          submit(e.shiftKey ? 'another' : 'redirect');
        }
      }
      if (e.key === 'Escape' && pendingDelete) {
        e.preventDefault();
        setPendingDelete(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFormValid, submittingMode, submit, pendingDelete]);

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
      <main className="max-w-6xl mx-auto px-3 sm:px-8 pt-6 sm:pt-9 pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_260px] gap-5 sm:gap-7">
          {/* ── LEFT: IMAGE ─────────────────────────────────────── */}
          <section className="lg:sticky lg:top-20 self-start">
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

              {/* Always-visible centered + icon */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div
                  className={`flex items-center justify-center rounded-full transition-all duration-300 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.3)] ${
                    image
                      ? 'w-12 h-12 bg-black/45 text-white opacity-0 group-hover:opacity-100 group-active:opacity-100 group-hover:scale-100 scale-90'
                      : dragOver
                        ? 'w-16 h-16 bg-primary text-primary-foreground scale-110'
                        : 'w-14 h-14 bg-secondary/85 text-muted-foreground group-hover:bg-primary/15 group-hover:text-primary'
                  }`}
                >
                  <Plus size={image ? 22 : 26} strokeWidth={2.2} />
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

          {/* ── CENTER: PRIMARY INPUTS ──────────────────────────── */}
          <section className="flex flex-col gap-5">
            <TraceField
              id="ap-name"
              label="Product Name"
              value={name}
              onChange={setName}
              placeholder="e.g. Avocado Wrap"
              required
              inputRef={nameInputRef}
              testId="input-name"
              inputClassName="text-[15px] font-medium"
            />

            <div className="grid grid-cols-2 gap-4">
              <TraceField
                id="ap-price"
                label="Price"
                value={price}
                onChange={setPrice}
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                placeholder="0.00"
                required
                prefix={<span className="text-primary font-semibold">$</span>}
                testId="input-price"
                inputClassName="no-spinners-ap tabular-nums"
              />
              <TraceField
                id="ap-profit"
                label="Profit"
                value={profit}
                onChange={setProfit}
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                placeholder="0.00"
                required
                invalid={profitTooHigh}
                onFocus={() => setProfitFocused(true)}
                onBlur={() => setProfitFocused(false)}
                prefix={
                  <span className={`font-semibold ${profitTooHigh ? 'text-destructive' : 'text-muted-foreground'}`}>$</span>
                }
                hint={profitTooHigh
                  ? <span className="flex items-center gap-1"><X size={11} /> Profit cannot exceed price</span>
                  : null}
                testId="input-profit"
                inputClassName={`no-spinners-ap tabular-nums ${profitShake ? 'shake-anim-input' : ''}`}
              />
            </div>

            {/* Margin indicator — only when Profit focused */}
            <div
              className={`overflow-hidden transition-all duration-300 ease-out ${
                profitFocused ? 'opacity-100 max-h-24 mt-[-6px]' : 'opacity-0 max-h-0'
              }`}
              aria-hidden={!profitFocused}
            >
              <div className="rounded-xl border border-border/40 bg-secondary/25 px-4 py-2.5 flex items-center gap-3">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">Margin</span>
                <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary transition-[width] duration-500 ease-out"
                    style={{ width: `${margin ?? 0}%` }}
                  />
                </div>
                <span className="text-[12px] font-mono tabular-nums text-foreground shrink-0">
                  {margin === null ? '—' : `${margin.toFixed(1)}%`}
                </span>
              </div>
            </div>

            <TraceField
              id="ap-quickcode"
              label="Quick Code"
              value={quickCodeRaw}
              onChange={v => setQuickCodeRaw(v.toLowerCase().replace(/[^a-z0-9\-]/g, ''))}
              placeholder="wi-e"
              required
              maxLength={8}
              prefix={<span className="text-muted-foreground font-mono select-none">#</span>}
              invalid={codeIsDuplicate}
              hint={codeIsDuplicate
                ? <span className="flex items-center gap-1"><X size={11} /> This quick code is already in use</span>
                : <span className="text-muted-foreground/70">Lowercase letters, numbers and hyphen. Must be unique.</span>}
              inputRef={quickCodeInputRef}
              testId="input-quickcode"
              inputClassName="font-mono"
            />
          </section>

          {/* ── RIGHT: SECONDARY INPUTS ─────────────────────────── */}
          <section className="flex flex-col gap-5">
            <TraceField
              id="ap-stock"
              label="Stock"
              value={stock}
              onChange={setStock}
              type="number"
              min="0"
              inputMode="numeric"
              placeholder="100"
              required
              testId="input-stock"
              inputClassName="no-spinners-ap tabular-nums"
            />

            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85 mb-1.5 px-1">
                Category <span className="text-destructive">*</span>
              </div>
              <DropdownMenu
                open={isCatDropdownOpen}
                onOpenChange={open => {
                  setIsCatDropdownOpen(open);
                  if (!open) { setIsAddingCategory(false); setPendingDelete(null); }
                }}
              >
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="w-full bg-secondary/40 border border-border/50 rounded-lg px-3.5 py-2.5 text-sm flex items-center justify-between text-left hover:bg-secondary/55 transition-colors duration-200 focus:outline-none focus:border-primary/60 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.18)]"
                    data-testid="btn-category"
                  >
                    <span className={category ? '' : 'text-muted-foreground/60'}>
                      {category || 'Select category'}
                    </span>
                    <ChevronDown size={15} className={`text-muted-foreground transition-transform duration-200 ${isCatDropdownOpen ? 'rotate-180' : ''}`} />
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
          padding-top: 14px;  /* visually centered with input baseline (label takes top) */
        }
        .trace-input {
          flex: 1;
          min-width: 0;
          height: 100%;
          background: transparent;
          border: 0;
          outline: 0;
          padding: 18px 0 6px;
          font-size: 14px;
          color: hsl(var(--foreground));
          font-variant-numeric: tabular-nums;
        }
        .trace-input::placeholder { color: hsl(var(--muted-foreground) / 0.55); }

        .trace-label {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 13px;
          color: hsl(var(--muted-foreground));
          pointer-events: none;
          padding: 0 4px;
          background: transparent;
          transition:
            top 220ms cubic-bezier(0.65, 0, 0.35, 1),
            font-size 220ms cubic-bezier(0.65, 0, 0.35, 1),
            color 220ms ease,
            background 200ms ease;
          letter-spacing: 0.01em;
          z-index: 2;
          white-space: nowrap;
        }
        .trace-label.is-lifted {
          top: 0;
          transform: translateY(-50%);
          font-size: 10.5px;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: hsl(var(--muted-foreground) / 0.85);
          background: hsl(var(--background));
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
