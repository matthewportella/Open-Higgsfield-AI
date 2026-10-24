'use client';

// Video workspace modelled on the Higgsfield video page: a creation panel on
// the left (Create / Edit, References / Extend, prompt, model, duration,
// ratio, resolution, audio) and a history feed on the right (list or grid).
// Every generation runs on Seedance 2.5 through APIMart.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LuImage, LuVideo, LuMusic, LuHistory, LuCircleHelp, LuList, LuLayoutGrid,
  LuHeart, LuCopy, LuDownload, LuEllipsis, LuRotateCcw, LuTrash2, LuChevronRight,
  LuClock, LuRectangleHorizontal, LuGem, LuVolume2, LuVolumeX, LuAtSign, LuX,
  LuLink, LuUpload, LuSparkles, LuStamp, LuChartNoAxesColumn, LuCheck, LuFilm,
} from 'react-icons/lu';
import { submitSeedanceTask, pollTask, uploadImageToApimart, safeMediaUrl, BALANCE_REFRESH_EVENT } from '@/packages/studio/src/apimart';
import { accessToken, uploadToStorage } from '@/lib/supabase/browser';
import { useSharedHistory } from './useSharedHistory';
import MotionPanel from './MotionPanel';
import {
  VIDEO_MODELS, DEFAULT_MODEL_ID, getModel, modelName, normalizeSettings, filterRefs, estimateCost, buildPayload,
} from './videoModels';

const refreshBalance = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event(BALANCE_REFRESH_EVENT)); };

const REF_LABELS = { image: 'Imagem', video: 'Vídeo', audio: 'Áudio' };

const ratioLabel = (r) => (r === 'adaptive' ? 'Auto' : r);
const money = (v) => `$${v.toFixed(2)}`;

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for browsers that block the async clipboard API.
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}
function readPref(key, fallback) {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}
function uid() {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
}
function formatDate(ts) {
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}
function formatElapsed(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function cssRatio(r) {
  if (!r || r === 'adaptive') return '9 / 16';
  const [w, h] = r.split(':');
  return `${w} / ${h}`;
}

/* ───────────────────────────── small UI pieces ───────────────────────────── */

function Popover({ open, onClose, children, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div ref={ref} className={`absolute z-40 bottom-[calc(100%+8px)] left-0 bg-[#18181b] border border-white/10 rounded-2xl p-3 shadow-2xl ${className}`}>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-6 rounded-full transition-colors ${checked ? 'bg-[#d9ff00]' : 'bg-white/15'}`}
    >
      <span className={`absolute top-1 w-4 h-4 rounded-full transition-all ${checked ? 'left-5 bg-black' : 'left-1 bg-white'}`} />
    </button>
  );
}

function Toasts({ toasts, onDismiss }) {
  return (
    <div className="fixed top-4 left-4 z-[60] flex flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="flex items-center gap-3 bg-[#1c1c1f] border border-white/10 rounded-xl px-4 py-3 shadow-2xl text-sm text-white">
          <span className={`w-5 h-5 rounded-full flex items-center justify-center ${t.tone === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-[#d9ff00]/15 text-[#d9ff00]'}`}>
            {t.tone === 'error' ? '!' : <LuCheck size={12} />}
          </span>
          <span className="max-w-[300px]">{t.text}</span>
          <button type="button" onClick={() => onDismiss(t.id)} aria-label="Fechar aviso" className="text-white/40 hover:text-white"><LuX size={14} /></button>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────── reference picker ────────────────────────────── */

function AddReference({ apimartKey, refs, onAdd, history, toast, model }) {
  const [panel, setPanel] = useState(null); // 'image' | 'video' | 'audio'
  const [url, setUrl] = useState('');
  const [uploading, setUploading] = useState(0);
  const fileRef = useRef(null);
  const counts = useMemo(() => refs.reduce((acc, r) => ({ ...acc, [r.type]: (acc[r.type] || 0) + 1 }), {}), [refs]);

  const add = (type, refUrl, name, thumb) => {
    const limit = model.refs[type] || 0;
    if ((counts[type] || 0) >= limit) {
      toast(limit ? `O ${model.name} aceita até ${limit} ${model.frames ? 'imagens (primeiro e último quadro)' : `referências de ${REF_LABELS[type].toLowerCase()}`}.` : `O ${model.name} não aceita ${REF_LABELS[type].toLowerCase()} de referência.`, 'error');
      return;
    }
    const clean = safeMediaUrl(refUrl);
    onAdd({ id: uid(), type, url: clean, name: name || clean.split('/').pop(), thumb: thumb ? safeMediaUrl(thumb) : thumb });
    setUrl('');
    setPanel(null);
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { toast('A imagem passa de 20 MB.', 'error'); return; }
    try {
      setUploading(1);
      const uploaded = await uploadImageToApimart(apimartKey, file, (p) => setUploading(Math.max(1, p)));
      add('image', uploaded, file.name, uploaded);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setUploading(0);
    }
  };

  const doneVideos = history.filter((j) => j.status === 'completed' && j.url).slice(0, 12);
  const mediaRef = useRef(null);

  // Video and audio references go to the team's storage to get a public link.
  const onMediaFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !panel) return;
    try {
      setUploading(1);
      const url = await uploadToStorage(file);
      add(panel, url, file.name);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setUploading(0);
    }
  };

  return (
    <div className="relative">
      <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] px-4 py-5 flex flex-col items-center gap-2 text-center">
        <div className="flex items-center gap-1.5">
          {[['image', LuImage], ['video', LuVideo], ['audio', LuMusic]].map(([type, Icon]) => (
            <button
              key={type}
              type="button"
              disabled={!model.refs[type]}
              title={!model.refs[type] ? `O ${model.name} não aceita ${REF_LABELS[type].toLowerCase()}` : undefined}
              onClick={() => setPanel(panel === type ? null : type)}
              aria-label={`Adicionar ${REF_LABELS[type].toLowerCase()}`}
              className={`w-9 h-9 rounded-full flex items-center justify-center border transition-colors disabled:opacity-25 disabled:cursor-not-allowed ${panel === type ? 'bg-[#d9ff00] text-black border-[#d9ff00]' : 'bg-white/[0.06] text-white/60 border-white/10 hover:text-white'}`}
            >
              <Icon size={15} />
            </button>
          ))}
        </div>
        <p className="text-sm text-white/70">{uploading ? `Enviando… ${uploading > 1 ? `${uploading}%` : ''}` : model.frames ? 'Adicionar quadros' : 'Adicionar referências'}</p>
        <p className="text-[11px] text-white/35">{model.frames ? '1ª imagem = primeiro quadro · 2ª = último quadro' : 'Imagem, vídeo ou áudio'}</p>
      </div>

      {panel && (
        <div className="mt-2 rounded-2xl bg-[#18181b] border border-white/10 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white/70">{REF_LABELS[panel]} de referência</span>
            <button type="button" onClick={() => setPanel(null)} aria-label="Fechar" className="text-white/40 hover:text-white"><LuX size={14} /></button>
          </div>
          {panel === 'image' && (
            <>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={onFile} />
              <button type="button" disabled={Boolean(uploading)} onClick={() => fileRef.current?.click()} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/10 text-sm text-white disabled:opacity-50">
                <LuUpload size={14} /> Enviar do computador
              </button>
            </>
          )}
          {panel !== 'image' && (
            <>
              <input ref={mediaRef} type="file" accept={panel === 'video' ? 'video/mp4,video/quicktime,video/webm' : 'audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/aac'} className="hidden" onChange={onMediaFile} />
              <button type="button" disabled={Boolean(uploading)} onClick={() => mediaRef.current?.click()} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/10 text-sm text-white disabled:opacity-50">
                <LuUpload size={14} /> {uploading ? 'Enviando…' : 'Enviar do computador'}
              </button>
            </>
          )}
          {panel === 'video' && doneVideos.length > 0 && (
            <div>
              <p className="text-[11px] text-white/40 mb-1.5">Dos seus vídeos</p>
              <div className="grid grid-cols-4 gap-1.5">
                {doneVideos.map((j) => (
                  <button key={j.id} type="button" onClick={() => add('video', j.url, j.prompt.slice(0, 40))} className="aspect-square rounded-lg overflow-hidden bg-black border border-white/10 hover:border-[#d9ff00]">
                    <video src={j.url} muted preload="metadata" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => { e.preventDefault(); if (/^https?:\/\//.test(url.trim())) add(panel, url.trim(), undefined, panel === 'image' ? url.trim() : undefined); else toast('Cole um link público começando com https://', 'error'); }}
          >
            <div className="flex-1 flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-3">
              <LuLink size={13} className="text-white/40 flex-shrink-0" />
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={`Link público do ${REF_LABELS[panel].toLowerCase()}`} className="flex-1 bg-transparent py-2 text-xs text-white placeholder:text-white/30 outline-none min-w-0" />
            </div>
            <button type="submit" className="px-3 rounded-xl bg-[#d9ff00] text-black text-xs font-bold">Adicionar</button>
          </form>
          {panel !== 'image' && <p className="text-[10px] text-white/35 leading-snug">{panel === 'video' ? 'Vídeos de 2 a 30 s, até 30 s no total.' : 'Áudios de 2 a 30 s, até 30 s no total.'} Arquivos de até 50 MB.</p>}
        </div>
      )}
    </div>
  );
}

function RefChips({ refs, onRemove, onMention, model }) {
  if (!refs.length) return null;
  const index = { image: 0, video: 0, audio: 0 };
  return (
    <div className="flex flex-wrap gap-1.5">
      {refs.map((r) => {
        index[r.type] += 1;
        const n = index[r.type];
        const Icon = r.type === 'image' ? LuImage : r.type === 'video' ? LuVideo : LuMusic;
        return (
          <div key={r.id} className="group flex items-center gap-1.5 bg-white/[0.06] border border-white/10 rounded-lg pl-1 pr-1.5 py-1">
            {r.type === 'image' && r.thumb
              ? <img src={r.thumb} alt="" className="w-6 h-6 rounded object-cover" />
              : <span className="w-6 h-6 rounded bg-white/10 flex items-center justify-center"><Icon size={12} className="text-white/60" /></span>}
            {model.frames ? (
              <span className="text-[11px] text-white/80">{n === 1 ? 'Primeiro quadro' : 'Último quadro'}</span>
            ) : (
              <button type="button" onClick={() => onMention(`${model.tokens[r.type]}${n}`)} title="Inserir no prompt" className="text-[11px] text-white/80 hover:text-[#d9ff00]">
                {REF_LABELS[r.type]} {n}
              </button>
            )}
            <button type="button" onClick={() => onRemove(r.id)} aria-label={`Remover ${REF_LABELS[r.type]} ${n}`} className="text-white/30 hover:text-white"><LuX size={11} /></button>
          </div>
        );
      })}
    </div>
  );
}

/* ───────────────────────────── history items ─────────────────────────────── */

function JobActions({ job, onFavorite, onCopy, onDownload, onDelete }) {
  const [menu, setMenu] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <button type="button" onClick={onFavorite} aria-label="Favoritar" className={`w-8 h-8 rounded-lg flex items-center justify-center bg-black/50 backdrop-blur hover:bg-black/70 ${job.favorite ? 'text-[#d9ff00]' : 'text-white'}`}><LuHeart size={15} fill={job.favorite ? 'currentColor' : 'none'} /></button>
      <button type="button" onClick={onCopy} aria-label="Copiar prompt" className="w-8 h-8 rounded-lg flex items-center justify-center bg-black/50 backdrop-blur hover:bg-black/70 text-white"><LuCopy size={15} /></button>
      <button type="button" onClick={onDownload} aria-label="Baixar" className="w-8 h-8 rounded-lg flex items-center justify-center bg-black/50 backdrop-blur hover:bg-black/70 text-white"><LuDownload size={15} /></button>
      <div className="relative">
        <button type="button" onClick={() => setMenu(!menu)} aria-label="Mais opções" className="w-8 h-8 rounded-lg flex items-center justify-center bg-black/50 backdrop-blur hover:bg-black/70 text-white"><LuEllipsis size={15} /></button>
        {menu && (
          <div className="absolute right-0 top-9 z-30 w-40 bg-[#18181b] border border-white/10 rounded-xl p-1 shadow-2xl">
            <a href={job.url} target="_blank" rel="noreferrer" className="block px-3 py-2 rounded-lg text-xs text-white/80 hover:bg-white/5">Abrir em nova aba</a>
            <button type="button" onClick={() => { setMenu(false); onDelete(); }} className="w-full text-left px-3 py-2 rounded-lg text-xs text-red-400 hover:bg-white/5">Excluir</button>
          </div>
        )}
      </div>
    </div>
  );
}

function PendingMedia({ job, now }) {
  const label = job.status === 'processing'
    ? (job.progress ? `Gerando ${job.progress}%` : 'Gerando')
    : 'Na fila';
  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center gap-3 overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(110deg,transparent_30%,rgba(217,255,0,0.07)_50%,transparent_70%)] bg-[length:200%_100%] animate-[shimmer_1.6s_linear_infinite]" />
      <LuSparkles className="text-[#d9ff00] animate-pulse" size={22} />
      <p className="relative text-sm font-semibold text-white">{label}</p>
      <p className="relative text-xs text-white/40 tabular-nums">{formatElapsed(now - job.startedAt)}</p>
      {job.progress > 0 && (
        <div className="relative w-40 h-1 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-[#d9ff00] transition-all" style={{ width: `${job.progress}%` }} /></div>
      )}
    </div>
  );
}

function JobMedia({ job, now, onRetry }) {
  if (job.status === 'completed' && job.url) {
    return <video src={job.url} controls playsInline preload="metadata" className="max-w-full max-h-full rounded-lg bg-black" />;
  }
  if (job.status === 'failed') {
    return (
      <div className="flex flex-col items-center gap-3 text-center px-6">
        <p className="text-sm font-semibold text-red-400">Falhou</p>
        <p className="text-xs text-white/50 max-w-xs">{job.error}</p>
        <button type="button" onClick={onRetry} className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-white">Tentar de novo</button>
      </div>
    );
  }
  return <PendingMedia job={job} now={now} />;
}

function JobMeta({ job }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-white/50">
      <span className="flex items-center gap-1"><LuGem size={11} />{job.settings.resolution}</span>
      {job.mode !== 'edit' && <span className="flex items-center gap-1"><LuClock size={11} />{job.settings.duration.toFixed(1)}s</span>}
      <span className="flex items-center gap-1"><LuRectangleHorizontal size={11} />{job.mode === 'create' ? ratioLabel(job.settings.ratio) : 'Auto'}</span>
    </div>
  );
}

function ListItem({ job, now, handlers }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-3">
      <div className="group relative rounded-2xl bg-[#111113] border border-white/[0.05] h-[300px] sm:h-[460px] flex items-center justify-center p-3">
        <JobMedia job={job} now={now} onRetry={() => handlers.rerun(job)} />
        {job.status === 'completed' && (
          <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <JobActions job={job} {...handlers.bind(job)} />
          </div>
        )}
      </div>
      <div className="rounded-2xl bg-[#111113] border border-white/[0.05] p-4 flex flex-col gap-3 min-h-[160px]">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-white"><LuChartNoAxesColumn size={13} className="text-[#d9ff00]" />{modelName(job.model)}{job.mode !== 'create' && <span className="ml-1 px-1.5 py-0.5 rounded bg-white/10 text-[10px] text-white/60">{job.settings?.task === 'motion' ? 'Motion Control' : job.mode === 'edit' ? 'Edição' : 'Extensão'}</span>}</div>
        <p className="text-[13px] leading-snug text-white/60 uppercase line-clamp-6 break-words">{job.prompt}</p>
        {job.refs.some((r) => r.type === 'image' && r.thumb) && (
          <div className="flex gap-1.5">
            {job.refs.filter((r) => r.type === 'image' && r.thumb).slice(0, 4).map((r) => <img key={r.id} src={r.thumb} alt="" className="w-9 h-9 rounded-md object-cover" />)}
          </div>
        )}
        <JobMeta job={job} />
        {typeof job.cost === 'number' ? <p className="text-[11px] text-white/40">Custo: {money(job.cost)}</p>
          : typeof job.estimatedCost === 'number' ? <p className="text-[11px] text-white/40">Estimativa: {money(job.estimatedCost)}</p> : null}
        <div className="mt-auto pt-2 space-y-2">
          <span className="block text-[11px] text-white/30">{formatDate(job.createdAt)}{job.createdBy ? ` · ${job.createdBy.split('@')[0]}` : ''}{job.origin === 'codex' ? ' · via Codex' : ''}</span>
          <div className="flex items-center gap-1 -ml-2">
            <button type="button" onClick={() => handlers.rerun(job)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-white/60 hover:text-white hover:bg-white/5"><LuRotateCcw size={12} />Rerun</button>
            <button type="button" onClick={() => handlers.reuse(job)} aria-label="Usar estas configurações" title="Usar estas configurações" className="w-7 h-7 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/5"><LuCopy size={13} /></button>
            <button type="button" onClick={() => handlers.remove(job)} aria-label="Excluir" className="w-7 h-7 rounded-lg flex items-center justify-center text-white/50 hover:text-red-400 hover:bg-white/5"><LuTrash2 size={13} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

function GridItem({ job, now, handlers, onOpen }) {
  return (
    <div className="group relative rounded-xl overflow-hidden bg-[#111113] border border-white/[0.05]" style={{ aspectRatio: cssRatio(job.mode === 'create' ? job.settings.ratio : 'adaptive') }}>
      {job.status === 'completed' && job.url ? (
        <button type="button" onClick={() => onOpen(job)} className="block w-full h-full" aria-label="Abrir vídeo">
          <video src={job.url} muted loop playsInline preload="metadata" className="w-full h-full object-cover" onMouseEnter={(e) => e.currentTarget.play().catch(() => {})} onMouseLeave={(e) => { e.currentTarget.pause(); }} />
        </button>
      ) : (
        <div className="w-full h-full flex items-center justify-center"><JobMedia job={job} now={now} onRetry={() => handlers.rerun(job)} /></div>
      )}
      {job.status === 'completed' && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <JobActions job={job} {...handlers.bind(job)} />
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────── main page ───────────────────────────────── */

export default function VideoWorkspace({ email }) {
  const [tab, setTab] = useState('create'); // create | edit
  const [subTab, setSubTab] = useState('references'); // references | extend
  const [prompt, setPrompt] = useState('');
  const [refs, setRefs] = useState([]);
  const [sourceUrl, setSourceUrl] = useState('');
  const [modelId, setModelId] = useState(() => getModel(readPref('hf_video_model', DEFAULT_MODEL_ID)).id);
  const model = getModel(modelId);
  const [settings, setSettings] = useState(() => normalizeSettings(getModel(readPref('hf_video_model', DEFAULT_MODEL_ID)), { duration: 5, ratio: '9:16', resolution: '480p', audio: true, watermark: false }));
  const [popover, setPopover] = useState(null);
  const [view, setView] = useState(() => readPref('hf_video_view', 'list'));
  const [gridSize, setGridSize] = useState(() => Number(readPref('hf_video_grid', '220')) || 220);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importValue, setImportValue] = useState('');
  const [importPrompt, setImportPrompt] = useState('');
  const [lightbox, setLightbox] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [now, setNow] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);
  const promptRef = useRef(null);
  const polling = useRef(new Set());

  const canEdit = model.modes.includes('edit');
  const canExtend = model.modes.includes('extend');
  const mode = tab === 'edit' && canEdit ? 'edit' : tab === 'create' && subTab === 'extend' && canExtend ? 'extend' : 'create';

  const chooseModel = (id) => {
    const next = getModel(id);
    setModelId(next.id);
    setSettings((s) => normalizeSettings(next, s));
    setRefs((list) => filterRefs(next, list));
    if (!next.modes.includes('edit')) setTab((t) => (t === 'edit' ? 'create' : t));
    if (!next.modes.includes('extend')) setSubTab('references');
    try { localStorage.setItem('hf_video_model', next.id); } catch { /* ignore */ }
  };

  const toast = useCallback((text, tone = 'ok') => {
    const id = uid();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 7000 : 2500);
  }, []);

  const { jobs, ready, insertJob, updateJob, removeJob } = useSharedHistory({
    onError: (msg) => toast(msg, 'error'),
    onMigrated: (n) => toast(`${n} vídeo${n > 1 ? 's' : ''} antigo${n > 1 ? 's' : ''} deste navegador foram salvos no histórico da equipe`),
  });

  // Links such as /studio?import=task_123 add those generations to the history.
  useEffect(() => {
    if (!ready) return;
    const url = new URL(window.location.href);
    const ids = url.searchParams.getAll('import').flatMap((v) => v.split(',')).map((v) => v.trim()).filter((v) => /^[A-Za-z0-9_-]{4,}$/.test(v));
    if (!ids.length) return;
    url.searchParams.delete('import');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    const fresh = ids.filter((taskId) => !jobs.some((j) => j.taskId === taskId));
    Promise.all(fresh.map((taskId) => insertJob({ taskId, prompt: 'Vídeo importado', origin: 'import' }).catch(() => null)))
      .then(() => toast(ids.length > 1 ? `${ids.length} vídeos no histórico` : 'Vídeo no histórico'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  useEffect(() => { try { localStorage.setItem('hf_video_view', view); localStorage.setItem('hf_video_grid', String(gridSize)); } catch { /* ignore */ } }, [view, gridSize]);

  const hasActive = jobs.some((j) => j.status === 'queued' || j.status === 'processing');
  useEffect(() => {
    if (!hasActive) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [hasActive]);

  // Poll every unfinished job (any teammate's, or Codex's) and save progress
  // to the shared history; this also resumes after a reload.
  useEffect(() => {
    for (const job of jobs) {
      if (!job.taskId || polling.current.has(job.id)) continue;
      if (job.status !== 'queued' && job.status !== 'processing') continue;
      polling.current.add(job.id);
      let lastSaved = '';
      pollTask(accessToken, job.taskId, {
        startedAt: job.imported ? Date.now() : job.startedAt,
        onStatus: ({ status, progress }) => {
          const next = status === 'processing' ? 'processing' : 'queued';
          const sig = `${next}:${progress}`;
          if (sig !== lastSaved) { lastSaved = sig; updateJob(job.id, { status: next, progress }); }
        },
      })
        .then((res) => {
          updateJob(job.id, { status: 'completed', url: res.url, cost: typeof res.cost === 'number' ? res.cost : job.cost, progress: 100, error: null });
          toast('Vídeo pronto!');
          refreshBalance();
        })
        .catch((err) => {
          updateJob(job.id, { status: 'failed', error: err.message });
          toast(err.message, 'error');
        })
        .finally(() => polling.current.delete(job.id));
    }
  }, [jobs, updateJob, toast]);

  const cost = estimateCost(model, mode, settings);
  const needsSource = mode !== 'create';
  const canGenerate = prompt.trim().length > 0 && (!needsSource || /^https?:\/\//.test(sourceUrl));

  const startJob = useCallback(async (job) => {
    let saved;
    try {
      saved = await insertJob({
        mode: job.mode,
        prompt: job.prompt,
        settings: job.settings,
        refs: job.refs,
        sourceUrl: job.sourceUrl || null,
        status: 'queued',
        progress: 0,
        estimatedCost: job.estimatedCost ?? estimateCost(getModel(job.model), job.mode, job.settings),
        model: job.model || DEFAULT_MODEL_ID,
        origin: 'studio',
      });
    } catch (err) {
      toast(err.message, 'error');
      return;
    }
    try {
      const taskId = await submitSeedanceTask(accessToken, buildPayload(saved));
      await updateJob(saved.id, { taskId, startedAt: Date.now() });
      refreshBalance();
    } catch (err) {
      updateJob(saved.id, { status: 'failed', error: err.message });
      toast(err.message, 'error');
    }
  }, [insertJob, updateJob, toast]);

  const generate = async () => {
    if (!canGenerate || submitting) return;
    setSubmitting(true);
    await startJob({ model: model.id, mode, prompt: prompt.trim(), settings: { ...settings }, refs, sourceUrl: needsSource ? sourceUrl : null });
    setSubmitting(false);
  };

  const insertMention = (token) => {
    const el = promptRef.current;
    const pos = el ? el.selectionStart : prompt.length;
    const before = prompt.slice(0, pos);
    const insert = `${before && !/\s$/.test(before) ? ' ' : ''}${token} `;
    setPrompt(`${before}${insert}${prompt.slice(pos)}`);
    const caret = pos + insert.length;
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(caret, caret); });
  };

  const confirmDelete = (job) => {
    if (job.createdBy && job.createdBy !== email && !confirm(`Este vídeo foi criado por ${job.createdBy}. Excluir para toda a equipe?`)) return;
    removeJob(job.id);
  };

  const handlers = {
    rerun: (job) => startJob(job),
    reuse: (job) => {
      if (job.settings?.task === 'motion') { setTab('motion'); toast('Abra o vídeo e a foto de novo no Motion Control, ou use Rerun para repetir igual'); return; }
      chooseModel(job.model || DEFAULT_MODEL_ID);
      setPrompt(job.prompt);
      setSettings({ ...job.settings });
      setRefs(job.refs);
      setTab(job.mode === 'edit' ? 'edit' : 'create');
      setSubTab(job.mode === 'extend' ? 'extend' : 'references');
      setSourceUrl(job.sourceUrl || '');
      toast('Configurações carregadas no painel');
    },
    remove: confirmDelete,
    bind: (job) => ({
      onFavorite: () => updateJob(job.id, { favorite: !job.favorite }),
      onCopy: async () => {
        if (await copyText(job.prompt)) toast('Prompt copiado');
        else toast('Não foi possível copiar', 'error');
      },
      onDownload: async () => {
        try {
          const blob = await (await fetch(job.url)).blob();
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `video-${job.id.slice(0, 8)}.mp4`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        } catch {
          window.open(job.url, '_blank', 'noopener');
        }
      },
      onDelete: () => confirmDelete(job),
    }),
  };

  const importVideo = async (e) => {
    e.preventDefault();
    const value = importValue.trim();
    const label = importPrompt.trim() || 'Vídeo importado';
    try {
      if (/^[A-Za-z0-9_-]{6,}$/.test(value)) {
        if (jobs.some((j) => j.taskId === value)) { toast('Esse vídeo já está no histórico', 'error'); return; }
        await insertJob({ taskId: value, prompt: label, origin: 'import' });
      } else if (/^https?:\/\/\S+$/.test(value)) {
        if (jobs.some((j) => j.url === value)) { toast('Esse vídeo já está no histórico', 'error'); return; }
        await insertJob({ status: 'completed', progress: 100, url: value, prompt: label, origin: 'import' });
      } else {
        toast('Cole o ID da tarefa (sem espaços) ou um link https:// do vídeo', 'error');
        return;
      }
    } catch (err) {
      toast(err.message, 'error');
      return;
    }
    setImportValue('');
    setImportPrompt('');
    setShowImport(false);
    setFavoritesOnly(false);
    toast('Vídeo adicionado ao histórico');
  };

  const visible = jobs.filter((j) => (!favoritesOnly || j.favorite) && (!mineOnly || j.createdBy === email));
  const doneVideos = jobs.filter((j) => j.status === 'completed' && j.url);

  return (
    <div className="h-full flex flex-col lg:flex-row min-h-0 bg-[#050505] overflow-y-auto lg:overflow-hidden">
      <style>{'@keyframes shimmer{to{background-position:-200% 0}}'}</style>
      <Toasts toasts={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />

      {/* ───────── left panel ───────── */}
      <aside className="lg:w-[300px] flex-shrink-0 flex flex-col lg:min-h-0 border-b lg:border-b-0 lg:border-r border-white/[0.06] bg-[#0a0a0b]">
        <div className="flex items-center gap-3 px-3 pt-3 border-b border-white/[0.06] overflow-x-auto no-scrollbar">
          {[['create', 'Criar vídeo'], ...(canEdit ? [['edit', 'Editar vídeo']] : []), ['motion', 'Motion Control']].map(([id, label]) => (
            <button key={id} type="button" onClick={() => setTab(id)} className={`pb-2.5 text-[12px] font-semibold whitespace-nowrap border-b-2 transition-colors ${tab === id ? 'text-white border-white' : 'text-white/45 border-transparent hover:text-white/80'}`}>{label}</button>
          ))}
        </div>

        {tab === 'motion' ? (
          <MotionPanel doneVideos={doneVideos} toast={toast} onGenerate={startJob} />
        ) : (
          <>
        <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto custom-scrollbar p-3 space-y-3">
          {/* model card */}
          <div className="relative h-24 rounded-2xl overflow-hidden bg-[radial-gradient(120%_120%_at_20%_0%,#3b4a10_0%,#141a05_45%,#0a0a0b_100%)] border border-white/[0.06] p-3 flex flex-col justify-end">
            <LuFilm className="absolute top-3 right-3 text-[#d9ff00]/60" size={20} />
            <p className="text-lg font-black text-[#d9ff00] leading-none uppercase">{mode === 'edit' ? 'Edição' : mode === 'extend' ? 'Extensão' : 'Geral'}</p>
            <p className="text-[11px] text-white/60 mt-1">{model.name} · APIMart</p>
          </div>

          {tab === 'create' && canExtend && (
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-white/[0.04]">
              {[['references', 'Referências'], ['extend', 'Estender vídeo']].map(([id, label]) => (
                <button key={id} type="button" onClick={() => setSubTab(id)} className={`py-2 rounded-lg text-xs font-semibold transition-colors ${subTab === id ? 'bg-white/[0.1] text-white' : 'text-white/45 hover:text-white/80'}`}>{label}</button>
              ))}
            </div>
          )}

          {needsSource && (
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-3 space-y-2">
              <p className="text-xs font-semibold text-white/70">{mode === 'edit' ? `Vídeo para editar (${model.id === 'kling-v4' ? '3' : '4'} a 30 s)` : 'Vídeo para estender'}</p>
              {doneVideos.length > 0 && (
                <div className="grid grid-cols-4 gap-1.5">
                  {doneVideos.slice(0, 8).map((j) => (
                    <button key={j.id} type="button" onClick={() => setSourceUrl(j.url)} className={`aspect-square rounded-lg overflow-hidden bg-black border-2 ${sourceUrl === j.url ? 'border-[#d9ff00]' : 'border-transparent hover:border-white/30'}`}>
                      <video src={j.url} muted preload="metadata" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-3">
                <LuLink size={13} className="text-white/40" />
                <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value.trim())} placeholder="Ou cole o link público do vídeo" className="flex-1 bg-transparent py-2 text-xs text-white placeholder:text-white/30 outline-none min-w-0" />
              </div>
            </div>
          )}

          <AddReference key={model.id} model={model} apimartKey={accessToken} refs={refs} onAdd={(r) => setRefs((list) => [...list, r])} history={jobs} toast={toast} />
          <RefChips model={model} refs={refs} onRemove={(id) => setRefs((list) => list.filter((r) => r.id !== id))} onMention={insertMention} />

          {/* prompt */}
          <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-3">
            <label htmlFor="hf-prompt" className="text-xs text-white/45">Prompt</label>
            <textarea
              id="hf-prompt"
              ref={promptRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate(); }}
              rows={6}
              maxLength={40000}
              placeholder={mode === 'edit' ? 'Descreva o que mudar no vídeo…' : mode === 'extend' ? 'Descreva como o vídeo continua…' : 'Descreva a cena que você imagina…'}
              className="mt-1 w-full bg-transparent resize-none text-[13px] leading-relaxed text-white placeholder:text-white/25 outline-none uppercase placeholder:normal-case custom-scrollbar"
            />
            <div className="flex items-center gap-3 pt-1">
              <button type="button" onClick={() => refs.length ? toast('Clique numa referência acima para inseri-la no prompt') : toast('Adicione uma referência para citá-la no prompt')} className="flex items-center gap-1 text-[11px] text-white/55 hover:text-white"><LuAtSign size={12} />Elementos</button>
              {model.audio === 'always' ? (
                <span className="flex items-center gap-1 text-[11px] text-white/45"><LuVolume2 size={12} />Som sempre ligado</span>
              ) : (
                <button type="button" onClick={() => setSettings((s) => ({ ...s, audio: !s.audio }))} aria-pressed={settings.audio} className="flex items-center gap-1 text-[11px] text-white/55 hover:text-white">
                  {settings.audio ? <LuVolume2 size={12} /> : <LuVolumeX size={12} />}{settings.audio ? 'Som ligado' : 'Sem som'}
                </button>
              )}
            </div>
          </div>

          {/* model */}
          <div className="relative">
            <button type="button" onClick={() => setPopover(popover === 'model' ? null : 'model')} className="w-full flex items-center justify-between rounded-2xl bg-white/[0.03] border border-white/[0.06] px-3 py-2.5 hover:bg-white/[0.05]">
              <span className="text-left">
                <span className="block text-[11px] text-white/45">Modelo</span>
                <span className="flex items-center gap-1.5 text-sm font-semibold text-white">{model.name}<LuChartNoAxesColumn size={13} className="text-[#d9ff00]" /></span>
              </span>
              <LuChevronRight size={16} className="text-white/40" />
            </button>
            <Popover open={popover === 'model'} onClose={() => setPopover(null)} className="w-full space-y-1">
              <p className="text-xs font-semibold text-white mb-1 px-1">Modelo de vídeo</p>
              {VIDEO_MODELS.map((m) => (
                <button key={m.id} type="button" onClick={() => { chooseModel(m.id); setPopover(null); }} className={`w-full flex items-start gap-3 p-2 rounded-xl text-left ${m.id === model.id ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]'}`}>
                  <span className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${m.id === model.id ? 'bg-[#d9ff00] text-black' : 'bg-white/[0.06] text-white/60'}`}><LuFilm size={16} /></span>
                  <span className="min-w-0">
                    <span className="text-sm font-semibold text-white flex items-center gap-1.5">{m.name}{m.id === model.id && <LuCheck size={13} className="text-[#d9ff00]" />}</span>
                    <span className="block text-[11px] text-white/45 leading-snug">{m.vendor} · {m.summary}</span>
                  </span>
                </button>
              ))}
            </Popover>
          </div>

          {/* duration / ratio / resolution */}
          <div className="grid grid-cols-3 gap-1.5">
            <div className="relative">
              <button type="button" disabled={mode === 'edit'} onClick={() => setPopover(popover === 'duration' ? null : 'duration')} className="w-full flex items-center gap-1.5 rounded-xl bg-white/[0.03] border border-white/[0.06] px-2.5 py-2.5 text-[13px] text-white hover:bg-white/[0.05] disabled:opacity-40">
                <LuClock size={13} className="text-white/50" />{mode === 'edit' ? 'Auto' : `${settings.duration}s`}
              </button>
              <Popover open={popover === 'duration'} onClose={() => setPopover(null)} className="w-[268px]">
                <p className="text-xs font-semibold text-white mb-2">Escolha a duração</p>
                {model.durations.options ? (
                  <div className="flex gap-2">
                    {model.durations.options.map((d) => (
                      <button key={d} type="button" onClick={() => { setSettings((s) => ({ ...s, duration: d })); setPopover(null); }} className={`flex-1 py-2 rounded-lg text-sm font-semibold ${settings.duration === d ? 'bg-[#d9ff00] text-black' : 'bg-white/[0.06] text-white hover:bg-white/10'}`}>{d}s</button>
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <input type="range" min={model.durations.min} max={model.durations.max} step={1} value={settings.duration} onChange={(e) => setSettings((s) => ({ ...s, duration: Number(e.target.value) }))} aria-label="Duração em segundos" className="flex-1 accent-[#d9ff00] cursor-pointer" />
                      <input type="number" min={model.durations.min} max={model.durations.max} value={settings.duration} onChange={(e) => setSettings((s) => ({ ...s, duration: Math.min(model.durations.max, Math.max(model.durations.min, Number(e.target.value) || model.durations.min)) }))} aria-label="Segundos" className="w-14 bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-sm text-white text-center tabular-nums outline-none" />
                    </div>
                    <div className="flex justify-between text-[10px] text-white/35 mt-1"><span>{model.durations.min}s</span><span>{model.durations.max}s</span></div>
                  </>
                )}
              </Popover>
            </div>
            <div className="relative">
              <button type="button" disabled={mode !== 'create'} onClick={() => setPopover(popover === 'ratio' ? null : 'ratio')} className="w-full flex items-center gap-1.5 rounded-xl bg-white/[0.03] border border-white/[0.06] px-2.5 py-2.5 text-[13px] text-white hover:bg-white/[0.05] disabled:opacity-40">
                <LuRectangleHorizontal size={13} className="text-white/50" />{mode === 'create' ? ratioLabel(settings.ratio) : 'Auto'}
              </button>
              <Popover open={popover === 'ratio'} onClose={() => setPopover(null)} className="w-44">
                <p className="text-xs font-semibold text-white mb-2">Proporção</p>
                {model.ratios.map((r) => (
                  <button key={r} type="button" onClick={() => { setSettings((s) => ({ ...s, ratio: r })); setPopover(null); }} className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-[13px] text-white/80 hover:bg-white/5">
                    {ratioLabel(r)}{settings.ratio === r && <LuCheck size={13} className="text-[#d9ff00]" />}
                  </button>
                ))}
              </Popover>
            </div>
            <div className="relative">
              <button type="button" onClick={() => setPopover(popover === 'res' ? null : 'res')} className="w-full flex items-center gap-1.5 rounded-xl bg-white/[0.03] border border-white/[0.06] px-2.5 py-2.5 text-[13px] text-white hover:bg-white/[0.05]">
                <LuGem size={13} className="text-white/50" />{settings.resolution}
              </button>
              <Popover open={popover === 'res'} onClose={() => setPopover(null)} className="w-44 !left-auto right-0">
                <p className="text-xs font-semibold text-white mb-2">Resolução</p>
                {model.resolutions.map((r) => (
                  <button key={r} type="button" onClick={() => { setSettings((s) => ({ ...s, resolution: r })); setPopover(null); }} className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-[13px] text-white/80 hover:bg-white/5">
                    <span>{r} <span className="text-white/35 text-[11px]">· {model.priceFrom ? 'a partir de ' : ''}{money(model.price[r])}/s</span></span>{settings.resolution === r && <LuCheck size={13} className="text-[#d9ff00]" />}
                  </button>
                ))}
              </Popover>
            </div>
          </div>

          {model.watermark && (
            <div className="flex items-center justify-between rounded-2xl bg-white/[0.03] border border-white/[0.06] px-3 py-2.5">
              <span className="flex items-center gap-2 text-[13px] text-white"><LuStamp size={14} className="text-white/50" />Marca d'água “IA”</span>
              <Toggle checked={settings.watermark} onChange={(v) => setSettings((s) => ({ ...s, watermark: v }))} label="Marca d'água" />
            </div>
          )}
        </div>

        <div className="p-3 border-t border-white/[0.06] sticky bottom-0 z-20 bg-[#0a0a0b] lg:static">
          <button
            type="button"
            onClick={generate}
            disabled={!canGenerate || submitting}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[#d9ff00] text-black font-bold text-[15px] hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_24px_rgba(217,255,0,0.15)]"
          >
            {submitting ? 'Enviando…' : 'Gerar'}
            <span className="flex items-center gap-0.5"><LuSparkles size={14} />{cost === null ? 'pela duração' : money(cost)}</span>
          </button>
        </div>
          </>
        )}
      </aside>

      {/* ───────── feed ───────── */}
      <section className="flex-1 min-w-0 lg:min-h-0 flex flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setFavoritesOnly(false)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] ${!favoritesOnly ? 'bg-white/[0.08] text-white' : 'text-white/50 hover:text-white'}`}><LuHistory size={14} />Histórico</button>
            <button type="button" onClick={() => setFavoritesOnly(true)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] ${favoritesOnly ? 'bg-white/[0.08] text-white' : 'text-white/50 hover:text-white'}`}><LuHeart size={14} />Favoritos</button>
            <button type="button" onClick={() => setMineOnly(!mineOnly)} aria-pressed={mineOnly} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] ${mineOnly ? 'bg-white/[0.08] text-white' : 'text-white/50 hover:text-white'}`}>Só meus</button>
            <button type="button" onClick={() => setShowImport(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] text-white/50 hover:text-white"><LuUpload size={14} />Importar</button>
            <button type="button" onClick={() => setShowHelp(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] text-white/50 hover:text-white"><LuCircleHelp size={14} />Como funciona</button>
          </div>
          <div className="flex items-center gap-2">
            {view === 'grid' && (
              <input type="range" min={140} max={360} value={gridSize} onChange={(e) => setGridSize(Number(e.target.value))} aria-label="Tamanho das miniaturas" className="hidden sm:block w-24 accent-white cursor-pointer" />
            )}
            <button type="button" onClick={() => setView('list')} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[13px] ${view === 'list' ? 'bg-white/[0.08] text-white' : 'text-white/50 hover:text-white'}`}><LuList size={14} />Lista</button>
            <button type="button" onClick={() => setView('grid')} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[13px] ${view === 'grid' ? 'bg-white/[0.08] text-white' : 'text-white/50 hover:text-white'}`}><LuLayoutGrid size={14} />Grade</button>
          </div>
        </div>

        <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto custom-scrollbar px-4 pb-6">
          {visible.length === 0 ? (
            <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center gap-3">
              <span className="w-14 h-14 rounded-2xl bg-white/[0.04] flex items-center justify-center"><LuVideo size={24} className="text-white/40" /></span>
              <p className="text-white font-semibold">{!ready ? 'Carregando histórico…' : favoritesOnly ? 'Nenhum favorito ainda' : 'Os vídeos da equipe aparecem aqui'}</p>
              <p className="text-sm text-white/45 max-w-sm">{favoritesOnly ? 'Toque no coração de um vídeo para guardá-lo aqui.' : 'Escreva um prompt no painel ao lado, escolha a duração e clique em Gerar.'}</p>
            </div>
          ) : view === 'list' ? (
            <div className="space-y-4">{visible.map((job) => <ListItem key={job.id} job={job} now={now} handlers={handlers} />)}</div>
          ) : (
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${gridSize}px, 1fr))` }}>
              {visible.map((job) => <GridItem key={job.id} job={job} now={now} handlers={handlers} onOpen={setLightbox} />)}
            </div>
          )}
        </div>
      </section>

      {/* lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <div className="relative max-w-5xl w-full flex flex-col lg:flex-row gap-4" onClick={(e) => e.stopPropagation()}>
            <video src={lightbox.url} controls autoPlay playsInline className="max-h-[80vh] w-auto mx-auto rounded-xl bg-black" />
            <div className="lg:w-64 space-y-3">
              <p className="text-sm font-semibold text-white">{modelName(lightbox.model)}</p>
              <p className="text-xs text-white/60 uppercase max-h-60 overflow-y-auto custom-scrollbar">{lightbox.prompt}</p>
              <JobMeta job={lightbox} />
              <div className="flex gap-2">
                <button type="button" onClick={() => handlers.bind(lightbox).onDownload()} className="flex-1 py-2 rounded-lg bg-[#d9ff00] text-black text-xs font-bold">Baixar</button>
                <button type="button" onClick={() => setLightbox(null)} className="flex-1 py-2 rounded-lg bg-white/10 text-white text-xs">Fechar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* import */}
      {showImport && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowImport(false)}>
          <form onSubmit={importVideo} className="w-full max-w-md bg-[#111113] border border-white/10 rounded-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Importar vídeo</h2>
              <button type="button" onClick={() => setShowImport(false)} aria-label="Fechar" className="text-white/50 hover:text-white"><LuX size={18} /></button>
            </div>
            <p className="text-sm text-white/60">Cole o <b className="text-white">ID da tarefa</b> (normalmente começa com <code className="text-[#d9ff00]">task_</code>) ou o <b className="text-white">link do vídeo</b>. Você encontra os dois nos registros de uso do painel da APIMart.</p>
            <div>
              <label htmlFor="hf-import" className="block text-xs text-white/45 mb-1">ID da tarefa ou link</label>
              <input id="hf-import" value={importValue} onChange={(e) => setImportValue(e.target.value)} placeholder="task_01K… ou https://…mp4" className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:border-[#d9ff00]/40" />
            </div>
            <div>
              <label htmlFor="hf-import-prompt" className="block text-xs text-white/45 mb-1">Descrição (opcional)</label>
              <input id="hf-import-prompt" value={importPrompt} onChange={(e) => setImportPrompt(e.target.value)} placeholder="Ex.: Carlos real testimonial" className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:border-[#d9ff00]/40" />
            </div>
            <button type="submit" className="w-full py-2.5 rounded-xl bg-[#d9ff00] text-black font-bold text-sm">Adicionar ao histórico</button>
          </form>
        </div>
      )}

      {/* how it works */}
      {showHelp && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowHelp(false)}>
          <div className="w-full max-w-lg bg-[#111113] border border-white/10 rounded-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Como funciona</h2>
              <button type="button" onClick={() => setShowHelp(false)} aria-label="Fechar" className="text-white/50 hover:text-white"><LuX size={18} /></button>
            </div>
            <ol className="space-y-3 text-sm text-white/70 list-decimal pl-5">
              <li><b className="text-white">Criar vídeo:</b> escolha o modelo (Seedance 2.5, Kling V4 ou Veo 3.1), escreva o prompt, ajuste duração, proporção e resolução e clique em Gerar.</li>
              <li><b className="text-white">Referências:</b> adicione imagens (envio do computador), vídeos ou áudios (link público ou um vídeo seu). Clique na referência para citá-la no prompt, por exemplo “@图片1 andando na praia”.</li>
              <li><b className="text-white">Estender vídeo:</b> escolha um vídeo seu e descreva como ele continua.</li>
              <li><b className="text-white">Editar vídeo:</b> escolha um vídeo de 4 a 30 s e descreva o que mudar. A cobrança segue a duração do vídeo original.</li>
              <li>Você pode gerar vários vídeos ao mesmo tempo. O histórico fica salvo na conta da equipe: aparece em qualquer navegador ou computador em que vocês entrarem, inclusive os vídeos criados pelo Codex.</li>
            </ol>
            <p className="text-xs text-white/40">O valor no botão é uma estimativa pelo preço da APIMart. O custo real aparece em cada vídeo quando ele termina.</p>
          </div>
        </div>
      )}
    </div>
  );
}
