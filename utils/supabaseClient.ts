import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Project identifiers, NOT secrets. The anon key is designed to ship in client
// code; access is gated by the row-level-security policy on orbit_snapshots
// (each user can only read/write their own row). See docs/CLOUD-SYNC.md.
const SUPABASE_URL = 'https://tcnaiawfwdfvmdagqpai.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjbmFpYXdmd2Rmdm1kYWdxcGFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzMDQ5NjMsImV4cCI6MjA5OTg4MDk2M30.u3j5bf3ABex8mbEgXdw1Nj_xDNUgkZcv2UDZBtmcRv4';

export const SNAPSHOT_TABLE = 'orbit_snapshots';

// One shared client. persistSession keeps you signed in across reloads;
// detectSessionInUrl completes the magic-link redirect automatically.
export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
