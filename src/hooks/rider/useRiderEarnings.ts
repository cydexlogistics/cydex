
import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { nigerianDate, nigerianMonthStart, nigerianWeekStart } from '@/lib/nigerianTime';

export interface RiderEarnings {
  delivery_fee: number;
  eco_bonus: number;
  tip_amount: number;
  total_earnings: number;
  earnings_date: string;
  carbon_credits_earned: number;
}

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

export const useRiderEarnings = () => {
  const { user } = useAuth();
  const [todaysEarnings, setTodaysEarnings] = useState<RiderEarnings[]>([]);
  const [weeklyEarnings, setWeeklyEarnings] = useState<RiderEarnings[]>([]);
  const [monthlyEarnings, setMonthlyEarnings] = useState<RiderEarnings[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const retryWithBackoff = async <T>(
    operation: () => Promise<T>,
    retries = MAX_RETRIES
  ): Promise<T> => {
    try {
      return await operation();
    } catch (error) {
      if (retries > 0) {
        console.log(`Retrying earnings operation, ${retries} attempts remaining`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (MAX_RETRIES - retries + 1)));
        return retryWithBackoff(operation, retries - 1);
      }
      throw error;
    }
  };

  const fetchTodaysEarnings = useCallback(async () => {
    if (!user?.id) {
      console.log('[RiderEarnings] No user ID available');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('[RiderEarnings] Fetching today\'s earnings for rider:', user.id);
      
      // In Nigerian time, like earnings_date
      const today = nigerianDate();
      
      const operation = async () => {
        const { data, error } = await supabase
          .from('rider_earnings')
          .select('*')
          .eq('rider_id', user.id)
          .eq('earnings_date', today)
          .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
      };

      const data = await retryWithBackoff(operation);
      
      console.log('[RiderEarnings] Today\'s earnings loaded:', data?.length || 0);
      setTodaysEarnings(data || []);
    } catch (error: any) {
      console.error('[RiderEarnings] Error fetching today\'s earnings:', error);
      setError('Failed to load today\'s earnings');
      toast.error('Failed to load today\'s earnings');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const fetchWeeklyEarnings = useCallback(async () => {
    if (!user?.id) {
      console.log('[RiderEarnings] No user ID available for weekly earnings');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('[RiderEarnings] Fetching weekly earnings for rider:', user.id);
      
      // Since Sunday, in Nigerian time
      const weekStart = nigerianWeekStart();
      
      const operation = async () => {
        const { data, error } = await supabase
          .from('rider_earnings')
          .select('*')
          .eq('rider_id', user.id)
          .gte('earnings_date', weekStart)
          .order('earnings_date', { ascending: false });

        if (error) throw error;
        return data;
      };

      const data = await retryWithBackoff(operation);
      
      console.log('[RiderEarnings] Weekly earnings loaded:', data?.length || 0);
      setWeeklyEarnings(data || []);
    } catch (error: any) {
      console.error('[RiderEarnings] Error fetching weekly earnings:', error);
      setError('Failed to load weekly earnings');
      toast.error('Failed to load weekly earnings');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const fetchMonthlyEarnings = useCallback(async () => {
    if (!user?.id) {
      console.log('[RiderEarnings] No user ID available for monthly earnings');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('[RiderEarnings] Fetching monthly earnings for rider:', user.id);
      
      // Since the 1st, in Nigerian time
      const monthStartStr = nigerianMonthStart();
      
      const operation = async () => {
        const { data, error } = await supabase
          .from('rider_earnings')
          .select('*')
          .eq('rider_id', user.id)
          .gte('earnings_date', monthStartStr)
          .order('earnings_date', { ascending: false });

        if (error) throw error;
        return data;
      };

      const data = await retryWithBackoff(operation);
      
      console.log('[RiderEarnings] Monthly earnings loaded:', data?.length || 0);
      setMonthlyEarnings(data || []);
    } catch (error: any) {
      console.error('[RiderEarnings] Error fetching monthly earnings:', error);
      setError('Failed to load monthly earnings');
      toast.error('Failed to load monthly earnings');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const refetchEarnings = useCallback(async () => {
    try {
      await Promise.all([
        fetchTodaysEarnings(),
        fetchWeeklyEarnings(),
        fetchMonthlyEarnings()
      ]);
    } catch (error) {
      console.error('[RiderEarnings] Error refetching all earnings:', error);
    }
  }, [fetchTodaysEarnings, fetchWeeklyEarnings, fetchMonthlyEarnings]);

  return {
    todaysEarnings,
    weeklyEarnings,
    monthlyEarnings,
    loading,
    error,
    fetchTodaysEarnings,
    fetchWeeklyEarnings,
    fetchMonthlyEarnings,
    refetchEarnings
  };
};
