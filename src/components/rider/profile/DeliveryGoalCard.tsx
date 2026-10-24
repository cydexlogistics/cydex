import { useEffect, useState } from 'react';
import { Target } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MAX_DELIVERY_GOAL, useRiderDeliveryGoal } from '@/hooks/rider/useRiderDeliveryGoal';

// The rider's daily delivery goal, tracked on the Earnings page
const DeliveryGoalCard = () => {
  const { goal, isLoading, saveGoal, saving } = useRiderDeliveryGoal();
  const [value, setValue] = useState('');
  useEffect(() => { if (!isLoading) setValue(String(goal)); }, [goal, isLoading]);

  const n = Number(value);
  const valid = Number.isInteger(n) && n >= 1 && n <= MAX_DELIVERY_GOAL;
  const changed = value !== String(goal);

  const save = async () => {
    try {
      await saveGoal(n);
      toast.success('Daily delivery goal saved');
    } catch {
      toast.error('Could not save your goal. Please try again.');
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Target className="h-5 w-5 text-primary" /> Daily delivery goal
        </CardTitle>
        <CardDescription>How many deliveries you aim to complete each day. Track it on your Earnings page.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5 sm:max-w-xs">
          <Label htmlFor="delivery-goal" className="text-foreground">Deliveries per day</Label>
          <Input
            id="delivery-goal"
            type="number"
            min={1}
            max={MAX_DELIVERY_GOAL}
            step={1}
            value={value}
            disabled={isLoading}
            onChange={(e) => setValue(e.target.value)}
          />
          {value !== '' && !valid && (
            <p className="text-xs text-destructive">Enter a whole number from 1 to {MAX_DELIVERY_GOAL}.</p>
          )}
        </div>
        <Button onClick={save} disabled={!changed || !valid || saving} className="text-black">
          {saving ? 'Saving...' : 'Save goal'}
        </Button>
      </CardContent>
    </Card>
  );
};

export default DeliveryGoalCard;
