import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { HandCoins, Leaf, MapPinned, Receipt } from 'lucide-react';
import { Eyebrow, Reveal, Stagger, StaggerItem } from '../motion';

const PILLARS = [
  { icon: Leaf, title: 'Small vehicles first', text: 'Walking, bicycles and e-bikes handle most local trips. Motorbikes only go when the distance needs it.' },
  { icon: MapPinned, title: 'Local by design', text: "You order from vendors close to you, so trips are short. We only show vendors your delivery mode can reach." },
  { icon: HandCoins, title: 'Fair to riders', text: 'Riders keep most of every delivery fee, paid to their wallet as soon as the delivery is done.' },
  { icon: Receipt, title: 'Paperless', text: 'Receipts, delivery codes and updates live in the app and your inbox. Nothing printed, nothing wasted.' },
];

// Dark band: why sustainability is at the core, with a route that draws itself as you scroll
const Sustainability = () => {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const draw = useTransform(scrollYProgress, [0.1, 0.6], [0, 1]);

  return (
    <section ref={ref} className="relative overflow-hidden bg-[#0F1A0C] py-20 text-white sm:py-28">
      {/* A delivery route drawing across the background */}
      <svg aria-hidden viewBox="0 0 1200 400" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full opacity-40">
        <motion.path
          d="M -20 320 C 180 320, 220 120, 420 140 S 680 330, 860 250 S 1100 60, 1230 90"
          fill="none" stroke="#6CE000" strokeWidth="3" strokeDasharray="1 0" strokeLinecap="round"
          style={{ pathLength: draw }}
        />
        <motion.circle r="9" fill="#6CE000" style={{ opacity: draw }} cx="1230" cy="90" />
      </svg>
      <div aria-hidden className="pointer-events-none absolute -left-32 top-1/2 h-96 w-96 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl" />

      <div className="container relative mx-auto max-w-screen-xl px-4 sm:px-6">
        <div className="grid items-end gap-10 lg:grid-cols-2">
          <Reveal className="space-y-5">
            <Eyebrow className="border-primary/40 bg-primary/10 text-primary">Sustainability at our core</Eyebrow>
            <h2 className="font-clash text-3xl font-semibold leading-tight sm:text-4xl lg:text-5xl">
              Green isn't a feature. <span className="text-primary">It's how we deliver.</span>
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="text-base text-white/70 sm:text-lg">
              Most deliveries in a city are short. They don't need a car or a van. Cydex is built around that idea,
              from how riders travel to which vendors you see.
            </p>
          </Reveal>
        </div>

        <Stagger className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map(({ icon: Icon, title, text }) => (
            <StaggerItem key={title}>
              <motion.div
                whileHover={{ y: -6, backgroundColor: 'rgba(108,224,0,0.08)' }}
                className="h-full rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-black">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-5 font-clash text-xl font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/65">{text}</p>
              </motion.div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
};

export default Sustainability;
