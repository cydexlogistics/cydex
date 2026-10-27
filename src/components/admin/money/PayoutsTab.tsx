import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Banknote, Check, Copy, Landmark, Loader2, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SimplePagination from '@/components/ui/simple-pagination';
import { supabase } from '@/integrations/supabase/client';
import { errorMessage } from '@/lib/address';
import { invokeFunction } from '@/lib/edgeFunctions';
import { formatNaira } from '@/lib/pricing';
import { cn } from '@/lib/utils';
import ReasonDialog from '../ReasonDialog';
import { useConfirm } from '@/contexts/ConfirmContext';
import { PAGE_SIZE } from '@/lib/pagination';

const STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: 'Waiting for approval', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300' },
  processing: { label: 'Sent, waiting for bank', className: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300' },
  completed: { label: 'Paid', className: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300' },
  failed: { label: 'Failed (money returned)', className: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300' },
  cancelled: { label: 'Rejected (money returned)', className: 'bg-muted text-muted-foreground' },
};

type Payout = { role: string; id: string; owner_name: string | null; owner_email: string | null; bank_name: string | null; account_number: string | null; account_name: string | null; amount: number; fee: number | null; net_amount: number | null; status: string; failure_reason: string | null; transfer_reference: string | null; created_at: string; processed_at: string | null };

const copy = async (text: string, what: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error(`Could not copy the ${what.toLowerCase()}`);
  }
};

// Withdrawals: money leaves the wallet when requested; nothing is sent until an admin approves
const PayoutsTab = () => {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const [approving, setApproving] = useState<Payout | null>(null);
  const [rejecting, setRejecting] = useState<Payout | null>(null);
  // Paid by hand from Cydex's bank account, while Squad transfers aren't enabled
  const [paying, setPaying] = useState<Payout | null>(null);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  const confirm = useConfirm();
  const { data: method = 'manual' } = useQuery({
    queryKey: ['payout-method'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('payout_method');
      if (error) throw error;
      return data as 'manual' | 'squad';
    },
  });
  const [busy, setBusy] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['admin-payouts', status, page],
    placeholderData: (previous) => previous,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_payouts', {
        p_status: status === 'all' ? undefined : status, p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE,
      });
      if (error) throw error;
      return (data ?? []) as (Payout & { total_count: number })[];
    },
  });
  const total = Number(rows[0]?.total_count ?? 0);
  // Fees kept on paid withdrawals, all time (they cover Squad's per-transfer charge)
  const { data: feeStats } = useQuery({
    queryKey: ['admin-dashboard', 'withdrawal-fees'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_dashboard_stats', {});
      if (error) throw error;
      const r = (data as unknown as { revenue: { from_withdrawals: number; withdrawals_paid: number } }).revenue;
      return { fees: Number(r.from_withdrawals ?? 0), count: Number(r.withdrawals_paid ?? 0) };
    },
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-payouts'] });
    queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
  };

  const approve = async (p: Payout) => {
    setBusy(p.id);
    try {
      await invokeFunction('squad-payout', { action: 'approve', role: p.role, payout_id: p.id });
      toast.success(`Sent ${formatNaira(Number(p.net_amount ?? p.amount))} to ${p.owner_name ?? 'them'}`);
    } catch (e) {
      toast.error(errorMessage(e, 'The transfer failed'));
    } finally {
      setBusy(null);
      setApproving(null);
      refresh();
    }
  };

  const openManual = (p: Payout) => {
    setReference('');
    setNote('');
    setSent(false);
    setPaying(p);
  };

  const markPaid = async () => {
    if (!paying) return;
    setBusy(paying.id);
    const { error } = await supabase.rpc('admin_mark_payout_paid', {
      p_role: paying.role, p_id: paying.id, p_reference: reference.trim() || undefined, p_note: note.trim() || undefined,
    });
    setBusy(null);
    if (error) return toast.error(errorMessage(error, 'Could not mark it paid'));
    toast.success(`Marked ${formatNaira(Number(paying.net_amount ?? paying.amount))} to ${paying.owner_name ?? 'them'} as paid`);
    setPaying(null);
    refresh();
  };

  const switchMethod = async (next: 'manual' | 'squad') => {
    if (next === method) return;
    if (!(await confirm({
      title: next === 'squad' ? 'Send withdrawals through Squad?' : 'Pay withdrawals manually?',
      description: next === 'squad'
        ? "Approve will send the money through Squad straight away. Only switch once Squad has enabled transfers for Cydex's account."
        : "You'll send each withdrawal from Cydex's bank account yourself, then mark it paid here. Squad won't be used.",
      confirmLabel: 'Yes, switch',
    }))) return;
    const { error } = await supabase.rpc('admin_set_payout_method', { p_method: next });
    if (error) return toast.error(errorMessage(error, 'Could not switch'));
    toast.success(next === 'squad' ? 'Withdrawals now go through Squad' : 'Withdrawals are now paid manually');
    queryClient.invalidateQueries({ queryKey: ['payout-method'] });
  };

  const check = async (p: Payout) => {
    setBusy(p.id);
    try {
      const { payout } = await invokeFunction<{ payout: { status: string } }>('squad-payout', { action: 'requery', role: p.role, payout_id: p.id });
      toast.info(`Status: ${STATUS[payout.status]?.label ?? payout.status}`);
    } catch (e) {
      toast.error(errorMessage(e, 'Could not check with Squad'));
    } finally {
      setBusy(null);
      refresh();
    }
  };

  return (
    <div className="space-y-3">
      {feeStats && (
        <p className="text-sm text-muted-foreground">
          Withdrawal fees earned (1.5%, all time):{' '}
          <span className="font-semibold text-foreground">{formatNaira(feeStats.fees)}</span> from {feeStats.count} paid
          withdrawal{feeStats.count === 1 ? '' : 's'}. Squad's own transfer charge (₦8–₦40 each) comes out of this.
        </p>
      )}
      <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          <p className="font-medium">Send withdrawals by</p>
          <p className="text-muted-foreground">
            {method === 'manual'
              ? "You transfer the money from Cydex's bank account, then mark it paid here."
              : 'Approve sends the money through Squad straight away.'}
          </p>
        </div>
        <div role="radiogroup" aria-label="Send withdrawals by" className="flex shrink-0 gap-1 rounded-full bg-muted p-1">
          {(['manual', 'squad'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={method === m}
              onClick={() => switchMethod(m)}
              className={cn('rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                method === m ? 'bg-primary text-black' : 'text-muted-foreground hover:text-foreground')}
            >
              {m === 'manual' ? 'Manual bank transfer' : 'Squad'}
            </button>
          ))}
        </div>
      </div>
      <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
        <SelectTrigger className="xs:w-60" aria-label="Status"><SelectValue /></SelectTrigger>
        <SelectContent>
          {Object.entries(STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          <SelectItem value="all">All withdrawals</SelectItem>
        </SelectContent>
      </Select>

      <Card>
        <CardContent className="p-0">
          {isLoading && rows.length === 0 ? (
            <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded bg-muted" />)}</div>
          ) : rows.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">No withdrawals here.</p>
          ) : (
            <ul className="divide-y">
              {rows.map((p) => (
                <li key={p.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {p.owner_name ?? 'Unknown'}
                      <Badge variant="outline" className="capitalize">{p.role}</Badge>
                      <Badge variant="outline" className={cn('border-transparent', STATUS[p.status]?.className)}>{STATUS[p.status]?.label ?? p.status}</Badge>
                    </p>
                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Landmark className="h-3.5 w-3.5 shrink-0" />
                      <span className="min-w-0 truncate">{p.bank_name ?? 'No bank'} · {p.account_number ?? '–'} · {p.account_name ?? '–'}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Requested {format(new Date(p.created_at), 'd MMM yyyy, HH:mm')}
                      {p.processed_at && ` · Closed ${format(new Date(p.processed_at), 'd MMM, HH:mm')}`}
                    </p>
                    {p.failure_reason && <p className="text-xs text-destructive">{p.failure_reason}</p>}
                    {p.status === 'completed' && p.transfer_reference?.startsWith('MANUAL-') && (
                      <p className="text-xs text-muted-foreground">Paid by manual bank transfer · Ref {p.transfer_reference.slice(7)}</p>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-3 md:flex-col md:items-end">
                    <div className="text-right">
                      <p className="text-lg font-bold">{formatNaira(Number(p.amount))}</p>
                      {Number(p.fee) > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Fee {formatNaira(Number(p.fee))} · they receive {formatNaira(Number(p.net_amount))}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {p.status === 'pending' && (
                        <>
                          <Button size="sm" variant="outline" disabled={busy === p.id} onClick={() => setRejecting(p)}>
                            <X className="mr-1 h-4 w-4" /> Reject
                          </Button>
                          {method === 'manual' ? (
                            <Button size="sm" disabled={busy === p.id} onClick={() => openManual(p)}>
                              <Banknote className="mr-1 h-4 w-4" /> Pay manually
                            </Button>
                          ) : (
                            <Button size="sm" disabled={busy === p.id} onClick={() => setApproving(p)}>
                              <Check className="mr-1 h-4 w-4" /> Approve
                            </Button>
                          )}
                        </>
                      )}
                      {p.status === 'processing' && (
                        <Button size="sm" variant="outline" disabled={busy === p.id} onClick={() => check(p)}>
                          {busy === p.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />} Check status
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <SimplePagination page={page} pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))} onPageChange={setPage} />

      <AlertDialog open={!!approving} onOpenChange={(o) => !o && !busy && setApproving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to send {formatNaira(Number(approving?.net_amount ?? approving?.amount ?? 0))}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Squad sends it from Cydex's balance to:</p>
                <p className="rounded-md bg-muted p-3 text-foreground">
                  {approving?.account_name}<br />{approving?.bank_name} · {approving?.account_number}
                </p>
                <p>If the bank rejects it, the money goes back to {approving?.owner_name ?? 'their'} wallet.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!busy}>Back</AlertDialogCancel>
            <AlertDialogAction disabled={!!busy} onClick={(e) => { e.preventDefault(); if (approving) approve(approving); }}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Yes, approve and send
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!paying} onOpenChange={(o) => !o && !busy && setPaying(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pay {paying?.owner_name ?? 'them'} manually</DialogTitle>
            <DialogDescription>Send this from Cydex's bank account, then confirm below. They're told it's been sent.</DialogDescription>
          </DialogHeader>
          {paying && (
            <div className="space-y-4">
              <div className="space-y-2 rounded-lg bg-muted p-3 text-sm">
                {[
                  ['Amount to send', formatNaira(Number(paying.net_amount ?? paying.amount)), String(Number(paying.net_amount ?? paying.amount))],
                  ['Account number', paying.account_number ?? '–', paying.account_number ?? ''],
                  ['Account name', paying.account_name ?? '–', paying.account_name ?? ''],
                  ['Bank', paying.bank_name ?? '–', ''],
                ].map(([label, value, copyValue]) => (
                  <div key={label} className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="flex items-center gap-1 font-semibold">
                      {value}
                      {copyValue && (
                        <button type="button" aria-label={`Copy ${label.toLowerCase()}`} onClick={() => copy(copyValue, label)} className="rounded p-1 hover:bg-background">
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
              {Number(paying.fee) > 0 && (
                <p className="text-xs text-muted-foreground">
                  They asked for {formatNaira(Number(paying.amount))}; the {formatNaira(Number(paying.fee))} withdrawal fee stays with Cydex.
                </p>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="mp-ref">Transfer reference (optional)</Label>
                <Input id="mp-ref" value={reference} maxLength={100} onChange={(e) => setReference(e.target.value)} placeholder="From your bank's receipt" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mp-note">Note (optional)</Label>
                <Input id="mp-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Paid from the GTBank business account" />
              </div>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={sent} onCheckedChange={(v) => setSent(v === true)} className="mt-0.5" />
                <span>I've sent {formatNaira(Number(paying.net_amount ?? paying.amount))} to this account</span>
              </label>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPaying(null)} disabled={!!busy}>Back</Button>
            <Button onClick={markPaid} disabled={!sent || !!busy} className="text-black">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Mark as paid
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReasonDialog
        open={!!rejecting}
        title={`Are you sure you want to reject this ${formatNaira(Number(rejecting?.amount ?? 0))} withdrawal?`}
        description={`The money goes back to ${rejecting?.owner_name ?? 'their'} wallet, and they see your reason.`}
        confirmLabel="Yes, reject"
        placeholder="e.g. The account name doesn't match the profile"
        destructive
        onClose={() => setRejecting(null)}
        onConfirm={async (reason) => {
          const { error } = await supabase.rpc('admin_reject_payout', { p_role: rejecting!.role, p_id: rejecting!.id, p_reason: reason });
          if (error) throw error;
          toast.success('Withdrawal rejected, money returned');
          setRejecting(null);
          refresh();
        }}
      />
    </div>
  );
};

export default PayoutsTab;
