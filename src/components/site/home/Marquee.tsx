import { Apple, Cake, Coffee, CupSoda, FileText, Gift, Package, Pizza, Salad, ShoppingBasket, Soup, Sparkles } from 'lucide-react';

const ROWS = [
  [
    { icon: Soup, label: 'Hot meals' }, { icon: ShoppingBasket, label: 'Groceries' }, { icon: CupSoda, label: 'Drinks' },
    { icon: Pizza, label: 'Snacks' }, { icon: Cake, label: 'Bakery treats' }, { icon: Salad, label: 'Healthy bowls' },
  ],
  [
    { icon: Package, label: 'Parcels' }, { icon: FileText, label: 'Documents' }, { icon: Gift, label: 'Gifts' },
    { icon: Apple, label: 'Fresh produce' }, { icon: Coffee, label: 'Coffee & tea' }, { icon: Sparkles, label: 'Everyday essentials' },
  ],
];

// Two strips of what Cydex delivers, scrolling in opposite directions
const Marquee = () => (
  <section aria-label="What we deliver" className="relative space-y-3 overflow-hidden border-y border-border/60 bg-muted/30 py-6 [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
    {ROWS.map((row, r) => (
      <div key={r} className="flex w-max animate-marquee gap-3 hover:[animation-play-state:paused]" style={r % 2 ? { animationDirection: 'reverse', animationDuration: '48s' } : undefined}>
        {[...row, ...row, ...row, ...row].map(({ icon: Icon, label }, i) => (
          <span key={i} aria-hidden={i >= row.length} className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm">
            <Icon className="h-4 w-4 text-primary" /> {label}
          </span>
        ))}
      </div>
    ))}
  </section>
);

export default Marquee;
