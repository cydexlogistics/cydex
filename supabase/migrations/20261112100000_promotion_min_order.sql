-- Promotions (general and vendor partnership) can have a minimum order: the
-- items total (after product discounts, before the delivery fee and Service
-- Charge) must be at least this much for the promotion to apply. Optional, and
-- only for customer promotions, since Cydex Express and Request a Rider have no
-- items. A coupon entered below the minimum says how much more to add, and
-- "Offers for you" shows the minimum.

ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS min_order_amount NUMERIC(12,2);
ALTER TABLE public.promotions DROP CONSTRAINT IF EXISTS promotions_min_order_check;
ALTER TABLE public.promotions ADD CONSTRAINT promotions_min_order_check CHECK (
  min_order_amount IS NULL OR (min_order_amount > 0 AND audience = 'customer' AND applies_to <> 'commission'));

-- "₦5,000"
CREATE OR REPLACE FUNCTION public.naira_text(p_amount NUMERIC)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT '₦' || CASE WHEN p_amount = trunc(p_amount) THEN to_char(p_amount, 'FM999,999,999,990')
                     ELSE to_char(p_amount, 'FM999,999,999,990.00') END;
$$;

CREATE OR REPLACE FUNCTION public.apply_promotion(p_order_type text, p_user_id uuid, p_vendor_id uuid, p_subtotal numeric, p_delivery_fee numeric, p_service_charge numeric, p_distance_km numeric, p_vehicle_type text, p_coupon_code text, OUT promotion_id uuid, OUT promotion_name text, OUT discount_amount numeric, OUT discount_target text, OUT discount_bearer text, OUT coupon_status text, OUT coupon_message text, OUT uses_left integer)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_code TEXT := NULLIF(upper(regexp_replace(COALESCE(p_coupon_code, ''), '\s', '', 'g')), '');
  v_audience TEXT := CASE WHEN p_order_type = 'rider_request' THEN 'vendor' ELSE 'customer' END;
  -- Express and Request a Rider have no items
  v_items NUMERIC := CASE WHEN p_order_type = 'customer' THEN COALESCE(p_subtotal, 0) ELSE 0 END;
  r RECORD;
  room RECORD;
  c public.promotions%ROWTYPE;
BEGIN
  discount_amount := 0;
  coupon_status := CASE WHEN v_code IS NULL THEN 'none' ELSE 'invalid' END;
  IF p_order_type NOT IN ('customer', 'express', 'rider_request') THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT s.* FROM (
      SELECT p.id, p.name, p.code, p.applies_to, p.cost_bearer, p.created_at,
             round(CASE WHEN p.discount_type = 'percent' THEN x.base * p.discount_value / 100
                        ELSE LEAST(p.discount_value, x.base) END, 2) AS amount
      FROM public.promotions p
      CROSS JOIN LATERAL (
        SELECT COALESCE(CASE p.applies_to WHEN 'service_charge' THEN p_service_charge
                                          WHEN 'delivery_fee' THEN p_delivery_fee
                                          WHEN 'items' THEN p_subtotal END, 0) AS base
      ) x
      WHERE p.is_active
        AND now() >= p.starts_at AND now() < p.ends_at
        AND p.applies_to <> 'commission'
        AND p.audience IN (v_audience, 'all')
        AND (p.user_id IS NULL OR p.user_id = p_user_id)
        AND public.email_in_domains(p_user_id, p.email_domains)
        AND (p.partner_vendor_ids IS NULL OR (p_order_type = 'customer' AND p_vendor_id = ANY (p.partner_vendor_ids)))
        AND (p.code IS NULL OR p.code = v_code)
        AND (p.applies_to <> 'items' OR (p_order_type = 'customer' AND p.vendor_id = p_vendor_id))
        AND (p.max_distance_km IS NULL OR COALESCE(p_distance_km, 0) <= p.max_distance_km)
        AND (p.vehicle_types IS NULL OR p_vehicle_type = ANY (p.vehicle_types))
        AND (p.min_order_amount IS NULL OR v_items >= p.min_order_amount)
        AND x.base > 0
    ) s
    -- The coupon they entered first, then whichever saves the most
    ORDER BY (s.code IS NOT NULL) DESC, s.amount DESC, s.created_at
  LOOP
    SELECT * INTO room FROM public.promotion_room(r.id, p_user_id);
    CONTINUE WHEN NOT room.eligible;
    promotion_id := r.id;
    promotion_name := r.name;
    discount_amount := r.amount;
    discount_target := r.applies_to;
    discount_bearer := r.cost_bearer;
    uses_left := room.uses_left;
    IF r.code IS NOT NULL THEN
      coupon_status := 'applied';
    END IF;
    EXIT;
  END LOOP;

  -- Why the code they typed wasn't used
  IF coupon_status = 'invalid' THEN
    SELECT * INTO c FROM public.promotions WHERE code = v_code AND (user_id IS NULL OR user_id = p_user_id);
    IF c.id IS NULL OR NOT c.is_active OR now() < c.starts_at THEN
      coupon_message := 'That coupon code isn''t valid.';
    ELSIF now() >= c.ends_at THEN
      coupon_message := 'That coupon has ended.';
    ELSIF c.audience NOT IN (v_audience, 'all') THEN
      coupon_message := 'That coupon isn''t for this kind of order.';
    ELSIF NOT public.email_in_domains(p_user_id, c.email_domains) THEN
      coupon_message := 'That coupon is only for ' || array_to_string(ARRAY(SELECT '@' || d FROM unnest(c.email_domains) d), ', ') || ' email addresses.';
    ELSIF c.partner_vendor_ids IS NOT NULL AND (p_order_type <> 'customer' OR NOT p_vendor_id = ANY (c.partner_vendor_ids)) THEN
      coupon_message := 'That coupon only works on orders from ' ||
        (SELECT string_agg(v.name, ', ' ORDER BY v.name) FROM public.profiles v WHERE v.id = ANY (c.partner_vendor_ids)) || '.';
    ELSIF c.min_order_amount IS NOT NULL AND v_items < c.min_order_amount THEN
      coupon_message := CASE WHEN p_order_type = 'customer'
        THEN 'This coupon is for orders of ' || public.naira_text(c.min_order_amount) || ' or more. Add '
             || public.naira_text(c.min_order_amount - v_items) || ' more to use it.'
        ELSE 'This coupon is for orders from a store of ' || public.naira_text(c.min_order_amount) || ' or more.' END;
    ELSE
      SELECT * INTO room FROM public.promotion_room(c.id, p_user_id);
      coupon_message := CASE room.reason
        WHEN 'used_up' THEN 'You''ve already used this coupon as many times as it allows.'
        WHEN 'fully_claimed' THEN 'This coupon has been fully claimed.'
        ELSE 'That coupon doesn''t apply to this order.' END;
    END IF;
  END IF;
END;
$function$;

DROP FUNCTION IF EXISTS public.my_promotions();
CREATE OR REPLACE FUNCTION public.my_promotions()
 RETURNS TABLE(id uuid, name text, code text, discount_type text, discount_value numeric, applies_to text, vendor_id uuid, vendor_name text, max_distance_km numeric, vehicle_types text[], ends_at timestamp with time zone, uses_left integer, places_left integer, partner_vendor_ids uuid[], partner_vendor_names text[], email_domains text[], min_order_amount numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id, p.name, p.code, p.discount_type, p.discount_value, p.applies_to, p.vendor_id, v.name,
         p.max_distance_km, p.vehicle_types, p.ends_at, room.uses_left,
         CASE WHEN p.max_users IS NULL THEN NULL
              ELSE GREATEST(p.max_users - (SELECT count(*) FROM public.promotion_uses(p.id)), 0)::int END,
         p.partner_vendor_ids,
         (SELECT array_agg(pv.name ORDER BY pv.name) FROM public.profiles pv WHERE pv.id = ANY (p.partner_vendor_ids)),
         p.email_domains,
         p.min_order_amount
  FROM public.promotions p
  JOIN public.profiles me ON me.id = auth.uid()
  LEFT JOIN public.profiles v ON v.id = p.vendor_id
  CROSS JOIN LATERAL public.promotion_room(p.id, me.id) room
  WHERE p.is_active
    AND p.show_in_offers
    AND now() >= p.starts_at AND now() < p.ends_at
    AND lower(me.role) IN ('customer', 'vendor', 'rider')
    AND p.audience IN (lower(me.role), 'all')
    AND (p.user_id IS NULL OR p.user_id = me.id)
    AND public.email_in_domains(me.id, p.email_domains)
    AND CASE lower(me.role)
          WHEN 'customer' THEN p.applies_to IN ('service_charge', 'delivery_fee', 'items')
          WHEN 'vendor' THEN p.applies_to IN ('service_charge', 'delivery_fee', 'commission')
          ELSE p.applies_to = 'commission' END
    AND room.eligible
  -- The ones that need nothing from them first, then the soonest to end
  ORDER BY (p.code IS NOT NULL), p.ends_at;
$function$;
REVOKE EXECUTE ON FUNCTION public.my_promotions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_promotions() TO authenticated;

DROP FUNCTION IF EXISTS public.admin_promotions();
CREATE OR REPLACE FUNCTION public.admin_promotions()
 RETURNS TABLE(id uuid, name text, code text, discount_type text, discount_value numeric, applies_to text, vendor_id uuid, vendor_name text, cost_bearer text, max_distance_km numeric, vehicle_types text[], starts_at timestamp with time zone, ends_at timestamp with time zone, is_active boolean, created_at timestamp with time zone, state text, uses bigint, total_discount numeric, audience text, max_users integer, max_uses_per_user integer, users bigint, show_in_offers boolean, email_domains text[], partner_vendor_ids uuid[], partner_vendor_names text[], min_order_amount numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.require_admin();
  RETURN QUERY
  SELECT p.id, p.name, p.code, p.discount_type, p.discount_value, p.applies_to, p.vendor_id, v.name, p.cost_bearer,
         p.max_distance_km, p.vehicle_types, p.starts_at, p.ends_at, p.is_active, p.created_at,
         CASE WHEN NOT p.is_active THEN 'off' WHEN now() < p.starts_at THEN 'scheduled'
              WHEN now() >= p.ends_at THEN 'ended'
              WHEN p.max_users IS NOT NULL AND u.users >= p.max_users AND p.max_uses_per_user IS NOT NULL
                   AND u.uses >= p.max_users::bigint * p.max_uses_per_user THEN 'claimed'
              ELSE 'running' END,
         u.uses,
         (SELECT COALESCE(sum(CASE WHEN o.promotion_id = p.id THEN o.discount_amount ELSE 0 END
                              + CASE WHEN o.vendor_promotion_id = p.id THEN o.vendor_commission_discount ELSE 0 END
                              + CASE WHEN o.rider_promotion_id = p.id THEN o.rider_commission_discount ELSE 0 END), 0)
          FROM public.orders o
          WHERE p.id IN (o.promotion_id, o.vendor_promotion_id, o.rider_promotion_id) AND o.payment_status = 'paid'
            AND o.status NOT IN ('cancelled', 'rejected')),
         p.audience, p.max_users, p.max_uses_per_user, u.users, p.show_in_offers, p.email_domains, p.partner_vendor_ids,
         -- Names in the same order as the ids
         CASE WHEN p.partner_vendor_ids IS NOT NULL THEN ARRAY(
           SELECT COALESCE(pv.name, 'Vendor') FROM unnest(p.partner_vendor_ids) WITH ORDINALITY x(vid, n)
           LEFT JOIN public.profiles pv ON pv.id = x.vid ORDER BY x.n) END,
         p.min_order_amount
  FROM public.promotions p
  LEFT JOIN public.profiles v ON v.id = p.vendor_id
  -- Personal promotions given as rewards are listed under Rewards
  CROSS JOIN LATERAL (
    SELECT COALESCE(sum(x.uses), 0)::bigint AS uses, count(*)::bigint AS users FROM public.promotion_uses(p.id) x
  ) u
  WHERE p.user_id IS NULL
  ORDER BY p.created_at DESC;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.admin_promotions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_promotions() TO authenticated;

DROP FUNCTION IF EXISTS public.admin_save_promotion(text, text, numeric, text, timestamptz, timestamptz, text, uuid, text, uuid, text, numeric, text[], integer, integer, boolean, boolean, text[], uuid[]);
CREATE OR REPLACE FUNCTION public.admin_save_promotion(p_name text, p_discount_type text, p_discount_value numeric, p_applies_to text, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_audience text DEFAULT 'customer'::text, p_id uuid DEFAULT NULL::uuid, p_code text DEFAULT NULL::text, p_vendor_id uuid DEFAULT NULL::uuid, p_cost_bearer text DEFAULT 'cydex'::text, p_max_distance_km numeric DEFAULT NULL::numeric, p_vehicle_types text[] DEFAULT NULL::text[], p_max_users integer DEFAULT NULL::integer, p_max_uses_per_user integer DEFAULT NULL::integer, p_is_active boolean DEFAULT true, p_show_in_offers boolean DEFAULT true, p_email_domains text[] DEFAULT NULL::text[], p_partner_vendor_ids uuid[] DEFAULT NULL::uuid[], p_min_order_amount numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_name TEXT := NULLIF(trim(p_name), '');
  v_code TEXT := NULLIF(upper(regexp_replace(COALESCE(p_code, ''), '\s', '', 'g')), '');
  v_vehicles TEXT[] := CASE WHEN COALESCE(array_length(p_vehicle_types, 1), 0) = 0 THEN NULL ELSE p_vehicle_types END;
  v_bearer TEXT := CASE WHEN p_applies_to = 'items' THEN COALESCE(p_cost_bearer, 'cydex') ELSE 'cydex' END;
  v_vendor UUID := CASE WHEN p_applies_to = 'items' THEN p_vendor_id END;
  v_audience TEXT := COALESCE(p_audience, 'customer');
  v_old JSONB;
  v_id UUID := p_id;
  v_domains TEXT[];
  v_partners UUID[] := CASE WHEN COALESCE(cardinality(p_partner_vendor_ids), 0) = 0 THEN NULL
                            ELSE ARRAY(SELECT DISTINCT unnest(p_partner_vendor_ids)) END;
  v_min NUMERIC := round(p_min_order_amount, 2);
BEGIN
  PERFORM public.require_admin();
  v_domains := public.clean_email_domains(p_email_domains);
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Give the promotion a name';
  END IF;
  IF v_audience NOT IN ('customer', 'vendor', 'rider', 'all') THEN
    RAISE EXCEPTION 'Choose who the promotion is for';
  END IF;
  IF p_discount_type NOT IN ('percent', 'flat') OR p_discount_value IS NULL OR p_discount_value <= 0 THEN
    RAISE EXCEPTION 'Enter the discount';
  END IF;
  IF p_discount_type = 'percent' AND p_discount_value > 100 THEN
    RAISE EXCEPTION 'A percentage discount can''t be more than 100%%';
  END IF;
  IF p_applies_to IS NULL OR NOT (
       (v_audience = 'customer' AND p_applies_to IN ('service_charge', 'delivery_fee', 'items'))
    OR (v_audience = 'vendor' AND p_applies_to IN ('service_charge', 'delivery_fee', 'commission'))
    OR (v_audience = 'rider' AND p_applies_to = 'commission')
    OR (v_audience = 'all' AND p_applies_to IN ('service_charge', 'delivery_fee', 'commission'))) THEN
    RAISE EXCEPTION 'Choose what the discount applies to';
  END IF;
  IF p_applies_to = 'items' AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_vendor AND lower(role) = 'vendor') THEN
    RAISE EXCEPTION 'Choose the business the items discount is for';
  END IF;
  IF v_bearer NOT IN ('cydex', 'vendor') THEN
    RAISE EXCEPTION 'Choose who pays for the discount';
  END IF;
  IF p_starts_at IS NULL OR p_ends_at IS NULL OR p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'The end date must be after the start date';
  END IF;
  IF p_max_distance_km IS NOT NULL AND p_max_distance_km <= 0 THEN
    RAISE EXCEPTION 'The distance must be more than 0 km';
  END IF;
  IF v_vehicles IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(v_vehicles) k WHERE k NOT IN (SELECT key FROM public.vehicle_types)) THEN
    RAISE EXCEPTION 'Unknown delivery mode';
  END IF;
  IF p_max_users IS NOT NULL AND p_max_users <= 0 THEN
    RAISE EXCEPTION 'The number of people must be at least 1';
  END IF;
  IF p_max_uses_per_user IS NOT NULL AND p_max_uses_per_user <= 0 THEN
    RAISE EXCEPTION 'The number of uses for each person must be at least 1';
  END IF;
  IF v_min IS NOT NULL THEN
    IF v_min <= 0 THEN
      RAISE EXCEPTION 'The minimum order must be more than ₦0';
    END IF;
    IF v_audience <> 'customer' OR p_applies_to = 'commission' THEN
      RAISE EXCEPTION 'A minimum order is only for promotions for customers';
    END IF;
  END IF;
  IF v_partners IS NOT NULL THEN
    IF v_audience <> 'customer' OR p_applies_to NOT IN ('service_charge', 'delivery_fee') THEN
      RAISE EXCEPTION 'A vendor partnership promotion is for customers, on the delivery fee or Service Charge';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(v_partners) v WHERE NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v AND lower(role) = 'vendor')) THEN
      RAISE EXCEPTION 'Choose vendors from the list';
    END IF;
  END IF;
  IF v_code IS NOT NULL AND p_applies_to = 'commission' THEN
    RAISE EXCEPTION 'A commission promotion applies by itself, so it can''t have a coupon code';
  END IF;
  IF v_code IS NOT NULL AND v_code !~ '^[A-Z0-9_-]{3,20}$' THEN
    RAISE EXCEPTION 'A coupon code is 3 to 20 letters or numbers';
  END IF;
  IF v_code IS NOT NULL AND EXISTS (SELECT 1 FROM public.promotions WHERE code = v_code AND id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'That coupon code is already used by another promotion';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.promotions (name, code, discount_type, discount_value, applies_to, vendor_id, cost_bearer,
                                   max_distance_km, vehicle_types, starts_at, ends_at, is_active, created_by,
                                   audience, max_users, max_uses_per_user, show_in_offers, email_domains, partner_vendor_ids,
                                   min_order_amount)
    VALUES (v_name, v_code, p_discount_type, p_discount_value, p_applies_to, v_vendor, v_bearer,
            p_max_distance_km, v_vehicles, p_starts_at, p_ends_at, COALESCE(p_is_active, true), auth.uid(),
            v_audience, p_max_users, p_max_uses_per_user, COALESCE(p_show_in_offers, true), v_domains, v_partners,
            v_min)
    RETURNING id INTO v_id;
  ELSE
    SELECT to_jsonb(p) INTO v_old FROM public.promotions p WHERE id = p_id;
    IF v_old IS NULL THEN
      RAISE EXCEPTION 'Promotion not found';
    END IF;
    UPDATE public.promotions
    SET name = v_name, code = v_code, discount_type = p_discount_type, discount_value = p_discount_value,
        applies_to = p_applies_to, vendor_id = v_vendor, cost_bearer = v_bearer, max_distance_km = p_max_distance_km,
        vehicle_types = v_vehicles, starts_at = p_starts_at, ends_at = p_ends_at, is_active = COALESCE(p_is_active, true),
        audience = v_audience, max_users = p_max_users, max_uses_per_user = p_max_uses_per_user,
        show_in_offers = COALESCE(p_show_in_offers, true), email_domains = v_domains, partner_vendor_ids = v_partners,
        min_order_amount = v_min
    WHERE id = p_id;
  END IF;

  PERFORM public.log_admin_action(CASE WHEN p_id IS NULL THEN 'create_promotion' ELSE 'update_promotion' END,
    'promotion', v_id::text, v_old, (SELECT to_jsonb(p) FROM public.promotions p WHERE id = v_id));
  RETURN v_id;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.admin_save_promotion(text, text, numeric, text, timestamptz, timestamptz, text, uuid, text, uuid, text, numeric, text[], integer, integer, boolean, boolean, text[], uuid[], numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_promotion(text, text, numeric, text, timestamptz, timestamptz, text, uuid, text, uuid, text, numeric, text[], integer, integer, boolean, boolean, text[], uuid[], numeric) TO authenticated;
