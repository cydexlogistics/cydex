-- Virtual accounts are now created by the squad-virtual-account Edge Function
-- (with the Squad secret key, on the server), which saves them with the
-- service role. The app no longer writes them, so users can't either: they
-- can only read their own.
DROP POLICY IF EXISTS "users can create own virtual account" ON public.virtual_accounts;
