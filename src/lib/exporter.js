/**
 * exporter.js — capture the composition to a .webm file.
 *
 * Strategy: `canvas.captureStream()` on the *same* canvas the preview draws to,
 * plus the audio tracks already being fed by `AudioEngine.streamDest`. The app's
 * own render loop keeps drawing, so preview and export are pixel-identical by
 * construction — there is no second renderer to keep in sync.
 *
 * Recording is real-time (MediaRecorder has no offline mode), so the audio
 * element becomes the clock's `timeProvider` during export: whatever the Web
 * Audio graph is playing is what gets muxed, and the canvas follows it.
 */

/** Pick the best MediaRecorder mime type this browser can actually encode. */
export function pickMime() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm',
  ];
  if (typeof MediaRecorder === 'undefined') return null;
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      /* keep looking */
    }
  }
  return 'video/webm';
}

/**
 * @param {object} o
 * @param {HTMLCanvasElement} o.canvas      canvas the preview draws into
 * @param {AudioEngine} o.audio            engine whose streamDest carries audio
 * @param {Clock} o.clock                  master clock (audio is timeProvider)
 * @param {() => Promise<void>} [o.prepare] awaited before recording starts
 *        (seek video accurately, warm the compositor, etc.)
 * @param {(p:{t:number,done:boolean})=>void} [o.onProgress]
 * @returns {Promise<{blob:Blob, mime:string, seconds:number}>}
 */
export async function recordWebm({
  canvas,
  audio,
  clock,
  prepare = null,
  onProgress = null,
}) {
  const mime = pickMime();
  if (!mime) throw new Error('MediaRecorder is not supported in this browser.');
  if (!canvas.captureStream) throw new Error('canvas.captureStream is not supported.');

  // 60 fps capture; the canvas only repaints when the clock ticks anyway.
  const stream = canvas.captureStream(60);

  const dest = audio.streamDest;
  if (!dest) throw new Error('Audio engine has no stream destination.');
  if (audio.ctx?.state === 'suspended') await audio.ctx.resume();
  for (const track of dest.stream.getAudioTracks()) stream.addTrack(track);

  await prepare?.();

  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: 12_000_000,
    audioBitsPerSecond: 192_000,
  });
  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size) chunks.push(e.data);
  };
  const stopped = new Promise((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = (e) => reject(e.error || new Error('Recorder error'));
  });

  let stopTimer = 0;
  let finished = false;
  const requestStop = () => {
    if (finished) return;
    finished = true;
    clearTimeout(stopTimer);
    // Let the trailing frames land in the captured stream.
    stopTimer = setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop();
    }, 300);
  };

  const hasAudio = Boolean(audio.buffer);
  let audioEnded = false;

  // Watch the clock for the natural end of the composition.
  const watchEnd = clock.subscribe((c) => {
    onProgress?.({ t: c.time, done: false });
    if (c.time >= c.duration - 0.001 && !c.playing) requestStop();
    if (audioEnded && !c.playing) requestStop();
  });

  recorder.start(250);

  // Audio (when present) is the master clock: whatever the Web Audio graph
  // plays is what gets muxed, and the canvas follows it frame for frame.
  if (hasAudio) {
    if (!audio.buffer) audio.setBuffer(audio.buffer, audio.name || '');
    audio.play(0, () => {
      audioEnded = true;
      // The clock keeps running on rAF until this callback pauses it, so the
      // final frames still get drawn before the recorder stops.
      setTimeout(() => clock.pause(), 0);
    });
    let lastPos = 0;
    clock.setTimeProvider(() => {
      const p = audio.position;
      if (p == null) return lastPos; // between buffers — hold, never jump to 0
      lastPos = p;
      return p;
    });
  } else {
    clock.setTimeProvider(null);
  }

  clock.seek(0);
  clock.play();

  // Safety net: never hang the UI if neither trigger fires.
  const hardStop = setTimeout(requestStop, (clock.duration + 8) * 1000);

  try {
    await stopped;
  } finally {
    clearTimeout(hardStop);
    clearTimeout(stopTimer);
    watchEnd();
    clock.pause();
    clock.setTimeProvider(null);
    audio.stop();
    // Only stop the tracks this recording owns. The audio track belongs to the
    // AudioContext's MediaStreamDestination and is *reused* by the next export —
    // stopping it would silently mute every recording after the first.
    for (const t of stream.getVideoTracks()) t.stop();
  }

  const seconds = clock.time;
  const blob = new Blob(chunks, { type: mime.split(';')[0] });
  onProgress?.({ t: seconds, done: true });
  return { blob, mime, seconds };
}

/** Trigger a browser download for a Blob. */
export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
