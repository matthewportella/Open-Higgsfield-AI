// Server-side helpers: authenticate a request with the caller's Supabase
// session (Authorization: Bearer <access token>) and read engine keys
// through row level security as that user.

import { createClient } from '@supabase/supabase-js';
import { decryptSecret } from './secrets';

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Supabase client with no user session (used for token-checked RPCs). */
export function anonClient() {
  return createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Supabase client acting as the user who owns `accessToken`. */
export function userClient(accessToken) {
  return createClient(URL_, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export function bearerToken(request) {
  const match = (request.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

/**
 * Resolve the signed-in team member for a request.
 * Returns { supabase, email, role } or throws HttpError(401/403).
 */
export async function requireMember(request) {
  const token = bearerToken(request);
  if (!token) throw new HttpError(401, 'Faça login para continuar.');
  const supabase = userClient(token);
  const { data: userData, error } = await supabase.auth.getUser(token);
  if (error || !userData?.user) throw new HttpError(401, 'Sessão expirada. Entre de novo.');
  const email = (userData.user.email || '').toLowerCase();
  const { data: member } = await supabase.from('members').select('email, role').eq('email', email).maybeSingle();
  if (!member) throw new HttpError(403, 'Seu e-mail não faz parte da equipe deste estúdio.');
  return { supabase, email, role: member.role };
}

export async function requireOwner(request) {
  const ctx = await requireMember(request);
  if (ctx.role !== 'owner') throw new HttpError(403, 'Só o dono do estúdio pode fazer isso.');
  return ctx;
}

/** Decrypted API key for an engine, or throws if the engine is off. */
export async function engineKey(supabase, engineId) {
  const { data, error } = await supabase.from('engines').select('enabled, key_ciphertext').eq('id', engineId).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!data?.key_ciphertext) throw new HttpError(409, `O motor ${engineId} ainda não tem chave. Configure em APIs.`);
  if (!data.enabled) throw new HttpError(409, `O motor ${engineId} está desativado. Ative em APIs.`);
  return decryptSecret(data.key_ciphertext);
}

export function errorResponse(err) {
  const status = err instanceof HttpError ? err.status : 500;
  return Response.json({ error: { message: err.message || 'Erro inesperado' } }, { status });
}
