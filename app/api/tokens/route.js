// Personal access tokens for Codex / MCP. The full token is shown once on
// creation; only its SHA-256 hash is stored.

import { requireMember, errorResponse, HttpError } from '@/lib/server/session';
import { newAccessToken, sha256 } from '@/lib/server/secrets';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { supabase, email } = await requireMember(request);
    const { data, error } = await supabase
      .from('access_tokens')
      .select('id, label, token_hint, created_at, last_used_at')
      .eq('email', email)
      .order('created_at', { ascending: false });
    if (error) throw new HttpError(500, error.message);
    return Response.json({ tokens: data || [] });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request) {
  try {
    const { supabase, email } = await requireMember(request);
    const body = await request.json().catch(() => ({}));
    const label = String(body.label || 'Codex').trim().slice(0, 60) || 'Codex';
    const token = newAccessToken();
    const { data, error } = await supabase
      .from('access_tokens')
      .insert({ email, label, token_hash: sha256(token), token_hint: `${token.slice(0, 8)}…${token.slice(-4)}` })
      .select('id, label, token_hint, created_at')
      .single();
    if (error) throw new HttpError(500, error.message);
    return Response.json({ token, record: data }, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(request) {
  try {
    const { supabase, email } = await requireMember(request);
    const id = new URL(request.url).searchParams.get('id');
    if (!id) throw new HttpError(400, 'id é obrigatório');
    const { error } = await supabase.from('access_tokens').delete().eq('id', id).eq('email', email);
    if (error) throw new HttpError(500, error.message);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
