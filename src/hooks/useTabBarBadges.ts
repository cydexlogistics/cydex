import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';

const REFRESH_MS = 30_000;

// New orders waiting for the vendor to accept: paid customer orders still
// pending (same orders as the top of the vendor's Orders page)
export const useVendorNewOrderCount = (enabled: boolean) => {
  const { user } = useAuth();
  const { data = 0 } = useQuery({
    queryKey: ['tab-badge', 'vendor-new-orders', user?.id],
    enabled: enabled && !!user?.id,
    refetchInterval: REFRESH_MS,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('vendor_id', user!.id)
        .eq('order_type', 'customer')
        .eq('payment_status', 'paid')
        .eq('status', 'pending');
      if (error) throw error;
      return count ?? 0;
    },
  });
  return data;
};

// Orders a rider can take right now, counted like the Available Orders page:
// paid, ready for pickup, no rider yet, and a batch counts once
export const useRiderAvailableCount = (enabled: boolean) => {
  const { user } = useAuth();
  const { data = 0 } = useQuery({
    queryKey: ['tab-badge', 'rider-available', user?.id],
    enabled: enabled && !!user?.id,
    refetchInterval: REFRESH_MS,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deliveries')
        .select('id, orders!inner(batch_id)')
        .eq('status', 'available')
        .is('rider_id', null)
        .eq('orders.payment_status', 'paid')
        .eq('orders.status', 'ready_for_pickup')
        .limit(50);
      if (error) throw error;
      return new Set((data ?? []).map((d) => (d.orders as { batch_id: string | null } | null)?.batch_id ?? d.id)).size;
    },
  });
  return data;
};
