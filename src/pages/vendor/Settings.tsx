import React, { useState, useEffect } from 'react';
import StoreImagesUpload from '@/components/vendor/settings/StoreImagesUpload';
import VerificationCard from '@/components/verification/VerificationCard';
import NotificationSettingsCard from '@/components/notifications/NotificationSettingsCard';
import VendorRatings from '@/components/vendor/settings/VendorRatings';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ReferralCard from '@/components/referrals/ReferralCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  User,
  Mail,
  Phone,
  MapPin,
  Bell,
  Shield,
  Lock,
  CreditCard,
  Store,
  Package,
  Camera,
  FileText,
  HelpCircle,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { useVendorSettings } from '@/hooks/useVendorSettings';
import SingleAddressField from '@/components/address/SingleAddressField';
import { useSearchParams } from 'react-router-dom';
import StoreHoursCard from '@/components/vendor/hours/StoreHoursCard';
import ChangePasswordCard from '@/components/account/ChangePasswordCard';
import TwoFactorComingSoon from '@/components/account/TwoFactorComingSoon';
import { isValidPhone } from '@/lib/phone';
import { cn } from '@/lib/utils';

const VendorSettingsPage = () => {
  // e.g. /vendor/settings?tab=ratings (the dashboard's Rating card links here)
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const { 
    settings, 
    profile, 
    loading, 
    saving,
    updateSettings,
    updateProfile,
    fetchVendorStats,
    fetchRecentActivity
  } = useVendorSettings();

  const [touched, setTouched] = useState({ name: false, phone: false });
  const [profileData, setProfileData] = useState({
    name: '',
    email: '',
    phone: '',
    description: ''
  });
  const [vendorStats, setVendorStats] = useState<any>(null);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [localSettings, setLocalSettings] = useState<any>(null);

  // Initialize data when profile/settings load
  useEffect(() => {
    if (profile && settings) {
      setProfileData({
        name: profile.name || '',
        email: profile.email || '',
        phone: profile.phone || '',
        description: settings.description || ''
      });
      setLocalSettings(settings);
    }
  }, [profile, settings]);

  // Load additional data
  useEffect(() => {
    const loadAdditionalData = async () => {
      const [stats, activity] = await Promise.all([
        fetchVendorStats(),
        fetchRecentActivity()
      ]);
      setVendorStats(stats);
      setRecentActivity(activity);
    };

    if (profile?.id) {
      loadAdditionalData();
    }
  }, [profile?.id, fetchVendorStats, fetchRecentActivity]);

  // What's saved, to tell whether the form has changed
  const savedValues = {
    name: profile?.name || '',
    phone: profile?.phone || '',
    description: settings?.description || '',
  };
  const formErrors = {
    name: profileData.name.trim().length < 2 ? 'Enter your store name.' : null,
    phone: !profileData.phone.trim() ? 'Enter a phone number. Customers and riders use it to reach you.'
      : !isValidPhone(profileData.phone) ? 'Enter a valid phone number, e.g. 08012345678.' : null,
  };
  const formChanged = profileData.name.trim() !== savedValues.name.trim()
    || profileData.phone.trim() !== savedValues.phone.trim()
    || profileData.description.trim() !== savedValues.description.trim();
  const formValid = !formErrors.name && !formErrors.phone;
  // Missing details show their error straight away; others once edited
  const showError = (field: 'name' | 'phone') =>
    (touched[field] || !savedValues[field]) ? formErrors[field] : null;

  const handleSave = async () => {
    if (!profile || !settings) return;
    setTouched({ name: true, phone: true });
    if (!formValid || !formChanged) return;

    try {
      // Update profile data (the store address saves on its own via the address picker)
      await updateProfile({
        name: profileData.name.trim(),
        phone: profileData.phone.trim()
      });

      // Update settings data
      // Business category and licence live in the verification (see the Verification card)
      await updateSettings({
        description: profileData.description.trim()
      });

      setTouched({ name: false, phone: false });
    } catch (error) {
      // Error handled in hooks
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setProfileData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleNotificationChange = async (key: string, value: boolean) => {
    if (!localSettings) return;
    
    const updatedPreferences = {
      ...localSettings.notification_preferences,
      [key]: value
    };
    
    try {
      await updateSettings({
        notification_preferences: updatedPreferences
      });
      setLocalSettings(prev => ({
        ...prev,
        notification_preferences: updatedPreferences
      }));
    } catch (error) {
      // Error handled in hook
    }
  };

  if (loading || !profile || !settings) {
    return (
      <DashboardLayout userRole="VENDOR">
        <div className="p-3 sm:p-4 md:p-6 max-w-full mx-auto space-y-4 sm:space-y-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded"></div>
            <div className="h-96 bg-gray-200 rounded"></div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="h-64 bg-gray-200 rounded"></div>
              <div className="h-64 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole="VENDOR">
      <div className="p-3 sm:p-4 md:p-6 max-w-full mx-auto space-y-4 sm:space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Settings</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage your store settings and profile information
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3 sm:pb-6">
            <CardTitle className="text-base sm:text-lg">Store Information</CardTitle>
            <CardDescription className="text-sm">View and update your store details</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue={tabParam ?? 'account'} className="w-full">
              <TabsList className="mb-3 sm:mb-4 w-full sm:w-auto">
                <TabsTrigger value="account" className="text-xs sm:text-sm">Account</TabsTrigger>
                <TabsTrigger value="hours" className="text-xs sm:text-sm">Hours</TabsTrigger>
                <TabsTrigger value="ratings" className="text-xs sm:text-sm">Ratings</TabsTrigger>
                <TabsTrigger value="security" className="text-xs sm:text-sm">Security</TabsTrigger>
                <TabsTrigger value="preferences" className="text-xs sm:text-sm">Preferences</TabsTrigger>
                <TabsTrigger value="referrals" className="text-xs sm:text-sm">Referrals</TabsTrigger>
              </TabsList>

              <TabsContent value="account" className="mt-3 sm:mt-4">
                <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
                  <div className="lg:w-1/3 flex flex-col items-center">
                    <StoreImagesUpload />
                    <div className="mt-3 w-full">
                      <VerificationCard role="vendor" />
                    </div>
                  </div>

                  <div className="lg:w-2/3 space-y-3 sm:space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="name" className="text-sm sm:text-base">Store name</Label>
                      <Input
                        id="name"
                        placeholder="Your store name"
                        value={profileData.name}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                        aria-invalid={!!showError('name')}
                        className={cn('text-sm sm:text-base', showError('name') && 'border-destructive focus-visible:ring-destructive')}
                      />
                      {showError('name') && <p className="text-xs text-destructive">{showError('name')}</p>}
                    </div>
                    
                    <FormField
                      id="email"
                      label="Email Address"
                      placeholder="Your Email"
                      value={profileData.email}
                      onChange={(value) => handleInputChange('email', value)}
                      disabled={true} // Email should not be editable
                    />
                    
                    <div className="space-y-1.5">
                      <Label htmlFor="phone" className="text-sm sm:text-base">Phone number</Label>
                      <Input
                        id="phone"
                        type="tel"
                        inputMode="tel"
                        placeholder="e.g. 08012345678"
                        value={profileData.phone}
                        onChange={(e) => handleInputChange('phone', e.target.value)}
                        onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
                        aria-invalid={!!showError('phone')}
                        className={cn('text-sm sm:text-base', showError('phone') && 'border-destructive focus-visible:ring-destructive')}
                      />
                      {showError('phone') && <p className="text-xs text-destructive">{showError('phone')}</p>}
                    </div>
                    
                    <SingleAddressField
                      label="Store address"
                      addressLabel="Store"
                      pickerTitle="Store location"
                      pickerDescription="Search for your store, then drag the map so the pin sits exactly where riders should pick up orders."
                      emptyText="No store location set. Riders need it to find you."
                    />
                    
                    <FormField
                      id="description"
                      label="Description"
                      placeholder="Your Store Description"
                      value={profileData.description}
                      onChange={(value) => handleInputChange('description', value)}
                      disabled={false}
                      isTextarea
                    />
                    
                  </div>
                </div>

                  <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-0 mt-4 sm:mt-6">
                    <Button 
                      onClick={handleSave}
                      className="w-full sm:w-auto text-xs sm:text-sm"
                      disabled={saving || !formChanged || !formValid}
                    >
                      {saving ? (
                        <>
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        'Save changes'
                      )}
                    </Button>
                  </div>
              </TabsContent>

              <TabsContent value="hours" className="mt-3 sm:mt-4">
                <StoreHoursCard />
              </TabsContent>

              <TabsContent value="ratings" className="mt-3 sm:mt-4">
                <VendorRatings />
              </TabsContent>

              <TabsContent value="security" className="mt-3 sm:mt-4">
                <div className="space-y-3 sm:space-y-4">
                  <ChangePasswordCard />
                  <TwoFactorComingSoon />
                </div>
              </TabsContent>

              <TabsContent value="preferences" className="mt-3 sm:mt-4">
                <div className="space-y-3 sm:space-y-4">
                  <NotificationSettingsCard />

                  <PreferenceCard
                    title="Appearance"
                    description="Customize the look and feel of your account."
                  >
                    <Button className="text-xs sm:text-sm" disabled>Change Theme</Button>
                  </PreferenceCard>
                </div>
              </TabsContent>

              <TabsContent value="referrals" className="mt-3 sm:mt-4">
                <ReferralCard />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <Card>
            <CardHeader className="pb-3 sm:pb-6">
              <CardTitle className="text-base sm:text-lg">Store Summary</CardTitle>
              <CardDescription className="text-sm">Your store activity at a glance</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 sm:space-y-4">
              {vendorStats ? (
                <>
                  <SummaryItem
                    icon={<Store className="h-5 w-5 sm:h-6 sm:w-6 text-green-500" />}
                    title={`${vendorStats.productCount} Products`}
                    description="Total active products in your store"
                  />
                  <SummaryItem
                    icon={<Package className="h-5 w-5 sm:h-6 sm:w-6 text-blue-500" />}
                    title={`${vendorStats.orderCount} Orders`}
                    description="Orders completed this month"
                  />
                  <SummaryItem
                    icon={<CreditCard className="h-5 w-5 sm:h-6 sm:w-6 text-amber-500" />}
                    title={`₦${vendorStats.totalRevenue.toLocaleString()} Revenue`}
                    description="Total revenue this month"
                  />
                </>
              ) : (
                <div className="animate-pulse space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-center space-x-4">
                      <div className="h-6 w-6 bg-gray-200 rounded"></div>
                      <div className="space-y-2 flex-1">
                        <div className="h-4 bg-gray-200 rounded w-24"></div>
                        <div className="h-3 bg-gray-200 rounded w-32"></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3 sm:pb-6">
              <CardTitle className="text-base sm:text-lg">Recent Activity</CardTitle>
              <CardDescription className="text-sm">Your latest actions and updates</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 sm:space-y-4">
              {recentActivity.length > 0 ? (
                recentActivity.map((activity, index) => (
                  <ActivityItem
                    key={index}
                    icon={
                      activity.type === 'order' ? (
                        <Bell className="h-5 w-5 sm:h-6 sm:w-6 text-gray-500" />
                      ) : (
                        <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-gray-500" />
                      )
                    }
                    title={activity.title}
                    description={activity.description}
                    timestamp={activity.timestamp}
                  />
                ))
              ) : (
                <div className="text-center py-4">
                  <HelpCircle className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No recent activity</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

const FormField = ({ 
  id, 
  label, 
  placeholder, 
  value, 
  onChange, 
  disabled, 
  isTextarea = false 
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  isTextarea?: boolean;
}) => (
  <div className="space-y-1 sm:space-y-2">
    <Label htmlFor={id} className="text-sm sm:text-base">{label}</Label>
    {isTextarea ? (
      <Textarea
        id={id}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="text-sm sm:text-base"
      />
    ) : (
      <Input
        id={id}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="text-sm sm:text-base"
      />
    )}
  </div>
);


const PreferenceCard = ({ title, description, children }: { title: string; description: string; children: React.ReactNode }) => (
  <Card className="shadow-none">
    <CardHeader className="pb-2 sm:pb-4">
      <CardTitle className="text-sm sm:text-base">{title}</CardTitle>
      <CardDescription className="text-xs sm:text-sm">{description}</CardDescription>
    </CardHeader>
    <CardContent>
      {children}
    </CardContent>
  </Card>
);

const SummaryItem = ({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) => (
  <div className="flex items-center space-x-3 sm:space-x-4">
    {icon}
    <div>
      <h3 className="text-base sm:text-lg font-medium">{title}</h3>
      <p className="text-xs sm:text-sm text-gray-500">{description}</p>
    </div>
  </div>
);

const ActivityItem = ({ icon, title, description, timestamp }: { icon: React.ReactNode; title: string; description: string; timestamp: string }) => (
  <div className="flex items-start space-x-3 sm:space-x-4">
    <div className="flex-shrink-0 mt-0.5">
      {icon}
    </div>
    <div className="min-w-0 flex-1">
      <h3 className="text-sm sm:text-base font-medium">{title}</h3>
      <p className="text-xs sm:text-sm text-gray-500 truncate">{description}</p>
      <p className="text-xs text-gray-400 mt-1">
        {new Date(timestamp).toLocaleString()}
      </p>
    </div>
  </div>
);

export default VendorSettingsPage;