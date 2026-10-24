import { rewardColor, rewardIcon } from '@/lib/rewards';
import { cn } from '@/lib/utils';

// The admin-chosen icon in its colour
const RewardIcon = ({ icon, color, className, muted }: { icon: string; color: string; className?: string; muted?: boolean }) => {
  const Icon = rewardIcon(icon);
  return (
    <span
      className={cn(
        'inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full',
        muted ? 'bg-muted text-muted-foreground' : rewardColor(color).chip,
        className,
      )}
    >
      <Icon className="h-5 w-5" />
    </span>
  );
};

export default RewardIcon;
