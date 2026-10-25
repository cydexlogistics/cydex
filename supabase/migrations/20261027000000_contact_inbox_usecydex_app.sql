-- The website's contact messages now go to hello@usecydex.app (the domain
-- is usecydex.app). app_config.contact_inbox still overrides it if set.
CREATE OR REPLACE FUNCTION public.contact_inbox()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT NULLIF(value, '') FROM public.app_config WHERE key = 'contact_inbox'), 'hello@usecydex.app');
$$;
