import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import type { Database } from '@/integrations/supabase/types';

export type MyReward = Database['public']['Functions']['my_rewards']['Returns'][number];

// The signed-in user's rewards: running achievements and challenges with their
// progress, and achievements they've earned
export const useMyRewards = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my-rewards', user?.id],
    enabled: !!user?.id,
    refetchInterval: 60_000,
    queryFn: async (): Promise<MyReward[]> => {
      const { data, error } = await supabase.rpc('my_rewards');
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ...r,
        target: Number(r.target),
        progress: r.progress == null ? null : Number(r.progress),
        times_earned: Number(r.times_earned),
        best_minutes: r.best_minutes == null ? null : Number(r.best_minutes),
      }));
    },
  });
};
