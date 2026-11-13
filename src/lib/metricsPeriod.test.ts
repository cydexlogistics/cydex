import { describe, expect, it } from 'vitest';
import { changeColor, formatDuration, lagosMidnight as L, metricsRanges, percentChange } from './metricsPeriod';

// A moment in Nigeria: "2026-11-13 10:00" Lagos time
const at = (lagos: string) => new Date(`${lagos}:00+01:00`);

const ranges = (preset: Parameters<typeof metricsRanges>[0], now: Date) => {
  const r = metricsRanges(preset, now);
  if (!r) throw new Error('expected ranges');
  return r;
};

describe('lagosMidnight', () => {
  it('is 23:00 UTC the day before', () => {
    expect(L('2026-11-13')).toBe('2026-11-12T23:00:00.000Z');
  });
});

describe('metricsRanges', () => {
  const now = at('2026-11-13T10:00'); // a Friday

  it('today -> yesterday', () => {
    const r = ranges({ preset: 'today' }, now);
    expect(r.current).toEqual({ start: L('2026-11-13'), end: L('2026-11-14') });
    expect(r.previous).toEqual({ start: L('2026-11-12'), end: L('2026-11-13') });
    expect(r.prior).toEqual({ start: L('2026-11-11'), end: L('2026-11-12') });
  });

  it('uses the Nigerian date, not the UTC date, just after midnight', () => {
    // 00:30 in Lagos on the 13th is still the 12th in UTC
    const r = ranges({ preset: 'today' }, at('2026-11-13T00:30'));
    expect(r.current.start).toBe(L('2026-11-13'));
  });

  it('yesterday -> the day before', () => {
    const r = ranges({ preset: 'yesterday' }, now);
    expect(r.current).toEqual({ start: L('2026-11-12'), end: L('2026-11-13') });
    expect(r.previous).toEqual({ start: L('2026-11-11'), end: L('2026-11-12') });
  });

  it('today on the 1st of a month -> the last day of the previous month', () => {
    const r = ranges({ preset: 'today' }, at('2026-03-01T09:00'));
    expect(r.previous).toEqual({ start: L('2026-02-28'), end: L('2026-03-01') });
  });

  it('yesterday on 1 January -> 30 and 31 December', () => {
    const r = ranges({ preset: 'yesterday' }, at('2027-01-01T09:00'));
    expect(r.current).toEqual({ start: L('2026-12-31'), end: L('2027-01-01') });
    expect(r.previous).toEqual({ start: L('2026-12-30'), end: L('2026-12-31') });
  });

  it('this week (Sunday start) -> last week', () => {
    const r = ranges({ preset: 'this_week' }, now);
    expect(r.current).toEqual({ start: L('2026-11-08'), end: L('2026-11-15') });
    expect(r.previous).toEqual({ start: L('2026-11-01'), end: L('2026-11-08') });
  });

  it('this week across a year boundary', () => {
    const r = ranges({ preset: 'this_week' }, at('2027-01-02T09:00')); // Saturday
    expect(r.current).toEqual({ start: L('2026-12-27'), end: L('2027-01-03') });
    expect(r.previous).toEqual({ start: L('2026-12-20'), end: L('2026-12-27') });
  });

  it('this month -> all of last month (not scaled to the days so far)', () => {
    const r = ranges({ preset: 'this_month' }, now);
    expect(r.current).toEqual({ start: L('2026-11-01'), end: L('2026-12-01') });
    expect(r.previous).toEqual({ start: L('2026-10-01'), end: L('2026-11-01') });
    expect(r.prior).toEqual({ start: L('2026-09-01'), end: L('2026-10-01') });
  });

  it('this month in March -> all of February (leap and non-leap)', () => {
    expect(ranges({ preset: 'this_month' }, at('2026-03-15T09:00')).previous)
      .toEqual({ start: L('2026-02-01'), end: L('2026-03-01') });
    expect(ranges({ preset: 'this_month' }, at('2028-03-31T09:00')).previous)
      .toEqual({ start: L('2028-02-01'), end: L('2028-03-01') });
  });

  it('this month in January -> December of the year before', () => {
    const r = ranges({ preset: 'this_month' }, at('2027-01-05T09:00'));
    expect(r.current).toEqual({ start: L('2027-01-01'), end: L('2027-02-01') });
    expect(r.previous).toEqual({ start: L('2026-12-01'), end: L('2027-01-01') });
    expect(r.prior).toEqual({ start: L('2026-11-01'), end: L('2026-12-01') });
  });

  it('this month on the 31st of December', () => {
    const r = ranges({ preset: 'this_month' }, at('2026-12-31T23:30'));
    expect(r.current).toEqual({ start: L('2026-12-01'), end: L('2027-01-01') });
  });

  it('last month -> the month before', () => {
    const r = ranges({ preset: 'last_month' }, now);
    expect(r.current).toEqual({ start: L('2026-10-01'), end: L('2026-11-01') });
    expect(r.previous).toEqual({ start: L('2026-09-01'), end: L('2026-10-01') });
  });

  it('last month in January -> December, compared with November', () => {
    const r = ranges({ preset: 'last_month' }, at('2027-01-10T09:00'));
    expect(r.current).toEqual({ start: L('2026-12-01'), end: L('2027-01-01') });
    expect(r.previous).toEqual({ start: L('2026-11-01'), end: L('2026-12-01') });
  });

  it('this year -> all of last year', () => {
    const r = ranges({ preset: 'this_year' }, now);
    expect(r.current).toEqual({ start: L('2026-01-01'), end: L('2027-01-01') });
    expect(r.previous).toEqual({ start: L('2025-01-01'), end: L('2026-01-01') });
    expect(r.prior).toEqual({ start: L('2024-01-01'), end: L('2025-01-01') });
  });

  it('this year on 1 January just after midnight', () => {
    const r = ranges({ preset: 'this_year' }, at('2027-01-01T00:05'));
    expect(r.current).toEqual({ start: L('2027-01-01'), end: L('2028-01-01') });
  });

  it('last 7 days (today included) -> the 7 days before', () => {
    const r = ranges({ preset: 'last_7_days' }, now);
    expect(r.current).toEqual({ start: L('2026-11-07'), end: L('2026-11-14') });
    expect(r.previous).toEqual({ start: L('2026-10-31'), end: L('2026-11-07') });
    expect(r.prior).toEqual({ start: L('2026-10-24'), end: L('2026-10-31') });
  });

  it('last 14 days -> the 14 days before', () => {
    const r = ranges({ preset: 'last_14_days' }, now);
    expect(r.current).toEqual({ start: L('2026-10-31'), end: L('2026-11-14') });
    expect(r.previous).toEqual({ start: L('2026-10-17'), end: L('2026-10-31') });
  });

  it('last 3 months -> the same number of days before', () => {
    const r = ranges({ preset: 'last_3_months' }, now);
    // 13 Aug to 13 Nov inclusive = 93 days
    expect(r.current).toEqual({ start: L('2026-08-13'), end: L('2026-11-14') });
    expect(r.previous).toEqual({ start: L('2026-05-12'), end: L('2026-08-13') });
  });

  it('last 3 months from 31 May starts on 28 Feb (no 31 Feb)', () => {
    const r = ranges({ preset: 'last_3_months' }, at('2026-05-31T09:00'));
    expect(r.current.start).toBe(L('2026-02-28'));
  });

  it('last 6 months -> the same number of days before', () => {
    const r = ranges({ preset: 'last_6_months' }, now);
    // 13 May to 13 Nov inclusive = 185 days
    expect(r.current).toEqual({ start: L('2026-05-13'), end: L('2026-11-14') });
    expect(r.previous).toEqual({ start: L('2025-11-09'), end: L('2026-05-13') });
  });

  it('custom range of N days -> the N days just before the start', () => {
    const r = ranges({ preset: 'custom', from: '2026-11-01', to: '2026-11-10' }, now);
    expect(r.current).toEqual({ start: L('2026-11-01'), end: L('2026-11-11') });
    expect(r.previous).toEqual({ start: L('2026-10-22'), end: L('2026-11-01') });
    expect(r.prior).toEqual({ start: L('2026-10-12'), end: L('2026-10-22') });
  });

  it('custom single day -> the day before', () => {
    const r = ranges({ preset: 'custom', from: '2026-03-01', to: '2026-03-01' }, now);
    expect(r.current).toEqual({ start: L('2026-03-01'), end: L('2026-03-02') });
    expect(r.previous).toEqual({ start: L('2026-02-28'), end: L('2026-03-01') });
  });

  it('custom range across a year boundary', () => {
    const r = ranges({ preset: 'custom', from: '2026-12-25', to: '2027-01-05' }, now);
    expect(r.current).toEqual({ start: L('2026-12-25'), end: L('2027-01-06') });
    expect(r.previous).toEqual({ start: L('2026-12-13'), end: L('2026-12-25') });
  });

  it('custom range of a full month is still N days, not "the previous month"', () => {
    const r = ranges({ preset: 'custom', from: '2026-03-01', to: '2026-03-31' }, now);
    expect(r.previous).toEqual({ start: L('2026-01-29'), end: L('2026-03-01') });
  });

  it('custom range without both dates, or backwards, is incomplete', () => {
    expect(metricsRanges({ preset: 'custom', from: '2026-11-01' }, now)).toBeNull();
    expect(metricsRanges({ preset: 'custom', to: '2026-11-01' }, now)).toBeNull();
    expect(metricsRanges({ preset: 'custom', from: '2026-11-10', to: '2026-11-01' }, now)).toBeNull();
  });

  it('all time has no comparison', () => {
    const r = ranges({ preset: 'all' }, now);
    expect(r.current).toEqual({ start: null, end: L('2026-11-14') });
    expect(r.previous).toBeNull();
    expect(r.prior).toBeNull();
  });
});

describe('percentChange', () => {
  it('shows a signed change to exactly 2 decimal places', () => {
    expect(percentChange(120, 100)).toEqual({ text: '+20.00%', tone: 'up' });
    expect(percentChange(50, 100)).toEqual({ text: '-50.00%', tone: 'down' });
    expect(percentChange(1, 3)).toEqual({ text: '-66.67%', tone: 'down' });
    expect(percentChange(4, 3)).toEqual({ text: '+33.33%', tone: 'up' });
    expect(percentChange(0, 10)).toEqual({ text: '-100.00%', tone: 'down' });
  });

  it('no change is a neutral 0.00%', () => {
    expect(percentChange(7, 7)).toEqual({ text: '0.00%', tone: 'neutral' });
  });

  it('a change that rounds to 0.00 is neutral', () => {
    expect(percentChange(100001, 100000)).toEqual({ text: '0.00%', tone: 'neutral' });
  });

  it('previous 0 and current above 0 is N/A, not a fake percentage', () => {
    expect(percentChange(5, 0)).toEqual({ text: 'N/A', tone: 'neutral' });
  });

  it('both 0 is 0.00%', () => {
    expect(percentChange(0, 0)).toEqual({ text: '0.00%', tone: 'neutral' });
  });

  it('all time (no comparison) is 0.00%', () => {
    expect(percentChange(42, null, false)).toEqual({ text: '0.00%', tone: 'neutral' });
  });

  it('a figure that cannot be computed is N/A', () => {
    expect(percentChange(null, 10)).toEqual({ text: 'N/A', tone: 'neutral' });
    expect(percentChange(10, null)).toEqual({ text: 'N/A', tone: 'neutral' });
  });
});

describe('changeColor', () => {
  it('green for up, red for down, grey for neutral by default', () => {
    expect(changeColor('up')).toBe('green');
    expect(changeColor('down')).toBe('red');
    expect(changeColor('neutral')).toBe('grey');
  });

  it('invertColor flips green and red but not grey', () => {
    expect(changeColor('up', true)).toBe('red');
    expect(changeColor('down', true)).toBe('green');
    expect(changeColor('neutral', true)).toBe('grey');
  });
});

describe('formatDuration', () => {
  it('formats seconds as "Xm Ys"', () => {
    expect(formatDuration(0)).toBe('0m 0s');
    expect(formatDuration(59.6)).toBe('1m 0s');
    expect(formatDuration(754)).toBe('12m 34s');
    expect(formatDuration(3725)).toBe('62m 5s');
  });

  it('shows "—" when it cannot be computed', () => {
    expect(formatDuration(null)).toBe('—');
  });
});
