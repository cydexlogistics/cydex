import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PersonalInfoTab from './tabs/PersonalInfoTab';
import BankingTab from './tabs/BankingTab';
import ReviewsTab from './tabs/ReviewsTab';
import AchievementsTab from './tabs/AchievementsTab';
import SecuritySettings from './SecuritySettings';
import DeliveryGoalCard from './DeliveryGoalCard';
import ReferralCard from '@/components/referrals/ReferralCard';

interface ProfileTabsProps {
  profile: any;
  recentReviews: any[];
  onSaveProfile?: (updatedData: { name: string; phone: string }) => Promise<boolean>;
}

const TABS = ['personal', 'bank', 'security', 'reviews', 'achievements', 'referrals'];

const ProfileTabs = ({ profile, recentReviews, onSaveProfile }: ProfileTabsProps) => {
  // ?tab=achievements (from reward notifications) opens that tab
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get('tab') ?? '') ? params.get('tab')! : 'personal';
  return (
    <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })} className="w-full">
      <div className="mb-3 sm:mb-4 md:mb-6">
          <TabsList className="w-full">
            <TabsTrigger value="personal" className="text-xs sm:text-sm whitespace-nowrap flex-shrink-0 px-2 sm:px-3">Personal</TabsTrigger>
            <TabsTrigger value="bank" className="text-xs sm:text-sm whitespace-nowrap flex-shrink-0 px-2 sm:px-3">Banking</TabsTrigger>
            <TabsTrigger value="security" className="text-xs sm:text-sm whitespace-nowrap flex-shrink-0 px-2 sm:px-3">Security</TabsTrigger>
            <TabsTrigger value="reviews" className="text-xs sm:text-sm whitespace-nowrap flex-shrink-0 px-2 sm:px-3">Reviews</TabsTrigger>
            <TabsTrigger value="achievements" className="text-xs sm:text-sm whitespace-nowrap flex-shrink-0 px-2 sm:px-3">Achievements</TabsTrigger>
            <TabsTrigger value="referrals" className="text-xs sm:text-sm whitespace-nowrap flex-shrink-0 px-2 sm:px-3">Referrals</TabsTrigger>
          </TabsList>
      </div>
      
      <TabsContent value="personal" className="mt-0">
        <div className="space-y-4">
          <PersonalInfoTab profile={profile} onSaveProfile={onSaveProfile} />
          <DeliveryGoalCard />
        </div>
      </TabsContent>
      
      <TabsContent value="bank" className="mt-0">
        <BankingTab />
      </TabsContent>
      
      <TabsContent value="security" className="mt-0">
        <SecuritySettings />
      </TabsContent>
      
      <TabsContent value="reviews" className="mt-0">
        <ReviewsTab profile={profile} recentReviews={recentReviews} />
      </TabsContent>
      
      <TabsContent value="achievements" className="mt-0">
        <AchievementsTab />
      </TabsContent>

      <TabsContent value="referrals" className="mt-0">
        <ReferralCard />
      </TabsContent>
    </Tabs>
  );
};

export default ProfileTabs;
