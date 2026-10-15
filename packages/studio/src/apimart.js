// APIMart client (https://docs.apimart.ai). Requests go through the app's
// same-origin proxy at /api/apimart, which adds the Bearer token upstream.

const PROXY = '/api/apimart';

async function readError(response) {
    const text = await response.text();
    try {
        const data = JSON.parse(text);
        return data.error?.message || data.message || text;
    } catch {
        return text;
    }
}

function firstUrl(value) {
    if (!value) return null;
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return firstUrl(value[0]);
    return firstUrl(value.url);
}

async function pollTask(taskId, key, maxAttempts = 360, interval = 5000) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, interval));
        let response;
        try {
            response = await fetch(`${PROXY}/v1/tasks/${taskId}?language=pt`, {
                headers: { 'x-apimart-key': key },
            });
        } catch (error) {
            if (attempt === maxAttempts) throw error;
            continue;
        }
        if (!response.ok) {
            if (response.status >= 500 || response.status === 429) continue;
            throw new Error(`APIMart: ${await readError(response)}`);
        }
        const task = (await response.json()).data || {};
        if (task.status === 'completed') {
            const url = firstUrl(task.result?.videos);
            if (!url) throw new Error('APIMart: a tarefa terminou sem link de vídeo');
            return { id: task.id || taskId, url, cost: task.cost };
        }
        if (task.status === 'failed' || task.status === 'cancelled') {
            throw new Error(`APIMart: ${task.error?.message || 'a geração falhou'}`);
        }
    }
    throw new Error('APIMart: tempo esgotado esperando o vídeo');
}

/** Seedance 2.5 text-to-video, or image-to-video when image_url is given. */
export async function generateSeedance25(key, params) {
    if (!key) throw new Error('Este modelo usa a APIMart. Adicione sua chave da APIMart em Settings.');

    const payload = {
        model: 'seedance-2.5',
        prompt: params.prompt || 'Animate @图片1 with natural, cinematic motion',
        resolution: params.resolution || '480p',
        duration: Number(params.duration) || 5,
    };
    if (params.image_url) {
        payload.image_with_roles = [{ url: params.image_url, role: 'first_frame' }];
    } else if (params.aspect_ratio) {
        payload.size = params.aspect_ratio;
    }

    const response = await fetch(`${PROXY}/v1/videos/generations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-apimart-key': key },
        body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`APIMart: ${await readError(response)}`);

    const submitted = await response.json();
    const taskId = submitted.data?.[0]?.task_id || submitted.data?.task_id;
    if (!taskId) throw new Error('APIMart: nenhum task_id retornado');
    if (params.onRequestId) params.onRequestId(taskId);
    return pollTask(taskId, key);
}

/** Upload an image to APIMart; returns a public URL valid for 72 hours. */
export function uploadImageToApimart(key, file, onProgress) {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('file', file);
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
            if (xhr.status >= 200 && xhr.status < 300 && data.url) resolve(data.url);
            else reject(new Error(`APIMart upload: ${data.error?.message || xhr.statusText || xhr.status}`));
        };
        xhr.onerror = () => reject(new Error('Network error during APIMart upload'));
        xhr.send(formData);
    });
}
