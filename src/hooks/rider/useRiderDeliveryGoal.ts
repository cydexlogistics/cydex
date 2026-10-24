import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/SupabaseAuthContext';

export const DEFAULT_DELIVERY_GOAL = 10;
export const MAX_DELIVERY_GOAL = 100;

// How many deliveries the rider aims for each day (set from their profile,
// shown on the Earnings page)
export const useRiderDeliveryGoal = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = ['rider-delivery-goal', user?.id];

  const { data: goal = DEFAULT_DELIVERY_GOAL, isLoading } = useQuery({
    queryKey: key,
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rider_profiles')
        .select('daily_delivery_goal')
        .eq('id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data?.daily_delivery_goal ?? DEFAULT_DELIVERY_GOAL;
    },
  });

  const save = useMutation({
    mutationFn: async (value: number) => {
      const { error } = await supabase.from('rider_profiles').update({ daily_delivery_goal: value }).eq('id', user!.id);
      if (error) throw error;
      return value;
    },
    onSuccess: (value) => queryClient.setQueryData(key, value),
  });

  return { goal, isLoading, saveGoal: save.mutateAsync, saving: save.isPending };
};
