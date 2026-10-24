
import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import LoadingDisplay from '@/components/ui/LoadingDisplay';
import RiderProfileHeader from '@/components/rider/profile/RiderProfileHeader';
import ProfileHeader from '@/components/rider/profile/ProfileHeader';
import VerificationCard from '@/components/verification/VerificationCard';
import ProfileTabs from '@/components/rider/profile/ProfileTabs';
import { useRiderProfileData } from '@/hooks/rider/useRiderProfileData';

const RiderProfilePage = () => {
  const { 
    riderProfile, 
    recentReviews, 
    loading, 
    error, 
    updateProfile,
    refetchProfile
  } = useRiderProfileData();

  const queryClient = useQueryClient();

  // Saves the Personal tab (it checks the values first)
  const handleSaveProfile = async ({ name, phone }: { name: string; phone: string }) => {
    const success = await updateProfile({ name, phone });
    if (success) {
      // Clears the "add your phone number" notice
      queryClient.invalidateQueries({ queryKey: ['has-phone'] });
    }
    return !!success;
  };

  const handleAvatarUpdate = async (avatarUrl: string) => {
    console.log('[Profile] Avatar updated:', avatarUrl);
    // Refetch profile to get updated avatar
    await refetchProfile();
  };

  if (loading) {
    return (
      <DashboardLayout userRole="RIDER">
        <div className="p-2 sm:p-4 md:p-6 max-w-7xl mx-auto">
          <LoadingDisplay message="Loading profile..." />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !riderProfile) {
    return (
      <DashboardLayout userRole="RIDER">
        <div className="p-2 sm:p-4 md:p-6 max-w-7xl mx-auto">
          <Card>
            <CardContent className="text-center py-12">
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {error || 'Profile not found'}
              </h3>
              <p className="text-gray-500">
                Please contact support if this issue persists.
              </p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole="RIDER">
      <div className="p-2 sm:p-4 md:p-6 max-w-7xl mx-auto">
        <RiderProfileHeader />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
          {/* Left Column - Profile Info */}
          <div className="lg:col-span-1 space-y-3 sm:space-y-4 md:space-y-6">
            <Card>
              <CardContent className="p-3 sm:p-4 md:p-6">
                <ProfileHeader profile={riderProfile} onAvatarUpdate={handleAvatarUpdate} />
              </CardContent>
            </Card>

            <VerificationCard role="rider" />
          </div>

          {/* Right Column - Tabs */}
          <div className="lg:col-span-2">
            <ProfileTabs
              profile={riderProfile}
              recentReviews={recentReviews}
              onSaveProfile={handleSaveProfile}
            />
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
};

export default RiderProfilePage;
