import React from 'react';
import ChangePasswordCard from '@/components/account/ChangePasswordCard';
import TwoFactorComingSoon from '@/components/account/TwoFactorComingSoon';

const SecuritySettings = () => (
  <div className="space-y-4">
    <ChangePasswordCard />
    <TwoFactorComingSoon />
  </div>
);

export default SecuritySettings;
