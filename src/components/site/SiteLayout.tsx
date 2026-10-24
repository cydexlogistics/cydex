import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import Navbar from '@/components/Navbar';
import SiteFooter from './SiteFooter';

// Every public page (home, about, FAQ, contact): navbar, footer, and scrolling
// to the top, or to #section when the link has one (e.g. /#how-it-works)
const SiteLayout = ({ children }: { children: ReactNode }) => {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }
    // Wait a moment for the section to render
    const t = setTimeout(() => {
      document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    return () => clearTimeout(t);
  }, [pathname, hash]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
        <Navbar />
        <main>{children}</main>
        <SiteFooter />
      </div>
    </MotionConfig>
  );
};

export default SiteLayout;
