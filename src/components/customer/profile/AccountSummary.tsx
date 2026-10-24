import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Package, Receipt, Wallet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { formatNaira } from '@/lib/pricing';

// The customer's orders delivered (and what they cost) and their wallet balance
const AccountSummary = ({ dateJoined }: { dateJoined: string }) => {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['customer-account-summary', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const [{ data: delivered, error }, { data: wallet }] = await Promise.all([
        supabase.from('orders').select('total_amount').eq('customer_id', user!.id).eq('status', 'delivered'),
        supabase.from('customer_wallet').select('available_balance').eq('customer_id', user!.id).maybeSingle(),
      ]);
      if (error) throw error;
      return {
        completed: delivered?.length ?? 0,
        spent: (delivered ?? []).reduce((sum, o) => sum + Number(o.total_amount ?? 0), 0),
        wallet: Number(wallet?.available_balance ?? 0),
      };
    },
  });

  const items = [
    {
      icon: Package,
      color: 'text-blue-500',
      title: `${data?.completed ?? 0} ${data?.completed === 1 ? 'Order' : 'Orders'} Completed`,
      detail: dateJoined ? `Delivered to you since joining in ${dateJoined}` : 'Delivered to you',
    },
    {
      icon: Receipt,
      color: 'text-amber-500',
      title: `${formatNaira(data?.spent ?? 0)} Spent`,
      detail: 'On your delivered orders, including delivery and service charges',
    },
    {
      icon: Wallet,
      color: 'text-green-600',
      title: `${formatNaira(data?.wallet ?? 0)} Wallet Balance`,
      detail: 'Refunds land here and pay for your next order first',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account Summary</CardTitle>
        <CardDescription>Your account activity at a glance</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.map(({ icon: Icon, color, title, detail }) => (
          <div key={title} className="flex items-center space-x-4">
            <Icon className={`h-6 w-6 shrink-0 ${color}`} />
            <div>
              {isLoading ? <div className="h-6 w-40 animate-pulse rounded bg-muted" /> : <h3 className="text-lg font-medium">{title}</h3>}
              <p className="text-sm text-muted-foreground">{detail}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default AccountSummary;
