import SiteLayout from '@/components/site/SiteLayout';
import Hero from '@/components/site/home/Hero';
import Marquee from '@/components/site/home/Marquee';
import Services from '@/components/site/home/Services';
import HowItWorks from '@/components/site/home/HowItWorks';
import DeliveryModes from '@/components/site/home/DeliveryModes';
import Sustainability from '@/components/site/home/Sustainability';
import Trust from '@/components/site/home/Trust';
import Join from '@/components/site/home/Join';
import Closing from '@/components/site/home/Closing';

// The public home page (How it works is part of it: /#how-it-works)
const Index = () => (
  <SiteLayout>
    <Hero />
    <Marquee />
    <Services />
    <HowItWorks />
    <DeliveryModes />
    <Sustainability />
    <Trust />
    <Join />
    <Closing />
  </SiteLayout>
);

export default Index;
