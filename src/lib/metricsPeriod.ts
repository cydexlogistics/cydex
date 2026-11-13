import type { Period, PeriodPreset } from './adminPeriod';
import { nigerianDate, nigerianWeekStart, shiftDate } from './nigerianTime';

// Date windows and comparison periods for Admin -> Metrics, in Nigerian time
// (Africa/Lagos is UTC+1 all year, no daylight saving).
//
// Accepts every preset in the admin date filter (PeriodPreset) plus
// 'yesterday', 'this_week' and 'this_year', so they work here if they are
// added to the filter later.
export type MetricsPreset = PeriodPreset | 'yesterday' | 'this_week' | 'this_year';

export interface MetricsPeriodInput {
  preset: MetricsPreset;
  /** yyyy-mm-dd, custom only */
  from?: string;
  /** yyyy-mm-dd (inclusive), custom only */
  to?: string;
}

/** start inclusive, end exclusive, as ISO strings. start = null means "from the beginning". */
export interface DateWindow {
  start: string | null;
  end: string;
}

export interface MetricsRanges {
  current: DateWindow;
  /** What the current period is compared to. null for all time (no comparison). */
  previous: DateWindow | null;
  /**
   * The period before `previous`. Churn compares a period with the one before
   * it, so the previous period's churn (needed for its badge) uses this one.
   */
  prior: DateWindow | null;
}

// Midnight in Nigeria on a yyyy-mm-dd date, as a UTC ISO string
export const lagosMidnight = (date: string) => new Date(`${date}T00:00:00+01:00`).toISOString();

const addMonths = (monthStart: string, months: number) => {
  const [y, m] = monthStart.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
};

// The same day of the month `months` earlier, clamped to that month's last day (31 Mar -> 28/29 Feb)
const sameDayMonthsBefore = (date: string, months: number) => {
  const first = addMonths(`${date.slice(0, 8)}01`, -months);
  const lastDay = Number(shiftDate(addMonths(first, 1), -1).slice(8, 10));
  const day = Math.min(Number(date.slice(8, 10)), lastDay);
  return `${first.slice(0, 8)}${String(day).padStart(2, '0')}`;
};

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

type Unit = { kind: 'day'; days: number } | { kind: 'month'; months: number } | { kind: 'all' };

// A window as Nigerian dates [from, to) plus how to step back one period
interface DateSpan { from: string; to: string; unit: Unit }

const spanFor = (p: MetricsPeriodInput, today: string): DateSpan | 'all' | null => {
  const tomorrow = shiftDate(today, 1);
  const monthStart = `${today.slice(0, 8)}01`;
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const rolling = (from: string): DateSpan => ({ from, to: tomorrow, unit: { kind: 'day', days: daysBetween(from, tomorrow) } });

  switch (p.preset) {
    case 'today':
      return { from: today, to: tomorrow, unit: { kind: 'day', days: 1 } };
    case 'yesterday':
      return { from: shiftDate(today, -1), to: today, unit: { kind: 'day', days: 1 } };
    case 'this_week': {
      // Weeks start on Sunday, like the rest of the app (nigerianWeekStart)
      const weekStart = nigerianWeekStart(new Date(`${today}T12:00:00+01:00`));
      return { from: weekStart, to: shiftDate(weekStart, 7), unit: { kind: 'day', days: 7 } };
    }
    case 'this_month':
      return { from: monthStart, to: addMonths(monthStart, 1), unit: { kind: 'month', months: 1 } };
    case 'last_month':
      return { from: addMonths(monthStart, -1), to: monthStart, unit: { kind: 'month', months: 1 } };
    case 'this_year':
      return { from: yearStart, to: addMonths(yearStart, 12), unit: { kind: 'month', months: 12 } };
    // Rolling windows (today and the days before it) compare with the same
    // number of days just before them, like a custom range
    case 'last_7_days':
      return rolling(shiftDate(today, -6));
    case 'last_14_days':
      return rolling(shiftDate(today, -13));
    case 'last_3_months':
      return rolling(sameDayMonthsBefore(today, 3));
    case 'last_6_months':
      return rolling(sameDayMonthsBefore(today, 6));
    case 'custom': {
      if (!p.from || !p.to || p.to < p.from) return null;
      const to = shiftDate(p.to, 1);
      return { from: p.from, to, unit: { kind: 'day', days: daysBetween(p.from, to) } };
    }
    case 'all':
      return 'all';
    default:
      return null;
  }
};

const stepBack = (span: DateSpan): DateSpan => {
  if (span.unit.kind === 'month') {
    return { from: addMonths(span.from, -span.unit.months), to: span.from, unit: span.unit };
  }
  if (span.unit.kind === 'day') {
    return { from: shiftDate(span.from, -span.unit.days), to: span.from, unit: span.unit };
  }
  return span;
};

const toWindow = (span: DateSpan): DateWindow => ({ start: lagosMidnight(span.from), end: lagosMidnight(span.to) });

/**
 * The current period, the period it is compared with, and the one before that.
 *
 *   Today         -> yesterday
 *   Yesterday     -> the day before
 *   This week     -> last week
 *   This month    -> all of last month
 *   Last month    -> the month before
 *   This year     -> all of last year
 *   Last 7/14 days, last 3/6 months, custom range of N days -> the N days just before it
 *   All time      -> no comparison (previous = null)
 *
 * The current period is always the whole period (all of today, all of this
 * month), even though part of it hasn't happened yet. It is compared with the
 * whole previous period, not with the same elapsed portion of it (no scaling):
 * on the 10th, "this month" is 10 days of data against all of last month.
 *
 * Returns null when the filter isn't complete (a custom range without both dates).
 */
export const metricsRanges = (p: MetricsPeriodInput | Period, now: Date = new Date()): MetricsRanges | null => {
  const today = nigerianDate(now);
  const span = spanFor(p, today);
  if (span === null) return null;
  if (span === 'all') {
    return { current: { start: null, end: lagosMidnight(shiftDate(today, 1)) }, previous: null, prior: null };
  }
  const previous = stepBack(span);
  return { current: toWindow(span), previous: toWindow(previous), prior: toWindow(stepBack(previous)) };
};

// ---------------------------------------------------------------------------
// Percentage difference badge
// ---------------------------------------------------------------------------

export type ChangeTone = 'up' | 'down' | 'neutral';

export interface PercentChange {
  /** "+12.34%", "-5.00%", "0.00%" or "N/A" */
  text: string;
  /** Direction of the change; 'neutral' for 0.00% and N/A */
  tone: ChangeTone;
}

/**
 * ((current - previous) / previous) x 100, to exactly 2 decimal places with a sign.
 *
 *   no comparison (all time)          -> 0.00%
 *   either figure can't be computed   -> N/A
 *   previous 0, current above 0       -> N/A (no fake percentage)
 *   both 0                            -> 0.00%
 *   a change that rounds to 0.00      -> 0.00% (neutral)
 */
export const percentChange = (
  current: number | null | undefined,
  previous: number | null | undefined,
  hasComparison = true,
): PercentChange => {
  if (!hasComparison) return { text: '0.00%', tone: 'neutral' };
  if (current == null || previous == null || !Number.isFinite(current) || !Number.isFinite(previous)) {
    return { text: 'N/A', tone: 'neutral' };
  }
  if (previous === 0) {
    return current === 0 ? { text: '0.00%', tone: 'neutral' } : { text: 'N/A', tone: 'neutral' };
  }
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const rounded = Math.round(pct * 100) / 100;
  if (rounded === 0) return { text: '0.00%', tone: 'neutral' };
  return { text: `${rounded > 0 ? '+' : '-'}${Math.abs(rounded).toFixed(2)}%`, tone: rounded > 0 ? 'up' : 'down' };
};

/**
 * Badge colour. By default up = green and down = red; invertColor flips that
 * for metrics where lower is better (churn, dormant users, times).
 */
export const changeColor = (tone: ChangeTone, invertColor = false): 'green' | 'red' | 'grey' => {
  if (tone === 'neutral') return 'grey';
  const good = tone === 'up' ? !invertColor : invertColor;
  return good ? 'green' : 'red';
};

// "Xm Ys" from seconds; null -> "—"
export const formatDuration = (seconds: number | null | undefined) => {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}m ${s}s`;
};
