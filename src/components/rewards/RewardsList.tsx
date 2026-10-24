import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { CheckCircle2, Gift, Trophy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import PagedList from '@/components/ui/paged-list';
import SimplePagination from '@/components/ui/simple-pagination';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useMyRewards } from '@/hooks/useMyRewards';
import { supabase } from '@/integrations/supabase/client';
import { PAGE_SIZE } from '@/lib/pagination';
import { KIND_LABELS, type RewardKind } from '@/lib/rewards';
import RewardCard from './RewardCard';
import RewardIcon from './RewardIcon';

// Everything set for the signed-in user, a page at a time: challenges and
// rewards still to earn first, then everything they've earned, with the date
const RewardsList = ({ title = 'Rewards' }: { title?: string }) => {
  const { user } = useAuth();
  const { data: rewards = [], isLoading } = useMyRewards();
  const [page, setPage] = useState(1);
  const challenges = rewards.filter((r) => r.running && r.kind !== 'milestone');
  const open = rewards.filter((r) => r.running && r.kind === 'milestone' && (!r.earned || r.metric === 'fastest_delivery'));

  // Each achievement, challenge completed and new fastest delivery
  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ['my-reward-history', user?.id, page],
    enabled: !!user?.id,
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_reward_history', { p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE });
      if (error) throw error;
      return { rows: data ?? [], total: Number(data?.[0]?.total_count ?? 0) };
    },
  });
  const earned = history?.rows ?? [];

  const section = (heading: string, description: string, list: typeof rewards) => list.length > 0 && (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">{heading}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <PagedList items={list} getKey={(r) => r.id} pageSize={6} paginationClassName="md:col-span-2" render={(r) => <RewardCard reward={r} />} />
      </CardContent>
    </Card>
  );

  if (isLoading || historyLoading) {
    return <div className="space-y-3">{[0, 1].map((i) => <div key={i} className="h-28 animate-pulse rounded-lg bg-muted" />)}</div>;
  }

  if (rewards.length === 0 && earned.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Trophy className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
          <h3 className="mb-1 text-lg font-medium">No {title.toLowerCase()} right now</h3>
          <p className="text-sm text-muted-foreground">When Cydex sets new ones, you'll see them here with your progress.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {section('Challenges', 'Progress starts again each day or week.', challenges)}
      {section('To earn', 'Reach the goal to unlock the reward. Wallet bonuses go straight to your wallet.', open)}
      {earned.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Earned</CardTitle>
            <CardDescription>Everything you've unlocked, newest first.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="divide-y">
              {earned.map((g) => (
                <li key={g.id} className="flex items-start gap-3 py-3 first:pt-0">
                  <RewardIcon icon={g.icon} color={g.color} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {g.title}
                      {g.kind !== 'milestone' && <Badge variant="outline" className="text-[10px]">{KIND_LABELS[g.kind as RewardKind]}</Badge>}
                    </p>
                    <p className="flex items-center gap-1 text-sm text-muted-foreground"><Gift className="h-3.5 w-3.5" /> {g.prize}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <Badge className="gap-1 bg-green-600 text-white hover:bg-green-600"><CheckCircle2 className="h-3 w-3" /> Earned</Badge>
                    <p className="mt-1 text-xs text-muted-foreground">{format(new Date(g.earned_at), 'd MMM yyyy')}</p>
                  </div>
                </li>
              ))}
            </ul>
            <SimplePagination page={page} pageCount={Math.max(1, Math.ceil((history?.total ?? 0) / PAGE_SIZE))} onPageChange={setPage} />
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default RewardsList;
