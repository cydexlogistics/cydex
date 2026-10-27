
import { Route, Routes, Navigate } from 'react-router-dom';
import Index from '../pages/Index';
import Auth from '../pages/Auth';
import ResetPassword from '../pages/Auth/ResetPassword';
import SetPassword from '../pages/Auth/SetPassword';
import CheckEmail from '../pages/Auth/CheckEmail';
import AdminLogin from '../pages/admin/AdminLogin';
import NotFound from '../pages/NotFound';
import AboutUs from '../pages/AboutUs';
import Faq from '../pages/Faq';
import Contact from '../pages/Contact';
import PrivacyPolicy from '../pages/PrivacyPolicy';
import CustomerRoutes from './CustomerRoutes';
import VendorRoutes from './VendorRoutes';
import RiderRoutes from './RiderRoutes';
import AdminRoutes from './AdminRoutes';

const AppRoutes = () => {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<Index />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/auth/reset-password" element={<ResetPassword />} />
      <Route path="/auth/set-password" element={<SetPassword />} />
      {/* After sign-up, for all three account types */}
      <Route path="/auth/check-email" element={<CheckEmail />} />
      {/* How it works is now part of the home page */}
      <Route path="/how-it-works" element={<Navigate to="/#how-it-works" replace />} />
      <Route path="/about" element={<AboutUs />} />
      <Route path="/faq" element={<Faq />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/privacy-policy" element={<PrivacyPolicy />} />
      
      {/* Protected Routes */}
      <Route path="/customer/*" element={<CustomerRoutes />} />
      <Route path="/vendor/*" element={<VendorRoutes />} />
      <Route path="/rider/*" element={<RiderRoutes />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin/*" element={<AdminRoutes />} />
      
      {/* Catch-all route for 404 */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default AppRoutes;
