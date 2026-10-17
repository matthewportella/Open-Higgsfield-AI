// Remote MCP server (Streamable HTTP, stateless, JSON responses) so Codex
// can create videos on this platform. Authenticate with the caller's APIMart
// key as a Bearer token; it is used only for that request and never stored.

import { TOOLS, ToolError } from '@/lib/mcp/tools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SUPPORTED_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_INFO = { name: 'open-higgsfield-video', title: 'Open Higgsfield · Vídeo', version: '1.0.0' };
const INSTRUCTIONS =
  'Ferramentas para gerar vídeos com Seedance 2.5 na plataforma Open Higgsfield, usando o saldo APIMart do usuário. '
  + 'Fluxo: create_video -> wait_for_video (repita até completed) -> entregue video_url e open_in_studio. '
  + 'Para arquivos locais de imagem, use upload_image e passe o link em image_urls. Gerar vídeo custa dinheiro.';

const rpcResult = (id, result) => ({ jsonrpc: '2.0', id, result });
const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

function bearer(request) {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
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
      if (!ctx.key) {
        return rpcResult(id, {
          isError: true,
          content: [{ type: 'text', text: 'Falta a chave da APIMart. Configure o servidor MCP com Authorization: Bearer <sua chave APIMart>.' }],
        });
      }
      try {
        const output = await tool.run(params.arguments || {}, ctx);
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
  const ctx = { key: bearer(request), origin: new URL(request.url).origin };
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
