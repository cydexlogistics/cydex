
import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Wallet } from 'lucide-react';
import { RiderEarnings } from '@/hooks/useRiderData';

interface EarningsBreakdownCardProps {
  weeklyEarnings: RiderEarnings[];
  monthlyEarnings: RiderEarnings[];
}

const formatNaira = (amount: number) =>
  `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// This week's (since Sunday) and this month's earnings, totalled like the
// Earnings page: delivery fees plus tips
const PeriodBreakdown = ({ earnings }: { earnings: RiderEarnings[] }) => {
  const fees = earnings.reduce((sum, e) => sum + Number(e.delivery_fee), 0);
  const tips = earnings.reduce((sum, e) => sum + Number(e.tip_amount), 0);
  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-gray-600 text-xs sm:text-sm">Delivery Fees</p>
        <p className="font-medium text-xs sm:text-sm">{formatNaira(fees)}</p>
      </div>
      <div className="flex justify-between items-center">
        <p className="text-gray-600 text-xs sm:text-sm">Tips</p>
        <p className="font-medium text-xs sm:text-sm">{formatNaira(tips)}</p>
      </div>
      <div className="border-t pt-3 flex justify-between items-center">
        <div>
          <p className="font-bold text-sm sm:text-base">Total</p>
          <p className="text-xs text-muted-foreground">
            {earnings.length} deliver{earnings.length === 1 ? 'y' : 'ies'}
          </p>
        </div>
        <p className="text-lg sm:text-xl font-bold">{formatNaira(fees + tips)}</p>
      </div>
    </div>
  );
};

export const EarningsBreakdownCard: React.FC<EarningsBreakdownCardProps> = ({
  weeklyEarnings,
  monthlyEarnings
}) => {
  return (
    <Card>
      <CardHeader className="pb-3 sm:pb-4">
        <CardTitle className="text-base sm:text-lg">Earnings Overview</CardTitle>
        <CardDescription className="text-sm">Track your income and tips</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="mb-4 sm:mb-6">
          <Tabs defaultValue="week">
            <TabsList className="mb-3 sm:mb-4 w-full">
              <TabsTrigger value="week" className="text-xs sm:text-sm flex-1">This Week</TabsTrigger>
              <TabsTrigger value="month" className="text-xs sm:text-sm flex-1">This Month</TabsTrigger>
            </TabsList>

            <TabsContent value="week">
              <PeriodBreakdown earnings={weeklyEarnings} />
            </TabsContent>

            <TabsContent value="month">
              <PeriodBreakdown earnings={monthlyEarnings} />
            </TabsContent>
          </Tabs>
        </div>

        <Button asChild className="w-full flex items-center justify-center bg-primary hover:bg-primary-hover text-black text-xs sm:text-sm h-8 sm:h-9">
          <Link to="/rider/earnings">
            <Wallet className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
            <span>Withdraw Earnings</span>
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
};
