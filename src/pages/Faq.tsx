import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageCircleQuestion, Search, X } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import SiteLayout from '@/components/site/SiteLayout';
import { FAQ_CATEGORIES, FAQS, type FaqCategory } from '@/components/site/faqData';
import { Eyebrow, Reveal } from '@/components/site/motion';
import { cn } from '@/lib/utils';

const Faq = () => {
  const [category, setCategory] = useState<FaqCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();

  const items = useMemo(() => FAQS.filter((f) =>
    (category === 'all' || f.category === category)
    && (!q || f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q))), [category, q]);

  const chips: [FaqCategory | 'all', string][] = [['all', 'All'], ...(Object.entries(FAQ_CATEGORIES) as [FaqCategory, string][])];

  return (
    <SiteLayout>
      <section className="relative overflow-hidden bg-gradient-to-b from-primary-light to-background pb-10 pt-28 dark:from-[#0F1A0C] sm:pt-36">
        <div className="container mx-auto max-w-3xl space-y-6 px-4 text-center sm:px-6">
          <Reveal><Eyebrow>FAQ</Eyebrow></Reveal>
          <Reveal delay={0.05}>
            <h1 className="font-clash text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl">How can we help?</h1>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="relative mx-auto max-w-xl">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search questions, e.g. delivery code"
                aria-label="Search questions"
                className="h-14 w-full rounded-full border border-border bg-card pl-12 pr-12 text-base text-foreground shadow-lg shadow-primary/5 placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              {search && (
                <button type="button" aria-label="Clear search" onClick={() => setSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="pb-20 sm:pb-28">
        <div className="container mx-auto max-w-3xl px-4 sm:px-6">
          {/* Categories */}
          <div className="-mx-4 mb-8 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:justify-center sm:px-0 [&::-webkit-scrollbar]:hidden">
            {chips.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setCategory(key)}
                className={cn('relative shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors',
                  category === key ? 'border-transparent text-black' : 'border-border bg-card text-muted-foreground hover:text-foreground')}
              >
                {category === key && <motion.span layoutId="faq-chip" className="absolute inset-0 rounded-full bg-primary" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
                <span className="relative">{label}</span>
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div key={`${category}-${q}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
              {items.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
                  No questions match “{search}”. Try other words, or <Link to="/contact" className="font-semibold text-foreground underline decoration-primary">ask us directly</Link>.
                </div>
              ) : (
                <Accordion type="single" collapsible className="space-y-3">
                  {items.map((f, i) => (
                    <motion.div key={f.q} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.04, 0.4) }}>
                      <AccordionItem value={f.q} className="rounded-2xl border border-border bg-card px-5 data-[state=open]:border-primary/50 data-[state=open]:shadow-md">
                        <AccordionTrigger className="text-left font-clash text-base font-semibold hover:no-underline sm:text-lg">{f.q}</AccordionTrigger>
                        <AccordionContent className="text-[15px] leading-relaxed text-muted-foreground">
                          {f.a}
                          {category === 'all' && !q && (
                            <span className="mt-3 block text-xs font-medium text-[#3F8500] dark:text-primary">{FAQ_CATEGORIES[f.category]}</span>
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    </motion.div>
                  ))}
                </Accordion>
              )}
            </motion.div>
          </AnimatePresence>

          <Reveal className="mt-12">
            <div className="flex flex-col items-center gap-4 rounded-3xl bg-[#0F1A0C] p-8 text-center text-white sm:flex-row sm:text-left">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-black">
                <MessageCircleQuestion className="h-7 w-7" />
              </span>
              <div className="flex-1">
                <p className="font-clash text-xl font-semibold">Still have a question?</p>
                <p className="text-sm text-white/70">Send us a message and our team will get back to you.</p>
              </div>
              <Button asChild className="rounded-full px-6 text-black hover:bg-primary-hover">
                <Link to="/contact">Contact us</Link>
              </Button>
            </div>
          </Reveal>
        </div>
      </section>
    </SiteLayout>
  );
};

export default Faq;
