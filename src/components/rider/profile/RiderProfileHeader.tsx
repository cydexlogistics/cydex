import React from 'react';

// Title of the rider's profile page. The forms below are always editable, each
// with its own save button.
const RiderProfileHeader = () => (
  <div className="mb-3 sm:mb-4 md:mb-6">
    <h1 className="text-lg sm:text-xl md:text-2xl font-bold">My Profile</h1>
    <p className="text-sm sm:text-base text-muted-foreground">Manage your account information and settings</p>
  </div>
);

export default RiderProfileHeader;
