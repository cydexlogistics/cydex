import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// A vendor's business category name (e.g. Restaurant), for product placeholders.
// Only fetched when enabled, i.e. when a product has no image.
export const useVendorBusinessCategory = (vendorId: string | null | undefined, enabled = true) => {
  const { data } = useQuery({
    queryKey: ['vendor-business-category', vendorId],
    enabled: !!vendorId && enabled,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('vendor_business_categories', { p_vendor_ids: [vendorId!] });
      if (error) throw error;
      return data?.[0]?.category ?? null;
    },
  });
  return data ?? null;
};
