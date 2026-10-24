import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Smartphone } from 'lucide-react';
import DownloadAppDialog from '@/components/pwa/DownloadAppDialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { FAQS } from '../faqData';
import { Reveal, SectionHeading } from '../motion';

// A few questions, then the last call to action
const Closing = () => {
  const [installOpen, setInstallOpen] = useState(false);
  return (
    <>
      <section className="py-20 sm:py-28">
        <div className="container mx-auto grid max-w-screen-xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr]">
          <SectionHeading
            center={false}
            eyebrow="Questions"
            title="Good to know"
            intro={<>The questions we hear most. There's more on our <Link to="/faq" className="font-semibold text-foreground underline decoration-primary decoration-2 underline-offset-4">FAQ page</Link>.</>}
          />
          <Reveal>
            <Accordion type="single" collapsible className="space-y-3">
              {FAQS.filter((f) => f.featured).map((f, i) => (
                <AccordionItem key={f.q} value={`q${i}`} className="rounded-2xl border border-border bg-card px-5 data-[state=open]:border-primary/50 data-[state=open]:shadow-md">
                  <AccordionTrigger className="text-left font-clash text-base font-semibold hover:no-underline sm:text-lg">{f.q}</AccordionTrigger>
                  <AccordionContent className="text-[15px] leading-relaxed text-muted-foreground">{f.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Reveal>
        </div>
      </section>

      <section className="px-4 pb-20 sm:px-6 sm:pb-28">
        <Reveal>
          <div className="relative mx-auto max-w-screen-xl overflow-hidden rounded-[2.5rem] bg-primary px-6 py-14 text-center text-black sm:px-12 sm:py-20">
            {/* Rings that slowly grow and fade */}
            <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="absolute h-72 w-72 rounded-full border-2 border-black/10"
                  animate={{ scale: [0.6, 2.4], opacity: [0.6, 0] }}
                  transition={{ duration: 6, repeat: Infinity, delay: i * 2, ease: 'easeOut' }}
                />
              ))}
            </div>
            <div className="relative space-y-6">
              <h2 className="mx-auto max-w-2xl font-clash text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
                Your next delivery can be a greener one.
              </h2>
              <p className="mx-auto max-w-xl text-base text-black/70 sm:text-lg">
                Sign up in a minute. It's free for customers, vendors and riders.
              </p>
              <div className="flex flex-col justify-center gap-3 xs:flex-row">
                <Button asChild size="lg" className="h-12 rounded-full bg-black px-7 text-base text-white hover:bg-black/85">
                  <Link to="/auth?tab=register">Get started <ArrowRight className="ml-1 h-4 w-4" /></Link>
                </Button>
                <Button size="lg" variant="outline" onClick={() => setInstallOpen(true)} className="h-12 rounded-full border-black/20 bg-white/40 px-7 text-base text-black hover:bg-white/70">
                  <Smartphone className="mr-1 h-4 w-4" /> Get the app
                </Button>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
      <DownloadAppDialog open={installOpen} onOpenChange={setInstallOpen} />
    </>
  );
};

export default Closing;
