// Generation engines ("motores"): list their status for team members and
// let the owner save, test and toggle each engine's API key. Keys are
// encrypted before they are written and are never returned to the browser.

import { requireMember, requireOwner, errorResponse, HttpError } from '@/lib/server/session';
import { encryptSecret, keyHint } from '@/lib/server/secrets';
import { ENGINES } from '@/lib/engines';

export const dynamic = 'force-dynamic';

const APIMART = process.env.APIMART_BASE_URL || 'https://api.apimart.ai';

/** Check a key against the provider before saving it. */
async function testKey(engineId, key) {
  if (engineId === 'apimart') {
    const res = await fetch(`${APIMART}/v1/balance`, { headers: { Authorization: `Bearer ${key}` }, cache: 'no-store' });
    if (res.status === 401) throw new HttpError(400, 'A APIMart recusou essa chave.');
    if (!res.ok) throw new HttpError(502, `Não foi possível validar na APIMart (${res.status}).`);
    return;
  }
  if (engineId === 'muapi') {
    if (key.length < 10) throw new HttpError(400, 'Chave da Muapi muito curta.');
    return; // Muapi has no free validation endpoint
  }
  throw new HttpError(400, 'Motor desconhecido.');
}

export async function GET(request) {
  try {
    const { supabase, role } = await requireMember(request);
    const { data, error } = await supabase.from('engines').select('id, enabled, key_hint, updated_by, updated_at, key_ciphertext');
    if (error) throw new HttpError(500, error.message);
    const rows = Object.fromEntries((data || []).map((r) => [r.id, r]));
    return Response.json({
      role,
      engines: ENGINES.map((engine) => ({
        ...engine,
        enabled: Boolean(rows[engine.id]?.enabled),
        configured: Boolean(rows[engine.id]?.key_ciphertext),
        keyHint: rows[engine.id]?.key_hint || null,
        updatedBy: rows[engine.id]?.updated_by || null,
        updatedAt: rows[engine.id]?.updated_at || null,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PUT(request) {
  try {
    const { supabase, email } = await requireOwner(request);
    const body = await request.json().catch(() => ({}));
    const engine = ENGINES.find((e) => e.id === body.id);
    if (!engine) throw new HttpError(400, 'Motor desconhecido.');

    const patch = { updated_by: email, updated_at: new Date().toISOString() };
    if (typeof body.key === 'string') {
      const key = body.key.trim();
      if (!key) {
        patch.key_ciphertext = null;
        patch.key_hint = null;
        patch.enabled = false;
      } else {
        await testKey(engine.id, key);
        patch.key_ciphertext = encryptSecret(key);
        patch.key_hint = keyHint(key);
        patch.enabled = body.enabled !== false;
      }
    } else if (typeof body.enabled === 'boolean') {
      patch.enabled = body.enabled;
    }

    const { data, error } = await supabase.from('engines').update(patch).eq('id', engine.id).select('id, enabled, key_hint').maybeSingle();
    if (error) throw new HttpError(500, error.message);
    if (!data) throw new HttpError(403, 'Sem permissão para alterar este motor.');
    return Response.json({ ok: true, engine: data });
  } catch (err) {
    return errorResponse(err);
  }
}
