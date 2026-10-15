// Same-origin proxy for APIMart (https://api.apimart.ai). The browser cannot
// call APIMart directly because of CORS, so the studio sends requests here and
// this route forwards them with the user's key as a Bearer token. Only the
// endpoints the studio needs are allowed through.

const UPSTREAM = 'https://api.apimart.ai';

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

  const key = request.headers.get('x-apimart-key');
  if (!key) {
    return Response.json({ error: { message: 'Missing APIMart API key' } }, { status: 401 });
  }

  const headers = { Authorization: `Bearer ${key}` };
  const contentType = request.headers.get('content-type');
  if (contentType) headers['Content-Type'] = contentType;

  const search = new URL(request.url).search;
  const upstream = await fetch(`${UPSTREAM}/${joined}${search}`, {
    method: request.method,
    headers,
    body: request.method === 'GET' ? undefined : await request.arrayBuffer(),
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
