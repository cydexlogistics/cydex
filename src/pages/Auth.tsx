
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/SupabaseAuthContext";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AuthLayout from "@/components/auth/AuthLayout";
import LoginForm from "@/components/auth/LoginForm";
import SignupForm from "@/components/auth/SignupForm";
import LoadingDisplay from "@/components/ui/LoadingDisplay";

// Login / sign up. Also the installed app's start page: anyone already signed
// in goes straight to their own home (/customer, /vendor, /rider or /admin).
// Coming back from the sign-up confirmation email (?confirmed=1), they're shown
// the login form instead: the link signs them in, so they're signed out first.
const Auth = () => {
  const { isAuthenticated, user, loading } = useAuth();
  const [searchParams] = useSearchParams();
  // ?ref=CODE is a referral link: open Sign up with the code filled in
  const defaultTab = searchParams.get('tab') === 'register' || searchParams.get('ref') ? 'signup' : 'login';
  const navigate = useNavigate();
  // True once the saved session has been checked. `loading` alone also turns on
  // during a login attempt, which mustn't hide (and reset) the form.
  const [sessionChecked, setSessionChecked] = useState(false);
  // Read once on arrival, before anything changes the address
  const confirming = useRef(searchParams.get('confirmed') === '1');
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (!confirming.current) return;
    // Supabase puts a failed link's reason after the #
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const failed = hash.get('error_description');
    supabase.auth.signOut().finally(() => {
      confirming.current = false;
      setConfirmed(true);
      navigate('/auth', { replace: true });
      if (failed) {
        toast.error('That confirmation link has expired or was already used. Log in, or sign up again for a new link.');
      } else {
        toast.success('Your email is confirmed. Log in to continue.');
      }
    });
  }, [navigate]);

  useEffect(() => {
    if (!loading) setSessionChecked(true);
  }, [loading]);

  useEffect(() => {
    if (confirming.current) return;
    if (isAuthenticated && user) {
      // replace: so Back doesn't return to the login page
      navigate(`/${user.role.toLowerCase()}`, { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  // No login form flash while checking the session, loading the profile (which
  // holds the role) or on the way to the dashboard
  if (!sessionChecked || isAuthenticated || (confirming.current && !confirmed)) {
    return <LoadingDisplay fullScreen message="Opening Cydex..." size="md" />;
  }

  return (
    <AuthLayout>
      <Tabs defaultValue={confirmed ? 'login' : defaultTab}>
        <TabsList className="w-full mb-6">
          <TabsTrigger value="login">Login</TabsTrigger>
          <TabsTrigger value="signup">Sign Up</TabsTrigger>
        </TabsList>
        
        <TabsContent value="login">
          <LoginForm />
        </TabsContent>
        
        <TabsContent value="signup">
          <SignupForm />
        </TabsContent>
      </Tabs>
    </AuthLayout>
  );
};

export default Auth;
