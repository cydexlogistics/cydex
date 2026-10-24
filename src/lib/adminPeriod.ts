import { addDays, startOfDay, startOfMonth, subDays, subMonths } from 'date-fns';

// Date filters for the admin Overview and Earnings
export type PeriodPreset =
  | 'today' | 'last_7_days' | 'last_14_days' | 'this_month' | 'last_month' | 'last_3_months' | 'last_6_months' | 'all' | 'custom';

// Every admin date filter starts on today
export const DEFAULT_PERIOD: Period = { preset: 'today' };

export interface Period {
  preset: PeriodPreset;
  /** yyyy-mm-dd, custom only */
  from?: string;
  /** yyyy-mm-dd (inclusive), custom only */
  to?: string;
}

// In the order they're listed
export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  today: 'Today',
  last_7_days: 'Last 7 days',
  last_14_days: 'Last 14 days',
  this_month: 'This month',
  last_month: 'Last month',
  last_3_months: 'Last 3 months',
  last_6_months: 'Last 6 months',
  all: 'All time',
  custom: 'Custom dates',
};

// From (inclusive) and to (exclusive) as ISO strings; null = open-ended
export const periodRange = (p: Period, now = new Date()): { from: string | null; to: string | null } => {
  const iso = (d: Date) => d.toISOString();
  switch (p.preset) {
    case 'today':
      return { from: iso(startOfDay(now)), to: null };
    // Today and the days before it
    case 'last_7_days':
      return { from: iso(subDays(startOfDay(now), 6)), to: null };
    case 'last_14_days':
      return { from: iso(subDays(startOfDay(now), 13)), to: null };
    case 'this_month':
      return { from: iso(startOfMonth(now)), to: null };
    case 'last_month':
      return { from: iso(startOfMonth(subMonths(now, 1))), to: iso(startOfMonth(now)) };
    case 'last_3_months':
      return { from: iso(subMonths(startOfDay(now), 3)), to: null };
    case 'last_6_months':
      return { from: iso(subMonths(startOfDay(now), 6)), to: null };
    case 'custom':
      return {
        from: p.from ? iso(startOfDay(new Date(`${p.from}T00:00:00`))) : null,
        to: p.to ? iso(startOfDay(addDays(new Date(`${p.to}T00:00:00`), 1))) : null,
      };
    default:
      return { from: null, to: null };
  }
};

// Whole naira for cards and charts (tables use formatNaira)
export const nairaWhole = (amount: number | string | null | undefined) =>
  `₦${Math.round(Number(amount ?? 0)).toLocaleString('en-NG')}`;
