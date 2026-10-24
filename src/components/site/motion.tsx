import { useEffect, useRef, useState, type ReactNode } from 'react';
import { animate, motion, useInView, type Variants } from 'framer-motion';
import { cn } from '@/lib/utils';

// Animation helpers for the public website. Everything respects the visitor's
// "reduce motion" setting through <MotionConfig reducedMotion="user"> in SiteLayout.

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

// Fades and slides its children in the first time they scroll into view
export const Reveal = ({
  children, className, delay = 0, y = 28, as = 'div',
}: { children: ReactNode; className?: string; delay?: number; y?: number; as?: 'div' | 'section' | 'li' }) => {
  const Tag = motion[as];
  return (
    <Tag
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.7, ease: EASE, delay }}
    >
      {children}
    </Tag>
  );
};

// A list whose items come in one after another (use <StaggerItem> inside)
const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};
const staggerChild: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

export const Stagger = ({ children, className }: { children: ReactNode; className?: string }) => (
  <motion.div className={className} variants={staggerParent} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}>
    {children}
  </motion.div>
);

export const StaggerItem = ({ children, className }: { children: ReactNode; className?: string }) => (
  <motion.div className={className} variants={staggerChild}>{children}</motion.div>
);

// Counts up to a number when it scrolls into view
export const CountUp = ({ to, suffix = '', className }: { to: number; suffix?: string; className?: string }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, to, { duration: 1.4, ease: EASE, onUpdate: (v) => setValue(Math.round(v)) });
    return () => controls.stop();
  }, [inView, to]);
  return <span ref={ref} className={className}>{value.toLocaleString('en-NG')}{suffix}</span>;
};

// Small label above a section heading
export const Eyebrow = ({ children, className }: { children: ReactNode; className?: string }) => (
  <span className={cn(
    'inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[#3F8500] dark:text-primary',
    className,
  )}>
    {children}
  </span>
);

// Section heading with optional eyebrow and intro
export const SectionHeading = ({
  eyebrow, title, intro, center = true, className,
}: { eyebrow?: ReactNode; title: ReactNode; intro?: ReactNode; center?: boolean; className?: string }) => (
  <Reveal className={cn('mb-10 max-w-2xl space-y-4 sm:mb-14', center && 'mx-auto text-center', className)}>
    {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
    <h2 className="font-clash text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl lg:text-5xl">{title}</h2>
    {intro && <p className="text-base text-muted-foreground sm:text-lg">{intro}</p>}
  </Reveal>
);
