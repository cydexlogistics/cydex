-- Withdrawals can be paid by hand while Squad hasn't enabled bank transfers
-- (payouts) for Cydex's account. Admin -> Money -> Withdrawals has a switch:
--   * manual (default): the admin sends the money from Cydex's bank account,
--     then marks the withdrawal paid (admin_mark_payout_paid), with the
--     transfer reference if they have it. Squad transfers are refused.
--   * squad: Approve sends it through Squad, as before.

-- 'manual' or 'squad'
CREATE OR REPLACE FUNCTION public.payout_method()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT NULLIF(value, '') FROM public.app_config WHERE key = 'payout_method'), 'manual');
$$;
GRANT EXECUTE ON FUNCTION public.payout_method() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_set_payout_method(p_method TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old TEXT := public.payout_method();
BEGIN
  PERFORM public.require_admin();
  IF p_method NOT IN ('manual', 'squad') THEN
    RAISE EXCEPTION 'Choose manual or Squad';
  END IF;
  INSERT INTO public.app_config (key, value) VALUES ('payout_method', p_method)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  PERFORM public.log_admin_action('set_payout_method', 'setting', 'payout_method',
    jsonb_build_object('method', v_old), jsonb_build_object('method', p_method));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_payout_method(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_payout_method(TEXT) TO authenticated;

-- The admin has sent the money themselves: mark the withdrawal paid
-- (the person is told it's been sent to their bank account)
CREATE OR REPLACE FUNCTION public.admin_mark_payout_paid(p_role TEXT, p_id UUID, p_reference TEXT DEFAULT NULL, p_note TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_ref TEXT := NULLIF(trim(p_reference), '');
  v_note TEXT := NULLIF(trim(p_note), '');
BEGIN
  PERFORM public.require_admin();
  IF length(COALESCE(v_ref, '')) > 100 OR length(COALESCE(v_note, '')) > 500 THEN
    RAISE EXCEPTION 'Keep the reference under 100 characters and the note under 500';
  END IF;
  SELECT status INTO v_status FROM (
    SELECT status FROM public.vendor_payout_requests WHERE p_role = 'vendor' AND id = p_id
    UNION ALL SELECT status FROM public.rider_payout_requests WHERE p_role = 'rider' AND id = p_id
    UNION ALL SELECT status FROM public.customer_withdrawal_requests WHERE p_role = 'customer' AND id = p_id
  ) x;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Withdrawal not found';
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'Only withdrawals waiting for approval can be marked paid';
  END IF;
  PERFORM public.settle_payout(p_role, p_id, 'completed', 'MANUAL-' || COALESCE(v_ref, upper(substr(replace(p_id::text, '-', ''), 1, 10))),
    jsonb_build_object('manual', true, 'paid_by', auth.uid(), 'bank_reference', v_ref, 'note', v_note, 'paid_at', now()), NULL);
  PERFORM public.log_admin_action('mark_payout_paid', p_role || '_payout', p_id::text, NULL,
    jsonb_build_object('reference', v_ref, 'note', v_note));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_mark_payout_paid(TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_mark_payout_paid(TEXT, UUID, TEXT, TEXT) TO authenticated;
