/**
 * ============================================================================
 *  transcribe.js  —  OFFLINE AUDIO → TEXT → TIME-SYNCED CAPTION ALGORITHM
 * ============================================================================
 *
 *  Pipeline (100% local, no AI service, no API key, no server round-trip):
 *
 *   1. decodeAudio(file)          File → AudioBuffer (Web Audio decodeAudioData)
 *   2. toMono16k(audioBuffer)     Resample + downmix to 16 kHz mono (OfflineAudioContext)
 *   3. transcribeFloat32(...)     Stream chunks → Vosk KaldiRecognizer (WASM, in a Worker)
 *                                 with SetWords(true) so every token carries an
 *                                 absolute start/end time measured from t = 0
 *   4. wordsToCues(words, opts)   Greedy segmentation algorithm:
 *                                 - start a new cue on a silence gap > gapThreshold
 *                                 - never exceed maxChars / maxWords / maxDuration
 *                                 - never cut shorter than minDuration
 *                                 - pad the tail of the last cue so it is readable
 *                                 → [{ id, start, end, text, words }]
 *   5. cuesToSRT / cuesToVTT      Subtitle serialisers
 *
 *  Vosk word timestamps are ABSOLUTE from the beginning of the stream:
 *      start = samplesRoundStart_ / sample_frequency
 *            + (frame_offset_ + t) * 0.03
 *  …so every word can be placed on the timeline directly, no re-anchoring needed.
 * ============================================================================
 */

import { createModel } from "vosk-browser";

/** Small English model (~41 MB) hosted with CORS: * — cached in IndexedDB by vosk-browser. */
export const DEFAULT_MODEL_URL =
  "https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz";

export const VOSK_SAMPLE_RATE = 16000;

/** Recognizer granularity. Smaller = snappier progress, slightly more overhead. */
const CHUNK_SECONDS = 0.4;

/* ==========================================================================
 *  1. Audio decoding
 * ========================================================================== */

/**
 * Read any audio file (and any video container that carries a decodable audio
 * track: mp4/m4a/webm/ogg/mkv) into an AudioBuffer.
 * @param {File|Blob} file
 * @param {AudioContext} [ctx]
 * @returns {Promise<AudioBuffer>}
 */
export async function decodeAudio(file, ctx) {
  const arrayBuffer = await file.arrayBuffer();
  const owner = ctx || new (window.AudioContext || window.webkitAudioContext)();
  try {
    return await owner.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    if (!ctx && owner.state !== "closed") owner.close().catch(() => {});
  }
}

/**
 * Normalise an AudioBuffer to 16 kHz single-channel float32 — the exact input
 * shape Vosk's KaldiRecognizer expects.
 *
 * The OfflineAudioContext performs a high quality polyphase resample and a
 * standards-compliant stereo → mono downmix in one GPU-side pass.
 *
 * @param {AudioBuffer} audioBuffer
 * @param {number} [targetRate]
 * @returns {Promise<Float32Array>}
 */
export async function toMono16k(audioBuffer, targetRate = VOSK_SAMPLE_RATE) {
  const length = Math.max(1, Math.ceil(audioBuffer.duration * targetRate));
  const off = new OfflineAudioContext(1, length, targetRate);
  const src = off.createBufferSource();
  src.buffer = audioBuffer;
  src.connect(off.destination);
  src.start(0);
  const rendered = await off.startRendering();
  return rendered.getChannelData(0).slice();
}

/* ==========================================================================
 *  2. Vosk model lifecycle
 * ========================================================================== */

/**
 * Load (and afterwards reuse) the WASM speech model.
 * @param {string} [modelUrl]
 * @param {(status:{stage:string,message:string,percent:number})=>void} [onStatus]
 * @returns {Promise<import('vosk-browser').Model>}
 */
export async function loadVoskModel(modelUrl = DEFAULT_MODEL_URL, onStatus) {
  onStatus?.({ stage: "download", message: "Fetching / unpacking model…", percent: 0 });
  const model = await createModel(modelUrl);
  onStatus?.({ stage: "ready", message: "Model ready.", percent: 100 });
  return model;
}

/* ==========================================================================
 *  3. Recognition
 * ========================================================================== */

const nextMacrotask = () => new Promise((r) => setTimeout(r, 0));

/**
 * Stream a mono Float32Array through a Vosk recognizer and collect every
 * word with its absolute timestamp.
 *
 * Deterministic completion: the worker answers *exactly one* message per
 * `audioChunk` (either `result` or `partialresult`) plus one final message for
 * `retrieveFinalResult`, so we count responses instead of guessing with a timer.
 *
 * @param {Float32Array} samples          16 kHz mono samples
 * @param {object} opts
 * @param {import('vosk-browser').Model} opts.model
 * @param {number} [opts.sampleRate]
 * @param {(p:{percent:number,phase:string})=>void} [opts.onProgress]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{words:Array<{w:string,s:number,e:number,conf:number}>, text:string, phrases:Array}>}
 */
export async function transcribeFloat32(samples, opts) {
  const { model, sampleRate = VOSK_SAMPLE_RATE, onProgress, signal } = opts;

  const recognizer = new model.KaldiRecognizer(sampleRate);
  recognizer.setWords(true);

  /** @type {Array<{result:{result?:Array,text?:string}}>} */
  const phrases = [];
  const errors = [];
  let responses = 0;

  const onResult = (message) => {
    responses += 1;
    if (message?.result) phrases.push(message.result);
  };
  const onPartial = () => {
    responses += 1;
  };
  const onError = (message) => {
    responses += 1;
    errors.push(message);
  };

  recognizer.on("result", onResult);
  recognizer.on("partialresult", onPartial);
  recognizer.on("error", onError);

  try {
    // Give the worker a beat to finish constructing the recognizer.
    await nextMacrotask();
    await nextMacrotask();

    const chunkSamples = Math.round(sampleRate * CHUNK_SECONDS);
    const totalChunks = Math.max(1, Math.ceil(samples.length / chunkSamples));

    for (let index = 0, sent = 0; sent < totalChunks; index += chunkSamples, sent += 1) {
      if (signal?.aborted) throw new DOMException("Transcription cancelled", "AbortError");
      const end = Math.min(index + chunkSamples, samples.length);
      recognizer.acceptWaveformFloat(samples.subarray(index, end), sampleRate);

      // Let the worker drain so the main thread stays responsive and
      // progress reflects real work instead of a queued burst.
      if (sent % 6 === 0 || sent === totalChunks - 1) {
        await nextMacrotask();
        onProgress?.({ percent: Math.round((sent / totalChunks) * 92), phase: "recognising" });
      }
    }

    recognizer.retrieveFinalResult();

    // The worker replies exactly once per chunk plus once for the final result.
    // Recognising is CPU-bound WASM, so the budget scales with audio length —
    // a generous 400 ms of wall clock per 0.4 s chunk (≈1× realtime) would be
    // too tight on a loaded machine, so we allow 3× that.
    const expected = totalChunks + 1;
    const audioSeconds = samples.length / sampleRate;
    const budgetMs = Math.max(60_000, audioSeconds * 3000);
    await waitFor(
      () => responses >= expected,
      budgetMs,
      () => signal?.aborted,
      () => {
        const done = Math.min(responses, expected);
        onProgress?.({
          percent: Math.min(99, Math.round(92 + 6 * (done / expected))),
          phase: "recognising",
        });
      }
    );
    onProgress?.({ percent: 99, phase: "flushing" });

    if (errors.length) {
      throw new Error(errors[0]?.error || "Vosk worker error");
    }

    // ---- flatten phrase results → word stream -----------------------------
    /** @type {Array<{w:string,s:number,e:number,conf:number}>} */
    const words = [];
    const textParts = [];
    for (const phrase of phrases) {
      if (phrase.text && phrase.text.trim()) textParts.push(phrase.text.trim());
      for (const item of phrase.result || []) {
        if (!item?.word) continue;
        words.push({
          w: item.word,
          s: Number(item.start) || 0,
          e: Number(item.end) || 0,
          conf: typeof item.conf === "number" ? item.conf : 1,
        });
      }
    }

    // Phrases are delivered in order, but be defensive: a stable sort by start
    // time guarantees a monotonic timeline for the caption segmenter.
    words.sort((a, b) => a.s - b.s || a.e - b.e);

    onProgress?.({ percent: 100, phase: "done" });
    return { words, text: textParts.join(" "), phrases };
  } finally {
    // `remove()` unregisters the recognizer from the model & drops its worker
    // instance, which also detaches the listeners registered through `on()`.
    try {
      recognizer.remove();
    } catch {
      /* recognizer already gone */
    }
  }
}

/**
 * Resolve once `test()` is truthy, reject on timeout or abort.
 * Uses `setTimeout` (not rAF) so it keeps ticking in a background tab, where
 * rAF is throttled to zero.
 * @param {() => boolean} test
 * @param {number} timeoutMs
 * @param {() => boolean} [aborted]
 * @param {(elapsedMs:number)=>void} [onTick]
 */
function waitFor(test, timeoutMs, aborted, onTick) {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const tick = () => {
      if (aborted?.()) return reject(new DOMException("Cancelled", "AbortError"));
      if (test()) return resolve();
      const elapsed = performance.now() - started;
      if (elapsed > timeoutMs) {
        return reject(new Error("Timed out waiting for the recognition worker"));
      }
      onTick?.(elapsed);
      setTimeout(tick, 60);
    };
    tick();
  });
}

/* ==========================================================================
 *  4. Caption segmentation algorithm
 * ========================================================================== */

export const DEFAULT_SEGMENT_OPTS = {
  /** Maximum characters before a cue is broken (≈ 2 lines of 42 chars). */
  maxChars: 42,
  /** Hard cap on words per cue. */
  maxWords: 10,
  /** A silence longer than this (seconds) always ends the current cue. */
  gapThreshold: 0.6,
  /** Cue shorter than this is merged with its neighbour. */
  minDuration: 0.7,
  /** Cue longer than this is split, even mid-burst. */
  maxDuration: 4.2,
  /** Extra time appended to the last word so the caption stays readable. */
  tailPad: 0.35,
  /** Never start a cue closer than this to the previous one. */
  minGap: 0.08,
};

let cueId = 0;

/**
 * Turn a flat, time-stamped word list into readable caption cues.
 *
 * Greedy left-to-right accumulation with three independent break conditions:
 *   (a) silence gap  > gapThreshold
 *   (b) accumulated  > maxChars / maxWords
 *   (c) accumulated  > maxDuration
 * …followed by a repair pass that merges cues violating minDuration/minGap and
 * an optional re-flow that hard-wraps over-long cues to maxChars.
 *
 * @param {Array<{w:string,s:number,e:number,conf?:number}>} words
 * @param {Partial<typeof DEFAULT_SEGMENT_OPTS>} [options]
 * @returns {Array<{id:number,start:number,end:number,text:string,words:Array}>}
 */
export function wordsToCues(words, options = {}) {
  const o = { ...DEFAULT_SEGMENT_OPTS, ...options };
  if (!words || words.length === 0) return [];

  /** @type {Array<Array<{w,s,e,conf}>>} */
  const buckets = [];
  let current = [];

  const pushBucket = () => {
    if (current.length) buckets.push(current);
    current = [];
  };

  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    const prev = current[current.length - 1];

    if (prev) {
      const gap = word.s - prev.e;
      const chars = current.reduce((n, w) => n + w.w.length + 1, 0);
      const span = word.e - current[0].s;

      // (a) silence — the strongest signal for a caption boundary
      if (gap > o.gapThreshold) {
        pushBucket();
      } else if (
        // (b) length budget
        current.length >= o.maxWords ||
        chars + word.w.length > o.maxChars ||
        // (c) time budget
        span > o.maxDuration
      ) {
        pushBucket();
      }
    }

    current.push(word);
  }
  pushBucket();

  // ---- repair pass: enforce minimum duration / separation -----------------
  const merged = [];
  for (const bucket of buckets) {
    const last = merged[merged.length - 1];
    const start = bucket[0].s;
    const end = bucket[bucket.length - 1].e;
    if (last && start - last.endRaw < o.minGap) {
      last.words.push(...bucket);
      last.endRaw = Math.max(last.endRaw, end);
      last.text = `${last.text} ${bucket.map((w) => w.w).join(" ")}`.trim();
    } else {
      merged.push({
        words: bucket.slice(),
        endRaw: end,
        text: bucket.map((w) => w.w).join(" "),
        startRaw: start,
      });
    }
  }

  // ---- shape into final cue objects ---------------------------------------
  const cues = [];
  for (const item of merged) {
    const first = item.words[0];
    const last = item.words[item.words.length - 1];
    let start = first.s;
    let end = last.e + o.tailPad;

    if (end - start < o.minDuration) {
      // Stretch very short cues symmetrically so they remain perceivable.
      const deficit = o.minDuration - (end - start);
      start = Math.max(0, start - deficit * 0.4);
      end = end + deficit * 0.6;
    }

    const prev = cues[cues.length - 1];
    if (prev) start = Math.max(start, prev.end + 0.02);

    cues.push({
      id: (cueId += 1),
      start: round3(start),
      end: round3(end),
      text: reflow(item.text, o.maxChars),
      words: item.words.map((w) => ({ ...w })),
    });
  }

  return cues;
}

/** Hard-wrap a caption to at most `maxChars` per line (max 2 lines). */
function reflow(text, maxChars) {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  const lines = [];
  let line = "";
  for (const word of words) {
    if (line && `${line} ${word}`.length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > 2) {
    // Re-balance into exactly two lines of similar length.
    const all = lines.join(" ");
    const mid = Math.ceil(all.length / 2);
    let cut = all.lastIndexOf(" ", mid);
    if (cut <= 0) cut = mid;
    return `${all.slice(0, cut).trim()}\n${all.slice(cut).trim()}`;
  }
  return lines.join("\n");
}

const round3 = (n) => Math.round(n * 1000) / 1000;

/* ==========================================================================
 *  5. Subtitle serialisers
 * ========================================================================== */

const pad = (n, size = 2) => String(n).padStart(size, "0");

/** `12.345` → `00:00:12,345` (SRT) or `00:00:12.345` (WebVTT). */
export function formatTimestamp(seconds, { comma = true } = {}) {
  const clamped = Math.max(0, seconds);
  const ms = Math.round(clamped * 1000);
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  const millis = ms % 1000;
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}${comma ? "," : "."}${pad(millis, 3)}`;
}

/** @param {Array<{start:number,end:number,text:string}>} cues */
export function cuesToSRT(cues) {
  return cues
    .map(
      (cue, i) =>
        `${i + 1}\n${formatTimestamp(cue.start)} --> ${formatTimestamp(cue.end)}\n${cue.text.replace(
          /\n/g,
          "\r\n"
        )}\r\n`
    )
    .join("\r\n");
}

/** @param {Array<{start:number,end:number,text:string}>} cues */
export function cuesToVTT(cues) {
  const body = cues
    .map(
      (cue, i) =>
        `${i + 1}\n${formatTimestamp(cue.start, { comma: false })} --> ${formatTimestamp(
          cue.end,
          { comma: false }
        )}\n${cue.text.replace(/\n/g, "\n")}\n`
    )
    .join("\n");
  return `WEBVTT\n\n${body}`;
}

/** Trigger a browser download for a generated text file. */
export function downloadText(filename, contents, mime = "text/plain") {
  const blob = new Blob([contents], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ==========================================================================
 *  6. Convenience: the whole pipeline in one call
 * ========================================================================== */

/**
 * @param {File|Blob} file
 * @param {object} opts
 * @param {import('vosk-browser').Model} opts.model
 * @param {(s:object)=>void} [opts.onStatus]
 * @param {AbortSignal} [opts.signal]
 */
export async function transcribeFile(file, { model, onStatus, signal } = {}) {
  onStatus?.({ stage: "decode", message: "Decoding audio…", percent: 4 });
  const audioBuffer = await decodeAudio(file);

  onStatus?.({ stage: "resample", message: "Resampling to 16 kHz mono…", percent: 8 });
  const samples = await toMono16k(audioBuffer);

  const result = await transcribeFloat32(samples, {
    model,
    signal,
    onProgress: ({ percent, phase }) =>
      onStatus?.({ stage: phase, message: "Recognising speech…", percent: 8 + percent * 0.88 }),
  });

  onStatus?.({ stage: "segment", message: "Building caption cues…", percent: 98 });
  const cues = wordsToCues(result.words);

  onStatus?.({ stage: "done", message: `${cues.length} caption cue(s) created.`, percent: 100 });
  return { cues, words: result.words, rawText: result.text, duration: audioBuffer.duration };
}
