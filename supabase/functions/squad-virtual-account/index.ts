// Creates the signed-in user's Squad virtual account (the account number they
// can pay into their wallet from any bank), called from the app at login.
//   {}  -> { status: 'exists' | 'created', account }
//          { status: 'unavailable' | 'incomplete' | 'not_applicable', message }
// Squad is called here, with the SQUAD_SECRET_KEY secret, so the key never
// reaches the browser. The row is saved with the service role; the database
// then links it to the user's wallet (link_wallet_to_virtual_account).
// Secrets: SQUAD_SECRET_KEY, SQUAD_API_URL (see ../_shared/squad.ts) and
// optionally SQUAD_VIRTUAL_ACCOUNT_PREFIX (default CYDEX).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { adminClient, corsHeaders, json, squadApiUrl, squadSecret } from '../_shared/squad.ts';

type Role = 'customer' | 'vendor' | 'rider';

const DEFAULT_BANK = { name: 'Guaranty Trust Bank', code: '058' };
const ACCOUNT_FIELDS = 'id, account_number, account_name, bank_name, bank_code';

const isAllocationError = (message: string) => /allocation/i.test(message);

async function squad(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${squadApiUrl()}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${squadSecret()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.status !== 200 || !data?.data) {
    throw new Error(data?.message || data?.error || `Squad request failed (${res.status})`);
  }
  return data.data as Record<string, unknown>;
}

// A dynamic virtual account first (needs an account allocation from Squad),
// then a regular one if dynamic accounts aren't allocated to Cydex
async function createSquadAccount(p: {
  customerIdentifier: string; firstName: string; lastName: string; email: string; phone: string | null;
}) {
  try {
    return await squad('/virtual-account/create-dynamic-virtual-account', {
      first_name: p.firstName,
      last_name: p.lastName,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isAllocationError(message)) throw error;
    // Regular (B2C) accounts ask for more than Cydex collects; this usually
    // needs Squad to enable it for the account
    return await squad('/virtual-account', {
      first_name: p.firstName,
      last_name: p.lastName,
      customer_identifier: p.customerIdentifier,
      mobile_num: p.phone || '08000000000',
      dob: '01/01/1990',
      bvn: '',
      gender: '1',
      address: 'Nigeria',
      email: p.email,
    });
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Please sign in again' }, 401);

    const db = adminClient();
    const { data: profile } = await db.from('profiles').select('id, role, name, email, phone').eq('id', user.id).maybeSingle();
    const role = String(profile?.role ?? '').toLowerCase() as Role;
    if (!profile || !['customer', 'vendor', 'rider'].includes(role)) {
      return json({ status: 'not_applicable', message: 'Only customers, vendors and riders have virtual accounts' });
    }

    const existing = await db.from('virtual_accounts').select(ACCOUNT_FIELDS).eq('profile_id', user.id).eq('role', role).maybeSingle();
    if (existing.data) return json({ status: 'exists', account: existing.data });

    const name = String(profile.name ?? '').trim();
    const email = String(profile.email ?? user.email ?? '').trim();
    if (!name || !email) {
      return json({ status: 'incomplete', message: 'Add your name and email to your profile first' });
    }
    const [firstName, ...rest] = name.split(/\s+/);
    const lastName = rest.join(' ') || firstName;
    const prefix = Deno.env.get('SQUAD_VIRTUAL_ACCOUNT_PREFIX') || 'CYDEX';
    const customerIdentifier = `${prefix}_${role}_${user.id.slice(0, 8)}`.toUpperCase();

    let account: Record<string, unknown>;
    try {
      account = await createSquadAccount({ customerIdentifier, firstName, lastName, email, phone: profile.phone ?? null });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Not set up with Squad yet: the wallet works without a virtual account
      if (isAllocationError(message)) {
        return json({ status: 'unavailable', message: 'Virtual accounts aren\'t available yet' });
      }
      throw error;
    }

    const saved = await db
      .from('virtual_accounts')
      .insert({
        profile_id: user.id,
        role,
        squad_customer_identifier: String(account.customer_identifier ?? customerIdentifier),
        account_number: String(account.virtual_account_number ?? account.account_number ?? ''),
        account_name: String(account.account_name ?? name),
        bank_name: String(account.bank_name ?? DEFAULT_BANK.name),
        bank_code: String(account.bank_code ?? DEFAULT_BANK.code),
        metadata: { ...account, generated_customer_identifier: customerIdentifier },
      })
      .select(ACCOUNT_FIELDS)
      .single();

    if (saved.error) {
      // Two logins at once: the other request saved it first
      const again = await db.from('virtual_accounts').select(ACCOUNT_FIELDS).eq('profile_id', user.id).eq('role', role).maybeSingle();
      if (again.data) return json({ status: 'exists', account: again.data });
      throw new Error(saved.error.message);
    }
    return json({ status: 'created', account: saved.data });
  } catch (error) {
    console.error('squad-virtual-account error:', error);
    return json({ error: error instanceof Error ? error.message : 'Could not set up the virtual account' }, 500);
  }
});
