import { Loader2 } from 'lucide-react';

// Shown while useRiderSearch waits for a rider to come online
const FindingRiderNotice = () => (
  <div role="status" className="flex items-start gap-2 rounded-md border bg-muted p-3 text-sm">
    <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
    <div>
      <p className="font-medium">Looking for a rider near you…</p>
      <p className="text-muted-foreground">We’ve let our riders know an order is coming. This can take up to a minute.</p>
    </div>
  </div>
);

export default FindingRiderNotice;
