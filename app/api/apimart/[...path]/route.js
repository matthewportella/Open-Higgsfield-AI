// Same-origin proxy for APIMart (https://api.apimart.ai). The caller signs
// in with their studio session; the team's APIMart key is read from the
// database (encrypted) and added server-side, so it never reaches browsers.
// Only the endpoints the studio needs are allowed through.

import { requireMember, engineKey, errorResponse } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

const UPSTREAM = process.env.APIMART_BASE_URL || 'https://api.apimart.ai';

const ALLOWED = [
  { method: 'POST', pattern: /^v1\/videos\/generations$/ },
  { method: 'POST', pattern: /^v1\/uploads\/images$/ },
  { method: 'GET', pattern: /^v1\/tasks\/[A-Za-z0-9_-]+$/ },
  { method: 'GET', pattern: /^v1\/user\/balance$/ },
  { method: 'GET', pattern: /^v1\/balance$/ },
];

async function forward(request, { params }) {
  const { path } = await params;
  const joined = (path || []).join('/');
  const allowed = ALLOWED.some((rule) => rule.method === request.method && rule.pattern.test(joined));
  if (!allowed) {
    return Response.json({ error: { message: 'Endpoint not allowed' } }, { status: 404 });
  }

  let key;
  try {
    const { supabase } = await requireMember(request);
    key = await engineKey(supabase, 'apimart');
  } catch (err) {
    return errorResponse(err);
  }

  const headers = { Authorization: `Bearer ${key}` };
  const contentType = request.headers.get('content-type');
  if (contentType) headers['Content-Type'] = contentType;

  const search = new URL(request.url).search;
  const upstream = await fetch(`${UPSTREAM}/${joined}${search}`, {
    method: request.method,
    headers,
    body: request.method === 'GET' ? undefined : await request.arrayBuffer(),
    cache: 'no-store',
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') || 'application/json',
      'cache-control': 'no-store',
    },
  });
}

export const GET = forward;
export const POST = forward;
