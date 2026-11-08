/**
 * theatre.js — optional Theatre.js integration (development only).
 *
 * Theatre is *not* the master clock (its `sequence.length` has no public setter
 * and clamps to 10 s by default, which is useless as a composition timeline).
 * Instead it is used for what it is good at: a hands-on, keyframable control
 * surface for a handful of style parameters.
 *
 * Data flow is deliberately ONE-WAY, Theatre → app:
 *   • editing a value in the Theatre studio pushes it into the React store
 *   • the app's own sliders keep working and never fight the studio
 *   • our clock is mirrored into `sequence.position` so the studio playhead
 *     follows playback
 *
 * The module is only ever imported behind `import.meta.env.DEV`, so none of
 * this ships in a production build.
 */

import { getProject, types } from "@theatre/core";

/** Defaults mirror DEFAULT_STYLE so the first sync changes nothing visible. */
const MOTION_PROPS = {
  captionY: types.number(0.76, { range: [0.1, 0.94], label: "Caption Y" }),
  fontSize: types.number(74, { range: [28, 140], label: "Font size" }),
  letterSpacing: types.number(0, { range: [-4, 14], label: "Tracking" }),
  inDuration: types.number(520, { range: [80, 1600], label: "In (ms)" }),
  outDuration: types.number(320, { range: [60, 1200], label: "Out (ms)" }),
  glowIntensity: types.number(1.15, { range: [0, 3], label: "Glow" }),
  glowBlur: types.number(46, { range: [4, 110], label: "Glow blur" }),
  transitionDuration: types.number(0.55, { range: [0.15, 2], label: "Transition" }),
  bgAngle: types.number(24, { range: [0, 360], label: "BG angle" }),
};

let cache = null;

/** @returns {{sheet:object, motion:object, sequence:object}|null} */
export function getTheatre() {
  if (cache !== null) return cache || null;
  try {
    const project = getProject("CaptionForge");
    const sheet = project.sheet("Studio");
    const motion = sheet.object("Motion", MOTION_PROPS);
    cache = { project, sheet, motion, sequence: sheet.sequence };
  } catch (err) {
    console.warn("[theatre] unavailable:", err);
    cache = false;
  }
  return cache || null;
}

/**
 * Initialise the Theatre studio overlay (dev only).
 * Silently no-ops if it has already been initialised or fails to load.
 */
export async function initStudio() {
  try {
    const mod = await import("@theatre/studio");
    const studio = mod.default || mod.studio;
    studio?.initialize?.({ persistenceKey: "caption-forge" });
  } catch (err) {
    console.warn("[theatre] studio failed to initialise:", err);
  }
}

/**
 * Mirror the composition playhead into the Theatre sequence.
 * Called once per clock tick; cheap (one number assignment).
 */
export function syncTheatrePosition(t) {
  const th = getTheatre();
  if (!th) return;
  try {
    const rawLen = th.sequence?.pointer?.length;
    const max = typeof rawLen === "number" && Number.isFinite(rawLen) ? rawLen : 10;
    th.sequence.position = Math.max(0, Math.min(t, max));
  } catch {
    /* sequence not ready yet */
  }
}
