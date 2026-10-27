
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/SupabaseAuthContext";
import { UserRole } from "@/types/auth.types";
import { toast } from "sonner";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Eye, EyeOff, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const ROLES: { value: UserRole; label: string; hint: string }[] = [
  { value: "CUSTOMER", label: "Customer", hint: "Order from vendors near you and send packages." },
  { value: "VENDOR", label: "Vendor", hint: "Sell your products and get them delivered." },
  { value: "RIDER", label: "Rider", hint: "Deliver orders and earn on your schedule." },
];

const SignupForm = () => {
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");
  // A referral link (/auth?ref=CODE) fills in the code
  const [params] = useSearchParams();
  // Nothing chosen until they pick
  const [role, setRole] = useState<UserRole | null>(null);
  const [roleError, setRoleError] = useState(false);
  const [referralCode, setReferralCode] = useState(params.get('ref')?.toUpperCase() ?? "");
  const [referralError, setReferralError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const { register } = useAuth();
  const navigate = useNavigate();

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

    if (!role) {
      setRoleError(true);
      toast.error("Choose how you want to join");
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
      const result = await register(signupName, signupEmail, signupPassword, role, code || undefined);
      if (result && result.needsEmailConfirmation) {
        navigate('/auth/check-email', { state: { email: signupEmail.trim() } });
        return;
      }

      // Reset form
      setSignupName("");
      setSignupEmail("");
      setSignupPassword("");
      setSignupConfirmPassword("");
      setRole(null);
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
          <Label id="role-label">I want to join as a</Label>
          <div
            role="radiogroup"
            aria-labelledby="role-label"
            aria-invalid={roleError}
            className={cn(
              // One connected bar: the outer buttons draw the dividers, the middle one has no border
              "grid grid-cols-3 overflow-hidden rounded-md border border-input",
              roleError && "border-destructive ring-1 ring-destructive"
            )}
          >
            {ROLES.map((r, i) => (
              <button
                key={r.value}
                type="button"
                role="radio"
                aria-checked={role === r.value}
                onClick={() => { setRole(r.value); setRoleError(false); setReferralError(null); }}
                className={cn(
                  "h-10 px-3 text-sm font-medium transition-colors focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  i === 0 && "border-r border-input",
                  i === ROLES.length - 1 && "border-l border-input",
                  role === r.value
                    ? "bg-primary text-black"
                    : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          {roleError ? (
            <p className="text-sm text-destructive">Choose how you want to join.</p>
          ) : role ? (
            <p className="text-xs text-muted-foreground">{ROLES.find((r) => r.value === role)?.hint}</p>
          ) : null}
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
