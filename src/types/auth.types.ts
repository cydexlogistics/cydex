
// Define user roles - matching backend format
export type UserRole = 'CUSTOMER' | 'RIDER' | 'VENDOR' | 'ADMIN';

// Define user interface
export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  verified: boolean;
  mfaEnabled?: boolean;
  lastActive?: string;
  carbonCredits?: number;
}

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, role: UserRole, referralCode?: string) => Promise<{ needsEmailConfirmation: boolean } | void>;
  logout: () => void;
  isAuthenticated: boolean;
  verifyEmail: (token: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (token: string, newPassword: string) => Promise<boolean>;
  enableMFA: () => Promise<void>;
  verifyMFA: (code: string) => Promise<boolean>;
  isSessionExpired: () => boolean;
  refreshSession: () => void;
  changePassword: (email: string, code: string, password: string) => Promise<void>;
}
