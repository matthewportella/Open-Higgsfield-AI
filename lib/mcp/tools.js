// Tools exposed to Codex (and any MCP client) through /api/mcp. They call
// APIMart server-side with the caller's own API key and mirror what the
// Video page does: Seedance 2.5 create / edit / extend, status, balance and
// reference image upload.

// APIMART_BASE_URL lets tests point the tools at a mock server.
const APIMART = process.env.APIMART_BASE_URL || 'https://api.apimart.ai';
const MODEL = 'seedance-2.5';
const PRICE_PER_SECOND = { '480p': 0.096, '720p': 0.216, '1080p': 0.385 };
const RATIOS = ['adaptive', '16:9', '9:16', '1:1', '4:3', '3:4', '21:9'];
const RESOLUTIONS = ['480p', '720p', '1080p'];
const MAX_WAIT_SECONDS = 50;

export class ToolError extends Error {}

/** Encode whitespace and unsafe characters; keep existing %XX escapes. */
function safeMediaUrl(url) {
  return String(url).trim().replace(/[^\x21-\x7E]|["<>\\^`{|}]|%(?![0-9A-Fa-f]{2})/gu, (c) => encodeURIComponent(c));
}

async function apimart(key, path, init = {}) {
  const response = await fetch(`${APIMART}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, ...(init.headers || {}) },
    cache: 'no-store',
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { message: text }; }
  if (!response.ok) {
    throw new ToolError(`APIMart ${response.status}: ${data.error?.message || data.message || 'erro desconhecido'}`);
  }
  return data;
}

function firstUrl(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return firstUrl(value[0]);
  return firstUrl(value.url || value.video_url);
}

function studioLink(origin) {
  return `${origin}/studio`;
}

async function readTask(key, taskId, origin, ctx = {}) {
  if (!/^[A-Za-z0-9_-]{4,}$/.test(taskId || '')) throw new ToolError('task_id inválido');
  const body = await apimart(key, `v1/tasks/${taskId}?language=pt`);
  const task = body.data || body;
  const status = String(task.status || '').toLowerCase();
  if (ctx.update) {
    const mapped = status === 'completed' ? 'completed'
      : ['failed', 'cancelled', 'canceled', 'error'].includes(status) ? 'failed'
      : status === 'processing' ? 'processing' : 'queued';
    await ctx.update(taskId, {
      status: mapped,
      progress: Number(task.progress) || 0,
      url: mapped === 'completed' ? firstUrl(task.result?.videos) : null,
      cost: typeof task.cost === 'number' ? task.cost : null,
      error: task.error?.message || null,
    }).catch(() => {});
  }
  return {
    task_id: taskId,
    status,
    progress: Number(task.progress) || 0,
    video_url: status === 'completed' ? firstUrl(task.result?.videos) : null,
    cost_usd: typeof task.cost === 'number' ? task.cost : null,
    estimated_seconds: Number(task.estimated_time) || null,
    error: task.error?.message || null,
    open_in_studio: studioLink(origin),
  };
}

async function waitForTask(key, taskId, origin, seconds, ctx = {}) {
  const deadline = Date.now() + Math.min(MAX_WAIT_SECONDS, Math.max(1, seconds)) * 1000;
  let last = await readTask(key, taskId, origin, ctx);
  while (!['completed', 'failed', 'cancelled'].includes(last.status) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    last = await readTask(key, taskId, origin, ctx);
  }
  return last;
}

function list(value) {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).filter(Boolean).map(safeMediaUrl);
}

export const TOOLS = [
  {
    name: 'create_video',
    title: 'Criar vídeo (Seedance 2.5)',
    description:
      'Gera um vídeo com Seedance 2.5 pela APIMart usando o saldo da conta do usuário. Modos: "create" (texto + referências opcionais), "extend" (continua source_video_url) e "edit" (altera source_video_url). Referências precisam ser links públicos; para arquivo local use upload_image antes. Cite referências no prompt como @图片1, @视频1, @音频1 (ordem dos arrays). Retorna task_id, custo estimado e o link do estúdio; o vídeo entra automaticamente no histórico compartilhado da equipe. Gerar custa dinheiro: confirme duração e resolução com o usuário quando ele não especificar.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Descrição do vídeo.' },
        mode: { type: 'string', enum: ['create', 'extend', 'edit'], default: 'create' },
        duration: { type: 'integer', minimum: 4, maximum: 30, default: 5, description: 'Segundos (ignorado em edit).' },
        aspect_ratio: { type: 'string', enum: RATIOS, default: '9:16', description: 'Só no modo create.' },
        resolution: { type: 'string', enum: RESOLUTIONS, default: '480p' },
        generate_audio: { type: 'boolean', default: true },
        watermark: { type: 'boolean', default: false },
        image_urls: { type: 'array', items: { type: 'string' }, maxItems: 30, description: 'Imagens de referência (links públicos).' },
        video_urls: { type: 'array', items: { type: 'string' }, maxItems: 10, description: 'Vídeos de referência, 2-30 s cada.' },
        audio_urls: { type: 'array', items: { type: 'string' }, maxItems: 10, description: 'Áudios de referência, 2-30 s cada.' },
        source_video_url: { type: 'string', description: 'Vídeo de origem para extend ou edit.' },
        wait_seconds: { type: 'integer', minimum: 0, maximum: MAX_WAIT_SECONDS, default: 0, description: 'Esperar até N segundos pelo resultado antes de responder.' },
      },
      required: ['prompt'],
      additionalProperties: false,
    },
    annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async run(args, ctx) {
      const { key, origin } = ctx;
      const mode = args.mode || 'create';
      const prompt = String(args.prompt || '').trim();
      if (!prompt) throw new ToolError('prompt é obrigatório');
      const resolution = RESOLUTIONS.includes(args.resolution) ? args.resolution : '480p';
      const duration = Math.min(30, Math.max(4, Math.round(Number(args.duration) || 5)));
      const payload = {
        model: MODEL,
        prompt,
        resolution,
        generate_audio: args.generate_audio !== false,
        watermark: Boolean(args.watermark),
      };
      const images = list(args.image_urls);
      const videos = list(args.video_urls);
      const audios = list(args.audio_urls);
      if (mode === 'create') {
        payload.duration = duration;
        payload.size = RATIOS.includes(args.aspect_ratio) ? args.aspect_ratio : '9:16';
        if (videos.length) payload.video_urls = videos;
      } else {
        if (!args.source_video_url) throw new ToolError(`source_video_url é obrigatório no modo ${mode}`);
        payload.omni_reference_task_type = mode;
        payload.size = 'adaptive';
        payload.video_urls = [safeMediaUrl(args.source_video_url), ...(mode === 'extend' ? videos : [])];
        if (mode === 'extend') payload.duration = duration;
      }
      if (images.length) payload.image_urls = images;
      if (audios.length && mode !== 'edit') payload.audio_urls = audios;

      const submitted = await apimart(key, 'v1/videos/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const taskId = submitted.data?.[0]?.task_id || submitted.data?.task_id || submitted.task_id;
      if (!taskId) throw new ToolError('APIMart não retornou task_id');

      const estimate = mode === 'edit' ? null : Number((PRICE_PER_SECOND[resolution] * duration).toFixed(3));
      if (ctx.record) {
        await ctx.record({
          engine: 'apimart',
          model: MODEL,
          task_id: taskId,
          mode,
          prompt,
          settings: { duration, ratio: payload.size || 'adaptive', resolution, audio: payload.generate_audio, watermark: payload.watermark },
          refs: [
            ...images.map((url, i) => ({ id: `i${i}`, type: 'image', url, thumb: url })),
            ...videos.map((url, i) => ({ id: `v${i}`, type: 'video', url })),
            ...audios.map((url, i) => ({ id: `a${i}`, type: 'audio', url })),
          ],
          source_url: mode === 'create' ? null : safeMediaUrl(args.source_video_url),
          estimated_cost: estimate,
        }).catch(() => {});
      }
      const base = {
        task_id: taskId,
        mode,
        duration: mode === 'edit' ? 'igual ao vídeo de origem' : duration,
        resolution,
        estimated_cost_usd: estimate,
        open_in_studio: studioLink(origin),
        note: 'O vídeo já aparece no histórico do estúdio. A geração leva de 1 a 10 minutos; use wait_for_video com o task_id.',
      };
      if (args.wait_seconds > 0) return { ...base, ...(await waitForTask(key, taskId, origin, args.wait_seconds, ctx)) };
      return { ...base, status: 'submitted' };
    },
  },
  {
    name: 'get_video_status',
    title: 'Ver andamento do vídeo',
    description: 'Consulta uma geração pelo task_id: status (pending, processing, completed, failed), progresso, link do vídeo quando pronto e custo real.',
    inputSchema: {
      type: 'object',
      properties: { task_id: { type: 'string' } },
      required: ['task_id'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
    run: (args, ctx) => readTask(ctx.key, args.task_id, ctx.origin, ctx),
  },
  {
    name: 'wait_for_video',
    title: 'Esperar o vídeo ficar pronto',
    description: `Espera até ${MAX_WAIT_SECONDS} segundos por uma geração e devolve o status atual. Chame de novo se ainda não terminou.`,
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        timeout_seconds: { type: 'integer', minimum: 5, maximum: MAX_WAIT_SECONDS, default: MAX_WAIT_SECONDS },
      },
      required: ['task_id'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
    run: (args, ctx) => waitForTask(ctx.key, args.task_id, ctx.origin, args.timeout_seconds || MAX_WAIT_SECONDS, ctx),
  },
  {
    name: 'get_balance',
    title: 'Saldo da carteira APIMart',
    description: 'Mostra o saldo disponível e o valor já usado na conta APIMart (USD).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: true },
    async run(_args, { key }) {
      for (const path of ['v1/user/balance', 'v1/balance']) {
        try {
          const data = await apimart(key, path);
          if (data.success) {
            return {
              remaining_usd: data.remain_balance,
              used_usd: data.used_balance,
              remaining_credits: data.remain_credits,
              scope: path === 'v1/user/balance' ? 'conta' : 'chave',
            };
          }
        } catch (err) {
          if (String(err.message).includes(' 401:')) throw err;
        }
      }
      throw new ToolError('Não foi possível ler o saldo da APIMart');
    },
  },
  {
    name: 'upload_image',
    title: 'Enviar imagem de referência',
    description: 'Envia uma imagem (base64, até ~3 MB) para a APIMart e devolve um link público válido por 72 h para usar em image_urls. Use para arquivos locais.',
    inputSchema: {
      type: 'object',
      properties: {
        data_base64: { type: 'string', description: 'Conteúdo da imagem em base64 (sem o prefixo data:).' },
        filename: { type: 'string', description: 'Nome do arquivo, ex.: produto.png' },
      },
      required: ['data_base64', 'filename'],
      additionalProperties: false,
    },
    annotations: { destructiveHint: false, openWorldHint: true },
    async run(args, { key }) {
      const ext = String(args.filename).split('.').pop().toLowerCase();
      const type = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }[ext];
      if (!type) throw new ToolError('Use PNG, JPG, WEBP ou GIF');
      const raw = String(args.data_base64).replace(/^data:[^,]+,/, '');
      const bytes = Buffer.from(raw, 'base64');
      if (!bytes.length) throw new ToolError('Imagem vazia ou base64 inválido');
      const name = String(args.filename).replace(/\.[^.]+$/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'image';
      const form = new FormData();
      form.append('file', new Blob([bytes], { type }), `${name}.${ext}`);
      const data = await apimart(key, 'v1/uploads/images', { method: 'POST', body: form });
      if (!data.url) throw new ToolError('APIMart não retornou o link da imagem');
      return { url: safeMediaUrl(data.url), expires_in_hours: 72 };
    },
  },
];
