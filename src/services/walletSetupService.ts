import { supabase } from '@/integrations/supabase/client';
import { invokeFunction } from '@/lib/edgeFunctions';

type WalletRole = 'customer' | 'vendor' | 'rider';

interface WalletSetupUser {
  id: string;
  role: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

type VirtualAccountResult =
  | { status: 'exists' | 'created'; account: { account_number: string; bank_name: string } }
  | { status: 'unavailable' | 'incomplete' | 'not_applicable'; message: string };

// At login: makes sure the user has a wallet, and a Squad virtual account
// (an account number they can pay into their wallet from any bank).
// The virtual account is created by the squad-virtual-account Edge Function,
// so the Squad secret key stays on the server. Neither step blocks the app:
// a wallet works without a virtual account.
class WalletSetupService {
  private pendingSetups: Map<string, Promise<void>> = new Map();

  ensureWalletSetup(user?: WalletSetupUser | null): Promise<void> | undefined {
    if (!user?.id || !user.role) return;

    const role = this.normalizeRole(user.role);
    if (!role) return;

    const key = `${user.id}:${role}`;
    if (this.pendingSetups.has(key)) {
      return this.pendingSetups.get(key);
    }

    const promise = this.runSetup(user.id, role)
      .catch((error) => {
        console.error('Wallet setup failed:', error);
      })
      .finally(() => {
        this.pendingSetups.delete(key);
      });

    this.pendingSetups.set(key, promise);
    return promise;
  }

  private normalizeRole(role: string): WalletRole | null {
    const normalized = role.toLowerCase();
    if (normalized === 'customer' || normalized === 'vendor' || normalized === 'rider') {
      return normalized;
    }
    return null;
  }

  private async runSetup(userId: string, role: WalletRole) {
    // Wallets are created by the database (at signup, or here if missing);
    // users can read their wallet but never write it.
    const { data, error } = await supabase.rpc('ensure_my_wallet');
    if (error || !data?.[0]) {
      throw new Error(error?.message || 'Wallet not found');
    }

    const result = await invokeFunction<VirtualAccountResult>('squad-virtual-account', {});
    if (result.status === 'unavailable' || result.status === 'incomplete') {
      console.warn(`[WalletSetup] No virtual account for ${role} ${userId}: ${result.message}`);
    }
  }
}

export const walletSetupService = new WalletSetupService();
