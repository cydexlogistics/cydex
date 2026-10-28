import DashboardLayout from '@/components/layout/DashboardLayout';
import SupportPage from '@/components/support/SupportPage';

const Support = () => (
  <DashboardLayout userRole="VENDOR">
    <SupportPage />
  </DashboardLayout>
);

export default Support;
