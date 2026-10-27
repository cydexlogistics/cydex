import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";
import AuthLayout from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { resendConfirmationEmail } from "@/contexts/auth/AuthHandlers";
import { errorMessage } from "@/lib/address";

const RESEND_COOLDOWN_SECONDS = 60;

// Shown to customers, vendors and riders right after they sign up, or when they
// try to log in before confirming (the login form has just resent the link).
// The link brings them back to /auth?confirmed=1 to log in.
const CheckEmail = () => {
  const { state } = useLocation();
  const { email, fromLogin } = (state as { email?: string; fromLogin?: boolean } | null) ?? {};
  const [resending, setResending] = useState(false);
  // Supabase only lets the same address resend once a minute
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const resend = async () => {
    if (!email) return;
    setResending(true);
    try {
      await resendConfirmationEmail(email);
      toast.success("We've sent you a new confirmation email");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (error) {
      toast.error(errorMessage(error, "Could not resend the email. Try again in a minute."));
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthLayout>
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild className="p-0">
          <Link to="/auth">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Login
          </Link>
        </Button>
      </div>

      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/15">
          <MailCheck className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold">{fromLogin ? "Confirm your email to log in" : "Check your email"}</h1>
        <p className="mt-2 text-muted-foreground">
          {fromLogin && "You haven't confirmed your email yet. "}
          {email ? (
            <>We've sent {fromLogin ? "a new" : "a"} confirmation link to <strong className="break-words text-foreground">{email}</strong>.</>
          ) : (
            "We've sent a confirmation link to the email you signed up with."
          )}{" "}
          Click it to activate your account, then log in.
        </p>
      </div>

      <ul className="mt-6 space-y-2 rounded-lg bg-muted p-4 text-sm text-muted-foreground">
        <li>Can't find it? Check your spam or promotions folder.</li>
        <li>The link can only be used once. If it has expired, resend it below.</li>
        <li>Wrong email address? Go back and sign up again with the right one.</li>
      </ul>

      <div className="mt-6 space-y-2">
        {email && (
          <Button variant="outline" className="w-full" onClick={resend} disabled={resending || cooldown > 0}>
            {resending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {cooldown > 0 ? `Resend email in ${cooldown}s` : "Resend email"}
          </Button>
        )}
        <Button asChild className="w-full">
          <Link to="/auth">Go to Login</Link>
        </Button>
      </div>
    </AuthLayout>
  );
};

export default CheckEmail;
