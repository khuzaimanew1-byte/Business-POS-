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

// Curated palette tuned for dark UI — slightly muted for a premium feel.
const PALETTE = [
  "hsl(43 78% 60%)",   // amber (primary)
  "hsl(195 65% 60%)",  // cyan
  "hsl(280 55% 68%)",  // violet
  "hsl(150 50% 58%)",  // emerald
  "hsl(340 65% 66%)",  // pink
  "hsl(25 75% 62%)",   // orange
  "hsl(210 65% 65%)",  // blue
  "hsl(90 45% 60%)",   // lime
  "hsl(0 60% 66%)",    // red
  "hsl(170 50% 58%)",  // teal
  "hsl(310 55% 70%)",  // magenta
  "hsl(50 65% 62%)",   // yellow
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
