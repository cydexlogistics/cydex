import React from 'react';
import { Info } from 'lucide-react';
import RiderBankAccounts from '@/components/rider/RiderBankAccounts';
import { useRiderWallet } from '@/hooks/useRiderWallet';

// The same bank accounts card as on Earnings
const BankingTab = () => {
  const { bankAccounts, addBankAccount } = useRiderWallet();

  return (
    <div className="space-y-4">
      <RiderBankAccounts accounts={bankAccounts} onAdd={addBankAccount} />
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 dark:border-blue-500/30 dark:bg-blue-500/10">
        <div className="flex">
          <Info className="mr-2 h-5 w-5 flex-shrink-0 text-blue-500" />
          <div>
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200">Your bank details are private</p>
            <p className="mt-1 text-xs text-blue-600 dark:text-blue-300">
              They're only used to send your withdrawals, and are never shown to vendors or customers.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BankingTab;
