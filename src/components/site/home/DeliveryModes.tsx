import { motion } from 'framer-motion';
import { Bike, Footprints, Leaf, Zap } from 'lucide-react';
import { SectionHeading, Stagger, StaggerItem } from '../motion';
import { cn } from '@/lib/utils';

const MODES = [
  {
    name: 'EcoChampions', how: 'On foot', icon: Footprints, photo: '/landing/rider-walking.png',
    text: 'For short trips around campus, estates and busy streets. Zero emissions.', badge: 'Zero emissions',
  },
  {
    name: 'Bicycle', how: 'Pedal power', icon: Bike, photo: '/landing/rider-bicycle.jpg',
    text: 'Quick through traffic and quiet on the road. Zero emissions.', badge: 'Zero emissions',
  },
  {
    name: 'E-bike', how: 'Electric', icon: Zap, photo: '/landing/rider-ebike.jpg',
    text: 'Goes further with a little help from a battery. Very low emissions.', badge: 'Low emissions',
  },
  {
    name: 'Motorbike', how: 'For longer trips', icon: Bike, photo: null,
    text: "Only when the distance needs it. We'd rather send the smallest vehicle that can do the job.", badge: 'When needed',
  },
];

// The four ways a delivery can travel
const DeliveryModes = () => (
  <section className="py-20 sm:py-28">
    <div className="container mx-auto max-w-screen-xl px-4 sm:px-6">
      <SectionHeading
        eyebrow={<><Leaf className="h-3.5 w-3.5" /> Pick how it travels</>}
        title="The smallest vehicle that does the job"
        intro="At checkout you choose how your order travels. Each mode has its own price per km and how far it goes, so short trips stay cheap and clean."
      />
      <Stagger className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {MODES.map(({ name, how, icon: Icon, photo, text, badge }) => (
          <StaggerItem key={name}>
            <motion.article
              whileHover={{ y: -10 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              className="group relative h-[22rem] overflow-hidden rounded-3xl border border-border bg-card shadow-sm"
            >
              {photo ? (
                <img src={photo} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-zinc-700 via-zinc-800 to-zinc-950">
                  <Icon className="absolute -right-6 top-6 h-48 w-48 text-white/10 transition-transform duration-700 group-hover:-rotate-12" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
              <span className={cn('absolute left-4 top-4 rounded-full px-3 py-1 text-xs font-semibold',
                photo ? 'bg-primary text-black' : 'bg-white/15 text-white backdrop-blur')}>
                {badge}
              </span>
              <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-white/70"><Icon className="h-3.5 w-3.5" /> {how}</p>
                <h3 className="mt-1 font-clash text-2xl font-semibold">{name}</h3>
                <p className="mt-2 max-h-0 overflow-hidden text-sm text-white/80 opacity-0 transition-all duration-500 group-hover:max-h-24 group-hover:opacity-100 max-lg:max-h-24 max-lg:opacity-100">
                  {text}
                </p>
              </div>
            </motion.article>
          </StaggerItem>
        ))}
      </Stagger>
    </div>
  </section>
);

export default DeliveryModes;
