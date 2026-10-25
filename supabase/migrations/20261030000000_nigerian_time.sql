-- Dates and "today" worked out in the database use Nigerian time (Africa/Lagos,
-- UTC+1) instead of UTC. Stored times are unchanged: timestamptz columns are
-- exact moments either way. This fixes everything that turns a moment into a
-- day, which was an hour behind around midnight:
--   * rider_earnings.earnings_date (CURRENT_DATE) and other CURRENT_DATE defaults
--   * order and batch numbers (ORD-YYYYMMDD-..., BAT-YYYYMMDD-...)
--   * Admin -> Overview: "today" and the daily/monthly chart bars
-- Functions that already convert explicitly (opening hours, reward
-- challenges) are unaffected. pg_cron schedules are intervals, not times of day.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'Africa/Lagos');
END;
$$;
SET timezone TO 'Africa/Lagos';

-- Earnings paid between midnight and 1 am Nigerian time were dated the day before
UPDATE public.rider_earnings
SET earnings_date = (released_at AT TIME ZONE 'Africa/Lagos')::date
WHERE released_at IS NOT NULL
  AND earnings_date IS DISTINCT FROM (released_at AT TIME ZONE 'Africa/Lagos')::date;
