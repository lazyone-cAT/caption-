/**
 * store.jsx — application state.
 *
 * Two kinds of state live side by side:
 *
 *   • `project`  — serialisable composition data (cues, timings, style, GIF
 *                  layers, video trim …). This is what the compositor renders.
 *   • `engine`   — non-serialisable singletons that *cannot* live in React state
 *                  (AudioContext, HTMLVideoElement, anime caches, the Clock).
 *                  They are created once and mutated imperatively.
 *
 * The Clock is deliberately *not* React state: it ticks at 60 fps and pushing
 * every tick through `setState` would re-render the whole sidebar. Components
 * subscribe to it directly instead.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Clock } from "../lib/clock.js";
import { AudioEngine } from "../lib/media.js";
import { Compositor } from "../lib/compositor.js";
import { DEFAULT_STYLE } from "../lib/styles.js";

let uid = 1;
export const nextId = () => uid++;

export const DEFAULT_BACKGROUND = {
  type: "gradient",
  colorA: "#160b2e",
  colorB: "#071a2e",
  angle: 24,
};

export function createProject() {
  return {
    duration: 12,
    audio: null, // { buffer, name, file }
    video: null, // { element, url, name, duration, trimIn, trimOut, fit }
    gifs: [], // [{ id, gif, name, start, end, ...effects, scale, x, y, opacity }]
    cues: [], // [{ id, start, end, text, words }]
    style: { ...DEFAULT_STYLE },
    background: { ...DEFAULT_BACKGROUND },
  };
}

const ProjectContext = createContext(null);

export function ProjectProvider({ children }) {
  const [project, setProjectRaw] = useState(createProject);
  const [toast, setToast] = useState(null);

  // ---- engine singletons (created once, never re-created) ------------------
  const engineRef = useRef(null);
  if (!engineRef.current) {
    engineRef.current = {
      clock: new Clock({ duration: 12 }),
      audio: new AudioEngine(),
      compositor: new Compositor(),
      /** @type {HTMLVideoElement|null} */
      videoEl: null,
      /** @type {Map<number, object>} decoded GIFs keyed by gif layer id */
      gifCache: new Map(),
    };
  }
  const engine = engineRef.current;

  // ---- toast ---------------------------------------------------------------
  const toastTimer = useRef(0);
  const showToast = useCallback((message, kind = "info") => {
    setToast({ message, kind, id: Date.now() });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3600);
  }, []);

  // ---- project updates -----------------------------------------------------
  const setProject = useCallback((updater) => {
    setProjectRaw((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      return next === prev ? prev : next;
    });
  }, []);

  /** Shallow-merge a slice of the project. */
  const patch = useCallback(
    (slice) => setProject((p) => ({ ...p, ...slice })),
    [setProject]
  );

  /** Shallow-merge into `project.style`. */
  const patchStyle = useCallback(
    (slice) => setProject((p) => ({ ...p, style: { ...p.style, ...slice } })),
    [setProject]
  );

  /** Update one GIF layer by id. */
  const patchGif = useCallback(
    (id, slice) =>
      setProject((p) => ({
        ...p,
        gifs: p.gifs.map((g) => (g.id === id ? { ...g, ...slice } : g)),
      })),
    [setProject]
  );

  const removeGif = useCallback(
    (id) =>
      setProject((p) => {
        engine.gifCache.delete(id);
        return { ...p, gifs: p.gifs.filter((g) => g.id !== id) };
      }),
    [setProject, engine]
  );

  /** Add or replace cues (used by the transcription pipeline). */
  const setCues = useCallback(
    (cues) =>
      setProject((p) => {
        const sorted = [...cues].sort((a, b) => a.start - b.start);
        const last = sorted[sorted.length - 1];
        // Never let freshly generated captions fall outside the composition.
        const duration = last ? Math.max(p.duration, Math.ceil(last.end)) : p.duration;
        return { ...p, cues: sorted, duration };
      }),
    [setProject]
  );

  const patchCue = useCallback(
    (id, slice) =>
      setProject((p) => ({
        ...p,
        cues: p.cues
          .map((c) => (c.id === id ? { ...c, ...slice } : c))
          .sort((a, b) => a.start - b.start),
      })),
    [setProject]
  );

  const removeCue = useCallback(
    (id) => setProject((p) => ({ ...p, cues: p.cues.filter((c) => c.id !== id) })),
    [setProject]
  );

  const addCue = useCallback(
    (cue) =>
      setProject((p) => ({
        ...p,
        cues: [...p.cues, { id: nextId(), ...cue }].sort((a, b) => a.start - b.start),
      })),
    [setProject]
  );

  // ---- duration → clock ----------------------------------------------------
  useEffect(() => {
    engine.clock.setDuration(project.duration);
  }, [project.duration, engine]);

  const value = useMemo(
    () => ({
      project,
      setProject,
      patch,
      patchStyle,
      patchGif,
      removeGif,
      setCues,
      patchCue,
      removeCue,
      addCue,
      engine,
      toast,
      showToast,
    }),
    [
      project,
      setProject,
      patch,
      patchStyle,
      patchGif,
      removeGif,
      setCues,
      patchCue,
      removeCue,
      addCue,
      engine,
      toast,
      showToast,
    ]
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used inside <ProjectProvider>");
  return ctx;
}

/** Subscribe to the master clock without re-rendering on every frame. */
export function useClockFrame(onFrame) {
  const { engine } = useProject();
  const cb = useRef(onFrame);
  cb.current = onFrame;
  useEffect(() => engine.clock.subscribe((c) => cb.current?.(c)), [engine]);
}

/** Reactive clock readout — updates only as fast as `fps` allows. */
export function useClockValue(fps = 20) {
  const { engine } = useProject();
  const [value, setValue] = useState(() => ({ time: 0, playing: false }));
  useEffect(() => {
    const clock = engine.clock;
    let last = 0;
    return clock.subscribe((c) => {
      const now = performance.now();
      if (now - last < 1000 / fps && c.playing) return;
      last = now;
      setValue({ time: c.time, playing: c.playing });
    });
  }, [engine, fps]);
  return value;
}
