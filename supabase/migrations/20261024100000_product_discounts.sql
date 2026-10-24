-- Product discounts set by the vendor: a percentage or an amount off the price.
-- The discounted price is what customers pay: the cart total, the order and
-- the order items all use it. order_items.list_price keeps the price before
-- the discount, for receipts.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS discount_type TEXT,
  ADD COLUMN IF NOT EXISTS discount_value NUMERIC(12,2);

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_discount_check;
ALTER TABLE public.products ADD CONSTRAINT products_discount_check CHECK (
     (discount_type IS NULL AND discount_value IS NULL)
  OR (discount_type = 'percent' AND discount_value IS NOT NULL AND discount_value > 0 AND discount_value < 100)
  OR (discount_type = 'flat' AND discount_value IS NOT NULL AND discount_value > 0 AND discount_value < price)
);

ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS list_price NUMERIC(12,2);

-- The price a customer pays for one item
CREATE OR REPLACE FUNCTION public.product_sale_price(p_price NUMERIC, p_discount_type TEXT, p_discount_value NUMERIC)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT GREATEST(round(CASE p_discount_type
    WHEN 'percent' THEN COALESCE(p_price, 0) * (1 - COALESCE(p_discount_value, 0) / 100)
    WHEN 'flat' THEN COALESCE(p_price, 0) - COALESCE(p_discount_value, 0)
    ELSE COALESCE(p_price, 0) END, 2), 0);
$$;
GRANT EXECUTE ON FUNCTION public.product_sale_price(NUMERIC, TEXT, NUMERIC) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.cart_subtotal(p_vendor_id uuid, p_items jsonb)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total NUMERIC := 0;
  v_item JSONB;
  v_product public.products%ROWTYPE;
  v_quantity INTEGER;
BEGIN
  IF NOT public.vendor_can_trade(p_vendor_id) THEN
    RAISE EXCEPTION 'This vendor isn''t taking orders right now';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Your cart is empty';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_quantity := (v_item ->> 'quantity')::integer;
    IF v_quantity IS NULL OR v_quantity < 1 THEN
      RAISE EXCEPTION 'Each item needs a quantity of at least 1';
    END IF;

    SELECT * INTO v_product FROM public.products WHERE id = (v_item ->> 'product_id')::uuid;
    IF v_product.id IS NULL OR v_product.vendor_id IS DISTINCT FROM p_vendor_id THEN
      RAISE EXCEPTION 'An item in your cart is no longer sold by this vendor';
    END IF;
    IF v_product.status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION '% is not available right now', v_product.name;
    END IF;
    IF v_product.track_stock AND v_quantity > v_product.stock_quantity THEN
      RAISE EXCEPTION 'Only % of % left. Reduce the quantity in your cart.', v_product.stock_quantity, v_product.name;
    END IF;

    -- At the discounted price, if the vendor set a discount
    v_total := v_total + public.product_sale_price(v_product.price, v_product.discount_type, v_product.discount_value) * v_quantity;
  END LOOP;

  RETURN v_total;
END;
$function$;

CREATE OR REPLACE FUNCTION public.place_order(p_vendor_id uuid, p_address_id uuid, p_items jsonb, p_special_instructions text DEFAULT NULL::text, p_vehicle_type text DEFAULT NULL::text, p_coupon_code text DEFAULT NULL::text)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_customer UUID := auth.uid();
  v_subtotal NUMERIC;
  v_address public.addresses%ROWTYPE;
  v_phone TEXT;
  v_order public.orders%ROWTYPE;
  v_store JSONB := public.order_pickup_point(p_vendor_id, NULL);
  v_modes JSONB;
  v_mode TEXT;
  v_paid NUMERIC;
BEGIN
  IF v_customer IS NULL THEN
    RAISE EXCEPTION 'Log in to place an order';
  END IF;

  PERFORM public.lock_limited_promotions();
  v_subtotal := public.cart_subtotal(p_vendor_id, p_items);

  SELECT * INTO v_address FROM public.addresses WHERE id = p_address_id AND profile_id = v_customer;
  IF v_address.id IS NULL THEN
    RAISE EXCEPTION 'Choose one of your saved delivery addresses';
  END IF;
  SELECT phone INTO v_phone FROM public.profiles WHERE id = v_customer;

  -- Someone has to be free to deliver it
  v_modes := public.delivery_modes((v_store ->> 'latitude')::float8, (v_store ->> 'longitude')::float8,
    COALESCE((SELECT distance_km FROM public.calculate_order_price(p_vendor_id, p_address_id, 0, NULL)), 0), 0);
  IF jsonb_array_length(v_modes) > 0
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_modes) m WHERE (m ->> 'in_range')::boolean) THEN
    RAISE EXCEPTION 'This vendor is too far from your delivery address. The longest delivery we do is %.', public.km_text(public.max_trip_km());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_modes) m WHERE (m ->> 'available')::boolean) THEN
    RAISE EXCEPTION 'Our service is currently unavailable because all our riders are busy at the moment. Please check again later.';
  END IF;
  v_mode := COALESCE(NULLIF(trim(p_vehicle_type), ''), public.default_vehicle_type());
  IF p_vehicle_type IS NOT NULL
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_modes) m WHERE m ->> 'key' = v_mode AND NOT (m ->> 'in_range')::boolean) THEN
    RAISE EXCEPTION 'That delivery mode doesn''t go this far. Choose another delivery mode.';
  END IF;
  IF p_vehicle_type IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_modes) m WHERE m ->> 'key' = v_mode AND (m ->> 'available')::boolean) THEN
    RAISE EXCEPTION 'No rider with that delivery mode is free right now. Choose another delivery mode.';
  END IF;
  v_mode := public.pick_delivery_mode(v_modes, v_mode);

  INSERT INTO public.orders (
    customer_id, vendor_id, status, payment_status, delivery_type,
    delivery_address, delivery_address_id, subtotal, total_amount, special_instructions,
    preferred_vehicle_type, coupon_code
  ) VALUES (
    v_customer, p_vendor_id, 'pending', 'pending', 'standard',
    public.address_snapshot(v_address) || jsonb_build_object('phone', COALESCE(v_phone, '')),
    v_address.id, v_subtotal, v_subtotal, p_special_instructions,
    v_mode, NULLIF(trim(p_coupon_code), '')
  )
  RETURNING * INTO v_order;

  INSERT INTO public.order_items (
    order_id, product_id, product_name, product_description, product_category,
    quantity, unit_price, total_price, is_eco_friendly, carbon_impact, list_price
  )
  SELECT v_order.id, p.id, p.name, p.description, p.category,
         (i.value ->> 'quantity')::integer,
         public.product_sale_price(p.price, p.discount_type, p.discount_value),
         public.product_sale_price(p.price, p.discount_type, p.discount_value) * (i.value ->> 'quantity')::integer,
         p.is_eco_friendly, p.carbon_impact, p.price
  FROM jsonb_array_elements(p_items) i
  JOIN public.products p ON p.id = (i.value ->> 'product_id')::uuid;

  -- Wallet first; Squad takes the rest (squad-checkout charges total - wallet_amount)
  v_paid := public.pay_order_from_customer_wallet(v_order.id);
  IF v_paid >= v_order.total_amount THEN
    PERFORM set_config('cydex.order_flow', 'on', true);
    UPDATE public.orders
    SET payment_status = 'paid', payment_reference = 'WALLET-' || v_order.order_number, payment_gateway = 'wallet',
        payment_method = 'wallet'
    WHERE id = v_order.id;
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_order.id;
  RETURN v_order;
END;
$function$;
