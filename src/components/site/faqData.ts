import { CONTACT_EMAIL } from '@/lib/site';

// Questions for the FAQ page (and a few on the home page). Kept in line with
// how the app works (docs/ORDER_FLOW.md); amounts set by admins aren't quoted.
export type FaqCategory = 'ordering' | 'payments' | 'express' | 'vendors' | 'riders' | 'account';

export interface FaqItem {
  q: string;
  a: string;
  category: FaqCategory;
  /** Shown on the home page */
  featured?: boolean;
}

export const FAQ_CATEGORIES: Record<FaqCategory, string> = {
  ordering: 'Ordering & delivery',
  payments: 'Payments & refunds',
  express: 'Cydex Express',
  vendors: 'For vendors',
  riders: 'For riders',
  account: 'Account & app',
};

export const FAQS: FaqItem[] = [
  // Ordering & delivery
  {
    category: 'ordering', featured: true,
    q: 'What is Cydex?',
    a: 'Cydex is a local delivery app. You can order from restaurants and shops near you, send your own packages with Cydex Express, and businesses can request riders for their own deliveries. Riders travel on foot, by bicycle, e-bike or motorbike, and we use the smallest vehicle that can do the job.',
  },
  {
    category: 'ordering', featured: true,
    q: 'Which vendors can I order from?',
    a: "Vendors close enough to your delivery address for one of our delivery modes to reach. Add your address and we'll show the restaurants and shops in range, with their opening hours and how long they take to prepare orders.",
  },
  {
    category: 'ordering',
    q: 'How do I choose how my order is delivered?',
    a: 'At checkout you pick a delivery mode: Cydex Dashers (on foot), bicycle, e-bike or motorbike. Each one has its own price per km and maximum distance, so only the modes that can cover your trip are offered.',
  },
  {
    category: 'ordering',
    q: 'How is the delivery fee worked out?',
    a: "It depends on the distance from the vendor to you and the delivery mode you choose. You'll see the delivery fee, the Service Charge and the total before you pay.",
  },
  {
    category: 'ordering', featured: true,
    q: 'What is the delivery code?',
    a: "Once the vendor accepts your order, you'll see a 4-digit delivery code on your order page. Give it to the rider when they arrive: they need it to complete the delivery, so nobody else can take your order. The rider shows their own pickup code at the store too.",
  },
  {
    category: 'ordering',
    q: 'Can I track my order?',
    a: "Yes. You'll get an update when the vendor accepts it, when it's ready, when the rider picks it up, when they're close and when it's delivered.",
  },
  {
    category: 'ordering',
    q: 'Can I cancel an order?',
    a: "You can cancel until the vendor accepts it. After that it's already being prepared, so it can't be cancelled from the app. Contact us if something has gone wrong.",
  },
  // Payments & refunds
  {
    category: 'payments', featured: true,
    q: 'How can I pay?',
    a: 'By card, bank transfer or your Cydex wallet. If you have money in your wallet it is used first, and you pay the rest by card or transfer.',
  },
  {
    category: 'payments',
    q: 'What happens if my order is cancelled or rejected?',
    a: 'The full amount you paid goes back to your Cydex wallet straight away. You can use it on your next order or withdraw it to your bank account.',
  },
  {
    category: 'payments',
    q: 'Are there discounts?',
    a: 'Yes. Offers available to you are shown on your home page and at checkout, some applied automatically and some with a coupon code. Vendors can also discount their own products: you will see the old price crossed out.',
  },
  {
    category: 'payments',
    q: 'What are rewards and referrals?',
    a: 'Rewards are goals set by Cydex, such as completing a number of orders, that unlock wallet bonuses or free delivery. With referrals, you share your code (on your Profile) and get a reward when someone joins with it and reaches the goal.',
  },
  // Cydex Express
  {
    category: 'express',
    q: 'What is Cydex Express?',
    a: 'A way to send your own item from one place to another: parcels, documents, gifts and so on. Choose the pickup and drop-off, enter the recipient’s details, and a rider collects it.',
  },
  {
    category: 'express',
    q: 'How does the recipient receive it?',
    a: 'We email the recipient a delivery code, and you can see it too. The rider needs that code at the drop-off to complete the delivery.',
  },
  // Vendors
  {
    category: 'vendors', featured: true,
    q: 'How do I sell on Cydex?',
    a: 'Sign up as a vendor, add your business details and submit your documents for verification. Once approved, add your products, set your opening hours and you are live to customers nearby.',
  },
  {
    category: 'vendors',
    q: 'When do I get paid?',
    a: "When an order is delivered, your earnings (the items total minus Cydex's commission) are added to your wallet. You can withdraw to your bank account from the app.",
  },
  {
    category: 'vendors',
    q: 'Can I use Cydex riders for orders I get elsewhere?',
    a: 'Yes. With Request Rider you book a rider for your own customers, for example orders from WhatsApp or Instagram, with up to 5 drop-offs in one trip.',
  },
  // Riders
  {
    category: 'riders', featured: true,
    q: 'How do I become a rider?',
    a: 'Sign up as a rider, choose how you deliver (on foot, bicycle, e-bike or motorbike) and upload your ID and vehicle details. Our team reviews them, and once you are verified you can go online.',
  },
  {
    category: 'riders',
    q: 'How much do riders earn?',
    a: 'Riders keep most of the delivery fee for every delivery, paid into their wallet as soon as it is delivered. You can also earn bonuses from challenges and achievements, and withdraw to your bank.',
  },
  {
    category: 'riders',
    q: 'Which orders will I see?',
    a: 'Orders ready for pickup close to you that your vehicle can cover. You see the fee and distance before you accept, and you can choose which ones to take.',
  },
  // Account & app
  {
    category: 'account',
    q: 'Is there an app to download?',
    a: 'You can install Cydex straight from your browser, on Android, iPhone or a computer, and it works like any app with notifications. Use "Get the app" at the bottom of this page.',
  },
  {
    category: 'account',
    q: 'Where does Cydex operate?',
    a: "We're starting in Nigeria and growing area by area. Add your address in the app to see the vendors and riders near you.",
  },
  {
    category: 'account',
    q: 'How do I contact support?',
    a: `Send us a message from the Contact page or email ${CONTACT_EMAIL}, and we will get back to you as soon as we can.`,
  },
];
