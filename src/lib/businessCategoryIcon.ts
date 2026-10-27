import {
  Cake, CupSoda, Pill, Shirt, ShoppingBag, Smartphone, Sparkles, Store, UtensilsCrossed, type LucideIcon,
} from 'lucide-react';

// Business categories are admin-defined names, so match on keywords; anything
// unrecognised gets a generic store icon
const ICONS: [RegExp, LucideIcon][] = [
  [/restaurant|food|kitchen|eatery|canteen|buka|grill|cafe/i, UtensilsCrossed],
  [/bak|cake|pastr|dessert/i, Cake],
  [/drink|beverage|\bbar\b|lounge|juice|water/i, CupSoda],
  [/pharm|drug|chemist|health|medic/i, Pill],
  [/fashion|cloth|boutique|wear|apparel/i, Shirt],
  [/electr|gadget|phone|tech/i, Smartphone],
  [/beauty|cosmetic|salon|\bspa\b/i, Sparkles],
  [/shop|store|mart|market|grocer|supermarket|retail/i, ShoppingBag],
];

export const businessCategoryIcon = (category: string | null | undefined): LucideIcon =>
  ICONS.find(([re]) => category && re.test(category))?.[1] ?? Store;
