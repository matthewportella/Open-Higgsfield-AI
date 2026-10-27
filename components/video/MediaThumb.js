'use client';

// Light previews for finished videos: a saved cover image when there is one,
// otherwise the first frame, loaded only when scrolled into view.

import { useEffect, useRef, useState } from 'react';
import { LuVideoOff } from 'react-icons/lu';

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

export function ExpiredMedia({ compact }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-center px-3 bg-[#0d0d0f]">
      <LuVideoOff size={compact ? 14 : 20} className="text-white/30" />
      {!compact && <p className="text-xs text-white/50 max-w-[220px]">Vídeo apagado pela APIMart (ela guarda só 3 dias). Os novos ficam salvos para sempre.</p>}
    </div>
  );
}

/**
 * Cheap preview of a finished video: the saved cover image when there is one,
 * otherwise the video's first frame, loaded only when it scrolls into view.
 */
export default function MediaThumb({ job, className = 'w-full h-full object-cover', hoverPlay = false, compact = false }) {
  const box = useRef(null);
  const near = useNearScreen(box);
  const [broken, setBroken] = useState(false);
  const [hover, setHover] = useState(false);
  if (job.mediaExpired || broken) return <div ref={box} className="w-full h-full"><ExpiredMedia compact={compact} /></div>;
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
    </div>
  );
}
