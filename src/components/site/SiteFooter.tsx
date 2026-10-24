import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Check, Instagram, Linkedin, Loader2, Mail, Twitter } from 'lucide-react';
import { toast } from 'sonner';
import DownloadAppDialog from '@/components/pwa/DownloadAppDialog';
import { supabase } from '@/integrations/supabase/client';
import { errorMessage } from '@/lib/address';
import { CONTACT_EMAIL } from '@/lib/site';

const SOCIALS = [
  { href: 'https://www.instagram.com/cydexlogistics', label: 'Instagram', icon: Instagram },
  { href: 'https://www.linkedin.com/company/cydexlogistics', label: 'LinkedIn', icon: Linkedin },
  { href: 'https://x.com/cydexlogistics', label: 'X (Twitter)', icon: Twitter },
];

const COLUMNS = [
  {
    title: 'Cydex',
    links: [
      { to: '/#how-it-works', label: 'How it works' },
      { to: '/about', label: 'About us' },
      { to: '/faq', label: 'FAQ' },
      { to: '/contact', label: 'Contact us' },
    ],
  },
  {
    title: 'Get started',
    links: [
      { to: '/auth?tab=register', label: 'Order with Cydex' },
      { to: '/auth?tab=register&role=vendor', label: 'Sell on Cydex' },
      { to: '/auth?tab=register&role=rider', label: 'Ride with Cydex' },
      { to: '/auth', label: 'Log in' },
    ],
  },
  {
    title: 'Legal',
    links: [{ to: '/privacy-policy', label: 'Privacy policy' }],
  },
];

// Newsletter sign-up: saves the email (subscribe_newsletter)
const Newsletter = () => {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'done'>('idle');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('saving');
    const { data, error } = await supabase.rpc('subscribe_newsletter', { p_email: email.trim(), p_source: 'footer' });
    if (error) {
      setState('idle');
      return toast.error(errorMessage(error, 'Could not sign you up. Please try again.'));
    }
    setState('done');
    setEmail('');
    toast.success(data ? "You're subscribed. Thanks for joining us!" : "You're already on our list.");
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="font-clash text-lg font-semibold text-white">Stay in the loop</p>
      <p className="text-sm text-white/60">News, new vendors and offers near you. No spam.</p>
      <div className="flex overflow-hidden rounded-full border border-white/15 bg-white/5 focus-within:border-primary">
        <label htmlFor="newsletter-email" className="sr-only">Email address</label>
        <input
          id="newsletter-email"
          type="email"
          required
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (state === 'done') setState('idle'); }}
          placeholder="you@example.com"
          className="min-w-0 flex-1 bg-transparent px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:outline-none"
        />
        <button
          type="submit"
          disabled={state === 'saving'}
          aria-label="Subscribe"
          className="m-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-black transition-transform hover:scale-105 disabled:opacity-70"
        >
          {state === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" />
            : state === 'done' ? <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}><Check className="h-4 w-4" /></motion.span>
              : <ArrowRight className="h-4 w-4" />}
        </button>
      </div>
    </form>
  );
};

// The public website's footer (dark in both themes)
const SiteFooter = () => {
  const [installOpen, setInstallOpen] = useState(false);
  return (
    <footer className="relative overflow-hidden border-t border-white/5 bg-[#0B1408] text-white">
      {/* Soft green glow */}
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[40rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      <div className="container relative mx-auto max-w-screen-xl px-4 py-14 sm:px-6 lg:py-20">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-[1.3fr_repeat(3,1fr)_1.5fr]">
          <div className="space-y-4">
            <img src="/lovable-uploads/525fd30a-476a-4e14-ae55-ec2b11d54013.png" alt="Cydex" className="h-9 w-auto invert" />
            <p className="max-w-xs text-sm text-white/60">
              Local delivery that's kinder to the planet: on foot, by bicycle and e-bike first.
            </p>
            <a href={`mailto:${CONTACT_EMAIL}`} className="inline-flex items-center gap-2 text-sm text-white/80 hover:text-primary">
              <Mail className="h-4 w-4" /> {CONTACT_EMAIL}
            </a>
            <div className="flex gap-2">
              {SOCIALS.map(({ href, label, icon: Icon }) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-white/80 transition-colors hover:bg-primary hover:text-black">
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/50">{col.title}</p>
              <ul className="space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link to={l.to} className="text-sm text-white/75 transition-colors hover:text-primary">{l.label}</Link>
                  </li>
                ))}
                {col.title === 'Cydex' && (
                  <li>
                    <button type="button" onClick={() => setInstallOpen(true)} className="text-sm text-white/75 transition-colors hover:text-primary">
                      Get the app
                    </button>
                  </li>
                )}
              </ul>
            </div>
          ))}
          <Newsletter />
        </div>
        <div className="mt-12 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-white/40 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Cydex Logistics. All rights reserved.</p>
          <p>Made in Nigeria 🇳🇬, delivered green.</p>
        </div>
      </div>
      <DownloadAppDialog open={installOpen} onOpenChange={setInstallOpen} />
    </footer>
  );
};

export default SiteFooter;
