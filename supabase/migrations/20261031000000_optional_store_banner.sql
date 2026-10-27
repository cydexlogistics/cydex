-- Store banner and product images are optional.
--   * Vendor onboarding only needs the logo; stores without a banner show a
--     plain grey background.
--   * Products without an image show their vendor's business category icon,
--     so customers need each vendor's business category (vendor_business_categories).

CREATE OR REPLACE FUNCTION public.submit_vendor_onboarding(p_store_name text, p_phone text, p_category_id uuid, p_is_registered boolean, p_license_path text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_prev public.verifications%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_status TEXT;
BEGIN
  IF public.current_user_role() IS DISTINCT FROM 'vendor' THEN
    RAISE EXCEPTION 'Only vendors can submit vendor onboarding';
  END IF;
  SELECT * INTO v_prev FROM public.verifications WHERE profile_id = v_uid FOR UPDATE;
  IF v_prev.status = 'suspended' THEN
    RAISE EXCEPTION 'Your account is suspended';
  END IF;

  IF NULLIF(trim(p_store_name), '') IS NULL THEN
    RAISE EXCEPTION 'Enter your store name';
  END IF;
  IF NOT public.is_valid_phone(p_phone) THEN
    RAISE EXCEPTION 'Enter a valid phone number';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.business_categories WHERE id = p_category_id AND is_active) THEN
    RAISE EXCEPTION 'Choose a business category';
  END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid;
  IF NULLIF(v_profile.avatar, '') IS NULL THEN
    RAISE EXCEPTION 'Upload your store logo';
  END IF;
  IF p_is_registered AND NULLIF(p_license_path, '') IS NULL THEN
    RAISE EXCEPTION 'Upload your business licence';
  END IF;
  IF p_is_registered AND split_part(p_license_path, '/', 1) <> v_uid::text THEN
    RAISE EXCEPTION 'Upload your business licence again';
  END IF;

  UPDATE public.profiles SET name = trim(p_store_name), phone = trim(p_phone) WHERE id = v_uid;

  v_status := CASE WHEN p_is_registered THEN 'pending' ELSE 'unverified' END;

  INSERT INTO public.verifications (
    profile_id, role, status, access_while_pending, business_category_id, is_registered_business,
    business_license_path, rejection_reason, submitted_at, updated_at
  ) VALUES (
    v_uid, 'vendor', v_status, false, p_category_id, p_is_registered,
    CASE WHEN p_is_registered THEN p_license_path END, NULL, now(), now()
  )
  ON CONFLICT (profile_id) DO UPDATE SET
    status = EXCLUDED.status,
    -- already trading as unverified: keep trading while the licence is reviewed
    access_while_pending = (EXCLUDED.status = 'pending' AND verifications.status = 'unverified')
                           OR (EXCLUDED.status = 'pending' AND verifications.access_while_pending),
    business_category_id = EXCLUDED.business_category_id,
    is_registered_business = EXCLUDED.is_registered_business,
    business_license_path = EXCLUDED.business_license_path,
    rejection_reason = NULL,
    submitted_at = now(),
    updated_at = now();

  IF v_status = 'pending' THEN
    PERFORM public.queue_email(v_uid, 'verification_submitted', 'We''ve received your Cydex store details',
      jsonb_build_object('role', 'vendor'));
    PERFORM public.notify_admins('verification_request', 'Vendor to verify',
      trim(p_store_name) || ' submitted their business licence for verification.');
  END IF;
  RETURN v_status;
END;
$function$;

-- Each vendor's business category name (e.g. Restaurant, Shop), for the
-- placeholder on products without an image
CREATE OR REPLACE FUNCTION public.vendor_business_categories(p_vendor_ids UUID[])
RETURNS TABLE (vendor_id UUID, category TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.id, bc.name
  FROM unnest(p_vendor_ids) AS v(id)
  LEFT JOIN public.verifications ver ON ver.profile_id = v.id AND ver.role = 'vendor'
  LEFT JOIN public.business_categories bc ON bc.id = ver.business_category_id;
$$;

REVOKE EXECUTE ON FUNCTION public.vendor_business_categories(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_business_categories(UUID[]) TO authenticated;
