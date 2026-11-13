import React from 'react';
import { Package } from 'lucide-react';

interface OrderProduct {
  id: string;
  name: string;
  quantity: number;
  price: string;
  image: string | null;
}

interface OrderItemsListProps {
  products: OrderProduct[];
}

const OrderItemsList = ({ products }: OrderItemsListProps) => {
  return (
    <div>
      <h3 className="font-medium mb-3 flex items-center text-sm sm:text-base">
        <Package className="h-4 w-4 sm:h-5 sm:w-5 mr-2 flex-shrink-0" /> 
        Order Items
      </h3>
      <div className="border rounded-lg overflow-hidden">
        <div className="divide-y">
          {products
            .filter(product => product.quantity > 0)
            .map((product) => (
              <div key={product.id} className="p-3 sm:p-4 flex items-center gap-3 sm:gap-4">
                <div className="h-12 w-12 sm:h-16 sm:w-16 bg-muted rounded flex items-center justify-center flex-shrink-0">
                  {product.image ? (
                    <img src={product.image} alt={product.name} loading="lazy" decoding="async" className="h-10 w-10 sm:h-14 sm:w-14 object-cover rounded" />
                  ) : (
                    <Package className="h-6 w-6 sm:h-8 sm:w-8 text-gray-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm sm:text-base truncate">{product.name}</p>
                  <p className="text-xs sm:text-sm text-gray-500">Qty: {product.quantity}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-medium text-sm sm:text-base">{product.price}</p>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default OrderItemsList;
