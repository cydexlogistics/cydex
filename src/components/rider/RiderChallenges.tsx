import { useEffect } from 'react';
import { Flame } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import RewardCard from '@/components/rewards/RewardCard';
import { useMyRewards } from '@/hooks/useMyRewards';

// Today's and this week's challenges. Shows only while Cydex has some running.
// refreshKey: changes when deliveries finish, to update progress
const RiderChallenges = ({ refreshKey }: { refreshKey?: unknown }) => {
  const { data: rewards = [], refetch } = useMyRewards();
  useEffect(() => { refetch(); }, [refreshKey, refetch]);
  const challenges = rewards
    .filter((r) => r.running && (r.kind === 'daily' || r.kind === 'weekly'))
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'daily' ? -1 : 1));
  if (challenges.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Flame className="h-5 w-5 text-orange-500" /> Challenges
        </CardTitle>
        <CardDescription>Complete them before they reset to earn the reward.</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {challenges.map((r) => <RewardCard key={r.id} reward={r} />)}
      </CardContent>
    </Card>
  );
};

export default RiderChallenges;
