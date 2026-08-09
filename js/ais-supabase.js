// ─────────────────────────────────────────────────────────────────────────────
// AIS shared Supabase client + roaster-auth helpers
//
// This is the single place the public website talks to Supabase. It points at
// the SAME Supabase project as the internal AIS software, so a roaster account
// and its approval status are shared across both.
//
// The anon key below is PUBLIC BY DESIGN — it only allows what Row Level
// Security policies permit. Wholesale pricing is protected by RLS (see
// supabase/roaster-auth.sql): only a signed-in roaster whose profile is
// `approved = true` can read the roaster_prices table. Never put the service
// role key in this file or anywhere client-side.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://lwsxxobinajquhvdryci.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3c3h4b2JpbmFqcXVodmRyeWNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NTQ4NDMsImV4cCI6MjA5NjQzMDg0M30.nHM1H574QcRdwLMdVIp9sC9U0r2kguEAdPU9Ae9vlrg';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'ais-roaster-auth',
  },
});

// ── Auth actions ─────────────────────────────────────────────────────────────

export async function signUp({ email, password, company, contactName }) {
  return supabase.auth.signUp({
    email,
    password,
    options: {
      // Stored on the auth user; a DB trigger copies these into roaster_profiles.
      data: { company: company || null, contact_name: contactName || null },
      emailRedirectTo: `${location.origin}/login.html`,
    },
  });
}

export async function signIn({ email, password }) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

export function onAuthChange(cb) {
  const { data } = supabase.auth.onAuthStateChange((_e, session) => cb(session));
  return () => data.subscription.unsubscribe();
}

// ── Profile / approval ───────────────────────────────────────────────────────
//
// Returns the roaster's profile row, or null if not signed in / no row yet.
// `approved` is the gate that reveals pricing. A brand-new signup has
// approved = false until an AIS admin flips it in Supabase.

export async function getProfile() {
  const session = await getSession();
  if (!session) return null;
  const { data, error } = await supabase
    .from('roaster_profiles')
    .select('id, company, contact_name, approved')
    .eq('id', session.user.id)
    .maybeSingle();
  if (error) {
    console.warn('[ais-supabase] profile fetch failed:', error.message);
    return null;
  }
  return data;
}

// Convenience: resolves to one of 'anonymous' | 'pending' | 'approved'.
export async function getAccessState() {
  const session = await getSession();
  if (!session) return { state: 'anonymous', session: null, profile: null };
  const profile = await getProfile();
  if (profile && profile.approved) {
    return { state: 'approved', session, profile };
  }
  return { state: 'pending', session, profile };
}
