/**
 * compositor.js — turns (project, time) into pixels.
 *
 * The render function is *pure with respect to time*: given the same project
 * state and the same `t` it always draws the same frame. Everything animated
 * goes through a cached, seeked anime.js timeline (see effects.js), so the
 * exporter can render frames in any order and still get a consistent result.
 */

import {
  createCueAnimator,
  createGifAnimator,
  createTransitionAnimator,
  seekAnimator,
} from "./effects.js";
import { fontStack, FONTS, cueVariation } from "./styles.js";
import { gifFrameAt } from "./media.js";

const TAU = Math.PI * 2;
const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

/* ==========================================================================
 *  Small helpers
 * ========================================================================== */

export function hexToRgb(hex) {
  const h = (hex || "#ffffff").replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const rgba = (hex, a) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};

/** Deterministic 0..1 hash — used for glitch/scramble/flicker noise. */
function hash01(a, b) {
  let x = (a * 374761393 + b * 668265263) | 0;
  x = (x ^ (x >>> 13)) * 1274126177;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

const SCRAMBLE_GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&*+=?/<>[]{}";

/* ==========================================================================
 *  Cache
 * ========================================================================== */

class Cache {
  constructor(limit = 400) {
    this.map = new Map();
    this.limit = limit;
  }
  get(key, build) {
    let value = this.map.get(key);
    if (value === undefined) {
      if (this.map.size >= this.limit) {
        const oldest = this.map.keys().next().value;
        this.map.delete(oldest);
      }
      value = build();
      this.map.set(key, value);
    } else {
      // LRU touch
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value;
  }
  clear() {
    this.map.clear();
  }
  get size() {
    return this.map.size;
  }
}

/** A cheap signature of everything that can change a caption's animation. */
function styleSignature(style) {
  return [
    style.fontId,
    style.fontSize,
    style.effectId,
    style.inDuration,
    style.outDuration,
    style.align,
    style.vPos,
    style.lineHeight,
    style.letterSpacing,
    style.randomSeed,
    style.perCueRandom ? 1 : 0,
  ].join("|");
}

/* ==========================================================================
 *  Text layout
 * ========================================================================== */

function fontString(style, size, fontId) {
  const f = FONTS.find((x) => x.id === fontId) || FONTS[0];
  return `${f.weight} ${size}px ${f.stack}`;
}

/**
 * Measure and place every glyph of a caption block.
 * @returns {{fontSize:number, lines:Array, blockH:number, blockW:number, centerY:number}}
 */
function layoutCaption(ctx, text, style, W, H, variation) {
  const fontId = variation.fontId || style.fontId;
  const baseSize = style.fontSize * (H / 720) * (variation.scaleJitter || 1);
  const rawLines = String(text || "")
    .split("\n")
    .filter((l) => l.length || true);
  const maxWidth = W * 0.9;

  // Shrink to fit the widest line.
  let size = baseSize;
  const measure = (s) => {
    ctx.font = fontString(style, s, fontId);
    return Math.max(
      1,
      ...rawLines.map((l) => ctx.measureText(l).width + style.letterSpacing * Math.max(0, l.length - 1))
    );
  };
  let widest = measure(size);
  if (widest > maxWidth) {
    size = Math.max(14, size * (maxWidth / widest));
    widest = measure(size);
  }

  ctx.font = fontString(style, size, fontId);
  const lineHeight = size * style.lineHeight;
  const blockH = lineHeight * rawLines.length;

  const centerY = H * style.vPos + (variation.yJitter || 0);
  const blockTop = centerY - blockH / 2;

  const lines = rawLines.map((line, li) => {
    const chars = [];
    let cursor = 0;
    const glyph = [...line];
    for (const ch of glyph) {
      const w = ctx.measureText(ch).width;
      chars.push({ ch, dx: cursor, w });
      cursor += w + style.letterSpacing;
    }
    const totalW = Math.max(0, cursor - style.letterSpacing);
    let x0;
    if (style.align === "left") x0 = W * 0.06;
    else if (style.align === "right") x0 = W * 0.94 - totalW;
    else x0 = W / 2 - totalW / 2;

    return {
      text: line,
      chars,
      totalW,
      x0,
      baselineY: blockTop + lineHeight * li + lineHeight * 0.5 + size * 0.35,
      top: blockTop + lineHeight * li,
    };
  });

  return { fontSize: size, lines, blockH, blockW: widest, centerY, fontId, lineHeight };
}

/* ==========================================================================
 *  Caption painting
 * ========================================================================== */

const supportsFilter = (() => {
  try {
    const c = document.createElement("canvas").getContext("2d");
    c.filter = "blur(2px)";
    return c.filter !== "none" && typeof c.filter === "string";
  } catch {
    return false;
  }
})();

function drawCaption(ctx, opts) {
  const { layout, state, style, variation, W, localMs, effectId, mode, color, alphaMul } = opts;
  const chars = state.chars;
  let index = 0;

  const reveal = style.effectId === "typewriter" || style.effectId === "karaoke" ? state.reveal : 1;
  const glitch = state.glitch;
  const jitterAmp = state.shake * 6;
  const waveOn = effectId === "wave";
  const isKaraoke = effectId === "karaoke";

  for (let li = 0; li < layout.lines.length; li += 1) {
    const line = layout.lines[li];
    const lineState = state;

    for (let ci = 0; ci < line.chars.length; ci += 1) {
      const cell = line.chars[ci];
      const cs = chars[index] || chars[chars.length - 1];
      index += 1;

      if (cell.ch === " " || cell.ch === "\u00a0") continue;

      // Typewriter / karaoke reveal gate
      if (reveal < 1) {
        const ratio = (index - 1) / Math.max(1, chars.length);
        if (ratio > reveal) continue;
      }

      let glyph = cell.ch;
      if (cs.scr > 0.001) {
        const gate = hash01(index, Math.floor(localMs / 55));
        if (gate < cs.scr) {
          glyph = SCRAMBLE_GLYPHS[Math.floor(hash01(index * 31, Math.floor(localMs / 55)) * SCRAMBLE_GLYPHS.length)];
        }
      }

      // Neon-tube dropouts while the entrance flickers on.
      let neonMul = 1;
      if (state.neon > 0.01) {
        const on = hash01(index * 7 + 3, Math.floor(localMs / 60));
        if (on < 0.16 * state.neon) neonMul = 0.14;
      }

      const alpha = clamp(lineState.o * cs.o * alphaMul * neonMul, 0, 1);
      if (alpha <= 0.002) continue;

      let ox = cs.x;
      let oy = cs.y;
      if (waveOn) oy += Math.sin(localMs / 150 + ci * 0.55 + li * 1.7) * 5;
      if (jitterAmp > 0) {
        ox += (hash01(index, Math.floor(localMs / 45)) - 0.5) * jitterAmp * 2;
        oy += (hash01(index + 991, Math.floor(localMs / 45)) - 0.5) * jitterAmp * 2;
      }
      if (opts.glitchOffset) {
        ox += opts.glitchOffset[0];
        oy += opts.glitchOffset[1];
      }

      const cx = line.x0 + cell.dx + cell.w / 2 + ox + lineState.x;
      const cy = line.baselineY + oy + lineState.y;

      const scale = lineState.s * cs.s;
      const sy = scale * (cs.sy || 1);
      const scaleX = scale;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(cx, cy);
      if (cs.r || lineState.r) ctx.rotate(((cs.r + lineState.r) * Math.PI) / 180);
      ctx.scale(scaleX, sy);

      const blur = lineState.blur + cs.blur;
      if (supportsFilter && blur > 0.3) ctx.filter = `blur(${blur.toFixed(2)}px)`;

      if (mode === "glow") {
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = opts.glowBlur;
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(glyph, 0, 0);
      } else if (mode === "ghost") {
        // RGB split pass used by the glitch effect
        ctx.fillStyle = color;
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(glyph, 0, 0);
      } else {
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.lineJoin = "round";
        ctx.miterLimit = 2;

        if (style.strokeWidth > 0) {
          ctx.strokeStyle = style.stroke;
          ctx.lineWidth = style.strokeWidth;
          ctx.strokeText(glyph, 0, 0);
        }

        if (isKaraoke && cs.fill > 0.001) {
          ctx.fillStyle = style.fill;
          ctx.fillText(glyph, 0, 0);
          ctx.save();
          const w = cell.w;
          ctx.beginPath();
          ctx.rect(-cell.w / 2 - 1, -layout.fontSize, w * cs.fill + 2, layout.fontSize * 1.6);
          ctx.clip();
          ctx.fillStyle = style.gradientEnabled ? style.gradientA : style.glowColor;
          ctx.fillText(glyph, 0, 0);
          ctx.restore();
        } else if (style.gradientEnabled && mode !== "glow") {
          ctx.fillStyle = opts.gradient;
          ctx.fillText(glyph, 0, 0);
        } else {
          ctx.fillStyle = color || style.fill;
          ctx.fillText(glyph, 0, 0);
        }
      }

      ctx.restore();
      if (supportsFilter && blur > 0.3) ctx.filter = "none";
    }
  }
}

function paintCaption(ctx, args) {
  const { layout, state, style, variation, W, H, effectId, localMs } = args;

  ctx.font = fontString(style, layout.fontSize, layout.fontId);
  const gradient = style.gradientEnabled
    ? (() => {
        const g = ctx.createLinearGradient(0, layout.centerY - layout.blockH / 2, W, layout.centerY + layout.blockH / 2);
        g.addColorStop(0, style.gradientA);
        g.addColorStop(1, style.gradientB);
        return g;
      })()
    : style.fill;

  // ── glow passes ───────────────────────────────────────────────────────────
  if (style.glowEnabled && style.glowIntensity > 0.01 && state.o > 0.01) {
    const pulse = style.glowPulse ? 0.78 + 0.22 * Math.sin(localMs / 260) : 1;
    const strength = clamp(style.glowIntensity * pulse * (variation.glowBoost || 1), 0, 4);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const pass of [
      { blur: style.glowBlur * 1.9 * strength, a: 0.42 },
      { blur: style.glowBlur * 0.8 * strength, a: 0.6 },
    ]) {
      drawCaption(ctx, {
        ...args,
        mode: "glow",
        color: rgba(style.glowColor, pass.a * clamp(strength, 0, 1.6)),
        alphaMul: 1,
        glowBlur: pass.blur,
        gradient,
      });
    }
    ctx.restore();
  }

  // ── glitch RGB split ──────────────────────────────────────────────────────
  if (state.glitch > 0.02) {
    const amount = state.glitch * 16;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    drawCaption(ctx, {
      ...args,
      mode: "ghost",
      color: "rgba(255,40,90,0.85)",
      alphaMul: 1,
      gradient,
      dx: -amount,
      glitchOffset: [-amount, 0],
    });
    drawCaption(ctx, {
      ...args,
      mode: "ghost",
      color: "rgba(0,240,255,0.85)",
      alphaMul: 1,
      gradient,
      glitchOffset: [amount, 0],
    });
    ctx.restore();
  }

  // ── main pass ─────────────────────────────────────────────────────────────
  drawCaption(ctx, {
    ...args,
    mode: "main",
    color: style.fill,
    alphaMul: 1,
    gradient,
  });
}

/* ==========================================================================
 *  Transitions
 * ========================================================================== */

function drawTransition(ctx, W, H, id, st, hueOffset) {
  if (st.o <= 0.001 || st.p <= 0.001) return;
  const p = st.p;
  const a = clamp(st.o, 0, 1);
  ctx.save();

  switch (id) {
    case "barWipe": {
      const bars = 7;
      for (let i = 0; i < bars; i += 1) {
        const phase = clamp(p * 1.6 - i * 0.09, 0, 1);
        const dir = i % 2 === 0 ? 1 : -1;
        const x = dir > 0 ? -W + phase * W * 2 : W - phase * W * 2;
        ctx.fillStyle = `hsla(${(i * 47 + hueOffset) % 360}, 95%, 60%, ${0.85 * a})`;
        ctx.fillRect(x, (H / bars) * i, W, H / bars + 2);
      }
      break;
    }
    case "iris": {
      const r = p * Math.hypot(W, H) * 0.75;
      ctx.strokeStyle = `hsla(${hueOffset % 360}, 100%, 65%, ${0.95 * a})`;
      ctx.lineWidth = Math.max(6, 46 * (1 - p));
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, r, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = `hsla(${(hueOffset + 40) % 360}, 100%, 70%, ${0.35 * a * (1 - p)})`;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, r, 0, TAU);
      ctx.fill();
      break;
    }
    case "rainbow": {
      const bandW = W * 0.5;
      const x = -bandW + p * (W + bandW);
      const g = ctx.createLinearGradient(x, 0, x + bandW, H);
      for (let i = 0; i <= 6; i += 1) {
        g.addColorStop(i / 6, `hsla(${(hueOffset + i * 60) % 360}, 100%, 60%, ${0.55 * a})`);
      }
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, bandW, H);
      break;
    }
    case "flash": {
      const flash = Math.sin(clamp(p, 0, 1) * Math.PI);
      ctx.fillStyle = `hsla(${hueOffset % 360}, 100%, 72%, ${0.75 * flash * st.strength * a})`;
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case "glitch": {
      const slices = 14;
      for (let i = 0; i < slices; i += 1) {
        const r = hash01(i, Math.floor(p * 40));
        if (r < 0.45) continue;
        const y = (i / slices) * H;
        const h = H / slices + 2;
        const shift = (r - 0.5) * W * 0.35 * (1 - p);
        ctx.fillStyle = i % 2 ? `hsla(${hueOffset % 360},100%,62%,${0.5 * a})` : `rgba(255,255,255,${0.28 * a})`;
        ctx.fillRect(shift, y, W, h);
      }
      break;
    }
    case "spinBlur": {
      ctx.translate(W / 2, H / 2);
      ctx.rotate(p * Math.PI * 1.4);
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createConicGradient ? ctx.createConicGradient(0, 0, 0) : null;
      if (g) {
        for (let i = 0; i <= 8; i += 1) {
          g.addColorStop(i / 8, `hsla(${(hueOffset + i * 45) % 360},100%,60%,${0.4 * a * st.strength})`);
        }
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, Math.hypot(W, H) * 0.5 * p, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case "confetti": {
      const n = 90;
      for (let i = 0; i < n; i += 1) {
        const ang = hash01(i, 3) * TAU;
        const dist = p * (Math.hypot(W, H) * 0.55) * (0.35 + hash01(i, 7) * 0.9);
        const x = W / 2 + Math.cos(ang) * dist;
        const y = H / 2 + Math.sin(ang) * dist + p * p * 160;
        const size = 6 + hash01(i, 11) * 14;
        ctx.fillStyle = `hsla(${(hueOffset + i * 13) % 360},100%,62%,${(1 - p) * a})`;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p * 6 + i);
        ctx.fillRect(-size / 2, -size / 3, size, size * 0.66);
        ctx.restore();
      }
      break;
    }
    default:
      break;
  }

  ctx.restore();
}

/* ==========================================================================
 *  Background
 * ========================================================================== */

function drawBackground(ctx, W, H, bg, t) {
  if (bg.type === "solid") {
    ctx.fillStyle = bg.colorA;
    ctx.fillRect(0, 0, W, H);
    return;
  }
  const angle = ((bg.angle || 20) * Math.PI) / 180 + Math.sin(t / 14) * 0.18;
  const cx = W / 2;
  const cy = H / 2;
  const len = Math.max(W, H);
  const g = ctx.createLinearGradient(
    cx - Math.cos(angle) * len * 0.5,
    cy - Math.sin(angle) * len * 0.5,
    cx + Math.cos(angle) * len * 0.5,
    cy + Math.sin(angle) * len * 0.5
  );
  g.addColorStop(0, bg.colorA);
  g.addColorStop(1, bg.colorB);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // slow drifting colour pools so a static frame never looks dead
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 3; i += 1) {
    const phase = t * 0.16 + i * 2.1;
    const x = W * (0.5 + Math.cos(phase + i) * 0.38);
    const y = H * (0.5 + Math.sin(phase * 0.8 + i * 1.7) * 0.36);
    const r = Math.max(W, H) * 0.4;
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `hsla(${(i * 120 + t * 12) % 360}, 90%, 55%, 0.16)`);
    rg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

/* ==========================================================================
 *  Media helpers
 * ========================================================================== */

function drawFitted(ctx, source, W, H, fit = "cover", dx = 0, dy = 0, scale = 1, rotation = 0) {
  const sw = source.videoWidth || source.naturalWidth || source.width;
  const sh = source.videoHeight || source.naturalHeight || source.height;
  if (!sw || !sh) return;

  let ratio;
  if (fit === "stretch") ratio = Math.max(W / sw, H / sh);
  else ratio = fit === "contain" ? Math.min(W / sw, H / sh) : Math.max(W / sw, H / sh);

  const dw = sw * ratio * scale;
  const dh = sh * ratio * scale;

  ctx.save();
  ctx.translate(W / 2 + dx, H / 2 + dy);
  if (rotation) ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(source, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

/* ==========================================================================
 *  The compositor
 * ========================================================================== */

export class Compositor {
  constructor() {
    this.cueCache = new Cache(500);
    this.gifCache = new Cache(120);
    this.transCache = new Cache(200);
    this.layoutCache = new Cache(500);
  }

  invalidate() {
    this.cueCache.clear();
    this.gifCache.clear();
    this.transCache.clear();
    this.layoutCache.clear();
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} project   app state (see store.jsx)
   * @param {number} t         composition time in seconds
   * @param {{guides?:boolean}} [opts]
   */
  render(ctx, project, t, opts = {}) {
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const style = project.style;
    const sig = styleSignature(style);

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // 1 ── background
    drawBackground(ctx, W, H, project.background, t);

    // 2 ── video (trimmed)
    const video = project.video;
    if (video && video.element && video.trimIn <= t && t <= video.trimOut) {
      drawFitted(ctx, video.element, W, H, video.fit || "cover");
    }

    // 3 ── GIF layers
    for (const item of project.gifs) {
      if (t < item.start || t > item.end || !item.gif) continue;
      const local = t - item.start;
      const windowMs = Math.max(1, (item.end - item.start) * 1000);
      const key = `${item.id}|${windowMs}|${item.inEffect}|${item.outEffect}|${item.inDuration}|${item.outDuration}`;
      const animator = this.gifCache.get(key, () =>
        createGifAnimator({
          durationMs: windowMs,
          inEffect: item.inEffect,
          outEffect: item.outEffect,
          inDurationMs: item.inDuration * 1000,
          outDurationMs: item.outDuration * 1000,
        })
      );
      const st = seekAnimator(animator, local * 1000);
      if (!st || st.o <= 0.004) continue;

      const frameIndex = gifFrameAt(item.gif, local % item.gif.duration);
      const frame = item.gif.frames[frameIndex];
      if (!frame) continue;

      ctx.save();
      ctx.globalAlpha = clamp(st.o, 0, 1);
      if (st.wipe < 0.999) {
        ctx.beginPath();
        ctx.rect(0, 0, W * clamp(st.wipe, 0, 1), H);
        ctx.clip();
      }
      const sx = st.s * (st.sx || 1);
      const sy = st.s * (st.sy || 1);
      if (st.blur > 0.3 && supportsFilter) ctx.filter = `blur(${st.blur.toFixed(2)}px)`;
      if (st.hue) ctx.filter = `${ctx.filter && ctx.filter !== "none" ? ctx.filter + " " : ""}hue-rotate(${st.hue.toFixed(1)}deg)`;
      ctx.translate(W / 2 + st.x, H / 2 + st.y);
      if (st.r) ctx.rotate((st.r * Math.PI) / 180);
      ctx.scale(sx, sy);
      const scale = (item.scale ?? 1) * Math.min(W / item.gif.width, H / item.gif.height) * (item.fit === "stretch" ? 1 : 1);
      const gw = item.gif.width * scale;
      const gh = item.gif.height * scale;
      ctx.globalAlpha *= clamp(item.opacity ?? 1, 0, 1);
      ctx.drawImage(frame, -gw / 2 + (item.x || 0), -gh / 2 + (item.y || 0), gw, gh);
      ctx.restore();
      if (supportsFilter) ctx.filter = "none";
    }

    // 4 ── colourful transition (sits behind the captions)
    const cue = activeCue(project.cues, t);
    if (cue && style.transitionId !== "none" && style.transitionDuration > 0) {
      const elapsed = t - cue.start;
      if (elapsed <= style.transitionDuration + 0.001) {
        const key = `${cue.id}|${sig}|${style.transitionId}|${style.transitionDuration}`;
        const animator = this.transCache.get(key, () =>
          createTransitionAnimator(style.transitionId, style.transitionDuration * 1000)
        );
        const st = seekAnimator(animator, elapsed * 1000);
        if (st) {
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          drawTransition(ctx, W, H, style.transitionId, st, (style.randomSeed * 7) % 360);
          ctx.restore();
        }
      }
    }

    // 5 ── captions
    if (cue) {
      const localMs = (t - cue.start) * 1000;
      const durationMs = Math.max(340, (cue.end - cue.start) * 1000);
      const variation = style.perCueRandom ? cueVariation(cue.id, style.randomSeed, style) : defaultVariation(style);

      const animatorKey = `${cue.id}|${sig}|${durationMs}|${cue.text.length}`;
      const animator = this.cueCache.get(animatorKey, () =>
        createCueAnimator({
          durationMs,
          charCount: countChars(cue.text),
          effectId: style.effectId,
          inDuration: style.inDuration,
          outDuration: style.outDuration,
          variation,
          canvasH: H,
        })
      );
      const state = seekAnimator(animator, localMs);

      if (state && state.o > 0.004) {
        const layoutKey = `${cue.id}|${sig}|${W}x${H}|${cue.text.length}`;
        const layout = this.layoutCache.get(layoutKey, () => {
          const c = document.createElement("canvas");
          c.width = W;
          c.height = H;
          const mctx = c.getContext("2d");
          return layoutCaption(mctx, cue.text, style, W, H, variation);
        });

        paintCaption(ctx, {
          layout,
          state,
          style,
          variation,
          W,
          H,
          localMs,
          effectId: style.effectId,
          cue,
        });
      }
    }

    ctx.restore();

    if (opts.guides) drawGuides(ctx, W, H);
  }
}

function defaultVariation(style) {
  return {
    rotate: 0,
    scaleJitter: 1,
    yJitter: 0,
    hueShift: 0,
    glowBoost: 1,
    inDelay: 0,
    fontId: style.fontId,
  };
}

function countChars(text) {
  let n = 0;
  for (const line of String(text || "").split("\n")) n += [...line].length;
  return Math.max(1, n);
}

export function activeCue(cues, t) {
  if (!cues || !cues.length) return null;
  // cues are stored sorted; a small backwards/linear scan is plenty here
  for (let i = 0; i < cues.length; i += 1) {
    const c = cues[i];
    if (t >= c.start && t < c.end) return c;
    if (c.start > t) break;
  }
  return null;
}

function drawGuides(ctx, W, H) {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.setLineDash([8, 8]);
  ctx.lineWidth = 1;
  ctx.strokeRect(W * 0.05, H * 0.05, W * 0.9, H * 0.9);
  ctx.beginPath();
  ctx.moveTo(W / 2, 0);
  ctx.lineTo(W / 2, H);
  ctx.moveTo(0, H / 2);
  ctx.lineTo(W, H / 2);
  ctx.stroke();
  ctx.restore();
}
