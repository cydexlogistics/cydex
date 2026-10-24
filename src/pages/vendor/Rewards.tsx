import { Trophy } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import RewardsList from '@/components/rewards/RewardsList';

// Rewards set by Cydex, with progress towards each
const Rewards = () => (
  <DashboardLayout userRole="VENDOR">
    <div className="mx-auto max-w-5xl space-y-4 p-3 sm:p-4 md:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
          <Trophy className="h-6 w-6 text-amber-500" /> Rewards
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          Reach these goals to earn wallet bonuses and offers. Progress counts from when each reward started.
        </p>
      </div>
      <RewardsList />
    </div>
  </DashboardLayout>
);

export default Rewards;
