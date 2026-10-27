// Saves a finished video into the team's storage so it never expires.
// APIMart deletes generated videos 3 days after they finish, which left the
// history full of broken thumbnails. The caller's session uploads the copy
// (storage RLS: members only) and the row then points at the permanent file.

import { requireMember, engineKey, errorResponse, HttpError } from '@/lib/server/session';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const UPSTREAM = process.env.APIMART_BASE_URL || 'https://api.apimart.ai';
const MAX_BYTES = 50 * 1024 * 1024; // media bucket limit

function firstUrl(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return firstUrl(value[0]);
  return firstUrl(value.url || value.video_url);
}

function isPermanent(url, base) {
  return typeof url === 'string' && url.startsWith(`${base}/storage/v1/object/public/media/`);
}

/** Ask APIMart for the task again; it may hand back a newer link. */
async function freshUrl(supabase, taskId) {
  if (!taskId) return null;
  try {
    const key = await engineKey(supabase, 'apimart');
    for (const path of [`v1/tasks/${taskId}`, `v1/videos/generations/${taskId}`]) {
      const res = await fetch(`${UPSTREAM}/${path}`, { headers: { Authorization: `Bearer ${key}` }, cache: 'no-store' });
      if (!res.ok) continue;
      const body = await res.json();
      const raw = body.data ?? body;
      const task = Array.isArray(raw) ? raw[0] || {} : raw;
      const url = firstUrl(task.result?.videos) || firstUrl(task.result?.video) || firstUrl(task.result) || firstUrl(task.video_url);
      if (url) return url;
    }
  } catch { /* fall through */ }
  return null;
}

async function download(url) {
  if (!url) return null;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return null;
  const size = Number(res.headers.get('content-length') || 0);
  if (size > MAX_BYTES) throw new HttpError(413, 'O vídeo passa de 50 MB e não cabe no armazenamento.');
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) throw new HttpError(413, 'O vídeo passa de 50 MB e não cabe no armazenamento.');
  return { buf, type: res.headers.get('content-type') || 'video/mp4' };
}

export async function POST(request) {
  try {
    const { supabase } = await requireMember(request);
    const { id } = await request.json().catch(() => ({}));
    if (!id) throw new HttpError(400, 'Falta o id do vídeo.');

    const { data: row, error } = await supabase.from('generations').select('id, task_id, url, status, remote_url').eq('id', id).maybeSingle();
    if (error) throw new HttpError(500, error.message);
    if (!row) throw new HttpError(404, 'Vídeo não encontrado.');
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (isPermanent(row.url, base)) return Response.json({ url: row.url, persisted: true });
    if (row.status !== 'completed') throw new HttpError(409, 'O vídeo ainda não terminou.');

    let file = await download(row.url);
    if (!file) file = await download(await freshUrl(supabase, row.task_id));
    if (!file) {
      await supabase.from('generations').update({ media_expired: true }).eq('id', id);
      return Response.json({ expired: true }, { status: 410 });
    }

    const name = String(row.task_id || row.id).replace(/[^A-Za-z0-9_-]/g, '');
    const path = `results/${name}.mp4`;
    const { error: upErr } = await supabase.storage.from('media').upload(path, file.buf, { contentType: file.type, upsert: false });
    if (upErr && !/exists|duplicate/i.test(upErr.message)) throw new HttpError(500, `Não foi possível salvar o vídeo: ${upErr.message}`);
    const url = supabase.storage.from('media').getPublicUrl(path).data.publicUrl;

    const { error: updErr } = await supabase.from('generations')
      .update({ url, remote_url: row.remote_url || row.url, media_expired: false })
      .eq('id', id);
    if (updErr) throw new HttpError(500, updErr.message);
    return Response.json({ url, persisted: true });
  } catch (err) {
    return errorResponse(err);
  }
}
