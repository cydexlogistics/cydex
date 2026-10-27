
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { UserRole } from '@/types/auth.types';
import { cleanupAuthState, forceRedirectToAuth, forceReload } from './AuthCleanup';

// Supabase only says this once the password is right, so it doesn't reveal
// which emails have accounts
export const isEmailNotConfirmed = (error: unknown) => {
  const e = error as { code?: string; message?: string } | null;
  return e?.code === 'email_not_confirmed' || /email not confirmed/i.test(e?.message ?? '');
};

// Sends the sign-up confirmation email again (Supabase allows one a minute per address).
// The link comes back to the login page.
export const resendConfirmationEmail = async (email: string) => {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: `${window.location.origin}/auth?confirmed=1` },
  });
  if (error) throw error;
};

export const handleLogin = async (email: string, password: string) => {
  try {
    console.log('Attempting login for:', email);
    
    // Clean up any existing auth state first
    cleanupAuthState();
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    console.log('Login successful for:', email);
    toast.success('Login successful!');
    
    // Force reload to ensure clean state
    forceReload();
  } catch (error: any) {
    console.error('Login error:', error);
    // Unconfirmed email: the login form resends the link and shows the "check your email" page
    if (!isEmailNotConfirmed(error)) toast.error(error.message || 'Login failed');
    throw error;
  }
};

export const handleRegister = async (name: string, email: string, password: string, role: UserRole, referralCode?: string) => {
  try {
    console.log('Attempting registration for:', email, 'with role:', role);
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          role: role.toLowerCase(), // Store as lowercase to match database
          // Checked by the form first; the database links it to whoever shared it
          ...(referralCode ? { referral_code: referralCode } : {}),
        },
        // The confirmation link comes back here; the login page then asks them to log in
        emailRedirectTo: `${window.location.origin}/auth?confirmed=1`
      }
    });

    if (error) {
      console.error('Registration error:', error);
      throw error;
    }

    console.log('Registration successful for:', email);
    
    // Email confirmation required: the sign-up form shows the "check your email" page
    if (data.user && !data.session) {
      return { needsEmailConfirmation: true };
    }
    if (data.session) {
      toast.success('Registration and login successful!');
    }
    return { needsEmailConfirmation: false };
  } catch (error: any) {
    console.error('Registration error:', error);
    toast.error(error.message || 'Registration failed');
    throw error;
  }
};

export const handleLogout = async () => {
  try {
    console.log('Attempting logout');
    
    // Clean up auth state first
    cleanupAuthState();
    
    // Try to sign out, but don't fail if session is missing
    try {
      const { error } = await supabase.auth.signOut({ scope: 'global' });
      if (error && error.message !== 'Auth session missing!') {
        console.error('Logout error:', error);
      }
    } catch (error: any) {
      // Ignore session missing errors as the user is already logged out
      if (!error.message?.includes('Auth session missing')) {
        console.error('Logout error:', error);
      }
    }
    
    toast.info('Logged out successfully');
    
    // Force redirect to auth page
    forceRedirectToAuth();
    return { success: true };
  } catch (error: any) {
    console.error('Logout error:', error);
    
    // Even if logout fails, clear local state and redirect
    cleanupAuthState();
    toast.info('Logged out successfully');
    forceRedirectToAuth();
    return { success: true };
  }
};

export const handleResetPassword = async (email: string) => {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/set-password`,
    });
    if (error) throw error;
    toast.success('Password reset email sent!');
  } catch (error: any) {
    console.error('Reset password error:', error);
    toast.error(error.message || 'Failed to send reset email');
    throw error;
  }
};

export const handleVerifyEmail = async (token: string) => {
  try {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: token,
      type: 'email'
    });
    if (error) throw error;
    toast.success('Email verified successfully!');
  } catch (error: any) {
    console.error('Verify email error:', error);
    toast.error(error.message || 'Failed to verify email');
    throw error;
  }
};
