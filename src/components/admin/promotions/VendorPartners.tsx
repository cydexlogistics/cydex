import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Handshake, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useConfirm } from '@/contexts/ConfirmContext';
import { supabase } from '@/integrations/supabase/client';
import { errorMessage } from '@/lib/address';

type Draft = {
  isNew: boolean; vendor_id: string; vendor_name: string;
  // Percent as typed; '' = the standard rate
  vendor_commission: string; rider_request_commission: string; note: string; is_active: boolean;
};

const pct = (rate: number | null | undefined) => (rate == null ? '' : String(Math.round(Number(rate) * 10000) / 100));
const rateOf = (v: string) => (v.trim() === '' ? null : Number(v) / 100);
const okPct = (v: string) => v.trim() === '' || (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 50);

// Partner vendors: businesses Cydex has a deal with. Each can pay its own
// commission on sales and on rider requests instead of the standard rates
// (Admin → Pricing). Partnership promotions for their customers are below this.
const VendorPartners = () => {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: partners = [], isLoading } = useQuery({
    queryKey: ['admin-vendor-partners'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_vendor_partners');
      if (error) throw error;
      return data ?? [];
    },
  });
  const standard = partners[0];
  const { data: standardRates } = useQuery({
    queryKey: ['admin-pricing-standard-rates'],
    enabled: !standard,
    queryFn: async () => {
      const { data } = await supabase.from('pricing_config').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle();
      return data as { vendor_commission_rate?: number | null; rider_request_commission_rate?: number | null } | null;
    },
  });
  const stdVendor = Number(standard?.standard_vendor_commission_rate ?? standardRates?.vendor_commission_rate ?? 0.1);
  const stdRequest = Number(standard?.standard_rider_request_commission_rate ?? standardRates?.rider_request_commission_rate ?? 0.1);

  const { data: vendors = [] } = useQuery({
    queryKey: ['admin-partner-vendor-search', query],
    enabled: !!draft?.isNew && !draft.vendor_id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_users', { p_search: query || undefined, p_role: 'vendor', p_limit: 8, p_offset: 0 });
      if (error) throw error;
      return data ?? [];
    },
  });

  const valid = !!draft && !!draft.vendor_id && okPct(draft.vendor_commission) && okPct(draft.rider_request_commission);

  const save = async () => {
    if (!draft || !valid) return;
    setSaving(true);
    const { error } = await supabase.rpc('admin_save_vendor_partner', {
      p_vendor_id: draft.vendor_id,
      p_vendor_commission_rate: rateOf(draft.vendor_commission),
      p_rider_request_commission_rate: rateOf(draft.rider_request_commission),
      p_note: draft.note.trim() || null,
      p_is_active: draft.is_active,
    });
    setSaving(false);
    if (error) return toast.error(errorMessage(error, 'Could not save the partner'));
    toast.success('Partner saved');
    setDraft(null);
    queryClient.invalidateQueries({ queryKey: ['admin-vendor-partners'] });
  };

  const remove = async (vendorId: string, name: string | null) => {
    if (!(await confirm({
      title: `Remove ${name ?? 'this vendor'} as a partner?`,
      description: 'They go back to the standard commission rates. Partnership promotions that include them are not changed.',
      confirmLabel: 'Yes, remove',
    }))) return;
    const { error } = await supabase.rpc('admin_remove_vendor_partner', { p_vendor_id: vendorId });
    if (error) return toast.error(errorMessage(error, 'Could not remove the partner'));
    toast.success('Partner removed');
    queryClient.invalidateQueries({ queryKey: ['admin-vendor-partners'] });
  };

  const rateText = (rate: number | null, std: number) =>
    rate == null ? `${pct(std)}% (standard)` : `${pct(rate)}%`;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg"><Handshake className="h-5 w-5" /> Partner vendors</CardTitle>
          <CardDescription>
            Their own commission on sales and on rider requests. Standard rates: {pct(stdVendor)}% on sales, {pct(stdRequest)}% on rider requests.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => { setSearch(''); setDraft({ isNew: true, vendor_id: '', vendor_name: '', vendor_commission: '', rider_request_commission: '', note: '', is_active: true }); }}>
          <Plus className="mr-1.5 h-4 w-4" /> Add partner
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-4">{[0, 1].map((i) => <div key={i} className="h-12 animate-pulse rounded bg-muted" />)}</div>
        ) : partners.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No partner vendors yet.</p>
        ) : (
          <ul className="divide-y">
            {partners.map((p) => (
              <li key={p.vendor_id} className="flex items-start gap-3 p-3 sm:px-4">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {p.vendor_name}
                    {!p.is_active && <Badge variant="outline">Off</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Sales commission {rateText(p.vendor_commission_rate, Number(p.standard_vendor_commission_rate))} · Rider requests{' '}
                    {rateText(p.rider_request_commission_rate, Number(p.standard_rider_request_commission_rate))}
                    {' · '}{Number(p.promotions)} partnership promotion{Number(p.promotions) === 1 ? '' : 's'}
                  </p>
                  {p.note && <p className="text-xs text-muted-foreground">{p.note}</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="outline" size="sm" onClick={() => setDraft({
                    isNew: false, vendor_id: p.vendor_id, vendor_name: p.vendor_name ?? 'Vendor',
                    vendor_commission: pct(p.vendor_commission_rate), rider_request_commission: pct(p.rider_request_commission_rate),
                    note: p.note ?? '', is_active: p.is_active,
                  })}>
                    <Pencil className="h-3.5 w-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Edit</span>
                  </Button>
                  <Button variant="ghost" size="sm" aria-label="Remove partner" onClick={() => remove(p.vendor_id, p.vendor_name)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={!!draft} onOpenChange={(o) => !o && !saving && setDraft(null)}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.isNew ? 'Add partner vendor' : `Edit ${draft?.vendor_name}`}</DialogTitle>
            <DialogDescription>Leave a rate empty to use the standard one. Changes apply to orders settled from now on.</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              {draft.isNew && (
                <div className="space-y-1.5">
                  <Label htmlFor="vp-vendor">Vendor</Label>
                  {draft.vendor_id ? (
                    <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                      <span className="font-medium">{draft.vendor_name}</span>
                      <Button variant="ghost" size="sm" onClick={() => setDraft({ ...draft, vendor_id: '', vendor_name: '' })}>Change</Button>
                    </div>
                  ) : (
                    <>
                      <Input id="vp-vendor" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search businesses by name" />
                      <ul className="max-h-40 divide-y overflow-y-auto rounded-md border">
                        {vendors.length === 0 ? <li className="p-2 text-sm text-muted-foreground">No businesses found.</li>
                          : vendors.map((v) => (
                            <li key={v.id}>
                              <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                                onClick={() => setDraft({ ...draft, vendor_id: v.id, vendor_name: v.name ?? 'Business' })}>
                                {v.name} <span className="text-xs text-muted-foreground">{v.email}</span>
                              </button>
                            </li>
                          ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="vp-sales">Commission on sales (%)</Label>
                  <Input id="vp-sales" type="number" min={0} max={50} step="any" value={draft.vendor_commission} placeholder={`${pct(stdVendor)} (standard)`} onChange={(e) => setDraft({ ...draft, vendor_commission: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="vp-requests">Rider request commission (%)</Label>
                  <Input id="vp-requests" type="number" min={0} max={50} step="any" value={draft.rider_request_commission} placeholder={`${pct(stdRequest)} (standard)`} onChange={(e) => setDraft({ ...draft, rider_request_commission: e.target.value })} />
                </div>
              </div>
              {(!okPct(draft.vendor_commission) || !okPct(draft.rider_request_commission)) && (
                <p className="-mt-2 text-xs text-destructive">Enter a percentage from 0 to 50, or leave it empty.</p>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="vp-note">Note (optional)</Label>
                <Input id="vp-note" value={draft.note} maxLength={200} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="e.g. Campus partnership, reviewed in January" />
              </div>
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
    </Card>
  );
};

export default VendorPartners;
