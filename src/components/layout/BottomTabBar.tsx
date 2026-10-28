import { Link, useLocation } from 'react-router-dom';
import { Boxes, Bike, Home, MoreHorizontal, Package, Trophy, User, Wallet, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isStandalone } from '@/lib/pwa';
import { useRiderAvailableCount, useVendorNewOrderCount } from '@/hooks/useTabBarBadges';
import { useSupportUnread } from '@/hooks/useSupport';

type TabRole = 'CUSTOMER' | 'VENDOR' | 'RIDER';

interface Tab {
  label: string;
  href: string;
  icon: React.ElementType;
  /** Other pages that belong to this tab (prefixes) */
  also?: string[];
  badge?: 'vendor-new-orders' | 'rider-available';
}

const TABS: Record<TabRole, Tab[]> = {
  CUSTOMER: [
    { label: 'Home', href: '/customer', icon: Home, also: ['/customer/new-order', '/customer/products'] },
    { label: 'Orders', href: '/customer/orders', icon: Package, also: ['/customer/order-confirmation'] },
    { label: 'Cydex Express', href: '/customer/express', icon: Zap },
    { label: 'Rewards', href: '/customer/rewards', icon: Trophy },
  ],
  VENDOR: [
    { label: 'Dashboard', href: '/vendor', icon: Home },
    { label: 'Orders', href: '/vendor/orders', icon: Package, also: ['/vendor/process-order'], badge: 'vendor-new-orders' },
    { label: 'Products', href: '/vendor/products', icon: Boxes, also: ['/vendor/add-product', '/vendor/edit-product'] },
    { label: 'Request a rider', href: '/vendor/rider-requests', icon: Bike },
  ],
  RIDER: [
    { label: 'Dashboard', href: '/rider', icon: Home },
    { label: 'Available orders', href: '/rider/available', icon: Package, badge: 'rider-available' },
    { label: 'Earnings', href: '/rider/earnings', icon: Wallet },
    { label: 'Profile', href: '/rider/profile', icon: User },
  ],
};

const matches = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);
// A role's home tab only matches itself; the others also match their sub-pages
const isActive = (tab: Tab, path: string) =>
  (tab.href.split('/').length === 2 ? path === tab.href : matches(path, tab.href)) ||
  (tab.also ?? []).some((p) => matches(path, p));

// Customers, vendors and riders get the bar in the installed app (phones and
// tablets); the website keeps the menu button instead
export const showsBottomTabBar = (userRole: string): userRole is TabRole =>
  userRole in TABS && isStandalone();

const Badge = ({ count }: { count: number }) =>
  count > 0 ? (
    <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white">
      {count > 9 ? '9+' : count}
    </span>
  ) : null;

// Icons only; the page you're on is green. Pages not on the bar light up More,
// which opens the side menu.
const BottomTabBar = ({ userRole, onMore }: { userRole: TabRole; onMore: () => void }) => {
  const { pathname } = useLocation();
  const vendorNewOrders = useVendorNewOrderCount(userRole === 'VENDOR');
  const riderAvailable = useRiderAvailableCount(userRole === 'RIDER');
  const counts = { 'vendor-new-orders': vendorNewOrders, 'rider-available': riderAvailable };
  // Support is in the side menu: replies waiting show on More
  const supportUnread = useSupportUnread();

  const tabs = TABS[userRole];
  const onBar = tabs.some((t) => isActive(t, pathname));
  const item = (active: boolean) =>
    cn(
      'relative flex h-full flex-col items-center justify-center transition-colors',
      active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
    );

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden"
    >
      <div className="grid h-16 grid-cols-5">
        {tabs.map((tab) => {
          const active = isActive(tab, pathname);
          return (
            <Link key={tab.href} to={tab.href} aria-label={tab.label} title={tab.label} aria-current={active ? 'page' : undefined} className={item(active)}>
              <span className="relative">
                <tab.icon className="h-6 w-6" strokeWidth={active ? 2.4 : 2} />
                {tab.badge && <Badge count={counts[tab.badge]} />}
              </span>
            </Link>
          );
        })}
        <button type="button" onClick={onMore} aria-label="More" title="More" aria-current={onBar ? undefined : 'page'} className={item(!onBar)}>
          <span className="relative">
            <MoreHorizontal className="h-6 w-6" strokeWidth={onBar ? 2 : 2.4} />
            <Badge count={supportUnread} />
          </span>
        </button>
      </div>
    </nav>
  );
};

export default BottomTabBar;
