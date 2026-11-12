import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

// How long to wait for a rider to come online before saying they're all busy
export const RIDER_SEARCH_MS = 60_000;
const RECHECK_MS = 10_000;
// After this, a new attempt for the same place pings riders and waits again
const FORGET_MS = 10 * 60_000;

export type RiderSearch = 'idle' | 'searching' | 'none';

// When a quote says no rider is free: tell riders an order is coming
// (call_riders_online, in the background), re-check the quote every 10 seconds,
// and only after a minute with no one report 'none', so the screen shows the
// "all our riders are busy" message. `key` identifies the pickup, so changing
// it starts again.
export const useRiderSearch = (noRiders: boolean, key: string, recheck: () => void): RiderSearch => {
  const started = useRef(new Map<string, number>());
  const recheckRef = useRef(recheck);
  recheckRef.current = recheck;
  const [, setTick] = useState(0);

  const startedAt = started.current.get(key);
  const elapsed = startedAt === undefined ? 0 : Date.now() - startedAt;
  const timedOut = elapsed >= RIDER_SEARCH_MS && elapsed <= FORGET_MS;

  useEffect(() => {
    if (!noRiders) return;
    let at = started.current.get(key);
    if (at === undefined || Date.now() - at > FORGET_MS) {
      at = Date.now();
      started.current.set(key, at);
      supabase.rpc('call_riders_online').then(({ error }) => {
        if (error) console.warn('call_riders_online', error.message);
      });
      setTick((t) => t + 1);
    }
    const left = at + RIDER_SEARCH_MS - Date.now();
    if (left <= 0) return;
    const poll = setInterval(() => recheckRef.current(), RECHECK_MS);
    const done = setTimeout(() => {
      clearInterval(poll);
      setTick((t) => t + 1);
    }, left);
    return () => {
      clearInterval(poll);
      clearTimeout(done);
    };
  }, [noRiders, key]);

  if (!noRiders) return 'idle';
  return timedOut ? 'none' : 'searching';
};
