
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/SupabaseAuthContext";
import { toast } from "sonner";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, ArrowLeft } from "lucide-react";
import LoadingDisplay from "@/components/ui/LoadingDisplay";
import { isEmailNotConfirmed, resendConfirmationEmail } from "@/contexts/auth/AuthHandlers";

const LoginForm = () => {
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const { login, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  
  // Effect to handle redirect after successful login
  useEffect(() => {
    if (isAuthenticated && user) {
      console.log("Login successful, redirecting to:", user.role);
      const rolePath = user.role.toLowerCase();
      navigate(`/${rolePath}`);
    }
  }, [isAuthenticated, user, navigate]);
  
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) {
      toast.error("Please enter both email and password");
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      await login(loginEmail, loginPassword);
    } catch (error) {
      console.error("Login failed:", error);
      // Never confirmed their email: send the link again and show where to find it
      if (isEmailNotConfirmed(error)) {
        const email = loginEmail.trim();
        // Already sent in the last minute is fine: the earlier email still works
        await resendConfirmationEmail(email).catch((e) => console.warn("Resend failed:", e));
        navigate("/auth/check-email", { state: { email, fromLogin: true } });
      }
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const toggleShowPassword = () => {
    setShowPassword(!showPassword);
  };
  
  return (
    <div className="space-y-6">
      <div className="flex items-center mb-4">
        <Button variant="ghost" size="sm" asChild className="p-0 mr-2">
          <Link to="/">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Home
          </Link>
        </Button>
      </div>
      
      <form onSubmit={handleLogin} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="adekunle@example.com"
            value={loginEmail}
            onChange={(e) => setLoginEmail(e.target.value)}
            required
          />
        </div>
        
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/auth/reset-password" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              required
            />
            <button 
              type="button"
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500"
              onClick={toggleShowPassword}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        
        <Button
          type="submit"
          className="w-full"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Logging in..." : "Login"}
        </Button>
      </form>
      
      {isSubmitting && (
        <div className="mt-4">
          <div className="flex justify-center">
            <LoadingDisplay size="sm" message="Verifying credentials..." />
          </div>
        </div>
      )}
    </div>
  );
};

export default LoginForm;
