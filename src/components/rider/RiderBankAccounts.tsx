import { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { RiderBankAccount } from '@/hooks/useRiderWallet';
import { cn } from '@/lib/utils';
import { NIGERIAN_BANKS } from '@/utils/nigerianBanks';

export type NewBankAccount = Pick<RiderBankAccount, 'account_name' | 'bank_name' | 'bank_code' | 'account_number' | 'is_default' | 'is_verified'>;

const blank: NewBankAccount = { account_name: '', bank_name: '', bank_code: '', account_number: '', is_default: false, is_verified: false };

interface Props {
  accounts: RiderBankAccount[];
  onAdd: (account: NewBankAccount) => Promise<unknown>;
  /** Let the page open the "Add bank account" dialog (e.g. withdrawing with no account) */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

// A rider's bank accounts for withdrawals: the list, and adding one by
// choosing the bank (its code is filled in) and a 10-digit account number.
// Used on Earnings and on Profile -> Banking.
const RiderBankAccounts = ({ accounts, onAdd, open: openProp, onOpenChange, className }: Props) => {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (next: boolean) => { onOpenChange?.(next); if (openProp === undefined) setOpenState(next); };
  const [form, setForm] = useState<NewBankAccount>(blank);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);

  const errors = {
    account_name: form.account_name.trim().length < 2 ? 'Enter the name on the account.' : null,
    bank_code: !form.bank_code ? 'Choose your bank.' : null,
    account_number: !/^\d{10}$/.test(form.account_number) ? 'Enter the 10-digit account number.' : null,
  };
  const valid = !errors.account_name && !errors.bank_code && !errors.account_number;

  const close = (next: boolean) => {
    if (saving) return;
    if (!next) { setForm(blank); setTried(false); }
    setOpen(next);
  };

  const save = async () => {
    setTried(true);
    if (!valid) return;
    setSaving(true);
    try {
      await onAdd({ ...form, account_name: form.account_name.trim(), is_default: form.is_default || accounts.length === 0 });
      setForm(blank);
      setTried(false);
      setOpen(false);
    } catch {
      // the hook shows the error
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Bank Accounts</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">Where your withdrawals are sent</p>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {accounts.length > 0 ? (
            accounts.map((account) => (
              <div key={account.id} className="flex items-center justify-between rounded-lg border p-2">
                <div>
                  <p className="text-sm font-medium">{account.bank_name}</p>
                  <p className="text-xs text-muted-foreground">{account.account_name} · **** {account.account_number.slice(-4)}</p>
                </div>
                {account.is_default && (
                  <Badge variant="outline" className="border-green-500 text-xs text-green-600">Default</Badge>
                )}
              </div>
            ))
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">No bank accounts added yet</p>
          )}

          <Button variant="outline" className="w-full border-dashed text-xs" onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-3 w-3" />
            Add Bank Account
          </Button>
        </div>
      </CardContent>

      <Dialog open={open} onOpenChange={close}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Bank Account</DialogTitle>
            <DialogDescription>Add a bank account for withdrawals.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="bank-account-name">Account name</Label>
              <Input
                id="bank-account-name"
                placeholder="Name on the account"
                value={form.account_name}
                onChange={(e) => setForm((f) => ({ ...f, account_name: e.target.value }))}
                className={cn(tried && errors.account_name && 'border-destructive')}
              />
              {tried && errors.account_name && <p className="text-xs text-destructive">{errors.account_name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bank-select">Bank</Label>
              <Select
                value={form.bank_code}
                onValueChange={(code) => {
                  const bank = NIGERIAN_BANKS.find((b) => b.code === code);
                  if (bank) setForm((f) => ({ ...f, bank_name: bank.name, bank_code: bank.code }));
                }}
              >
                <SelectTrigger id="bank-select" className={cn(tried && errors.bank_code && 'border-destructive')}>
                  <SelectValue placeholder="Select your bank" />
                </SelectTrigger>
                <SelectContent>
                  {NIGERIAN_BANKS.map((bank) => (
                    <SelectItem key={bank.code} value={bank.code}>{bank.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {tried && errors.bank_code && <p className="text-xs text-destructive">{errors.bank_code}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bank-account-number">Account number</Label>
              <Input
                id="bank-account-number"
                inputMode="numeric"
                maxLength={10}
                placeholder="10 digits"
                value={form.account_number}
                onChange={(e) => setForm((f) => ({ ...f, account_number: e.target.value.replace(/\D/g, '') }))}
                className={cn(tried && errors.account_number && 'border-destructive')}
              />
              {tried && errors.account_number && <p className="text-xs text-destructive">{errors.account_number}</p>}
            </div>
            {accounts.length > 0 && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.is_default} onCheckedChange={(c) => setForm((f) => ({ ...f, is_default: !!c }))} />
                Make this my default account
              </label>
            )}
          </div>
          <DialogFooter>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default RiderBankAccounts;
