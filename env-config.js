/**
 * env-config.js
 * ─────────────────────────────────────────────────────────────────
 * Replace the placeholder values below with your real credentials.
 * This file is loaded as the VERY FIRST script in every HTML page.
 *
 * ⚠  DO NOT commit real secrets to git.
 *    Add env-config.js to your .gitignore.
 * ─────────────────────────────────────────────────────────────────
 */
window.ENV = {
  // ── Supabase ──────────────────────────────────────────────────
  SUPABASE_URL: 'https://weitpjwnirukoupcpqbe.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndlaXRwanduaXJ1a291cGNwcWJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNDM5MTIsImV4cCI6MjA5MDYxOTkxMn0.mroswG3Gf-l_h9xPl7r8-p2IOyDqTUqH_FBJwyJmIS4',

  // ── Google Gemini (AI) ────────────────────────────────────────
  GEMINI_API_KEY: 'AIzaSyD8Bb7dP1M45cnDR-quLOK7h4HTUC6dUHM',

  // ── YouTube Data API v3 (optional — app works without it) ─────
  YOUTUBE_API_KEY: 'AIzaSyBthk1UeWRCEvXC8rBzWv3Ulf34Jv0YoDo',

  // ── App Meta ──────────────────────────────────────────────────
  APP_NAME: 'Personal OS',
  APP_VERSION: '1.0.0',
};
