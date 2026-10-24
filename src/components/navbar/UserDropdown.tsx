
import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Shield, LogOut, User as UserIcon, MessageSquare, BarChart, Sun, Moon, Monitor } from "lucide-react";
import { User } from "@/types/auth.types";
import { toast } from "sonner";
import { useTheme } from "@/contexts/ThemeContext";
import { getAccountLink } from "@/components/layout/navigationLinks";

interface UserDropdownProps {
  user: User;
  onLogoutClick: () => void;
}

const UserDropdown = ({ user, onLogoutClick }: UserDropdownProps) => {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  const goToDashboard = () => {
    if (user) {
      navigate(`/${user.role.toLowerCase()}`);
    }
  };

  // Profile, or Settings for vendors (admins have neither)
  const account = user ? getAccountLink(user.role) : null;

  const handleMessages = () => {
    toast.info('Messages feature coming soon!');
  };

  const getThemeIcon = () => {
    switch (theme) {
      case 'light':
        return Sun;
      case 'dark':
        return Moon;
      default:
        return Monitor;
    }
  };

  const ThemeIcon = getThemeIcon();

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="relative h-10 w-10 rounded-full"
        >
          <Avatar className="h-10 w-10">
            <AvatarImage src={user.avatar} alt={user.name} />
            <AvatarFallback className="bg-primary/10 text-primary">
              {getInitials(user.name)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">
              {user.name}
            </p>
            <p className="text-xs leading-none text-muted-foreground">
              {user.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={goToDashboard}>
          <BarChart className="mr-2 h-4 w-4" />
          <span>Dashboard</span>
        </DropdownMenuItem>
        {account && (
          <DropdownMenuItem onClick={() => navigate(account.href)}>
            <UserIcon className="mr-2 h-4 w-4" />
            <span>{account.label}</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={handleMessages} className="opacity-60">
          <MessageSquare className="mr-2 h-4 w-4" />
          <span>Messages</span>
          <span className="ml-auto text-xs text-muted-foreground">Coming Soon</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">Theme</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => setTheme('light')} className="cursor-pointer">
          <Sun className="mr-2 h-4 w-4" />
          <span>Light</span>
          {theme === 'light' && <span className="ml-auto text-primary">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')} className="cursor-pointer">
          <Moon className="mr-2 h-4 w-4" />
          <span>Dark</span>
          {theme === 'dark' && <span className="ml-auto text-primary">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')} className="cursor-pointer">
          <Monitor className="mr-2 h-4 w-4" />
          <span>System</span>
          {theme === 'system' && <span className="ml-auto text-primary">✓</span>}
        </DropdownMenuItem>
        {user.role === "ADMIN" && (
          <DropdownMenuItem onClick={() => navigate("/admin")}>
            <Shield className="mr-2 h-4 w-4" />
            <span>Admin Panel</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onLogoutClick}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserDropdown;
