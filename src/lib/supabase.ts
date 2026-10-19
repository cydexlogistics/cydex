
import { createClient } from '@supabase/supabase-js';
import { type Database } from '@/types/supabase';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/integrations/supabase/config';

// The project's URL and anon key come from the environment (see src/integrations/supabase/config.ts)
const supabaseUrl = SUPABASE_URL;
const supabaseAnonKey = SUPABASE_ANON_KEY;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
