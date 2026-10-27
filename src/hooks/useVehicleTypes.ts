import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export type VehicleType = Tables<'vehicle_types'>;

// "7 km", "1.5 km"
export const kmText = (km: number | null | undefined) => `${Number((Number(km ?? 0)).toFixed(2))} km`;

// Vehicle types are managed by admins (Admin -> Riders & vehicles).
// includeInactive: also the ones switched off (admin screens, old riders' types).
export const useVehicleTypes = (includeInactive = false) => {
  const { data = [], isLoading } = useQuery({
    queryKey: ['vehicle-types'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('vehicle_types').select('*').order('sort_order').order('key');
      if (error) throw error;
      return data ?? [];
    },
  });
  const types = includeInactive ? data : data.filter((t) => t.is_active);
  const byKey = (key: string | null | undefined) => data.find((t) => t.key === key);
  // The longest delivery Cydex does: as far as the furthest active mode goes
  // (each vehicle type's longest trip is set in Admin -> Riders & vehicles)
  const maxTripKm = Math.max(0, ...data.filter((t) => t.is_active).map((t) => Number(t.max_distance_km))) || 5;
  return {
    types,
    maxTripKm,
    /** e.g. "7 km" */
    maxTripText: kmText(maxTripKm),
    loading: isLoading,
    byKey,
    /** The rider-facing name, e.g. "Walking" */
    nameOf: (key: string | null | undefined) => byKey(key)?.name ?? (key ? key.replace(/_/g, ' ') : ''),
    /** What customers see, e.g. "EcoChampions" for walking */
    labelOf: (key: string | null | undefined) => {
      const t = byKey(key);
      return t ? t.customer_label || t.name : key ? key.replace(/_/g, ' ') : '';
    },
  };
};

// How close to a pickup the signed-in rider must be to see new orders, from
// their vehicle type (Admin -> Riders & vehicles); 5 km until it's known
export const useRiderSeeOrdersKm = () => {
  const { byKey } = useVehicleTypes(true);
  const { data: vehicle } = useQuery({
    queryKey: ['my-rider-vehicle-type'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data } = await supabase.from('rider_profiles').select('vehicle_type').eq('id', auth.user.id).maybeSingle();
      return data?.vehicle_type ?? null;
    },
  });
  const type = byKey(vehicle) ?? byKey('bicycle');
  return Number(type?.see_orders_km ?? 5);
};
