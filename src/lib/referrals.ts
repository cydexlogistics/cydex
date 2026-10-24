// Referrals (docs/ORDER_FLOW.md → Referrals): the reward and goal for each
// kind of account are set by admins (Admin → Rewards → Referrals)
export type ReferralRole = 'customer' | 'vendor' | 'rider';

export interface ReferralProgram {
  role: ReferralRole;
  reward_amount: number;
  orders_needed: number;
  rider_requests_needed: number | null;
  is_active: boolean;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// "completes 2 orders", "makes 2 deliveries", "makes 5 sales or 3 rider requests"
export const referralGoal = (role: ReferralRole, p: Pick<ReferralProgram, 'orders_needed' | 'rider_requests_needed'>) => {
  if (role === 'rider') return `makes ${plural(p.orders_needed, 'delivery', 'deliveries')}`;
  if (role === 'vendor') {
    return `makes ${plural(p.orders_needed, 'sale', 'sales')}${p.rider_requests_needed ? ` or ${plural(p.rider_requests_needed, 'rider request', 'rider requests')}` : ''}`;
  }
  return `completes ${plural(p.orders_needed, 'order', 'orders')}`;
};
