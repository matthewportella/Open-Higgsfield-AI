'use client';

// Team-wide generation history stored in Supabase (`generations` table),
// kept in sync live so videos created by teammates or by Codex appear
// immediately. Replaces the old per-browser localStorage history.

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';

const PAGE_SIZE = 300;
const LEGACY_JOBS_KEY = 'hf_video_jobs';
const LEGACY_PENDING_KEY = 'apimart_pending_job';

export function rowToJob(row) {
  return {
    id: row.id,
    taskId: row.task_id,
    model: row.model || 'seedance-2.5',
    mode: row.mode,
    prompt: row.prompt || '',
    settings: { duration: 5, ratio: 'adaptive', resolution: '480p', audio: true, watermark: false, ...(row.settings || {}) },
    refs: Array.isArray(row.refs) ? row.refs : [],
    sourceUrl: row.source_url,
    status: row.status,
    progress: row.progress || 0,
    url: row.url,
    cost: row.cost !== null && row.cost !== undefined ? Number(row.cost) : null,
    estimatedCost: row.estimated_cost !== null && row.estimated_cost !== undefined ? Number(row.estimated_cost) : null,
    error: row.error,
    favorite: row.favorite,
    origin: row.origin,
    createdBy: row.created_by_email,
    createdAt: new Date(row.created_at).getTime(),
    startedAt: new Date(row.started_at || row.created_at).getTime(),
    imported: row.origin !== 'studio',
  };
}

const FIELD_MAP = {
  taskId: 'task_id', sourceUrl: 'source_url', estimatedCost: 'estimated_cost', startedAt: 'started_at',
};

export function jobPatchToRow(patch) {
  const row = {};
  for (const [k, v] of Object.entries(patch)) {
    if (['id', 'createdAt', 'createdBy', 'imported'].includes(k)) continue;
    const col = FIELD_MAP[k] || k;
    row[col] = k === 'startedAt' ? new Date(v).toISOString() : v;
  }
  return row;
}

function sortJobs(list) {
  return [...list].sort((a, b) => b.createdAt - a.createdAt);
}

/** Import videos saved by the old browser-only history into the shared table. */
async function migrateLegacy(supabase, existingTaskIds) {
  let legacy = [];
  try { legacy = JSON.parse(localStorage.getItem(LEGACY_JOBS_KEY) || '[]'); } catch { legacy = []; }
  try {
    const pending = JSON.parse(localStorage.getItem(LEGACY_PENDING_KEY) || 'null');
    if (pending?.taskId) legacy.push({ taskId: pending.taskId, prompt: pending.prompt, status: 'queued', settings: { duration: pending.duration, ratio: pending.aspect_ratio } });
  } catch { /* ignore */ }
  const rows = legacy
    .filter((j) => (j.taskId && !existingTaskIds.has(j.taskId)) || (!j.taskId && j.url))
    .map((j) => ({
      task_id: j.taskId || null,
      mode: j.mode || 'create',
      prompt: j.prompt || 'Vídeo importado',
      settings: j.settings || {},
      refs: j.refs || [],
      source_url: j.sourceUrl || null,
      status: ['queued', 'processing', 'completed', 'failed'].includes(j.status) ? j.status : 'queued',
      progress: j.progress || 0,
      url: j.url || null,
      cost: typeof j.cost === 'number' ? j.cost : null,
      error: j.error || null,
      favorite: Boolean(j.favorite),
      origin: 'import',
      created_at: j.createdAt ? new Date(j.createdAt).toISOString() : undefined,
    }));
  if (rows.length) {
    const { error } = await supabase.from('generations').insert(rows);
    if (error) return 0;
  }
  try { localStorage.removeItem(LEGACY_JOBS_KEY); localStorage.removeItem(LEGACY_PENDING_KEY); } catch { /* ignore */ }
  return rows.length;
}

export function useSharedHistory({ onError, onMigrated } = {}) {
  const supabase = supabaseBrowser();
  const [jobs, setJobs] = useState([]);
  const [ready, setReady] = useState(false);
  const errorRef = useRef(onError);
  errorRef.current = onError;

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('generations').select('*').order('created_at', { ascending: false }).limit(PAGE_SIZE);
    if (error) { errorRef.current?.(`Não foi possível carregar o histórico: ${error.message}`); return []; }
    const list = (data || []).map(rowToJob);
    setJobs(list);
    return list;
  }, [supabase]);

  useEffect(() => {
    let active = true;
    (async () => {
      const list = await load();
      if (!active) return;
      const migrated = await migrateLegacy(supabase, new Set(list.map((j) => j.taskId).filter(Boolean)));
      if (migrated && active) { await load(); onMigrated?.(migrated); }
      if (active) setReady(true);
    })();

    const channel = supabase
      .channel('generations-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'generations' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          setJobs((list) => list.filter((j) => j.id !== payload.old.id));
          return;
        }
        const job = rowToJob(payload.new);
        setJobs((list) => sortJobs([job, ...list.filter((j) => j.id !== job.id)]));
      })
      .subscribe();

    // Realtime can drop while the tab sleeps; refresh when it comes back.
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisible);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, load]);

  const insertJob = useCallback(async (job) => {
    const { data, error } = await supabase.from('generations').insert(jobPatchToRow(job)).select('*').single();
    if (error) throw new Error(error.code === '23505' ? 'Esse vídeo já está no histórico' : error.message);
    const created = rowToJob(data);
    setJobs((list) => sortJobs([created, ...list.filter((j) => j.id !== created.id)]));
    return created;
  }, [supabase]);

  const updateJob = useCallback(async (id, patch) => {
    setJobs((list) => list.map((j) => (j.id === id ? { ...j, ...patch } : j)));
    const { error } = await supabase.from('generations').update(jobPatchToRow(patch)).eq('id', id);
    if (error) errorRef.current?.(`Não foi possível salvar no histórico: ${error.message}`);
  }, [supabase]);

  const removeJob = useCallback(async (id) => {
    setJobs((list) => list.filter((j) => j.id !== id));
    const { error } = await supabase.from('generations').delete().eq('id', id);
    if (error) { errorRef.current?.(`Não foi possível excluir: ${error.message}`); load(); }
  }, [supabase, load]);

  return { jobs, ready, insertJob, updateJob, removeJob, reload: load };
}
