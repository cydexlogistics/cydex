import { Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import AdminDashboard from '../pages/admin/AdminDashboard';
import AdminUsers from '../pages/admin/Users';
import AdminUserDetail from '../pages/admin/UserDetail';
import AdminOrders from '../pages/admin/Orders';
import AdminOrderDetail from '../pages/admin/OrderDetail';
import AdminPayments from '../pages/admin/Payments';
import AdminPricing from '../pages/admin/Pricing';
import AdminReviews from '../pages/admin/Reviews';
import AdminEmails from '../pages/admin/Emails';
import AdminNotifications from '../pages/admin/Notifications';
import AdminActivity from '../pages/admin/Activity';
import AdminVerifications from '../pages/admin/Verifications';
import AdminSecurity from '../pages/admin/Security';
import AdminVehicles from '../pages/admin/Vehicles';
import AdminPromotions from '../pages/admin/Promotions';
import AdminRewards from '../pages/admin/Rewards';
import AdminMessages from '../pages/admin/Messages';
import AdminSupport from '../pages/admin/Support';
import AdminBroadcasts from '../pages/admin/Broadcasts';

const PAGES: [string, JSX.Element][] = [
  ['/', <AdminDashboard />],
  ['/orders', <AdminOrders />],
  ['/orders/:id', <AdminOrderDetail />],
  ['/payments', <AdminPayments />],
  ['/users', <AdminUsers />],
  ['/users/:id', <AdminUserDetail />],
  ['/verifications', <AdminVerifications />],
  ['/reviews', <AdminReviews />],
  ['/pricing', <AdminPricing />],
  ['/vehicles', <AdminVehicles />],
  ['/promotions', <AdminPromotions />],
  ['/rewards', <AdminRewards />],
  ['/broadcasts', <AdminBroadcasts />],
  ['/support', <AdminSupport />],
  ['/messages', <AdminMessages />],
  ['/emails', <AdminEmails />],
  ['/notifications', <AdminNotifications />],
  ['/activity', <AdminActivity />],
  ['/security', <AdminSecurity />],
];

const AdminRoutes = () => (
  <Routes>
    {PAGES.map(([path, page]) => (
      <Route key={path} path={path} element={<ProtectedRoute allowedRoles={['ADMIN']}>{page}</ProtectedRoute>} />
    ))}
  </Routes>
);

export default AdminRoutes;
