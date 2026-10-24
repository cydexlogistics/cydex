import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Instagram, Linkedin, Loader2, Mail, MapPin, MessageCircle, Phone, SendHorizonal, Twitter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import SiteLayout from '@/components/site/SiteLayout';
import { Eyebrow, Reveal, Stagger, StaggerItem } from '@/components/site/motion';
import { supabase } from '@/integrations/supabase/client';
import { errorMessage } from '@/lib/address';
import { CONTACT_EMAIL } from '@/lib/site';
import { cn } from '@/lib/utils';

const PHONE = '+2348028985352';

const TOPICS = [
  { key: 'general', label: 'General' },
  { key: 'orders', label: 'An order' },
  { key: 'vendors', label: 'Selling on Cydex' },
  { key: 'riders', label: 'Riding with Cydex' },
  { key: 'partnerships', label: 'Partnerships' },
  { key: 'press', label: 'Press' },
] as const;

const CHANNELS = [
  { icon: Mail, title: 'Email us', value: CONTACT_EMAIL, href: `mailto:${CONTACT_EMAIL}` },
  { icon: Phone, title: 'Call us', value: '+234 802 898 5352', href: `tel:${PHONE}` },
  { icon: MessageCircle, title: 'WhatsApp', value: 'Chat with us', href: `https://wa.me/${PHONE.replace('+', '')}` },
  { icon: MapPin, title: 'Where we are', value: 'Lagos, Nigeria', href: null },
];

const SOCIALS = [
  { href: 'https://www.instagram.com/cydexlogistics', label: 'Instagram', icon: Instagram },
  { href: 'https://www.linkedin.com/company/cydexlogistics', label: 'LinkedIn', icon: Linkedin },
  { href: 'https://x.com/cydexlogistics', label: 'X (Twitter)', icon: Twitter },
];

type Form = { name: string; email: string; phone: string; topic: string; message: string };
const EMPTY: Form = { name: '', email: '', phone: '', topic: 'general', message: '' };

const validate = (f: Form) => ({
  name: f.name.trim().length < 2 ? 'Enter your name.' : null,
  email: !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim()) ? 'Enter a valid email address.' : null,
  phone: f.phone.trim() && !/^\+?[0-9 ()-]{7,20}$/.test(f.phone.trim()) ? 'Enter a valid phone number, or leave it empty.' : null,
  message: f.message.trim().length < 10 ? 'Write a message of at least 10 characters.' : null,
});

const Contact = () => {
  const [form, setForm] = useState<Form>(EMPTY);
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const errors = validate(form);
  const valid = Object.values(errors).every((e) => !e);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setFailure(null);
    if (!valid) return;
    setSending(true);
    const { error } = await supabase.rpc('submit_contact_message', {
      p_name: form.name.trim(), p_email: form.email.trim(), p_message: form.message.trim(),
      p_topic: form.topic, p_phone: form.phone.trim() || undefined,
    });
    setSending(false);
    if (error) return setFailure(errorMessage(error, 'Your message could not be sent. Please try again or email us.'));
    setSentTo(form.email.trim());
    setForm(EMPTY);
    setTouched(false);
  };

  const fieldError = (k: keyof typeof errors) => touched && errors[k] && <p className="text-sm text-destructive">{errors[k]}</p>;

  return (
    <SiteLayout>
      <section className="relative overflow-hidden bg-gradient-to-b from-primary-light to-background pb-10 pt-28 dark:from-[#0F1A0C] sm:pt-36">
        <div className="container mx-auto max-w-3xl space-y-5 px-4 text-center sm:px-6">
          <Reveal><Eyebrow>Contact us</Eyebrow></Reveal>
          <Reveal delay={0.05}>
            <h1 className="font-clash text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl">Let's talk</h1>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mx-auto max-w-xl text-base text-muted-foreground sm:text-lg">
              Questions about an order, selling or riding with Cydex, or working together? Send us a message.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="pb-20 sm:pb-28">
        <div className="container mx-auto grid max-w-screen-xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr]">
          {/* Ways to reach us */}
          <div className="space-y-4">
            <Stagger className="grid grid-cols-1 gap-3 xs:grid-cols-2 lg:grid-cols-1">
              {CHANNELS.map(({ icon: Icon, title, value, href }) => {
                const inner = (
                  <>
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-[#3F8500] transition-colors group-hover:bg-primary group-hover:text-black dark:text-primary">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm text-muted-foreground">{title}</span>
                      <span className="block truncate font-semibold text-foreground">{value}</span>
                    </span>
                  </>
                );
                return (
                  <StaggerItem key={title}>
                    {href ? (
                      <motion.a whileHover={{ x: 4 }} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer"
                        className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
                        {inner}
                      </motion.a>
                    ) : (
                      <div className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm">{inner}</div>
                    )}
                  </StaggerItem>
                );
              })}
            </Stagger>
            <Reveal delay={0.2}>
              <div className="rounded-2xl border border-border bg-card p-5">
                <p className="text-sm font-semibold text-foreground">Follow us</p>
                <div className="mt-3 flex gap-2">
                  {SOCIALS.map(({ href, label, icon: Icon }) => (
                    <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-primary hover:text-black">
                      <Icon className="h-4 w-4" />
                    </a>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>

          {/* The form */}
          <Reveal delay={0.1}>
            <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-xl sm:p-8">
              <AnimatePresence mode="wait">
                {sentTo ? (
                  <motion.div key="sent" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center py-12 text-center">
                    <motion.span
                      initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 15, delay: 0.1 }}
                      className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-black"
                    >
                      <CheckCircle2 className="h-10 w-10" />
                    </motion.span>
                    <h2 className="mt-6 font-clash text-2xl font-semibold text-foreground">Message sent</h2>
                    <p className="mt-2 max-w-sm text-muted-foreground">Thanks for reaching out. We'll reply to <span className="font-semibold text-foreground">{sentTo}</span> as soon as we can.</p>
                    <Button variant="outline" className="mt-6 rounded-full" onClick={() => setSentTo(null)}>Send another message</Button>
                  </motion.div>
                ) : (
                  <motion.form key="form" onSubmit={submit} noValidate initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5">
                    <div>
                      <h2 className="font-clash text-2xl font-semibold text-foreground">Send us a message</h2>
                      <p className="text-sm text-muted-foreground">It goes straight to our team at {CONTACT_EMAIL}.</p>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-foreground">What's it about?</Label>
                      <div className="flex flex-wrap gap-2">
                        {TOPICS.map(({ key, label }) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setForm({ ...form, topic: key })}
                            aria-pressed={form.topic === key}
                            className={cn('rounded-full border px-3.5 py-1.5 text-sm transition-colors',
                              form.topic === key ? 'border-primary bg-primary text-black' : 'border-border text-muted-foreground hover:border-primary/60 hover:text-foreground')}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid gap-5 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="c-name" className="text-foreground">Your name</Label>
                        <Input id="c-name" value={form.name} onChange={set('name')} maxLength={100} autoComplete="name" placeholder="Ada Obi" aria-invalid={touched && !!errors.name} />
                        {fieldError('name')}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="c-email" className="text-foreground">Email</Label>
                        <Input id="c-email" type="email" value={form.email} onChange={set('email')} maxLength={200} autoComplete="email" placeholder="you@example.com" aria-invalid={touched && !!errors.email} />
                        {fieldError('email')}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="c-phone" className="text-foreground">Phone <span className="font-normal text-muted-foreground">(optional)</span></Label>
                      <Input id="c-phone" type="tel" value={form.phone} onChange={set('phone')} maxLength={20} autoComplete="tel" placeholder="+234 800 000 0000" aria-invalid={touched && !!errors.phone} />
                      {fieldError('phone')}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="c-message" className="text-foreground">Message</Label>
                      <Textarea id="c-message" value={form.message} onChange={set('message')} rows={6} maxLength={5000} placeholder="How can we help? If it's about an order, include the order number." aria-invalid={touched && !!errors.message} />
                      <div className="flex justify-between gap-2">
                        {fieldError('message') || <span />}
                        <span className="text-xs text-muted-foreground">{form.message.length}/5000</span>
                      </div>
                    </div>

                    {failure && <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{failure}</p>}

                    <Button type="submit" size="lg" disabled={sending} className="group h-12 w-full rounded-full text-base text-black hover:bg-primary-hover">
                      {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <SendHorizonal className="mr-2 h-4 w-4 transition-transform group-hover:translate-x-1" />}
                      {sending ? 'Sending...' : 'Send message'}
                    </Button>
                  </motion.form>
                )}
              </AnimatePresence>
            </div>
          </Reveal>
        </div>
      </section>
    </SiteLayout>
  );
};

export default Contact;
