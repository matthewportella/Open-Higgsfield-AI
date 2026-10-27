'use client';

// Motion Control tab: upload or pick a video, then either put a character
// from a photo into that motion (Kling Motion Control) or change the
// character / scene with a prompt and reference images (Wan 2.7 Video Edit).

import { useEffect, useRef, useState } from 'react';
import { LuUpload, LuLink, LuX, LuCheck, LuSparkles, LuFilm, LuUser, LuVideo } from 'react-icons/lu';
import { uploadToStorage } from '@/lib/supabase/browser';
import { safeMediaUrl } from '@/packages/studio/src/apimart';
import { MOTION_MODELS, getMotionModel, estimateMotionCost } from './videoModels';
import MediaThumb, { SafeImg } from './MediaThumb';

const money = (v) => `$${v.toFixed(2)}`;

function uid() {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
}

function Segmented({ value, options, onChange, label }) {
  return (
    <div role="group" aria-label={label} className="grid gap-1 p-1 rounded-xl bg-white/[0.04]" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(([id, text]) => (
        <button key={id} type="button" onClick={() => onChange(id)} aria-pressed={value === id} className={`py-1.5 rounded-lg text-xs font-semibold ${value === id ? 'bg-white/[0.12] text-white' : 'text-white/45 hover:text-white/80'}`}>{text}</button>
      ))}
    </div>
  );
}

export default function MotionPanel({ doneVideos, toast, onGenerate }) {
  const [modelId, setModelId] = useState(MOTION_MODELS[0].id);
  const model = getMotionModel(modelId);
  const isMotion = model.kind === 'motion';
  const [sourceUrl, setSourceUrl] = useState('');
  const [videoSeconds, setVideoSeconds] = useState(null);
  const [images, setImages] = useState([]); // [{id,url}]
  const [prompt, setPrompt] = useState('');
  const [settings, setSettings] = useState({ orientation: 'video', quality: 'std', keepSound: true, resolution: '1080P', duration: 0, ratio: 'adaptive' });
  const [busy, setBusy] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const videoInput = useRef(null);
  const imageInput = useRef(null);

  const maxImages = isMotion ? 1 : 4;
  const maxSeconds = isMotion ? (settings.orientation === 'image' ? 10 : 30) : 10;
  const minSeconds = isMotion ? 3 : 2;

  useEffect(() => { setImages((list) => list.slice(0, maxImages)); }, [maxImages]);

  // Read the video length in the browser (for limits and cost); metadata does not need CORS.
  useEffect(() => {
    setVideoSeconds(null);
    if (!/^https?:\/\//.test(sourceUrl)) return undefined;
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => setVideoSeconds(Number.isFinite(v.duration) ? v.duration : null);
    v.src = sourceUrl;
    return () => { v.removeAttribute('src'); v.load(); };
  }, [sourceUrl]);

  const pickVideo = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setBusy('video');
      setSourceUrl(await uploadToStorage(file));
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const pickImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (images.length >= maxImages) { toast(`Até ${maxImages} ${maxImages > 1 ? 'imagens' : 'imagem'} neste modelo.`, 'error'); return; }
    try {
      setBusy('image');
      const url = await uploadToStorage(file); // permanent, unlike APIMart's 72 h links
      setImages((list) => [...list, { id: uid(), url }]);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const tooLong = videoSeconds && videoSeconds > maxSeconds + 0.4;
  const tooShort = videoSeconds && videoSeconds < minSeconds - 0.1;
  const ready = /^https?:\/\//.test(sourceUrl) && (isMotion ? images.length === 1 : (prompt.trim() || images.length)) && !tooLong && !tooShort;
  const cost = estimateMotionCost(model, settings, videoSeconds);

  const generate = async () => {
    if (!ready || submitting) return;
    setSubmitting(true);
    await onGenerate({
      model: model.id,
      mode: 'edit',
      prompt: prompt.trim(),
      settings: {
        task: 'motion',
        orientation: settings.orientation,
        quality: settings.quality,
        keepSound: settings.keepSound,
        resolution: isMotion ? (settings.quality === 'pro' ? 'pro' : 'std') : settings.resolution,
        duration: Math.floor(videoSeconds || 0),
        ratio: settings.ratio,
        audio: settings.keepSound,
      },
      refs: images.map((img) => ({ id: img.id, type: 'image', url: img.url, thumb: img.url })),
      sourceUrl: safeMediaUrl(sourceUrl),
      estimatedCost: cost,
    });
    setSubmitting(false);
  };

  return (
    <>
      <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto custom-scrollbar p-3 space-y-3">
        <div className="relative h-24 rounded-2xl overflow-hidden bg-[radial-gradient(120%_120%_at_20%_0%,#103a4a_0%,#06161c_45%,#0a0a0b_100%)] border border-white/[0.06] p-3 flex flex-col justify-end">
          <LuFilm className="absolute top-3 right-3 text-[#d9ff00]/60" size={20} />
          <p className="text-lg font-black text-[#d9ff00] leading-none uppercase">Motion Control</p>
          <p className="text-[11px] text-white/60 mt-1">{model.name} · APIMart</p>
        </div>

        {/* model */}
        <div className="space-y-1">
          {MOTION_MODELS.map((m) => (
            <button key={m.id} type="button" onClick={() => setModelId(m.id)} className={`w-full text-left rounded-xl px-3 py-2 border ${m.id === model.id ? 'border-[#d9ff00]/50 bg-[#d9ff00]/[0.06]' : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'}`}>
              <span className="flex items-center gap-1.5 text-[13px] font-semibold text-white">{m.name}{m.id === model.id && <LuCheck size={12} className="text-[#d9ff00]" />}</span>
              <span className="block text-[11px] text-white/45 leading-snug">{m.summary}</span>
            </button>
          ))}
        </div>

        {/* source video */}
        <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-3 space-y-2">
          <p className="text-xs font-semibold text-white/70 flex items-center gap-1.5"><LuVideo size={13} />{isMotion ? 'Vídeo com o movimento' : 'Vídeo para transformar'} <span className="text-white/35 font-normal">({minSeconds} a {maxSeconds} s)</span></p>
          {sourceUrl ? (
            <div className="relative rounded-xl overflow-hidden bg-black">
              <video src={sourceUrl} muted controls playsInline preload="metadata" className="w-full max-h-48 object-contain" />
              <button type="button" onClick={() => setSourceUrl('')} aria-label="Remover vídeo" className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 text-white flex items-center justify-center"><LuX size={13} /></button>
            </div>
          ) : (
            <>
              <input ref={videoInput} type="file" accept="video/mp4,video/quicktime,video/webm" className="hidden" onChange={pickVideo} />
              <button type="button" disabled={busy === 'video'} onClick={() => videoInput.current?.click()} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white/[0.06] hover:bg-white/10 text-sm text-white disabled:opacity-50">
                <LuUpload size={14} />{busy === 'video' ? 'Enviando vídeo…' : 'Enviar vídeo do computador'}
              </button>
              {doneVideos.length > 0 && (
                <div className="grid grid-cols-4 gap-1.5">
                  {doneVideos.slice(0, 8).map((j) => (
                    <button key={j.id} type="button" onClick={() => setSourceUrl(j.url)} title="Usar este vídeo" className="aspect-square rounded-lg overflow-hidden bg-black border border-transparent hover:border-[#d9ff00]">
                      <MediaThumb job={j} compact />
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-3">
                <LuLink size={13} className="text-white/40" />
                <input onBlur={(e) => { const v = e.target.value.trim(); if (/^https?:\/\//.test(v)) setSourceUrl(v); }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} placeholder="Ou cole o link público do vídeo" className="flex-1 bg-transparent py-2 text-xs text-white placeholder:text-white/30 outline-none min-w-0" />
              </div>
            </>
          )}
          {videoSeconds && <p className={`text-[11px] ${tooLong || tooShort ? 'text-red-400' : 'text-white/40'}`}>Duração: {videoSeconds.toFixed(1)} s{tooLong ? ` · passa do limite de ${maxSeconds} s` : tooShort ? ` · mínimo ${minSeconds} s` : ''}</p>}
        </div>

        {/* character / reference images */}
        <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-3 space-y-2">
          <p className="text-xs font-semibold text-white/70 flex items-center gap-1.5"><LuUser size={13} />{isMotion ? 'Foto do personagem' : 'Imagens de referência (opcional, até 4)'}</p>
          <div className="flex flex-wrap gap-2">
            {images.map((img) => (
              <div key={img.id} className="relative w-16 h-16 rounded-lg overflow-hidden bg-black">
                <SafeImg src={img.url} className="w-full h-full object-cover" />
                <button type="button" onClick={() => setImages((list) => list.filter((i) => i.id !== img.id))} aria-label="Remover imagem" className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center"><LuX size={10} /></button>
              </div>
            ))}
            {images.length < maxImages && (
              <>
                <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={pickImage} />
                <button type="button" disabled={busy === 'image'} onClick={() => imageInput.current?.click()} className="w-16 h-16 rounded-lg border border-dashed border-white/20 text-white/50 hover:text-white hover:border-white/40 flex flex-col items-center justify-center gap-1 text-[10px] disabled:opacity-50">
                  <LuUpload size={14} />{busy === 'image' ? '…' : 'Enviar'}
                </button>
              </>
            )}
          </div>
          {isMotion && <p className="text-[10px] text-white/35">Use uma foto de corpo inteiro, nítida, parecida com o enquadramento do vídeo.</p>}
        </div>

        {/* prompt */}
        <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-3">
          <label htmlFor="motion-prompt" className="text-xs text-white/45">{isMotion ? 'Prompt (opcional)' : 'O que mudar'}</label>
          <textarea
            id="motion-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            maxLength={5000}
            placeholder={isMotion ? 'Ex.: o personagem dança seguindo o vídeo, movimento suave, estilo realista' : 'Ex.: troque a pessoa pela mulher da imagem 1 e o cenário por uma praia ao pôr do sol'}
            className="mt-1 w-full bg-transparent resize-none text-[13px] leading-relaxed text-white placeholder:text-white/25 outline-none custom-scrollbar"
          />
        </div>

        {/* options */}
        <div className="space-y-2">
          {isMotion ? (
            <>
              <p className="text-[11px] text-white/45 px-1">Orientação do personagem</p>
              <Segmented label="Orientação" value={settings.orientation} onChange={(v) => setSettings((s) => ({ ...s, orientation: v }))} options={[['video', 'Do vídeo (até 30 s)'], ['image', 'Da foto (até 10 s)']]} />
              <p className="text-[11px] text-white/45 px-1">Qualidade</p>
              <Segmented label="Qualidade" value={settings.quality} onChange={(v) => setSettings((s) => ({ ...s, quality: v }))} options={[['std', 'Padrão'], ['pro', 'Pro']]} />
            </>
          ) : (
            <>
              <p className="text-[11px] text-white/45 px-1">Resolução</p>
              <Segmented label="Resolução" value={settings.resolution} onChange={(v) => setSettings((s) => ({ ...s, resolution: v }))} options={[['720P', '720p'], ['1080P', '1080p']]} />
              <p className="text-[11px] text-white/45 px-1">Proporção</p>
              <Segmented label="Proporção" value={settings.ratio} onChange={(v) => setSettings((s) => ({ ...s, ratio: v }))} options={[['adaptive', 'Igual'], ['16:9', '16:9'], ['9:16', '9:16'], ['1:1', '1:1']]} />
            </>
          )}
          <p className="text-[11px] text-white/45 px-1">Som</p>
          <Segmented label="Som" value={settings.keepSound ? 'keep' : 'new'} onChange={(v) => setSettings((s) => ({ ...s, keepSound: v === 'keep' }))} options={[['keep', 'Manter o original'], ['new', isMotion ? 'Sem som original' : 'Criar som novo']]} />
        </div>
      </div>

      <div className="p-3 border-t border-white/[0.06] sticky bottom-0 z-20 bg-[#0a0a0b] lg:static">
        <button
          type="button"
          onClick={generate}
          disabled={!ready || submitting}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[#d9ff00] text-black font-bold text-[15px] hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_24px_rgba(217,255,0,0.15)]"
        >
          {submitting ? 'Enviando…' : 'Gerar'}
          <span className="flex items-center gap-0.5"><LuSparkles size={14} />{cost === null ? 'pela duração' : money(cost)}</span>
        </button>
        {!ready && <p className="text-[11px] text-white/40 text-center mt-2">{!sourceUrl ? 'Envie ou escolha o vídeo.' : isMotion && images.length !== 1 ? 'Envie a foto do personagem.' : tooLong || tooShort ? 'Ajuste a duração do vídeo.' : 'Escreva o que mudar ou envie uma imagem.'}</p>}
      </div>
    </>
  );
}
