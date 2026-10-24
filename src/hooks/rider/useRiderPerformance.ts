import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/SupabaseAuthContext';

// A delivery counts as on time when the ride (pickup to drop-off) took no
// longer than the expected ride time plus this grace.
const GRACE_MINUTES = 5;
// Used when a vehicle type has no average speed
const DEFAULT_SPEED_KMH = 15;

export interface RiderPerformance {
  /** Delivered orders counted */
  deliveries: number;
  /** % delivered within the expected ride time (+5 min); null with no deliveries to judge */
  onTimeRate: number | null;
  /** Average minutes from accepting an order to delivering it; null with no deliveries */
  avgDeliveryMinutes: number | null;
  /** Total trip distance of the delivered orders, in km */
  distanceKm: number;
}

interface DeliveredOrder {
  id: string;
  distance_km: number | null;
  batch_id: string | null;
  batch_seq: number | null;
  rider_vehicle_type: string | null;
  rider_assigned_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
}

const minutesBetween = (from: string | null, to: string | null) =>
  from && to ? (new Date(to).getTime() - new Date(from).getTime()) / 60000 : null;

// The ride time a trip should take: distance at the vehicle's average speed,
// rounded up to 5 minutes like the estimates customers see
const expectedRideMinutes = (km: number, speedKmh: number) =>
  Math.max(5, Math.ceil(((km * 60) / speedKmh) / 5) * 5);

export const computePerformance = (orders: DeliveredOrder[], speeds: Map<string, number>): RiderPerformance => {
  // A batch's later drop-offs are reached via the earlier ones, so each stop's
  // expected ride time covers every leg up to it
  const legsBefore = new Map<string, number>();
  const byBatch = new Map<string, DeliveredOrder[]>();
  orders.forEach((o) => { if (o.batch_id) byBatch.set(o.batch_id, [...(byBatch.get(o.batch_id) ?? []), o]); });
  byBatch.forEach((stops) => {
    let km = 0;
    [...stops].sort((a, b) => (a.batch_seq ?? 0) - (b.batch_seq ?? 0)).forEach((s) => {
      km += Number(s.distance_km ?? 0);
      legsBefore.set(s.id, km);
    });
  });

  let judged = 0;
  let onTime = 0;
  let totalMinutes = 0;
  let timed = 0;
  let distanceKm = 0;

  orders.forEach((o) => {
    const km = Number(o.distance_km ?? 0);
    distanceKm += km;

    const job = minutesBetween(o.rider_assigned_at, o.delivered_at);
    if (job !== null && job >= 0) { totalMinutes += job; timed += 1; }

    const ride = minutesBetween(o.picked_up_at, o.delivered_at);
    if (ride !== null && ride >= 0) {
      const speed = speeds.get(o.rider_vehicle_type ?? '') || DEFAULT_SPEED_KMH;
      const allowed = expectedRideMinutes(legsBefore.get(o.id) ?? km, speed) + GRACE_MINUTES;
      judged += 1;
      if (ride <= allowed) onTime += 1;
    }
  });

  return {
    deliveries: orders.length,
    onTimeRate: judged ? Math.round((onTime / judged) * 100) : null,
    avgDeliveryMinutes: timed ? Math.round(totalMinutes / timed) : null,
    distanceKm: Math.round(distanceKm * 10) / 10,
  };
};

// The signed-in rider's delivery performance since a date (null: all time),
// worked out from their delivered orders
export const useRiderPerformance = (since: Date | null) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['rider-performance', user?.id, since?.toISOString() ?? 'all'],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<RiderPerformance> => {
      let query = supabase
        .from('orders')
        .select('id, distance_km, batch_id, batch_seq, rider_vehicle_type, rider_assigned_at, picked_up_at, delivered_at')
        .eq('rider_id', user!.id)
        .eq('status', 'delivered');
      if (since) query = query.gte('delivered_at', since.toISOString());
      const [{ data: orders, error }, { data: types }] = await Promise.all([
        query,
        supabase.from('vehicle_types').select('key, avg_speed_kmh'),
      ]);
      if (error) throw error;
      const speeds = new Map((types ?? []).map((t) => [t.key, Number(t.avg_speed_kmh)]));
      return computePerformance((orders ?? []) as DeliveredOrder[], speeds);
    },
  });
};

// What the rider will be paid for deliveries they've accepted but not yet
// completed (credited to their wallet when each one is delivered)
export const useRiderPendingEarnings = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['rider-pending-earnings', user?.id],
    enabled: !!user?.id,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deliveries')
        .select('rider_earning')
        .eq('rider_id', user!.id)
        .in('status', ['accepted', 'picking_up', 'picked_up', 'delivering']);
      if (error) throw error;
      return {
        amount: (data ?? []).reduce((sum, d) => sum + Number(d.rider_earning ?? 0), 0),
        deliveries: data?.length ?? 0,
      };
    },
  });
};
