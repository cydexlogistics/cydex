import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import OrdersList from './OrdersList';

// Use a consistent Order type that matches what's used in OrdersList
interface Order {
  id: string;
  customer: string;
  status: string;
  createdAt: string;
  items: Array<any>;
  total: number;
  paymentMethod: string;
  deliveryType?: string;
  timeSlot?: string;
  rider?: {
    name: string;
    contact: string;
  };
  [key: string]: any;
}

interface OrderTabsProps {
  orders: Order[];
}

const OrderTabs = ({ orders }: OrderTabsProps) => {
  return (
    <Tabs defaultValue="all" className="w-full">
      <TabsList className="mb-3 sm:mb-4 w-full sm:w-auto sm:gap-2">
        <TabsTrigger value="all" className="whitespace-nowrap text-xs sm:text-sm">
          All Orders
        </TabsTrigger>
        <TabsTrigger value="today" className="whitespace-nowrap text-xs sm:text-sm">
          Today
        </TabsTrigger>
        <TabsTrigger value="pending" className="whitespace-nowrap text-xs sm:text-sm">
          Pending
        </TabsTrigger>
      </TabsList>
      
      <TabsContent value="all" className="mt-3 sm:mt-4">
        <OrdersList orders={orders} type="all" />
      </TabsContent>
      
      <TabsContent value="today" className="mt-3 sm:mt-4">
        <OrdersList orders={[]} type="today" />
      </TabsContent>
      
      <TabsContent value="pending" className="mt-3 sm:mt-4">
        <OrdersList orders={[]} type="pending" />
      </TabsContent>
    </Tabs>
  );
};

export default OrderTabs;
