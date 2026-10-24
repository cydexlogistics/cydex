import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowUpRight, Package, Store, Truck } from 'lucide-react';
import { CountUp, SectionHeading, Stagger, StaggerItem } from '../motion';
import { cn } from '@/lib/utils';

const SERVICES = [
  {
    icon: Store,
    title: 'Order from vendors near you',
    text: 'Restaurants and shops close to your address, with prices up front and updates at every step until it reaches your door.',
    cta: 'Start ordering',
    to: '/auth?tab=register',
    tone: 'bg-primary text-black',
    iconTone: 'bg-black/10 text-black',
    muted: 'text-black/70',
  },
  {
    icon: Package,
    title: 'Cydex Express',
    text: 'Send a parcel, documents or a gift across town. We pick it up, the recipient gets a delivery code by email, and you follow it live.',
    cta: 'Send a package',
    to: '/auth?tab=register',
    tone: 'bg-card text-foreground border border-border',
    iconTone: 'bg-primary/15 text-primary',
    muted: 'text-muted-foreground',
  },
  {
    icon: Truck,
    title: 'Request a rider for your business',
    text: "Already selling on Instagram or WhatsApp? Book a Cydex rider for your own deliveries, with up to 5 drop-offs in one trip.",
    cta: 'Sell on Cydex',
    to: '/auth?tab=register&role=vendor',
    tone: 'bg-[#0F1A0C] text-white dark:bg-[#132210]',
    iconTone: 'bg-primary/20 text-primary',
    muted: 'text-white/70',
  },
];

// Real numbers about how Cydex works (not made-up totals)
const FACTS = [
  { to: 4, label: 'ways to deliver', note: 'on foot, bicycle, e-bike, motorbike' },
  { to: 4, label: 'digit delivery codes', note: 'nobody else can complete your order' },
  { to: 5, label: 'drop-offs in one trip', note: 'for businesses requesting a rider' },
  { to: 0, prefix: '₦', label: 'to sign up', note: 'for customers, vendors and riders' },
];

const Services = () => (
  <section className="py-20 sm:py-28">
    <div className="container mx-auto max-w-screen-xl px-4 sm:px-6">
      <SectionHeading
        eyebrow="What you can do"
        title={<>One app for everything <span className="text-primary">local</span></>}
        intro="Whether you're hungry, sending something across town or running a business, Cydex gets it there."
      />
      <Stagger className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {SERVICES.map(({ icon: Icon, title, text, cta, to, tone, iconTone, muted }) => (
          <StaggerItem key={title}>
            <motion.div whileHover={{ y: -8 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }} className={cn('group flex h-full flex-col rounded-3xl p-7 shadow-sm', tone)}>
              <span className={cn('flex h-14 w-14 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:rotate-6 group-hover:scale-110', iconTone)}>
                <Icon className="h-7 w-7" />
              </span>
              <h3 className="mt-6 font-clash text-2xl font-semibold leading-snug">{title}</h3>
              <p className={cn('mt-3 flex-1 text-[15px] leading-relaxed', muted)}>{text}</p>
              <Link to={to} className="mt-6 inline-flex items-center gap-1 font-semibold">
                {cta} <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Link>
            </motion.div>
          </StaggerItem>
        ))}
      </Stagger>

      <Stagger className="mt-14 grid grid-cols-2 gap-4 rounded-3xl border border-border bg-muted/30 p-6 sm:p-8 lg:grid-cols-4">
        {FACTS.map((f) => (
          <StaggerItem key={f.label} className="text-center lg:text-left">
            <p className="font-clash text-4xl font-semibold text-foreground sm:text-5xl">
              {f.prefix}<CountUp to={f.to} />
            </p>
            <p className="mt-1 font-semibold text-foreground">{f.label}</p>
            <p className="text-sm text-muted-foreground">{f.note}</p>
          </StaggerItem>
        ))}
      </Stagger>
    </div>
  </section>
);

export default Services;
