'use client';

// Keeps finished videos alive and light in the history:
// 1. copies each APIMart result into the team's storage (APIMart deletes
//    them after 3 days), via /api/media/persist;
// 2. grabs one frame as a small JPEG cover, so the history shows images
//    instead of loading hundreds of videos.
// Work runs one item at a time in the background of whoever has the studio open.

import { useEffect, useRef, useState } from 'react';
import { apiFetch, supabaseBrowser } from '@/lib/supabase/browser';

const STORAGE_PREFIX = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/`;

export const isPermanentUrl = (url) => typeof url === 'string' && url.startsWith(STORAGE_PREFIX);

/** Draw a frame of the video into a JPEG blob (needs a CORS-enabled source). */
function captureFrame(url, width = 360) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const done = (fn, arg) => { clearTimeout(timer); video.removeAttribute('src'); video.load(); fn(arg); };
    const timer = setTimeout(() => done(reject, new Error('timeout')), 20000);
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.onloadedmetadata = () => { video.currentTime = Math.min(0.5, (video.duration || 1) / 2); };
    video.onseeked = () => {
      try {
        const scale = width / (video.videoWidth || width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round((video.videoWidth || width) * scale);
        canvas.height = Math.round((video.videoHeight || width * 1.78) * scale);
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => (blob ? done(resolve, blob) : done(reject, new Error('frame'))), 'image/jpeg', 0.72);
      } catch (err) { done(reject, err); }
    };
    video.onerror = () => done(reject, new Error('load'));
    video.src = url;
  });
}

async function makeThumb(job) {
  const blob = await captureFrame(job.url);
  const supabase = supabaseBrowser();
  const path = `thumbs/${job.id}.jpg`;
  const { error } = await supabase.storage.from('media').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error && !/exists|duplicate/i.test(error.message)) throw error;
  return supabase.storage.from('media').getPublicUrl(path).data.publicUrl;
}

export function useMediaKeeper(jobs, updateJob) {
  const tried = useRef(new Set());
  const busy = useRef(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (busy.current) return;
    const key = (j) => `${j.id}:${j.url}`;
    const next = jobs.find((j) => j.status === 'completed' && j.url && !j.mediaExpired && !tried.current.has(key(j))
      && (!isPermanentUrl(j.url) || !j.thumbUrl));
    if (!next) return;
    tried.current.add(key(next));
    busy.current = true;

    (async () => {
      try {
        let job = next;
        if (!isPermanentUrl(job.url)) {
          try {
            const res = await apiFetch('/api/media/persist', { method: 'POST', body: JSON.stringify({ id: job.id }) });
            if (res.url) { job = { ...job, url: res.url }; updateJob(job.id, { url: res.url }, { local: true }); }
          } catch (err) {
            if (/410|expir/i.test(err.message)) updateJob(job.id, { mediaExpired: true }, { local: true });
            return;
          }
        }
        if (!job.thumbUrl && isPermanentUrl(job.url)) {
          const thumbUrl = await makeThumb(job).catch(() => null);
          if (thumbUrl) await updateJob(job.id, { thumbUrl });
        }
      } finally {
        busy.current = false;
        setTick((t) => t + 1); // move on to the next item
      }
    })();
  }, [jobs, updateJob, tick]);
}
