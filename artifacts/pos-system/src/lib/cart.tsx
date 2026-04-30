import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useSettings } from "@/lib/settings";
import { DEMO_PRODUCTS, type Product } from "@/lib/store";
import { _setDemoActive } from "@/lib/analytics-store";

export type CartItem = {
  product: Product;
  quantity: number;
};

const CART_ITEMS_KEY = "pos.cart.items.v1";
const CART_OPEN_KEY = "pos.cart.open.v1";

function loadCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_ITEMS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CartItem[]) : [];
  } catch {
    return [];
  }
}

function loadOpen(): boolean {
  try {
    return localStorage.getItem(CART_OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

// Demo cart prefill — first two demo products show up as soon as Demo Mode
// is enabled so the operator immediately sees a non-empty cart to play with.
function buildDemoPrefill(): CartItem[] {
  return [
    { product: DEMO_PRODUCTS[0], quantity: 1 },
    { product: DEMO_PRODUCTS[1], quantity: 2 },
  ];
}

type CartValue = {
  cartItems: CartItem[];
  setCartItems: React.Dispatch<React.SetStateAction<CartItem[]>>;
  isCartOpen: boolean;
  setIsCartOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

const CartContext = createContext<CartValue | null>(null);

/**
 * Cart state, split into two isolated tracks:
 *   • Real cart   — persisted to localStorage; the user's actual working cart.
 *   • Demo cart   — in-memory only; recreated each time Demo Mode turns on
 *                   and discarded the moment Demo Mode turns off.
 *
 * The active track flips automatically with `settings.demoData`, so any code
 * using `useCart()` always gets the cart that matches the current mode and
 * never accidentally writes demo edits into the real cart.
 */
export function CartProvider({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();

  const [realCart, setRealCart] = useState<CartItem[]>(loadCart);
  const [realOpen, setRealOpen] = useState<boolean>(loadOpen);

  const [demoCart, setDemoCart] = useState<CartItem[]>(() =>
    settings.demoData ? buildDemoPrefill() : [],
  );
  const [demoOpen, setDemoOpen] = useState<boolean>(false);

  // Tracks whether the current demo session has already been initialized so
  // we don't wipe the demo cart on every render — only when the toggle
  // actually transitions.
  const demoSessionStarted = useRef<boolean>(settings.demoData);

  // Persist only the real cart. Demo state is intentionally ephemeral.
  useEffect(() => {
    try {
      localStorage.setItem(CART_ITEMS_KEY, JSON.stringify(realCart));
    } catch {
      /* quota / disabled */
    }
  }, [realCart]);
  useEffect(() => {
    try {
      localStorage.setItem(CART_OPEN_KEY, realOpen ? "1" : "0");
    } catch {
      /* quota / disabled */
    }
  }, [realOpen]);

  // Demo session lifecycle: start fresh on entry, drop everything on exit.
  // We also flip the analytics-store's demo flag here so `recordSale` routes
  // sales to the ephemeral session bucket while Demo Mode is on.
  useEffect(() => {
    _setDemoActive(settings.demoData);
    if (settings.demoData) {
      if (!demoSessionStarted.current) {
        setDemoCart(buildDemoPrefill());
        setDemoOpen(false);
        demoSessionStarted.current = true;
      }
    } else {
      setDemoCart([]);
      setDemoOpen(false);
      demoSessionStarted.current = false;
    }
  }, [settings.demoData]);

  const cartItems = settings.demoData ? demoCart : realCart;
  const isCartOpen = settings.demoData ? demoOpen : realOpen;

  const setCartItems = useCallback<React.Dispatch<React.SetStateAction<CartItem[]>>>(
    (action) => {
      if (settings.demoData) setDemoCart(action);
      else setRealCart(action);
    },
    [settings.demoData],
  );

  const setIsCartOpen = useCallback<React.Dispatch<React.SetStateAction<boolean>>>(
    (action) => {
      if (settings.demoData) setDemoOpen(action);
      else setRealOpen(action);
    },
    [settings.demoData],
  );

  return (
    <CartContext.Provider
      value={{ cartItems, setCartItems, isCartOpen, setIsCartOpen }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
