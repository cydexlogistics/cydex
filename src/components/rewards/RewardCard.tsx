import { formatDistanceToNowStrict, format } from 'date-fns';
import { CheckCircle2, Gift } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { MyReward } from '@/hooks/useMyRewards';
import { KIND_LABELS, describeTask, formatDuration, formatMetric, rewardColor, type RewardKind } from '@/lib/rewards';
import { cn } from '@/lib/utils';
import RewardIcon from './RewardIcon';

// One reward with its task, prize and progress
const RewardCard = ({ reward, compact }: { reward: MyReward; compact?: boolean }) => {
  const fastest = reward.metric === 'fastest_delivery';
  const progress = reward.progress ?? 0;
  const percent = fastest ? 0 : Math.min(100, (progress / reward.target) * 100);
  const color = rewardColor(reward.color);

  return (
    <div className={cn('rounded-lg border p-3 sm:p-4', reward.earned && 'bg-muted/40')}>
      <div className="flex items-start gap-3">
        <RewardIcon icon={reward.icon} color={reward.color} muted={!reward.running && !reward.earned} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-medium leading-tight">{reward.title}</h4>
            {reward.kind !== 'milestone' && <Badge variant="outline" className="text-[10px]">{KIND_LABELS[reward.kind as RewardKind]}</Badge>}
            {reward.earned && (
              <Badge className="gap-1 bg-green-600 text-white hover:bg-green-600">
                <CheckCircle2 className="h-3 w-3" /> Earned
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{reward.description || describeTask(reward.metric, reward.target)}</p>
          <p className="flex items-center gap-1 text-sm font-medium">
            <Gift className="h-3.5 w-3.5 text-primary" /> {reward.prize}
          </p>
        </div>
      </div>

      {fastest ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {reward.best_minutes == null
            ? `Your first delivery of ${reward.target} km or more sets the time to beat.`
            : <>Time to beat: <span className="font-semibold text-foreground">
                {reward.best_minutes < 60 ? `${reward.best_minutes} min` : formatDuration(reward.best_minutes)}
              </span></>}
          {reward.times_earned > 0 && ` · earned ${reward.times_earned} time${reward.times_earned === 1 ? '' : 's'}`}
        </p>
      ) : (
        <div className="mt-3 space-y-1">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className={cn('h-full rounded-full transition-all', reward.earned ? 'bg-green-500' : color.bar)} style={{ width: `${reward.earned ? 100 : percent}%` }} />
          </div>
          <div className="flex justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {formatMetric(reward.metric, Math.min(progress, reward.target))} of {formatMetric(reward.metric, reward.target)}
            </span>
            {!compact && (
              <span>
                {reward.earned && reward.earned_at
                  ? `Earned ${format(new Date(reward.earned_at), 'd MMM yyyy')}`
                  : reward.period_ends_at
                    ? `${reward.kind === 'milestone' ? 'Ends' : 'Resets'} in ${formatDistanceToNowStrict(new Date(reward.period_ends_at))}`
                    : null}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default RewardCard;
