/**
 * media.js — the three media back-ends of the composition:
 *
 *   AudioEngine  : AudioBuffer playback that *drives* the master clock, and a
 *                  MediaStreamAudioDestination used to mux audio into the export.
 *   syncVideo()  : keeps an HTMLVideoElement locked to the master clock in both
 *                  preview (smooth) and export (frame-accurate) modes.
 *   loadGif()    : gifuct-js decode + full-frame compositing (GIF disposal types
 *                  0/1/2/3 honoured once, at import time, so playback is cheap).
 */

import { parseGIF, decompressFrames } from "gifuct-js";

/* ==========================================================================
 *  Audio
 * ========================================================================== */

export class AudioEngine {
  constructor() {
    /** @type {AudioContext|null} */
    this.ctx = null;
    /** @type {AudioBuffer|null} */
    this.buffer = null;
    this.source = null;
    this.gain = null;
    /** @type {MediaStreamAudioDestinationNode|null} */
    this.streamDest = null;
    this._startedAt = 0;
    this._offset = 0;
    this.onEnded = null;
    this.name = "";
  }

  ensureContext() {
    if (!this.ctx || this.ctx.state === "closed") {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.gain = this.ctx.createGain();
      this.gain.connect(this.ctx.destination);
      this.streamDest = this.ctx.createMediaStreamDestination();
      this.gain.connect(this.streamDest);
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  /**
   * @param {AudioBuffer} buffer
   * @param {string} [name]
   */
  setBuffer(buffer, name = "") {
    this.stop();
    this.buffer = buffer;
    this.name = name;
  }

  get duration() {
    return this.buffer ? this.buffer.duration : 0;
  }

  /** Current position in seconds (audio is the master clock while playing). */
  get position() {
    if (!this.buffer || !this.source) return null;
    const elapsed = this.ctx.currentTime - this._startedAt;
    return Math.min(this._offset + elapsed, this.buffer.duration);
  }

  get isPlaying() {
    return Boolean(this.source);
  }

  /** @param {number} from seconds */
  play(from, onEnded) {
    this.stop();
    if (!this.buffer) return null;
    const ctx = this.ensureContext();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});

    const source = ctx.createBufferSource();
    source.buffer = this.buffer;
    source.connect(this.gain);
    source.onended = () => {
      if (this.source === source) {
        this.source = null;
        onEnded?.();
      }
    };

    const offset = Math.min(Math.max(0, from), this.buffer.duration);
    this._offset = offset;
    this._startedAt = ctx.currentTime;
    source.start(0, offset);
    this.source = source;
    return this.position;
  }

  stop() {
    if (!this.source) return;
    const source = this.source;
    this.source = null;
    source.onended = null;
    try {
      source.stop();
    } catch {
      /* already stopped */
    }
    source.disconnect();
  }

  /** Seek helper used by the transport (works while stopped). */
  stopAt() {
    this.stop();
  }
}

/* ==========================================================================
 *  Video
 * ========================================================================== */

const SEEK_TOLERANCE = 0.12;

/**
 * Lock an <video> element to the master clock.
 *
 *  * playing  → let the element run, only correct when it drifts
 *  * paused   → hard-seek (used by the scrubber)
 *  * accurate → await the `seeked` event (export / first frame)
 *
 * @param {HTMLVideoElement} video
 * @param {number} time
 * @param {boolean} playing
 * @param {boolean} [accurate]
 */
export function syncVideo(video, time, playing, accurate = false) {
  if (!video || video.readyState < 1) return Promise.resolve();
  const target = Math.max(0, Math.min(time, video.duration || time));
  const drift = Math.abs(video.currentTime - target);

  if (playing && !accurate) {
    if (drift > SEEK_TOLERANCE) video.currentTime = target;
    if (video.paused) video.play().catch(() => {});
    return Promise.resolve();
  }

  if (video.paused === false) video.pause();

  if (drift < 0.01) {
    if (accurate && video.readyState < 3) return waitForSeek(video);
    return Promise.resolve();
  }

  video.currentTime = target;
  return accurate ? waitForSeek(video) : Promise.resolve();
}

function waitForSeek(video) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener("seeked", finish);
      video.removeEventListener("loadeddata", finish);
      resolve();
    };
    video.addEventListener("seeked", finish);
    video.addEventListener("loadeddata", finish);
    setTimeout(finish, 1500);
  });
}

/* ==========================================================================
 *  GIF
 * ========================================================================== */

/**
 * Decode a GIF and pre-compose every frame to a full-size RGBA bitmap so that
 * disposal methods (0/1 keep, 2 clear-to-background, 3 restore-previous) are
 * resolved once at import instead of on every rendered frame.
 *
 * @param {File|Blob} file
 * @returns {Promise<{
 *   name:string, width:number, height:number, duration:number,
 *   delays:number[], frames:ImageBitmap[]|HTMLCanvasElement[],
 *   frameStarts:number[]
 * }>}
 */
export async function loadGif(file) {
  const arrayBuffer = await file.arrayBuffer();
  const parsed = parseGIF(arrayBuffer);
  const rawFrames = decompressFrames(parsed, true);

  if (!rawFrames.length) throw new Error("This GIF contains no image frames.");

  const width = parsed.lsd.width;
  const height = parsed.lsd.height;

  const surface = document.createElement("canvas");
  surface.width = width;
  surface.height = height;
  const ctx = surface.getContext("2d", { willReadFrequently: false });

  const frames = [];
  const delays = [];
  const frameStarts = [];
  let elapsed = 0;
  let snapshot = null;

  for (const raw of rawFrames) {
    const { left, top, width: fw, height: fh } = raw.dims;

    // Save the canvas just before a "restore to previous" frame is painted.
    if (raw.disposalType === 3) snapshot = cloneCanvas(surface);

    const patch = new ImageData(raw.patch, fw, fh);
    const bitmap = await createImageBitmap(patch);
    ctx.drawImage(bitmap, left, top);
    bitmap.close?.();

    frames.push(cloneCanvas(surface));
    const delay = raw.delay > 0 ? raw.delay : 100;
    delays.push(delay);
    frameStarts.push(elapsed);
    elapsed += delay;

    // Apply this frame's disposal method so the *next* frame composites right.
    if (raw.disposalType === 2) {
      ctx.clearRect(left, top, fw, fh);
    } else if (raw.disposalType === 3 && snapshot) {
      ctx.drawImage(snapshot, 0, 0);
      snapshot = null;
    }
  }

  return {
    name: file.name || "animation.gif",
    width,
    height,
    duration: Math.max(elapsed, 1) / 1000,
    delays,
    frameStarts,
    frames,
  };
}

function cloneCanvas(source) {
  const copy = document.createElement("canvas");
  copy.width = source.width;
  copy.height = source.height;
  copy.getContext("2d").drawImage(source, 0, 0);
  return copy;
}

/** Pick the GIF frame index for a local time in seconds. */
export function gifFrameAt(gif, localSeconds) {
  const t = Math.max(0, localSeconds);
  const { frameStarts, delays } = gif;
  // Binary search keeps this O(log n) even for 500-frame GIFs.
  let lo = 0;
  let hi = frameStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frameStarts[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  const within = t - frameStarts[lo];
  if (within > (delays[lo] / 1000) * 1.6 && lo < frameStarts.length - 1) {
    return lo + 1;
  }
  return lo;
}
