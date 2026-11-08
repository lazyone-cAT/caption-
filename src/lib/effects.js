/**
 * effects.js — every animated look in the studio is an **anime.js v4 timeline**
 * that is *seeked*, never played.
 *
 * The renderer never calls `play()`; it asks anime for the state at an exact
 * millisecond:
 *
 *      animator.timeline.seek(localMs, /* muteCallbacks = * / 1)
 *
 * That makes the effect engine deterministic, so preview and export produce
 * identical pixels. Timelines are built once per (cue × style × seed) and cached.
 *
 * ── anime.js v4 rules this file obeys ────────────────────────────────────────
 *  • Time unit is **milliseconds** (globals.defaults.duration = 1000).
 *  • The easing key is `ease` — NOT `easing` (`easing` is not a reserved key
 *    and would be animated as if it were a property of the target!).
 *  • `defaults: { ease, duration }`.
 *  • `prop: [from, to]` sets an explicit start value; otherwise anime captures
 *    the target's *current* value at `add()` time and never re-reads it.
 *  • Two tweens on the same property must not overlap in time.
 *  • A tween that has not started yet does not render, so the state object's
 *    initial value must equal the first tween's `from` value.
 *  • `eases.outCubic` is already a function; `eases.outBack(1.7)` is a factory
 *    and must be called. `steps(n)` comes from the top-level exports.
 */

import { createTimeline, stagger, steps, eases } from "animejs";

const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

/* ==========================================================================
 *  State containers (initial values == first tween's `from` value)
 * ========================================================================== */

export function createTextState(charCount) {
  return {
    // whole block
    o: 0,
    s: 1,
    x: 0,
    y: 0,
    r: 0,
    blur: 0,
    glitch: 0,
    reveal: 0,
    shake: 0,
    neon: 0,
    // per character
    chars: Array.from({ length: charCount }, () => ({
      o: 0,
      y: 0,
      x: 0,
      s: 1,
      sy: 1,
      r: 0,
      blur: 0,
      fill: 0,
      scr: 0,
    })),
    charCount,
  };
}

export function createGifState() {
  // `wipe: 1` = fully revealed, which is what a GIF with no wipe-in needs.
  return { o: 0, s: 1, sx: 1, sy: 1, x: 0, y: 0, r: 0, blur: 0, hue: 0, wipe: 1 };
}

export function createTransitionState() {
  return { p: 0, o: 1, hue: 0, strength: 1 };
}

/** Reset a freshly created state so every timeline starts from a known pose. */
function poseChars(chars, values) {
  for (const c of chars) Object.assign(c, values);
}

/* ==========================================================================
 *  Caption text effects
 * ========================================================================== */

/**
 * @param {object} args
 * @param {number} args.durationMs   full cue length in ms
 * @param {number} args.charCount
 * @param {string} args.effectId
 * @param {number} args.inDuration
 * @param {number} args.outDuration
 */
export function createCueAnimator({
  durationMs,
  charCount,
  effectId,
  inDuration,
  outDuration,
  variation = {},
  canvasH = 720,
}) {
  const D = Math.max(340, durationMs);
  const inD = clamp(inDuration, 90, Math.floor(D * 0.45));
  const outD = clamp(outDuration, 80, Math.floor(D * 0.45));
  const outStart = D - outD; // guaranteed >= D * 0.55 > inD → phases never overlap

  const state = createTextState(charCount);
  const chars = state.chars;

  // Stagger spreads must stay inside the "in" window so per-character tweens
  // can never collide with the per-character exit tweens.
  const inSpread = Math.max(1, Math.min(520, D * 0.3));
  const outSpread = Math.max(1, Math.min(240, D * 0.12));
  const stepIn = charCount > 1 ? Math.max(6, inSpread / charCount) : 0;
  const stepOut = charCount > 1 ? Math.max(4, outSpread / charCount) : 0;

  const timeline = createTimeline({
    autoplay: false,
    defaults: { duration: inD, ease: eases.outCubic },
  });

  const ctx = { state, chars, timeline, inD, outD, outStart, D, canvasH, variation, stepIn, stepOut };

  (TEXT_EFFECTS[effectId] || TEXT_EFFECTS.pop)(ctx);

  return { state, timeline, durationMs: D, kind: "text" };
}

const TEXT_EFFECTS = {
  pop({ state, chars, timeline, inD, outStart, outD, variation }) {
    poseChars(chars, { o: 1 }); // block-level effect: characters stay opaque
    const k = variation.scaleJitter || 1;
    state.s = 0.22 * k;
    timeline.add(state, { o: [0, 1], ease: eases.outQuad, duration: Math.round(inD * 0.5) }, 0);
    timeline.add(state, { s: [0.22 * k, 1 * k], ease: eases.outBack(), duration: inD }, 0);
    timeline.add(state, { o: [1, 0], s: [1 * k, 1.24 * k], ease: eases.inBack(), duration: outD }, outStart);
  },

  typewriter({ state, chars, timeline, inD, outStart, outD }) {
    state.reveal = 0;
    poseChars(chars, { o: 1 });
    timeline.add(state, { o: [0, 1], duration: 60, ease: eases.outQuad }, 0);
    timeline.add(state, { reveal: [0, 1], ease: eases.linear, duration: Math.max(inD * 2, 520) }, 0);
    timeline.add(state, { o: [1, 0], s: [1, 1.06], ease: eases.inQuad, duration: outD }, outStart);
  },

  wave({ state, chars, timeline, inD, outStart, outD, stepIn, stepOut }) {
    timeline.add(state, { o: [0, 1], duration: 180, ease: eases.outQuad }, 0);
    timeline.add(
      chars,
      {
        o: [0, 1],
        y: [70, 0],
        s: [0.7, 1.14],
        delay: stagger(stepIn),
        ease: eases.outBack(),
        duration: inD,
      },
      0
    );
    timeline.add(
      chars,
      {
        o: [1, 0],
        y: [0, 46],
        s: [1.14, 0.9],
        delay: stagger(stepOut),
        ease: eases.inQuad,
        duration: outD,
      },
      outStart
    );
  },

  slam({ state, chars, timeline, inD, outStart, outD, canvasH, variation, stepIn, stepOut }) {
    const drop = Math.max(canvasH * 0.6, 340) + Math.abs(variation.yJitter || 0);
    state.shake = 0;
    timeline.add(state, { o: [0, 1], duration: 80, ease: eases.outQuad }, 0);
    timeline.add(
      chars,
      {
        o: [0, 1],
        y: [-drop, 0],
        s: [1.75, 1],
        r: [-7, 0],
        delay: stagger(stepIn),
        ease: eases.outBounce,
        duration: Math.max(inD, 460),
      },
      0
    );
    timeline.add(state, { shake: [0, 1], duration: 50, ease: eases.linear }, 0);
    timeline.add(state, { shake: [1, 0], duration: 400, ease: eases.outQuad }, 60);
    timeline.add(
      chars,
      {
        o: [1, 0],
        y: [0, -drop * 0.55],
        delay: stagger(stepOut),
        ease: eases.inQuad,
        duration: outD,
      },
      outStart
    );
  },

  blurin({ state, chars, timeline, inD, outStart, outD }) {
    poseChars(chars, { o: 1 }); // block-level effect: characters stay opaque
    state.blur = 36;
    state.s = 1.16;
    timeline.add(state, { o: [0, 1], duration: Math.round(inD * 0.6), ease: eases.outQuad }, 0);
    timeline.add(state, { blur: [36, 0], s: [1.16, 1], ease: eases.outExpo, duration: inD }, 0);
    timeline.add(
      state,
      { o: [1, 0], blur: [0, 30], s: [1, 0.93], ease: eases.inQuad, duration: outD },
      outStart
    );
  },

  glitch({ state, chars, timeline, inD, outStart, outD }) {
    timeline.add(state, { o: [0, 1], duration: 30, ease: eases.outQuad }, 0);
    timeline.add(state, { glitch: [0, 1], duration: 40, ease: eases.outQuad }, 0);
    timeline.add(
      chars,
      { o: [0, 1], delay: stagger(16), duration: Math.round(inD * 0.6), ease: steps(4) },
      0
    );
    timeline.add(state, { glitch: [1, 0], duration: Math.max(inD, 360), ease: steps(7) }, 40);
    timeline.add(
      state,
      { glitch: [0, 1], duration: 40, ease: steps(2) },
      outStart
    );
    timeline.add(
      state,
      { o: [1, 0], glitch: [1, 0.35], duration: outD, ease: steps(5) },
      outStart + 40
    );
  },

  scramble({ state, chars, timeline, inD, outStart, outD, stepIn, stepOut }) {
    timeline.add(state, { o: [0, 1], duration: 30, ease: eases.outQuad }, 0);
    timeline.add(
      chars,
      { o: [0, 1], scr: [1, 1], delay: stagger(stepIn), duration: Math.round(inD * 0.5), ease: eases.linear },
      0
    );
    timeline.add(
      chars,
      { scr: [1, 0], delay: stagger(stepIn), duration: Math.max(inD, 520), ease: steps(5) },
      Math.round(inD * 0.35)
    );
    timeline.add(
      chars,
      { o: [1, 0], scr: [0, 1], delay: stagger(stepOut), duration: outD, ease: steps(4) },
      outStart
    );
  },

  bounce({ state, chars, timeline, inD, outStart, outD, stepIn, stepOut }) {
    timeline.add(state, { o: [0, 1], duration: 30, ease: eases.outQuad }, 0);
    timeline.add(
      chars,
      {
        o: [0, 1],
        y: [-260, 0],
        delay: stagger(stepIn),
        ease: eases.outBounce,
        duration: Math.max(inD, 560),
      },
      0
    );
    timeline.add(
      chars,
      { o: [1, 0], y: [0, 300], delay: stagger(stepOut), ease: eases.inQuad, duration: outD },
      outStart
    );
  },

  flip({ state, chars, timeline, inD, outStart, outD, stepIn, stepOut }) {
    timeline.add(state, { o: [0, 1], duration: 50, ease: eases.outQuad }, 0);
    timeline.add(
      chars,
      {
        o: [0, 1],
        sy: [0.02, 1],
        r: [-60, 0],
        s: [1.4, 1],
        delay: stagger(stepIn),
        ease: eases.outExpo,
        duration: Math.max(inD, 460),
      },
      0
    );
    timeline.add(
      chars,
      {
        o: [1, 0],
        sy: [1, 0.02],
        r: [0, 50],
        delay: stagger(stepOut),
        ease: eases.inExpo,
        duration: outD,
      },
      outStart
    );
  },

  karaoke({ state, chars, timeline, inD, outStart, outD, stepIn }) {
    state.reveal = 0;
    poseChars(chars, { o: 1, fill: 0 });
    timeline.add(state, { o: [0, 1], duration: 120, ease: eases.outQuad }, 0);
    timeline.add(
      state,
      { reveal: [0, 1], ease: eases.linear, duration: Math.min(D_safe(inD * 2.6, 1200), 1200) },
      0
    );
    timeline.add(chars, { fill: [0, 1], delay: stagger(stepIn), duration: 460, ease: eases.linear }, inD);
    timeline.add(state, { o: [1, 0], ease: eases.inQuad, duration: outD }, outStart);
  },

  shake({ state, chars, timeline, inD, outStart, outD, stepIn }) {
    state.shake = 0;
    timeline.add(state, { o: [0, 1], shake: [0, 1], duration: 160, ease: eases.outQuad }, 0);
    timeline.add(
      chars,
      { o: [0, 1], s: [1.14, 1], delay: stagger(stepIn), ease: eases.outBack(), duration: inD },
      0
    );
    timeline.add(state, { shake: [1, 0], duration: outD, ease: eases.inOutSine }, outStart);
    timeline.add(state, { o: [1, 0], duration: outD, ease: eases.inQuad }, outStart);
  },

  neon({ state, chars, timeline, inD, outStart, outD, stepIn }) {
    state.neon = 0;
    timeline.add(state, { o: [0, 1], duration: 40, ease: eases.outQuad }, 0);
    timeline.add(state, { neon: [0, 1], duration: Math.max(inD, 520), ease: steps(8) }, 0);
    timeline.add(
      chars,
      { o: [0, 1], s: [1.09, 1], delay: stagger(stepIn), ease: eases.outQuad, duration: Math.max(inD, 520) },
      0
    );
    timeline.add(state, { neon: [1, 0], duration: outD, ease: steps(6) }, outStart);
    timeline.add(state, { o: [1, 0], duration: outD, ease: eases.inQuad }, outStart);
  },
};

function D_safe(v, max) {
  return Math.min(Math.max(v, 300), max);
}

/* ==========================================================================
 *  GIF in / out effects
 * ========================================================================== */

const GIF_IN = {
  none: ({ state, timeline, D }) => {
    timeline.add(state, { o: [0, 1], duration: 1, ease: eases.linear }, 0);
  },
  fade: ({ state, timeline, inD }) => {
    timeline.add(state, { o: [0, 1], ease: eases.outQuad, duration: inD }, 0);
  },
  zoomin: ({ state, timeline, inD }) => {
    state.s = 0.16;
    state.blur = 16;
    timeline.add(state, { o: [0, 1], ease: eases.outQuad, duration: Math.round(inD * 0.4) }, 0);
    timeline.add(state, { s: [0.16, 1], blur: [16, 0], ease: eases.outBack(), duration: inD }, 0);
  },
  slideUp: ({ state, timeline, inD }) => {
    state.y = 640;
    timeline.add(state, { o: [0, 1], ease: eases.outQuad, duration: Math.round(inD * 0.35) }, 0);
    timeline.add(state, { y: [640, 0], ease: eases.outExpo, duration: inD }, 0);
  },
  slideRight: ({ state, timeline, inD }) => {
    state.x = -1200;
    timeline.add(state, { o: [0, 1], ease: eases.outQuad, duration: Math.round(inD * 0.35) }, 0);
    timeline.add(state, { x: [-1200, 0], ease: eases.outExpo, duration: inD }, 0);
  },
  spin: ({ state, timeline, inD }) => {
    state.r = -240;
    state.s = 0.25;
    timeline.add(state, { o: [0, 1], ease: eases.outQuad, duration: Math.round(inD * 0.3) }, 0);
    timeline.add(state, { r: [-240, 0], s: [0.25, 1], ease: eases.outElastic(1, 0.5), duration: Math.round(inD * 1.1) }, 0);
  },
  blur: ({ state, timeline, inD }) => {
    state.blur = 52;
    state.s = 1.22;
    timeline.add(state, { o: [0, 1], ease: eases.outQuad, duration: Math.round(inD * 0.4) }, 0);
    timeline.add(state, { blur: [52, 0], s: [1.22, 1], ease: eases.outExpo, duration: inD }, 0);
  },
  glitch: ({ state, timeline, inD }) => {
    state.x = 70;
    state.hue = 110;
    timeline.add(state, { o: [0, 1], duration: 20, ease: eases.outQuad }, 0);
    timeline.add(state, { x: [70, -46], ease: steps(4), duration: Math.round(inD * 0.5) }, 0);
    timeline.add(state, { hue: [110, -80], ease: steps(4), duration: Math.round(inD * 0.5) }, 0);
    timeline.add(state, { x: [-46, 0], ease: steps(4), duration: Math.round(inD * 0.5) }, Math.round(inD * 0.5));
    timeline.add(state, { hue: [-80, 0], ease: steps(5), duration: Math.round(inD * 0.5) }, Math.round(inD * 0.5));
  },
  wipe: ({ state, timeline, inD }) => {
    state.wipe = 0;
    timeline.add(state, { o: [0, 1], duration: 40, ease: eases.outQuad }, 0);
    timeline.add(state, { wipe: [0, 1], ease: eases.inOutQuad, duration: inD }, 0);
  },
  flip: ({ state, timeline, inD }) => {
    state.sy = 0.02;
    state.r = -80;
    timeline.add(state, { o: [0, 1], duration: Math.round(inD * 0.3) }, 0);
    timeline.add(state, { sy: [0.02, 1], r: [-80, 0], ease: eases.outExpo, duration: inD }, 0);
  },
  bounce: ({ state, timeline, inD }) => {
    state.y = -760;
    timeline.add(state, { o: [0, 1], duration: 30 }, 0);
    timeline.add(state, { y: [-760, 0], ease: eases.outBounce, duration: Math.round(inD * 1.35) }, 0);
  },
  elastic: ({ state, timeline, inD }) => {
    state.s = 0;
    timeline.add(state, { o: [0, 1], duration: 20 }, 0);
    timeline.add(state, { s: [0, 1], ease: eases.outElastic(1, 0.42), duration: Math.round(inD * 1.4) }, 0);
  },
};

const GIF_OUT = {
  none: ({ state, timeline, D }) => {
    timeline.add(state, { o: [1, 1], duration: 1, ease: eases.linear }, Math.max(D - 1, 0));
  },
  fade: ({ state, timeline, outStart, outD }) => {
    timeline.add(state, { o: [1, 0], ease: eases.inQuad, duration: outD }, outStart);
  },
  zoomout: ({ state, timeline, outStart, outD }) => {
    timeline.add(state, { o: [1, 0], s: [1, 0.08], blur: [0, 26], ease: eases.inExpo, duration: outD }, outStart);
  },
  slideDown: ({ state, timeline, outStart, outD }) => {
    timeline.add(state, { o: [1, 0], y: [0, 760], ease: eases.inQuad, duration: outD }, outStart);
  },
  slideLeft: ({ state, timeline, outStart, outD }) => {
    timeline.add(state, { o: [1, 0], x: [0, -1300], ease: eases.inQuad, duration: outD }, outStart);
  },
  spin: ({ state, timeline, outStart, outD }) => {
    timeline.add(state, { o: [1, 0], r: [0, 300], s: [1, 0.15], ease: eases.inQuad, duration: outD }, outStart);
  },
  blur: ({ state, timeline, outStart, outD }) => {
    timeline.add(state, { o: [1, 0], blur: [0, 60], s: [1, 1.3], ease: eases.inQuad, duration: outD }, outStart);
  },
  shrink: ({ state, timeline, outStart, outD }) => {
    const p1 = Math.round(outD * 0.35);
    timeline.add(state, { s: [1, 1.14], duration: p1, ease: eases.outQuad }, outStart);
    timeline.add(state, { o: [1, 0], s: [1.14, 0], duration: outD - p1, ease: eases.inBack() }, outStart + p1);
  },
  wobble: ({ state, timeline, outStart, outD }) => {
    const p1 = Math.round(outD * 0.3);
    const p2 = Math.round(outD * 0.3);
    timeline.add(state, { r: [0, 18], duration: p1, ease: eases.inOutSine }, outStart);
    timeline.add(state, { r: [18, -18], duration: p2, ease: eases.inOutSine }, outStart + p1);
    timeline.add(state, { r: [-18, 0], o: [1, 0], s: [1, 0.35], duration: outD - p1 - p2, ease: eases.inQuad }, outStart + p1 + p2);
  },
  drop: ({ state, timeline, outStart, outD }) => {
    timeline.add(state, { o: [1, 0], y: [0, 1000], r: [0, 45], ease: eases.inQuad, duration: outD }, outStart);
  },
  glitch: ({ state, timeline, outStart, outD }) => {
    const a = Math.round(outD * 0.5);
    const b = Math.round(outD * 0.3);
    timeline.add(state, { x: [0, -80], hue: [0, -120], duration: a, ease: steps(4) }, outStart);
    timeline.add(state, { x: [-80, 60], hue: [-120, 130], o: [1, 0.35], duration: b, ease: steps(4) }, outStart + a);
    timeline.add(state, { x: [60, 0], o: [0.35, 0], duration: outD - a - b, ease: steps(3) }, outStart + a + b);
  },
  flip: ({ state, timeline, outStart, outD }) => {
    timeline.add(state, { sy: [1, 0.02], r: [0, 80], duration: Math.round(outD * 0.7), ease: eases.inExpo }, outStart);
    timeline.add(state, { o: [1, 0], duration: Math.round(outD * 0.5), ease: eases.inQuad }, outStart + Math.round(outD * 0.5));
  },
};

/**
 * Build the seekable timeline for one GIF layer item.
 * @param {{durationMs:number, inEffect:string, outEffect:string, inDurationMs:number, outDurationMs:number}} item
 */
export function createGifAnimator(item) {
  const D = Math.max(420, item.durationMs);
  const inD = clamp(item.inDurationMs || 520, 90, Math.floor(D * 0.45));
  const outD = clamp(item.outDurationMs || 420, 90, Math.floor(D * 0.45));
  const outStart = D - outD;

  const state = createGifState();
  const timeline = createTimeline({
    autoplay: false,
    defaults: { duration: inD, ease: eases.outCubic },
  });

  (GIF_IN[item.inEffect] || GIF_IN.fade)({ state, timeline, inD, outD, outStart, D });
  (GIF_OUT[item.outEffect] || GIF_OUT.fade)({ state, timeline, inD, outD, outStart, D });

  return { state, timeline, durationMs: D, kind: "gif" };
}

/* ==========================================================================
 *  Colourful transitions
 * ========================================================================== */

/**
 * A transition is a short full-frame overlay played right after a caption (or
 * segment) begins. Progress `p` runs 0 → 1 across `durationMs`.
 */
export function createTransitionAnimator(transitionId, durationMs) {
  const D = Math.max(140, durationMs);
  const state = createTransitionState();
  const timeline = createTimeline({ autoplay: false, defaults: { ease: eases.outQuad } });

  if (transitionId && transitionId !== "none") {
    timeline.add(state, { p: [0, 1], ease: eases.inOutQuad, duration: D }, 0);
    timeline.add(state, { o: [1, 0], ease: eases.outQuad, duration: Math.round(D * 0.4) }, Math.round(D * 0.6));
    if (transitionId === "rainbow" || transitionId === "confetti") {
      timeline.add(state, { hue: [0, 360], ease: eases.linear, duration: D }, 0);
    }
    if (transitionId === "flash" || transitionId === "spinBlur" || transitionId === "glitch") {
      timeline.add(state, { strength: [1, 0], ease: eases.inQuad, duration: Math.round(D * 0.55) }, Math.round(D * 0.45));
    }
  } else {
    state.p = 1;
    state.o = 0;
    timeline.add(state, { p: [1, 1], o: [0, 0], duration: 1, ease: eases.linear }, 0);
  }

  return { state, timeline, durationMs: D, kind: "transition" };
}

/* ==========================================================================
 *  Seeking / disposal
 * ========================================================================== */

export function seekAnimator(animator, localMs) {
  if (!animator) return null;
  const time = clamp(localMs, 0, animator.durationMs);
  // muteCallbacks = 1 → no onBegin/onUpdate noise while scrubbing; values are
  // still written to the target objects by the render pass.
  animator.timeline.seek(time, 1);
  return animator.state;
}

export function disposeAnimator(animator) {
  try {
    animator?.timeline?.cancel?.();
    animator?.timeline?.revert?.();
  } catch {
    /* already gone */
  }
}
