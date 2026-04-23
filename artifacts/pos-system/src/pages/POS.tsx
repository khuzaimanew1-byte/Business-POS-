import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { 
  Home, BarChart2, Plus, Pencil, Settings, Search, X, Bell, 
  ShoppingCart, Trash2, Minus, Check, Camera, MousePointer,
  FolderInput, ChevronRight, LogOut
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem,
  ContextMenuSub, ContextMenuSubTrigger, ContextMenuSubContent, ContextMenuSeparator
} from "@/components/ui/context-menu";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem
} from "@/components/ui/dropdown-menu";

import { useStore, type Product, type Category } from "@/lib/store";
import { useSettings, formatCurrency } from "@/lib/settings";

type CartItem = {
  product: Product;
  quantity: number;
};

export default function POS() {
  const [, setLocation] = useLocation();
  const { products, setProducts, categories, setCategories } = useStore();
  const { settings } = useSettings();
  const fmtCur = (v: number) => formatCurrency(v, settings);
  const [selectedCategory, setSelectedCategory] = useState<Category>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isAddCategoryModalOpen, setIsAddCategoryModalOpen] = useState(false);
  const [cartFlash, setCartFlash] = useState(false);

  type EditDraft = { name: string; price: string; stock: string; quickCode: string; profit: string; image?: string };
  const [isEditMode, setIsEditMode] = useState(false);
  const [editDrafts, setEditDrafts] = useState<Record<string, EditDraft>>({});
  const [savedProducts, setSavedProducts] = useState<Product[]>([]);
  const [savedCategories, setSavedCategories] = useState<Category[]>([]);
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, string>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetId = useRef<string | null>(null);

  type DeleteConfirm = { open: boolean; message: string; onConfirm: () => void };
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm>({ open: false, message: '', onConfirm: () => {} });
  const [exitConfirm, setExitConfirm] = useState(false);

  // ── Selection mode state ────────────────────────────────────────────────
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importMenuOpen, setImportMenuOpen] = useState(false);

  // ID of product whose quick code badge should briefly pulse after add-to-cart
  const [activeQuickCodeId, setActiveQuickCodeId] = useState<string | null>(null);

  // ── Search/keyboard refs ───────────────────────────────────────────────
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Long-press tracking (mobile)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Quick code: lowercase, hyphen-segmented shorthand prefixed with "#".
  // e.g. "Wireless Earbuds" -> "#wi-e", "Apple Juice" -> "#ap-j", "Cola" -> "#co-l"
  const quickCode = useCallback((name: string) => {
    const cleaned = name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '#';
    if (parts.length === 1) {
      // Single-word names: no hyphen, just up to 3 chars (e.g. "Cola" -> "#col")
      return `#${parts[0].slice(0, 3)}`;
    }
    const head = parts[0].slice(0, 2).padEnd(1, '');
    const tail = parts[1][0];
    return `#${head}-${tail}`;
  }, []);

  // Normalize a query so "wie", "wi-e", "#wi-e" all match the same code.
  const normalize = (s: string) => s.toLowerCase().replace(/[#\-\s]/g, '');

  // Score a product against query for ranking. Lower = better.
  const scoreMatch = (p: Product, q: string): number => {
    if (!q) return 0;
    const ql = q.toLowerCase();
    const qn = normalize(q);
    const name = p.name.toLowerCase();
    const qc = p.quickCode || quickCode(p.name);
    const qcn = normalize(qc);
    if (qcn === qn) return 0;
    if (name === ql) return 1;
    if (qcn.startsWith(qn)) return 2;
    if (name.startsWith(ql)) return 3;
    if (name.includes(ql)) return 5 + name.indexOf(ql) / 100;
    return 99;
  };

  const filteredProducts = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    const qn = normalize(q);
    const list = products.filter(p => {
      const matchesCat = selectedCategory === "All" || p.category === selectedCategory;
      if (!matchesCat) return false;
      if (!q) return true;
      const qcn = normalize(p.quickCode || quickCode(p.name));
      return (
        p.name.toLowerCase().includes(q) ||
        (qn && qcn.includes(qn))
      );
    });
    if (q) {
      list.sort((a, b) => scoreMatch(a, q) - scoreMatch(b, q));
    }
    return list;
  }, [products, selectedCategory, debouncedSearch, quickCode]);

  const topMatchId = debouncedSearch ? filteredProducts[0]?.id : null;

  const cartTotal = useMemo(() => cartItems.reduce((s, i) => s + i.product.price * i.quantity, 0), [cartItems]);
  const cartCount = useMemo(() => cartItems.reduce((s, i) => s + i.quantity, 0), [cartItems]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const addToCart = (product: Product) => {
    if (product.stock <= 0) { toast.error("Out of stock!"); return; }
    setProducts(prev => prev.map(p => p.id === product.id ? { ...p, stock: p.stock - 1 } : p));
    setCartItems(prev => {
      const ex = prev.find(i => i.product.id === product.id);
      if (ex) return prev.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product, quantity: 1 }];
    });
    setCartFlash(false);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      setCartFlash(true);
      setTimeout(() => setCartFlash(false), 700);
    }));
    // Briefly emphasize the quick code badge of the just-added product
    setActiveQuickCodeId(product.id);
    setTimeout(() => setActiveQuickCodeId(curr => curr === product.id ? null : curr), 220);
  };

  const enterEditMode = () => {
    setSavedProducts(products);
    setSavedCategories(categories);
    const drafts: Record<string, EditDraft> = {};
    products.forEach(p => { drafts[p.id] = { name: p.name, price: String(p.price), stock: String(p.stock), quickCode: (p.quickCode || quickCode(p.name)).replace(/^#/, ''), profit: String(p.profit ?? 0), image: p.image }; });
    const catDrafts: Record<string, string> = {};
    categories.forEach(c => { catDrafts[c] = c; });
    setEditDrafts(drafts);
    setCategoryDrafts(catDrafts);
    setIsEditMode(true);
  };

  const saveEditMode = () => {
    const renamedMap: Record<string, string> = {};
    categories.forEach(cat => { renamedMap[cat] = (categoryDrafts[cat] ?? cat).trim() || cat; });
    setCategories(prev => prev.map(c => renamedMap[c] || c));
    if (selectedCategory !== 'All') setSelectedCategory(renamedMap[selectedCategory] || selectedCategory);
    setProducts(prev => prev.map(p => {
      const d = editDrafts[p.id];
      if (!d) return { ...p, category: renamedMap[p.category] || p.category };
      const qcRaw = d.quickCode.trim().toLowerCase().replace(/[^a-z0-9\-]/g, '');
      return {
        ...p,
        name: d.name.trim() || p.name,
        price: parseFloat(d.price) || p.price,
        stock: parseInt(d.stock, 10) >= 0 ? parseInt(d.stock, 10) : p.stock,
        quickCode: qcRaw ? `#${qcRaw}` : (p.quickCode || quickCode(p.name)),
        category: renamedMap[p.category] || p.category,
        image: d.image,
        profit: parseFloat(d.profit) >= 0 ? parseFloat(d.profit) : (p.profit ?? 0),
      };
    }));
    setIsEditMode(false);
    toast.success('Changes saved');
  };

  const cancelEditMode = () => {
    setProducts(savedProducts);
    setCategories(savedCategories);
    setIsEditMode(false);
    toast.info('Changes discarded');
  };

  const updateDraft = (id: string, field: keyof EditDraft, value: string) =>
    setEditDrafts(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));

  const confirmAction = (message: string, onConfirm: () => void) =>
    setDeleteConfirm({ open: true, message, onConfirm });

  const deleteProduct = (id: string) => {
    setProducts(prev => prev.filter(p => p.id !== id));
    setCartItems(prev => prev.filter(i => i.product.id !== id));
    toast.success('Product deleted');
  };

  const deleteCategory = (cat: string) => {
    if (cat === 'All') return;
    setCategories(prev => prev.filter(c => c !== cat));
    setCategoryDrafts(prev => { const n = { ...prev }; delete n[cat]; return n; });
    if (selectedCategory === cat) setSelectedCategory('All');
    toast.success(`"${cat}" deleted`);
  };

  const updateCartQty = (productId: string, newQty: number) => {
    const item = cartItems.find(i => i.product.id === productId);
    if (!item) return;
    const diff = newQty - item.quantity;
    const product = products.find(p => p.id === productId);
    if (product && product.stock < diff) { toast.error("Not enough stock!"); return; }
    if (newQty <= 0) { removeFromCart(productId); return; }
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, stock: p.stock - diff } : p));
    setCartItems(prev => prev.map(i => i.product.id === productId ? { ...i, quantity: newQty } : i));
  };

  const removeFromCart = (productId: string) => {
    const item = cartItems.find(i => i.product.id === productId);
    if (!item) return;
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, stock: p.stock + item.quantity } : p));
    setCartItems(prev => prev.filter(i => i.product.id !== productId));
  };

  const checkout = () => {
    if (cartItems.length === 0) return;
    setCartItems([]);
    setIsCartOpen(false);
    toast.success("Checkout successful!", { icon: <Check className="text-green-500" /> });
  };

  const handleAddCategory = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = fd.get("name") as string;
    if (name && !categories.includes(name)) setCategories(prev => [...prev, name]);
    setIsAddCategoryModalOpen(false);
  };

  const triggerImageUpload = (productId: string) => {
    uploadTargetId.current = productId;
    fileInputRef.current?.click();
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const id = uploadTargetId.current;
    if (!file || !id) return;
    const url = URL.createObjectURL(file);
    setEditDrafts(prev => ({ ...prev, [id]: { ...prev[id], image: url } }));
    e.target.value = '';
    uploadTargetId.current = null;
  };

  const renderInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);

  // ── Selection / category move helpers ──────────────────────────────────
  const enterSelectMode = (initialId?: string) => {
    setIsSelectMode(true);
    setSelectedIds(initialId ? new Set([initialId]) : new Set());
  };

  const exitSelectMode = () => {
    setIsSelectMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const moveProductToCategory = (productId: string, cat: Category) => {
    if (cat === 'All') return;
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, category: cat } : p));
    toast.success(`Moved to "${cat}"`);
  };

  const moveProductsToCategory = (ids: string[], cat: Category) => {
    if (cat === 'All' || ids.length === 0) return;
    setProducts(prev => prev.map(p => ids.includes(p.id) ? { ...p, category: cat } : p));
    toast.success(`${ids.length} item${ids.length > 1 ? 's' : ''} moved to "${cat}"`);
    exitSelectMode();
  };

  const bulkDeleteProducts = (ids: string[]) => {
    if (ids.length === 0) return;
    const set = new Set(ids);
    setProducts(prev => prev.filter(p => !set.has(p.id)));
    setCartItems(prev => prev.filter(i => !set.has(i.product.id)));
    toast.success(`${ids.length} item${ids.length > 1 ? 's' : ''} deleted`);
    exitSelectMode();
  };

  // Best match for current search (for Enter shortcut)
  const addTopMatchToCart = () => {
    if (!topMatchId) return;
    const p = products.find(x => x.id === topMatchId);
    if (p) addToCart(p);
  };

  // ── Long-press helpers (mobile context menu trigger) ───────────────────
  const startLongPress = (e: React.TouchEvent, onFire: () => void) => {
    if (isEditMode) return;
    longPressFired.current = false;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      onFire();
    }, 480);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  // ── KEYBOARD SHORTCUTS ─────────────────────────────────────────────────
  // C+digit hold then ArrowUp/Down to adjust quantity of cart item by index (1-based)
  const cKeyDown = useRef(false);
  const heldDigit = useRef<number | null>(null);

  useEffect(() => {
    const isTypingTarget = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!settings.shortcutsEnabled) return;
      // Ctrl + ` (backtick) → toggle search focus
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault();
        const input = searchInputRef.current;
        if (!input) return;
        if (document.activeElement === input) {
          input.blur();
        } else {
          input.focus();
          input.select();
        }
        return;
      }

      // Track C key & digit holds for cart qty adjust (do NOT block typing fields)
      if (!isTypingTarget(e.target)) {
        if (e.key === 'c' || e.key === 'C') {
          if (!e.shiftKey) cKeyDown.current = true;
        }
        if (cKeyDown.current && /^[0-9]$/.test(e.key)) {
          heldDigit.current = parseInt(e.key, 10);
        }
        if (cKeyDown.current && heldDigit.current !== null && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault();
          const idx = heldDigit.current - 1;
          const item = cartItems[idx];
          if (item) {
            const delta = e.key === 'ArrowUp' ? 1 : -1;
            updateCartQty(item.product.id, item.quantity + delta);
          }
          return;
        }
      }

      // Shift + C → open cart
      if (e.shiftKey && (e.key === 'C' || e.key === 'c') && !isTypingTarget(e.target)) {
        e.preventDefault();
        setIsCartOpen(o => !o);
        return;
      }
      // Shift + E → enter edit mode
      if (e.shiftKey && (e.key === 'E' || e.key === 'e') && !isTypingTarget(e.target)) {
        e.preventDefault();
        if (!isEditMode) enterEditMode();
        return;
      }
      // Shift + P → Add Product page
      if (e.shiftKey && (e.key === 'P' || e.key === 'p') && !isTypingTarget(e.target)) {
        e.preventDefault();
        setLocation('/add-product');
        return;
      }
      // Shift + A → Analytics page
      if (e.shiftKey && (e.key === 'A' || e.key === 'a') && !isTypingTarget(e.target)) {
        e.preventDefault();
        setLocation('/analytics');
        return;
      }
      // Shift + Backspace → on Home, prompt exit; elsewhere, go back
      if (e.shiftKey && e.key === 'Backspace' && !isTypingTarget(e.target)) {
        e.preventDefault();
        setExitConfirm(true);
        return;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'c' || e.key === 'C') {
        cKeyDown.current = false;
        heldDigit.current = null;
      }
      if (/^[0-9]$/.test(e.key)) {
        heldDigit.current = null;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [cartItems, isEditMode, setLocation]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground dark">
      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageFileChange} />

      {/* ── DESKTOP LEFT SIDEBAR (hidden on mobile) ────────────────────── */}
      <aside className="hidden sm:flex w-[60px] shrink-0 border-r border-border bg-sidebar flex-col items-center py-4 z-20">
        <div className="flex flex-col gap-6">
          <TooltipProvider delayDuration={250}>
            <TooltipItem icon={<Home size={20} />} label="Home" active />
            <TooltipItem icon={<BarChart2 size={20} />} label="Analytics" onClick={() => setLocation("/analytics")} />
            <div onClick={() => setLocation("/add-product")}>
              <TooltipItem icon={<Plus size={20} />} label="Add Product" />
            </div>
            <TooltipItem icon={<Settings size={20} />} label="Settings" onClick={() => setLocation("/settings")} />
          </TooltipProvider>
        </div>
      </aside>

      {/* ── MAIN CONTENT AREA ─────────────────────────────────────────────── */}
      <main
        className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out${isCartOpen ? ' main-cart-pushed' : ''}`}
      >

        {/* TOP BAR */}
        <header className={`h-14 sm:h-16 flex items-center justify-between px-3 sm:px-6 shrink-0 backdrop-blur-sm z-10 sticky top-0 transition-all duration-400 ${isEditMode ? 'border-b border-primary/25 bg-primary/5 shadow-none' : 'bg-background/90 shadow-[0_1px_0_rgba(255,255,255,0.04),0_4px_24px_rgba(0,0,0,0.22)]'}`}>
          {/* Search — hidden during selection mode */}
          {isSelectMode ? (
            <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
              <button
                onClick={exitSelectMode}
                className="w-9 h-9 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-white/[0.04] active:scale-[0.96] transition-all duration-200 shrink-0"
                aria-label="Exit selection"
                data-testid="btn-exit-select"
              >
                <X size={17} strokeWidth={1.75} />
              </button>
              <span className="text-[13px] sm:text-sm text-muted-foreground font-medium whitespace-nowrap tracking-tight">
                <span className="text-foreground">Selected: </span>
                <span className="text-foreground tabular-nums font-semibold">{selectedIds.size}</span>
                <span className="ml-1">item{selectedIds.size === 1 ? '' : 's'}</span>
              </span>
            </div>
          ) : (
            <div className="relative flex-1 max-w-xl group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-[14px] h-[14px]" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search products or quick-code (e.g. #wi-e)…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && topMatchId) {
                    e.preventDefault();
                    addTopMatchToCart();
                    setSearchQuery('');
                  }
                }}
                className="w-full bg-input/50 border border-transparent focus:border-ring/50 focus:ring-1 focus:ring-ring/20 rounded-full py-2 pl-9 pr-9 outline-none transition-all duration-250 placeholder:text-muted-foreground text-[14px] sm:text-[16px]"
                data-testid="input-search"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors duration-200">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {/* Right controls */}
          <div className="flex items-center gap-1.5 ml-3">
            {/* Selection mode toolbar — overrides other controls when active */}
            {isSelectMode && (
              <div className="flex items-center gap-2 sm:gap-3 animate-in fade-in slide-in-from-top-1 duration-200">
                <button
                  disabled={selectedIds.size === 0}
                  onClick={() => {
                    const ids = Array.from(selectedIds);
                    confirmAction(
                      `Delete selected items?`,
                      () => bulkDeleteProducts(ids),
                    );
                  }}
                  className="w-9 h-9 flex items-center justify-center rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/[0.08] active:scale-[0.96] transition-all duration-200 disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                  aria-label="Delete selected"
                  data-testid="btn-selection-delete"
                >
                  <Trash2 size={16} strokeWidth={1.75} />
                </button>
                <DropdownMenu open={importMenuOpen} onOpenChange={setImportMenuOpen}>
                  <DropdownMenuTrigger asChild>
                    <button
                      disabled={selectedIds.size === 0}
                      className="h-9 px-3.5 rounded-full border border-border/60 bg-white/[0.02] hover:bg-white/[0.05] hover:border-border text-foreground text-[13px] sm:text-sm font-medium active:scale-[0.97] transition-all duration-200 disabled:opacity-35 disabled:cursor-not-allowed flex items-center gap-1.5"
                      data-testid="btn-selection-move"
                    >
                      <FolderInput size={14} strokeWidth={1.75} />
                      <span>Move</span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    {categories.filter(c => c !== 'All').map(c => (
                      <DropdownMenuItem
                        key={c}
                        onSelect={() => moveProductsToCategory(Array.from(selectedIds), c)}
                      >
                        {c}
                      </DropdownMenuItem>
                    ))}
                    {categories.filter(c => c !== 'All').length === 0 && (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">No categories</div>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}

            {/* Editing indicator — desktop only, hidden on mobile to keep top bar clean */}
            <div className={`hidden sm:block overflow-hidden transition-all duration-300 ease-in-out ${isEditMode && !isSelectMode ? 'max-w-[90px] opacity-100 mr-1' : 'max-w-0 opacity-0'}`}>
              <span className="text-primary font-semibold tracking-widest uppercase whitespace-nowrap" style={{ fontSize: '10px' }}>● Editing</span>
            </div>

            {/* Normal mode controls */}
            <div className={`flex items-center gap-1 transition-all duration-300 ease-in-out ${isEditMode || isSelectMode ? 'opacity-0 pointer-events-none absolute' : 'opacity-100'}`}>
              {/* Pencil — always visible */}
              <TooltipProvider delayDuration={250}>
                <TooltipItem
                  icon={<Pencil className="text-muted-foreground" size={16} />}
                  label="Edit Products"
                  onClick={enterEditMode}
                />
              </TooltipProvider>

              {/* Bell — desktop only (mobile has it in bottom nav) */}
              <div className="hidden sm:block">
                <Popover>
                  <TooltipProvider delayDuration={250}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <PopoverTrigger asChild>
                          <button className="relative p-2 rounded-full hover:bg-secondary transition-colors duration-200" data-testid="btn-notifications">
                            <Bell className="text-muted-foreground hover:text-foreground transition-colors duration-200 w-[17px] h-[17px]" />
                            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full border border-background" />
                          </button>
                        </PopoverTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="font-medium text-white border-0 px-2 py-1 rounded-md" style={{ background: 'rgba(10,10,16,0.88)', backdropFilter: 'blur(6px)', fontSize: '12px' }}>
                        Notifications
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <PopoverContent className="w-80 p-0 mr-4 mt-2 border-border shadow-xl rounded-xl overflow-hidden glass-panel" align="end">
                    <div className="p-4 border-b border-border/50">
                      <h4 className="font-medium text-sm">Notifications</h4>
                    </div>
                    <div className="divide-y divide-border/50">
                      <div className="p-4 text-sm hover:bg-secondary/50 transition-colors duration-200 cursor-pointer">
                        <p className="font-medium">Low stock alert</p>
                        <p className="text-muted-foreground text-xs mt-1">Salad Bowl (#1013) is running low (15 remaining).</p>
                      </div>
                      <div className="p-4 text-sm hover:bg-secondary/50 transition-colors duration-200 cursor-pointer">
                        <p className="font-medium">System Update</p>
                        <p className="text-muted-foreground text-xs mt-1">POS system successfully updated to v2.4.1.</p>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Edit mode: save + discard */}
            <div className={`flex items-center gap-1 transition-all duration-300 ease-in-out ${isEditMode ? 'opacity-100' : 'opacity-0 pointer-events-none absolute'}`}>
              <button
                onClick={saveEditMode}
                className="p-2 rounded-full bg-primary/15 hover:bg-primary/25 text-primary transition-colors duration-200"
                data-testid="btn-save-edit"
              >
                <Check size={16} />
              </button>
              <button
                onClick={cancelEditMode}
                className="p-2 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors duration-200"
                data-testid="btn-cancel-edit"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </header>

        {/* CATEGORY BAR */}
        <div className={`border-b bg-background shrink-0 overflow-hidden transition-colors duration-400 ${isEditMode ? 'border-primary/20' : 'border-border'}`}>
          <div className="flex items-center px-3 sm:px-4 py-2.5 gap-2 overflow-x-auto scrollbar-none">
            {isEditMode ? (
              <>
                <button
                  onClick={() => setSelectedCategory('All')}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-[13px] sm:text-[15px] font-medium transition-all duration-250 ${selectedCategory === 'All' ? 'text-primary-foreground bg-primary' : 'text-muted-foreground bg-secondary/50'}`}
                >All</button>
                {categories.filter(c => c !== 'All').map(cat => (
                  <div key={cat} className={`shrink-0 flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full border transition-all duration-250 ${selectedCategory === cat ? 'bg-primary/10 border-primary/30' : 'bg-secondary/50 border-border/40'}`}>
                    <input
                      type="text"
                      value={categoryDrafts[cat] ?? cat}
                      onChange={e => setCategoryDrafts(prev => ({ ...prev, [cat]: e.target.value }))}
                      onClick={() => setSelectedCategory(cat)}
                      className="bg-transparent focus:outline-none font-medium text-foreground text-xs min-w-0"
                      style={{ width: `${Math.max((categoryDrafts[cat] ?? cat).length, 3)}ch` }}
                    />
                    <button
                      onClick={() => confirmAction(`Delete category "${cat}"? Products in this category will not be deleted.`, () => deleteCategory(cat))}
                      className="flex items-center justify-center rounded-full bg-muted/80 hover:bg-destructive/20 hover:text-destructive text-muted-foreground transition-colors duration-200 shrink-0"
                      style={{ width: 16, height: 16 }}
                    >
                      <Minus style={{ width: 8, height: 8 }} />
                    </button>
                  </div>
                ))}
              </>
            ) : (
              <>
                {categories.map(cat => {
                  const btn = (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      data-testid={`btn-category-${cat}`}
                      className={`shrink-0 px-3 sm:px-4 py-1.5 rounded-full text-[13px] sm:text-[15px] font-medium transition-all duration-250 ${
                        selectedCategory === cat
                          ? 'text-primary-foreground bg-primary shadow-sm'
                          : 'text-muted-foreground/60 hover:bg-secondary hover:text-foreground/90'
                      }`}
                    >
                      {cat}
                    </button>
                  );
                  if (cat === 'All') return btn;
                  return (
                    <ContextMenu key={cat}>
                      <ContextMenuTrigger asChild>{btn}</ContextMenuTrigger>
                      <ContextMenuContent className="w-52">
                        <ContextMenuItem
                          className="text-destructive focus:text-destructive focus:bg-destructive/10"
                          onSelect={() => {
                            const hasProducts = products.some(p => p.category === cat);
                            if (hasProducts) {
                              toast.error('Category has products. Move or delete them first.');
                              return;
                            }
                            confirmAction(`Are you sure you want to delete this category?`, () => deleteCategory(cat));
                          }}
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete Category
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  );
                })}
                <button
                  onClick={() => setIsAddCategoryModalOpen(true)}
                  className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium text-muted-foreground/50 border border-dashed border-border hover:border-primary hover:text-primary transition-colors duration-250 ml-1 flex items-center gap-1"
                  data-testid="btn-add-category"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* PRODUCT GRID */}
        <ScrollArea className="flex-1">
          {/* 
            Desktop: minmax(clamp(130px,11vw,170px), 1fr) 
            Mobile:  minmax(clamp(100px,28vw,140px), 1fr)  — more compact, fits more
            We use a CSS custom property approach via inline style + CSS var trick.
          */}
          <div
            className="p-2 product-grid"
            style={{ display: 'grid', gap: '6px' }}
          >
            {filteredProducts.map(product => {
              const currentImage = isEditMode ? (editDrafts[product.id]?.image ?? product.image) : product.image;
              const qc = product.quickCode || quickCode(product.name);
              const isTopMatch = product.id === topMatchId;
              const isSelected = selectedIds.has(product.id);
              const cardCommonProps = {
                'data-testid': `card-product-${product.id}`,
                className: `group relative bg-card rounded-xl overflow-hidden transition-all duration-250 ease-in-out flex flex-col ${
                  isEditMode
                    ? 'border border-primary/20 cursor-default'
                    : isSelectMode
                      ? `border-2 ${isSelected ? 'border-primary shadow-[0_0_0_3px_rgba(99,102,241,0.18)]' : 'border-card-border hover:border-primary/40'} cursor-pointer`
                      : `border ${isTopMatch ? 'search-match-card' : 'border-card-border'} hover:-translate-y-0.5 hover:shadow-md cursor-pointer`
                }`,
                onClick: () => {
                  if (isEditMode) return;
                  if (isSelectMode) { toggleSelected(product.id); return; }
                  if (longPressFired.current) { longPressFired.current = false; return; }
                  addToCart(product);
                },
                onTouchStart: (e: React.TouchEvent) => startLongPress(e, () => enterSelectMode(product.id)),
                onTouchMove: cancelLongPress,
                onTouchEnd: cancelLongPress,
                onTouchCancel: cancelLongPress,
              };

              const cardBody = (
                <div {...cardCommonProps}>
                  {/* Image area */}
                  <div className="relative w-full overflow-hidden" style={{ aspectRatio: '1/1' }}>
                    {currentImage ? (
                      <img
                        src={currentImage}
                        alt={product.name}
                        className="w-full h-full object-cover transition-transform duration-400 ease-in-out group-hover:scale-[1.015]"
                      />
                    ) : (
                      <div className="w-full h-full bg-secondary flex items-center justify-center text-xl font-bold text-muted-foreground/30">
                        {renderInitials(product.name)}
                      </div>
                    )}

                    {/* Image upload overlay — edit mode only */}
                    {isEditMode && (
                      <button
                        onClick={e => { e.stopPropagation(); triggerImageUpload(product.id); }}
                        className="img-upload-btn absolute inset-0 flex items-center justify-center transition-all duration-250"
                        title="Change image"
                        aria-label="Change product image"
                      >
                        <span
                          className="img-upload-circle flex items-center justify-center rounded-full transition-all duration-250"
                          style={{ width: 34, height: 34, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)' }}
                        >
                          <Plus style={{ width: 15, height: 15, color: 'rgba(255,255,255,0.96)' }} />
                        </span>
                      </button>
                    )}

                    {/* Quick code badge — lowercase, hyphen-segmented (e.g. Apple Juice → #ap-j) */}
                    {!isEditMode && (
                      <div
                        className={`quick-code-badge absolute top-1.5 left-1.5 flex items-center justify-center rounded-md select-none${activeQuickCodeId === product.id ? ' quick-code-active' : ''}`}
                        title={`Quick code: ${qc}`}
                      >
                        <span className="quick-code-text text-white text-[12px] sm:text-[13px] leading-none">
                          {qc}
                        </span>
                      </div>
                    )}

                    {/* Quick code editor (edit mode only) — overlays the badge slot */}
                    {isEditMode && (
                      <div
                        className="absolute top-1.5 left-1.5 flex items-center font-mono leading-none text-white rounded-md"
                        style={{ background: 'rgba(8,10,18,0.86)', border: '1px solid rgba(255,255,255,0.14)', padding: '3px 6px' }}
                      >
                        <span className="text-[11px] leading-none mr-0.5">#</span>
                        <input
                          type="text"
                          value={editDrafts[product.id]?.quickCode ?? ''}
                          onChange={e => updateDraft(product.id, 'quickCode', e.target.value.toLowerCase().replace(/[^a-z0-9\-]/g, ''))}
                          onClick={e => e.stopPropagation()}
                          maxLength={8}
                          className="bg-transparent focus:outline-none text-white font-mono text-[11px] leading-none"
                          style={{ width: '3.2rem' }}
                        />
                      </div>
                    )}

                    {/* Selection checkbox — selection mode */}
                    {isSelectMode && !isEditMode && (
                      <div
                        className={`absolute top-1.5 right-1.5 flex items-center justify-center rounded-full transition-all duration-200 ${
                          isSelected
                            ? 'bg-primary text-primary-foreground shadow-md'
                            : 'bg-black/55 text-white/85 backdrop-blur-sm border border-white/30'
                        }`}
                        style={{ width: 22, height: 22 }}
                        aria-label={isSelected ? 'Selected' : 'Not selected'}
                      >
                        {isSelected && <Check style={{ width: 13, height: 13 }} strokeWidth={3} />}
                      </div>
                    )}

                    {/* Delete button — edit mode */}
                    {isEditMode && (
                      <button
                        onClick={e => { e.stopPropagation(); confirmAction(`Delete "${product.name}"? This cannot be undone.`, () => deleteProduct(product.id)); }}
                        className="absolute top-1.5 right-1.5 flex items-center justify-center rounded-full text-muted-foreground hover:text-white hover:bg-destructive/80 transition-colors duration-200 backdrop-blur-sm"
                        style={{ width: 22, height: 22, background: 'rgba(0,0,0,0.55)' }}
                        data-testid={`btn-delete-${product.id}`}
                      >
                        <Trash2 style={{ width: 11, height: 11 }} />
                      </button>
                    )}

                    {product.stock <= 0 && (
                      <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                        <span className="text-xs font-medium text-muted-foreground">Out of Stock</span>
                      </div>
                    )}
                  </div>

                  {/* Card info */}
                  {isEditMode ? (
                    <div className="p-1.5 flex flex-col gap-1" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <div className="flex-1 min-w-0">
                          <label className="text-muted-foreground uppercase tracking-wide block mb-0.5" style={{ fontSize: '7px' }}>Price</label>
                          <div className="relative">
                            <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-primary font-bold text-[10px]">$</span>
                            <input
                              type="number"
                              value={editDrafts[product.id]?.price ?? ''}
                              onChange={e => updateDraft(product.id, 'price', e.target.value)}
                              className="w-full bg-secondary/60 border border-border/40 rounded pl-3.5 pr-1 py-0.5 text-primary font-bold focus:border-primary/50 focus:outline-none no-spinners transition-colors duration-200 text-[11px]"
                              step="0.01" min="0"
                            />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <label className="text-muted-foreground uppercase tracking-wide block mb-0.5" style={{ fontSize: '7px' }}>Profit</label>
                          <div className="relative">
                            <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-[10px]">$</span>
                            <input
                              type="number"
                              value={editDrafts[product.id]?.profit ?? ''}
                              onChange={e => updateDraft(product.id, 'profit', e.target.value)}
                              className="w-full bg-secondary/60 border border-border/40 rounded pl-3.5 pr-1 py-0.5 focus:border-primary/50 focus:outline-none no-spinners transition-colors duration-200 text-[11px]"
                              step="0.01" min="0"
                            />
                          </div>
                        </div>
                      </div>
                      <input
                        type="text"
                        value={editDrafts[product.id]?.name ?? ''}
                        onChange={e => updateDraft(product.id, 'name', e.target.value)}
                        className="w-full bg-secondary/60 border border-border/40 rounded px-1.5 py-0.5 font-semibold text-foreground focus:border-primary/50 focus:outline-none transition-colors duration-200 text-[11px]"
                        placeholder="Product name"
                      />
                      <div>
                        <label className="text-muted-foreground uppercase tracking-wide block mb-0.5" style={{ fontSize: '7px' }}>Stock</label>
                        <input
                          type="number"
                          value={editDrafts[product.id]?.stock ?? ''}
                          onChange={e => updateDraft(product.id, 'stock', e.target.value)}
                          className="w-full bg-secondary/60 border border-border/40 rounded px-1.5 py-0.5 focus:border-primary/50 focus:outline-none no-spinners transition-colors duration-200 text-[11px]"
                          min="0"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="p-1.5 sm:p-2 flex flex-col gap-0.5">
                      <Tooltip delayDuration={300}>
                        <TooltipTrigger asChild>
                          <p className="font-semibold truncate leading-snug text-foreground text-[14px] sm:text-[17px] cursor-default">{product.name}</p>
                        </TooltipTrigger>
                        <TooltipContent
                          side="top"
                          sideOffset={6}
                          className="bg-zinc-900/90 text-white border border-zinc-700/60 text-xs rounded-lg px-2.5 py-1.5 max-w-[200px] whitespace-normal backdrop-blur-sm"
                        >
                          {product.name}
                        </TooltipContent>
                      </Tooltip>
                      <p className="font-semibold text-primary leading-none text-[13px] sm:text-[16px]">{fmtCur(product.price)}</p>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-muted-foreground text-[11px] sm:text-[14px] leading-none">Stock: {product.stock}</span>
                        <button
                          disabled={product.stock <= 0}
                          onClick={e => { e.stopPropagation(); addToCart(product); }}
                          className="rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:brightness-110 active:scale-[0.93] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                          style={{ width: 'clamp(26px, 2.8vw, 40px)', height: 'clamp(26px, 2.8vw, 40px)' }}
                          data-testid={`btn-add-${product.id}`}
                        >
                          <ShoppingCart style={{ width: 'clamp(12px, 1.8vw, 24px)', height: 'clamp(12px, 1.8vw, 24px)' }} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );

              if (isEditMode) {
                return <React.Fragment key={product.id}>{cardBody}</React.Fragment>;
              }

              return (
                <ContextMenu key={product.id}>
                  <ContextMenuTrigger asChild>
                    {cardBody}
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-44">
                    <ContextMenuSub>
                      <ContextMenuSubTrigger>
                        <FolderInput className="mr-2 h-3.5 w-3.5" /> Move To
                      </ContextMenuSubTrigger>
                      <ContextMenuSubContent className="w-40">
                        {categories.filter(c => c !== 'All' && c !== product.category).map(c => (
                          <ContextMenuItem key={c} onSelect={() => moveProductToCategory(product.id, c)}>
                            {c}
                          </ContextMenuItem>
                        ))}
                        {categories.filter(c => c !== 'All' && c !== product.category).length === 0 && (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">No other categories</div>
                        )}
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                    <ContextMenuItem onSelect={() => enterSelectMode(product.id)}>
                      <MousePointer className="mr-2 h-3.5 w-3.5" /> Select
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      className="text-destructive focus:text-destructive focus:bg-destructive/10"
                      onSelect={() => confirmAction(`Delete "${product.name}"? This cannot be undone.`, () => deleteProduct(product.id))}
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}

            {filteredProducts.length === 0 && (
              <div className="py-20 flex flex-col items-center justify-center text-muted-foreground" style={{ gridColumn: '1 / -1' }}>
                <Search className="w-12 h-12 mb-4 opacity-20" />
                <p>No products found</p>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* BOTTOM CART STRIP */}
        <div
          onClick={() => setIsCartOpen(!isCartOpen)}
          className={`fixed left-0 sm:left-[60px] right-0 h-14 sm:h-16 glass-panel border-t flex items-center justify-between px-4 sm:px-6 cursor-pointer hover:bg-background/70 transition-colors duration-250 z-20 cart-strip-right${isCartOpen ? ' cart-pushed' : ''}${cartFlash ? ' cart-flash' : ''}`}
          style={{ bottom: 'var(--mobile-nav-height, 0px)' }}
          data-testid="cart-strip"
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-primary/20 text-primary">
              <ShoppingCart className="w-4 h-4" />
            </div>
            <div>
              <p className="font-semibold text-[14px] sm:text-[16px]">Current Order</p>
              <p className="text-muted-foreground text-[12px] sm:text-[14px]">
                <span className="font-mono font-semibold text-foreground">{cartCount}</span> items
              </p>
            </div>
          </div>
          <div className="font-bold text-primary tracking-tight text-xl sm:text-2xl">
            {fmtCur(cartTotal)}
          </div>
        </div>
      </main>

      {/* ── MOBILE BOTTOM NAV (hidden on desktop) ─────────────────────────── */}
      <nav className="mobile-bottom-nav sm:hidden fixed bottom-0 left-0 right-0 h-[60px] bg-sidebar border-t border-border flex items-center justify-around px-2 z-30">
        {/* Home */}
        <MobileNavBtn icon={<Home size={20} />} label="Home" active />

        {/* Analytics */}
        <MobileNavBtn icon={<BarChart2 size={20} />} label="Analytics" onClick={() => setLocation("/analytics")} />

        {/* Add Product — center, prominent */}
        <button
          onClick={() => setLocation("/add-product")}
          className="flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg hover:brightness-110 active:scale-95 transition-all duration-200 -mt-4"
          aria-label="Add Product"
        >
          <Plus size={22} />
        </button>

        {/* Notifications */}
        <Popover>
          <PopoverTrigger asChild>
            <button className="relative flex flex-col items-center justify-center gap-0.5 px-3 py-2 text-muted-foreground" aria-label="Notifications">
              <Bell size={20} />
              <span className="absolute top-1.5 right-2.5 w-2 h-2 bg-primary rounded-full border border-background" />
              <span className="text-[9px]">Alerts</span>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0 mb-2 border-border shadow-xl rounded-xl overflow-hidden glass-panel" align="center" side="top">
            <div className="p-3 border-b border-border/50">
              <h4 className="font-medium text-sm">Notifications</h4>
            </div>
            <div className="divide-y divide-border/50">
              <div className="p-3 text-sm hover:bg-secondary/50 transition-colors duration-200 cursor-pointer">
                <p className="font-medium text-xs">Low stock alert</p>
                <p className="text-muted-foreground text-xs mt-0.5">Salad Bowl (#1013) is running low (15 remaining).</p>
              </div>
              <div className="p-3 text-sm hover:bg-secondary/50 transition-colors duration-200 cursor-pointer">
                <p className="font-medium text-xs">System Update</p>
                <p className="text-muted-foreground text-xs mt-0.5">POS system updated to v2.4.1.</p>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Settings */}
        <div onClick={() => setLocation("/settings")}>
          <MobileNavBtn icon={<Settings size={20} />} label="Settings" />
        </div>
      </nav>

      {/* ── CART PANEL ────────────────────────────────────────────────────── */}

      {/* Mobile backdrop — dim + blur, tap to close, hidden on desktop */}
      <div
        className={`cart-backdrop fixed inset-0 z-40 sm:hidden ${isCartOpen ? 'cart-backdrop-open' : 'cart-backdrop-closed'}`}
        onClick={() => setIsCartOpen(false)}
        aria-hidden
      />

      {/* Cart panel — bottom sheet on mobile, right sidebar on desktop */}
      <aside
        className={`cart-panel fixed z-50 bg-background shadow-2xl flex flex-col
          bottom-0 left-0 right-0 h-[80vh] rounded-t-3xl border-t border-border
          sm:top-0 sm:bottom-0 sm:left-auto sm:right-0 sm:w-[380px] sm:h-auto sm:rounded-none sm:border-t-0 sm:border-l
          ${isCartOpen ? 'cart-panel-open' : 'cart-panel-closed'}`}
        data-testid="cart-sidebar"
      >
        {/* Drag handle pill — mobile only */}
        <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-border/70" />
        </div>

        {/* Header */}
        <div className="h-12 sm:h-16 flex items-center justify-between px-4 border-b border-border shrink-0">
          <h2 className="font-semibold flex items-center gap-2 text-sm sm:text-base">
            <ShoppingCart className="w-4 h-4" /> Cart Items
          </h2>
          <Button variant="ghost" size="icon" onClick={() => setIsCartOpen(false)} className="rounded-full">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Items */}
        <ScrollArea className="flex-1 p-3 sm:p-4">
          <div className="flex flex-col gap-3">
            {cartItems.length === 0 ? (
              <div className="py-20 flex flex-col items-center justify-center text-muted-foreground/50">
                <ShoppingCart className="w-12 h-12 mb-4 opacity-50" />
                <p>No items in cart</p>
              </div>
            ) : (
              cartItems.map(item => (
                <div key={item.product.id} className="flex bg-secondary/30 rounded-xl border border-border/50 overflow-hidden group transition-colors duration-200" data-testid={`cart-item-${item.product.id}`}>
                  {/* IMAGE — edge-to-edge square */}
                  <div className="w-[72px] h-[72px] shrink-0 bg-secondary">
                    {item.product.image
                      ? <img src={item.product.image} alt={item.product.name} className="w-full h-full object-cover block" />
                      : <div className="w-full h-full flex items-center justify-center">
                          <span className="text-xs font-bold text-muted-foreground">{renderInitials(item.product.name)}</span>
                        </div>}
                  </div>
                  {/* CONTENT */}
                  <div className="flex-1 min-w-0 flex flex-col justify-center px-3 py-2.5">
                    <div className="flex justify-between items-start mb-1">
                      <h4 className="font-medium text-sm truncate pr-2">{item.product.name}</h4>
                      <span className="font-semibold text-sm">{fmtCur(item.product.price * item.quantity)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{fmtCur(item.product.price)} / ea</span>
                      <div className="flex items-center bg-background rounded-full border border-border overflow-hidden h-7">
                        <button onClick={() => updateCartQty(item.product.id, item.quantity - 1)} className="px-2 h-full hover:bg-secondary transition-colors duration-200 text-muted-foreground hover:text-foreground" data-testid={`btn-qty-minus-${item.product.id}`}>
                          <Minus className="w-3 h-3" />
                        </button>
                        <input type="number" value={item.quantity} onChange={e => updateCartQty(item.product.id, parseInt(e.target.value) || 0)} className="w-8 h-full bg-transparent text-center text-xs font-medium outline-none no-spinners" />
                        <button onClick={() => updateCartQty(item.product.id, item.quantity + 1)} className="px-2 h-full hover:bg-secondary transition-colors duration-200 text-muted-foreground hover:text-foreground" data-testid={`btn-qty-plus-${item.product.id}`}>
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                  {/* DELETE */}
                  <button onClick={() => removeFromCart(item.product.id)} className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-muted-foreground hover:text-destructive self-center pr-3 pl-1 py-2 shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-background shrink-0 pb-safe">
          <div className="flex justify-between font-bold text-lg mb-4 text-foreground">
            <span>Total</span>
            <span className="text-primary">{fmtCur(cartTotal)}</span>
          </div>
          <Button className="w-full h-12 sm:h-14 text-base sm:text-lg font-bold rounded-xl transition-all duration-200" disabled={cartItems.length === 0} onClick={checkout} data-testid="btn-checkout">
            Checkout
          </Button>
        </div>
      </aside>

      {/* ── ADD CATEGORY MODAL ────────────────────────────────────────────── */}
      <Dialog open={isAddCategoryModalOpen} onOpenChange={setIsAddCategoryModalOpen}>
        <DialogContent className="sm:max-w-[325px] glass-panel border-border/50">
          <DialogHeader><DialogTitle>Add Category</DialogTitle></DialogHeader>
          <form onSubmit={handleAddCategory}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="cat-name">Category Name</Label>
                <Input id="cat-name" name="name" required placeholder="e.g. Merch" className="bg-background/50" />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" className="w-full">Create Category</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── DELETE CONFIRM MODAL ──────────────────────────────────────────── */}
      <ConfirmModal
        open={deleteConfirm.open}
        title="Are you sure?"
        message={deleteConfirm.message}
        icon={<Trash2 className="w-4 h-4 text-destructive" />}
        confirmLabel="Delete"
        confirmVariant="destructive"
        onCancel={() => setDeleteConfirm(d => ({ ...d, open: false }))}
        onConfirm={() => { deleteConfirm.onConfirm(); setDeleteConfirm(d => ({ ...d, open: false })); }}
      />

      {/* ── EXIT CONFIRM MODAL ───────────────────────────────────────────── */}
      <ConfirmModal
        open={exitConfirm}
        title="Exit application?"
        message="Close the POS system and leave this page?"
        icon={<LogOut className="w-4 h-4 text-destructive" />}
        confirmLabel="Exit"
        confirmVariant="destructive"
        onCancel={() => setExitConfirm(false)}
        onConfirm={() => {
          setExitConfirm(false);
          try { window.close(); } catch {}
          setTimeout(() => { try { window.location.href = 'about:blank'; } catch {} }, 80);
        }}
      />

      <style>{`
        /* ── CSS custom property for bottom offset ── */
        :root { --mobile-nav-height: 0px; }
        @media (max-width: 639px) { :root { --mobile-nav-height: 60px; } }

        /* ── Cart panel slide transforms ── */
        .cart-panel {
          will-change: transform;
          /* Mobile open: calm, gradual rise */
          transition: transform 460ms cubic-bezier(0.22, 0.61, 0.36, 1);
        }
        .cart-panel.cart-panel-closed {
          /* Mobile close: slightly quicker, soft ease-in */
          transition: transform 320ms cubic-bezier(0.4, 0, 0.6, 1);
        }
        /* Mobile: slide up from bottom */
        .cart-panel-closed { transform: translateY(100%); }
        .cart-panel-open   { transform: translateY(0); }
        /* Desktop: slide in from right (keep original snappier feel) */
        @media (min-width: 640px) {
          .cart-panel,
          .cart-panel.cart-panel-closed {
            transition: transform 320ms cubic-bezier(0.32, 0.72, 0, 1);
          }
          .cart-panel-closed { transform: translateX(100%); }
          .cart-panel-open   { transform: translateX(0); }
        }

        /* ── Mobile cart backdrop: gradual dim + blur ── */
        .cart-backdrop {
          background: rgba(0, 0, 0, 0.35);
          -webkit-backdrop-filter: blur(3px);
          backdrop-filter: blur(3px);
          transition: opacity 460ms cubic-bezier(0.22, 0.61, 0.36, 1);
          will-change: opacity;
        }
        .cart-backdrop-open {
          opacity: 1;
          pointer-events: auto;
        }
        .cart-backdrop-closed {
          opacity: 0;
          pointer-events: none;
          transition: opacity 320ms cubic-bezier(0.4, 0, 0.6, 1);
        }

        /* ── Desktop-only push when cart is open ── */
        .cart-strip-right {
          right: 0;
          transition: right 320ms cubic-bezier(0.32, 0.72, 0, 1);
        }
        @media (min-width: 640px) {
          .cart-strip-right.cart-pushed { right: 380px; }
          .main-cart-pushed { margin-right: 380px; }
        }

        /* ── Product grid columns ── */
        .product-grid {
          grid-template-columns: repeat(auto-fill, minmax(clamp(150px, 11vw, 200px), 1fr));
        }
        @media (max-width: 639px) {
          .product-grid {
            grid-template-columns: repeat(auto-fill, minmax(clamp(100px, 28vw, 130px), 1fr));
          }
        }

        /* ── Image upload overlay: hover on desktop, always visible on touch ── */
        .img-upload-btn {
          opacity: 0;
          background: rgba(0,0,0,0);
        }
        .img-upload-btn:hover {
          opacity: 1;
          background: rgba(0,0,0,0.18);
        }
        .img-upload-btn:hover .img-upload-circle {
          background: rgba(0,0,0,0.60) !important;
          transform: scale(1.08);
        }
        .img-upload-circle {
          transition: background 220ms ease, transform 200ms ease;
        }
        /* On touch devices: always show (no hover available) */
        @media (hover: none) {
          .img-upload-btn {
            opacity: 1;
            background: rgba(0,0,0,0.12);
          }
        }
        /* On mobile breakpoint: always show, regardless of hover capability */
        @media (max-width: 639px) {
          .img-upload-btn {
            opacity: 1;
            background: rgba(0,0,0,0.12);
          }
        }

        /* ── Scroll area: account for both strips on mobile ── */
        @media (max-width: 639px) {
          [data-radix-scroll-area-viewport] > div {
            padding-bottom: 132px !important;
          }
        }
        @media (min-width: 640px) {
          [data-radix-scroll-area-viewport] > div {
            padding-bottom: 80px !important;
          }
        }

        /* ── Hide spinners ── */
        .no-spinners::-webkit-outer-spin-button,
        .no-spinners::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .no-spinners { -moz-appearance: textfield; }

        /* ── Modal animations ── */
        .modal-backdrop {
          animation: backdrop-in 220ms cubic-bezier(0.4,0,0.2,1) both;
          background: rgba(0,0,0,0.48);
          backdrop-filter: blur(3px);
        }
        @keyframes backdrop-in { from { opacity: 0; } to { opacity: 1; } }
        .modal-content { animation: modal-in 240ms cubic-bezier(0.34,1.2,0.64,1) both; }
        @keyframes modal-in {
          from { opacity: 0; transform: scale(0.96) translateY(6px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        [data-radix-dialog-overlay] { animation: backdrop-in 200ms ease both !important; }
        [data-radix-dialog-content] { animation: modal-in 220ms cubic-bezier(0.34,1.1,0.64,1) both !important; }

        /* ── Quick code badge: high contrast pill, readable over any image ── */
        .quick-code-badge {
          padding: 3px 8px;
          background: rgba(8, 10, 18, 0.86);
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 6px;
          box-shadow:
            0 1px 0 rgba(255, 255, 255, 0.08) inset,
            0 2px 6px rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(10px) saturate(140%);
          -webkit-backdrop-filter: blur(10px) saturate(140%);
          transition: transform 220ms cubic-bezier(0.34, 1.4, 0.64, 1),
                      background 220ms ease, box-shadow 220ms ease;
        }
        .quick-code-text {
          font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
          font-weight: 700;
          letter-spacing: 0.06em;
          color: #ffffff;
          text-shadow:
            0 1px 2px rgba(0, 0, 0, 0.7),
            0 0 1px rgba(0, 0, 0, 0.6);
          font-feature-settings: "tnum" 1, "ss01" 1;
        }
        /* Soft blue micro-feedback when product is added to cart */
        @keyframes quick-code-active-anim {
          0%   { opacity: 0.85; }
          50%  { opacity: 1; }
          100% { opacity: 0.95; }
        }
        .quick-code-active {
          background: rgba(59, 110, 165, 0.78);
          border-color: rgba(120, 165, 210, 0.45);
          box-shadow:
            0 0 0 1px rgba(80, 130, 185, 0.28) inset,
            0 1px 0 rgba(255, 255, 255, 0.12) inset;
          animation: quick-code-active-anim 180ms ease-out;
        }
        .quick-code-active .quick-code-text {
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
        }

        /* ── Top search match: subtle golden highlight (premium, no harsh glow) ── */
        .search-match-card {
          border-color: rgba(212, 175, 90, 0.55) !important;
          background:
            linear-gradient(180deg, rgba(212, 175, 90, 0.10), rgba(212, 175, 90, 0.04)) ,
            hsl(var(--card));
          box-shadow:
            0 0 0 1px rgba(212, 175, 90, 0.22),
            0 4px 18px rgba(212, 175, 90, 0.08);
          transition: background 220ms ease, box-shadow 220ms ease, border-color 220ms ease, transform 220ms ease;
        }
        .search-match-card:hover {
          transform: translateY(-1px);
          box-shadow:
            0 0 0 1px rgba(212, 175, 90, 0.32),
            0 6px 22px rgba(212, 175, 90, 0.12);
        }

        /* ── Autofill: keep dark-UI palette (no yellow/blue browser tint) ── */
        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus,
        input:-webkit-autofill:active,
        textarea:-webkit-autofill,
        select:-webkit-autofill {
          -webkit-text-fill-color: hsl(var(--foreground)) !important;
          -webkit-box-shadow: 0 0 0 1000px hsl(var(--secondary) / 0.55) inset !important;
          box-shadow: 0 0 0 1000px hsl(var(--secondary) / 0.55) inset !important;
          caret-color: hsl(var(--foreground));
          transition: background-color 9999s ease-in-out 0s;
        }

        /* ── Cart flash ── */
        @keyframes cart-flash-anim {
          0%   { background-color: transparent; }
          25%  { background-color: rgba(99,102,241,0.08); }
          100% { background-color: transparent; }
        }
        .cart-flash { animation: cart-flash-anim 700ms cubic-bezier(0.4,0,0.2,1); }
      `}</style>
    </div>
  );
}

// ── Desktop sidebar tooltip button ───────────────────────────────────────────
function TooltipItem({ icon, label, active = false, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className={`relative p-3 rounded-xl transition-all duration-250 ease-in-out group ${active ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}
        >
          {icon}
          {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-r-md" />}
          <div className="absolute inset-0 rounded-xl bg-primary/0 group-hover:bg-primary/5 transition-colors duration-250" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="ml-2 font-medium text-white border-0 px-2 py-1 rounded-md" style={{ background: 'rgba(10,10,16,0.88)', backdropFilter: 'blur(6px)', fontSize: '12px' }}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

// ── Mobile bottom nav button ──────────────────────────────────────────────────
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

// ── Reusable Confirm Modal (Enter to confirm, Esc to cancel, fade+scale) ────
function ConfirmModal({
  open, title, message, icon, confirmLabel, confirmVariant = 'destructive',
  onConfirm, onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  icon?: React.ReactNode;
  confirmLabel: string;
  confirmVariant?: 'default' | 'destructive';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onConfirm(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onConfirm, onCancel]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 flex items-center justify-center z-[200] modal-backdrop" onClick={onCancel}>
      <div className="bg-card border border-border rounded-2xl p-6 w-80 shadow-2xl modal-content" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-3">
          {icon && (
            <div className="w-9 h-9 rounded-full bg-destructive/15 flex items-center justify-center shrink-0">
              {icon}
            </div>
          )}
          <h3 className="font-semibold text-foreground">{title}</h3>
        </div>
        <p className="text-muted-foreground text-sm mb-6 leading-relaxed">{message}</p>
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onCancel}>Cancel</Button>
          <Button variant={confirmVariant} className="flex-1" onClick={onConfirm} autoFocus>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
