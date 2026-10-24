// Video models available through APIMart, with each model's limits and how
// to turn a studio job into that model's /v1/videos/generations payload.
// Older history rows have model "seedance-2.5" and keep working unchanged.

import { safeMediaUrl } from '@/packages/studio/src/apimart';

// Estimated USD per output second (APIMart public prices, Oct 2026). Veo and
// Kling list only a "starting" price; the real charge returned with each
// finished task replaces the estimate in the history.
export const VIDEO_MODELS = [
  {
    id: 'seedance-2.5',
    name: 'Seedance 2.5',
    vendor: 'ByteDance',
    summary: '4 a 30 s · 480p a 1080p · referências de imagem, vídeo e áudio · editar e estender',
    modes: ['create', 'extend', 'edit'],
    durations: { min: 4, max: 30 },
    ratios: ['adaptive', '16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
    resolutions: ['480p', '720p', '1080p'],
    price: { '480p': 0.096, '720p': 0.216, '1080p': 0.385 },
    audio: 'toggle',
    watermark: true,
    refs: { image: 30, video: 10, audio: 10 },
    tokens: { image: '@图片', video: '@视频', audio: '@音频' },
  },
  {
    id: 'kling-v4',
    name: 'Kling V4',
    vendor: 'Kuaishou',
    summary: '3 a 30 s · 720p ou 1080p · som sempre ligado · referências, editar e estender',
    modes: ['create', 'extend', 'edit'],
    durations: { min: 3, max: 30 },
    ratios: ['adaptive', '16:9', '9:16', '1:1', '21:9'],
    resolutions: ['720p', '1080p'],
    price: { '720p': 0.094, '1080p': 0.141 },
    priceFrom: true,
    audio: 'always',
    watermark: false,
    refs: { image: 10, video: 5, audio: 3 },
    tokens: { image: '@Image', video: '@Video', audio: '@Audio' },
  },
  {
    id: 'veo3.1-fast-official',
    name: 'Veo 3.1 Fast',
    vendor: 'Google',
    summary: '4, 6 ou 8 s · 720p, 1080p ou 4K · imagem de primeiro e último quadro',
    modes: ['create'],
    durations: { options: [4, 6, 8] },
    ratios: ['16:9', '9:16'],
    resolutions: ['720p', '1080p', '4K'],
    price: { '720p': 0.064, '1080p': 0.064, '4K': 0.128 },
    priceFrom: true,
    audio: 'toggle',
    watermark: false,
    refs: { image: 2, video: 0, audio: 0 },
    frames: true,
  },
  {
    id: 'veo3.1-quality-official',
    name: 'Veo 3.1 Quality',
    vendor: 'Google',
    summary: '4, 6 ou 8 s · 720p, 1080p ou 4K · qualidade máxima do Veo',
    modes: ['create'],
    durations: { options: [4, 6, 8] },
    ratios: ['16:9', '9:16'],
    resolutions: ['720p', '1080p', '4K'],
    price: { '720p': 0.16, '1080p': 0.16, '4K': 0.32 },
    priceFrom: true,
    audio: 'toggle',
    watermark: false,
    refs: { image: 2, video: 0, audio: 0 },
    frames: true,
  },
];

// Motion control / video-to-video models: take a source video and swap the
// character (from an image) or the scene/look (from a prompt + images).
export const MOTION_MODELS = [
  {
    id: 'kling-v3-motion-control',
    name: 'Kling 3.0 Motion Control',
    vendor: 'Kuaishou',
    summary: 'Seu personagem (foto) repete o movimento do vídeo · vídeo de 3 a 30 s',
    kind: 'motion',
    price: { std: 0.1029, pro: 0.18 },
  },
  {
    id: 'kling-v2-6-motion-control',
    name: 'Kling 2.6 Motion Control',
    vendor: 'Kuaishou',
    summary: 'Mesmo recurso, mais barato · vídeo de 3 a 30 s',
    kind: 'motion',
    price: { std: 0.0571, pro: 0.1 },
  },
  {
    id: 'wan2.7-videoedit',
    name: 'Wan 2.7 Video Edit',
    vendor: 'Alibaba',
    summary: 'Troca personagem, roupa ou cenário pelo prompt e até 4 imagens · vídeo de 2 a 10 s',
    kind: 'edit',
    price: { '720P': 0.0664, '1080P': 0.0996 },
  },
];

export function getMotionModel(id) {
  return MOTION_MODELS.find((m) => m.id === id) || MOTION_MODELS[0];
}

/** Estimated cost from the source video's length (APIMart bills that length). */
export function estimateMotionCost(motionModel, settings, videoSeconds) {
  if (!videoSeconds) return null;
  const key = motionModel.kind === 'motion' ? settings.quality : settings.resolution;
  const rate = motionModel.price[key] || Object.values(motionModel.price)[0];
  const seconds = motionModel.kind === 'edit' && settings.duration ? Math.min(settings.duration, videoSeconds) : videoSeconds;
  return rate * Math.ceil(seconds);
}

export const DEFAULT_MODEL_ID = 'seedance-2.5';

export function getModel(id) {
  return VIDEO_MODELS.find((m) => m.id === id) || VIDEO_MODELS[0];
}

export function modelName(id) {
  return [...VIDEO_MODELS, ...MOTION_MODELS].find((m) => m.id === id)?.name || id || 'Seedance 2.5';
}

function nearest(options, value) {
  return options.reduce((best, v) => (Math.abs(v - value) < Math.abs(best - value) ? v : best), options[0]);
}

/** Clamp duration/ratio/resolution to what a model accepts. */
export function normalizeSettings(model, settings) {
  const next = { ...settings };
  const d = Number(next.duration) || 5;
  next.duration = model.durations.options
    ? nearest(model.durations.options, d)
    : Math.min(model.durations.max, Math.max(model.durations.min, Math.round(d)));
  if (!model.ratios.includes(next.ratio)) next.ratio = model.ratios.includes('9:16') ? '9:16' : model.ratios[0];
  if (!model.resolutions.includes(next.resolution)) next.resolution = model.resolutions[0];
  if (model.audio === 'always') next.audio = true;
  if (!model.watermark) next.watermark = false;
  return next;
}

/** Keep only the references a model accepts, up to its limits. */
export function filterRefs(model, refs) {
  const count = { image: 0, video: 0, audio: 0 };
  return refs.filter((r) => {
    count[r.type] = (count[r.type] || 0) + 1;
    return count[r.type] <= (model.refs[r.type] || 0);
  });
}

export function estimateCost(model, mode, settings) {
  if (mode === 'edit') return null; // billed by the source video's length
  const rate = model.price[settings.resolution];
  return rate ? rate * settings.duration : null;
}

function split(refs) {
  return {
    images: refs.filter((r) => r.type === 'image').map((r) => safeMediaUrl(r.url)),
    videos: refs.filter((r) => r.type === 'video').map((r) => safeMediaUrl(r.url)),
    audios: refs.filter((r) => r.type === 'audio').map((r) => safeMediaUrl(r.url)),
  };
}

function seedancePayload({ mode, prompt, settings, refs, sourceUrl }) {
  const { images, videos, audios } = split(refs);
  const source = sourceUrl ? safeMediaUrl(sourceUrl) : null;
  const payload = {
    model: 'seedance-2.5',
    prompt,
    resolution: settings.resolution,
    generate_audio: settings.audio,
    watermark: settings.watermark,
  };
  if (mode === 'edit') {
    payload.omni_reference_task_type = 'edit';
    payload.video_urls = [source];
    payload.size = 'adaptive';
  } else if (mode === 'extend') {
    payload.omni_reference_task_type = 'extend';
    payload.video_urls = [source, ...videos];
    payload.size = 'adaptive';
    payload.duration = settings.duration;
  } else {
    payload.size = settings.ratio;
    payload.duration = settings.duration;
    if (videos.length) payload.video_urls = videos;
  }
  if (images.length) payload.image_urls = images;
  if (audios.length && mode !== 'edit') payload.audio_urls = audios;
  return payload;
}

function klingPayload({ mode, prompt, settings, refs, sourceUrl }) {
  const { images, videos, audios } = split(refs);
  const payload = { model: 'kling-v4', prompt, resolution: settings.resolution };
  if (mode === 'edit') {
    payload.omni_reference_task_type = 'edit';
    payload.video_url = safeMediaUrl(sourceUrl);
    if (images.length) payload.image_urls = images;
  } else if (mode === 'extend') {
    payload.omni_reference_task_type = 'extend';
    payload.video_url = safeMediaUrl(sourceUrl);
    payload.duration = settings.duration;
  } else {
    payload.duration = settings.duration;
    const hasRefs = images.length || videos.length || audios.length;
    if (hasRefs) {
      payload.omni_reference_task_type = 'reference';
      if (images.length) payload.image_urls = images;
      if (videos.length) payload.video_urls = videos;
      if (audios.length) payload.audio_urls = audios;
      payload.aspect_ratio = settings.ratio === 'adaptive' ? 'auto' : settings.ratio;
    } else if (settings.ratio !== 'adaptive') {
      payload.aspect_ratio = settings.ratio;
    }
  }
  return payload;
}

function veoPayload({ prompt, settings, refs }, modelId) {
  const { images } = split(refs);
  const payload = {
    model: modelId,
    prompt,
    duration: settings.duration,
    aspect_ratio: settings.ratio,
    resolution: settings.resolution,
    generate_audio: settings.audio,
  };
  if (images[0]) payload.first_frame_image = images[0];
  if (images[1]) payload.last_frame_image = images[1];
  return payload;
}

function motionPayload({ prompt, settings, refs, sourceUrl }, modelId) {
  const { images } = split(refs);
  const payload = {
    model: modelId,
    image_url: images[0],
    video_url: safeMediaUrl(sourceUrl),
    character_orientation: settings.orientation === 'image' ? 'image' : 'video',
    mode: settings.quality === 'pro' ? 'pro' : 'std',
    keep_original_sound: settings.keepSound === false ? 'no' : 'yes',
  };
  if (prompt) payload.prompt = prompt;
  return payload;
}

function wanEditPayload({ prompt, settings, refs, sourceUrl }) {
  const { images } = split(refs);
  const payload = {
    model: 'wan2.7-videoedit',
    video_urls: [safeMediaUrl(sourceUrl)],
    resolution: settings.resolution === '720P' ? '720P' : '1080P',
    duration: 0, // keep the whole source video
    metadata: { audio_setting: settings.keepSound === false ? 'auto' : 'origin' },
  };
  if (prompt) payload.prompt = prompt;
  if (images.length) payload.image_urls = images.slice(0, 4);
  if (settings.ratio && settings.ratio !== 'adaptive') payload.size = settings.ratio;
  return payload;
}

/** APIMart payload for a studio job (job.model decides the format). */
export function buildPayload(job) {
  if (job.model === 'wan2.7-videoedit') return wanEditPayload(job);
  if (MOTION_MODELS.some((m) => m.id === job.model)) return motionPayload(job, job.model);
  const model = getModel(job.model);
  if (model.id === 'kling-v4') return klingPayload(job);
  if (model.id.startsWith('veo3.1')) return veoPayload(job, model.id);
  return seedancePayload(job);
}
