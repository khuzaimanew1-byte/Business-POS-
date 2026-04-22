import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Home, BarChart2, Plus, Settings, ArrowLeft, Image as ImageIcon, Check,
  X, Trash2, Bell, ChevronDown, FolderPlus, Loader2,
} from "lucide-react";
import { useStore, generateQuickCode, normalizeCode, type Product } from "@/lib/store";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export default function AddProduct() {
  const [, setLocation] = useLocation();
  const { products, setProducts, categories, setCategories } = useStore();

  // ── form state ────────────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [quickCodeRaw, setQuickCodeRaw] = useState("");          // user-typed quick code (without #)
  const [quickCodeTouched, setQuickCodeTouched] = useState(false);
  const [price, setPrice] = useState("");
  const [profit, setProfit] = useState("");
  const [stock, setStock] = useState("");
  const initialCat = useMemo(() => categories.find(c => c !== "All") ?? "", [categories]);
  const [category, setCategory] = useState<string>(initialCat);
  const [image, setImage] = useState<string | null>(null);

  // ── ui state ──────────────────────────────────────────────────────────
  const [dragOver, setDragOver] = useState(false);
  const [profitShake, setProfitShake] = useState(false);
  const [isCatDropdownOpen, setIsCatDropdownOpen] = useState(false);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [submittingMode, setSubmittingMode] = useState<null | 'redirect' | 'another'>(null);
  const [imageFading, setImageFading] = useState(false);

  // ── refs ──────────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const newCategoryInputRef = useRef<HTMLInputElement>(null);

  // ── derived values ────────────────────────────────────────────────────
  const priceNum = parseFloat(price);
  const profitNum = parseFloat(profit);
  const stockNum = parseInt(stock, 10);

  const autoQuickCode = useMemo(() => generateQuickCode(name).replace(/^#/, ''), [name]);
  const effectiveQuickCode = quickCodeRaw.trim() || autoQuickCode;
  const fullQuickCode = `#${effectiveQuickCode}`;

  // Uniqueness: check against existing products' quickCode OR generated one
  const codeIsDuplicate = useMemo(() => {
    if (!effectiveQuickCode) return false;
    const norm = normalizeCode(fullQuickCode);
    return products.some(p => {
      const existing = p.quickCode || generateQuickCode(p.name);
      return normalizeCode(existing) === norm;
    });
  }, [products, effectiveQuickCode, fullQuickCode]);

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
    effectiveQuickCode.length > 0 &&
    !codeIsDuplicate;

  // Keep category in sync if categories list grows from elsewhere
  useEffect(() => {
    if (!category && initialCat) setCategory(initialCat);
  }, [initialCat, category]);

  // Focus name on mount
  useEffect(() => { nameInputRef.current?.focus(); }, []);

  // Trigger profit shake when validation fails on user input
  useEffect(() => {
    if (!profitTooHigh) return;
    setProfitShake(false);
    const id = requestAnimationFrame(() => setProfitShake(true));
    const t = setTimeout(() => setProfitShake(false), 480);
    return () => { cancelAnimationFrame(id); clearTimeout(t); };
  }, [profitTooHigh, profit]);

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

  const removeImage = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setImageFading(true);
    setTimeout(() => { setImage(null); setImageFading(false); }, 240);
  };

  const resetForm = () => {
    setName("");
    setQuickCodeRaw("");
    setQuickCodeTouched(false);
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

  const submit = async (mode: 'redirect' | 'another') => {
    if (!isFormValid || submittingMode) return;
    setSubmittingMode(mode);
    const product = buildProduct();
    // simulate quick async (gives the loading state a beat)
    await new Promise(r => setTimeout(r, 280));
    setProducts(prev => [...prev, product]);
    toast.success(`${product.name} created`, { icon: <Check className="text-green-500" /> });
    if (mode === 'redirect') {
      setTimeout(() => {
        setSubmittingMode(null);
        setLocation('/');
      }, 220);
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

  // ── keyboard shortcuts ───────────────────────────────────────────────
  useEffect(() => {
    const isTyping = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'TEXTAREA' || el.isContentEditable;
      // NOTE: INPUT is intentionally excluded so Enter/Shift+Enter still triggers submit
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault();
        nameInputRef.current?.focus();
        nameInputRef.current?.select();
        return;
      }
      if (e.shiftKey && (e.key === 'A' || e.key === 'a') && !isTyping(e.target)) {
        e.preventDefault();
        setLocation('/analytics');
        return;
      }
      if (e.shiftKey && (e.key === 'P' || e.key === 'p') && !isTyping(e.target)) {
        e.preventDefault();
        // Already here — focus name as a soft "open"
        nameInputRef.current?.focus();
        return;
      }
      if (e.key === 'Enter' && !isTyping(e.target)) {
        // Submit on Enter / Shift+Enter (only if form valid)
        if (isFormValid && !submittingMode) {
          e.preventDefault();
          submit(e.shiftKey ? 'another' : 'redirect');
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFormValid, submittingMode, submit, setLocation]);

  // ── render helpers ────────────────────────────────────────────────────
  const inputBase =
    "w-full bg-secondary/40 border border-border/50 rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary/60 focus:bg-secondary/60 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.15)] transition-all duration-200";

  const labelBase = "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block";

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground dark">
      {/* ── DESKTOP LEFT SIDEBAR ─────────────────────────────────────── */}
      <aside className="hidden sm:flex w-[60px] shrink-0 border-r border-border bg-sidebar flex-col items-center py-4 z-20">
        <div className="flex flex-col gap-6">
          <TooltipProvider delayDuration={100}>
            <NavBtn icon={<Home size={20} />} label="Home" onClick={() => setLocation("/")} />
            <NavBtn icon={<BarChart2 size={20} />} label="Analytics" onClick={() => setLocation("/analytics")} />
            <NavBtn icon={<Plus size={20} />} label="Add Product" active />
            <NavBtn icon={<Settings size={20} />} label="Settings" />
          </TooltipProvider>
        </div>
      </aside>

      {/* ── MAIN ─────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* TOP BAR */}
        <header className="h-14 sm:h-16 flex items-center justify-between px-3 sm:px-6 shrink-0 bg-background/90 backdrop-blur-sm shadow-[0_1px_0_rgba(255,255,255,0.04),0_4px_24px_rgba(0,0,0,0.22)] z-10">
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
              <h1 className="text-[15px] sm:text-[17px] font-semibold truncate">Add Product</h1>
              <p className="hidden sm:block text-[11px] text-muted-foreground">Create a new item for your inventory</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <kbd className="px-1.5 py-0.5 rounded bg-secondary border border-border/60 text-[10px] font-mono">Enter</kbd> Create ·
            <kbd className="px-1.5 py-0.5 rounded bg-secondary border border-border/60 text-[10px] font-mono">⇧+Enter</kbd> Create &amp; Add
          </div>
        </header>

        {/* CONTENT */}
        <div className="flex-1 overflow-y-auto pb-24 sm:pb-32 add-product-scroll">
          <div className="max-w-6xl mx-auto px-3 sm:px-8 py-5 sm:py-8">
            {/* Layout: stacked on mobile, 3-zone grid on desktop */}
            <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_260px] gap-5 sm:gap-7">
              {/* ─── LEFT: IMAGE ─────────────────────────────────── */}
              <section className="lg:sticky lg:top-2 self-start">
                <label className={labelBase}>Image</label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragEnter={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                  className={`group relative aspect-square w-full rounded-2xl overflow-hidden cursor-pointer select-none transition-all duration-250 border-2 border-dashed ${
                    dragOver
                      ? 'border-primary/70 bg-primary/8 scale-[1.015] shadow-[0_0_0_4px_rgba(99,102,241,0.18)]'
                      : image
                        ? 'border-transparent bg-secondary/40'
                        : 'border-border/60 bg-secondary/30 hover:border-primary/40 hover:bg-secondary/45'
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
                  {image ? (
                    <>
                      <img
                        src={image}
                        alt="Product preview"
                        className={`w-full h-full object-cover transition-opacity duration-250 ${imageFading ? 'opacity-0' : 'opacity-100'}`}
                      />
                      {/* Subtle hover overlay with replace/remove */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent opacity-0 group-hover:opacity-100 sm:transition-opacity duration-200 pointer-events-none" />
                      <div className="absolute bottom-2 right-2 left-2 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <span className="text-[11px] text-white/90 px-2 py-1 rounded-md bg-black/55 backdrop-blur-sm">Click to replace</span>
                        <button
                          onClick={removeImage}
                          className="p-1.5 rounded-full bg-black/65 hover:bg-destructive text-white transition-colors"
                          aria-label="Remove image"
                          data-testid="btn-remove-image"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      {/* Always-visible remove on touch (mobile) */}
                      <button
                        onClick={removeImage}
                        className="sm:hidden absolute top-2 right-2 p-1.5 rounded-full bg-black/65 text-white"
                        aria-label="Remove image"
                      >
                        <X size={13} />
                      </button>
                    </>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                      <div className={`flex items-center justify-center rounded-full transition-all duration-300 ${dragOver ? 'bg-primary text-primary-foreground scale-110' : 'bg-secondary text-muted-foreground/80 group-hover:bg-primary/15 group-hover:text-primary'}`} style={{ width: 56, height: 56 }}>
                        <Plus size={28} strokeWidth={2.2} />
                      </div>
                      <div className="text-center px-4">
                        <p className="text-[13px] font-medium text-foreground/85">{dragOver ? 'Drop to upload' : 'Add product image'}</p>
                        <p className="text-[11px] text-muted-foreground/80 mt-0.5 hidden sm:block">Click or drag &amp; drop</p>
                        <p className="text-[11px] text-muted-foreground/80 mt-0.5 sm:hidden">Tap to choose</p>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* ─── CENTER: PRIMARY INPUTS ─────────────────────── */}
              <section className="flex flex-col gap-4">
                {/* Name */}
                <div>
                  <label className={labelBase} htmlFor="ap-name">Product Name <span className="text-destructive">*</span></label>
                  <input
                    ref={nameInputRef}
                    id="ap-name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Avocado Wrap"
                    className={`${inputBase} text-[15px] font-medium`}
                    data-testid="input-name"
                  />
                </div>

                {/* Quick code */}
                <div>
                  <label className={labelBase} htmlFor="ap-qc">
                    Quick Code
                    <span className="ml-1.5 normal-case tracking-normal text-[10px] font-normal text-muted-foreground/70">
                      auto-generated if blank
                    </span>
                  </label>
                  <div className={`flex items-center bg-secondary/40 border rounded-lg overflow-hidden transition-all duration-200 ${
                    codeIsDuplicate
                      ? 'border-destructive/70 shadow-[0_0_0_3px_rgba(239,68,68,0.15)]'
                      : 'border-border/50 focus-within:border-primary/60 focus-within:shadow-[0_0_0_3px_rgba(99,102,241,0.15)]'
                  }`}>
                    <span className="pl-3 pr-1 text-muted-foreground font-mono select-none text-sm">#</span>
                    <input
                      id="ap-qc"
                      value={quickCodeRaw}
                      onChange={e => {
                        // Always lowercase; allow letters, digits and hyphen
                        const v = e.target.value.toLowerCase().replace(/[^a-z0-9\-]/g, '');
                        setQuickCodeRaw(v);
                        setQuickCodeTouched(true);
                      }}
                      placeholder={autoQuickCode || 'wi-e'}
                      className="flex-1 bg-transparent border-0 px-1 py-2.5 text-sm font-mono outline-none placeholder:text-muted-foreground/50"
                      maxLength={8}
                      data-testid="input-quickcode"
                    />
                    {!quickCodeTouched && autoQuickCode && (
                      <span className="pr-3 text-[10px] text-muted-foreground/70 font-mono">auto</span>
                    )}
                  </div>
                  {codeIsDuplicate && (
                    <p className="text-destructive text-[11px] mt-1.5 flex items-center gap-1">
                      <X size={12} /> This quick code is already in use
                    </p>
                  )}
                </div>

                {/* Price + Profit */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelBase} htmlFor="ap-price">Price <span className="text-destructive">*</span></label>
                    <div className={`flex items-center bg-secondary/40 border border-border/50 rounded-lg overflow-hidden focus-within:border-primary/60 focus-within:shadow-[0_0_0_3px_rgba(99,102,241,0.15)] transition-all duration-200`}>
                      <span className="pl-3 pr-1 text-primary font-bold select-none">$</span>
                      <input
                        id="ap-price"
                        type="number"
                        step="0.01"
                        min="0"
                        value={price}
                        onChange={e => setPrice(e.target.value)}
                        placeholder="0.00"
                        className="flex-1 bg-transparent border-0 px-1 py-2.5 text-sm outline-none no-spinners-ap"
                        data-testid="input-price"
                      />
                    </div>
                  </div>
                  <div>
                    <label className={labelBase} htmlFor="ap-profit">Profit <span className="text-destructive">*</span></label>
                    <div className={`flex items-center bg-secondary/40 border rounded-lg overflow-hidden transition-all duration-200 ${
                      profitTooHigh
                        ? 'border-destructive/70 shadow-[0_0_0_3px_rgba(239,68,68,0.15)]'
                        : 'border-border/50 focus-within:border-primary/60 focus-within:shadow-[0_0_0_3px_rgba(99,102,241,0.15)]'
                    } ${profitShake ? 'shake-anim' : ''}`}>
                      <span className={`pl-3 pr-1 font-bold select-none ${profitTooHigh ? 'text-destructive' : 'text-muted-foreground'}`}>$</span>
                      <input
                        id="ap-profit"
                        type="number"
                        step="0.01"
                        min="0"
                        value={profit}
                        onChange={e => setProfit(e.target.value)}
                        placeholder="0.00"
                        className="flex-1 bg-transparent border-0 px-1 py-2.5 text-sm outline-none no-spinners-ap"
                        data-testid="input-profit"
                      />
                    </div>
                    {profitTooHigh && (
                      <p className="text-destructive text-[11px] mt-1.5 flex items-center gap-1">
                        <X size={12} /> Profit cannot exceed price
                      </p>
                    )}
                  </div>
                </div>

                {/* Margin preview */}
                <div className={`rounded-lg border border-border/40 bg-secondary/25 px-3.5 py-2.5 flex items-center justify-between transition-all duration-200 ${margin === null ? 'opacity-60' : 'opacity-100'}`}>
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Margin</span>
                    <span className="text-[15px] font-bold tabular-nums text-foreground mt-0.5">
                      {margin === null ? '—' : `${margin.toFixed(1)}%`}
                    </span>
                  </div>
                  <div className="flex-1 mx-4 h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary transition-[width] duration-300 ease-out"
                      style={{ width: `${margin ?? 0}%` }}
                    />
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Earn</span>
                    <span className="text-[13px] font-mono text-primary tabular-nums mt-0.5">
                      {!isNaN(profitNum) ? `$${profitNum.toFixed(2)}` : '$0.00'}
                    </span>
                  </div>
                </div>
              </section>

              {/* ─── RIGHT: SECONDARY INPUTS ────────────────────── */}
              <section className="flex flex-col gap-4">
                <div>
                  <label className={labelBase} htmlFor="ap-stock">Stock <span className="text-destructive">*</span></label>
                  <input
                    id="ap-stock"
                    type="number"
                    min="0"
                    value={stock}
                    onChange={e => setStock(e.target.value)}
                    placeholder="100"
                    className={`${inputBase} no-spinners-ap`}
                    data-testid="input-stock"
                  />
                </div>

                <div>
                  <label className={labelBase}>Category <span className="text-destructive">*</span></label>
                  <DropdownMenu open={isCatDropdownOpen} onOpenChange={open => { setIsCatDropdownOpen(open); if (!open) setIsAddingCategory(false); }}>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className={`${inputBase} flex items-center justify-between text-left`}
                        data-testid="btn-category"
                      >
                        <span className={category ? '' : 'text-muted-foreground/60'}>
                          {category || 'Select category'}
                        </span>
                        <ChevronDown size={15} className={`text-muted-foreground transition-transform duration-200 ${isCatDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] sm:w-56">
                      {categories.filter(c => c !== 'All').map(c => (
                        <DropdownMenuItem
                          key={c}
                          onSelect={() => { setCategory(c); setIsCatDropdownOpen(false); }}
                          className="flex items-center justify-between"
                        >
                          {c}
                          {c === category && <Check size={14} className="text-primary" />}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      {isAddingCategory ? (
                        <div className="px-1.5 py-1" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <input
                              ref={newCategoryInputRef}
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

                {/* Quick code preview chip */}
                <div className="hidden lg:block rounded-lg border border-border/40 bg-secondary/25 px-3.5 py-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Preview</div>
                  <div className="flex items-center gap-2">
                    <span className="quick-code-preview-badge">
                      <span className="text-white text-[12px] font-mono font-bold tracking-[0.06em]">{fullQuickCode}</span>
                    </span>
                    <span className="text-xs text-muted-foreground truncate">{name || 'Product name'}</span>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>

        {/* ── ACTION BAR (sticky bottom) ─────────────────────── */}
        <div className="fixed left-0 sm:left-[60px] right-0 z-30 border-t border-border bg-background/95 backdrop-blur-md px-3 sm:px-8 py-3 sm:py-3.5 flex items-center gap-2 sm:gap-3 justify-end shadow-[0_-4px_24px_rgba(0,0,0,0.25)]"
          style={{ bottom: 'var(--mobile-nav-height-ap, 0px)' }}>
          <button
            type="button"
            onClick={() => setLocation('/')}
            className="hidden sm:inline-flex px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition"
            data-testid="btn-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!isFormValid || submittingMode !== null}
            onClick={() => submit('another')}
            className="px-3 sm:px-4 py-2.5 rounded-lg text-sm font-medium border border-border/60 bg-secondary/50 hover:bg-secondary text-foreground transition active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            data-testid="btn-create-another"
          >
            {submittingMode === 'another' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            <span className="hidden xs:inline sm:inline">{submittingMode === 'another' ? 'Adding…' : 'Create & Add Another'}</span>
            <span className="xs:hidden sm:hidden">Add Another</span>
          </button>
          <button
            type="button"
            disabled={!isFormValid || submittingMode !== null}
            onClick={() => submit('redirect')}
            className="px-4 sm:px-5 py-2.5 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:brightness-110 transition active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-[0_4px_14px_rgba(99,102,241,0.35)]"
            data-testid="btn-create"
          >
            {submittingMode === 'redirect' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {submittingMode === 'redirect' ? 'Creating…' : 'Create'}
          </button>
        </div>
      </main>

      {/* ── MOBILE BOTTOM NAV ──────────────────────────────────────── */}
      <nav className="add-product-mobile-nav sm:hidden fixed bottom-0 left-0 right-0 h-[60px] bg-sidebar border-t border-border flex items-center justify-around px-2 z-30">
        <MobileNavBtn icon={<Home size={20} />} label="Home" onClick={() => setLocation('/')} />
        <MobileNavBtn icon={<BarChart2 size={20} />} label="Analytics" onClick={() => setLocation('/analytics')} />
        <button
          className="flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg -mt-4"
          aria-label="Add Product"
        >
          <Plus size={22} />
        </button>
        <MobileNavBtn icon={<Bell size={20} />} label="Alerts" />
        <MobileNavBtn icon={<Settings size={20} />} label="Settings" />
      </nav>

      <style>{`
        :root { --mobile-nav-height-ap: 0px; }
        @media (max-width: 639px) { :root { --mobile-nav-height-ap: 60px; } }
        .add-product-scroll { padding-bottom: 120px; }

        .no-spinners-ap::-webkit-outer-spin-button,
        .no-spinners-ap::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .no-spinners-ap { -moz-appearance: textfield; }

        @keyframes shake-anim {
          0%, 100% { transform: translateX(0); }
          20%      { transform: translateX(-5px); }
          40%      { transform: translateX(5px); }
          60%      { transform: translateX(-3px); }
          80%      { transform: translateX(3px); }
        }
        .shake-anim { animation: shake-anim 380ms cubic-bezier(0.36, 0.07, 0.19, 0.97); }

        .quick-code-preview-badge {
          display: inline-flex;
          align-items: center;
          padding: 4px 9px;
          background: rgba(8, 10, 18, 0.86);
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 6px;
          box-shadow:
            0 1px 0 rgba(255, 255, 255, 0.08) inset,
            0 2px 6px rgba(0, 0, 0, 0.45);
        }
      `}</style>
    </div>
  );
}

// ── Sidebar nav button (icon-only, with tooltip) ─────────────────────────────
function NavBtn({ icon, label, active = false, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className={`relative p-3 rounded-xl transition-all duration-250 ease-in-out group ${active ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'}`}
        >
          {icon}
          {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-r-md" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="ml-2 font-medium text-white border-0 px-2 py-1 rounded-md" style={{ background: 'rgba(10,10,16,0.88)', backdropFilter: 'blur(6px)', fontSize: '12px' }}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

// ── Mobile bottom nav button ─────────────────────────────────────────────────
function MobileNavBtn({ icon, label, active = false, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-lg transition-colors duration-200 ${active ? 'text-primary' : 'text-muted-foreground'}`}
      aria-label={label}
    >
      {icon}
      <span className="text-[9px] font-medium">{label}</span>
    </button>
  );
}
