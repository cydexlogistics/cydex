import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle2, Gift, ShoppingBag, Store, Trophy, UserPlus, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Reveal, SectionHeading, Stagger, StaggerItem } from '../motion';

const bob = (delay: number) => ({
  animate: { y: [0, -10, 0] },
  transition: { duration: 4, repeat: Infinity, ease: 'easeInOut' as const, delay },
});

const PERKS = [
  { icon: Trophy, title: 'Rewards', text: 'Hit milestones set by Cydex, like 10 orders, and unlock wallet bonuses or free delivery.' },
  { icon: UserPlus, title: 'Referrals', text: 'Share your code. When a friend joins and gets going, you get a reward in your wallet.' },
  { icon: Gift, title: 'Offers', text: 'Discounts and coupon codes, shown on your home page and applied at checkout.' },
];

// Join as a vendor or a rider, and the perks everyone gets
const Join = () => (
  <section className="py-20 sm:py-28">
    <div className="container mx-auto max-w-screen-xl px-4 sm:px-6">
      <SectionHeading eyebrow="Grow with us" title="Sell with Cydex. Ride with Cydex." />
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Vendors */}
        <Reveal>
          <div className="group relative grid h-full min-h-[26rem] items-center gap-8 overflow-hidden rounded-[2rem] bg-primary p-8 text-black sm:grid-cols-[1fr_13rem] sm:p-10 lg:grid-cols-1 xl:grid-cols-[1fr_13rem]">
            <div className="relative z-10 space-y-4">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-black/10"><Store className="h-6 w-6" /></span>
              <h3 className="font-clash text-3xl font-semibold leading-tight sm:text-4xl">Bring your business to customers nearby</h3>
              <ul className="space-y-2 text-[15px] text-black/75">
                {['Your own store page with products, discounts and hours', 'Riders handle delivery, or request one for your own orders', 'Earnings paid to your wallet, withdraw to your bank'].map((t) => (
                  <li key={t} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {t}</li>
                ))}
              </ul>
              <Button asChild size="lg" className="rounded-full bg-black px-6 text-white hover:bg-black/85">
                <Link to="/auth?tab=register&role=vendor">Sell on Cydex <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" /></Link>
              </Button>
            </div>
            {/* Floating order cards (beside the text where there's room) */}
            <div aria-hidden className="pointer-events-none hidden space-y-3 sm:block lg:hidden xl:block">
              <motion.div {...bob(0)} className="rounded-2xl bg-white p-3 shadow-xl">
                <p className="flex items-center gap-2 text-xs font-semibold"><ShoppingBag className="h-4 w-4 text-[#3F8500]" /> New order</p>
                <p className="mt-1 text-[11px] text-black/60">2 × Jollof rice, 1 × Zobo</p>
              </motion.div>
              <motion.div {...bob(0.6)} className="ml-8 rounded-2xl bg-white p-3 shadow-xl">
                <p className="text-xs font-semibold">Ready for pickup</p>
                <p className="text-[11px] text-black/60">Rider 400 m away</p>
              </motion.div>
              <motion.div {...bob(1.2)} className="rounded-2xl bg-black p-3 text-white shadow-xl">
                <p className="flex items-center gap-2 text-xs font-semibold"><Wallet className="h-4 w-4 text-primary" /> Paid to your wallet</p>
              </motion.div>
            </div>
          </div>
        </Reveal>

        {/* Riders */}
        <Reveal delay={0.1}>
          <div className="group relative flex h-full min-h-[26rem] flex-col justify-center overflow-hidden rounded-[2rem] bg-[#0F1A0C] p-8 text-white sm:p-10">
            <img src="/landing/rider-ebike.jpg" alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-60 transition-transform duration-700 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0F1A0C] via-[#0F1A0C]/85 to-transparent" />
            <div className="relative z-10 max-w-sm space-y-4">
              <h3 className="font-clash text-3xl font-semibold leading-tight sm:text-4xl">Earn on your schedule, by bike or on foot</h3>
              <ul className="space-y-2 text-[15px] text-white/80">
                {['Go online when it suits you', 'Keep most of every delivery fee', 'Daily and weekly challenges, plus achievements'].map((t) => (
                  <li key={t} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {t}</li>
                ))}
              </ul>
              <Button asChild size="lg" className="rounded-full px-6 text-black hover:bg-primary-hover">
                <Link to="/auth?tab=register&role=rider">Ride with Cydex <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" /></Link>
              </Button>
            </div>
          </div>
        </Reveal>
      </div>

      {/* Perks */}
      <Stagger className="mt-6 grid gap-4 md:grid-cols-3">
        {PERKS.map(({ icon: Icon, title, text }) => (
          <StaggerItem key={title}>
            <div className="flex h-full gap-4 rounded-2xl border border-border bg-card p-5">
              <motion.span whileHover={{ rotate: -12, scale: 1.1 }} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300">
                <Icon className="h-5 w-5" />
              </motion.span>
              <div>
                <h3 className="font-clash text-lg font-semibold text-foreground">{title}</h3>
                <p className="text-sm text-muted-foreground">{text}</p>
              </div>
            </div>
          </StaggerItem>
        ))}
      </Stagger>
    </div>
  </section>
);

export default Join;
