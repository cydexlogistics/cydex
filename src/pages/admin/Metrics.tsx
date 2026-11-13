import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  AlertTriangle, BarChart3, Bike, CalendarRange, CheckCircle2, ChefHat, Moon, RotateCw, Store, Timer,
  UserMinus, Users,
} from 'lucide-react';
import AdminPage from '@/components/admin/AdminPage';
import PeriodFilter from '@/components/admin/PeriodFilter';
import {
  FulfilmentTable, MetricCard, MetricCardSkeleton, PeakHoursChart, Section, type FulfilmentRow, type MetricId,
} from '@/components/admin/metrics/MetricsParts';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_PERIOD, type Period } from '@/lib/adminPeriod';
import { formatDuration, metricsRanges, percentChange, type MetricsRanges } from '@/lib/metricsPeriod';

type Role = 'customer' | 'rider' | 'vendor';
const ROLES: { role: Role; label: string; plural: string; icon: React.ElementType }[] = [
  { role: 'customer', label: 'Customer', plural: 'Customers', icon: Users },
  { role: 'rider', label: 'Rider', plural: 'Riders', icon: Bike },
  { role: 'vendor', label: 'Vendor', plural: 'Vendors', icon: Store },
];

// Shape returned by public.admin_metrics (supabase/migrations/20261113000000_app_sessions_and_metrics.sql)
interface MetricsWindow {
  opens: Record<Role, number>;
  hourly: Record<Role, number[]>;
  peak: Record<Role, { hour: number; count: number } | null>;
  total_customers: number;
  dormant: Record<Role, number>;
  churn: Record<Role, { churned: number; base: number; rate: number }>;
  fulfilment: Record<'customer' | 'vendor' | 'rider', { orders: number; completed: number; rate: number | null }>;
  delivery_time: { seconds: number | null; orders: number };
  prep_time: { seconds: number | null; orders: number };
  active: Record<Role, { active: number; onboarded: number; rate: number | null }>;
}
interface MetricsResponse {
  current: MetricsWindow;
  previous: MetricsWindow | null;
  peak_comparison: Record<Role, { hour: number; current: number; previous: number | null } | null>;
  vendors: FulfilmentRow[];
  riders: FulfilmentRow[];
  tracking_since: string | null;
}

const n = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString());
const pct = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(2)}%`);
const plural = (count: number, one: string, many = `${one}s`) => `${count.toLocaleString()} ${count === 1 ? one : many}`;

// "Compared with yesterday" etc., from the preset and the comparison window
const comparisonText = (period: Period, ranges: MetricsRanges) => {
  if (!ranges.previous?.start) return 'All time: there is no earlier period to compare with, so changes show 0.00%.';
  const days = Math.round((Date.parse(ranges.previous.end) - Date.parse(ranges.previous.start)) / 86_400_000);
  const what = {
    today: 'yesterday',
    last_month: 'the month before',
    this_month: 'all of last month',
  }[period.preset as string] ?? `the ${days} days before`;
  return `Changes compare with ${what}, in full (not scaled to how much of this period has passed). Nigerian time.`;
};

const Metrics = () => {
  const [period, setPeriod] = useState<Period>(DEFAULT_PERIOD);
  const ranges = metricsRanges(period);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['admin-metrics', ranges?.current.start, ranges?.current.end],
    enabled: !!ranges,
    placeholderData: (previous) => previous,
    staleTime: 60_000,
    queryFn: async () => {
      const r = ranges!;
      const { data, error } = await supabase.rpc('admin_metrics', {
        p_end: r.current.end,
        p_start: r.current.start ?? undefined,
        p_prev_start: r.previous?.start ?? undefined,
        p_prev_end: r.previous?.end ?? undefined,
        p_prior_start: r.prior?.start ?? undefined,
        p_prior_end: r.prior?.end ?? undefined,
      });
      if (error) throw error;
      return data as unknown as MetricsResponse;
    },
  });

  const hasComparison = !!ranges?.previous;
  const cur = data?.current;
  const prev = data?.previous ?? null;
  const change = (c: number | null | undefined, p: number | null | undefined) => percentChange(c, p, hasComparison);

  return (
    <AdminPage
      title="Metrics"
      icon={BarChart3}
      description={ranges ? comparisonText(period, ranges) : 'Pick a start and end date.'}
      actions={<PeriodFilter value={period} onChange={setPeriod} />}
    >
      {!ranges ? (
        <EmptyState icon={CalendarRange} title="Pick a date range" text="Choose both a start and an end date to see metrics for a custom range." />
      ) : isError ? (
        <Card className="border-destructive/40">
          <CardContent className="flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div>
                <p className="font-medium">Couldn't load metrics</p>
                <p className="text-sm text-muted-foreground">{(error as Error)?.message ?? 'Something went wrong.'}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RotateCw className="mr-1.5 h-4 w-4" /> Retry
            </Button>
          </CardContent>
        </Card>
      ) : isLoading || !cur || !data ? (
        <LoadingState />
      ) : (
        <div className={isFetching ? 'space-y-6 opacity-70 transition-opacity' : 'space-y-6'}>
          {/* 1-2. App opens and customers */}
          <Section
            title="App opens"
            description={data.tracking_since
              ? `Each time a signed-in user opens the app (a gap of 30+ minutes starts a new open). Tracked since ${format(new Date(data.tracking_since), 'd MMM yyyy')}.`
              : 'App opens are tracked from now on. Nothing has been recorded yet, so open-based figures are 0 until users open the app.'}
          >
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {ROLES.map(({ role, plural: label, icon }) => (
                <MetricCard key={role} metric={`opens_${role}` as MetricId} label={`${label.slice(0, -1)} opens`} icon={icon}
                  value={n(cur.opens[role])} change={change(cur.opens[role], prev?.opens[role])} />
              ))}
              <MetricCard metric="total_customers" label="Total customers" icon={Users} value={n(cur.total_customers)}
                hint="Registered, not suspended, as at the end of the period"
                change={change(cur.total_customers, prev?.total_customers)} />
            </div>
          </Section>

          {/* 3. Peak open times */}
          <Section title="Peak open times" description="Opens by hour of the day (Nigerian time). The badge compares opens in the busiest hour with the same hour last period.">
            <div className="grid gap-3 md:grid-cols-3">
              {ROLES.map(({ role, plural: label }) => {
                const peak = data.peak_comparison?.[role] ?? null;
                return (
                  <PeakHoursChart key={role} metric={`peak_${role}` as MetricId} title={label}
                    hourly={cur.hourly[role]} peakHour={cur.peak[role]?.hour ?? null}
                    change={change(peak?.current ?? null, peak?.previous ?? null)} />
                );
              })}
            </div>
          </Section>

          {/* 9-11. Active vs onboarded */}
          <Section title="Active vs onboarded" description="Active in the period, out of those onboarded as at the end of it. The badge compares the active count.">
            <div className="grid gap-3 sm:grid-cols-3">
              <ActiveCard metric="active_vendor" label="Active vendors" icon={Store} hint="Accepted at least 1 order. Onboarded: verified or approved to trade."
                a={cur.active.vendor} change={change(cur.active.vendor.active, prev?.active.vendor.active)} />
              <ActiveCard metric="active_rider" label="Active riders" icon={Bike} hint="Accepted or delivered at least 1 order. Onboarded: verified."
                a={cur.active.rider} change={change(cur.active.rider.active, prev?.active.rider.active)} />
              <ActiveCard metric="active_customer" label="Active customers" icon={Users} hint="At least 1 paid order. Onboarded: registered customers."
                a={cur.active.customer} change={change(cur.active.customer.active, prev?.active.customer.active)} />
            </div>
          </Section>

          {/* 4-5. Dormant and churn */}
          <Section title="Retention" description="Dormant: onboarded over 14 days ago with no app open in the last 14 days of the period. Churn: active last period but not this one.">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              {ROLES.map(({ role, plural: label }) => (
                <MetricCard key={role} metric={`dormant_${role}` as MetricId} label={`Dormant ${label.toLowerCase()}`} icon={Moon}
                  value={n(cur.dormant[role])} change={change(cur.dormant[role], prev?.dormant[role])} />
              ))}
              {ROLES.map(({ role, plural: label }) => {
                const c = cur.churn[role];
                return (
                  <MetricCard key={role} metric={`churn_${role}` as MetricId} label={`${label.slice(0, -1)} churn`} icon={UserMinus}
                    value={pct(c.rate)}
                    hint={hasComparison ? `${c.churned.toLocaleString()} of ${plural(c.base, 'active ' + label.slice(0, -1).toLowerCase())} last period` : 'No earlier period'}
                    change={change(c.rate, prev?.churn[role].rate)} />
                );
              })}
            </div>
          </Section>

          {/* 6. Fulfilment */}
          <Section title="Order fulfilment" description="Delivered, out of the orders in each group.">
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard metric="fulfilment_customer" label="Customer side" icon={CheckCircle2} value={pct(cur.fulfilment.customer.rate)}
                hint={`${cur.fulfilment.customer.completed.toLocaleString()} completed of ${plural(cur.fulfilment.customer.orders, 'paid order')} placed`}
                change={change(cur.fulfilment.customer.rate, prev?.fulfilment.customer.rate)} />
              <MetricCard metric="fulfilment_vendor" label="Vendor side" icon={Store} value={pct(cur.fulfilment.vendor.rate)}
                hint={`${cur.fulfilment.vendor.completed.toLocaleString()} completed of ${plural(cur.fulfilment.vendor.orders, 'order')} accepted`}
                change={change(cur.fulfilment.vendor.rate, prev?.fulfilment.vendor.rate)} />
              <MetricCard metric="fulfilment_rider" label="Rider side" icon={Bike} value={pct(cur.fulfilment.rider.rate)}
                hint={`${cur.fulfilment.rider.completed.toLocaleString()} delivered of ${plural(cur.fulfilment.rider.orders, 'order')} accepted`}
                change={change(cur.fulfilment.rider.rate, prev?.fulfilment.rider.rate)} />
            </div>
            <div className="space-y-3">
              <FulfilmentTable title="By vendor" rows={data.vendors} completedLabel="Completed"
                emptyText="No vendor accepted an order in this period." />
              <FulfilmentTable title="By rider" rows={data.riders} completedLabel="Delivered"
                emptyText="No rider accepted an order in this period." />
            </div>
          </Section>

          {/* 7-8. Times */}
          <Section title="Speed">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <MetricCard metric="delivery_time" label="Average delivery time" icon={Timer} value={formatDuration(cur.delivery_time.seconds)}
                hint={cur.delivery_time.orders > 0
                  ? `Rider accepted → delivered, over ${plural(cur.delivery_time.orders, 'delivered order')}`
                  : 'No orders delivered in this period'}
                change={change(cur.delivery_time.seconds, prev?.delivery_time.seconds)} />
              <MetricCard metric="prep_time" label="Average preparation time" icon={ChefHat} value={formatDuration(cur.prep_time.seconds)}
                hint={cur.prep_time.orders > 0
                  ? `Vendor accepted → ready, over ${plural(cur.prep_time.orders, 'order')}`
                  : 'No orders marked ready in this period'}
                change={change(cur.prep_time.seconds, prev?.prep_time.seconds)} />
            </div>
          </Section>
        </div>
      )}
    </AdminPage>
  );
};

// "X of Y (Z%)"
const ActiveCard = ({
  metric, label, icon, hint, a, change,
}: {
  metric: MetricId;
  label: string;
  icon: React.ElementType;
  hint: string;
  a: { active: number; onboarded: number; rate: number | null };
  change: ReturnType<typeof percentChange>;
}) => (
  <MetricCard metric={metric} label={label} icon={icon} hint={hint} change={change}
    value={<>{a.active.toLocaleString()} <span className="text-base font-medium text-muted-foreground">of {a.onboarded.toLocaleString()} ({pct(a.rate)})</span></>} />
);

const EmptyState = ({ icon: Icon, title, text }: { icon: React.ElementType; title: string; text: string }) => (
  <Card>
    <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
      <Icon className="h-8 w-8 text-muted-foreground" />
      <p className="font-medium">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{text}</p>
    </CardContent>
  </Card>
);

const LoadingState = () => (
  <div className="space-y-6" aria-busy="true" aria-label="Loading metrics">
    {[4, 3, 3, 6].map((count, i) => (
      <div key={i} className="space-y-2">
        <Skeleton className="h-5 w-40" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: count }, (_, j) => <MetricCardSkeleton key={j} />)}
        </div>
      </div>
    ))}
    <div className="grid gap-3 md:grid-cols-3">
      {[0, 1, 2].map((i) => <Skeleton key={i} className="h-52 w-full" />)}
    </div>
  </div>
);

export default Metrics;
