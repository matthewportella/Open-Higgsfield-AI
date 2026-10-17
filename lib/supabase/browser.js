'use client';

import { createClient } from '@supabase/supabase-js';

let client;

/** Browser Supabase client; the session is remembered in this browser. */
export function supabaseBrowser() {
  if (!client) {
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'ohf-auth' },
    });
  }
  return client;
}

/** Current access token (refreshed automatically when it is about to expire). */
export async function accessToken() {
  const { data } = await supabaseBrowser().auth.getSession();
  return data.session?.access_token || null;
}

/** fetch() against this app's API with the signed-in user's session. */
export async function apiFetch(path, init = {}) {
  const token = await accessToken();
  const response = await fetch(path, {
    ...init,
    headers: { ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || `Erro ${response.status}`);
  return data;
}
