/**
 * supabaseClient.js
 * Initializes and exports the Supabase client.
 * All API keys are loaded from process.env (injected at build time or via Vercel).
 * NEVER hardcode secrets here.
 */

// ─── Pull config from process.env (Vercel / Build-time injection) ────────────
const SUPABASE_URL = "https://weitpjwnirukoupcpqbe.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndlaXRwanduaXJ1a291cGNwcWJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNDM5MTIsImV4cCI6MjA5MDYxOTkxMn0.mroswG3Gf-l_h9xPl7r8-p2IOyDqTUqH_FBJwyJmIS4";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

// Attach to window for global access
window.supabaseClient = supabaseClient;
