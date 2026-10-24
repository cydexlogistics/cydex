import { motion } from 'framer-motion';
import { BadgeCheck, BellRing, KeyRound, ShieldCheck, Star, Undo2 } from 'lucide-react';
import { SectionHeading, Stagger, StaggerItem } from '../motion';

const FEATURES = [
  { icon: KeyRound, title: 'Code-checked handovers', text: 'The rider shows a pickup code at the store, and you give a delivery code at the door. Orders only change hands with the right code.' },
  { icon: BadgeCheck, title: 'Verified vendors and riders', text: "Businesses and riders are checked by our team before they can trade or deliver." },
  { icon: ShieldCheck, title: 'Secure payments', text: 'Pay by card, bank transfer or your Cydex wallet. Card payments are processed securely; we never see your card details.' },
  { icon: Undo2, title: 'Refunds to your wallet', text: 'If a vendor rejects your order, or you cancel before they accept, the full amount goes back to your wallet straight away.' },
  { icon: BellRing, title: 'Updates at every step', text: 'Notifications when your order is accepted, ready, picked up, nearby and delivered.' },
  { icon: Star, title: 'Ratings that count', text: 'Rate vendors and riders after every order, so good service rises to the top.' },
];

const Trust = () => (
  <section className="bg-muted/40 py-20 sm:py-28">
    <div className="container mx-auto max-w-screen-xl px-4 sm:px-6">
      <SectionHeading
        eyebrow="Built for trust"
        title="Your order, safe from door to door"
        intro="Every delivery is checked at each handover, and your money is protected if something goes wrong."
      />
      <Stagger className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <StaggerItem key={title}>
            <motion.div
              whileHover={{ y: -6 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              className="group h-full rounded-2xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-lg"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-[#3F8500] transition-colors group-hover:bg-primary group-hover:text-black dark:text-primary">
                <Icon className="h-6 w-6" />
              </span>
              <h3 className="mt-5 font-clash text-xl font-semibold text-foreground">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
            </motion.div>
          </StaggerItem>
        ))}
      </Stagger>
    </div>
  </section>
);

export default Trust;
