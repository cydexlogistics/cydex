
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface VendorRating {
  average_rating: number;
  total_ratings: number;
  average_delivery_rating: number;
  average_product_quality_rating: number;
}

const NO_RATING: VendorRating = {
  average_rating: 0,
  total_ratings: 0,
  average_delivery_rating: 0,
  average_product_quality_rating: 0,
};

// One vendor's rating, fetched once and shared by every component that asks
// for the same vendor (e.g. all the product cards on their storefront)
export const useVendorRating = (vendorId: string | null | undefined): VendorRating => {
  const { data } = useQuery({
    queryKey: ['vendor-rating', vendorId],
    enabled: !!vendorId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_vendor_average_rating', { vendor_uuid: vendorId! });
      if (error) throw error;
      return (data?.[0] as VendorRating | undefined) ?? NO_RATING;
    },
  });
  return data ?? NO_RATING;
};
