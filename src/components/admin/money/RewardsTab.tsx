import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import SimplePagination from '@/components/ui/simple-pagination';
import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_PERIOD, nairaWhole, periodRange, type Period } from '@/lib/adminPeriod';
import { PAGE_SIZE } from '@/lib/pagination';
import { formatNaira } from '@/lib/pricing';
import PeriodFilter from '../PeriodFilter';

// Every reward given out: wallet bonuses (money Cydex paid into wallets) and
// personal offers. Rewards themselves are set up under Rewards.
const RewardsTab = () => {
  const [period, setPeriod] = useState<Period>(DEFAULT_PERIOD);
  const [page, setPage] = useState(1);
  const { from, to } = periodRange(period);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['admin-reward-grants', from, to, page],
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_reward_grants', {
        p_from: from ?? undefined, p_to: to ?? undefined, p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
  const first = rows[0];
  const total = Number(first?.total_count ?? 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <PeriodFilter value={period} onChange={(p) => { setPeriod(p); setPage(1); }} />
        <Link to="/admin/rewards" className="text-sm text-primary hover:underline">Set up rewards</Link>
      </div>

      <div className="grid grid-cols-1 gap-3 xs:grid-cols-3">
        {[
          ['Rewards given', total.toLocaleString('en-NG')],
          ['Paid into wallets', nairaWhole(Number(first?.total_paid ?? 0))],
          ['Offers given', Number(first?.total_promotions ?? 0).toLocaleString('en-NG')],
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
            <p className="p-8 text-center text-muted-foreground">No rewards given in this period.</p>
          ) : (
            <ul className="divide-y">
              {rows.map((g) => (
                <li key={g.id} className="flex items-center gap-3 p-3 sm:px-4">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      <span className="min-w-0 truncate">{g.user_name ?? 'User'}</span>
                      {g.user_role && <Badge variant="outline" className="capitalize">{g.user_role}</Badge>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{g.reward_title} · {g.prize}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(g.earned_at), 'd MMM yyyy, HH:mm')}</p>
                  </div>
                  <p className="shrink-0 font-semibold">
                    {Number(g.wallet_amount) > 0 ? formatNaira(Number(g.wallet_amount)) : <span className="text-sm font-normal text-muted-foreground">Offer</span>}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <SimplePagination page={page} pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))} onPageChange={setPage} />
    </div>
  );
};

export default RewardsTab;
