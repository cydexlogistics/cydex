import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { changeColor, type PercentChange } from '@/lib/metricsPeriod';
import { cn } from '@/lib/utils';
import { hourLabel, METRIC_CONFIG, type MetricId } from './metricConfig';

export type { MetricId };


const BADGE_CLASSES = {
  green: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  red: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  grey: 'bg-muted text-muted-foreground',
};

export const ChangeBadge = ({ change, metric }: { change: PercentChange; metric: MetricId }) => {
  const color = changeColor(change.tone, METRIC_CONFIG[metric].invertColor);
  const Icon = change.tone === 'up' ? ArrowUp : change.tone === 'down' ? ArrowDown : null;
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums', BADGE_CLASSES[color])}>
      {Icon && <Icon className="h-3 w-3" aria-hidden />}
      {change.text}
    </span>
  );
};

export const MetricCard = ({
  label, value, hint, change, metric, icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  change: PercentChange;
  metric: MetricId;
  icon?: React.ElementType;
}) => (
  <Card>
    <CardContent className="flex h-full flex-col gap-1 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />}
          {label}
        </p>
        <ChangeBadge change={change} metric={metric} />
      </div>
      <p className="truncate text-xl font-bold tabular-nums sm:text-2xl">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </CardContent>
  </Card>
);

export const MetricCardSkeleton = () => (
  <Card>
    <CardContent className="space-y-2 p-4">
      <div className="flex justify-between"><Skeleton className="h-3 w-24" /><Skeleton className="h-4 w-14 rounded-full" /></div>
      <Skeleton className="h-7 w-20" />
      <Skeleton className="h-3 w-32" />
    </CardContent>
  </Card>
);

export const Section = ({ title, description, children }: { title: string; description?: React.ReactNode; children: React.ReactNode }) => (
  <section className="space-y-2">
    <div>
      <h2 className="text-base font-semibold sm:text-lg">{title}</h2>
      {description && <p className="text-xs text-muted-foreground sm:text-sm">{description}</p>}
    </div>
    {children}
  </section>
);

// ---------------------------------------------------------------------------
// Peak open times
// ---------------------------------------------------------------------------


export const PeakHoursChart = ({
  title, hourly, peakHour, change, metric,
}: {
  title: string;
  hourly: number[];
  peakHour: number | null;
  change: PercentChange;
  metric: MetricId;
}) => {
  const data = hourly.map((opens, hour) => ({ hour, label: hourLabel(hour), opens }));
  const total = hourly.reduce((a, b) => a + b, 0);
  return (
    <Card>
      <CardHeader className="space-y-1 p-4 pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm">{title}</CardTitle>
          <ChangeBadge change={change} metric={metric} />
        </div>
        <CardDescription className="text-xs">
          {peakHour == null
            ? 'Busiest hour: —'
            : <>Busiest hour: <span className="font-semibold text-foreground">{hourLabel(peakHour)}–{hourLabel((peakHour + 1) % 24)}</span> ({hourly[peakHour].toLocaleString()} opens)</>}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {total === 0 ? (
          <div className="flex h-36 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
            No app opens in this period
          </div>
        ) : (
          <ChartContainer config={{ opens: { label: 'Opens', color: '#6CE000' } }} className="h-36 w-full">
            <BarChart data={data} margin={{ left: 0, right: 4, top: 4 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="hour" tickLine={false} axisLine={false} fontSize={10} interval={0}
                tickFormatter={(h: number) => (h % 6 === 0 ? hourLabel(h) : '')} />
              <YAxis tickLine={false} axisLine={false} fontSize={10} width={28} allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, p) => {
                const h = p?.[0]?.payload?.hour as number | undefined;
                return h == null ? '' : `${hourLabel(h)}–${hourLabel((h + 1) % 24)}`;
              }} />} />
              <Bar dataKey="opens" radius={[3, 3, 0, 0]}>
                {data.map((d) => (
                  <Cell key={d.hour} fill={d.hour === peakHour ? '#6CE000' : 'hsl(var(--muted-foreground) / 0.35)'} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Fulfilment per vendor / rider
// ---------------------------------------------------------------------------

export interface FulfilmentRow { id: string; name: string; orders: number; completed: number; rate: number }

type SortKey = 'name' | 'orders' | 'completed' | 'rate';

export const FulfilmentTable = ({
  title, rows, completedLabel, emptyText,
}: {
  title: string;
  rows: FulfilmentRow[];
  completedLabel: string;
  emptyText: string;
}) => {
  const [open, setOpen] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'orders', dir: 'desc' });

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const d = sort.key === 'name' ? a.name.localeCompare(b.name) : a[sort.key] - b[sort.key];
      return sort.dir === 'asc' ? d : -d;
    });
    return copy;
  }, [rows, sort]);

  const toggle = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }));

  const Head = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => {
    const Icon = sort.key !== k ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
    return (
      <TableHead className={className} aria-sort={sort.key === k ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button type="button" onClick={() => toggle(k)} className="inline-flex items-center gap-1 font-medium hover:text-foreground">
          {children}<Icon className={cn('h-3 w-3', sort.key !== k && 'opacity-40')} aria-hidden />
        </button>
      </TableHead>
    );
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <button type="button" className="flex w-full items-center justify-between gap-2 p-4 text-left">
            <span className="text-sm font-semibold">
              {title} <span className="font-normal text-muted-foreground">({rows.length})</span>
            </span>
            <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')} aria-hidden />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t">
            {rows.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">{emptyText}</p>
            ) : (
              <div className="max-h-[28rem] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <Head k="name">Name</Head>
                      <Head k="orders" className="text-right">Orders</Head>
                      <Head k="completed" className="text-right">{completedLabel}</Head>
                      <Head k="rate" className="text-right">Rate</Head>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="max-w-[10rem] truncate sm:max-w-none">
                          <Link to={`/admin/users/${r.id}`} className="hover:underline">{r.name}</Link>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{r.orders.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.completed.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.rate.toFixed(2)}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};
