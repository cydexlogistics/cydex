
import React from 'react';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Shield, LogOut, BarChart } from "lucide-react";
import { User } from "@/types/auth.types";

interface MobileNavigationProps {
  isOpen: boolean;
  onClose: () => void;
  isAuthenticated: boolean;
  user: User | null;
  onLogoutClick: () => void;
}

const MobileNavigation = ({ 
  isOpen, 
  onClose, 
  isAuthenticated, 
  user, 
  onLogoutClick 
}: MobileNavigationProps) => {
  const navigate = useNavigate();

  const goToDashboard = () => {
    if (user) {
      navigate(`/${user.role.toLowerCase()}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="sm:hidden absolute top-full left-0 right-0 bg-background shadow-md p-4 z-50 animate-fade-in border-t border-border">
      <nav className="flex flex-col space-y-4">
        <Link to="/" className="p-2 hover:bg-muted rounded-md text-foreground" onClick={onClose}>
          Home
        </Link>
        <Link to="/#how-it-works" className="p-2 hover:bg-muted rounded-md text-foreground" onClick={onClose}>
          How It Works
        </Link>
        <Link to="/about" className="p-2 hover:bg-muted rounded-md text-foreground" onClick={onClose}>
          About Us
        </Link>
        <Link to="/faq" className="p-2 hover:bg-muted rounded-md text-foreground" onClick={onClose}>
          FAQ
        </Link>
        <Link to="/contact" className="p-2 hover:bg-muted rounded-md text-foreground" onClick={onClose}>
          Contact Us
        </Link>
        
        {isAuthenticated && user ? (
          <>
            <div className="border-t border-border my-2 pt-2"></div>
            <Button 
              variant="ghost" 
              className="justify-start p-2" 
              onClick={() => {
                onClose();
                goToDashboard();
              }}
            >
              <BarChart className="mr-2 h-4 w-4" />
              Dashboard
            </Button>
            {user.role === "ADMIN" && (
              <Button 
                variant="ghost" 
                className="justify-start p-2" 
                onClick={() => {
                  onClose();
                  navigate("/admin");
                }}
              >
                <Shield className="mr-2 h-4 w-4" />
                Admin Panel
              </Button>
            )}
            <Button 
              variant="ghost" 
              className="justify-start p-2" 
              onClick={() => {
                onClose();
                onLogoutClick();
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </Button>
          </>
        ) : (
          <>
            <div className="border-t border-border my-2 pt-2"></div>
            <Button
              variant="outline"
              className="w-full justify-center"
              onClick={() => {
                onClose();
                navigate("/auth");
              }}
            >
              Log in
            </Button>
            <Button
              className="w-full justify-center bg-primary hover:bg-primary/90 rounded-full"
              onClick={() => {
                onClose();
                navigate("/auth?tab=register");
              }}
            >
              Sign up
            </Button>
          </>
        )}
      </nav>
    </div>
  );
};

export default MobileNavigation;
