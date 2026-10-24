import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useScroll, useTransform } from 'framer-motion';
import { ArrowRight, Bike, CheckCircle2, CreditCard, Leaf, MapPin, Package, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const WORDS = ['meals', 'groceries', 'packages', 'snacks', 'essentials'];
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

// The word in the headline that keeps changing
const RotatingWord = () => {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % WORDS.length), 2200);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="relative inline-flex overflow-hidden align-bottom">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={WORDS[i]}
          className="inline-block text-primary"
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: '0%', opacity: 1 }}
          exit={{ y: '-100%', opacity: 0 }}
          transition={{ duration: 0.55, ease: EASE }}
        >
          {WORDS[i]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
};

// A small floating card over the hero photo
const FloatCard = ({ className, delay, children }: { className: string; delay: number; children: React.ReactNode }) => (
  <motion.div
    className={`absolute z-20 rounded-2xl border border-border/60 bg-card/95 p-3 shadow-xl backdrop-blur ${className}`}
    initial={{ opacity: 0, scale: 0.85, y: 20 }}
    animate={{ opacity: 1, scale: 1, y: [0, -8, 0] }}
    transition={{
      opacity: { duration: 0.6, delay }, scale: { duration: 0.6, delay, ease: EASE },
      y: { duration: 5, delay: delay + 0.6, repeat: Infinity, ease: 'easeInOut' },
    }}
  >
    {children}
  </motion.div>
);

const Hero = () => {
  const { user, isAuthenticated } = useAuth();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const photoY = useTransform(scrollYProgress, [0, 1], [0, 80]);
  const blobY = useTransform(scrollYProgress, [0, 1], [0, -120]);
  const home = isAuthenticated && user ? `/${user.role.toLowerCase()}` : null;

  return (
    <section ref={ref} className="relative overflow-hidden bg-gradient-to-b from-primary-light via-background to-background pb-16 pt-28 dark:from-[#0F1A0C] sm:pt-32 lg:pb-24 lg:pt-36">
      {/* Background: soft moving blobs and a dot grid */}
      <motion.div aria-hidden style={{ y: blobY }} className="pointer-events-none absolute inset-0">
        <motion.div
          className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-primary/25 blur-3xl dark:bg-primary/15"
          animate={{ x: [0, 40, 0], y: [0, 30, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -right-20 top-40 h-96 w-96 rounded-full bg-lime-300/30 blur-3xl dark:bg-lime-500/10"
          animate={{ x: [0, -50, 0], y: [0, -20, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        />
      </motion.div>
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:radial-gradient(hsl(var(--foreground)/0.12)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_75%)]" />

      <div className="container relative mx-auto grid max-w-screen-xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-10">
        {/* Words */}
        <div className="text-center lg:text-left">
          <motion.span
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-background/70 px-3 py-1 text-xs font-semibold text-[#3F8500] backdrop-blur dark:text-primary sm:text-sm"
          >
            <Leaf className="h-3.5 w-3.5" /> Eco-friendly delivery, made in Nigeria
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE, delay: 0.1 }}
            className="mt-5 font-clash text-[2.6rem] font-semibold leading-[1.05] tracking-tight text-foreground xs:text-5xl sm:text-6xl xl:text-7xl"
          >
            Get <RotatingWord />
            <br />
            delivered the <span className="relative whitespace-nowrap">
              green way
              <motion.svg aria-hidden viewBox="0 0 300 20" className="absolute -bottom-2 left-0 h-3 w-full text-primary" preserveAspectRatio="none">
                <motion.path
                  d="M2 14 C 80 4, 160 4, 298 12"
                  fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round"
                  initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, delay: 0.7, ease: EASE }}
                />
              </motion.svg>
            </span>.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE, delay: 0.25 }}
            className="mx-auto mt-6 max-w-xl text-base text-muted-foreground sm:text-lg lg:mx-0"
          >
            Order from restaurants and shops near you, or send a package across town. Cydex riders travel on foot,
            by bicycle and e-bike first, so every delivery costs the planet less.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE, delay: 0.4 }}
            className="mt-8 flex flex-col justify-center gap-3 xs:flex-row lg:justify-start"
          >
            {home ? (
              <Button asChild size="lg" className="h-12 rounded-full px-7 text-base text-black shadow-lg shadow-primary/30 hover:bg-primary-hover">
                <Link to={home}>Go to your dashboard <ArrowRight className="ml-1 h-4 w-4" /></Link>
              </Button>
            ) : (
              <>
                <Button asChild size="lg" className="group h-12 rounded-full px-7 text-base text-black shadow-lg shadow-primary/30 hover:bg-primary-hover">
                  <Link to="/auth?tab=register">Order now <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" /></Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-12 rounded-full border-foreground/15 bg-background/60 px-7 text-base backdrop-blur">
                  <Link to="/auth?tab=register"><Package className="mr-1 h-4 w-4" /> Send a package</Link>
                </Button>
              </>
            )}
          </motion.div>

          <motion.ul
            initial="hidden" animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1, delayChildren: 0.6 } } }}
            className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground lg:justify-start"
          >
            {[
              { icon: CreditCard, text: 'Card, transfer or wallet' },
              { icon: ShieldCheck, text: 'Code-checked handovers' },
              { icon: MapPin, text: 'Live order updates' },
            ].map(({ icon: Icon, text }) => (
              <motion.li key={text} variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }} className="flex items-center gap-1.5">
                <Icon className="h-4 w-4 text-primary" /> {text}
              </motion.li>
            ))}
          </motion.ul>
        </div>

        {/* Photo with floating cards */}
        <div className="relative mx-auto w-full max-w-md sm:max-w-lg">
          <motion.div
            aria-hidden
            className="absolute inset-0 -rotate-6 rounded-[2.5rem] bg-primary/80 dark:bg-primary/60"
            initial={{ opacity: 0, rotate: 0 }} animate={{ opacity: 1, rotate: -6 }} transition={{ duration: 0.9, ease: EASE, delay: 0.2 }}
          />
          <motion.div
            style={{ y: photoY }}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.15 }}
            className="relative overflow-hidden rounded-[2.5rem] border-4 border-background shadow-2xl"
          >
            <img src="/landing/rider-bicycle.jpg" alt="A Cydex rider on a bicycle with a green delivery bag" className="aspect-square w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
          </motion.div>

          <FloatCard className="-left-2 top-8 w-52 sm:-left-10" delay={0.7}>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary"><Bike className="h-4 w-4" /></span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">Rider on the way</p>
                <p className="text-[11px] text-muted-foreground">Arriving in about 12 min</p>
              </div>
            </div>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <motion.div className="h-full rounded-full bg-primary" initial={{ width: '15%' }} animate={{ width: ['15%', '85%', '15%'] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }} />
            </div>
          </FloatCard>

          <FloatCard className="-right-2 bottom-20 sm:-right-8" delay={0.95}>
            <p className="text-[11px] text-muted-foreground">Delivery code</p>
            <div className="mt-1 flex gap-1">
              {['4', '8', '2', '1'].map((d, i) => (
                <motion.span
                  key={i}
                  className="flex h-8 w-7 items-center justify-center rounded-md bg-muted font-mono text-sm font-bold text-foreground"
                  initial={{ rotateX: 90, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }} transition={{ delay: 1.2 + i * 0.12 }}
                >{d}</motion.span>
              ))}
            </div>
          </FloatCard>

          <FloatCard className="-bottom-4 left-6 sm:left-10" delay={1.2}>
            <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <CheckCircle2 className="h-4 w-4 text-primary" /> Delivered by bicycle
            </p>
            <p className="text-[11px] text-muted-foreground">No fuel, no exhaust</p>
          </FloatCard>
        </div>
      </div>
    </section>
  );
};

export default Hero;
