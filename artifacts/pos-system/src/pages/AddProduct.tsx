import React, { useState, useEffect, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Check, ChevronDown, FolderPlus, Loader2, Trash2 } from "lucide-react";
import { useStore, normalizeCode, type Product } from "@/lib/store";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

// ── Reusable floating-label input with animated traced border ───────────────
type FieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  step?: string;
  min?: string;
  maxLength?: number;
  invalid?: boolean;
  helperRight?: React.ReactNode;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  testId?: string;
  pattern?: string;
  className?: string;
};

function FloatField({
  id, label, value, onChange, type = "text", required, prefix, suffix,
  inputMode, step, min, maxLength, invalid, helperRight, inputRef, testId, className,
}: FieldProps) {
  const [focused, setFocused] = useState(false);
  const floated = focused || value.length > 0;
  return (
    <div className={`relative group ${className ?? ''}`}>
      <div
        className={`fld-wrap ${focused ? 'is-focused' : ''} ${invalid ? 'is-invalid' : ''}`}
      >
        {prefix && <span className="fld-prefix">{prefix}</span>}
        <input
          ref={inputRef}
          id={id}
          type={type}
          inputMode={inputMode}
          step={step}
          min={min}
          maxLength={maxLength}
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="fld-input"
          data-testid={testId}
          autoComplete="off"
        />
        {suffix && <span className="fld-suffix">{suffix}</span>}
        <label
          htmlFor={id}
          className={`fld-label ${floated ? 'is-floated' : ''} ${prefix ? 'has-prefix' : ''}`}
        >
          {label}{required && <span className="text-destructive ml-0.5">*</span>}
        </label>
        {/* Animated traced border (4 sides) */}
        <span className="fld-border" aria-hidden>
          <span className="fld-side fld-top" />
          <span className="fld-side fld-right" />
          <span className="fld-side fld-bottom" />
          <span className="fld-side fld-left" />
        </span>
      </div>
      {helperRight && <div className="absolute -top-1 right-1 text-[10px] text-muted-foreground/70">{helperRight}</div>}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────

export default function AddProduct() {
  const [, setLocation] = useLocation();
  const { products, setProducts, categories, setCategories } = useStore();

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
  const [profitShake, setProfitShake] = useState(false);
  const [isCatDropdownOpen, setIsCatDropdownOpen] = useState(false);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [pendingDeleteCat, setPendingDeleteCat] = useState<string | null>(null);
  const [submittingMode, setSubmittingMode] = useState<null | 'redirect' | 'another'>(null);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

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
    !!category && category !== "All" &&
    quickCodeRaw.length > 0 &&
    !codeIsDuplicate;

  // Effects
  useEffect(() => { nameInputRef.current?.focus(); }, []);
  useEffect(() => { if (!category && initialCat) setCategory(initialCat); }, [initialCat, category]);
  useEffect(() => {
    if (!profitTooHigh) return;
    setProfitShake(false);
    const id = requestAnimationFrame(() => setProfitShake(true));
    const t = setTimeout(() => setProfitShake(false), 480);
    return () => { cancelAnimationFrame(id); clearTimeout(t); };
  }, [profitTooHigh, profit]);

  // Handlers
  const handleFile = (file: File | null | undefined) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImage(url);
  };

  const resetForm = () => {
    setName("");
    setQuickCodeRaw("");
    setPrice("");
    setProfit("");
    setStock("");
    setIsAddingCategory(false);
    setNewCategoryName("");
    setImage(null);
    setTimeout(() => nameInputRef.current?.focus(), 60);
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

  const submit = async (mode: 'redirect' | 'another') => {
    if (!isFormValid || submittingMode) return;
    setSubmittingMode(mode);
    const product = buildProduct();
    await new Promise(r => setTimeout(r, 280));
    setProducts(prev => [...prev, product]);
    toast.success(`${product.name} created`, { icon: <Check className="text-green-500" /> });
    if (mode === 'redirect') {
      setTimeout(() => { setSubmittingMode(null); setLocation('/'); }, 220);
    } else {
      setSubmittingMode(null);
      resetForm();
    }
  };

  const commitNewCategory = () => {
    const cat = newCategoryName.trim();
    if (!cat) { setIsAddingCategory(false); return; }
    if (cat.toLowerCase() === 'all') { toast.error('Reserved name'); return; }
    if (!categories.includes(cat)) setCategories(prev => [...prev, cat]);
    setCategory(cat);
    setNewCategoryName('');
    setIsAddingCategory(false);
    setIsCatDropdownOpen(false);
  };

  const requestDeleteCategory = (cat: string) => {
    if (pendingDeleteCat === cat) {
      // Confirm delete
      setCategories(prev => prev.filter(c => c !== cat));
      if (category === cat) {
        const next = categories.find(c => c !== cat && c !== 'All') ?? '';
        setCategory(next);
      }
      setPendingDeleteCat(null);
      toast.success(`Removed “${cat}”`);
    } else {
      setPendingDeleteCat(cat);
      setTimeout(() => setPendingDeleteCat(prev => (prev === cat ? null : prev)), 2400);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const isTyping = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'TEXTAREA' || el.isContentEditable;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submittingMode) {
        setLocation('/');
        return;
      }
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault();
        nameInputRef.current?.focus();
        nameInputRef.current?.select();
        return;
      }
      if (e.key === 'Enter' && !isTyping(e.target)) {
        if (isFormValid && !submittingMode) {
          e.preventDefault();
          submit(e.shiftKey ? 'another' : 'redirect');
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFormValid, submittingMode, submit, setLocation]);

  // ── render ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen w-full bg-background text-foreground dark">
      {/* Back arrow only — no global nav */}
      <button
        onClick={() => setLocation('/')}
        className="fixed top-4 left-4 sm:top-5 sm:left-5 z-30 flex items-center justify-center w-10 h-10 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/70 transition-colors"
        aria-label="Back"
        data-testid="btn-back"
      >
        <ArrowLeft size={18} />
      </button>

      <div className="max-w-[640px] mx-auto px-5 sm:px-8 pt-16 sm:pt-20 pb-16">
        {/* ── IMAGE — top center ─────────────────────────────────────── */}
        <section className="flex justify-center mb-9 sm:mb-11">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="relative w-[180px] h-[180px] sm:w-[200px] sm:h-[200px] rounded-2xl overflow-hidden cursor-pointer select-none bg-secondary/30 border border-border/50 hover:border-primary/40 transition-all duration-250 group"
            data-testid="image-dropzone"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => handleFile(e.target.files?.[0])}
            />
            {image && (
              <img src={image} alt="Product" className="w-full h-full object-cover" />
            )}
            {/* Always-visible plus button — also acts as replace */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div
                className={`flex items-center justify-center rounded-full transition-all duration-250 ${
                  image
                    ? 'w-11 h-11 bg-black/55 text-white opacity-0 group-hover:opacity-100 backdrop-blur-sm'
                    : 'w-14 h-14 bg-secondary/80 text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground group-hover:scale-105'
                }`}
              >
                <Plus size={image ? 20 : 26} strokeWidth={2.2} />
              </div>
            </div>
          </div>
        </section>

        {/* ── INPUT GRID ─────────────────────────────────────────────── */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-6">
          {/* Left col */}
          <FloatField
            id="ap-name"
            label="Product Name"
            required
            value={name}
            onChange={setName}
            inputRef={nameInputRef}
            maxLength={60}
            testId="input-name"
          />

          <FloatField
            id="ap-qc"
            label="Quick Code"
            required
            value={quickCodeRaw}
            onChange={(v) => {
              const cleaned = v.toLowerCase().replace(/[^a-z0-9\-]/g, '');
              setQuickCodeRaw(cleaned);
            }}
            prefix={<span className="font-mono text-muted-foreground">#</span>}
            maxLength={8}
            invalid={codeIsDuplicate}
            testId="input-quickcode"
          />

          <FloatField
            id="ap-price"
            label="Price"
            required
            value={price}
            onChange={setPrice}
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            prefix={<span className="font-bold text-primary">$</span>}
            testId="input-price"
            className="no-spinners"
          />

          {/* Profit with margin indicator above */}
          <div className="relative">
            {/* Margin indicator overlay above the field */}
            <div className="flex items-center gap-2 mb-1.5 px-1">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80">Margin</span>
              <div className="flex-1 h-1 bg-secondary/60 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary transition-[width] duration-400 ease-out"
                  style={{ width: `${margin ?? 0}%` }}
                />
              </div>
              <span className="text-[11px] font-mono tabular-nums text-foreground/85 min-w-[34px] text-right">
                {margin === null ? '—' : `${margin.toFixed(0)}%`}
              </span>
            </div>
            <div className={profitShake ? 'shake-anim' : ''}>
              <FloatField
                id="ap-profit"
                label="Profit"
                required
                value={profit}
                onChange={setProfit}
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                prefix={<span className={`font-bold ${profitTooHigh ? 'text-destructive' : 'text-muted-foreground'}`}>$</span>}
                invalid={profitTooHigh}
                testId="input-profit"
                className="no-spinners"
              />
            </div>
          </div>

          <FloatField
            id="ap-stock"
            label="Stock"
            required
            value={stock}
            onChange={setStock}
            type="number"
            inputMode="numeric"
            min="0"
            testId="input-stock"
            className="no-spinners"
          />

          {/* Category dropdown — visually matches other fields */}
          <div>
            <DropdownMenu open={isCatDropdownOpen} onOpenChange={open => { setIsCatDropdownOpen(open); if (!open) { setIsAddingCategory(false); setPendingDeleteCat(null); } }}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={`fld-wrap fld-as-button ${isCatDropdownOpen ? 'is-focused' : ''}`}
                  data-testid="btn-category"
                >
                  <span className={`fld-input flex items-center justify-between text-left ${category ? '' : 'text-transparent'}`}>
                    <span className="truncate">{category || ' '}</span>
                    <ChevronDown size={15} className={`text-muted-foreground transition-transform duration-200 shrink-0 ${isCatDropdownOpen ? 'rotate-180' : ''}`} />
                  </span>
                  <label className={`fld-label ${category ? 'is-floated' : ''}`}>
                    Category<span className="text-destructive ml-0.5">*</span>
                  </label>
                  <span className="fld-border" aria-hidden>
                    <span className="fld-side fld-top" />
                    <span className="fld-side fld-right" />
                    <span className="fld-side fld-bottom" />
                    <span className="fld-side fld-left" />
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
                {categories.filter(c => c !== 'All').map(c => (
                  <div
                    key={c}
                    className="flex items-center justify-between gap-1 px-1 py-0.5"
                  >
                    <DropdownMenuItem
                      onSelect={() => { setCategory(c); setIsCatDropdownOpen(false); }}
                      className="flex-1 flex items-center justify-between"
                    >
                      <span className="truncate">{c}</span>
                      {c === category && <Check size={14} className="text-primary shrink-0" />}
                    </DropdownMenuItem>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); requestDeleteCategory(c); }}
                      className={`p-1.5 rounded-md transition-all duration-200 ${
                        pendingDeleteCat === c
                          ? 'bg-destructive text-white scale-105'
                          : 'text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10'
                      }`}
                      aria-label={pendingDeleteCat === c ? `Confirm delete ${c}` : `Delete ${c}`}
                      title={pendingDeleteCat === c ? 'Click again to confirm' : 'Remove category'}
                    >
                      {pendingDeleteCat === c ? <Check size={12} /> : <Trash2 size={12} />}
                    </button>
                  </div>
                ))}
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
                          if (e.key === 'Escape') { e.preventDefault(); setIsAddingCategory(false); }
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
                    onSelect={(e) => { e.preventDefault(); setIsAddingCategory(true); }}
                    className="text-primary focus:text-primary focus:bg-primary/10"
                  >
                    <FolderPlus size={13} className="mr-2" /> Add Category
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </section>

        {/* Inline validation messages (subtle) */}
        <div className="mt-3 min-h-[16px] text-[11px] text-destructive flex flex-col gap-0.5 px-1">
          {codeIsDuplicate && <span>Quick code “{fullQuickCode}” is already in use</span>}
          {profitTooHigh && <span>Profit cannot exceed price</span>}
        </div>

        {/* ── BUTTONS — natural continuation of form (no boxed bar) ── */}
        <div className="mt-8 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
          <button
            type="button"
            disabled={!isFormValid || submittingMode !== null}
            onClick={() => submit('another')}
            className="ap-btn ap-btn-secondary"
            data-testid="btn-create-another"
          >
            {submittingMode === 'another' ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            <span>{submittingMode === 'another' ? 'Adding…' : 'Create & Add Another'}</span>
          </button>
          <button
            type="button"
            disabled={!isFormValid || submittingMode !== null}
            onClick={() => submit('redirect')}
            className="ap-btn ap-btn-primary"
            data-testid="btn-create"
          >
            {submittingMode === 'redirect' ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            <span>{submittingMode === 'redirect' ? 'Creating…' : 'Create'}</span>
          </button>
        </div>
      </div>

      {/* ── Styles ─────────────────────────────────────────────────── */}
      <style>{`
        /* Number input spinner removal */
        .no-spinners input::-webkit-outer-spin-button,
        .no-spinners input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .no-spinners input { -moz-appearance: textfield; }

        /* ── Floating label field with traced border ───────────────────── */
        .fld-wrap {
          position: relative;
          display: flex;
          align-items: center;
          height: 52px;
          background: rgba(255, 255, 255, 0.025);
          border-radius: 10px;
          padding: 0 12px;
          transition: background 200ms ease;
        }
        .fld-wrap.fld-as-button {
          cursor: pointer;
          width: 100%;
          text-align: left;
        }
        .fld-wrap:hover { background: rgba(255, 255, 255, 0.04); }
        .fld-wrap.is-focused { background: rgba(99, 102, 241, 0.05); }
        .fld-wrap.is-invalid { background: rgba(239, 68, 68, 0.06); }

        .fld-prefix, .fld-suffix {
          display: inline-flex;
          align-items: center;
          padding-right: 6px;
          font-size: 14px;
          user-select: none;
          z-index: 2;
          margin-top: 8px; /* offsets to align with input baseline (label takes top space) */
        }
        .fld-suffix { padding-right: 0; padding-left: 6px; }

        .fld-input {
          flex: 1;
          width: 100%;
          background: transparent;
          border: 0;
          outline: 0;
          padding: 18px 0 6px 0;
          font-size: 14.5px;
          color: hsl(var(--foreground));
          z-index: 2;
          position: relative;
        }

        .fld-label {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: hsl(var(--muted-foreground));
          font-size: 14px;
          font-weight: 400;
          pointer-events: none;
          transition: top 220ms cubic-bezier(0.4, 0, 0.2, 1),
                      transform 220ms cubic-bezier(0.4, 0, 0.2, 1),
                      font-size 220ms cubic-bezier(0.4, 0, 0.2, 1),
                      color 220ms ease;
          z-index: 1;
          background: transparent;
        }
        .fld-label.has-prefix { left: 28px; }
        .fld-label.is-floated {
          top: 12px;
          transform: translateY(-50%);
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.02em;
          color: hsl(var(--muted-foreground));
        }
        .fld-wrap.is-focused .fld-label.is-floated { color: hsl(var(--primary)); }
        .fld-wrap.is-invalid .fld-label.is-floated { color: hsl(var(--destructive)); }

        /* ── Animated traced border (4 sides drawn on focus) ───────────── */
        .fld-border {
          position: absolute;
          inset: 0;
          border-radius: 10px;
          pointer-events: none;
          /* base subtle border — fades */
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
          transition: box-shadow 200ms ease;
        }
        .fld-wrap.is-focused .fld-border { box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0); }
        .fld-wrap.is-invalid .fld-border { box-shadow: inset 0 0 0 1px rgba(239, 68, 68, 0.35); }

        .fld-side {
          position: absolute;
          background: hsl(var(--primary));
          transform-origin: left center;
          transform: scaleX(0);
          transition: transform 380ms cubic-bezier(0.4, 0, 0.2, 1);
          opacity: 0;
        }
        .fld-top, .fld-bottom { left: 0; right: 0; height: 1.5px; }
        .fld-top { top: 0; border-radius: 10px 10px 0 0; }
        .fld-bottom {
          bottom: 0;
          transform-origin: right center;
          transform: scaleX(0);
          border-radius: 0 0 10px 10px;
        }
        .fld-left, .fld-right { top: 0; bottom: 0; width: 1.5px; transform: scaleY(0); }
        .fld-right {
          right: 0;
          transform-origin: top center;
          transition-delay: 380ms;
        }
        .fld-bottom {
          transition-delay: 760ms;
        }
        .fld-left {
          left: 0;
          transform-origin: bottom center;
          transition-delay: 1140ms;
        }
        .fld-top { transition-delay: 0ms; }

        .fld-wrap.is-focused .fld-side { opacity: 1; }
        .fld-wrap.is-focused .fld-top { transform: scaleX(1); }
        .fld-wrap.is-focused .fld-right { transform: scaleY(1); }
        .fld-wrap.is-focused .fld-bottom { transform: scaleX(1); }
        .fld-wrap.is-focused .fld-left { transform: scaleY(1); }

        /* On blur — gentle fade back, no reverse trace */
        .fld-wrap:not(.is-focused) .fld-side {
          transition: opacity 220ms ease, transform 0ms 220ms;
          opacity: 0;
          transform: scaleX(0);
        }
        .fld-wrap:not(.is-focused) .fld-left,
        .fld-wrap:not(.is-focused) .fld-right {
          transform: scaleY(0);
        }

        .fld-wrap.is-invalid .fld-side { background: hsl(var(--destructive)); }

        /* Shake animation for invalid profit */
        @keyframes shake-anim {
          0%, 100% { transform: translateX(0); }
          20%      { transform: translateX(-4px); }
          40%      { transform: translateX(4px); }
          60%      { transform: translateX(-2px); }
          80%      { transform: translateX(2px); }
        }
        .shake-anim { animation: shake-anim 380ms cubic-bezier(0.36, 0.07, 0.19, 0.97); }

        /* ── Buttons ───────────────────────────────────────────────────── */
        .ap-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          height: 46px;
          padding: 0 20px;
          border-radius: 11px;
          font-size: 14px;
          font-weight: 600;
          letter-spacing: 0.005em;
          transition: transform 160ms ease, box-shadow 200ms ease, background 200ms ease, opacity 200ms ease;
          will-change: transform;
        }
        .ap-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .ap-btn:not(:disabled):hover { transform: translateY(-1px); }
        .ap-btn:not(:disabled):active { transform: translateY(0) scale(0.98); }

        .ap-btn-primary {
          background: hsl(var(--primary));
          color: hsl(var(--primary-foreground));
          box-shadow: 0 6px 16px -4px rgba(99, 102, 241, 0.45);
        }
        .ap-btn-primary:not(:disabled):hover {
          box-shadow: 0 10px 22px -6px rgba(99, 102, 241, 0.55);
          filter: brightness(1.06);
        }

        .ap-btn-secondary {
          background: transparent;
          color: hsl(var(--foreground));
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1);
        }
        .ap-btn-secondary:not(:disabled):hover {
          background: rgba(255, 255, 255, 0.04);
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.18);
        }
      `}</style>
    </div>
  );
}
