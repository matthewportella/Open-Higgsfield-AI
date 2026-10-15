// APIMart client (https://docs.apimart.ai). Requests go through the app's
// same-origin proxy at /api/apimart, which adds the Bearer token upstream.

const PROXY = '/api/apimart';
const POLL_INTERVAL_MS = 5000;
const MAX_WAIT_MS = 40 * 60 * 1000; // Seedance 2.5 can queue for a long time
const MAX_CONSECUTIVE_FAILURES = 12; // ~1 minute of unreachable status checks

const SUCCESS = new Set(['completed', 'succeeded', 'success', 'done']);
const FAILURE = new Set(['failed', 'failure', 'error', 'cancelled', 'canceled']);

export const PENDING_STORAGE_KEY = 'apimart_pending_job';

/**
 * APIMart rejects media URLs with raw whitespace ("encode spaces as %20").
 * Encode whitespace and other unsafe characters without double-encoding
 * sequences that are already escaped.
 */
export function safeMediaUrl(url) {
    if (typeof url !== 'string') return url;
    // Escape only what is not allowed in a URL: whitespace, non-ASCII,
    // a few unsafe ASCII characters and stray "%" signs. Existing %XX
    // sequences are kept as they are.
    return url.trim().replace(/[^\x21-\x7E]|["<>\\^`{|}]|%(?![0-9A-Fa-f]{2})/gu, (c) => encodeURIComponent(c));
}

/** Replace spaces and unusual characters in an upload's file name. */
function safeFileName(name) {
    const dot = name.lastIndexOf('.');
    const base = (dot > 0 ? name.slice(0, dot) : name)
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'image';
    const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : 'png';
    return `${base.slice(0, 60)}.${ext || 'png'}`;
}

async function readError(response) {
    const text = await response.text();
    try {
        const data = JSON.parse(text);
        return data.error?.message || data.message || text;
    } catch {
        return text || `HTTP ${response.status}`;
    }
}

function firstUrl(value) {
    if (!value) return null;
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return firstUrl(value[0]);
    return firstUrl(value.url || value.video_url);
}

/**
 * Poll a task until it finishes. `onStatus` receives
 * { status, progress, estimatedTime, elapsed } after every check.
 */
export async function pollTask(key, taskId, { onStatus, startedAt = Date.now() } = {}) {
    if (!key) throw new Error('Adicione sua chave da APIMart em Configurações.');
    let failures = 0;

    while (Date.now() - startedAt < MAX_WAIT_MS) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));

        let response;
        try {
            response = await fetch(`${PROXY}/v1/tasks/${taskId}?language=pt`, {
                headers: { 'x-apimart-key': key },
                cache: 'no-store',
            });
        } catch {
            if (++failures >= MAX_CONSECUTIVE_FAILURES) throw new Error('APIMart: sem conexão para acompanhar o vídeo. Tente de novo.');
            continue;
        }

        if (!response.ok) {
            if (response.status >= 500 || response.status === 429) {
                if (++failures >= MAX_CONSECUTIVE_FAILURES) {
                    throw new Error(`APIMart não está respondendo (${response.status}). O vídeo pode terminar mesmo assim; confira no painel da APIMart.`);
                }
                continue;
            }
            throw new Error(`APIMart: ${await readError(response)}`);
        }
        failures = 0;

        const body = await response.json();
        const task = body.data || body;
        const status = String(task.status || '').toLowerCase();
        console.debug('[APIMart] task', taskId, status, task.progress);

        if (onStatus) {
            onStatus({
                status,
                progress: Number(task.progress) || 0,
                estimatedTime: Number(task.estimated_time) || null,
                elapsed: Math.round((Date.now() - startedAt) / 1000),
            });
        }

        if (SUCCESS.has(status)) {
            const url = firstUrl(task.result?.videos) || firstUrl(task.result?.video) || firstUrl(task.result);
            if (!url) throw new Error('APIMart: a tarefa terminou sem link de vídeo.');
            return { id: task.id || taskId, url, cost: task.cost };
        }
        if (FAILURE.has(status)) {
            throw new Error(`APIMart: ${task.error?.message || 'a geração falhou'}`);
        }
    }
    throw new Error('APIMart: o vídeo demorou mais de 40 minutos. Confira no painel da APIMart.');
}

/** Submit a raw /v1/videos/generations payload; returns the APIMart task id. */
export async function submitSeedanceTask(key, payload) {
    if (!key) throw new Error('Adicione sua chave da APIMart em Configurações.');
    const response = await fetch(`${PROXY}/v1/videos/generations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-apimart-key': key },
        body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`APIMart: ${await readError(response)}`);
    const submitted = await response.json();
    const taskId = submitted.data?.[0]?.task_id || submitted.data?.task_id || submitted.task_id;
    if (!taskId) throw new Error('APIMart: nenhum task_id retornado');
    return taskId;
}

/** Seedance 2.5 text-to-video, or image-to-video when image_url is given. */
export async function generateSeedance25(key, params) {
    if (!key) throw new Error('Este modelo usa a APIMart. Adicione sua chave da APIMart em Configurações.');

    const payload = {
        model: 'seedance-2.5',
        prompt: params.prompt || 'Animate @图片1 with natural, cinematic motion',
        resolution: params.resolution || '480p',
        duration: Math.min(30, Math.max(4, Math.round(Number(params.duration) || 5))),
    };
    if (params.image_url) {
        payload.image_with_roles = [{ url: safeMediaUrl(params.image_url), role: 'first_frame' }];
    } else if (params.aspect_ratio) {
        payload.size = params.aspect_ratio;
    }

    const taskId = await submitSeedanceTask(key, payload);
    const startedAt = Date.now();
    if (params.onRequestId) params.onRequestId(taskId, startedAt);
    return pollTask(key, taskId, { onStatus: params.onStatus, startedAt });
}

/** Upload an image to APIMart; returns a public URL valid for 72 hours. */
export function uploadImageToApimart(key, file, onProgress) {
    return new Promise((resolve, reject) => {
        if (!key) { reject(new Error('Adicione sua chave da APIMart em Configurações.')); return; }
        const formData = new FormData();
        formData.append('file', file, safeFileName(file.name || 'image.png'));
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${PROXY}/v1/uploads/images`);
        xhr.setRequestHeader('x-apimart-key', key);
        if (onProgress) {
            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
            };
        }
        xhr.onload = () => {
            let data = {};
            try { data = JSON.parse(xhr.responseText); } catch { /* handled below */ }
            if (xhr.status >= 200 && xhr.status < 300 && data.url) resolve(safeMediaUrl(data.url));
            else reject(new Error(`APIMart upload: ${data.error?.message || xhr.statusText || xhr.status}`));
        };
        xhr.onerror = () => reject(new Error('Falha de rede ao enviar a imagem para a APIMart'));
        xhr.send(formData);
    });
}

/**
 * Account balance for the key's owner. Falls back to the key's own quota
 * when the account endpoint is unavailable. Values are in USD.
 */
export async function getApimartBalance(key) {
    if (!key) throw new Error('Sem chave da APIMart');
    for (const path of ['v1/user/balance', 'v1/balance']) {
        const response = await fetch(`${PROXY}/${path}`, { headers: { 'x-apimart-key': key }, cache: 'no-store' });
        if (response.status === 401) throw new Error('Chave da APIMart inválida');
        if (!response.ok) continue;
        const data = await response.json();
        if (!data.success) continue;
        return {
            remaining: Number(data.remain_balance),
            used: Number(data.used_balance),
            remainingCredits: Number(data.remain_credits),
            unlimited: Boolean(data.unlimited_quota) || Number(data.remain_balance) === -1,
            scope: path === 'v1/user/balance' ? 'account' : 'key',
        };
    }
    throw new Error('Não foi possível ler o saldo da APIMart');
}

export const BALANCE_REFRESH_EVENT = 'apimart:balance-refresh';
