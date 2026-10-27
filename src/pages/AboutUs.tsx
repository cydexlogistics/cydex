import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'framer-motion';
import { ArrowRight, Footprints, HandCoins, Heart, KeyRound, Leaf, MapPinned, Rocket, Sparkles, Sprout, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SiteLayout from '@/components/site/SiteLayout';
import { Eyebrow, Reveal, SectionHeading, Stagger, StaggerItem } from '@/components/site/motion';

const JOURNEY = [
  {
    when: '2023', icon: Sprout, title: 'Cydex is founded',
    text: 'It started with a simple observation: most deliveries in our cities are short trips, yet they are usually made with motorbikes and cars. We asked what delivery would look like if it started with the smallest vehicle that could do the job.',
  },
  {
    when: 'Building', icon: Wrench, title: 'From idea to platform',
    text: 'We spoke to local vendors and riders and built the pieces a delivery service needs: ordering, a vendor dashboard, a rider app, wallets, secure payments and code-checked handovers.',
  },
  {
    when: 'Today', icon: Rocket, title: 'Delivering, the green way',
    text: 'Customers order from vendors near them and send packages with Cydex Express. Businesses request riders for their own orders. Riders deliver on foot, by bicycle, by e-bike, and by motorbike only for longer trips.',
  },
  {
    when: 'Next', icon: MapPinned, title: 'More places, more people',
    text: 'We are growing area by area, bringing on more vendors and riders, and improving how trips are planned and grouped so each delivery travels less.',
  },
];

const VALUES = [
  { icon: Leaf, title: 'Planet first', text: 'We default to walking, bicycles and e-bikes, and only use motorbikes when the distance needs it.' },
  { icon: MapPinned, title: 'Local first', text: 'We connect you with businesses near you, which keeps trips short and money in the neighbourhood.' },
  { icon: HandCoins, title: 'Fair to riders', text: 'Riders keep most of every delivery fee and are paid as soon as each delivery is done.' },
  { icon: KeyRound, title: 'Trust at every handover', text: 'Pickup and delivery codes, verified vendors and riders, and refunds when things go wrong.' },
  { icon: Sparkles, title: 'Simple to use', text: 'Clear prices before you pay, updates at every step, and one app for customers, vendors and riders.' },
  { icon: Heart, title: 'Built in Nigeria', text: 'Made for how our cities work: campuses, estates, busy roads and the businesses that serve them.' },
];

// The journey, with a line that fills in as you scroll
const Journey = () => {
  const ref = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 75%', 'end 60%'] });
  const height = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);
  return (
    <ol ref={ref} className="relative mx-auto max-w-3xl space-y-10 pl-12 sm:pl-16">
      <span aria-hidden className="absolute bottom-2 left-[1.15rem] top-2 w-0.5 rounded-full bg-border sm:left-[1.65rem]" />
      <motion.span aria-hidden style={{ height }} className="absolute left-[1.15rem] top-2 w-0.5 rounded-full bg-primary sm:left-[1.65rem]" />
      {JOURNEY.map(({ when, icon: Icon, title, text }, i) => (
        <Reveal as="li" key={title} delay={i * 0.05} className="relative">
          <span className="absolute -left-12 top-0 flex h-10 w-10 items-center justify-center rounded-full border-4 border-background bg-primary text-black shadow sm:-left-16 sm:h-14 sm:w-14">
            <Icon className="h-4 w-4 sm:h-6 sm:w-6" />
          </span>
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <p className="font-clash text-sm font-semibold uppercase tracking-wider text-[#3F8500] dark:text-primary">{when}</p>
            <h3 className="mt-1 font-clash text-xl font-semibold text-foreground sm:text-2xl">{title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{text}</p>
          </div>
        </Reveal>
      ))}
    </ol>
  );
};

const AboutUs = () => (
  <SiteLayout>
    {/* Intro */}
    <section className="relative overflow-hidden bg-gradient-to-b from-primary-light to-background pb-16 pt-28 dark:from-[#0F1A0C] sm:pt-36">
      <div className="container mx-auto grid max-w-screen-xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
        <div className="space-y-6 text-center lg:text-left">
          <Reveal><Eyebrow>About Cydex</Eyebrow></Reveal>
          <Reveal delay={0.05}>
            <h1 className="font-clash text-4xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Local delivery that's <span className="text-primary">kinder to the planet</span>
            </h1>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mx-auto max-w-xl text-base text-muted-foreground sm:text-lg lg:mx-0">
              Cydex is a Nigerian delivery company founded in 2023. We connect people with the businesses around them,
              and deliver with the smallest vehicle that can do the job: on foot, by bicycle and e-bike first.
            </p>
          </Reveal>
        </div>
        {/* Three riders, one for each way we deliver */}
        <div className="relative mx-auto grid w-full max-w-md grid-cols-2 gap-4">
          {[
            { src: '/landing/rider-walking.png', label: 'On foot', icon: Footprints, className: 'row-span-2 aspect-[3/5]' },
            { src: '/landing/rider-bicycle.jpg', label: 'Bicycle', icon: Leaf, className: 'aspect-square' },
            { src: '/landing/rider-ebike.jpg', label: 'E-bike', icon: Sparkles, className: 'aspect-square' },
          ].map(({ src, label, icon: Icon, className }, i) => (
            <motion.figure
              key={label}
              initial={{ opacity: 0, y: 40, rotate: i === 0 ? -4 : 4 }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              transition={{ duration: 0.8, delay: 0.15 + i * 0.15, ease: [0.22, 1, 0.36, 1] }}
              whileHover={{ scale: 1.03 }}
              className={`relative overflow-hidden rounded-3xl border-4 border-background shadow-xl ${className}`}
            >
              <img src={src} alt={`A Cydex rider delivering ${label.toLowerCase()}`} className="h-full w-full object-cover" />
              <figcaption className="absolute bottom-3 left-3 flex items-center gap-1 rounded-full bg-background/90 px-3 py-1 text-xs font-semibold text-foreground backdrop-blur">
                <Icon className="h-3.5 w-3.5 text-primary" /> {label}
              </figcaption>
            </motion.figure>
          ))}
        </div>
      </div>
    </section>

    {/* Mission */}
    <section className="py-20 sm:py-24">
      <div className="container mx-auto max-w-4xl px-4 text-center sm:px-6">
        <Reveal>
          <p className="font-clash text-2xl font-medium leading-snug text-foreground sm:text-3xl lg:text-4xl">
            “Our mission is to make everyday delivery <span className="text-primary">cleaner, fairer and more local</span>,
            without making it slower or harder to use.”
          </p>
        </Reveal>
      </div>
    </section>

    {/* Journey */}
    <section className="bg-muted/40 py-20 sm:py-28">
      <div className="container mx-auto max-w-screen-xl px-4 sm:px-6">
        <SectionHeading eyebrow="Our journey" title="Where we've come from" intro="We're a young company, and we're honest about it. Here's where we are." />
        <Journey />
      </div>
    </section>

    {/* Values */}
    <section className="py-20 sm:py-28">
      <div className="container mx-auto max-w-screen-xl px-4 sm:px-6">
        <SectionHeading eyebrow="What we stand for" title="Our values" />
        <Stagger className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {VALUES.map(({ icon: Icon, title, text }) => (
            <StaggerItem key={title}>
              <motion.div
                whileHover={{ y: -6 }}
                className="group h-full rounded-2xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-lg"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-[#3F8500] transition-all group-hover:rotate-6 group-hover:bg-primary group-hover:text-black dark:text-primary">
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

    {/* Join */}
    <section className="px-4 pb-20 sm:px-6 sm:pb-28">
      <Reveal>
        <div className="mx-auto flex max-w-screen-xl flex-col items-center gap-6 rounded-[2.5rem] bg-[#0F1A0C] px-6 py-14 text-center text-white sm:px-12">
          <h2 className="max-w-2xl font-clash text-3xl font-semibold leading-tight sm:text-4xl">Be part of greener delivery</h2>
          <p className="max-w-xl text-white/70">Order, sell or ride with Cydex. Or tell us how we can work together.</p>
          <div className="flex flex-col gap-3 xs:flex-row">
            <Button asChild size="lg" className="rounded-full px-7 text-black hover:bg-primary-hover">
              <Link to="/auth?tab=register">Join Cydex <ArrowRight className="ml-1 h-4 w-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full border-white/20 bg-transparent px-7 text-white hover:bg-white/10 hover:text-white">
              <Link to="/contact">Contact us</Link>
            </Button>
          </div>
        </div>
      </Reveal>
    </section>
  </SiteLayout>
);

export default AboutUs;
