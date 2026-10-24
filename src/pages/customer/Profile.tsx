import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import ReferralCard from '@/components/referrals/ReferralCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { isValidPhone } from '@/lib/phone';

import ProfileAvatar from '@/components/customer/profile/ProfileAvatar';
import ProfileForm from '@/components/customer/profile/ProfileForm';
import SecuritySettings from '@/components/customer/profile/SecuritySettings';
import PreferencesSettings from '@/components/customer/profile/PreferencesSettings';
import AccountSummary from '@/components/customer/profile/AccountSummary';
import RecentActivity from '@/components/customer/profile/RecentActivity';
import SavedAddresses from '@/components/customer/address/SavedAddresses';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

const ProfilePage = () => {
  const { user } = useAuth();
  // ?tab=addresses opens Saved addresses (linked from the Deliver to bar)
  const [searchParams] = useSearchParams();

  // What's saved, and what's in the form
  const [profileData, setProfileData] = useState<{ name: string; email: string; phone: string; dateJoined: string } | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [touched, setTouched] = useState({ name: false, phone: false });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Fetch user's profile
  useEffect(() => {
    const fetchProfile = async () => {
      if (!user?.id) return;
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      if (error) {
        toast({
          variant: "destructive",
          title: "Error loading profile",
          description: error.message
        });
        setLoading(false);
        return;
      }
      const loaded = {
        name: data.name || "",
        email: data.email || "",
        phone: data.phone || "",
        dateJoined: data.created_at
          ? new Date(data.created_at).toLocaleString("en-NG", {
              year: "numeric",
              month: "long"
            })
          : "",
      };
      setProfileData(loaded);
      setForm({ name: loaded.name, email: loaded.email, phone: loaded.phone });
      setLoading(false);
    };

    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const errors = {
    name: form.name.trim().length < 2 ? 'Enter your full name.' : null,
    phone: !form.phone.trim() ? 'Enter your phone number. Riders use it to reach you.'
      : !isValidPhone(form.phone) ? 'Enter a valid phone number, e.g. 08012345678.' : null,
  };
  const changed = !!profileData && (form.name.trim() !== profileData.name.trim() || form.phone.trim() !== profileData.phone.trim());
  const valid = !errors.name && !errors.phone;

  const handleSave = async () => {
    if (!user?.id || !profileData) return;
    setTouched({ name: true, phone: true });
    if (!valid || !changed) return;
    setSaving(true);
    // Addresses are managed in the Saved addresses tab
    const updates = { name: form.name.trim(), phone: form.phone.trim() };
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id);
    setSaving(false);
    if (error) {
      toast({
        variant: "destructive",
        title: "Profile update failed",
        description: error.message,
      });
      return;
    }
    setProfileData({ ...profileData, ...updates });
    setForm((f) => ({ ...f, ...updates }));
    setTouched({ name: false, phone: false });
    toast({ variant: "default", title: "Profile updated" });
  };

  if (loading || !profileData) {
    return (
      <DashboardLayout userRole="CUSTOMER">
        <div className="p-2 sm:p-4 md:p-6 max-w-full mx-auto space-y-3 sm:space-y-4 md:space-y-6">
          <div className="animate-pulse h-44 rounded bg-muted mb-4"></div>
          <div className="animate-pulse h-96 rounded bg-muted"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole="CUSTOMER">
      <div className="p-2 sm:p-4 md:p-6 max-w-full mx-auto space-y-3 sm:space-y-4 md:space-y-6">
        <div>
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold">My Profile</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage your profile information and settings
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3 sm:pb-4">
            <CardTitle className="text-base sm:text-lg">Profile Information</CardTitle>
            <CardDescription className="text-sm">View and update your personal details</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Tabs defaultValue={searchParams.get('tab') ?? 'account'} className="w-full">
              <TabsList className="mb-3 sm:mb-4 w-full">
                <TabsTrigger value="account" className="text-xs sm:text-sm flex-1">Account</TabsTrigger>
                <TabsTrigger value="addresses" className="text-xs sm:text-sm flex-1">
                  <span className="sm:hidden">Addresses</span>
                  <span className="hidden sm:inline">Saved addresses</span>
                </TabsTrigger>
                <TabsTrigger value="security" className="text-xs sm:text-sm flex-1">Security</TabsTrigger>
                <TabsTrigger value="preferences" className="text-xs sm:text-sm flex-1">Preferences</TabsTrigger>
                <TabsTrigger value="referrals" className="text-xs sm:text-sm flex-1">Referrals</TabsTrigger>
              </TabsList>

              <TabsContent value="account">
                <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
                  <ProfileAvatar name={profileData.name} />
                  <ProfileForm
                    values={form}
                    errors={errors}
                    // Missing details show their error straight away; others once edited
                    showErrors={{ name: touched.name || !profileData.name, phone: touched.phone || !profileData.phone }}
                    onChange={(field, value) => setForm((f) => ({ ...f, [field]: value }))}
                    onBlur={(field) => setTouched((t) => ({ ...t, [field]: true }))}
                    onSave={handleSave}
                    canSave={changed && valid}
                    saving={saving}
                  />
                </div>
              </TabsContent>

              <TabsContent value="addresses">
                <SavedAddresses />
              </TabsContent>

              <TabsContent value="security">
                <SecuritySettings />
              </TabsContent>

              <TabsContent value="preferences">
                <PreferencesSettings />
              </TabsContent>

              <TabsContent value="referrals">
                <ReferralCard />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <AccountSummary dateJoined={profileData.dateJoined} />
          <RecentActivity />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ProfilePage;
