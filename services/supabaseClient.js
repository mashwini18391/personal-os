/**
 * supabaseClient.js
 * Initializes and exports the Supabase client.
 * All API keys are loaded from window.ENV (set via env-config.js or injected at build time).
 * NEVER hardcode secrets here.
 */

// ─── Pull config from the global ENV object injected by env-config.js ───────
const SUPABASE_URL = window.ENV?.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.ENV?.SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    '[SupabaseClient] Missing SUPABASE_URL or SUPABASE_ANON_KEY. ' +
    'Make sure env-config.js is loaded before this script.'
  );
}

// ─── Create the singleton Supabase client ────────────────────────────────────
const { createClient } = supabase; // Loaded via CDN in HTML
export const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default supabaseClient;
