
import React from 'react';
import { Link } from 'react-router-dom';

const DesktopNavigation = () => {
  return (
    <nav className="hidden md:flex items-center space-x-4 lg:space-x-8">
      <Link to="/" className="nav-link text-sm lg:text-base">
        Home
      </Link>
      <Link to="/#how-it-works" className="nav-link text-sm lg:text-base">
        How It Works
      </Link>
      <Link to="/about" className="nav-link text-sm lg:text-base">
        About Us
      </Link>
      <Link to="/faq" className="nav-link text-sm lg:text-base">
        FAQ
      </Link>
      <Link to="/contact" className="nav-link text-sm lg:text-base">
        Contact Us
      </Link>
    </nav>
  );
};

export default DesktopNavigation;
