-- Promotions for email domains and vendor partnerships, partner vendors'
-- own commission rates, and how close riders must be to see new orders and to
-- be alerted about them, per vehicle type.

-- ===================================================================
-- 1. Promotions only for some email addresses, or only on orders from partner vendors
-- ===================================================================
ALTER TABLE public.promotions
  ADD COLUMN IF NOT EXISTS email_domains TEXT[],
  ADD COLUMN IF NOT EXISTS partner_vendor_ids UUID[];
ALTER TABLE public.promotions DROP CONSTRAINT IF EXISTS promotions_partner_check;
-- Partnership promotions are for customers, on the delivery fee or Service Charge
ALTER TABLE public.promotions ADD CONSTRAINT promotions_partner_check CHECK (
  partner_vendor_ids IS NULL
  OR (audience = 'customer' AND applies_to IN ('service_charge', 'delivery_fee') AND cardinality(partner_vendor_ids) > 0)
);
ALTER TABLE public.promotions DROP CONSTRAINT IF EXISTS promotions_email_domains_check;
ALTER TABLE public.promotions ADD CONSTRAINT promotions_email_domains_check CHECK (
  email_domains IS NULL OR cardinality(email_domains) > 0
);

-- Is p_user's email at one of these domains? "ui.edu.ng" also matches "student.ui.edu.ng".
CREATE OR REPLACE FUNCTION public.email_in_domains(p_user UUID, p_domains TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_domains IS NULL OR EXISTS (
    SELECT 1 FROM public.profiles p, unnest(p_domains) d
    WHERE p.id = p_user
      AND (lower(split_part(p.email, '@', 2)) = d OR lower(split_part(p.email, '@', 2)) LIKE '%.' || d)
  );
$$;
REVOKE EXECUTE ON FUNCTION public.email_in_domains(UUID, TEXT[]) FROM PUBLIC, anon, authenticated;

-- "@Gmail.com " -> "gmail.com"; NULL for none; an error for something that isn't a domain
CREATE OR REPLACE FUNCTION public.clean_email_domains(p_domains TEXT[])
RETURNS TEXT[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v TEXT[];
  d TEXT;
BEGIN
  SELECT array_agg(DISTINCT x) INTO v
  FROM (SELECT lower(regexp_replace(trim(e), '^@+', '')) AS x FROM unnest(COALESCE(p_domains, '{}')) e) s
  WHERE x <> '';
  IF v IS NULL THEN
    RETURN NULL;
  END IF;
  FOREACH d IN ARRAY v LOOP
    IF d !~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$' THEN
      RAISE EXCEPTION '"%" isn''t an email domain. Enter something like gmail.com or ui.edu.ng', d;
    END IF;
  END LOOP;
  RETURN v;
END;
$$;

-- ===================================================================
-- 2. Partner vendors: their own commission rates
-- ===================================================================
CREATE TABLE IF NOT EXISTS public.vendor_partners (
  vendor_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- NULL = the standard rate (Admin -> Pricing)
  vendor_commission_rate NUMERIC(5,4) CHECK (vendor_commission_rate IS NULL OR vendor_commission_rate BETWEEN 0 AND 0.5),
  rider_request_commission_rate NUMERIC(5,4) CHECK (rider_request_commission_rate IS NULL OR rider_request_commission_rate BETWEEN 0 AND 0.5),
  note TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.vendor_partners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins and the vendor read partnerships" ON public.vendor_partners;
CREATE POLICY "Admins and the vendor read partnerships" ON public.vendor_partners FOR SELECT USING (public.is_admin() OR vendor_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE ON public.vendor_partners FROM anon, authenticated;

-- The commission Cydex takes from this vendor's sales: their partner rate, otherwise the standard one
CREATE OR REPLACE FUNCTION public.vendor_commission_rate(p_vendor UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT vp.vendor_commission_rate FROM public.vendor_partners vp WHERE vp.vendor_id = p_vendor AND vp.is_active),
    (SELECT vendor_commission_rate FROM public.pricing_config ORDER BY created_at DESC LIMIT 1),
    0.10);
$$;

-- The commission added to this vendor's rider requests
CREATE OR REPLACE FUNCTION public.rider_request_commission_rate(p_vendor UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT vp.rider_request_commission_rate FROM public.vendor_partners vp WHERE vp.vendor_id = p_vendor AND vp.is_active),
    (SELECT rider_request_commission_rate FROM public.pricing_config ORDER BY created_at DESC LIMIT 1),
    0.10);
$$;

CREATE OR REPLACE FUNCTION public.admin_vendor_partners()
RETURNS TABLE (
  vendor_id UUID, vendor_name TEXT, vendor_email TEXT, vendor_commission_rate NUMERIC, rider_request_commission_rate NUMERIC,
  note TEXT, is_active BOOLEAN, created_at TIMESTAMPTZ, standard_vendor_commission_rate NUMERIC,
  standard_rider_request_commission_rate NUMERIC, promotions BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg public.pricing_config%ROWTYPE;
BEGIN
  PERFORM public.require_admin();
  SELECT * INTO cfg FROM public.pricing_config ORDER BY created_at DESC LIMIT 1;
  RETURN QUERY
  SELECT vp.vendor_id, p.name, p.email, vp.vendor_commission_rate, vp.rider_request_commission_rate, vp.note, vp.is_active,
         vp.created_at, COALESCE(cfg.vendor_commission_rate, 0.10), COALESCE(cfg.rider_request_commission_rate, 0.10),
         (SELECT count(*) FROM public.promotions pr WHERE vp.vendor_id = ANY (pr.partner_vendor_ids))
  FROM public.vendor_partners vp
  JOIN public.profiles p ON p.id = vp.vendor_id
  ORDER BY p.name;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_vendor_partners() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_vendor_partners() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_save_vendor_partner(
  p_vendor_id UUID,
  p_vendor_commission_rate NUMERIC DEFAULT NULL,
  p_rider_request_commission_rate NUMERIC DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT true
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old JSONB;
BEGIN
  PERFORM public.require_admin();
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_vendor_id AND lower(role) = 'vendor') THEN
    RAISE EXCEPTION 'Choose a vendor';
  END IF;
  IF (p_vendor_commission_rate IS NOT NULL AND (p_vendor_commission_rate < 0 OR p_vendor_commission_rate > 0.5))
     OR (p_rider_request_commission_rate IS NOT NULL AND (p_rider_request_commission_rate < 0 OR p_rider_request_commission_rate > 0.5)) THEN
    RAISE EXCEPTION 'A commission must be between 0%% and 50%%';
  END IF;
  SELECT to_jsonb(x) INTO v_old FROM public.vendor_partners x WHERE vendor_id = p_vendor_id;
  INSERT INTO public.vendor_partners (vendor_id, vendor_commission_rate, rider_request_commission_rate, note, is_active)
  VALUES (p_vendor_id, p_vendor_commission_rate, p_rider_request_commission_rate, NULLIF(trim(p_note), ''), COALESCE(p_is_active, true))
  ON CONFLICT (vendor_id) DO UPDATE SET
    vendor_commission_rate = EXCLUDED.vendor_commission_rate,
    rider_request_commission_rate = EXCLUDED.rider_request_commission_rate,
    note = EXCLUDED.note, is_active = EXCLUDED.is_active, updated_at = now();
  PERFORM public.log_admin_action(CASE WHEN v_old IS NULL THEN 'add_vendor_partner' ELSE 'update_vendor_partner' END,
    'vendor_partner', p_vendor_id::text, v_old, (SELECT to_jsonb(x) FROM public.vendor_partners x WHERE vendor_id = p_vendor_id));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_save_vendor_partner(UUID, NUMERIC, NUMERIC, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_vendor_partner(UUID, NUMERIC, NUMERIC, TEXT, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_remove_vendor_partner(p_vendor_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old JSONB;
BEGIN
  PERFORM public.require_admin();
  DELETE FROM public.vendor_partners WHERE vendor_id = p_vendor_id RETURNING to_jsonb(vendor_partners.*) INTO v_old;
  IF v_old IS NULL THEN
    RAISE EXCEPTION 'That vendor isn''t a partner';
  END IF;
  PERFORM public.log_admin_action('remove_vendor_partner', 'vendor_partner', p_vendor_id::text, v_old, NULL);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_remove_vendor_partner(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_remove_vendor_partner(UUID) TO authenticated;

-- ===================================================================
-- 3. How close riders must be to see new orders, and to be alerted, per vehicle type
-- ===================================================================
ALTER TABLE public.vehicle_types
  ADD COLUMN IF NOT EXISTS see_orders_km NUMERIC(6,2) NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS alert_orders_km NUMERIC(6,2) NOT NULL DEFAULT 5;
ALTER TABLE public.vehicle_types DROP CONSTRAINT IF EXISTS vehicle_types_order_radius_check;
ALTER TABLE public.vehicle_types ADD CONSTRAINT vehicle_types_order_radius_check CHECK (
  see_orders_km > 0 AND see_orders_km <= 50 AND alert_orders_km > 0 AND alert_orders_km <= see_orders_km
);

-- How far from a pickup this rider sees new orders (metres), from their vehicle type
CREATE OR REPLACE FUNCTION public.rider_see_radius_m(p_rider UUID)
RETURNS DOUBLE PRECISION
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT t.see_orders_km * 1000 FROM public.rider_profiles rp
    JOIN public.vehicle_types t ON t.key = COALESCE(rp.vehicle_type, public.default_vehicle_type())
    WHERE rp.id = p_rider), public.rider_order_radius_m())::double precision;
$$;

-- ===================================================================
-- 4. Functions changed for the above
-- ===================================================================
CREATE OR REPLACE FUNCTION public.apply_promotion(p_order_type text, p_user_id uuid, p_vendor_id uuid, p_subtotal numeric, p_delivery_fee numeric, p_service_charge numeric, p_distance_km numeric, p_vehicle_type text, p_coupon_code text, OUT promotion_id uuid, OUT promotion_name text, OUT discount_amount numeric, OUT discount_target text, OUT discount_bearer text, OUT coupon_status text, OUT coupon_message text, OUT uses_left integer)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_code TEXT := NULLIF(upper(regexp_replace(COALESCE(p_coupon_code, ''), '\s', '', 'g')), '');
  v_audience TEXT := CASE WHEN p_order_type = 'rider_request' THEN 'vendor' ELSE 'customer' END;
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

CREATE OR REPLACE FUNCTION public.apply_commission_promotion(p_role text, p_user_id uuid, p_commission numeric, p_distance_km numeric, p_vehicle_type text, OUT promotion_id uuid, OUT discount_amount numeric)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  room RECORD;
BEGIN
  discount_amount := 0;
  IF p_user_id IS NULL OR COALESCE(p_commission, 0) <= 0 OR p_role NOT IN ('vendor', 'rider') THEN
    RETURN;
  END IF;
  FOR r IN
    SELECT p.id, p.created_at,
           round(CASE WHEN p.discount_type = 'percent' THEN p_commission * p.discount_value / 100
                      ELSE LEAST(p.discount_value, p_commission) END, 2) AS amount
    FROM public.promotions p
    WHERE p.is_active
      AND now() >= p.starts_at AND now() < p.ends_at
      AND p.applies_to = 'commission'
      AND p.audience IN (p_role, 'all')
      AND (p.user_id IS NULL OR p.user_id = p_user_id)
      AND public.email_in_domains(p_user_id, p.email_domains)
      AND (p.max_distance_km IS NULL OR COALESCE(p_distance_km, 0) <= p.max_distance_km)
      AND (p.vehicle_types IS NULL OR p_vehicle_type = ANY (p.vehicle_types))
    ORDER BY 3 DESC, p.created_at
  LOOP
    CONTINUE WHEN r.amount <= 0;
    SELECT * INTO room FROM public.promotion_room(r.id, p_user_id);
    CONTINUE WHEN NOT room.eligible;
    promotion_id := r.id;
    discount_amount := r.amount;
    EXIT;
  END LOOP;
END;
$function$;

DROP FUNCTION IF EXISTS public.my_promotions();
CREATE OR REPLACE FUNCTION public.my_promotions()
 RETURNS TABLE(id uuid, name text, code text, discount_type text, discount_value numeric, applies_to text, vendor_id uuid, vendor_name text, max_distance_km numeric, vehicle_types text[], ends_at timestamp with time zone, uses_left integer, places_left integer, partner_vendor_ids uuid[], partner_vendor_names text[], email_domains text[])
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
         p.email_domains
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

DROP FUNCTION IF EXISTS public.admin_save_promotion(text, text, numeric, text, timestamptz, timestamptz, text, uuid, text, uuid, text, numeric, text[], integer, integer, boolean, boolean);
CREATE OR REPLACE FUNCTION public.admin_save_promotion(p_name text, p_discount_type text, p_discount_value numeric, p_applies_to text, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_audience text DEFAULT 'customer'::text, p_id uuid DEFAULT NULL::uuid, p_code text DEFAULT NULL::text, p_vendor_id uuid DEFAULT NULL::uuid, p_cost_bearer text DEFAULT 'cydex'::text, p_max_distance_km numeric DEFAULT NULL::numeric, p_vehicle_types text[] DEFAULT NULL::text[], p_max_users integer DEFAULT NULL::integer, p_max_uses_per_user integer DEFAULT NULL::integer, p_is_active boolean DEFAULT true, p_show_in_offers boolean DEFAULT true, p_email_domains text[] DEFAULT NULL::text[], p_partner_vendor_ids uuid[] DEFAULT NULL::uuid[])
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
                                   audience, max_users, max_uses_per_user, show_in_offers, email_domains, partner_vendor_ids)
    VALUES (v_name, v_code, p_discount_type, p_discount_value, p_applies_to, v_vendor, v_bearer,
            p_max_distance_km, v_vehicles, p_starts_at, p_ends_at, COALESCE(p_is_active, true), auth.uid(),
            v_audience, p_max_users, p_max_uses_per_user, COALESCE(p_show_in_offers, true), v_domains, v_partners)
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
        show_in_offers = COALESCE(p_show_in_offers, true), email_domains = v_domains, partner_vendor_ids = v_partners
    WHERE id = p_id;
  END IF;

  PERFORM public.log_admin_action(CASE WHEN p_id IS NULL THEN 'create_promotion' ELSE 'update_promotion' END,
    'promotion', v_id::text, v_old, (SELECT to_jsonb(p) FROM public.promotions p WHERE id = v_id));
  RETURN v_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_save_promotion(text, text, numeric, text, timestamptz, timestamptz, text, uuid, text, uuid, text, numeric, text[], integer, integer, boolean, boolean, text[], uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_promotion(text, text, numeric, text, timestamptz, timestamptz, text, uuid, text, uuid, text, numeric, text[], integer, integer, boolean, boolean, text[], uuid[]) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_promotions();
CREATE OR REPLACE FUNCTION public.admin_promotions()
 RETURNS TABLE(id uuid, name text, code text, discount_type text, discount_value numeric, applies_to text, vendor_id uuid, vendor_name text, cost_bearer text, max_distance_km numeric, vehicle_types text[], starts_at timestamp with time zone, ends_at timestamp with time zone, is_active boolean, created_at timestamp with time zone, state text, uses bigint, total_discount numeric, audience text, max_users integer, max_uses_per_user integer, users bigint, show_in_offers boolean, email_domains text[], partner_vendor_ids uuid[], partner_vendor_names text[])
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
           LEFT JOIN public.profiles pv ON pv.id = x.vid ORDER BY x.n) END
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

CREATE OR REPLACE FUNCTION public.price_new_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_price RECORD;
  d RECORD;
  c RECORD;
  v_rate NUMERIC;
BEGIN
  -- Only the database sets these
  NEW.vendor_promotion_id := NULL;
  NEW.vendor_commission_discount := 0;
  NEW.rider_promotion_id := NULL;
  NEW.rider_commission_discount := 0;
  IF NEW.order_type IN ('rider_request', 'express') THEN
    RETURN NEW;
  END IF;

  IF NOT public.vendor_is_open(NEW.vendor_id) THEN
    RAISE EXCEPTION 'This vendor is closed right now. Check their opening hours and try again.';
  END IF;

  IF NEW.delivery_type = 'pickup' THEN
    -- Customer collects from the store: no delivery fee
    SELECT * INTO v_price FROM public.calculate_order_price(NEW.vendor_id, NULL, NEW.subtotal);
    NEW.distance_km := NULL;
    NEW.base_rate := NULL;
    NEW.distance_fee := NULL;
    NEW.delivery_fee := 0;
    NEW.preferred_vehicle_type := NULL;
    NEW.service_charge := v_price.service_charge;
    NEW.total_amount := COALESCE(NEW.subtotal, 0) + v_price.service_charge;
    RETURN NEW;
  END IF;

  IF NEW.delivery_address_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.addresses WHERE id = NEW.delivery_address_id AND profile_id = NEW.customer_id) THEN
    RAISE EXCEPTION 'Choose one of your saved delivery addresses';
  END IF;

  SELECT * INTO v_price FROM public.calculate_order_price(NEW.vendor_id, NEW.delivery_address_id, NEW.subtotal, NEW.preferred_vehicle_type);

  IF v_price.status = 'no_store' THEN
    RAISE EXCEPTION 'This vendor has not set a store location yet, so it can''t take delivery orders';
  ELSIF v_price.status = 'out_of_range' THEN
    RAISE EXCEPTION 'This vendor is too far from your delivery address. The longest delivery we do is %.', public.km_text(public.max_trip_km());
  END IF;

  NEW.distance_km := v_price.distance_km;
  NEW.preferred_vehicle_type := v_price.vehicle_type;
  NEW.vehicle_rate_per_km := v_price.rate_per_km;
  NEW.base_rate := v_price.base_rate;
  NEW.distance_fee := v_price.distance_fee;
  NEW.delivery_fee := v_price.delivery_fee;
  NEW.service_charge := v_price.service_charge;

  SELECT * INTO d FROM public.apply_promotion('customer', NEW.customer_id, NEW.vendor_id, NEW.subtotal, v_price.delivery_fee,
                                              v_price.service_charge, v_price.distance_km, v_price.vehicle_type, NEW.coupon_code);
  IF d.coupon_status = 'invalid' THEN
    RAISE EXCEPTION '%', d.coupon_message;
  END IF;
  NEW.promotion_id := d.promotion_id;
  NEW.discount_amount := COALESCE(d.discount_amount, 0);
  NEW.discount_target := d.discount_target;
  NEW.discount_bearer := d.discount_bearer;
  NEW.coupon_code := CASE WHEN d.coupon_status = 'applied' THEN upper(trim(NEW.coupon_code)) END;
  NEW.total_amount := GREATEST(v_price.total_amount - NEW.discount_amount, 0);

  -- A partner vendor's own rate, otherwise the standard one
  v_rate := public.vendor_commission_rate(NEW.vendor_id);
  SELECT * INTO c FROM public.apply_commission_promotion(
    'vendor', NEW.vendor_id,
    round((COALESCE(NEW.subtotal, 0) - CASE WHEN NEW.discount_target = 'items' AND NEW.discount_bearer = 'vendor'
                                            THEN NEW.discount_amount ELSE 0 END) * COALESCE(v_rate, 0.10), 2),
    v_price.distance_km, v_price.vehicle_type);
  NEW.vendor_promotion_id := c.promotion_id;
  NEW.vendor_commission_discount := COALESCE(c.discount_amount, 0);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.calculate_settlement_amounts(p_order_id uuid, OUT vendor_amount numeric, OUT rider_amount numeric, OUT platform_fee numeric)
 RETURNS record
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_subtotal DECIMAL(12,2);
    v_delivery_fee DECIMAL(12,2);
    v_vendor_discount DECIMAL(12,2);
    v_commission_discount DECIMAL(12,2);
    v_rider_discount DECIMAL(12,2);
    v_config public.pricing_config%ROWTYPE;
    v_vendor UUID;
BEGIN
    SELECT COALESCE(subtotal, 0), COALESCE(delivery_fee, 0),
           CASE WHEN discount_target = 'items' AND discount_bearer = 'vendor' THEN COALESCE(discount_amount, 0) ELSE 0 END,
           COALESCE(vendor_commission_discount, 0), COALESCE(rider_commission_discount, 0), vendor_id
    INTO v_subtotal, v_delivery_fee, v_vendor_discount, v_commission_discount, v_rider_discount, v_vendor
    FROM public.orders
    WHERE id = p_order_id;

    SELECT * INTO v_config FROM public.pricing_config ORDER BY created_at DESC LIMIT 1;

    platform_fee := GREATEST(round((v_subtotal - v_vendor_discount) * public.vendor_commission_rate(v_vendor), 2)
                             - v_commission_discount, 0);
    vendor_amount := v_subtotal - v_vendor_discount - platform_fee;
    rider_amount := LEAST(round(v_delivery_fee * COALESCE(v_config.rider_share_rate, 0.85), 2) + v_rider_discount, v_delivery_fee);
END;
$function$;

CREATE OR REPLACE FUNCTION public.rider_request_quote(p_latitude double precision, p_longitude double precision, p_vehicle_type text DEFAULT NULL::text, p_coupon_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_store JSONB := public.order_pickup_point(auth.uid(), NULL);
  v_rate NUMERIC;
  v_wallet NUMERIC;
  v_modes JSONB := '[]'::jsonb;
  q RECORD;
  d RECORD;
  v_total NUMERIC;
BEGIN
  -- A partner vendor's own rate, otherwise the standard one
  v_rate := public.rider_request_commission_rate(auth.uid());
  SELECT COALESCE(available_balance, 0) INTO v_wallet FROM public.vendor_wallet WHERE vendor_id = auth.uid();
  v_wallet := COALESCE(v_wallet, 0);
  IF v_store IS NULL THEN
    RETURN jsonb_build_object('status', 'no_store', 'wallet_balance', v_wallet);
  END IF;

  SELECT * INTO q FROM public.delivery_leg_quote((v_store ->> 'latitude')::float8, (v_store ->> 'longitude')::float8,
                                                 p_latitude, p_longitude, p_vehicle_type, v_rate);
  IF q.status = 'no_location' THEN
    RETURN jsonb_build_object('status', 'no_location', 'wallet_balance', v_wallet);
  END IF;
  v_modes := public.delivery_modes((v_store ->> 'latitude')::float8, (v_store ->> 'longitude')::float8, q.distance_km, 0);
  -- Price for the mode they'll get (their choice if a rider with it is free)
  SELECT * INTO q FROM public.delivery_leg_quote(
    (v_store ->> 'latitude')::float8, (v_store ->> 'longitude')::float8, p_latitude, p_longitude,
    COALESCE(public.pick_delivery_mode(v_modes, COALESCE(p_vehicle_type, public.default_vehicle_type())), q.vehicle_type), v_rate);

  SELECT * INTO d FROM public.apply_promotion('rider_request', auth.uid(), auth.uid(), 0, q.delivery_fee, q.charge,
                                              q.distance_km, q.vehicle_type, p_coupon_code);
  v_total := GREATEST(q.total_amount - COALESCE(d.discount_amount, 0), 0);

  RETURN jsonb_build_object(
    'status', q.status,
    'distance_km', q.distance_km,
    'vehicle_type', q.vehicle_type,
    'rate_per_km', q.rate_per_km,
    'base_rate', q.base_rate,
    'distance_fee', q.distance_fee,
    'delivery_fee', q.delivery_fee,
    'commission', q.charge,
    'discount_amount', COALESCE(d.discount_amount, 0),
    'discount_target', d.discount_target,
    'promotion_name', d.promotion_name,
    'coupon_status', d.coupon_status,
    'coupon_message', d.coupon_message,
    'promotion_uses_left', d.uses_left,
    'total_amount', v_total,
    'wallet_balance', v_wallet,
    'wallet_amount', LEAST(v_wallet, v_total),
    'card_amount', v_total - LEAST(v_wallet, v_total),
    'riders_available', EXISTS (SELECT 1 FROM jsonb_array_elements(v_modes) m WHERE (m ->> 'available')::boolean),
    'modes', v_modes,
    'eta_min', (SELECT (m ->> 'eta_min')::int FROM jsonb_array_elements(v_modes) m WHERE m ->> 'key' = q.vehicle_type)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_rider_request(p_recipient_name text, p_recipient_phone text, p_recipient_email text, p_location jsonb, p_package_details text DEFAULT NULL::text, p_save_customer boolean DEFAULT false, p_vehicle_type text DEFAULT NULL::text, p_coupon_code text DEFAULT NULL::text)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_vendor UUID := auth.uid();
  v_lat DOUBLE PRECISION := (p_location ->> 'latitude')::double precision;
  v_lng DOUBLE PRECISION := (p_location ->> 'longitude')::double precision;
  v_store JSONB := public.order_pickup_point(auth.uid(), NULL);
  v_rate NUMERIC;
  v_mode TEXT;
  q RECORD;
  d RECORD;
  v_total NUMERIC;
  v_wallet NUMERIC;
  v_order public.orders%ROWTYPE;
BEGIN
  PERFORM public.lock_limited_promotions();
  IF public.current_user_role() IS DISTINCT FROM 'vendor' THEN
    RAISE EXCEPTION 'Only vendors can request a rider';
  END IF;
  IF NOT public.vendor_can_trade(v_vendor) THEN
    RAISE EXCEPTION 'Your store isn''t active yet. Finish onboarding or wait for verification.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_vendor AND public.is_valid_phone(phone)) THEN
    RAISE EXCEPTION 'Add a phone number to your profile before requesting a rider';
  END IF;
  PERFORM public.check_recipient(p_recipient_name, p_recipient_phone, p_recipient_email, p_location);
  IF v_store IS NULL THEN
    RAISE EXCEPTION 'Set your store location in Settings before requesting a rider';
  END IF;

  -- A partner vendor's own rate, otherwise the standard one
  v_rate := public.rider_request_commission_rate(auth.uid());
  v_mode := public.require_free_rider(
    public.delivery_modes((v_store ->> 'latitude')::float8, (v_store ->> 'longitude')::float8,
      public.longest_leg_km((v_store ->> 'latitude')::float8, (v_store ->> 'longitude')::float8, jsonb_build_array(p_location)), 0),
    p_vehicle_type);
  SELECT * INTO q FROM public.delivery_leg_quote((v_store ->> 'latitude')::float8, (v_store ->> 'longitude')::float8,
                                                 v_lat, v_lng, v_mode, v_rate);
  IF q.status = 'out_of_range' THEN
    RAISE EXCEPTION 'The delivery location is too far from your store. The longest delivery we do is %.', public.km_text(public.max_trip_km());
  END IF;

  SELECT * INTO d FROM public.apply_promotion('rider_request', v_vendor, v_vendor, 0, q.delivery_fee, q.charge,
                                              q.distance_km, q.vehicle_type, p_coupon_code);
  IF d.coupon_status = 'invalid' THEN
    RAISE EXCEPTION '%', d.coupon_message;
  END IF;
  v_total := GREATEST(q.total_amount - COALESCE(d.discount_amount, 0), 0);

  -- Wallet first
  SELECT available_balance INTO v_wallet FROM public.vendor_wallet WHERE vendor_id = v_vendor FOR UPDATE;
  v_wallet := LEAST(COALESCE(v_wallet, 0), v_total);

  INSERT INTO public.orders (
    order_type, customer_id, vendor_id, status, payment_status, delivery_type,
    delivery_address, subtotal, delivery_fee, service_charge, total_amount,
    distance_km, base_rate, distance_fee, wallet_amount, special_instructions,
    preferred_vehicle_type, vehicle_rate_per_km,
    promotion_id, coupon_code, discount_amount, discount_target, discount_bearer
  ) VALUES (
    'rider_request', NULL, v_vendor, 'pending', 'pending', 'standard',
    public.delivery_point(p_location, p_recipient_name, p_recipient_phone, p_recipient_email),
    0, q.delivery_fee, q.charge, v_total,
    q.distance_km, q.base_rate, q.distance_fee, v_wallet, NULLIF(trim(p_package_details), ''),
    q.vehicle_type, q.rate_per_km,
    d.promotion_id, CASE WHEN d.coupon_status = 'applied' THEN upper(trim(p_coupon_code)) END,
    COALESCE(d.discount_amount, 0), d.discount_target, d.discount_bearer
  )
  RETURNING * INTO v_order;

  IF v_wallet > 0 THEN
    UPDATE public.vendor_wallet SET available_balance = available_balance - v_wallet, updated_at = now()
    WHERE vendor_id = v_vendor;
    INSERT INTO public.vendor_transactions (
      vendor_id, transaction_id, type, amount, fee, net_amount, status, description,
      reference_id, reference_type, processed_at, metadata
    ) VALUES (
      v_vendor, 'RRQ-' || v_order.order_number, 'adjustment', v_wallet, 0, -v_wallet, 'completed',
      'Rider request ' || v_order.order_number || ' paid from wallet', v_order.id, 'order', now(),
      jsonb_build_object('order_number', v_order.order_number)
    );
  END IF;

  IF p_save_customer THEN
    INSERT INTO public.vendor_customers (
      vendor_id, name, phone, email, place_name, formatted_address, street, city, state, country,
      place_id, latitude, longitude, directions
    ) VALUES (
      v_vendor, trim(p_recipient_name), trim(p_recipient_phone), lower(trim(p_recipient_email)), p_location ->> 'place_name',
      p_location ->> 'formatted_address', p_location ->> 'street', p_location ->> 'city',
      p_location ->> 'state', p_location ->> 'country', p_location ->> 'place_id', v_lat, v_lng,
      NULLIF(p_location ->> 'directions', '')
    );
  END IF;

  -- Fully covered by the wallet: live now
  IF v_wallet >= v_total THEN
    PERFORM public.activate_rider_request(v_order.id, 'WALLET-' || v_order.order_number, 'wallet', '{}');
    SELECT * INTO v_order FROM public.orders WHERE id = v_order.id;
  END IF;

  RETURN v_order;
END;
$function$;

CREATE OR REPLACE FUNCTION public.batch_quote(p_stops jsonb, p_vehicle_type text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_store JSONB := public.order_pickup_point(auth.uid(), NULL);
  v_rate NUMERIC;
  v_wallet NUMERIC;
  v_modes JSONB;
  v_mode TEXT;
  v_lat DOUBLE PRECISION;
  v_lng DOUBLE PRECISION;
  v_stop JSONB;
  v_legs JSONB := '[]'::jsonb;
  v_status TEXT := 'ok';
  v_km NUMERIC := 0;
  v_fee NUMERIC := 0;
  v_commission NUMERIC := 0;
  v_count INTEGER := COALESCE(jsonb_array_length(p_stops), 0);
  v_base NUMERIC;
  q RECORD;
BEGIN
  -- A partner vendor's own rate, otherwise the standard one
  v_rate := public.rider_request_commission_rate(auth.uid());
  SELECT COALESCE(available_balance, 0) INTO v_wallet FROM public.vendor_wallet WHERE vendor_id = auth.uid();
  v_wallet := COALESCE(v_wallet, 0);
  IF v_store IS NULL THEN
    RETURN jsonb_build_object('status', 'no_store', 'wallet_balance', v_wallet);
  END IF;

  -- The mode has to cover the longest leg of the route
  v_modes := public.delivery_modes((v_store ->> 'latitude')::float8, (v_store ->> 'longitude')::float8,
    public.longest_leg_km((v_store ->> 'latitude')::float8, (v_store ->> 'longitude')::float8, p_stops), 0);
  v_mode := COALESCE(public.pick_delivery_mode(v_modes, COALESCE(p_vehicle_type, public.default_vehicle_type())),
                     p_vehicle_type, public.default_vehicle_type());

  v_lat := (v_store ->> 'latitude')::float8;
  v_lng := (v_store ->> 'longitude')::float8;
  FOR v_stop IN SELECT value FROM jsonb_array_elements(COALESCE(p_stops, '[]'::jsonb)) LOOP
    SELECT * INTO q FROM public.delivery_leg_quote(v_lat, v_lng, (v_stop ->> 'latitude')::float8,
                                                   (v_stop ->> 'longitude')::float8, v_mode, v_rate);
    v_legs := v_legs || jsonb_build_object(
      'status', q.status, 'distance_km', q.distance_km, 'delivery_fee', q.delivery_fee,
      'commission', q.charge, 'total_amount', q.total_amount);
    IF q.status <> 'ok' AND v_status = 'ok' THEN
      v_status := q.status;
    END IF;
    IF q.status <> 'no_location' THEN
      v_km := v_km + q.distance_km;
      v_fee := v_fee + q.delivery_fee;
      v_commission := v_commission + q.charge;
      v_lat := (v_stop ->> 'latitude')::float8;
      v_lng := (v_stop ->> 'longitude')::float8;
    END IF;
  END LOOP;

  -- What the whole batch would cost by each mode, and how long the route takes
  SELECT COALESCE(base_rate, 500) INTO v_base FROM public.pricing_config ORDER BY created_at DESC LIMIT 1;
  SELECT COALESCE(jsonb_agg(m || jsonb_build_object(
           'delivery_fee', round(v_km * (m ->> 'rate_per_km')::numeric, 2) + v_count * COALESCE(v_base, 500),
           'eta_min', (SELECT eta_min FROM public.delivery_eta(m ->> 'key', v_km, 0)),
           'eta_max', (SELECT eta_max FROM public.delivery_eta(m ->> 'key', v_km, 0)))), '[]'::jsonb)
  INTO v_modes FROM jsonb_array_elements(v_modes) m;

  RETURN jsonb_build_object(
    'status', v_status,
    'vehicle_type', v_mode,
    'stops', v_legs,
    'distance_km', v_km,
    'delivery_fee', v_fee,
    'commission', v_commission,
    'total_amount', v_fee + v_commission,
    'wallet_balance', v_wallet,
    'wallet_amount', LEAST(v_wallet, v_fee + v_commission),
    'card_amount', v_fee + v_commission - LEAST(v_wallet, v_fee + v_commission),
    'riders_available', EXISTS (SELECT 1 FROM jsonb_array_elements(v_modes) m WHERE (m ->> 'available')::boolean),
    'modes', v_modes,
    'max_stops', (SELECT COALESCE(NULLIF(value, '')::int, 5) FROM public.app_config WHERE key = 'batch_max_stops')
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_rider_batch(p_stops jsonb, p_vehicle_type text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_vendor UUID := auth.uid();
  v_store JSONB := public.order_pickup_point(auth.uid(), NULL);
  v_count INTEGER := CASE WHEN jsonb_typeof(p_stops) = 'array' THEN jsonb_array_length(p_stops) ELSE 0 END;
  v_max INTEGER;
  v_rate NUMERIC;
  v_mode TEXT;
  v_lat DOUBLE PRECISION;
  v_lng DOUBLE PRECISION;
  v_stop JSONB;
  v_loc JSONB;
  v_seq INTEGER := 0;
  v_balance NUMERIC;
  v_take NUMERIC;
  v_wallet_used NUMERIC := 0;
  v_total NUMERIC := 0;
  v_batch public.rider_request_batches%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_ids UUID[] := '{}';
  q RECORD;
  r RECORD;
BEGIN
  IF public.current_user_role() IS DISTINCT FROM 'vendor' THEN
    RAISE EXCEPTION 'Only vendors can request a rider';
  END IF;
  IF NOT public.vendor_can_trade(v_vendor) THEN
    RAISE EXCEPTION 'Your store isn''t active yet. Finish onboarding or wait for verification.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_vendor AND public.is_valid_phone(phone)) THEN
    RAISE EXCEPTION 'Add a phone number to your profile before requesting a rider';
  END IF;
  IF v_store IS NULL THEN
    RAISE EXCEPTION 'Set your store location in Settings before requesting a rider';
  END IF;
  SELECT COALESCE(NULLIF(value, '')::int, 5) INTO v_max FROM public.app_config WHERE key = 'batch_max_stops';
  IF v_count < 2 THEN
    RAISE EXCEPTION 'A batch needs at least 2 drop-offs';
  END IF;
  IF v_count > COALESCE(v_max, 5) THEN
    RAISE EXCEPTION 'A batch can have up to % drop-offs', COALESCE(v_max, 5);
  END IF;

  -- Name the drop-off that's too far, before looking for a rider
  v_lat := (v_store ->> 'latitude')::float8;
  v_lng := (v_store ->> 'longitude')::float8;
  FOR v_stop IN SELECT value FROM jsonb_array_elements(p_stops) LOOP
    v_seq := v_seq + 1;
    v_loc := v_stop -> 'location';
    IF public.longest_leg_km(v_lat, v_lng, jsonb_build_array(v_loc)) > public.max_trip_km() THEN
      RAISE EXCEPTION 'Drop-off % is too far from % (the longest delivery we do is %)', v_seq,
        CASE WHEN v_seq = 1 THEN 'your store' ELSE 'drop-off ' || (v_seq - 1) END, public.km_text(public.max_trip_km());
    END IF;
    v_lat := COALESCE((v_loc ->> 'latitude')::float8, v_lat);
    v_lng := COALESCE((v_loc ->> 'longitude')::float8, v_lng);
  END LOOP;
  v_seq := 0;

  -- A partner vendor's own rate, otherwise the standard one
  v_rate := public.rider_request_commission_rate(auth.uid());
  v_mode := public.require_free_rider(
    public.delivery_modes((v_store ->> 'latitude')::float8, (v_store ->> 'longitude')::float8,
      public.longest_leg_km((v_store ->> 'latitude')::float8, (v_store ->> 'longitude')::float8,
                            (SELECT jsonb_agg(value -> 'location') FROM jsonb_array_elements(p_stops))), 0),
    p_vehicle_type);

  INSERT INTO public.rider_request_batches (batch_number, vendor_id, vehicle_type)
  VALUES ('BAT-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 6)), v_vendor, v_mode)
  RETURNING * INTO v_batch;

  SELECT available_balance INTO v_balance FROM public.vendor_wallet WHERE vendor_id = v_vendor FOR UPDATE;
  v_balance := COALESCE(v_balance, 0);

  v_lat := (v_store ->> 'latitude')::float8;
  v_lng := (v_store ->> 'longitude')::float8;
  FOR v_stop IN SELECT value FROM jsonb_array_elements(p_stops) LOOP
    v_seq := v_seq + 1;
    v_loc := v_stop -> 'location';
    BEGIN
      PERFORM public.check_recipient(v_stop ->> 'name', v_stop ->> 'phone', v_stop ->> 'email', v_loc);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Drop-off %: %', v_seq, SQLERRM;
    END;

    SELECT * INTO q FROM public.delivery_leg_quote(v_lat, v_lng, (v_loc ->> 'latitude')::float8,
                                                   (v_loc ->> 'longitude')::float8, v_mode, v_rate);
    IF q.status = 'out_of_range' THEN
      RAISE EXCEPTION 'Drop-off % is too far from % (the longest delivery we do is %)', v_seq,
        CASE WHEN v_seq = 1 THEN 'your store' ELSE 'drop-off ' || (v_seq - 1) END, public.km_text(public.max_trip_km());
    END IF;

    v_take := LEAST(v_balance - v_wallet_used, q.total_amount);
    INSERT INTO public.orders (
      order_type, customer_id, vendor_id, status, payment_status, delivery_type,
      delivery_address, subtotal, delivery_fee, service_charge, total_amount,
      distance_km, base_rate, distance_fee, wallet_amount, special_instructions,
      preferred_vehicle_type, vehicle_rate_per_km, batch_id, batch_seq
    ) VALUES (
      'rider_request', NULL, v_vendor, 'pending', 'pending', 'standard',
      public.delivery_point(v_loc, v_stop ->> 'name', v_stop ->> 'phone', v_stop ->> 'email'),
      0, q.delivery_fee, q.charge, q.total_amount,
      q.distance_km, q.base_rate, q.distance_fee, v_take, NULLIF(trim(v_stop ->> 'package_details'), ''),
      q.vehicle_type, q.rate_per_km, v_batch.id, v_seq
    )
    RETURNING * INTO v_order;
    v_ids := v_ids || v_order.id;
    v_wallet_used := v_wallet_used + v_take;
    v_total := v_total + q.total_amount;

    IF COALESCE((v_stop ->> 'save_customer')::boolean, false) THEN
      INSERT INTO public.vendor_customers (
        vendor_id, name, phone, email, place_name, formatted_address, street, city, state, country,
        place_id, latitude, longitude, directions
      ) VALUES (
        v_vendor, trim(v_stop ->> 'name'), trim(v_stop ->> 'phone'), lower(trim(v_stop ->> 'email')), v_loc ->> 'place_name',
        v_loc ->> 'formatted_address', v_loc ->> 'street', v_loc ->> 'city', v_loc ->> 'state', v_loc ->> 'country',
        v_loc ->> 'place_id', (v_loc ->> 'latitude')::float8, (v_loc ->> 'longitude')::float8,
        NULLIF(v_loc ->> 'directions', '')
      );
    END IF;

    v_lat := (v_loc ->> 'latitude')::float8;
    v_lng := (v_loc ->> 'longitude')::float8;
  END LOOP;

  IF v_wallet_used > 0 THEN
    UPDATE public.vendor_wallet SET available_balance = available_balance - v_wallet_used, updated_at = now()
    WHERE vendor_id = v_vendor;
    INSERT INTO public.vendor_transactions (
      vendor_id, transaction_id, type, amount, fee, net_amount, status, description,
      reference_id, reference_type, processed_at, metadata
    ) VALUES (
      v_vendor, 'RRQ-' || v_batch.batch_number, 'adjustment', v_wallet_used, 0, -v_wallet_used, 'completed',
      'Batch ' || v_batch.batch_number || ' (' || v_count || ' deliveries) paid from wallet', v_ids[1], 'order', now(),
      jsonb_build_object('batch_number', v_batch.batch_number)
    );
  END IF;

  -- Fully covered by the wallet: live now (last stop first, so riders get one
  -- alert, from stop 1, once every stop is ready)
  IF v_wallet_used >= v_total THEN
    FOR r IN SELECT id, order_number FROM public.orders WHERE batch_id = v_batch.id ORDER BY batch_seq DESC LOOP
      PERFORM public.activate_rider_request(r.id, 'WALLET-' || v_batch.batch_number, 'wallet', '{}');
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'batch_id', v_batch.id,
    'batch_number', v_batch.batch_number,
    'order_ids', to_jsonb(v_ids),
    'total_amount', v_total,
    'wallet_amount', v_wallet_used,
    'card_amount', v_total - v_wallet_used,
    'paid', v_wallet_used >= v_total
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.within_rider_radius(p_latitude double precision, p_longitude double precision)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE((
    SELECT public.distance_m(
             (rp.current_location ->> 'latitude')::double precision,
             (rp.current_location ->> 'longitude')::double precision,
             p_latitude, p_longitude
           ) <= public.rider_see_radius_m(rp.id)
    FROM public.rider_profiles rp
    WHERE rp.id = auth.uid()
      AND rp.current_location ? 'latitude'
      AND rp.current_location ? 'longitude'
      AND p_latitude IS NOT NULL
      AND p_longitude IS NOT NULL
  ), false);
$function$;

CREATE OR REPLACE FUNCTION public.free_riders_near(p_latitude double precision, p_longitude double precision)
 RETURNS TABLE(vehicle_type text, riders integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(rp.vehicle_type, public.default_vehicle_type()), count(*)::int
  FROM public.rider_profiles rp
  WHERE rp.rider_status = 'available'
    AND public.is_verified_rider(rp.id)
    AND rp.current_location ? 'latitude'
    AND rp.current_location ? 'longitude'
    AND p_latitude IS NOT NULL AND p_longitude IS NOT NULL
    AND public.distance_m((rp.current_location ->> 'latitude')::float8, (rp.current_location ->> 'longitude')::float8,
                          p_latitude, p_longitude) <= public.rider_see_radius_m(rp.id)
    AND NOT EXISTS (SELECT 1 FROM public.orders o
                    WHERE o.rider_id = rp.id AND o.status = ANY (public.rider_active_statuses()))
  GROUP BY 1;
$function$;

CREATE OR REPLACE FUNCTION public.notify_riders_of_order(o orders, p_other_modes boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pickup JSONB := public.order_pickup_point(o.vendor_id, o.pickup_address);
  v_lat DOUBLE PRECISION := (v_pickup ->> 'latitude')::float8;
  v_lng DOUBLE PRECISION := (v_pickup ->> 'longitude')::float8;
  v_stops INTEGER;
  v_trip NUMERIC := public.order_trip_km(o.distance_km, o.batch_id);
  v_rider RECORD;
BEGIN
  -- One alert per batch, from its first stop
  IF o.batch_id IS NOT NULL AND COALESCE(o.batch_seq, 1) > 1 THEN
    RETURN;
  END IF;
  IF v_lat IS NULL OR v_lng IS NULL THEN
    RETURN;
  END IF;
  IF o.batch_id IS NOT NULL THEN
    SELECT count(*) INTO v_stops FROM public.orders WHERE batch_id = o.batch_id AND status = 'ready_for_pickup';
  END IF;

  FOR v_rider IN
    SELECT rp.id,
           public.distance_m((rp.current_location ->> 'latitude')::float8, (rp.current_location ->> 'longitude')::float8,
                             v_lat, v_lng) AS meters
    FROM public.rider_profiles rp
    WHERE rp.rider_status = 'available'
      AND public.is_verified_rider(rp.id)
      AND rp.current_location ? 'latitude'
      AND rp.current_location ? 'longitude'
      AND public.distance_m((rp.current_location ->> 'latitude')::float8, (rp.current_location ->> 'longitude')::float8,
                            v_lat, v_lng)
          -- Each vehicle type's alert distance (Admin -> Riders & vehicles)
          <= COALESCE((SELECT t.alert_orders_km * 1000 FROM public.vehicle_types t
                       WHERE t.key = COALESCE(rp.vehicle_type, public.default_vehicle_type())), public.rider_order_radius_m())
      -- Only riders whose vehicle covers the trip
      AND v_trip <= COALESCE((SELECT t.max_distance_km FROM public.vehicle_types t
                              WHERE t.key = COALESCE(rp.vehicle_type, public.default_vehicle_type())), 5)
      AND CASE
            WHEN o.preferred_vehicle_type IS NULL THEN NOT p_other_modes
            WHEN p_other_modes THEN COALESCE(rp.vehicle_type, public.default_vehicle_type()) <> o.preferred_vehicle_type
            ELSE o.mode_widened_at IS NOT NULL
                 OR COALESCE(rp.vehicle_type, public.default_vehicle_type()) = o.preferred_vehicle_type
          END
  LOOP
    PERFORM public.notify_user(v_rider.id, 'order_nearby', 'Order nearby',
      CASE WHEN o.batch_id IS NOT NULL
        THEN 'A batch of ' || v_stops || ' deliveries is ready for pickup '
        ELSE 'Order #' || o.order_number || ' is ready for pickup ' END
      || round((v_rider.meters / 1000)::numeric, 1) || ' km from you.', o);
  END LOOP;
END;
$function$;

DROP FUNCTION IF EXISTS public.admin_save_vehicle_type(text, numeric, numeric, numeric, text, text, boolean, boolean, boolean);
CREATE OR REPLACE FUNCTION public.admin_save_vehicle_type(p_name text, p_rate_per_km numeric, p_avg_speed_kmh numeric, p_max_distance_km numeric, p_key text DEFAULT NULL::text, p_customer_label text DEFAULT NULL::text, p_needs_details boolean DEFAULT true, p_needs_registration boolean DEFAULT false, p_is_active boolean DEFAULT true, p_see_orders_km numeric DEFAULT NULL::numeric, p_alert_orders_km numeric DEFAULT NULL::numeric)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_name TEXT := NULLIF(trim(p_name), '');
  v_key TEXT := NULLIF(trim(p_key), '');
  v_old JSONB;
BEGIN
  PERFORM public.require_admin();
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Enter the vehicle type''s name';
  END IF;
  IF p_rate_per_km IS NULL OR p_rate_per_km < 0 OR p_rate_per_km > 100000 THEN
    RAISE EXCEPTION 'Price per km must be between ₦0 and ₦100,000';
  END IF;
  IF p_avg_speed_kmh IS NULL OR p_avg_speed_kmh <= 0 OR p_avg_speed_kmh > 200 THEN
    RAISE EXCEPTION 'Average speed must be between 1 and 200 km/h';
  END IF;
  IF p_max_distance_km IS NULL OR p_max_distance_km <= 0 OR p_max_distance_km > 100 THEN
    RAISE EXCEPTION 'The longest trip must be between 0.1 and 100 km';
  END IF;

  IF p_see_orders_km IS NOT NULL AND (p_see_orders_km <= 0 OR p_see_orders_km > 50) THEN
    RAISE EXCEPTION 'The distance to see orders must be between 0.1 and 50 km';
  END IF;
  IF p_alert_orders_km IS NOT NULL AND (p_alert_orders_km <= 0 OR p_alert_orders_km > COALESCE(p_see_orders_km, 50)) THEN
    RAISE EXCEPTION 'The alert distance must be more than 0 km and no more than the distance to see orders';
  END IF;

  IF v_key IS NULL THEN
    v_key := trim(both '_' from regexp_replace(lower(v_name), '[^a-z0-9]+', '_', 'g'));
    IF v_key = '' OR EXISTS (SELECT 1 FROM public.vehicle_types WHERE key = v_key OR lower(name) = lower(v_name)) THEN
      RAISE EXCEPTION 'A vehicle type with that name already exists';
    END IF;
    INSERT INTO public.vehicle_types (key, name, customer_label, rate_per_km, avg_speed_kmh, max_distance_km, needs_details,
                                      needs_registration, is_active, sort_order, see_orders_km, alert_orders_km)
    VALUES (v_key, v_name, NULLIF(trim(p_customer_label), ''), p_rate_per_km, p_avg_speed_kmh, p_max_distance_km,
            COALESCE(p_needs_details, true), COALESCE(p_needs_registration, false), COALESCE(p_is_active, true),
            (SELECT COALESCE(max(sort_order), 0) + 1 FROM public.vehicle_types),
            COALESCE(p_see_orders_km, 5), COALESCE(p_alert_orders_km, LEAST(COALESCE(p_see_orders_km, 5), 5)));
  ELSE
    SELECT to_jsonb(t) INTO v_old FROM public.vehicle_types t WHERE key = v_key;
    IF v_old IS NULL THEN
      RAISE EXCEPTION 'Vehicle type not found';
    END IF;
    IF NOT COALESCE(p_is_active, true)
       AND NOT EXISTS (SELECT 1 FROM public.vehicle_types WHERE is_active AND key <> v_key) THEN
      RAISE EXCEPTION 'Keep at least one vehicle type active';
    END IF;
    UPDATE public.vehicle_types
    SET name = v_name, customer_label = NULLIF(trim(p_customer_label), ''), rate_per_km = p_rate_per_km,
        avg_speed_kmh = p_avg_speed_kmh, max_distance_km = p_max_distance_km,
        needs_details = COALESCE(p_needs_details, needs_details),
        needs_registration = COALESCE(p_needs_registration, needs_registration),
        is_active = COALESCE(p_is_active, is_active),
        see_orders_km = COALESCE(p_see_orders_km, see_orders_km),
        alert_orders_km = COALESCE(p_alert_orders_km, LEAST(alert_orders_km, COALESCE(p_see_orders_km, see_orders_km)))
    WHERE key = v_key;
  END IF;

  PERFORM public.log_admin_action('save_vehicle_type', 'vehicle_type', v_key, v_old,
    (SELECT to_jsonb(t) FROM public.vehicle_types t WHERE key = v_key));
  RETURN v_key;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_save_vehicle_type(text, numeric, numeric, numeric, text, text, boolean, boolean, boolean, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_vehicle_type(text, numeric, numeric, numeric, text, text, boolean, boolean, boolean, numeric, numeric) TO authenticated;
