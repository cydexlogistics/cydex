-- Road distance for priced trips. Delivery fees (and how far each delivery
-- mode can go) now use the distance by road from Google's Routes API instead
-- of a straight line, for:
--   * customer orders (store -> customer), Cydex Express (pickup -> drop-off),
--     and rider requests and batches (each leg).
-- Road distances are looked up once per pair of points by the route-distances
-- Edge Function and stored in route_distances. Until one is stored, or if
-- Google fails, the straight line is used, exactly as before.
-- Vendor lists, rider radius and alerts stay straight-line (they compare many
-- points at once).

CREATE TABLE IF NOT EXISTS public.route_distances (
  -- Points rounded to 5 decimals (about 1 m)
  from_lat NUMERIC(8,5) NOT NULL,
  from_lng NUMERIC(8,5) NOT NULL,
  to_lat NUMERIC(8,5) NOT NULL,
  to_lng NUMERIC(8,5) NOT NULL,
  distance_m INTEGER NOT NULL CHECK (distance_m >= 0),
  duration_s INTEGER,
  provider TEXT NOT NULL DEFAULT 'google_routes',
  requested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (from_lat, from_lng, to_lat, to_lng)
);
CREATE INDEX IF NOT EXISTS route_distances_requested_idx ON public.route_distances (requested_by, created_at DESC);
ALTER TABLE public.route_distances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read route distances" ON public.route_distances;
CREATE POLICY "Admins read route distances" ON public.route_distances FOR SELECT USING (public.is_admin());
REVOKE INSERT, UPDATE, DELETE ON public.route_distances FROM anon, authenticated;

-- Remembers a leg priced without a road distance during this request, so the
-- quote can list it (the app then asks route-distances for it)
CREATE OR REPLACE FUNCTION public.note_missing_route(p_from_lat DOUBLE PRECISION, p_from_lng DOUBLE PRECISION,
                                                     p_to_lat DOUBLE PRECISION, p_to_lng DOUBLE PRECISION)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_list JSONB := COALESCE(NULLIF(current_setting('cydex.missing_routes', true), '')::jsonb, '[]'::jsonb);
  v_leg JSONB := jsonb_build_object(
    'from', jsonb_build_array(round(p_from_lat::numeric, 5), round(p_from_lng::numeric, 5)),
    'to', jsonb_build_array(round(p_to_lat::numeric, 5), round(p_to_lng::numeric, 5)));
BEGIN
  IF NOT v_list @> jsonb_build_array(v_leg) THEN
    PERFORM set_config('cydex.missing_routes', (v_list || jsonb_build_array(v_leg))::text, true);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.missing_routes()
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(NULLIF(current_setting('cydex.missing_routes', true), '')::jsonb, '[]'::jsonb);
$$;

-- The distance of a priced trip, in metres: by road when we have it,
-- otherwise the straight line (and the leg is noted as missing)
CREATE OR REPLACE FUNCTION public.trip_distance_m(p_from_lat DOUBLE PRECISION, p_from_lng DOUBLE PRECISION,
                                                  p_to_lat DOUBLE PRECISION, p_to_lng DOUBLE PRECISION)
RETURNS DOUBLE PRECISION
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_straight DOUBLE PRECISION := public.distance_m(p_from_lat, p_from_lng, p_to_lat, p_to_lng);
  v_road INTEGER;
BEGIN
  -- Same spot, or a few steps away: nothing to look up
  IF v_straight IS NULL OR v_straight < 50 THEN
    RETURN v_straight;
  END IF;
  SELECT r.distance_m INTO v_road FROM public.route_distances r
  WHERE r.from_lat = round(p_from_lat::numeric, 5) AND r.from_lng = round(p_from_lng::numeric, 5)
    AND r.to_lat = round(p_to_lat::numeric, 5) AND r.to_lng = round(p_to_lng::numeric, 5);
  IF v_road IS NULL THEN
    PERFORM public.note_missing_route(p_from_lat, p_from_lng, p_to_lat, p_to_lng);
    RETURN v_straight;
  END IF;
  -- A road is never shorter than the straight line
  RETURN GREATEST(v_road::double precision, v_straight);
END;
$$;

-- Used by the route-distances Edge Function (service role)
CREATE OR REPLACE FUNCTION public.save_route_distance(p_from_lat DOUBLE PRECISION, p_from_lng DOUBLE PRECISION,
  p_to_lat DOUBLE PRECISION, p_to_lng DOUBLE PRECISION, p_distance_m INTEGER, p_duration_s INTEGER, p_requested_by UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.route_distances (from_lat, from_lng, to_lat, to_lng, distance_m, duration_s, requested_by)
  VALUES (round(p_from_lat::numeric, 5), round(p_from_lng::numeric, 5), round(p_to_lat::numeric, 5), round(p_to_lng::numeric, 5),
          p_distance_m, p_duration_s, p_requested_by)
  ON CONFLICT (from_lat, from_lng, to_lat, to_lng) DO UPDATE
  SET distance_m = EXCLUDED.distance_m, duration_s = EXCLUDED.duration_s, created_at = now();
$$;
REVOKE EXECUTE ON FUNCTION public.save_route_distance(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, INTEGER, UUID) FROM PUBLIC, anon, authenticated;

-- How many road distances a user has caused to be looked up recently (rate limit)
CREATE OR REPLACE FUNCTION public.route_lookups_since(p_user UUID, p_since TIMESTAMPTZ)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int FROM public.route_distances WHERE requested_by = p_user AND created_at > p_since;
$$;
REVOKE EXECUTE ON FUNCTION public.route_lookups_since(UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;

-- ===================================================================
-- Priced distances use trip_distance_m
-- ===================================================================
CREATE OR REPLACE FUNCTION public.calculate_order_price(p_vendor_id uuid, p_address_id uuid, p_subtotal numeric, p_vehicle_type text DEFAULT NULL::text, OUT status text, OUT distance_km numeric, OUT vehicle_type text, OUT rate_per_km numeric, OUT base_rate numeric, OUT distance_fee numeric, OUT delivery_fee numeric, OUT service_charge numeric, OUT total_amount numeric)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_config public.pricing_config%ROWTYPE;
  v_store public.addresses%ROWTYPE;
  v_dest public.addresses%ROWTYPE;
  v_distance_m DOUBLE PRECISION;
  f RECORD;
BEGIN
  SELECT * INTO v_config FROM public.pricing_config ORDER BY created_at DESC LIMIT 1;
  service_charge := round(COALESCE(p_subtotal, 0) * COALESCE(v_config.service_charge_rate, 0.15), 2);

  SELECT * INTO v_dest FROM public.addresses WHERE id = p_address_id;
  SELECT * INTO v_store FROM public.addresses
  WHERE profile_id = p_vendor_id
  ORDER BY is_default DESC, created_at DESC
  LIMIT 1;

  IF v_dest.id IS NULL THEN
    status := 'no_address';
    RETURN;
  END IF;
  IF v_store.id IS NULL THEN
    status := 'no_store';
    RETURN;
  END IF;

  -- By road when we have it (straight line until then)
  v_distance_m := public.trip_distance_m(v_store.latitude, v_store.longitude, v_dest.latitude, v_dest.longitude);
  distance_km := round((v_distance_m / 1000)::numeric, 2);
  -- km x the vehicle's price per km + the flat charge
  SELECT * INTO f FROM public.delivery_fee_for(distance_km, p_vehicle_type);
  vehicle_type := f.vehicle_type;
  rate_per_km := f.rate_per_km;
  base_rate := f.base_rate;
  distance_fee := f.distance_fee;
  delivery_fee := f.delivery_fee;
  total_amount := COALESCE(p_subtotal, 0) + service_charge + delivery_fee;
  status := CASE WHEN v_distance_m <= public.customer_vendor_radius_m() THEN 'ok' ELSE 'out_of_range' END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delivery_leg_quote(p_from_latitude double precision, p_from_longitude double precision, p_to_latitude double precision, p_to_longitude double precision, p_vehicle_type text, p_rate numeric, OUT status text, OUT distance_km numeric, OUT vehicle_type text, OUT rate_per_km numeric, OUT base_rate numeric, OUT distance_fee numeric, OUT delivery_fee numeric, OUT charge numeric, OUT total_amount numeric)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_m DOUBLE PRECISION;
  f RECORD;
BEGIN
  IF p_from_latitude IS NULL OR p_from_longitude IS NULL OR p_to_latitude IS NULL OR p_to_longitude IS NULL THEN
    status := 'no_location';
    RETURN;
  END IF;
  -- By road when we have it (straight line until then)
  v_m := public.trip_distance_m(p_from_latitude, p_from_longitude, p_to_latitude, p_to_longitude);
  distance_km := round((v_m / 1000)::numeric, 2);
  SELECT * INTO f FROM public.delivery_fee_for(distance_km, p_vehicle_type);
  vehicle_type := f.vehicle_type;
  rate_per_km := f.rate_per_km;
  base_rate := f.base_rate;
  distance_fee := f.distance_fee;
  delivery_fee := f.delivery_fee;
  charge := round(delivery_fee * COALESCE(p_rate, 0), 2);
  total_amount := delivery_fee + charge;
  status := CASE WHEN v_m <= public.customer_vendor_radius_m() THEN 'ok' ELSE 'out_of_range' END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.longest_leg_km(p_latitude double precision, p_longitude double precision, p_points jsonb)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_lat DOUBLE PRECISION := p_latitude;
  v_lng DOUBLE PRECISION := p_longitude;
  v_point JSONB;
  v_longest NUMERIC := 0;
BEGIN
  FOR v_point IN SELECT value FROM jsonb_array_elements(COALESCE(p_points, '[]'::jsonb)) LOOP
    CONTINUE WHEN (v_point ->> 'latitude') IS NULL OR (v_point ->> 'longitude') IS NULL;
    v_longest := GREATEST(v_longest, round((public.trip_distance_m(v_lat, v_lng, (v_point ->> 'latitude')::float8,
                                                              (v_point ->> 'longitude')::float8) / 1000)::numeric, 2));
    v_lat := (v_point ->> 'latitude')::float8;
    v_lng := (v_point ->> 'longitude')::float8;
  END LOOP;
  RETURN v_longest;
END;
$function$;

CREATE OR REPLACE FUNCTION public.checkout_quote(p_vendor_id uuid, p_address_id uuid, p_items jsonb, p_vehicle_type text DEFAULT NULL::text, p_coupon_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_subtotal NUMERIC := public.cart_subtotal(p_vendor_id, p_items);
  v_address UUID := (SELECT a.id FROM public.addresses a WHERE a.id = p_address_id AND a.profile_id = auth.uid());
  v_store JSONB := public.order_pickup_point(p_vendor_id, NULL);
  v_prep INTEGER;
  v_modes JSONB := '[]'::jsonb;
  v_mode TEXT;
  p RECORD;
  d RECORD;
  v_wallet NUMERIC;
  v_total NUMERIC;
BEGIN
  PERFORM set_config('cydex.missing_routes', '[]', true);
  SELECT COALESCE((SELECT prep_time_minutes FROM public.vendor_hours WHERE vendor_id = p_vendor_id), 15) INTO v_prep;
  SELECT * INTO p FROM public.calculate_order_price(p_vendor_id, v_address, v_subtotal, p_vehicle_type);

  IF p.status IN ('ok', 'out_of_range') THEN
    v_modes := public.delivery_modes((v_store ->> 'latitude')::float8, (v_store ->> 'longitude')::float8, p.distance_km, v_prep);
    -- Price for the mode they'll actually get (their choice if it's available)
    v_mode := COALESCE(public.pick_delivery_mode(v_modes, COALESCE(p_vehicle_type, public.default_vehicle_type())), p.vehicle_type);
    SELECT * INTO p FROM public.calculate_order_price(p_vendor_id, v_address, v_subtotal, v_mode);
  END IF;

  SELECT * INTO d FROM public.apply_promotion('customer', auth.uid(), p_vendor_id, v_subtotal, p.delivery_fee, p.service_charge,
                                              p.distance_km, p.vehicle_type, p_coupon_code);
  v_total := GREATEST(COALESCE(p.total_amount, v_subtotal + p.service_charge) - COALESCE(d.discount_amount, 0), 0);
  SELECT COALESCE(available_balance, 0) INTO v_wallet FROM public.customer_wallet WHERE customer_id = auth.uid();
  v_wallet := COALESCE(v_wallet, 0);

  -- Legs priced by straight line, for the app to look up by road
  RETURN jsonb_build_object('missing_routes', public.missing_routes()) || jsonb_build_object(
    'status', p.status,
    'subtotal', v_subtotal,
    'distance_km', p.distance_km,
    'vehicle_type', p.vehicle_type,
    'rate_per_km', p.rate_per_km,
    'base_rate', p.base_rate,
    'distance_fee', p.distance_fee,
    'delivery_fee', p.delivery_fee,
    'service_charge', p.service_charge,
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
    'vendor_open', public.vendor_is_open(p_vendor_id),
    'prep_time_minutes', v_prep,
    'riders_available', EXISTS (SELECT 1 FROM jsonb_array_elements(v_modes) m WHERE (m ->> 'available')::boolean),
    'modes', v_modes,
    'eta_min', (SELECT (m ->> 'eta_min')::int FROM jsonb_array_elements(v_modes) m WHERE m ->> 'key' = p.vehicle_type),
    'eta_max', (SELECT (m ->> 'eta_max')::int FROM jsonb_array_elements(v_modes) m WHERE m ->> 'key' = p.vehicle_type)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.express_quote(p_pickup jsonb, p_dropoff jsonb, p_vehicle_type text DEFAULT NULL::text, p_coupon_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rate NUMERIC;
  v_wallet NUMERIC;
  v_modes JSONB := '[]'::jsonb;
  v_plat DOUBLE PRECISION := (p_pickup ->> 'latitude')::float8;
  v_plng DOUBLE PRECISION := (p_pickup ->> 'longitude')::float8;
  q RECORD;
  d RECORD;
  v_total NUMERIC;
BEGIN
  PERFORM set_config('cydex.missing_routes', '[]', true);
  SELECT COALESCE(service_charge_rate, 0.15) INTO v_rate FROM public.pricing_config ORDER BY created_at DESC LIMIT 1;
  SELECT COALESCE(available_balance, 0) INTO v_wallet FROM public.customer_wallet WHERE customer_id = auth.uid();
  v_wallet := COALESCE(v_wallet, 0);

  SELECT * INTO q FROM public.delivery_leg_quote(v_plat, v_plng, (p_dropoff ->> 'latitude')::float8,
                                                 (p_dropoff ->> 'longitude')::float8, p_vehicle_type, v_rate);
  IF q.status = 'no_location' THEN
    RETURN jsonb_build_object('status', 'no_location', 'wallet_balance', v_wallet);
  END IF;
  v_modes := public.delivery_modes(v_plat, v_plng, q.distance_km, 0);
  SELECT * INTO q FROM public.delivery_leg_quote(
    v_plat, v_plng, (p_dropoff ->> 'latitude')::float8, (p_dropoff ->> 'longitude')::float8,
    COALESCE(public.pick_delivery_mode(v_modes, COALESCE(p_vehicle_type, public.default_vehicle_type())), q.vehicle_type), v_rate);

  SELECT * INTO d FROM public.apply_promotion('express', auth.uid(), NULL, 0, q.delivery_fee, q.charge, q.distance_km, q.vehicle_type, p_coupon_code);
  v_total := GREATEST(q.total_amount - COALESCE(d.discount_amount, 0), 0);

  -- Legs priced by straight line, for the app to look up by road
  RETURN jsonb_build_object('missing_routes', public.missing_routes()) || jsonb_build_object(
    'status', q.status,
    'distance_km', q.distance_km,
    'vehicle_type', q.vehicle_type,
    'rate_per_km', q.rate_per_km,
    'base_rate', q.base_rate,
    'distance_fee', q.distance_fee,
    'delivery_fee', q.delivery_fee,
    'service_charge', q.charge,
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
  PERFORM set_config('cydex.missing_routes', '[]', true);
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

  -- Legs priced by straight line, for the app to look up by road
  RETURN jsonb_build_object('missing_routes', public.missing_routes()) || jsonb_build_object(
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
  PERFORM set_config('cydex.missing_routes', '[]', true);
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

  -- Legs priced by straight line, for the app to look up by road
  RETURN jsonb_build_object('missing_routes', public.missing_routes()) || jsonb_build_object(
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
