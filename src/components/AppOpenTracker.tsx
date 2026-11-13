import { useEffect } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { isStandalone } from '@/lib/pwa';

// While it's open and on screen, keep the current session going
const HEARTBEAT_MS = 5 * 60_000;

/**
 * Records app opens for Admin -> Metrics (public.app_sessions). Pings when a
 * signed-in customer, rider or vendor opens the app, when it comes back to
 * the foreground, and every 5 minutes while it's visible. The database counts
 * a new open only after 30 minutes without a ping (track_app_open), so
 * reloads and quick app switches don't inflate the count. Admins are skipped.
 */
const AppOpenTracker = () => {
  const { user } = useAuth();
  const userId = user?.id;
  const role = user?.role?.toUpperCase();

  useEffect(() => {
    if (!userId || !role || role === 'ADMIN') return;

    const ping = () => {
      if (document.visibilityState !== 'visible') return;
      supabase.rpc('track_app_open', { p_platform: isStandalone() ? 'installed' : 'browser' }).then(({ error }) => {
        if (error) console.warn('Could not record app open', error.message);
      });
    };

    ping();
    document.addEventListener('visibilitychange', ping);
    const timer = window.setInterval(ping, HEARTBEAT_MS);
    return () => {
      document.removeEventListener('visibilitychange', ping);
      window.clearInterval(timer);
    };
  }, [userId, role]);

  return null;
};

export default AppOpenTracker;
