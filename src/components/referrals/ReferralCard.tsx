import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Gift, Link2, Loader2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { errorMessage } from '@/lib/address';
import { formatNaira } from '@/lib/pricing';
import { referralGoal, type ReferralProgram, type ReferralRole } from '@/lib/referrals';

interface MyReferrals {
  code: string | null;
  role: ReferralRole;
  program: ReferralProgram | null;
  can_apply: boolean;
  referred_by: string | null;
}

const KIND: Record<ReferralRole, string> = { customer: 'customers', vendor: 'vendors', rider: 'riders' };
// Where referral rewards show up
const PAID_TO: Record<ReferralRole, string> = {
  customer: 'your wallet',
  vendor: 'your wallet',
  rider: 'your earnings',
};

const copy = async (text: string, what: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error(`Could not copy the ${what.toLowerCase()}`);
  }
};

// The user's referral code to share and how the reward works (Profile, or
// Settings for vendors). Rewards show in their wallet or earnings history.
// New accounts can also add the code of whoever invited them.
const ReferralCard = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [applying, setApplying] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['my-referrals', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_referrals');
      if (error) throw error;
      return data as unknown as MyReferrals | null;
    },
  });

  const apply = async () => {
    setApplying(true);
    const { error } = await supabase.rpc('apply_referral_code', { p_code: code.replace(/\s/g, '').toUpperCase() });
    setApplying(false);
    if (error) return toast.error(errorMessage(error, 'Could not add the code'));
    toast.success('Referral code added');
    setCode('');
    queryClient.invalidateQueries({ queryKey: ['my-referrals'] });
  };

  if (isLoading) return <div className="h-48 animate-pulse rounded-lg bg-muted" />;
  if (!data?.code) return null;

  const link = `${window.location.origin}/auth?ref=${data.code}&role=${data.role}`;
  const program = data.program;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserPlus className="h-5 w-5 text-primary" /> Refer {KIND[data.role]}
          </CardTitle>
          <CardDescription>
            {program?.is_active
              ? <>Share your code with other {KIND[data.role]}. When someone signs up with it and {referralGoal(data.role, program)}, you get <span className="font-semibold text-foreground">{formatNaira(Number(program.reward_amount))}</span>, paid into {PAID_TO[data.role]}.</>
              : 'Referral rewards are paused right now. You can still share your code.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 xs:flex-row xs:items-center">
            <div className="flex-1 rounded-lg border-2 border-dashed border-primary/60 bg-primary/5 px-4 py-3 text-center font-mono text-2xl font-bold tracking-widest">
              {data.code}
            </div>
            <Button onClick={() => copy(data.code!, 'Code')} className="text-black">
              <Copy className="mr-1.5 h-4 w-4" /> Copy code
            </Button>
          </div>
          <div className="flex flex-col gap-2 xs:flex-row xs:items-center">
            <Input readOnly value={link} className="flex-1 text-xs" aria-label="Sign-up link" onFocus={(e) => e.target.select()} />
            <Button variant="outline" onClick={() => copy(link, 'Link')}>
              <Link2 className="mr-1.5 h-4 w-4" /> Copy link
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            The code only works for new {KIND[data.role]}. The link opens Sign up with your code already filled in.
            Rewards you earn are listed in your {data.role === 'rider' ? 'Earnings' : 'Wallet'} transaction history.
          </p>
        </CardContent>
      </Card>

      {data.referred_by ? (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><Gift className="h-4 w-4" /> You joined with {data.referred_by}'s code.</p>
      ) : data.can_apply && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Were you referred?</CardTitle>
            <CardDescription>Add the code of the person who invited you, before your first {data.role === 'rider' ? 'delivery' : data.role === 'vendor' ? 'sale' : 'order'}.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 xs:flex-row">
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. CX7KQ2MP" maxLength={12} className="font-mono uppercase xs:max-w-xs" aria-label="Referral code" />
            <Button variant="outline" onClick={apply} disabled={applying || code.trim().length < 4}>
              {applying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Add code
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ReferralCard;
