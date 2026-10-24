
import React from 'react';
import { Link } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";

const TabletNavigation = () => {
  return (
    <div className="hidden sm:flex md:hidden">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1">
            Menu <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem asChild>
            <Link to="/">Home</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/#how-it-works">How It Works</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/about">About Us</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/faq">FAQ</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/contact">Contact Us</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export default TabletNavigation;
