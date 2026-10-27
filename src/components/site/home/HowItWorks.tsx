import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight, BadgeCheck, Bell, Bike, Boxes, CreditCard, KeyRound, MapPin, Navigation, PackageCheck, Power, Store, Wallet,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionHeading } from '../motion';
import { cn } from '@/lib/utils';

type Role = 'customers' | 'vendors' | 'riders';
type Step = { icon: LucideIcon; title: string; text: string };

const FLOWS: Record<Role, { label: string; photo: string; cta: string; to: string; steps: Step[] }> = {
  customers: {
    label: 'Customers',
    photo: '/landing/rider-bicycle.jpg',
    cta: 'Create a free account',
    to: '/auth?tab=register',
    steps: [
      { icon: MapPin, title: 'Add your address', text: "Tell us where to deliver and we'll show the restaurants and shops close enough to reach you." },
      { icon: CreditCard, title: 'Order and pay', text: 'Choose how it travels (on foot, bicycle, e-bike or motorbike) and pay by card, bank transfer or your Cydex wallet.' },
      { icon: Bell, title: 'Follow it live', text: 'See when the vendor accepts, when your order is ready and when your rider is on the way.' },
      { icon: KeyRound, title: 'Share your code', text: 'Give the rider your 4-digit delivery code at the door. No code, no handover. Then rate your order.' },
    ],
  },
  vendors: {
    label: 'Vendors',
    photo: '/landing/rider-walking.png',
    cta: 'Open your store',
    to: '/auth?tab=register&role=vendor',
    steps: [
      { icon: Store, title: 'Open your store', text: 'Sign up, add your business details and get verified. Set your opening hours and preparation time.' },
      { icon: Boxes, title: 'Add your products', text: 'Prices, photos, stock and discounts. Customers nearby see your store as soon as you are live.' },
      { icon: Bell, title: 'Accept and prepare', text: "You're alerted to every new order. Accept it, mark it ready, and nearby riders are notified." },
      { icon: Wallet, title: 'Get paid', text: "Enter the rider's pickup code at handover. Your earnings reach your wallet when it's delivered, ready to withdraw." },
    ],
  },
  riders: {
    label: 'Riders',
    photo: '/landing/rider-ebike.jpg',
    cta: 'Start riding',
    to: '/auth?tab=register&role=rider',
    steps: [
      { icon: BadgeCheck, title: 'Sign up and get verified', text: 'Choose how you deliver: on foot, bicycle, e-bike or motorbike. Upload your ID and vehicle details.' },
      { icon: Power, title: 'Go online', text: 'See orders ready for pickup near you, with the fee and distance, and accept the ones that suit you.' },
      { icon: Navigation, title: 'Pick up and deliver', text: "Show your pickup code at the store, then enter the customer's code at the door to complete it." },
      { icon: PackageCheck, title: 'Earn', text: 'Most of the delivery fee is yours, paid to your wallet on every delivery, plus rewards and daily challenges.' },
    ],
  },
};

const ROLES = Object.keys(FLOWS) as Role[];
const STEP_MS = 4500;

const HowItWorks = () => {
  const [role, setRole] = useState<Role>('customers');
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const flow = FLOWS[role];
  const current = flow.steps[step];

  // Plays through the steps until the visitor picks one
  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => setStep((s) => (s + 1) % flow.steps.length), STEP_MS);
    return () => clearTimeout(t);
  }, [step, paused, flow.steps.length]);

  const pickRole = (r: Role) => {
    setRole(r);
    setStep(0);
    setPaused(false);
  };

  return (
    <section id="how-it-works" className="scroll-mt-20 bg-muted/40 py-20 sm:py-28">
      <div className="container mx-auto max-w-screen-xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="How it works"
          title="Simple for everyone involved"
          intro="Cydex connects customers, local vendors and riders in one app. Here's how it works for each of them."
        />

        {/* Who you are */}
        <div className="mb-10 flex justify-center">
          <div role="tablist" aria-label="How it works for" className="relative flex max-w-full gap-1 overflow-x-auto rounded-full border border-border bg-background p-1.5 shadow-sm">
            {ROLES.map((r) => (
              <button
                key={r}
                role="tab"
                aria-selected={role === r}
                onClick={() => pickRole(r)}
                className={cn('relative shrink-0 rounded-full px-4 py-2 text-sm font-semibold capitalize transition-colors xs:normal-case sm:px-7',
                  role === r ? 'text-black' : 'text-muted-foreground hover:text-foreground')}
              >
                {role === r && (
                  <motion.span layoutId="how-pill" className="absolute inset-0 rounded-full bg-primary" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />
                )}
                <span className="relative"><span className="hidden xs:inline">For </span>{FLOWS[r].label.toLowerCase()}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          {/* Steps */}
          <ol className="relative space-y-3">
            {flow.steps.map((s, i) => {
              const active = i === step;
              const Icon = s.icon;
              return (
                <li key={`${role}-${s.title}`}>
                  <motion.button
                    type="button"
                    onClick={() => { setStep(i); setPaused(true); }}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.08 }}
                    className={cn(
                      'relative w-full overflow-hidden rounded-2xl border p-5 text-left transition-colors',
                      active ? 'border-primary/60 bg-background shadow-lg' : 'border-transparent hover:bg-background/60',
                    )}
                  >
                    <div className="flex gap-4">
                      <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors',
                        active ? 'bg-primary text-black' : 'bg-background text-muted-foreground')}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Step {i + 1}</p>
                        <p className="font-clash text-lg font-semibold text-foreground">{s.title}</p>
                        <AnimatePresence initial={false}>
                          {active && (
                            <motion.p
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden text-sm text-muted-foreground sm:text-[15px]"
                            >
                              <span className="block pt-1">{s.text}</span>
                            </motion.p>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                    {/* Time until the next step */}
                    {active && !paused && (
                      <motion.span
                        key={`${role}-${step}`}
                        className="absolute bottom-0 left-0 h-0.5 bg-primary"
                        initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ duration: STEP_MS / 1000, ease: 'linear' }}
                      />
                    )}
                  </motion.button>
                </li>
              );
            })}
            <li className="pt-3">
              <Button asChild className="rounded-full text-black hover:bg-primary-hover">
                <Link to={flow.to}>{flow.cta} <ArrowRight className="ml-1 h-4 w-4" /></Link>
              </Button>
            </li>
          </ol>

          {/* Picture of the current step */}
          <div className="relative mx-auto w-full max-w-md">
            <AnimatePresence mode="wait">
              <motion.div
                key={role}
                initial={{ opacity: 0, scale: 0.95, rotate: -2 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.95, rotate: 2 }}
                transition={{ duration: 0.5 }}
                className="overflow-hidden rounded-[2rem] border-4 border-background shadow-2xl"
              >
                <img src={flow.photo} alt="" className="aspect-[4/5] w-full object-cover" />
              </motion.div>
            </AnimatePresence>
            {/* Centred by the wrapper: framer-motion's transform would replace a translate class */}
            <div className="absolute inset-x-0 -bottom-6 flex justify-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={`${role}-${step}`}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.4 }}
                className="w-[85%] rounded-2xl border border-border bg-card p-4 shadow-xl"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-black">
                    {current && <current.icon className="h-5 w-5" />}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{flow.label} · step {step + 1} of {flow.steps.length}</p>
                    <p className="truncate font-semibold text-foreground">{current?.title}</p>
                  </div>
                  <Bike className="ml-auto h-5 w-5 shrink-0 text-primary" />
                </div>
              </motion.div>
            </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
