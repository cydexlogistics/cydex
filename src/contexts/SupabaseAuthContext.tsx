
import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { UserRole, AuthContextType } from '@/types/auth.types';
import { 
  handleLogin, 
  handleRegister, 
  handleLogout, 
  handleResetPassword, 
  handleVerifyEmail 
} from './auth/AuthHandlers';
import { walletSetupService } from '@/services/walletSetupService';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [walletSetupAttempted, setWalletSetupAttempted] = useState(false);

  useEffect(() => {
    console.log('SupabaseAuthContext - Setting up auth listener');
    
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event, session?.user?.id);
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          console.log('User authenticated, fetching profile...');
          // Fetch user profile without blocking authentication
          setTimeout(async () => {
            try {
              const { data: profileData, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .single();
              
              if (error) {
                console.error('Error fetching profile:', error);
                // Create a basic profile if none exists
                const fallbackProfile = {
                  id: session.user.id,
                  name: session.user.email?.split('@')[0] || 'User',
                  email: session.user.email,
                  role: 'CUSTOMER',
                  verified: false
                };
                console.log('Creating fallback profile:', fallbackProfile);
                setProfile(fallbackProfile);
              } else {
                // Normalize role to uppercase to match expected format
                const normalizedProfile = {
                  ...profileData,
                  role: profileData.role?.toUpperCase() || 'CUSTOMER'
                };
                console.log('Profile loaded:', normalizedProfile);
                setProfile(normalizedProfile);
              }
            } catch (error) {
              console.error('Profile fetch error:', error);
              // Fallback profile
              const fallbackProfile = {
                id: session.user.id,
                name: session.user.email?.split('@')[0] || 'User',
                email: session.user.email,
                role: 'CUSTOMER',
                verified: false
              };
              console.log('Creating error fallback profile:', fallbackProfile);
              setProfile(fallbackProfile);
            }
          }, 0);
        } else {
          console.log('User signed out, clearing profile');
          setProfile(null);
        }
        
        setLoading(false);
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('Initial session check:', session?.user?.id);
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    // Reset wallet setup tracker whenever the active profile changes
    setWalletSetupAttempted(false);
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id || !profile?.role) return;
    if (walletSetupAttempted) return;

    const setupPromise = walletSetupService.ensureWalletSetup({
      id: profile.id,
      role: profile.role,
      name: profile.name,
      email: profile.email,
      phone: profile.phone,
    });

    if (setupPromise) {
      setupPromise.finally(() => setWalletSetupAttempted(true));
    } else {
      setWalletSetupAttempted(true);
    }
  }, [profile?.id, profile?.role, profile?.name, profile?.email, profile?.phone, walletSetupAttempted]);

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      await handleLogin(email, password);
    } finally {
      setLoading(false);
    }
  };

  const register = async (name: string, email: string, password: string, role: UserRole, referralCode?: string) => {
    setLoading(true);
    try {
      await handleRegister(name, email, password, role, referralCode);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    const result = await handleLogout();
    
    // Clear local state regardless of API response
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  const changePassword = async (email: string, code: string, password: string) => {
    try {
      // This would be handled by Supabase's built-in password reset flow
      console.info('Please use the link sent to your email to reset your password');
    } catch (error: any) {
      console.error('Change password error:', error);
      throw error;
    }
  };

  // Create user object compatible with existing types
  const authUser = profile ? {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    role: profile.role as UserRole,
    verified: profile.verified || false,
    avatar: profile.avatar,
  } : null;

  console.log('SupabaseAuthContext state:', {
    sessionExists: !!session,
    userExists: !!user,
    profileExists: !!profile,
    authUserExists: !!authUser,
    isAuthenticated: !!user,
    loading
  });

  const value: AuthContextType = {
    user: authUser,
    loading,
    login,
    register,
    logout,
    isAuthenticated: !!user, // Base authentication on session user, not profile
    verifyEmail: handleVerifyEmail,
    resetPassword: handleResetPassword,
    updatePassword: async () => false,
    enableMFA: async () => {},
    verifyMFA: async () => false,
    isSessionExpired: () => false,
    refreshSession: () => {},
    changePassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
