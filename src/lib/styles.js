/**
 * styles.js — the design vocabulary of the studio: fonts, text effects,
 * GIF in/out effects, transitions, glow presets … plus the seeded randomiser
 * that powers the "🎲 Randomise" buttons (same seed ⇒ same look, so a project
 * stays reproducible).
 */

/* ==========================================================================
 *  Fonts
 * ========================================================================== */

export const FONTS = [
  { id: "anton", name: "Anton", stack: '"Anton", Impact, sans-serif', weight: 400 },
  { id: "bangers", name: "Bangers", stack: '"Bangers", cursive', weight: 400 },
  { id: "luckiest", name: "Luckiest Guy", stack: '"Luckiest Guy", cursive', weight: 400 },
  { id: "marker", name: "Permanent Marker", stack: '"Permanent Marker", cursive', weight: 400 },
  { id: "archivoblack", name: "Archivo Black", stack: '"Archivo Black", sans-serif', weight: 400 },
  { id: "russo", name: "Russo One", stack: '"Russo One", sans-serif', weight: 400 },
  { id: "righteous", name: "Righteous", stack: '"Righteous", sans-serif', weight: 400 },
  { id: "creepster", name: "Creepster", stack: '"Creepster", cursive', weight: 400 },
  { id: "bangers2", name: "Bevan", stack: '"Bevan", serif', weight: 400 },
  { id: "press", name: "Press Start 2P", stack: '"Press Start 2P", monospace', weight: 400 },
  { id: "fredoka", name: "Fredoka", stack: '"Fredoka", sans-serif', weight: 600 },
  { id: "shrikhand", name: "Shrikhand", stack: '"Shrikhand", cursive', weight: 400 },
  { id: "impact", name: "System Impact", stack: 'Impact, "Arial Black", sans-serif', weight: 700 },
  { id: "segoe", name: "Segoe UI Bold", stack: '"Segoe UI", system-ui, sans-serif', weight: 700 },
];

export const fontStack = (id) => FONTS.find((f) => f.id === id)?.stack || FONTS[0].stack;

/* ==========================================================================
 *  Caption text effects
 * ========================================================================== */

/** Every id here has an implementation in `effects.js` → `buildCueAnimator`. */
export const TEXT_EFFECTS = [
  { id: "pop", name: "💥 Pop", desc: "Scale bounce + settle" },
  { id: "typewriter", name: "⌨ Typewriter", desc: "Characters appear one by one" },
  { id: "wave", name: "🌊 Wave", desc: "Per-letter sine wave" },
  { id: "slam", name: "🔨 Slam", desc: "Drops in from above with impact" },
  { id: "blurin", name: "🌫 Blur In", desc: "Focus pull from soft to sharp" },
  { id: "glitch", name: "📺 Glitch", desc: "RGB split + horizontal jitter" },
  { id: "scramble", name: "🎲 Scramble", desc: "Glyphs resolve into words" },
  { id: "bounce", name: "🪀 Bounce", desc: "Words drop in a stagger" },
  { id: "flip", name: "🔄 Flip", desc: "Rotates on the X axis" },
  { id: "karaoke", name: "🎤 Karaoke", desc: "Colour sweeps across the line" },
  { id: "shake", name: "🫨 Shake", desc: "Constant nervous energy" },
  { id: "neon", name: "💡 Neon", desc: "Flickering neon-tube entrance" },
];

/* ==========================================================================
 *  GIF in / out effects
 * ========================================================================== */

export const GIF_IN_EFFECTS = [
  { id: "none", name: "None" },
  { id: "fade", name: "Fade In" },
  { id: "zoomin", name: "Zoom In" },
  { id: "slideUp", name: "Slide Up" },
  { id: "slideRight", name: "Slide Right" },
  { id: "spin", name: "Spin In" },
  { id: "blur", name: "Blur In" },
  { id: "glitch", name: "Glitch In" },
  { id: "wipe", name: "Wipe In" },
  { id: "flip", name: "Flip In" },
  { id: "bounce", name: "Bounce In" },
  { id: "elastic", name: "Elastic Pop" },
];

export const GIF_OUT_EFFECTS = [
  { id: "none", name: "None" },
  { id: "fade", name: "Fade Out" },
  { id: "zoomout", name: "Zoom Out" },
  { id: "slideDown", name: "Slide Down" },
  { id: "slideLeft", name: "Slide Left" },
  { id: "spin", name: "Spin Out" },
  { id: "blur", name: "Blur Out" },
  { id: "shrink", name: "Shrink & Pop" },
  { id: "wobble", name: "Wobble Out" },
  { id: "drop", name: "Drop Out" },
  { id: "glitch", name: "Glitch Out" },
  { id: "flip", name: "Flip Out" },
];

/* ==========================================================================
 *  Transitions (colourful wipes played on the caption/scene boundary)
 * ========================================================================== */

export const TRANSITIONS = [
  { id: "none", name: "None" },
  { id: "barWipe", name: "Bar Wipe" },
  { id: "iris", name: "Iris Circle" },
  { id: "rainbow", name: "Rainbow Sweep" },
  { id: "flash", name: "Colour Flash" },
  { id: "glitch", name: "Glitch Cut" },
  { id: "spinBlur", name: "Spin Blur" },
  { id: "confetti", name: "Confetti Burst" },
];

/* ==========================================================================
 *  Glow
 * ========================================================================== */

export const GLOW_COLORS = ["#ff2d95", "#00f0ff", "#ffe600", "#7cff6b", "#b26bff", "#ff7a2d", "#ffffff"];

export const DEFAULT_STYLE = {
  fontId: "anton",
  fontSize: 74,
  effectId: "pop",
  /** ms */
  inDuration: 520,
  outDuration: 320,
  align: "center",
  /** vertical anchor: 0 = top … 1 = bottom (captions sit low by default) */
  vPos: 0.76,
  lineHeight: 1.06,
  letterSpacing: 0,

  fill: "#ffffff",
  stroke: "#08080d",
  strokeWidth: 6,
  shadow: "rgba(0,0,0,0.55)",
  shadowBlur: 18,
  shadowY: 6,

  glowEnabled: true,
  glowColor: "#ff2d95",
  glowIntensity: 1.15,
  glowBlur: 46,
  glowPulse: true,

  gradientEnabled: true,
  gradientA: "#ffe600",
  gradientB: "#ff2d95",

  transitionId: "rainbow",
  transitionDuration: 0.55,

  randomSeed: 1337,
  perCueRandom: true,
  autoShuffle: true,
};

/* ==========================================================================
 *  Seeded randomiser
 * ========================================================================== */

/** Deterministic 32-bit PRNG (mulberry32) so a seed always yields the same look. */
export function createRandom(seed) {
  let a = (seed >>> 0) || 1;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => Math.floor(next() * (max - min + 1)) + min,
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
  };
}

/**
 * Roll a fresh, coherent caption look from a seed.
 * @param {number} seed
 * @returns {Partial<typeof DEFAULT_STYLE>}
 */
export function rollStyle(seed) {
  const rng = createRandom(seed);
  const font = rng.pick(FONTS.filter((f) => !["segoe"].includes(f.id)));
  const effect = rng.pick(TEXT_EFFECTS);
  const glow = rng.pick(GLOW_COLORS);
  const gradientA = rng.pick(GLOW_COLORS.filter((c) => c !== glow));
  const gradientB = rng.pick(GLOW_COLORS.filter((c) => c !== glow && c !== gradientA));

  return {
    fontId: font.id,
    effectId: effect.id,
    glowColor: glow,
    glowIntensity: 0.8 + rng.next() * 1.1,
    glowBlur: 30 + Math.round(rng.next() * 34),
    glowEnabled: rng.chance(0.8),
    gradientEnabled: rng.chance(0.65),
    gradientA,
    gradientB,
    strokeWidth: rng.pick([0, 4, 6, 8]),
    fontSize: rng.int(62, 86),
    letterSpacing: rng.pick([-1, 0, 0, 1, 2]),
    inDuration: rng.pick([360, 460, 520, 620, 760]),
    outDuration: rng.pick([240, 300, 360, 420]),
    randomSeed: seed,
  };
}

/** A per-cue pseudo-random tweak (used when "per-cue variation" is on). */
export function cueVariation(cueId, seed, style) {
  const rng = createRandom(seed * 7919 + cueId * 104729);
  return {
    rotate: (rng.next() - 0.5) * 3.4,
    scaleJitter: 0.965 + rng.next() * 0.075,
    yJitter: (rng.next() - 0.5) * 16,
    hueShift: rng.chance(0.35) ? (rng.next() - 0.5) * 46 : 0,
    glowBoost: 0.85 + rng.next() * 0.4,
    inDelay: rng.int(0, 90),
    fontId: rng.chance(0.3) ? rng.pick(FONTS).id : style.fontId,
  };
}
