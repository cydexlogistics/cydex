-- New-order alerts (in the app and as push notifications) now also reach
-- riders who are offline or on a break, not just those online:
--   * online riders: as before, from their live location;
--   * offline riders: from where they last were (if in the past 7 days),
--     otherwise their saved address, with "Go online in Cydex to accept it",
--     and at most one alert every 10 minutes so they aren't flooded.
-- Same rules otherwise: verified riders, not on a delivery, within their
-- vehicle type's alert distance, and a vehicle that covers the trip.

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
    WITH riders AS (
      SELECT rp.id, rp.rider_status = 'available' AS online,
             COALESCE(rp.vehicle_type, public.default_vehicle_type()) AS vehicle,
             -- Online: their live location. Offline: where they last were (past 7
             -- days), otherwise their saved address.
             CASE WHEN rp.current_location ? 'latitude' AND rp.current_location ? 'longitude'
                       AND (rp.rider_status = 'available'
                            OR (rp.current_location ->> 'updated_at')::timestamptz > now() - interval '7 days')
                  THEN (rp.current_location ->> 'latitude')::float8 END AS lat,
             CASE WHEN rp.current_location ? 'latitude' AND rp.current_location ? 'longitude'
                       AND (rp.rider_status = 'available'
                            OR (rp.current_location ->> 'updated_at')::timestamptz > now() - interval '7 days')
                  THEN (rp.current_location ->> 'longitude')::float8 END AS lng,
             home.latitude AS home_lat, home.longitude AS home_lng
      FROM public.rider_profiles rp
      LEFT JOIN LATERAL (
        SELECT a.latitude, a.longitude FROM public.addresses a
        WHERE a.profile_id = rp.id AND a.latitude IS NOT NULL AND a.longitude IS NOT NULL
        ORDER BY a.is_default DESC, a.created_at DESC LIMIT 1
      ) home ON true
      -- Online, or offline / on a break (not on a delivery)
      WHERE rp.rider_status IN ('available', 'offline', 'break')
        AND public.is_verified_rider(rp.id)
        AND NOT EXISTS (SELECT 1 FROM public.orders a
                        WHERE a.rider_id = rp.id AND a.status = ANY (public.rider_active_statuses()))
    ), placed AS (
      SELECT r.id, r.online, r.vehicle, r.lat IS NULL AS from_home,
             public.distance_m(COALESCE(r.lat, r.home_lat), COALESCE(r.lng, r.home_lng), v_lat, v_lng) AS meters
      FROM riders r
      WHERE COALESCE(r.lat, r.home_lat) IS NOT NULL AND COALESCE(r.lng, r.home_lng) IS NOT NULL
    )
    SELECT p.id, p.online, p.from_home, p.meters
    FROM placed p
    -- Each vehicle type's alert distance (Admin -> Riders & vehicles)
    WHERE p.meters <= COALESCE((SELECT t.alert_orders_km * 1000 FROM public.vehicle_types t WHERE t.key = p.vehicle),
                               public.rider_order_radius_m())
      -- Only riders whose vehicle covers the trip
      AND v_trip <= COALESCE((SELECT t.max_distance_km FROM public.vehicle_types t WHERE t.key = p.vehicle), 5)
      AND CASE
            WHEN o.preferred_vehicle_type IS NULL THEN NOT p_other_modes
            WHEN p_other_modes THEN p.vehicle <> o.preferred_vehicle_type
            ELSE o.mode_widened_at IS NOT NULL OR p.vehicle = o.preferred_vehicle_type
          END
      -- Offline riders get at most one alert every 10 minutes
      AND (p.online OR NOT EXISTS (
            SELECT 1 FROM public.notifications n
            WHERE n.user_id = p.id AND n.type = 'order_nearby' AND n.created_at > now() - interval '10 minutes'))
  LOOP
    PERFORM public.notify_user(v_rider.id, 'order_nearby',
      CASE WHEN v_rider.online THEN 'Order nearby' ELSE 'Orders waiting near you' END,
      CASE WHEN o.batch_id IS NOT NULL
        THEN 'A batch of ' || v_stops || ' deliveries is ready for pickup '
        ELSE 'Order #' || o.order_number || ' is ready for pickup ' END
      || round((v_rider.meters / 1000)::numeric, 1) || ' km from '
      || CASE WHEN v_rider.online THEN 'you.'
              WHEN v_rider.from_home THEN 'your address. Go online in Cydex to accept it.'
              ELSE 'where you last were. Go online in Cydex to accept it.' END, o);
  END LOOP;
END;
$function$;
