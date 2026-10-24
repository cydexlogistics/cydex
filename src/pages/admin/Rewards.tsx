import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Check, Gift, Loader2, Pencil, Plus, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import AdminPage from '@/components/admin/AdminPage';
import ReferralsAdmin from '@/components/admin/rewards/ReferralsAdmin';
import RewardIcon from '@/components/rewards/RewardIcon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useConfirm } from '@/contexts/ConfirmContext';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { errorMessage } from '@/lib/address';
import { formatNaira } from '@/lib/pricing';
import { TARGETS, describePromotion, type PromoTarget } from '@/lib/promotions';
import {
  AUDIENCE_LABELS, KIND_LABELS, METRICS, REWARD_COLORS, REWARD_ICONS, describeTask, inputToTarget, metricsFor,
  targetToInput, type RewardAudience, type RewardKind, type RewardMetric,
} from '@/lib/rewards';
import { cn } from '@/lib/utils';

type Reward = Database['public']['Functions']['admin_rewards']['Returns'][number];

type Draft = {
  id: string | null; title: string; description: string; audience: RewardAudience; kind: RewardKind; metric: RewardMetric;
  target: string; reward_type: 'wallet_bonus' | 'promotion'; reward_amount: string;
  promo_discount_type: 'percent' | 'flat'; promo_discount_value: string; promo_applies_to: PromoTarget;
  promo_valid_days: string; promo_uses: string; icon: string; color: string;
  // ends_at '' = no end
  starts_at: string; ends_at: string; is_active: boolean;
};

const STATES: Record<string, { label: string; className: string }> = {
  running: { label: 'Running', className: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300' },
  scheduled: { label: 'Scheduled', className: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300' },
  ended: { label: 'Ended', className: 'bg-muted text-muted-foreground' },
  off: { label: 'Switched off', className: 'bg-muted text-muted-foreground' },
};

// What a promotion reward can take money off, by who it's for (not items: that needs a business)
const promoTargets = (audience: RewardAudience) =>
  (Object.entries(TARGETS[audience]) as [PromoTarget, string][]).filter(([k]) => k !== 'items');

const toLocal = (iso: string) => format(new Date(iso), "yyyy-MM-dd'T'HH:mm");
const blank = (): Draft => ({
  id: null, title: '', description: '', audience: 'customer', kind: 'milestone', metric: 'orders_completed', target: '',
  reward_type: 'wallet_bonus', reward_amount: '', promo_discount_type: 'percent', promo_discount_value: '100',
  promo_applies_to: 'delivery_fee', promo_valid_days: '30', promo_uses: '1', icon: 'trophy', color: 'amber',
  starts_at: toLocal(new Date().toISOString()), ends_at: '', is_active: true,
});

const whole = (v: string, min: number, max: number) => Number.isInteger(Number(v)) && Number(v) >= min && Number(v) <= max;

// "₦500 wallet bonus" / "Free delivery fee for 1 order", as the person it's for reads it
const draftPrize = (d: Draft) => d.reward_type === 'wallet_bonus'
  ? `${formatNaira(Number(d.reward_amount) || 0)} wallet bonus`
  : `${describePromotion({ discount_type: d.promo_discount_type, discount_value: Number(d.promo_discount_value) || 0, applies_to: d.promo_applies_to }, d.audience)} for ${Number(d.promo_uses) || 1} order${Number(d.promo_uses) === 1 ? '' : 's'}`;

// Admin: achievements for customers, vendors and riders, and daily/weekly
// challenges for riders. Each one gives a wallet bonus or a personal offer
// when someone reaches it (once per person, or once per day/week for challenges).
const AdminRewards = () => {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: rewards = [], isLoading } = useQuery({
    queryKey: ['admin-rewards'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_rewards');
      if (error) throw error;
      return data ?? [];
    },
  });

  const target = Number(draft?.target);
  const fastest = draft?.metric === 'fastest_delivery';
  const ends = draft?.ends_at ? new Date(draft.ends_at) : null;
  const errors = draft ? {
    title: draft.title.trim().length < 2 ? 'Give it a title.' : null,
    target: !(target > 0) ? 'Enter a number above 0.' : null,
    reward: draft.reward_type === 'wallet_bonus'
      ? (!(Number(draft.reward_amount) > 0) || Number(draft.reward_amount) > 1_000_000 ? 'Enter an amount up to ₦1,000,000.' : null)
      : !(Number(draft.promo_discount_value) > 0) || (draft.promo_discount_type === 'percent' && Number(draft.promo_discount_value) > 100)
        ? 'Enter a discount above 0 (a percentage can be up to 100).'
        : !whole(draft.promo_uses, 1, 100) ? 'Orders it covers: 1 to 100.'
          : !whole(draft.promo_valid_days, 1, 365) ? 'Days to use it: 1 to 365.' : null,
    dates: !draft.starts_at ? 'Choose a start.' : ends && ends <= new Date(draft.starts_at) ? 'The end must be after the start.' : null,
  } : null;
  const valid = !!errors && Object.values(errors).every((e) => !e);

  const setAudience = (audience: RewardAudience) => draft && setDraft({
    ...draft,
    audience,
    metric: METRICS[draft.metric].audiences.includes(audience) ? draft.metric : metricsFor(audience)[0],
    // Challenges are for riders
    kind: audience === 'rider' ? draft.kind : 'milestone',
    promo_applies_to: promoTargets(audience).some(([k]) => k === draft.promo_applies_to) ? draft.promo_applies_to : promoTargets(audience)[0][0],
  });

  const setMetric = (metric: RewardMetric) => draft && setDraft({
    ...draft,
    metric,
    kind: metric === 'fastest_delivery' ? 'milestone' : draft.kind,
    target: metric === 'fastest_delivery' && !draft.target ? '1' : draft.target,
  });

  const save = async () => {
    if (!draft || !valid) return;
    const period = draft.kind === 'daily' ? ' Progress starts again every day (Nigerian time), and it can be earned once a day.'
      : draft.kind === 'weekly' ? ' Progress starts again every Monday, and it can be earned once a week.'
        : fastest ? ' It can be earned again each time they beat their own time.'
          : ' Each person can earn it once.';
    if (!(await confirm({
      title: draft.id ? `Are you sure you want to save “${draft.title.trim()}”?` : `Are you sure you want to create “${draft.title.trim()}”?`,
      description: `For ${AUDIENCE_LABELS[draft.audience].toLowerCase()}: ${describeTask(draft.metric, inputToTarget(draft.metric, target))} to get ${draftPrize(draft)}.${period} Progress counts from the start date${new Date(draft.starts_at) < new Date() ? ', which is in the past, so earlier activity counts too' : ''}.`,
      confirmLabel: 'Yes, save',
    }))) return;
    setSaving(true);
    const promo = draft.reward_type === 'promotion';
    const { error } = await supabase.rpc('admin_save_reward', {
      p_id: draft.id ?? undefined,
      p_title: draft.title.trim(),
      p_description: draft.description.trim() || undefined,
      p_audience: draft.audience,
      p_kind: draft.kind,
      p_metric: draft.metric,
      p_target: inputToTarget(draft.metric, target),
      p_reward_type: draft.reward_type,
      p_reward_amount: promo ? undefined : Number(draft.reward_amount),
      p_promo_discount_type: promo ? draft.promo_discount_type : undefined,
      p_promo_discount_value: promo ? Number(draft.promo_discount_value) : undefined,
      p_promo_applies_to: promo ? draft.promo_applies_to : undefined,
      p_promo_valid_days: Number(draft.promo_valid_days),
      p_promo_uses: Number(draft.promo_uses),
      p_icon: draft.icon,
      p_color: draft.color,
      p_starts_at: new Date(draft.starts_at).toISOString(),
      p_ends_at: draft.ends_at ? new Date(draft.ends_at).toISOString() : undefined,
      p_is_active: draft.is_active,
    });
    setSaving(false);
    if (error) return toast.error(errorMessage(error, 'Could not save the reward'));
    toast.success('Reward saved');
    setDraft(null);
    queryClient.invalidateQueries({ queryKey: ['admin-rewards'] });
  };

  const edit = (r: Reward) => setDraft({
    id: r.id, title: r.title, description: r.description ?? '', audience: r.audience as RewardAudience,
    kind: r.kind as RewardKind, metric: r.metric as RewardMetric, target: targetToInput(r.metric, Number(r.target)),
    reward_type: r.reward_type as Draft['reward_type'], reward_amount: r.reward_amount == null ? '' : String(r.reward_amount),
    promo_discount_type: (r.promo_discount_type ?? 'percent') as Draft['promo_discount_type'],
    promo_discount_value: r.promo_discount_value == null ? '100' : String(r.promo_discount_value),
    promo_applies_to: (r.promo_applies_to ?? promoTargets(r.audience as RewardAudience)[0][0]) as PromoTarget,
    promo_valid_days: String(r.promo_valid_days), promo_uses: String(r.promo_uses), icon: r.icon, color: r.color,
    starts_at: toLocal(r.starts_at), ends_at: r.ends_at ? toLocal(r.ends_at) : '', is_active: r.is_active,
  });

  const error = (msg: string | null | undefined) => msg && <p className="text-xs text-destructive">{msg}</p>;

  return (
    <AdminPage
      title="Rewards"
      icon={Trophy}
      description="Achievements for customers, vendors and riders, daily or weekly challenges for riders, and referral rewards."
    >
      <Tabs defaultValue="rewards">
        <TabsList>
          <TabsTrigger value="rewards">Rewards</TabsTrigger>
          <TabsTrigger value="referrals">Referrals</TabsTrigger>
        </TabsList>
        <TabsContent value="referrals"><ReferralsAdmin /></TabsContent>
        <TabsContent value="rewards" className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => setDraft(blank())}><Plus className="mr-1.5 h-4 w-4" /> New reward</Button>
      </div>
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{[0, 1].map((i) => <div key={i} className="h-16 animate-pulse rounded bg-muted" />)}</div>
          ) : rewards.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">No rewards yet. Create one to show it to the people it's for.</p>
          ) : (
            <ul className="divide-y">
              {rewards.map((r) => (
                <li key={r.id} className="flex items-start gap-3 p-3 sm:px-4">
                  <RewardIcon icon={r.icon} color={r.color} muted={r.state !== 'running'} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {r.title}
                      <Badge variant="outline" className={cn('border-transparent', STATES[r.state]?.className)}>{STATES[r.state]?.label ?? r.state}</Badge>
                      <Badge variant="outline">{AUDIENCE_LABELS[r.audience as RewardAudience]}</Badge>
                      <Badge variant="secondary">{KIND_LABELS[r.kind as RewardKind]}</Badge>
                    </p>
                    <p className="text-sm">{describeTask(r.metric, Number(r.target))}</p>
                    <p className="flex items-center gap-1 text-sm text-muted-foreground"><Gift className="h-3.5 w-3.5" /> {r.prize}</p>
                    <p className="text-xs text-muted-foreground">
                      From {format(new Date(r.starts_at), 'd MMM yyyy, HH:mm')}
                      {r.ends_at ? ` to ${format(new Date(r.ends_at), 'd MMM yyyy, HH:mm')}` : ', no end date'}
                      {' · '}Earned {Number(r.times_earned)} time{Number(r.times_earned) === 1 ? '' : 's'} by {Number(r.people)} {Number(r.people) === 1 ? 'person' : 'people'}
                      {Number(r.paid_out) > 0 && ` · ${formatNaira(Number(r.paid_out))} paid`}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => edit(r)}><Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit</Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!draft} onOpenChange={(o) => !o && !saving && setDraft(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.id ? 'Edit reward' : 'New reward'}</DialogTitle>
            <DialogDescription>Choose who it's for first; that decides what it can count.</DialogDescription>
          </DialogHeader>
          {draft && errors && (
            <div className="space-y-4">
              {/* How people will see it */}
              <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
                <RewardIcon icon={draft.icon} color={draft.color} />
                <div className="min-w-0">
                  <p className="font-medium">{draft.title.trim() || 'Reward title'}</p>
                  <p className="text-sm text-muted-foreground">
                    {draft.description.trim() || (target > 0 ? describeTask(draft.metric, inputToTarget(draft.metric, target)) : 'What they need to do')}
                  </p>
                  <p className="flex items-center gap-1 text-sm font-medium"><Gift className="h-3.5 w-3.5 text-primary" /> {draftPrize(draft)}</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rw-title">Title</Label>
                <Input id="rw-title" value={draft.title} maxLength={80} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="e.g. Complete 10 orders" />
                {error(errors.title)}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rw-desc">Write-up (optional)</Label>
                <Textarea id="rw-desc" value={draft.description} maxLength={300} rows={2} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Shown under the title. Leave empty to show the goal." />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Who it's for</Label>
                  <Select value={draft.audience} onValueChange={(v) => setAudience(v as RewardAudience)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(AUDIENCE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select value={draft.kind} onValueChange={(v) => setDraft({ ...draft, kind: v as RewardKind })} disabled={draft.audience !== 'rider' || fastest}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(KIND_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {draft.audience !== 'rider' && <p className="text-xs text-muted-foreground">Daily and weekly challenges are for riders.</p>}
                </div>
              </div>
              {draft.kind !== 'milestone' && (
                <p className="-mt-2 text-xs text-muted-foreground">
                  Shown on riders' Current Deliveries page while it runs. Progress starts again {draft.kind === 'daily' ? 'every day at midnight' : 'every Monday'} (Nigerian time).
                </p>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>What it counts</Label>
                  <Select value={draft.metric} onValueChange={(v) => setMetric(v as RewardMetric)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {metricsFor(draft.audience).map((m) => <SelectItem key={m} value={m}>{METRICS[m].label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rw-target">{METRICS[draft.metric].targetLabel}</Label>
                  <Input id="rw-target" type="number" min={0} step="any" value={draft.target} onChange={(e) => setDraft({ ...draft, target: e.target.value })} />
                  {error(errors.target)}
                </div>
              </div>
              <p className="-mt-2 text-xs text-muted-foreground">{METRICS[draft.metric].help}</p>

              <div className="space-y-3 rounded-lg border p-3">
                <div className="space-y-1.5">
                  <Label>Reward</Label>
                  <Select value={draft.reward_type} onValueChange={(v) => setDraft({ ...draft, reward_type: v as Draft['reward_type'] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="wallet_bonus">Wallet bonus</SelectItem>
                      <SelectItem value="promotion">Discount offer (e.g. free delivery)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {draft.reward_type === 'wallet_bonus' ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="rw-amount">Amount (₦)</Label>
                    <Input id="rw-amount" type="number" min={0} step="any" value={draft.reward_amount} onChange={(e) => setDraft({ ...draft, reward_amount: e.target.value })} />
                    <p className="text-xs text-muted-foreground">
                      {draft.audience === 'customer'
                        ? 'Added to their wallet and used first when they pay.'
                        : 'Added to their wallet balance, ready to withdraw.'} It shows in their transaction history and under Money → Rewards.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <Label>What it takes money off</Label>
                      <Select value={draft.promo_applies_to} onValueChange={(v) => setDraft({ ...draft, promo_applies_to: v as PromoTarget })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {promoTargets(draft.audience).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Discount</Label>
                        <Select value={draft.promo_discount_type} onValueChange={(v) => setDraft({ ...draft, promo_discount_type: v as Draft['promo_discount_type'] })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="percent">Percentage</SelectItem>
                            <SelectItem value="flat">Flat amount (₦)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="rw-off">{draft.promo_discount_type === 'percent' ? 'Percent off' : 'Amount off (₦)'}</Label>
                        <Input id="rw-off" type="number" min={0} step="any" value={draft.promo_discount_value} onChange={(e) => setDraft({ ...draft, promo_discount_value: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="rw-uses">Orders it covers</Label>
                        <Input id="rw-uses" type="number" min={1} max={100} step={1} value={draft.promo_uses} onChange={(e) => setDraft({ ...draft, promo_uses: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="rw-days">Days to use it</Label>
                        <Input id="rw-days" type="number" min={1} max={365} step={1} value={draft.promo_valid_days} onChange={(e) => setDraft({ ...draft, promo_valid_days: e.target.value })} />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      A personal offer only they can use, shown under "Offers for you" and applied automatically. 100% makes it free. Cydex pays for it.
                    </p>
                  </>
                )}
                {error(errors.reward)}
              </div>

              <div className="space-y-2">
                <Label>Icon</Label>
                <div className="grid grid-cols-7 gap-1.5">
                  {Object.entries(REWARD_ICONS).map(([key, Icon]) => (
                    <button
                      key={key}
                      type="button"
                      title={key}
                      aria-label={key}
                      aria-pressed={draft.icon === key}
                      onClick={() => setDraft({ ...draft, icon: key })}
                      className={cn(
                        'flex h-9 items-center justify-center rounded-md border transition-colors hover:bg-muted',
                        draft.icon === key && 'border-primary bg-primary/10 ring-1 ring-primary',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Colour</Label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(REWARD_COLORS).map(([key, c]) => (
                    <button
                      key={key}
                      type="button"
                      title={key}
                      aria-label={key}
                      aria-pressed={draft.color === key}
                      onClick={() => setDraft({ ...draft, color: key })}
                      className={cn('flex h-8 w-8 items-center justify-center rounded-full text-white ring-offset-2 ring-offset-background', c.swatch, draft.color === key && 'ring-2 ring-foreground')}
                    >
                      {draft.color === key && <Check className="h-4 w-4" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="rw-start">Starts</Label>
                  <Input id="rw-start" type="datetime-local" value={draft.starts_at} onChange={(e) => setDraft({ ...draft, starts_at: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rw-end">Ends (optional)</Label>
                  <Input id="rw-end" type="datetime-local" value={draft.ends_at} min={draft.starts_at} onChange={(e) => setDraft({ ...draft, ends_at: e.target.value })} />
                </div>
              </div>
              {error(errors.dates)}
              <p className="-mt-2 text-xs text-muted-foreground">
                Progress counts from the start. Set it in the past to count earlier activity too. Leave the end empty to keep it running.
              </p>

              <label className="flex items-center justify-between gap-3 text-sm">
                <span>Active</span>
                <Switch checked={draft.is_active} onCheckedChange={(v) => setDraft({ ...draft, is_active: v })} />
              </label>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDraft(null)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving || !valid}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPage>
  );
};

export default AdminRewards;
