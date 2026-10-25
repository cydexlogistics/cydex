// Looks up road distances for priced trips and stores them in route_distances.
// Called by a signed-in user's app when a quote lists legs priced by straight
// line ("missing_routes"); the app then fetches the quote again.
//   { pairs: [{ from: [lat, lng], to: [lat, lng] }, ...] } -> { filled, configured }
// If Google isn't set up, fails or is slow, nothing is stored and prices stay
// on the straight line.
// Secret: GOOGLE_ROUTES_API_KEY (a server key with only the Routes API enabled;
// not the website's Maps key, which is restricted to the site's addresses).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { adminClient, corsHeaders, json } from '../_shared/squad.ts';

const MAX_PAIRS = 10;
// Lookups one user can cause in an hour
const HOURLY_LIMIT = 150;
// Nobody delivers further than this; a longer pair is a mistake or abuse
const MAX_STRAIGHT_KM = 80;
const GOOGLE_TIMEOUT_MS = 6000;

type Point = [number, number];
interface Pair { from: Point; to: Point }

const inNigeria = ([lat, lng]: Point) => lat >= 4 && lat <= 14 && lng >= 2.5 && lng <= 15;
const straightKm = ([a, b]: Point, [c, d]: Point) => {
  const r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};
const isPoint = (p: unknown): p is Point =>
  Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number' && Number.isFinite(n));

// Google Routes API: driving distance without live traffic (the cheapest kind)
async function roadDistance(pair: Pair, key: string): Promise<{ meters: number; seconds: number | null } | null> {
  const point = ([latitude, longitude]: Point) => ({ location: { latLng: { latitude, longitude } } });
  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration',
    },
    body: JSON.stringify({
      origin: point(pair.from),
      destination: point(pair.to),
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_UNAWARE',
      units: 'METRIC',
    }),
    signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Routes API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const route = (await res.json()).routes?.[0];
  if (!route || typeof route.distanceMeters !== 'number') return null;
  const seconds = typeof route.duration === 'string' ? Math.round(parseFloat(route.duration)) : null;
  return { meters: route.distanceMeters, seconds };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Please sign in again' }, 401);

    const key = Deno.env.get('GOOGLE_ROUTES_API_KEY');
    if (!key) return json({ filled: 0, configured: false });

    const body = await req.json().catch(() => ({}));
    const pairs: Pair[] = (Array.isArray(body?.pairs) ? body.pairs : [])
      .filter((p: Pair) => isPoint(p?.from) && isPoint(p?.to) && inNigeria(p.from) && inNigeria(p.to)
        && straightKm(p.from, p.to) <= MAX_STRAIGHT_KM)
      .slice(0, MAX_PAIRS);
    if (pairs.length === 0) return json({ filled: 0, configured: true });

    const db = adminClient();
    const { data: recent } = await db.rpc('route_lookups_since', {
      p_user: user.id, p_since: new Date(Date.now() - 3600_000).toISOString(),
    });
    if (Number(recent ?? 0) + pairs.length > HOURLY_LIMIT) return json({ filled: 0, configured: true, limited: true });

    const results = await Promise.allSettled(pairs.map(async (pair) => {
      const road = await roadDistance(pair, key);
      if (!road) return false;
      const { error } = await db.rpc('save_route_distance', {
        p_from_lat: pair.from[0], p_from_lng: pair.from[1], p_to_lat: pair.to[0], p_to_lng: pair.to[1],
        p_distance_m: road.meters, p_duration_s: road.seconds, p_requested_by: user.id,
      });
      if (error) throw new Error(error.message);
      return true;
    }));
    results.filter((r) => r.status === 'rejected').forEach((r) => console.error((r as PromiseRejectedResult).reason));
    return json({ filled: results.filter((r) => r.status === 'fulfilled' && r.value).length, configured: true });
  } catch (e) {
    console.error(e);
    // The app keeps the straight-line price
    return json({ filled: 0, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
