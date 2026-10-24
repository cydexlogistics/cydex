import React from 'react';
import { useRiderPerformance } from '@/hooks/rider/useRiderPerformance';

interface ProfileStatsProps {
  profile: any;
}

// All-time figures from the rider's delivered orders
const ProfileStats = ({ profile }: ProfileStatsProps) => {
  const { data: performance } = useRiderPerformance(null);
  const stats = [
    { label: 'Deliveries', value: String(performance?.deliveries ?? profile.stats?.completedDeliveries ?? 0) },
    { label: 'Distance covered', value: `${(performance?.distanceKm ?? 0).toFixed(1)} km` },
    { label: 'On-time rate', value: performance?.onTimeRate != null ? `${performance.onTimeRate}%` : '—' },
    { label: 'Avg. delivery time', value: performance?.avgDeliveryMinutes != null ? `${performance.avgDeliveryMinutes} mins` : '—' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 w-full">
      {stats.map((s) => (
        <div key={s.label} className="text-center">
          <p className="text-lg sm:text-xl md:text-2xl font-bold">{s.value}</p>
          <p className="text-xs sm:text-sm text-muted-foreground">{s.label}</p>
        </div>
      ))}
    </div>
  );
};

export default ProfileStats;
