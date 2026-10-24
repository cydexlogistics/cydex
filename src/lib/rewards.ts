import {
  Award, Bike, Clock, Crown, Flame, Gem, Gift, Heart, MapPin, Medal, Package, Rocket, ShoppingBag, Sparkles, Star,
  Target, ThumbsUp, Timer, Trophy, Wallet, Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { formatNaira } from '@/lib/pricing';

// Rewards (docs/ORDER_FLOW.md → Rewards): achievements for customers, vendors
// and riders, and daily/weekly challenges for riders. Admins pick the icon and
// colour each one shows with.

export type RewardAudience = 'customer' | 'vendor' | 'rider';
export type RewardKind = 'milestone' | 'daily' | 'weekly';
export type RewardMetric =
  | 'orders_completed' | 'amount_spent' | 'amount_sold'
  | 'deliveries_completed' | 'distance_km' | 'online_minutes' | 'fastest_delivery';

export const REWARD_ICONS: Record<string, LucideIcon> = {
  trophy: Trophy, star: Star, medal: Medal, award: Award, crown: Crown, flame: Flame, zap: Zap, rocket: Rocket,
  target: Target, gift: Gift, heart: Heart, gem: Gem, sparkles: Sparkles, 'thumbs-up': ThumbsUp, bike: Bike,
  package: Package, 'map-pin': MapPin, clock: Clock, timer: Timer, wallet: Wallet, 'shopping-bag': ShoppingBag,
};

// Full class names so Tailwind keeps them
export const REWARD_COLORS: Record<string, { chip: string; bar: string; swatch: string }> = {
  amber: { chip: 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300', bar: 'bg-amber-500', swatch: 'bg-amber-500' },
  orange: { chip: 'bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300', bar: 'bg-orange-500', swatch: 'bg-orange-500' },
  red: { chip: 'bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300', bar: 'bg-red-500', swatch: 'bg-red-500' },
  pink: { chip: 'bg-pink-100 text-pink-600 dark:bg-pink-500/15 dark:text-pink-300', bar: 'bg-pink-500', swatch: 'bg-pink-500' },
  purple: { chip: 'bg-purple-100 text-purple-600 dark:bg-purple-500/15 dark:text-purple-300', bar: 'bg-purple-500', swatch: 'bg-purple-500' },
  blue: { chip: 'bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300', bar: 'bg-blue-500', swatch: 'bg-blue-500' },
  sky: { chip: 'bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300', bar: 'bg-sky-500', swatch: 'bg-sky-500' },
  teal: { chip: 'bg-teal-100 text-teal-600 dark:bg-teal-500/15 dark:text-teal-300', bar: 'bg-teal-500', swatch: 'bg-teal-500' },
  green: { chip: 'bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-300', bar: 'bg-green-500', swatch: 'bg-green-500' },
  lime: { chip: 'bg-lime-100 text-lime-700 dark:bg-lime-500/15 dark:text-lime-300', bar: 'bg-lime-500', swatch: 'bg-lime-500' },
};

export const rewardIcon = (key: string | null | undefined) => REWARD_ICONS[key ?? ''] ?? Trophy;
export const rewardColor = (key: string | null | undefined) => REWARD_COLORS[key ?? ''] ?? REWARD_COLORS.amber;

export const AUDIENCE_LABELS: Record<RewardAudience, string> = { customer: 'Customers', vendor: 'Vendors', rider: 'Riders' };

export const KIND_LABELS: Record<RewardKind, string> = {
  milestone: 'Achievement',
  daily: 'Daily challenge',
  weekly: 'Weekly challenge',
};

// What can be counted, for whom, and how the admin enters the target
export const METRICS: Record<RewardMetric, { label: string; audiences: RewardAudience[]; targetLabel: string; help: string }> = {
  orders_completed: {
    label: 'Orders completed', audiences: ['customer', 'vendor'], targetLabel: 'Number of orders',
    help: 'Delivered orders.',
  },
  amount_spent: {
    label: 'Amount spent', audiences: ['customer'], targetLabel: 'Amount (₦)',
    help: 'What they paid by card or wallet on delivered orders, after any discount.',
  },
  amount_sold: {
    label: 'Amount sold', audiences: ['vendor'], targetLabel: 'Amount (₦)',
    help: 'The items total of their delivered orders.',
  },
  deliveries_completed: {
    label: 'Deliveries completed', audiences: ['rider'], targetLabel: 'Number of deliveries',
    help: 'Delivered orders.',
  },
  distance_km: {
    label: 'Distance covered', audiences: ['rider'], targetLabel: 'Distance (km)',
    help: 'The trip distance of their delivered orders.',
  },
  online_minutes: {
    label: 'Time online', audiences: ['rider'], targetLabel: 'Hours online',
    help: 'Time spent online (available for orders). Checked every 10 minutes and when they go offline.',
  },
  fastest_delivery: {
    label: 'New fastest delivery', audiences: ['rider'], targetLabel: 'Shortest trip that counts (km)',
    help: 'Earned every time a rider beats their own fastest pickup-to-drop-off time on a trip at least this long. Their first trip sets the time to beat.',
  },
};

export const metricsFor = (audience: RewardAudience) =>
  (Object.keys(METRICS) as RewardMetric[]).filter((m) => METRICS[m].audiences.includes(audience));

// The admin enters hours for time online; the database counts minutes
export const targetToInput = (metric: string, target: number) =>
  metric === 'online_minutes' ? String(Math.round((target / 60) * 100) / 100) : String(target);
export const inputToTarget = (metric: string, value: number) => (metric === 'online_minutes' ? Math.round(value * 60) : value);

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-NG')} ${n === 1 ? one : many}`;

export const formatDuration = (minutes: number) => {
  const m = Math.floor(minutes);
  const h = Math.floor(m / 60);
  return h ? `${h}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`;
};

// "3 orders", "₦12,000.00", "4.5 km", "2h 10m"
export const formatMetric = (metric: string, value: number) => {
  switch (metric) {
    case 'amount_spent':
    case 'amount_sold':
      return formatNaira(value);
    case 'distance_km':
      return `${Math.round(value * 10) / 10} km`;
    case 'online_minutes':
      return formatDuration(value);
    case 'deliveries_completed':
      return plural(value, 'delivery', 'deliveries');
    case 'fastest_delivery':
      return `${value} km`;
    default:
      return plural(value, 'order');
  }
};

// "Complete 10 orders" style summary of the task
export const describeTask = (metric: string, target: number) => {
  switch (metric) {
    case 'amount_spent': return `Spend ${formatNaira(target)}`;
    case 'amount_sold': return `Sell ${formatNaira(target)}`;
    case 'distance_km': return `Cover ${formatMetric(metric, target)}`;
    case 'online_minutes': return `Stay online for ${formatDuration(target)}`;
    case 'fastest_delivery': return `Beat your fastest delivery (trips of ${target} km or more)`;
    default: return `Complete ${formatMetric(metric, target)}`;
  }
};
