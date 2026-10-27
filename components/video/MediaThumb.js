'use client';

// Light previews for finished videos: a saved cover image when there is one,
// otherwise the first frame, loaded only when scrolled into view.

import { useEffect, useRef, useState } from 'react';
import { LuVideoOff, LuUpload, LuImage } from 'react-icons/lu';

/** True once the element has scrolled near the screen (then stays true). */
function useNearScreen(ref) {
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (near || !ref.current) return undefined;
    if (typeof IntersectionObserver === 'undefined') { setNear(true); return undefined; }
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) setNear(true); }, { rootMargin: '400px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [near, ref]);
  return near;
}

/**
 * A video whose file is gone (APIMart kept it only 3 days, before the studio
 * started saving copies). `onRestore(file)` puts a downloaded copy back.
 */
export function ExpiredMedia({ compact, onRestore }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try { await onRestore(file); } finally { setBusy(false); }
  };
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-center px-3 bg-[#0d0d0f]">
      <LuVideoOff size={compact ? 14 : 20} className="text-white/30" />
      {!compact && (
        <>
          <p className="text-xs text-white/50 max-w-[240px]">O arquivo deste vídeo não está mais na APIMart. Se você tem ele baixado, restaure aqui e ele fica salvo para sempre.</p>
          {onRestore && (
            <>
              <input ref={input} type="file" accept="video/mp4,video/quicktime,video/webm" className="hidden" onChange={pick} />
              <button type="button" disabled={busy} onClick={(e) => { e.stopPropagation(); input.current?.click(); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#d9ff00] text-black text-xs font-bold disabled:opacity-50">
                <LuUpload size={12} />{busy ? 'Enviando…' : 'Restaurar vídeo'}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}

/** Image that falls back to an icon when its link no longer works. */
export function SafeImg({ src, className }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className={`${className} bg-white/10 flex items-center justify-center`}><LuImage size={12} className="text-white/40" /></span>;
  return <img src={src} alt="" loading="lazy" decoding="async" className={className} onError={() => setFailed(true)} />;
}

/**
 * Cheap preview of a finished video: the saved cover image when there is one,
 * otherwise the video's first frame, loaded only when it scrolls into view.
 */
export default function MediaThumb({ job, className = 'w-full h-full object-cover', hoverPlay = false, compact = false, overlay = null, onRestore }) {
  const box = useRef(null);
  const near = useNearScreen(box);
  const [broken, setBroken] = useState(false);
  const [hover, setHover] = useState(false);
  if (job.mediaExpired || broken) return <div ref={box} className="w-full h-full"><ExpiredMedia compact={compact} onRestore={onRestore} /></div>;
  const fail = () => setBroken(true);
  const showVideo = !job.thumbUrl || (hoverPlay && hover);
  return (
    <div ref={box} className="relative w-full h-full" onMouseEnter={hoverPlay ? () => setHover(true) : undefined} onMouseLeave={hoverPlay ? () => setHover(false) : undefined}>
      {job.thumbUrl && <img src={job.thumbUrl} alt="" loading="lazy" decoding="async" className={className} />}
      {near && showVideo && (
        <video
          src={hover ? job.url : `${job.url}#t=0.1`}
          muted
          loop={hoverPlay}
          autoPlay={hoverPlay && hover}
          playsInline
          preload={hover ? 'auto' : 'metadata'}
          onError={fail}
          className={`${className} ${job.thumbUrl ? 'absolute inset-0' : ''}`}
        />
      )}
      {overlay}
    </div>
  );
}
