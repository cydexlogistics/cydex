-- "Incoming order": when a customer at checkout (or Cydex Express) or a vendor
-- requesting a rider finds no rider free, the app calls call_riders_online()
-- before showing "all our riders are busy". Every verified rider who isn't
-- online gets a notification (and push) asking them to go online, then the
-- app waits a minute for one to come online before giving up.
--
-- Each rider gets at most one of these every 10 minutes, however many people
-- are checking out, so they aren't flooded.

CREATE OR REPLACE FUNCTION public.call_riders_online()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rider UUID;
  v_count INTEGER := 0;
BEGIN
  -- Only customers and vendors placing an order
  IF NOT EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.id = auth.uid() AND lower(p.role) IN ('customer', 'vendor')
                   AND COALESCE(p.status, 'active') <> 'suspended') THEN
    RETURN 0;
  END IF;

  FOR v_rider IN
    SELECT rp.id
    FROM public.rider_profiles rp
    JOIN public.profiles p ON p.id = rp.id
    WHERE public.is_verified_rider(rp.id)
      AND COALESCE(p.status, 'active') <> 'suspended'
      -- Riders already online count as available, or are too far away
      AND COALESCE(rp.rider_status, 'offline') <> 'available'
      AND NOT EXISTS (SELECT 1 FROM public.notifications n
                      WHERE n.user_id = rp.id AND n.type = 'incoming_order'
                        AND n.created_at > now() - interval '10 minutes')
  LOOP
    PERFORM public.notify_user(v_rider, 'incoming_order', 'Incoming order',
      'Someone is about to place an order and no rider is free near them. Go online in Cydex now to take it.');
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.call_riders_online() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.call_riders_online() TO authenticated;
