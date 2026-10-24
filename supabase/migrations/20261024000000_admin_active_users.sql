-- Admin Overview: how many customers, vendors and riders were active in a
-- period (from inclusive, to exclusive; NULL = open-ended), and how many of
-- each there are in total.
--   customers: placed a paid order or Cydex Express delivery
--   vendors:   had a paid order, or paid for a rider request
--   riders:    took a delivery (a rider was assigned in the period)
CREATE OR REPLACE FUNCTION public.admin_active_users(
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin();
  RETURN jsonb_build_object(
    'customers', (
      SELECT count(DISTINCT o.customer_id) FROM public.orders o
      WHERE o.customer_id IS NOT NULL AND o.order_type IN ('customer', 'express')
        AND o.payment_status IN ('paid', 'refunded')
        AND (p_from IS NULL OR o.created_at >= p_from) AND (p_to IS NULL OR o.created_at < p_to)),
    'vendors', (
      SELECT count(DISTINCT o.vendor_id) FROM public.orders o
      WHERE o.vendor_id IS NOT NULL AND o.order_type IN ('customer', 'rider_request')
        AND o.payment_status IN ('paid', 'refunded')
        AND (p_from IS NULL OR o.created_at >= p_from) AND (p_to IS NULL OR o.created_at < p_to)),
    'riders', (
      SELECT count(DISTINCT o.rider_id) FROM public.orders o
      WHERE o.rider_id IS NOT NULL AND o.rider_assigned_at IS NOT NULL
        AND (p_from IS NULL OR o.rider_assigned_at >= p_from) AND (p_to IS NULL OR o.rider_assigned_at < p_to)),
    'total_customers', (SELECT count(*) FROM public.profiles WHERE lower(role) = 'customer'),
    'total_vendors', (SELECT count(*) FROM public.profiles WHERE lower(role) = 'vendor'),
    'total_riders', (SELECT count(*) FROM public.profiles WHERE lower(role) = 'rider')
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_active_users(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_active_users(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
