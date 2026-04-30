import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSettings } from "@/lib/settings";

export type Category = string;

// Display label for the auto-managed sold-out bucket. The variable name is
// kept as `OUT_OF_STOCK_CATEGORY` for code-history continuity; the visible
// label is "Sold Out" (a status indicator, not a real category).
export const OUT_OF_STOCK_CATEGORY = "Sold Out";

export type Product = {
  id: string;
  quickCode?: string;  // user-defined / generated quick code (e.g. "#wi-e")
  name: string;
  price: number;
  category: Category;
  stock: number;
  image?: string;
  profit?: number;
};

export const INITIAL_CATEGORIES: Category[] = ["All", "Drinks", "Snacks", "Electronics", "Clothing", "Food"];

// Demo products are an additive overlay shown only when Settings → Data &
// Safety → Demo Data is ON. They share the global `products` list with any
// user-added products so existing call sites (POS, AddProduct) keep working,
// but they are stored in their own bucket so toggling Demo Data off cleanly
// reveals just the user's real catalogue.
export const DEMO_PRODUCTS: Product[] = [
  { id: "demo-1",  name: "Espresso",        price: 3.50,  category: "Drinks",      stock: 50,  image: "/images/espresso.png" },
  { id: "demo-2",  name: "Latte",            price: 4.50,  category: "Drinks",      stock: 45,  image: "/images/latte.png" },
  { id: "demo-3",  name: "Cappuccino",       price: 4.00,  category: "Drinks",      stock: 30,  image: "/images/cappuccino.png" },
  { id: "demo-4",  name: "Trail Mix",        price: 2.99,  category: "Snacks",      stock: 100, image: "/images/trail-mix.png" },
  { id: "demo-5",  name: "Granola Bar",      price: 1.99,  category: "Snacks",      stock: 200, image: "/images/granola-bar.png" },
  { id: "demo-6",  name: "Chips Pack",       price: 1.49,  category: "Snacks",      stock: 150 },
  { id: "demo-7",  name: "Wireless Earbuds", price: 29.99, category: "Electronics", stock: 20,  image: "/images/earbuds.png" },
  { id: "demo-8",  name: "USB Cable",        price: 9.99,  category: "Electronics", stock: 75,  image: "/images/usb-cable.png" },
  { id: "demo-9",  name: "Phone Stand",      price: 14.99, category: "Electronics", stock: 40,  image: "/images/phone-stand.png" },
  { id: "demo-10", name: "T-Shirt",          price: 19.99, category: "Clothing",    stock: 60 },
  { id: "demo-11", name: "Cap",              price: 12.99, category: "Clothing",    stock: 80 },
  { id: "demo-12", name: "Sandwich",         price: 6.99,  category: "Food",        stock: 25 },
  { id: "demo-13", name: "Salad Bowl",       price: 8.99,  category: "Food",        stock: 15 },
];

const DEMO_ID_PREFIX = "demo-";
const isDemoId = (id: string) => id.startsWith(DEMO_ID_PREFIX);

type StoreValue = {
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  categories: Category[];
  setCategories: React.Dispatch<React.SetStateAction<Category[]>>;
  customCategories: Set<string>;
  addCustomCategory: (name: string) => void;
  removeCategory: (name: string) => void;
};

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();

  // Two independent buckets so toggling Demo Data on/off never corrupts the
  // user's real catalogue. Demo state lives in memory only — a reload
  // restores the pristine demo list.
  const [userProducts, setUserProducts] = useState<Product[]>([]);
  const [demoProducts, setDemoProducts] = useState<Product[]>(DEMO_PRODUCTS);
  const [categories, setCategories] = useState<Category[]>(INITIAL_CATEGORIES);
  const [customCategories, setCustomCategories] = useState<Set<string>>(() => new Set());

  const products = useMemo<Product[]>(
    () => (settings.demoData ? [...demoProducts, ...userProducts] : userProducts),
    [settings.demoData, demoProducts, userProducts],
  );

  // Mirror the current visible list in a ref so functional setProducts updates
  // (which expect the latest state) always see what the consumer was
  // looking at, even though state is split across two buckets internally.
  const productsRef = useRef<Product[]>(products);
  productsRef.current = products;

  const setProducts: React.Dispatch<React.SetStateAction<Product[]>> = (action) => {
    const cur = productsRef.current;
    const next = typeof action === "function"
      ? (action as (prev: Product[]) => Product[])(cur)
      : action;
    if (settings.demoData) {
      // Split the new list back into demo / user buckets by ID prefix so each
      // side keeps any in-place edits (stock decrements, edits, deletions).
      setDemoProducts(next.filter((p) => isDemoId(p.id)));
      setUserProducts(next.filter((p) => !isDemoId(p.id)));
    } else {
      // Demo overlay is hidden — every change applies only to user products.
      setUserProducts(next);
    }
  };

  // ── "Sold Out" tab visibility ────────────────────────────────────────────
  // "Sold Out" is a virtual filter (stock = 0), NOT a stored category value
  // on products. Products always keep their real category — when a product
  // runs out it still appears under its own category tab AND under the
  // shared "Sold Out" tab (which the consumer renders as a stock<=0 filter).
  // We only manage tab presence here: the chip is appended (pinned last) when
  // any product is out, and removed when none are.
  useEffect(() => {
    const hasOOS = products.some(p => p.stock <= 0);
    setCategories(prev => {
      const without = prev.filter(c => c !== OUT_OF_STOCK_CATEGORY);
      if (hasOOS) {
        if (prev.length === without.length + 1 && prev[prev.length - 1] === OUT_OF_STOCK_CATEGORY) return prev;
        return [...without, OUT_OF_STOCK_CATEGORY];
      }
      return without.length === prev.length ? prev : without;
    });
  }, [products]);

  const addCustomCategory = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    // Insert *before* the pinned "Sold Out" tab so the system chip always
    // stays at the very end of the bar regardless of insertion order.
    setCategories(prev => {
      if (prev.includes(trimmed)) return prev;
      const oosIdx = prev.indexOf(OUT_OF_STOCK_CATEGORY);
      if (oosIdx === -1) return [...prev, trimmed];
      const next = prev.slice();
      next.splice(oosIdx, 0, trimmed);
      return next;
    });
    setCustomCategories(prev => {
      if (prev.has(trimmed)) return prev;
      const next = new Set(prev);
      next.add(trimmed);
      return next;
    });
  };

  const removeCategory = (name: string) => {
    setCategories(prev => prev.filter(c => c !== name));
    setCustomCategories(prev => {
      if (!prev.has(name)) return prev;
      const next = new Set(prev);
      next.delete(name);
      return next;
    });
  };

  return (
    <StoreContext.Provider value={{ products, setProducts, categories, setCategories, customCategories, addCustomCategory, removeCategory }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}

// Shared quick-code generator (single source of truth used by POS & AddProduct)
export function generateQuickCode(name: string): string {
  const cleaned = name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '#';
  if (parts.length === 1) return `#${parts[0].slice(0, 3)}`;
  return `#${parts[0].slice(0, 2)}-${parts[1][0]}`;
}

export function normalizeCode(s: string): string {
  return s.toLowerCase().replace(/[#\-\s]/g, '');
}
