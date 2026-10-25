import { supabase } from '@/integrations/supabase/client';

// Delivery fees use the distance by road (docs/ORDER_FLOW.md → Delivery fee).
// A quote lists any legs still priced by straight line ("missing_routes"):
// we ask the route-distances function to look them up once, then fetch the
// quote again. If that fails, the straight-line price stands.

type Leg = { from: [number, number]; to: [number, number] };

// Legs already asked about in this session, so a failure isn't retried on every refresh
const asked = new Set<string>();
const legKey = (l: Leg) => `${l.from.join(',')}>${l.to.join(',')}`;

export const withRoadDistances = async <T>(fetchQuote: () => Promise<T>): Promise<T> => {
  const quote = await fetchQuote();
  const missing = ((quote as { missing_routes?: Leg[] } | null)?.missing_routes ?? []).filter((l) => !asked.has(legKey(l)));
  if (missing.length === 0) return quote;
  missing.forEach((l) => asked.add(legKey(l)));
  try {
    const { data, error } = await supabase.functions.invoke('route-distances', { body: { pairs: missing } });
    if (error || !(data as { filled?: number } | null)?.filled) return quote;
  } catch {
    return quote;
  }
  return fetchQuote();
};
