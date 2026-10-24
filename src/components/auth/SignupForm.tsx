
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/SupabaseAuthContext";
import { UserRole } from "@/types/auth.types";
import { toast } from "sonner";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Eye, EyeOff, ArrowLeft } from "lucide-react";

const SignupForm = () => {
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");
  // A referral link (/auth?ref=CODE&role=vendor) fills in the code and the kind of account
  const [params] = useSearchParams();
  const linkRole = params.get('role')?.toUpperCase();
  const [role, setRole] = useState<UserRole>(
    linkRole === 'RIDER' || linkRole === 'VENDOR' ? (linkRole as UserRole) : "CUSTOMER"
  );
  const [referralCode, setReferralCode] = useState(params.get('ref')?.toUpperCase() ?? "");
  const [referralError, setReferralError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const { register } = useAuth();
  
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!signupName || !signupEmail || !signupPassword || !signupConfirmPassword) {
      toast.error("Please fill out all fields");
      return;
    }
    
    if (signupPassword !== signupConfirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    
    if (signupPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    
    setIsSubmitting(true);
    try {
      // A code only works for the same kind of account, so check it first
      const code = referralCode.replace(/\s/g, '').toUpperCase();
      if (code) {
        const { data: problem, error } = await supabase.rpc('check_referral_code', { p_code: code, p_role: role.toLowerCase() });
        if (error) throw error;
        if (problem) {
          setReferralError(problem);
          return;
        }
      }
      await register(signupName, signupEmail, signupPassword, role, code || undefined);
      
      // Reset form
      setSignupName("");
      setSignupEmail("");
      setSignupPassword("");
      setSignupConfirmPassword("");
      setRole("CUSTOMER");
      setReferralCode("");
    } catch (error) {
      console.error("Signup failed:", error);
    } finally {
      setIsSubmitting(false);
    }
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
      
      <form onSubmit={handleSignup} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Full Name</Label>
          <Input
            id="name"
            type="text"
            placeholder="Oluwasegun Adebayo"
            value={signupName}
            onChange={(e) => setSignupName(e.target.value)}
            required
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="signup-email">Email</Label>
          <Input
            id="signup-email"
            type="email"
            placeholder="oluwasegun@example.com"
            value={signupEmail}
            onChange={(e) => setSignupEmail(e.target.value)}
            required
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="signup-password">Password</Label>
          <div className="relative">
            <Input
              id="signup-password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={signupPassword}
              onChange={(e) => setSignupPassword(e.target.value)}
              required
            />
            <button 
              type="button"
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="confirm-password">Confirm Password</Label>
          <div className="relative">
            <Input
              id="confirm-password"
              type={showConfirmPassword ? "text" : "password"}
              placeholder="••••••••"
              value={signupConfirmPassword}
              onChange={(e) => setSignupConfirmPassword(e.target.value)}
              required
            />
            <button 
              type="button"
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="role">I want to join as a</Label>
          <Select value={role} onValueChange={(value) => { setRole(value as UserRole); setReferralError(null); }}>
            <SelectTrigger id="role" className="w-full">
              <SelectValue placeholder="Select your role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CUSTOMER">Customer</SelectItem>
              <SelectItem value="RIDER">Rider</SelectItem>
              <SelectItem value="VENDOR">Vendor</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="referral-code">Referral code (optional)</Label>
          <Input
            id="referral-code"
            value={referralCode}
            onChange={(e) => { setReferralCode(e.target.value.toUpperCase()); setReferralError(null); }}
            placeholder="e.g. CX7KQ2MP"
            maxLength={12}
            className="font-mono uppercase"
            aria-invalid={!!referralError}
          />
          {referralError ? (
            <p className="text-sm text-destructive">{referralError}</p>
          ) : (
            <p className="text-xs text-muted-foreground">From someone joining as the same kind of account as you.</p>
          )}
        </div>
        
        <Button
          type="submit"
          className="w-full"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Creating Account..." : "Create Account"}
        </Button>
      </form>
    </div>
  );
};

export default SignupForm;
