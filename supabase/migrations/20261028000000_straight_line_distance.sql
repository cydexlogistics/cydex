-- Back to straight-line distance for priced trips (road distance from
-- Google cost too much per lookup). Restores the functions changed by
-- 20261027100000_road_distance and removes its table and helpers. Orders
-- already placed keep the distance and price they were charged.

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

  v_distance_m := public.distance_m(v_store.latitude, v_store.longitude, v_dest.latitude, v_dest.longitude);
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
  v_m := public.distance_m(p_from_latitude, p_from_longitude, p_to_latitude, p_to_longitude);
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
 IMMUTABLE
AS $function$
DECLARE
  v_lat DOUBLE PRECISION := p_latitude;
  v_lng DOUBLE PRECISION := p_longitude;
  v_point JSONB;
  v_longest NUMERIC := 0;
BEGIN
  FOR v_point IN SELECT value FROM jsonb_array_elements(COALESCE(p_points, '[]'::jsonb)) LOOP
    CONTINUE WHEN (v_point ->> 'latitude') IS NULL OR (v_point ->> 'longitude') IS NULL;
    v_longest := GREATEST(v_longest, round((public.distance_m(v_lat, v_lng, (v_point ->> 'latitude')::float8,
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

  RETURN jsonb_build_object(
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

  RETURN jsonb_build_object(
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

DROP FUNCTION IF EXISTS public.trip_distance_m(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION);
DROP FUNCTION IF EXISTS public.note_missing_route(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION);
DROP FUNCTION IF EXISTS public.missing_routes();
DROP FUNCTION IF EXISTS public.save_route_distance(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, INTEGER, UUID);
DROP FUNCTION IF EXISTS public.route_lookups_since(UUID, TIMESTAMPTZ);
DROP TABLE IF EXISTS public.route_distances;
