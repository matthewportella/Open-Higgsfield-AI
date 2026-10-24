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

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/**
 * Upload a reference file (video, audio or image) to the team's public
 * `media` bucket and return its public URL, which generation APIs can fetch.
 */
export async function uploadToStorage(file) {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('O arquivo passa de 50 MB.');
  const supabase = supabaseBrowser();
  const dot = file.name.lastIndexOf('.');
  const ext = dot > 0 ? file.name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : 'bin';
  const base = (dot > 0 ? file.name.slice(0, dot) : file.name)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'arquivo';
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${base}.${ext}`;
  const { error } = await supabase.storage.from('media').upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw new Error(`Não foi possível enviar o arquivo: ${error.message}`);
  return supabase.storage.from('media').getPublicUrl(path).data.publicUrl;
}
