import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SimplePagination from '@/components/ui/simple-pagination';
import { Switch } from '@/components/ui/switch';
import { useConfirm } from '@/contexts/ConfirmContext';
import { supabase } from '@/integrations/supabase/client';
import { errorMessage } from '@/lib/address';
import { nairaWhole } from '@/lib/adminPeriod';
import { PAGE_SIZE } from '@/lib/pagination';
import { formatNaira } from '@/lib/pricing';
import { referralGoal, type ReferralProgram, type ReferralRole } from '@/lib/referrals';

const ROLES: ReferralRole[] = ['customer', 'vendor', 'rider'];
const ROLE_LABELS: Record<ReferralRole, string> = { customer: 'Customers', vendor: 'Vendors', rider: 'Riders' };

type Draft = { role: ReferralRole; reward_amount: string; orders_needed: string; rider_requests_needed: string; is_active: boolean };
const whole = (v: string) => Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 1000;

// Admin → Rewards → Referrals: the reward and goal for each kind of account,
// and every referral with its progress
const ReferralsAdmin = () => {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);

  const { data: programs = [] } = useQuery({
    queryKey: ['referral-programs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('referral_programs').select('*');
      if (error) throw error;
      return (data ?? []) as ReferralProgram[];
    },
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['admin-referrals', role, status, page],
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_referrals', {
        p_role: role === 'all' ? null : role, p_status: status === 'all' ? null : status,
        p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
  const first = rows[0];
  const total = Number(first?.total_count ?? 0);

  const valid = !!draft && Number(draft.reward_amount) > 0 && Number(draft.reward_amount) <= 1_000_000 && whole(draft.orders_needed)
    && (draft.rider_requests_needed === '' || whole(draft.rider_requests_needed));

  const save = async () => {
    if (!draft || !valid) return;
    const goal = referralGoal(draft.role, {
      orders_needed: Number(draft.orders_needed),
      rider_requests_needed: draft.rider_requests_needed ? Number(draft.rider_requests_needed) : null,
    });
    if (!(await confirm({
      title: `Save the referral reward for ${ROLE_LABELS[draft.role].toLowerCase()}?`,
      description: draft.is_active
        ? `Whoever referred them gets ${formatNaira(Number(draft.reward_amount))} once the new ${draft.role} ${goal}. This applies to referrals not yet rewarded.`
        : `Referrals for ${ROLE_LABELS[draft.role].toLowerCase()} will be paused: new codes can't be used and no rewards are paid until it's switched back on.`,
      confirmLabel: 'Yes, save',
    }))) return;
    setSaving(true);
    const { error } = await supabase.rpc('admin_save_referral_program', {
      p_role: draft.role,
      p_reward_amount: Number(draft.reward_amount),
      p_orders_needed: Number(draft.orders_needed),
      p_rider_requests_needed: draft.role === 'vendor' && draft.rider_requests_needed ? Number(draft.rider_requests_needed) : null,
      p_is_active: draft.is_active,
    });
    setSaving(false);
    if (error) return toast.error(errorMessage(error, 'Could not save'));
    toast.success('Referral reward saved');
    setDraft(null);
    queryClient.invalidateQueries({ queryKey: ['referral-programs'] });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {ROLES.map((r) => {
          const p = programs.find((x) => x.role === r);
          return (
            <Card key={r}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{ROLE_LABELS[r]}</p>
                  {p && !p.is_active ? <Badge variant="outline">Paused</Badge> : <Badge className="bg-green-600 text-white hover:bg-green-600">On</Badge>}
                </div>
                {p ? (
                  <p className="text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">{formatNaira(Number(p.reward_amount))}</span> to the referrer once the new {r} {referralGoal(r, p)}.
                  </p>
                ) : <div className="h-10 animate-pulse rounded bg-muted" />}
                {p && (
                  <Button variant="outline" size="sm" onClick={() => setDraft({
                    role: r, reward_amount: String(Number(p.reward_amount)), orders_needed: String(p.orders_needed),
                    rider_requests_needed: p.rider_requests_needed == null ? '' : String(p.rider_requests_needed), is_active: p.is_active,
                  })}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 xs:flex-row">
        <Select value={role} onValueChange={(v) => { setRole(v); setPage(1); }}>
          <SelectTrigger className="xs:w-44" aria-label="Who"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everyone</SelectItem>
            {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="xs:w-44" aria-label="Status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            <SelectItem value="pending">In progress</SelectItem>
            <SelectItem value="rewarded">Rewarded</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-3 xs:grid-cols-3">
        {[
          ['Referrals', total.toLocaleString('en-NG')],
          ['Rewarded', Number(first?.total_rewarded ?? 0).toLocaleString('en-NG')],
          ['Paid out', nairaWhole(Number(first?.total_paid ?? 0))],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-0.5 text-lg font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading && rows.length === 0 ? (
            <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded bg-muted" />)}</div>
          ) : rows.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">No referrals yet.</p>
          ) : (
            <ul className="divide-y">
              {rows.map((r) => {
                const p = programs.find((x) => x.role === r.role);
                return (
                  <li key={r.id} className="flex items-start gap-3 p-3 sm:px-4">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        <span className="truncate">{r.referred_name ?? 'New user'}</span>
                        <Badge variant="outline" className="capitalize">{r.role}</Badge>
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        Referred by {r.referrer_name ?? 'someone'} ({r.referrer_email}) with {r.code} · joined {format(new Date(r.created_at), 'd MMM yyyy')}
                      </p>
                      {r.status === 'pending' && p && (
                        <p className="text-xs text-muted-foreground">
                          {r.orders} of {p.orders_needed} {r.role === 'rider' ? 'deliveries' : r.role === 'vendor' ? 'sales' : 'orders'}
                          {r.role === 'vendor' && p.rider_requests_needed ? `, ${r.rider_requests} of ${p.rider_requests_needed} rider requests` : ''}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      {r.status === 'rewarded' ? (
                        <>
                          <p className="font-semibold">{formatNaira(Number(r.reward_amount))}</p>
                          {r.rewarded_at && <p className="text-xs text-muted-foreground">{format(new Date(r.rewarded_at), 'd MMM yyyy')}</p>}
                        </>
                      ) : <Badge variant="outline">In progress</Badge>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
      <SimplePagination page={page} pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))} onPageChange={setPage} />

      <Dialog open={!!draft} onOpenChange={(o) => !o && !saving && setDraft(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Referral reward: {draft && ROLE_LABELS[draft.role]}</DialogTitle>
            <DialogDescription>Paid into the referrer's wallet, and shown in their transaction history, when the person they referred reaches the goal.</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="rf-amount">Reward (₦)</Label>
                <Input id="rf-amount" type="number" min={1} step="any" value={draft.reward_amount} onChange={(e) => setDraft({ ...draft, reward_amount: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rf-orders">
                  {draft.role === 'rider' ? 'Deliveries the new rider makes' : draft.role === 'vendor' ? 'Sales the new vendor makes' : 'Orders the new customer completes'}
                </Label>
                <Input id="rf-orders" type="number" min={1} max={1000} step={1} value={draft.orders_needed} onChange={(e) => setDraft({ ...draft, orders_needed: e.target.value })} />
              </div>
              {draft.role === 'vendor' && (
                <div className="space-y-1.5">
                  <Label htmlFor="rf-requests">Or rider requests delivered (optional)</Label>
                  <Input id="rf-requests" type="number" min={1} max={1000} step={1} value={draft.rider_requests_needed} placeholder="Sales only" onChange={(e) => setDraft({ ...draft, rider_requests_needed: e.target.value })} />
                </div>
              )}
              {!valid && <p className="text-xs text-destructive">Enter a reward up to ₦1,000,000 and goals from 1 to 1,000.</p>}
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>On</span>
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
    </div>
  );
};

export default ReferralsAdmin;
