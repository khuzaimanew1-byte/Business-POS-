import React, { useState, useMemo, useEffect, useRef } from "react";
import { 
  Home, BarChart2, Plus, Settings, Search, X, Bell, 
  ShoppingCart, Trash2, Minus, Zap, Check, ChevronDown 
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

    // Optional: trigger some visual pulse here
    const el = document.getElementById("cart-strip-count");
    if (el) {
      el.classList.remove("animate-pulse-slow");
      void el.offsetWidth; // trigger reflow
      el.classList.add("animate-pulse-slow");
    }
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
            <TooltipItem icon={<Home size={22} />} label="Home" active />
            <TooltipItem icon={<BarChart2 size={22} />} label="Analytics" />
            <div onClick={() => setIsAddProductModalOpen(true)}>
              <TooltipItem icon={<Plus size={22} />} label="Add Product" />
            </div>
            <TooltipItem icon={<Settings size={22} />} label="Settings" />
          </TooltipProvider>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col min-w-0 transition-all duration-200" style={{ marginRight: isCartOpen ? '380px' : '0' }}>
        
        {/* TOP BAR */}
        <header className="h-16 border-b border-border flex items-center justify-between px-6 shrink-0 bg-background/80 backdrop-blur-sm z-10 sticky top-0">
          <div className="relative w-full max-w-xl group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <input
              type="text"
              placeholder="Search products or enter #code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-input/50 border border-transparent focus:border-ring/50 focus:ring-1 focus:ring-ring/20 rounded-full py-2 pl-10 pr-10 text-sm outline-none transition-all placeholder:text-muted-foreground"
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

          <div className="flex items-center gap-4 ml-4">
            <TooltipProvider delayDuration={100}>
              <TooltipItem icon={<Settings size={20} className="text-muted-foreground" />} label="Edit Mode" />
            </TooltipProvider>
            <Popover>
              <PopoverTrigger asChild>
                <button className="relative p-2 rounded-full hover:bg-secondary transition-colors" data-testid="btn-notifications">
                  <Bell className="w-5 h-5 text-muted-foreground hover:text-foreground transition-colors" />
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full border border-background"></span>
                </button>
              </PopoverTrigger>
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
        </header>

        {/* CATEGORY BAR */}
        <div className="border-b border-border bg-background shrink-0">
          <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex items-center p-4 gap-2">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  data-testid={`btn-category-${cat}`}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 relative ${
                    selectedCategory === cat 
                      ? "text-primary-foreground bg-primary shadow-sm" 
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  {cat}
                </button>
              ))}
              <button 
                onClick={() => setIsAddCategoryModalOpen(true)}
                className="px-3 py-1.5 rounded-full text-sm font-medium text-muted-foreground border border-dashed border-border hover:border-primary hover:text-primary transition-colors ml-2 flex items-center gap-1"
                data-testid="btn-add-category"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </ScrollArea>
        </div>

        {/* PRODUCT GRID */}
        <ScrollArea className="flex-1 p-6 pb-24">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredProducts.map(product => (
              <div 
                key={product.id} 
                className="group relative bg-card border border-card-border rounded-xl overflow-hidden hover:-translate-y-1 hover:shadow-lg transition-all duration-200 flex flex-col"
                data-testid={`card-product-${product.id}`}
              >
                <div className="absolute top-2 left-2 z-10">
                  <Badge variant="secondary" className="bg-background/80 backdrop-blur text-xs font-mono border-border text-muted-foreground">
                    {product.code}
                  </Badge>
                </div>
                <div className="aspect-square w-full bg-secondary/50 relative overflow-hidden flex items-center justify-center">
                  {product.image ? (
                    <img 
                      src={product.image} 
                      alt={product.name} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full bg-secondary flex items-center justify-center text-3xl font-bold text-muted-foreground/30">
                      {renderInitials(product.name)}
                    </div>
                  )}
                </div>
                <div className="p-4 flex flex-col flex-1">
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="font-semibold text-sm line-clamp-1 flex-1 pr-2">{product.name}</h3>
                    <span className="font-medium text-sm text-primary">${product.price.toFixed(2)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mb-4">
                    Stock: {product.stock}
                  </div>
                  <div className="mt-auto">
                    <Button 
                      className="w-full relative overflow-hidden active:scale-95 transition-transform" 
                      variant={product.stock > 0 ? "default" : "secondary"}
                      disabled={product.stock <= 0}
                      onClick={(e) => {
                        // Create ripple
                        const btn = e.currentTarget;
                        const circle = document.createElement("span");
                        const diameter = Math.max(btn.clientWidth, btn.clientHeight);
                        const radius = diameter / 2;
                        circle.style.width = circle.style.height = `${diameter}px`;
                        circle.style.left = `${e.clientX - btn.getBoundingClientRect().left - radius}px`;
                        circle.style.top = `${e.clientY - btn.getBoundingClientRect().top - radius}px`;
                        circle.classList.add("ripple");
                        
                        const existingRipple = btn.getElementsByClassName("ripple")[0];
                        if (existingRipple) {
                          existingRipple.remove();
                        }
                        btn.appendChild(circle);
                        
                        addToCart(product);
                      }}
                      data-testid={`btn-add-${product.id}`}
                    >
                      {product.stock > 0 ? "Add to Cart" : "Out of Stock"}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {filteredProducts.length === 0 && (
              <div className="col-span-full py-20 flex flex-col items-center justify-center text-muted-foreground">
                <Search className="w-12 h-12 mb-4 opacity-20" />
                <p>No products found</p>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* BOTTOM CART STRIP */}
        <div 
          onClick={() => setIsCartOpen(!isCartOpen)}
          className="fixed bottom-0 right-0 left-[60px] h-16 glass-panel border-t flex items-center justify-between px-6 cursor-pointer hover:bg-background/80 transition-colors z-20"
          style={{ right: isCartOpen ? '380px' : '0', transition: 'right 200ms ease' }}
          data-testid="cart-strip"
        >
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/20 text-primary">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-sm">Current Order</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <span id="cart-strip-count" className="font-mono">{cartCount}</span> items
              </p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center text-muted-foreground gap-2 text-xs">
              <Zap className="w-4 h-4 text-primary" /> Speed mode active
            </div>
            <div className="text-xl font-bold text-primary tracking-tight">
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
          <div className="flex justify-between text-sm mb-2 text-muted-foreground">
            <span>Subtotal</span>
            <span>${cartTotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm mb-4 text-muted-foreground">
            <span>Tax (0%)</span>
            <span>$0.00</span>
          </div>
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
function TooltipItem({ icon, label, active = false }: { icon: React.ReactNode, label: string, active?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button 
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
      <TooltipContent side="right" className="ml-2 font-medium bg-popover border-border">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
