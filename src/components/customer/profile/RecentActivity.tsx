import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Bell } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ICONS } from '@/components/notifications/NotificationsPage';
import { useNotificationsPage } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';

const SHOWN = 5;

// The customer's latest updates (orders, payments, refunds, offers), from
// their notifications. Tapping one opens its order.
const RecentActivity = () => {
  const navigate = useNavigate();
  const { notifications, isLoading } = useNotificationsPage(1);
  const latest = notifications.slice(0, SHOWN);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Your latest orders, payments and updates</CardDescription>
        </div>
        {latest.length > 0 && (
          <Link to="/customer/notifications" className="shrink-0 text-sm font-medium text-primary hover:underline">View all</Link>
        )}
      </CardHeader>
      <CardContent className="space-y-1">
        {isLoading ? (
          [0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded bg-muted" />)
        ) : latest.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No activity yet. Your orders and payments will show here.</p>
        ) : (
          latest.map((n) => {
            const Icon = ICONS[n.type] ?? Bell;
            const orderId = n.metadata?.order_id;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => orderId && navigate(`/customer/orders/${orderId}`)}
                className={cn('flex w-full items-start gap-3 rounded-md p-2 text-left', orderId ? 'hover:bg-muted' : 'cursor-default')}
              >
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{n.title}</p>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{n.message}</p>
                  <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</p>
                </div>
              </button>
            );
          })
        )}
      </CardContent>
    </Card>
  );
};

export default RecentActivity;
