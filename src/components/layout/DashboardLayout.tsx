
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { cn } from '@/lib/utils';
import Sidebar from './Sidebar';
import MobileMenu from './MobileMenu';
import MobileHeader from './MobileHeader';
import { getNavLinks, getRoleTitle } from './navigationLinks';
import { UserRole } from '@/types/auth.types';
import AddressOnboarding from '@/components/address/AddressOnboarding';
import DeliveryAddressBar from '@/components/customer/address/DeliveryAddressBar';
import RiderLocationBar from '@/components/rider/location/RiderLocationBar';
import RiderLocationGate from '@/components/rider/location/RiderLocationGate';
import { useNotificationsRealtime } from '@/hooks/useNotifications';
import RiderRatingPrompt from '@/components/customer/ratings/RiderRatingPrompt';
import PushPrompt from '@/components/notifications/PushPrompt';
import BottomTabBar, { showsBottomTabBar } from './BottomTabBar';

interface DashboardLayoutProps {
  children: React.ReactNode;
  userRole: UserRole;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, userRole }) => {
  const { user, logout, loading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  useNotificationsRealtime();

  // Memoize navigation links to prevent recreation on every render
  const navLinks = useMemo(() => getNavLinks(userRole), [userRole]);
  const userRoleTitle = useMemo(() => getRoleTitle(userRole), [userRole]);
  
  // Memoize handlers to prevent recreation on every render
  const handleLogout = useMemo(() => () => {
    logout();
    navigate('/auth');
  }, [logout, navigate]);

  const handleMenuToggle = useMemo(() => () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  }, [isMobileMenuOpen]);

  const handleMobileMenuClose = useMemo(() => () => {
    setIsMobileMenuOpen(false);
  }, []);

  // Installed app (customers, vendors, riders): bottom tab bar instead of the
  // menu button. The class sets --bottom-nav (index.css) so page content,
  // floating buttons and toasts sit above the bar.
  const hasTabBar = showsBottomTabBar(userRole);
  useEffect(() => {
    document.documentElement.classList.toggle('has-bottom-nav', hasTabBar);
    return () => document.documentElement.classList.remove('has-bottom-nav');
  }, [hasTabBar]);

  // Show loading state while auth is being determined
  if (loading) {
    console.log('DashboardLayout: Showing loading state');
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect to auth if not authenticated
  if (!isAuthenticated) {
    console.log('DashboardLayout: Not authenticated, redirecting to auth');
    navigate('/auth');
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar for larger screens */}
      <Sidebar 
        navLinks={navLinks}
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        user={user}
        handleLogout={handleLogout}
        userRole={userRole}
      />

      {/* Mobile Header */}
      <MobileHeader 
        onMenuToggle={handleMenuToggle}
        user={user}
        userRole={userRole}
        handleLogout={handleLogout}
        hideMenuButton={hasTabBar}
      />

      {/* Mobile Menu */}
      <MobileMenu 
        isOpen={isMobileMenuOpen}
        onClose={handleMobileMenuClose}
        navLinks={navLinks}
        user={user}
        handleLogout={handleLogout}
        userRoleTitle={userRoleTitle}
      />

      {/* Main Content. min-w-0 so wide content (tab bars, tables) scrolls or wraps
          inside the page instead of stretching it past the screen */}
      <main className={cn(
        "min-w-0 flex-1 transition-all duration-300 ease-in-out",
        isSidebarOpen ? "lg:ml-64" : "lg:ml-20",
        "pt-16 lg:pt-0",
        // Room for the bottom tab bar (0 when there isn't one)
        "pb-[var(--bottom-nav)]"
      )}>
        {userRole === 'CUSTOMER' && <DeliveryAddressBar />}
        {userRole === 'RIDER' && <RiderLocationBar />}
        {/* Vendors and riders are asked to turn on push so they don't miss orders (a reminder, never a block).
            Riders get new-order alerts even while offline, but only on a device with push on. */}
        {userRole === 'VENDOR' && <PushPrompt tone="warning" className="m-2 sm:m-4 md:mx-6" />}
        {userRole === 'RIDER' && (
          <PushPrompt
            tone="warning"
            title="Turn on push notifications to hear about orders near you, even when you're offline"
            className="m-2 sm:m-4 md:mx-6"
          />
        )}
        {children}
      </main>

      {hasTabBar && <BottomTabBar userRole={userRole} onMore={() => setIsMobileMenuOpen(true)} />}

      {/* Customers without a saved address and vendors without a store location are asked to add one */}
      {(userRole === 'CUSTOMER' || userRole === 'VENDOR') && <AddressOnboarding role={userRole} />}
      {/* Customers are asked once per session to rate the rider of their latest delivery */}
      {userRole === 'CUSTOMER' && <RiderRatingPrompt />}
      {/* Riders must share their live location while using the app */}
      {userRole === 'RIDER' && <RiderLocationGate />}
    </div>
  );
};

export default DashboardLayout;
