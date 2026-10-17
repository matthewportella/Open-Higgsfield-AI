// Remote MCP server (Streamable HTTP, stateless, JSON responses) so Codex
// can create videos on this platform. Authenticate with a studio access
// token (ohf_…) created under APIs → Codex; the team's APIMart key is read
// from the database and every video is saved in the shared history.

import { TOOLS, ToolError } from '@/lib/mcp/tools';
import { anonClient } from '@/lib/server/session';
import { decryptSecret, sha256 } from '@/lib/server/secrets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SUPPORTED_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_INFO = { name: 'open-higgsfield-video', title: 'Open Higgsfield · Vídeo', version: '1.0.0' };
const INSTRUCTIONS =
  'Ferramentas para gerar vídeos com Seedance 2.5 na plataforma Open Higgsfield, usando o saldo APIMart da equipe. '
  + 'Fluxo: create_video -> wait_for_video (repita até completed) -> entregue video_url. Todo vídeo entra no histórico do estúdio. '
  + 'Para arquivos locais de imagem, use upload_image e passe o link em image_urls. Gerar vídeo custa dinheiro.';

const rpcResult = (id, result) => ({ jsonrpc: '2.0', id, result });
const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

function bearer(request) {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

/** Resolve a studio token into the team's APIMart key and history writers. */
async function resolveToken(token) {
  if (!token.startsWith('ohf_')) {
    throw new ToolError('Use o token do estúdio (começa com ohf_). Gere em APIs → Codex dentro da plataforma.');
  }
  const tokenHash = sha256(token);
  const supabase = anonClient();
  const { data, error } = await supabase.rpc('mcp_session', { p_token_hash: tokenHash });
  if (error) throw new ToolError(`Erro ao validar o token: ${error.message}`);
  const session = Array.isArray(data) ? data[0] : data;
  if (!session?.email) throw new ToolError('Token inválido ou revogado. Gere um novo em APIs → Codex.');
  if (!session.apimart_ciphertext || !session.apimart_enabled) {
    throw new ToolError('O motor APIMart não está ativo no estúdio. Configure a chave em APIs.');
  }
  return {
    key: decryptSecret(session.apimart_ciphertext),
    email: session.email,
    record: async (row) => {
      const { error: e } = await supabase.rpc('mcp_record_generation', { p_token_hash: tokenHash, p_row: row });
      if (e) throw e;
    },
    update: async (taskId, patch) => {
      const { error: e } = await supabase.rpc('mcp_update_generation', { p_token_hash: tokenHash, p_task_id: taskId, p_patch: patch });
      if (e) throw e;
    },
  };
}

async function handle(message, ctx) {
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return rpcError(message?.id, -32600, 'Invalid Request');
  }
  const { id, method, params = {} } = message;
  const isNotification = id === undefined || id === null;
  if (isNotification) return null; // notifications/initialized, cancelled, …

  switch (method) {
    case 'initialize': {
      const requested = params.protocolVersion;
      return rpcResult(id, {
        protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : SUPPORTED_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return rpcResult(id, {});
    case 'tools/list':
      return rpcResult(id, {
        tools: TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations })),
      });
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === params.name);
      if (!tool) return rpcError(id, -32602, `Ferramenta desconhecida: ${params.name}`);
      if (!ctx.token) {
        return rpcResult(id, {
          isError: true,
          content: [{ type: 'text', text: 'Falta o token do estúdio. Gere em APIs → Codex e configure Authorization: Bearer ohf_…' }],
        });
      }
      try {
        const session = await resolveToken(ctx.token);
        const output = await tool.run(params.arguments || {}, { ...ctx, ...session });
        return rpcResult(id, { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }], structuredContent: output, isError: false });
      } catch (err) {
        const text = err instanceof ToolError ? err.message : `Erro inesperado: ${err.message}`;
        return rpcResult(id, { isError: true, content: [{ type: 'text', text }] });
      }
    }
    default:
      return rpcError(id, -32601, `Método não suportado: ${method}`);
  }
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(rpcError(null, -32700, 'Parse error'), { status: 400 });
  }
  const ctx = { token: bearer(request), origin: new URL(request.url).origin };
  const messages = Array.isArray(body) ? body : [body];
  const replies = (await Promise.all(messages.map((m) => handle(m, ctx)))).filter(Boolean);
  if (replies.length === 0) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(body) ? replies : replies[0], {
    headers: { 'cache-control': 'no-store' },
  });
}

export function GET() {
  // No server-initiated stream: this server only answers requests.
  return new Response('Use POST para falar com este servidor MCP.', { status: 405, headers: { Allow: 'POST' } });
}

export function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: 'POST' } });
}
