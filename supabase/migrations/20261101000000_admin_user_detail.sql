-- Admin -> Users -> one person: their account and sign-up details, what
-- vendors and riders entered at onboarding (verification), and their activity:
-- products and orders for vendors, deliveries for riders, orders for customers.

CREATE OR REPLACE FUNCTION public.admin_user_detail(p_profile_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.profiles%ROWTYPE;
  v_role TEXT;
  v_stats JSONB := '{}'::jsonb;
BEGIN
  PERFORM public.require_admin();
  SELECT * INTO p FROM public.profiles WHERE id = p_profile_id;
  IF p.id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  v_role := lower(p.role);

  IF v_role = 'vendor' THEN
    SELECT jsonb_build_object(
      'products', (SELECT jsonb_build_object(
          'total', count(*),
          'active', count(*) FILTER (WHERE status = 'active'),
          'inactive', count(*) FILTER (WHERE status <> 'active'))
        FROM public.products WHERE vendor_id = p.id),
      -- Paid customer orders (unpaid checkouts never reached the vendor)
      'orders', (SELECT jsonb_build_object(
          'total', count(*),
          'delivered', count(*) FILTER (WHERE status = 'delivered'),
          'in_progress', count(*) FILTER (WHERE status NOT IN ('delivered', 'cancelled', 'rejected')),
          'cancelled', count(*) FILTER (WHERE status IN ('cancelled', 'rejected')),
          'sales', COALESCE(sum(subtotal) FILTER (WHERE status = 'delivered'), 0))
        FROM public.orders
        WHERE vendor_id = p.id AND order_type = 'customer' AND payment_status IN ('paid', 'refunded')),
      'rider_requests', (SELECT jsonb_build_object(
          'total', count(*),
          'delivered', count(*) FILTER (WHERE status = 'delivered'))
        FROM public.orders
        WHERE vendor_id = p.id AND order_type = 'rider_request' AND payment_status IN ('paid', 'refunded'))
    ) INTO v_stats;
  ELSIF v_role = 'rider' THEN
    SELECT jsonb_build_object(
      'deliveries', (SELECT jsonb_build_object(
          'total', count(*),
          'delivered', count(*) FILTER (WHERE o.status = 'delivered'),
          'in_progress', count(*) FILTER (WHERE o.status NOT IN ('delivered', 'cancelled', 'rejected')),
          'cancelled', count(*) FILTER (WHERE o.status IN ('cancelled', 'rejected')))
        FROM public.orders o WHERE o.rider_id = p.id),
      'earned', (SELECT COALESCE(sum(d.rider_earning), 0) FROM public.deliveries d
                 WHERE d.rider_id = p.id AND d.status = 'delivered'),
      'rating', (SELECT rp.rating FROM public.rider_profiles rp WHERE rp.id = p.id)
    ) INTO v_stats;
  ELSIF v_role = 'customer' THEN
    SELECT jsonb_build_object(
      'orders', jsonb_build_object(
        'total', count(*),
        'delivered', count(*) FILTER (WHERE status = 'delivered'),
        'in_progress', count(*) FILTER (WHERE status NOT IN ('delivered', 'cancelled', 'rejected')),
        'cancelled', count(*) FILTER (WHERE status IN ('cancelled', 'rejected')),
        'spent', COALESCE(sum(total_amount) FILTER (WHERE status = 'delivered'), 0))
    ) INTO v_stats
    FROM public.orders
    WHERE customer_id = p.id AND payment_status IN ('paid', 'refunded');
  END IF;

  RETURN jsonb_build_object(
    'profile', jsonb_build_object(
      'id', p.id, 'name', p.name, 'email', p.email, 'phone', p.phone, 'role', v_role,
      'status', COALESCE(p.status, 'active'), 'suspension_reason', p.suspension_reason,
      'avatar', p.avatar, 'store_banner_url', p.store_banner_url, 'referral_code', p.referral_code,
      'created_at', p.created_at, 'login_count', p.login_count),
    'auth', (SELECT jsonb_build_object(
        'email_confirmed_at', u.email_confirmed_at,
        'last_sign_in_at', COALESCE(u.last_sign_in_at, p.last_login_at),
        'signed_up_at', u.created_at)
      FROM auth.users u WHERE u.id = p.id),
    'referred_by', (SELECT jsonb_build_object('id', r.referrer_id, 'name', rp.name, 'code', r.code, 'status', r.status)
      FROM public.referrals r JOIN public.profiles rp ON rp.id = r.referrer_id
      WHERE r.referred_id = p.id),
    'referrals_made', (SELECT count(*) FROM public.referrals WHERE referrer_id = p.id),
    -- Their default address (a vendor's store location)
    'address', (SELECT jsonb_build_object('formatted_address', a.formatted_address, 'directions', a.directions, 'label', a.label)
      FROM public.addresses a WHERE a.profile_id = p.id
      ORDER BY a.is_default DESC NULLS LAST, a.created_at DESC LIMIT 1),
    'verification', (SELECT to_jsonb(v) || jsonb_build_object('category', bc.name)
      FROM public.verifications v LEFT JOIN public.business_categories bc ON bc.id = v.business_category_id
      WHERE v.profile_id = p.id),
    'hours', (SELECT jsonb_build_object('prep_time_minutes', h.prep_time_minutes, 'opening_hours', h.opening_hours)
      FROM public.vendor_hours h WHERE h.vendor_id = p.id),
    'stats', v_stats
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_user_detail(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_user_detail(UUID) TO authenticated;
