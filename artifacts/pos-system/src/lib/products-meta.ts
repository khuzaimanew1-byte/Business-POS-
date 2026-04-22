export type ProductMeta = {
  id: string;
  name: string;
  image?: string;
  category?: string;
};

export const PRODUCTS_META: ProductMeta[] = [
  { id: "1",  name: "Espresso",        image: "/images/espresso.png",     category: "Drinks" },
  { id: "2",  name: "Latte",           image: "/images/latte.png",        category: "Drinks" },
  { id: "3",  name: "Cappuccino",      image: "/images/cappuccino.png",   category: "Drinks" },
  { id: "4",  name: "Trail Mix",       image: "/images/trail-mix.png",    category: "Snacks" },
  { id: "5",  name: "Granola Bar",     image: "/images/granola-bar.png",  category: "Snacks" },
  { id: "6",  name: "Chips Pack",                                         category: "Snacks" },
  { id: "7",  name: "Wireless Earbuds", image: "/images/earbuds.png",     category: "Electronics" },
  { id: "8",  name: "USB Cable",       image: "/images/usb-cable.png",    category: "Electronics" },
  { id: "9",  name: "Phone Stand",     image: "/images/phone-stand.png",  category: "Electronics" },
  { id: "10", name: "T-Shirt",                                            category: "Clothing" },
  { id: "11", name: "Cap",                                                category: "Clothing" },
  { id: "12", name: "Sandwich",                                           category: "Food" },
  { id: "13", name: "Salad Bowl",                                         category: "Food" },
];

const META_BY_ID = new Map(PRODUCTS_META.map((p) => [p.id, p]));

export function getProductMeta(id: string, fallbackName?: string): ProductMeta {
  return (
    META_BY_ID.get(id) ?? { id, name: fallbackName ?? `Product ${id}` }
  );
}

// Curated palette tuned for dark UI — high saturation, mid-bright.
const PALETTE = [
  "hsl(43 90% 55%)",   // amber (primary)
  "hsl(195 85% 60%)",  // cyan
  "hsl(280 75% 68%)",  // violet
  "hsl(150 70% 55%)",  // emerald
  "hsl(340 80% 65%)",  // pink
  "hsl(25 90% 62%)",   // orange
  "hsl(210 85% 65%)",  // blue
  "hsl(90 60% 58%)",   // lime
  "hsl(0 75% 65%)",    // red
  "hsl(170 65% 55%)",  // teal
  "hsl(310 70% 68%)",  // magenta
  "hsl(60 75% 58%)",   // yellow
];

const colorCache = new Map<string, string>();
export function colorForProduct(id: string): string {
  const cached = colorCache.get(id);
  if (cached) return cached;
  let h = 0;
  for (const c of id) h = (h * 131 + c.charCodeAt(0)) >>> 0;
  const color = PALETTE[h % PALETTE.length];
  colorCache.set(id, color);
  return color;
}
