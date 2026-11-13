
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Product {
  id: string;
  vendor_id: string;
  name: string;
  description: string | null;
  price: number;
  category: string | null;
  is_eco_friendly: boolean;
  carbon_impact: number;
  discount_type: string | null;
  discount_value: number | null;
  stock_quantity: number | null;
  track_stock: boolean;
  image_url: string | null;
  status: 'active' | 'inactive' | 'out_of_stock';
  created_at: string;
  updated_at: string;
  vendor?: {
    name: string;
    email: string;
  };
}

// One vendor's products with the vendor's name, for their storefront.
// Nothing is fetched until a vendor is chosen (vendorId null). Unavailable
// products are included: they're shown but can't be added to the cart (see
// lib/products). Cached per vendor, so going back to a store is instant.
export const useProducts = (vendorId: string | null) => {
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['vendor-products', vendorId],
    enabled: !!vendorId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          vendor:profiles!products_vendor_id_fkey (
            name,
            email
          )
        `)
        .eq('vendor_id', vendorId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Product[];
    },
  });

  useEffect(() => {
    if (error) toast.error(error instanceof Error ? error.message : 'Failed to fetch products');
  }, [error]);

  // Live updates to this vendor's products only
  useEffect(() => {
    if (!vendorId) return;
    const channel = supabase
      .channel(`products_${vendorId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products', filter: `vendor_id=eq.${vendorId}` },
        () => queryClient.invalidateQueries({ queryKey: ['vendor-products', vendorId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [vendorId, queryClient]);

  return {
    products: data ?? [],
    loading: !!vendorId && isLoading,
    error: error ? (error instanceof Error ? error.message : 'Failed to fetch products') : null,
    refetch,
  };
};
