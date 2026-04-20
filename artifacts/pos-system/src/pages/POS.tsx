import React, { useState, useMemo, useEffect, useRef } from "react";
import { 
  Home, BarChart2, Plus, Pencil, Settings, Search, X, Bell, 
  ShoppingCart, Trash2, Minus, Check, ChevronDown 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Types
type Category = string;

type Product = {
  id: string;
  code: string;
  name: string;
  price: number;
  category: Category;
  stock: number;
  image?: string;
};

type CartItem = {
  product: Product;
  quantity: number;
};

// Initial Data
const INITIAL_CATEGORIES: Category[] = ["All", "Drinks", "Snacks", "Electronics", "Clothing", "Food"];

const INITIAL_PRODUCTS: Product[] = [
  { id: "1", code: "#1001", name: "Espresso", price: 3.50, category: "Drinks", stock: 50, image: "/images/espresso.png" },
  { id: "2", code: "#1002", name: "Latte", price: 4.50, category: "Drinks", stock: 45, image: "/images/latte.png" },
  { id: "3", code: "#1003", name: "Cappuccino", price: 4.00, category: "Drinks", stock: 30, image: "/images/cappuccino.png" },
  { id: "4", code: "#1004", name: "Trail Mix", price: 2.99, category: "Snacks", stock: 100, image: "/images/trail-mix.png" },
  { id: "5", code: "#1005", name: "Granola Bar", price: 1.99, category: "Snacks", stock: 200, image: "/images/granola-bar.png" },
  { id: "6", code: "#1006", name: "Chips Pack", price: 1.49, category: "Snacks", stock: 150 },
  { id: "7", code: "#1007", name: "Wireless Earbuds", price: 29.99, category: "Electronics", stock: 20, image: "/images/earbuds.png" },
  { id: "8", code: "#1008", name: "USB Cable", price: 9.99, category: "Electronics", stock: 75, image: "/images/usb-cable.png" },
  { id: "9", code: "#1009", name: "Phone Stand", price: 14.99, category: "Electronics", stock: 40, image: "/images/phone-stand.png" },
  { id: "10", code: "#1010", name: "T-Shirt", price: 19.99, category: "Clothing", stock: 60 },
  { id: "11", code: "#1011", name: "Cap", price: 12.99, category: "Clothing", stock: 80 },
  { id: "12", code: "#1012", name: "Sandwich", price: 6.99, category: "Food", stock: 25 },
  { id: "13", code: "#1013", name: "Salad Bowl", price: 8.99, category: "Food", stock: 15 },
];

export default function POS() {
  // State
  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [categories, setCategories] = useState<Category[]>(INITIAL_CATEGORIES);
  const [selectedCategory, setSelectedCategory] = useState<Category>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);
  const [isAddCategoryModalOpen, setIsAddCategoryModalOpen] = useState(false);
  const [cartFlash, setCartFlash] = useState(false);

  // Edit mode
  type EditDraft = { name: string; price: string; stock: string; code: string; profit: string };
  const [isEditMode, setIsEditMode] = useState(false);
  const [editDrafts, setEditDrafts] = useState<Record<string, EditDraft>>({});
  const [savedProducts, setSavedProducts] = useState<Product[]>([]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Derived state
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesCat = selectedCategory === "All" || p.category === selectedCategory;
      const matchesSearch = 
        p.name.toLowerCase().includes(debouncedSearch.toLowerCase()) || 
        p.code.toLowerCase().includes(debouncedSearch.toLowerCase());
      return matchesCat && matchesSearch;
    });
  }, [products, selectedCategory, debouncedSearch]);

  const cartTotal = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  }, [cartItems]);

  const cartCount = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + item.quantity, 0);
  }, [cartItems]);

  // Actions
  const addToCart = (product: Product) => {
    if (product.stock <= 0) {
      toast.error("Out of stock!");
      return;
    }

    setProducts(prev => prev.map(p => 
      p.id === product.id ? { ...p, stock: p.stock - 1 } : p
    ));

    setCartItems(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item => 
          item.product.id === product.id 
            ? { ...item, quantity: item.quantity + 1 } 
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });

    setCartFlash(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setCartFlash(true);
        setTimeout(() => setCartFlash(false), 540);
      });
    });
  };

  const enterEditMode = () => {
    setSavedProducts(products);
    const drafts: Record<string, EditDraft> = {};
    products.forEach(p => {
      drafts[p.id] = { name: p.name, price: String(p.price), stock: String(p.stock), code: p.code, profit: '0' };
    });
    setEditDrafts(drafts);
    setIsEditMode(true);
  };

  const saveEditMode = () => {
    setProducts(prev => prev.map(p => {
      const d = editDrafts[p.id];
      if (!d) return p;
      return {
        ...p,
        name: d.name.trim() || p.name,
        price: parseFloat(d.price) || p.price,
        stock: parseInt(d.stock, 10) >= 0 ? parseInt(d.stock, 10) : p.stock,
        code: d.code.trim() || p.code,
      };
    }));
    setIsEditMode(false);
    toast.success('Changes saved');
  };

  const cancelEditMode = () => {
    setProducts(savedProducts);
    setIsEditMode(false);
    toast.info('Changes discarded');
  };

  const updateDraft = (id: string, field: keyof EditDraft, value: string) => {
    setEditDrafts(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const updateCartQty = (productId: string, newQty: number) => {
    const item = cartItems.find(i => i.product.id === productId);
    if (!item) return;

    const diff = newQty - item.quantity;
    const product = products.find(p => p.id === productId);
    
    if (product && product.stock < diff) {
      toast.error("Not enough stock!");
      return;
    }

    if (newQty <= 0) {
      removeFromCart(productId);
      return;
    }

    setProducts(prev => prev.map(p => 
      p.id === productId ? { ...p, stock: p.stock - diff } : p
    ));

    setCartItems(prev => prev.map(i => 
      i.product.id === productId ? { ...i, quantity: newQty } : i
    ));
  };

  const removeFromCart = (productId: string) => {
    const item = cartItems.find(i => i.product.id === productId);
    if (!item) return;

    setProducts(prev => prev.map(p => 
      p.id === productId ? { ...p, stock: p.stock + item.quantity } : p
    ));

    setCartItems(prev => prev.filter(i => i.product.id !== productId));
  };

  const checkout = () => {
    if (cartItems.length === 0) return;
    setCartItems([]);
    setIsCartOpen(false);
    toast.success("Checkout successful!", {
      icon: <Check className="text-green-500" />
    });
  };

  const handleAddProduct = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = fd.get("name") as string;
    const price = parseFloat(fd.get("price") as string);
    const cat = fd.get("category") as string;
    const stock = parseInt(fd.get("stock") as string, 10);
    const code = `#${1000 + products.length + 1}`;

    const newProduct: Product = {
      id: Math.random().toString(36).substr(2, 9),
      name,
      price,
      category: cat,
      stock,
      code
    };

    setProducts(prev => [...prev, newProduct]);
    setIsAddProductModalOpen(false);
    toast.success(`Added ${name}`);
  };

  const handleAddCategory = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = fd.get("name") as string;
    if (name && !categories.includes(name)) {
      setCategories(prev => [...prev, name]);
    }
    setIsAddCategoryModalOpen(false);
  };

  // Render Helpers
  const renderInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground dark">
      {/* LEFT SIDEBAR */}
      <aside className="w-[60px] shrink-0 border-r border-border bg-sidebar flex flex-col items-center py-4 z-20">
        <div className="flex flex-col gap-6">
          <TooltipProvider delayDuration={100}>
            <TooltipItem icon={<Home style={{ width: 'clamp(17px, 1.5vw, 22px)', height: 'clamp(17px, 1.5vw, 22px)' }} />} label="Home" active />
            <TooltipItem icon={<BarChart2 style={{ width: 'clamp(17px, 1.5vw, 22px)', height: 'clamp(17px, 1.5vw, 22px)' }} />} label="Analytics" />
            <div onClick={() => setIsAddProductModalOpen(true)}>
              <TooltipItem icon={<Plus style={{ width: 'clamp(17px, 1.5vw, 22px)', height: 'clamp(17px, 1.5vw, 22px)' }} />} label="Add Product" />
            </div>
            <TooltipItem icon={<Settings style={{ width: 'clamp(17px, 1.5vw, 22px)', height: 'clamp(17px, 1.5vw, 22px)' }} />} label="Settings" />
          </TooltipProvider>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col min-w-0 transition-all duration-200" style={{ marginRight: isCartOpen ? '380px' : '0' }}>
        
        {/* TOP BAR */}
        <header className={`h-16 border-b flex items-center justify-between px-6 shrink-0 backdrop-blur-sm z-10 sticky top-0 transition-colors duration-300 ${isEditMode ? 'border-primary/25 bg-primary/5' : 'border-border bg-background/80'}`}>
          <div className="relative w-full max-w-xl group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" style={{ width: 'clamp(13px, 1.1vw, 17px)', height: 'clamp(13px, 1.1vw, 17px)' }} />
            <input
              type="text"
              placeholder="Search products or enter #code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-input/50 border border-transparent focus:border-ring/50 focus:ring-1 focus:ring-ring/20 rounded-full py-2 pl-10 pr-10 outline-none transition-all placeholder:text-muted-foreground"
              style={{ fontSize: 'clamp(12px, 1.1vw, 14px)' }}
              data-testid="input-search"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 ml-4">
            {/* Edit mode indicator badge */}
            <div className={`overflow-hidden transition-all duration-200 ${isEditMode ? 'max-w-[100px] opacity-100 mr-2' : 'max-w-0 opacity-0'}`}>
              <span className="text-primary font-semibold tracking-widest uppercase whitespace-nowrap" style={{ fontSize: '10px', letterSpacing: '0.1em' }}>● Editing</span>
            </div>

            {/* Normal mode: Pencil + Bell — fades out in edit mode */}
            <div className={`flex items-center gap-2 transition-all duration-200 ${isEditMode ? 'opacity-0 pointer-events-none absolute' : 'opacity-100'}`}>
              <TooltipProvider delayDuration={100}>
                <TooltipItem
                  icon={<Pencil className="text-muted-foreground" style={{ width: 'clamp(13px, 1.1vw, 17px)', height: 'clamp(13px, 1.1vw, 17px)' }} />}
                  label="Edit Products"
                  onClick={enterEditMode}
                />
              </TooltipProvider>
              <Popover>
                <TooltipProvider delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <PopoverTrigger asChild>
                        <button className="relative p-2 rounded-full hover:bg-secondary transition-colors" data-testid="btn-notifications">
                          <Bell className="text-muted-foreground hover:text-foreground transition-colors" style={{ width: 'clamp(14px, 1.2vw, 19px)', height: 'clamp(14px, 1.2vw, 19px)' }} />
                          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full border border-background"></span>
                        </button>
                      </PopoverTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="font-medium text-white border-0 px-2 py-1 rounded-md" style={{ background: 'rgba(10,10,16,0.88)', backdropFilter: 'blur(6px)', fontSize: 'clamp(10px, 0.85vw, 13px)' }}>
                      Notifications
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <PopoverContent className="w-80 p-0 mr-4 mt-2 border-border shadow-xl rounded-xl overflow-hidden glass-panel" align="end">
                  <div className="p-4 border-b border-border/50">
                    <h4 className="font-medium text-sm">Notifications</h4>
                  </div>
                  <div className="divide-y divide-border/50">
                    <div className="p-4 text-sm hover:bg-secondary/50 transition-colors cursor-pointer">
                      <p className="font-medium">Low stock alert</p>
                      <p className="text-muted-foreground text-xs mt-1">Salad Bowl (#1013) is running low (15 remaining).</p>
                    </div>
                    <div className="p-4 text-sm hover:bg-secondary/50 transition-colors cursor-pointer">
                      <p className="font-medium">System Update</p>
                      <p className="text-muted-foreground text-xs mt-1">POS system successfully updated to v2.4.1.</p>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Edit mode: Check (save) + X (discard) — fades in during edit mode */}
            <div className={`flex items-center gap-2 transition-all duration-200 ${isEditMode ? 'opacity-100' : 'opacity-0 pointer-events-none absolute'}`}>
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={saveEditMode}
                      className="p-2 rounded-full bg-primary/15 hover:bg-primary/25 text-primary transition-colors"
                      data-testid="btn-save-edit"
                    >
                      <Check style={{ width: 'clamp(14px, 1.2vw, 18px)', height: 'clamp(14px, 1.2vw, 18px)' }} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="font-medium text-white border-0 px-2 py-1 rounded-md" style={{ background: 'rgba(10,10,16,0.88)', backdropFilter: 'blur(6px)', fontSize: 'clamp(10px, 0.85vw, 13px)' }}>
                    Save changes
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={cancelEditMode}
                      className="p-2 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                      data-testid="btn-cancel-edit"
                    >
                      <X style={{ width: 'clamp(14px, 1.2vw, 18px)', height: 'clamp(14px, 1.2vw, 18px)' }} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="font-medium text-white border-0 px-2 py-1 rounded-md" style={{ background: 'rgba(10,10,16,0.88)', backdropFilter: 'blur(6px)', fontSize: 'clamp(10px, 0.85vw, 13px)' }}>
                    Discard changes
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </header>

        {/* CATEGORY BAR */}
        <div className="border-b border-border bg-background shrink-0 overflow-hidden">
          <div className="flex items-center p-4 gap-2 overflow-x-auto scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                data-testid={`btn-category-${cat}`}
                className={`shrink-0 px-4 py-1.5 rounded-full font-medium transition-all duration-200 relative ${
                  selectedCategory === cat 
                    ? "text-primary-foreground bg-primary shadow-sm" 
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
                style={{ fontSize: 'clamp(11px, 1vw, 14px)' }}
              >
                {cat}
              </button>
            ))}
            <button 
              onClick={() => setIsAddCategoryModalOpen(true)}
              className="shrink-0 px-3 py-1.5 rounded-full text-sm font-medium text-muted-foreground border border-dashed border-border hover:border-primary hover:text-primary transition-colors ml-2 flex items-center gap-1"
              data-testid="btn-add-category"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* PRODUCT GRID */}
        <ScrollArea className="flex-1 pb-20">
          <div className="p-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(clamp(130px, 11vw, 170px), 1fr))', gap: '8px' }}>
            {filteredProducts.map(product => (
              <div 
                key={product.id} 
                className={`group relative bg-card rounded-xl overflow-hidden transition-all duration-200 flex flex-col ${isEditMode ? 'border border-primary/20 cursor-default' : 'border border-card-border hover:-translate-y-0.5 hover:shadow-sm cursor-pointer'}`}
                data-testid={`card-product-${product.id}`}
              >
                {/* Image with code overlay */}
                <div className="relative w-full overflow-hidden" style={{ aspectRatio: '1/1' }}>
                  {product.image ? (
                    <img 
                      src={product.image} 
                      alt={product.name} 
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full bg-secondary flex items-center justify-center text-2xl font-bold text-muted-foreground/30">
                      {renderInitials(product.name)}
                    </div>
                  )}
                  {isEditMode ? (
                    <input
                      type="text"
                      value={editDrafts[product.id]?.code ?? product.code}
                      onChange={(e) => updateDraft(product.id, 'code', e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute top-1.5 left-1.5 font-mono font-semibold leading-none text-white rounded-md focus:outline-none focus:ring-1 focus:ring-primary/60 no-spinners"
                      style={{ fontSize: 'clamp(10px, 0.82vw, 12px)', background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(6px)', padding: '2px 6px', width: '5rem' }}
                    />
                  ) : (
                    <span
                      className="absolute top-1.5 left-1.5 font-mono font-semibold leading-none text-white px-1.5 py-0.5 rounded-md"
                      style={{ fontSize: 'clamp(10px, 0.82vw, 12px)', background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(6px)', boxShadow: '0 1px 4px rgba(0,0,0,0.6)', textShadow: '0 1px 2px rgba(0,0,0,1)' }}
                    >
                      {product.code}
                    </span>
                  )}
                  {product.stock <= 0 && (
                    <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                      <span className="text-xs font-medium text-muted-foreground">Out of Stock</span>
                    </div>
                  )}
                </div>

                {/* Card info */}
                {isEditMode ? (
                  <div className="p-2 flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {/* Price + Profit row */}
                    <div className="flex gap-1">
                      <div className="flex-1 min-w-0">
                        <label className="text-muted-foreground uppercase tracking-wide block mb-0.5" style={{ fontSize: '8px' }}>Price</label>
                        <div className="relative">
                          <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-primary font-bold" style={{ fontSize: '10px' }}>$</span>
                          <input
                            type="number"
                            value={editDrafts[product.id]?.price ?? ''}
                            onChange={(e) => updateDraft(product.id, 'price', e.target.value)}
                            className="w-full bg-secondary/60 border border-border/40 rounded pl-4 pr-1 py-0.5 text-primary font-bold focus:border-primary/50 focus:outline-none no-spinners"
                            style={{ fontSize: 'clamp(11px, 0.95vw, 13px)' }}
                            step="0.01" min="0"
                          />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <label className="text-muted-foreground uppercase tracking-wide block mb-0.5" style={{ fontSize: '8px' }}>Profit</label>
                        <div className="relative">
                          <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-muted-foreground font-bold" style={{ fontSize: '10px' }}>$</span>
                          <input
                            type="number"
                            value={editDrafts[product.id]?.profit ?? ''}
                            onChange={(e) => updateDraft(product.id, 'profit', e.target.value)}
                            className="w-full bg-secondary/60 border border-border/40 rounded pl-4 pr-1 py-0.5 focus:border-primary/50 focus:outline-none no-spinners"
                            style={{ fontSize: 'clamp(11px, 0.95vw, 13px)' }}
                            step="0.01" min="0"
                          />
                        </div>
                      </div>
                    </div>
                    {/* Name */}
                    <input
                      type="text"
                      value={editDrafts[product.id]?.name ?? ''}
                      onChange={(e) => updateDraft(product.id, 'name', e.target.value)}
                      className="w-full bg-secondary/60 border border-border/40 rounded px-1.5 py-0.5 font-semibold text-foreground focus:border-primary/50 focus:outline-none"
                      style={{ fontSize: 'clamp(11px, 0.95vw, 13px)' }}
                      placeholder="Product name"
                    />
                    {/* Stock */}
                    <div>
                      <label className="text-muted-foreground uppercase tracking-wide block mb-0.5" style={{ fontSize: '8px' }}>Stock</label>
                      <input
                        type="number"
                        value={editDrafts[product.id]?.stock ?? ''}
                        onChange={(e) => updateDraft(product.id, 'stock', e.target.value)}
                        className="w-full bg-secondary/60 border border-border/40 rounded px-1.5 py-0.5 focus:border-primary/50 focus:outline-none no-spinners"
                        style={{ fontSize: 'clamp(11px, 0.95vw, 13px)' }}
                        min="0"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="p-2 flex flex-col gap-0.5">
                    <p className="font-bold text-primary leading-none" style={{ fontSize: 'clamp(13px, 1.15vw, 17px)' }}>${product.price.toFixed(2)}</p>
                    <p className="font-semibold truncate leading-snug text-foreground" style={{ fontSize: 'clamp(11px, 0.95vw, 14px)' }}>{product.name}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-muted-foreground leading-none" style={{ fontSize: 'clamp(9px, 0.72vw, 11px)' }}>Stock: {product.stock}</span>
                      <button
                        disabled={product.stock <= 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          const btn = e.currentTarget;
                          btn.classList.add("btn-pulse");
                          setTimeout(() => btn.classList.remove("btn-pulse"), 300);
                          addToCart(product);
                        }}
                        className="rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:brightness-105 active:scale-95 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                        style={{ width: 'clamp(30px, 2.4vw, 38px)', height: 'clamp(30px, 2.4vw, 38px)' }}
                        data-testid={`btn-add-${product.id}`}
                      >
                        <ShoppingCart style={{ width: 'clamp(15px, 1.3vw, 20px)', height: 'clamp(15px, 1.3vw, 20px)' }} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
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
          className={`fixed bottom-0 right-0 left-[60px] h-16 glass-panel border-t flex items-center justify-between px-6 cursor-pointer hover:bg-background/80 transition-colors z-20${cartFlash ? ' cart-flash' : ''}`}
          style={{ right: isCartOpen ? '380px' : '0', transition: 'right 200ms ease' }}
          data-testid="cart-strip"
        >
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/20 text-primary">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold" style={{ fontSize: 'clamp(13px, 1.1vw, 16px)' }}>Current Order</p>
              <p className="text-muted-foreground flex items-center gap-1" style={{ fontSize: 'clamp(11px, 0.95vw, 14px)' }}>
                <span className="font-mono font-semibold text-foreground">{cartCount}</span> items
              </p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="font-bold text-primary tracking-tight" style={{ fontSize: 'clamp(18px, 1.7vw, 24px)' }}>
              ${cartTotal.toFixed(2)}
            </div>
          </div>
        </div>
      </main>

      {/* RIGHT SLIDE-IN CART PANEL */}
      <aside 
        className={`fixed top-0 bottom-0 right-0 w-full sm:w-[380px] bg-background border-l border-border shadow-2xl z-30 flex flex-col transition-transform duration-200 ease-out`}
        style={{ transform: isCartOpen ? 'translateX(0)' : 'translateX(100%)' }}
        data-testid="cart-sidebar"
      >
        <div className="h-16 flex items-center justify-between px-4 border-b border-border shrink-0">
          <h2 className="font-semibold flex items-center gap-2">
            <ShoppingCart className="w-4 h-4" />
            Cart Items
          </h2>
          <Button variant="ghost" size="icon" onClick={() => setIsCartOpen(false)} className="rounded-full">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1 p-4">
          <div className="flex flex-col gap-3">
            {cartItems.length === 0 ? (
              <div className="py-20 flex flex-col items-center justify-center text-muted-foreground/50">
                <ShoppingCart className="w-12 h-12 mb-4 opacity-50" />
                <p>No items in cart</p>
              </div>
            ) : (
              cartItems.map((item) => (
                <div key={item.product.id} className="flex gap-3 bg-secondary/30 p-3 rounded-xl border border-border/50 group" data-testid={`cart-item-${item.product.id}`}>
                  <div className="w-12 h-12 rounded-lg bg-secondary overflow-hidden shrink-0 flex items-center justify-center">
                    {item.product.image ? (
                      <img src={item.product.image} alt={item.product.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs font-bold text-muted-foreground">{renderInitials(item.product.name)}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <div className="flex justify-between items-start mb-1">
                      <h4 className="font-medium text-sm truncate pr-2">{item.product.name}</h4>
                      <span className="font-semibold text-sm">${(item.product.price * item.quantity).toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between mt-auto">
                      <span className="text-xs text-muted-foreground">${item.product.price.toFixed(2)} / ea</span>
                      <div className="flex items-center bg-background rounded-full border border-border overflow-hidden h-7">
                        <button 
                          onClick={() => updateCartQty(item.product.id, item.quantity - 1)}
                          className="px-2 h-full hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                          data-testid={`btn-qty-minus-${item.product.id}`}
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <input 
                          type="number" 
                          value={item.quantity}
                          onChange={(e) => updateCartQty(item.product.id, parseInt(e.target.value) || 0)}
                          className="w-8 h-full bg-transparent text-center text-xs font-medium outline-none no-spinners"
                        />
                        <button 
                          onClick={() => updateCartQty(item.product.id, item.quantity + 1)}
                          className="px-2 h-full hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                          data-testid={`btn-qty-plus-${item.product.id}`}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => removeFromCart(item.product.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive self-center p-2"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        <div className="p-4 border-t border-border bg-background shrink-0 pb-safe">
          <div className="flex justify-between font-bold text-lg mb-6 text-foreground">
            <span>Total</span>
            <span className="text-primary">${cartTotal.toFixed(2)}</span>
          </div>
          <Button 
            className="w-full h-14 text-lg font-bold rounded-xl"
            disabled={cartItems.length === 0}
            onClick={checkout}
            data-testid="btn-checkout"
          >
            Checkout
          </Button>
        </div>
      </aside>

      {/* ADD PRODUCT MODAL */}
      <Dialog open={isAddProductModalOpen} onOpenChange={setIsAddProductModalOpen}>
        <DialogContent className="sm:max-w-[425px] glass-panel border-border/50">
          <DialogHeader>
            <DialogTitle>Add New Product</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddProduct}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Product Name</Label>
                <Input id="name" name="name" required placeholder="e.g. Avocado Wrap" className="bg-background/50" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="price">Price ($)</Label>
                  <Input id="price" name="price" type="number" step="0.01" min="0" required placeholder="0.00" className="bg-background/50" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="stock">Initial Stock</Label>
                  <Input id="stock" name="stock" type="number" min="0" required placeholder="100" className="bg-background/50" />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="category">Category</Label>
                <select 
                  name="category" 
                  id="category" 
                  className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background/50 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  required
                >
                  {categories.filter(c => c !== "All").map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddProductModalOpen(false)}>Cancel</Button>
              <Button type="submit">Create Product</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ADD CATEGORY MODAL */}
      <Dialog open={isAddCategoryModalOpen} onOpenChange={setIsAddCategoryModalOpen}>
        <DialogContent className="sm:max-w-[325px] glass-panel border-border/50">
          <DialogHeader>
            <DialogTitle>Add Category</DialogTitle>
          </DialogHeader>
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

      <style>{`
        /* Ripple effect CSS */
        .ripple {
          position: absolute;
          border-radius: 50%;
          transform: scale(0);
          animation: ripple 600ms linear;
          background-color: rgba(255, 255, 255, 0.3);
        }
        @keyframes ripple {
          to {
            transform: scale(4);
            opacity: 0;
          }
        }
        /* Hide number input spinners */
        .no-spinners::-webkit-outer-spin-button,
        .no-spinners::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .no-spinners {
          -moz-appearance: textfield;
        }
      `}</style>
    </div>
  );
}

// Tooltip Helper Component
function TooltipItem({ icon, label, active = false, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button 
          onClick={onClick}
          className={`relative p-3 rounded-xl transition-all duration-200 group ${
            active ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
          }`}
        >
          {icon}
          {active && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-r-md" />
          )}
          <div className="absolute inset-0 rounded-xl bg-primary/0 group-hover:bg-primary/5 transition-colors" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="ml-2 font-medium text-white border-0 px-2 py-1 rounded-md" style={{ background: 'rgba(10,10,16,0.88)', backdropFilter: 'blur(6px)', fontSize: 'clamp(10px, 0.85vw, 13px)' }}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
