/**
 * Preview.jsx — the canvas stage plus the transport bar.
 *
 * The canvas is drawn from a subscription to the master Clock, so it repaints
 * exactly when the clock ticks and never re-renders React. Project edits force
 * one extra draw through the effect below.
 *
 * Video time mapping: `video.trimIn/trimOut` are a window on the *composition*
 * timeline, `video.srcIn` is the source time shown at `trimIn`, so
 *     sourceTime = srcIn + (t - trimIn).
 */

import React, { useEffect, useRef } from "react";
import { useProject, useClockValue } from "../state/store.jsx";
import { syncVideo } from "../lib/media.js";

export const CANVAS_W = 1280;
export const CANVAS_H = 720;

function fmt(t) {
  const s = Math.max(0, t);
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.floor((s * 100) % 100);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

/** Map composition time onto the video element's source timeline. */
export function videoSourceTime(video, t) {
  const srcIn = video.srcIn ?? 0;
  const src = srcIn + (t - video.trimIn);
  const max = Number.isFinite(video.duration) ? video.duration : src;
  return Math.min(Math.max(0, src), Math.max(0, max));
}

export default function Preview({ canvasRef: externalRef, guides, onToggleGuides }) {
  const { project, engine } = useProject();
  const localRef = useRef(null);
  const canvasRef = externalRef || localRef;
  const drawRef = useRef(() => {});
  const { time, playing } = useClockValue(30);

  const draw = (t) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    engine.compositor.render(ctx, project, t, { guides });

    const v = project.video;
    if (v?.element && v.element.readyState >= 1) {
      if (t < v.trimIn || t > v.trimOut) {
        if (!v.element.paused) v.element.pause();
      } else {
        syncVideo(v.element, videoSourceTime(v, t), playing, !playing);
      }
    }
  };
  drawRef.current = draw;

  // Redraw whenever the project or the guides flag changes.
  useEffect(() => {
    drawRef.current(engine.clock.time);
  }, [project, guides, engine]);

  // Redraw on every clock tick.
  useEffect(
    () => engine.clock.subscribe((c) => drawRef.current(c.time)),
    [engine]
  );

  // ── transport ────────────────────────────────────────────────────────────
  const clock = engine.clock;
  const duration = Math.max(0.1, project.duration);

  const startPlayback = (from) => {
    if (project.audio?.buffer) {
      engine.audio.setBuffer(project.audio.buffer, project.audio.name);
      engine.audio.play(from, () => clock.pause());
      clock.setTimeProvider(() => engine.audio.position ?? from);
    } else {
      clock.setTimeProvider(null);
    }
    const v = project.video;
    if (v?.element && from >= v.trimIn && from <= v.trimOut) {
      v.element.currentTime = videoSourceTime(v, from);
      v.element.play().catch(() => {});
    }
    clock.play();
  };

  const stopPlayback = () => {
    clock.pause();
    engine.audio.stop();
    project.video?.element?.pause();
  };

  const toggle = () => {
    if (clock.playing) stopPlayback();
    else startPlayback(clock.time >= duration - 0.001 ? 0 : clock.time);
  };

  const seek = (t) => {
    const clamped = Math.min(Math.max(0, t), duration);
    const wasPlaying = clock.playing;
    if (wasPlaying) {
      if (project.audio?.buffer) engine.audio.play(clamped, () => clock.pause());
      const v = project.video;
      if (v?.element) v.element.currentTime = videoSourceTime(v, clamped);
    }
    clock.seek(clamped);
  };

  const step = (frames) => seek(clock.time + frames / 30);
  const pct = (time / duration) * 100;

  // Space toggles transport — but never while the user is typing.
  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      if (
        e.code !== "Space" ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        (t &&
          (t.tagName === "INPUT" ||
            t.tagName === "TEXTAREA" ||
            t.tagName === "SELECT" ||
            t.isContentEditable))
      ) {
        return;
      }
      e.preventDefault();
      toggleRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="stage">
      <div className="stageInner">
        <div className="canvasWrap">
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            onDoubleClick={() => {
              const el = canvasRef.current;
              if (document.fullscreenElement) document.exitFullscreen?.();
              else el.requestFullscreen?.();
            }}
          />
          <div className="stageOverlay">
            <span className="badge">1280 × 720</span>
            <span>{playing ? "playing" : "paused"}</span>
            <span>{project.video ? "video" : "no video"}</span>
            <span>{project.cues.length} cc</span>
            <span>{project.gifs.length} gif</span>
          </div>
        </div>
      </div>

      <div className="transport">
        <button className="btn small" onClick={() => seek(0)} title="Go to start">
          ⏮
        </button>
        <button className="btn small" onClick={() => step(-1)} title="Back 1 frame">
          ◀︎
        </button>
        <button className="btn primary" onClick={toggle} title="Play / pause (space)">
          {playing ? "Pause" : "Play"}
        </button>
        <button className="btn small" onClick={() => step(1)} title="Forward 1 frame">
          ▶︎
        </button>
        <span className="timecode mono">
          {fmt(time)} / {fmt(duration)}
        </span>
        <input
          className="scrub"
          type="range"
          min={0}
          max={duration}
          step={0.01}
          value={time}
          style={{ "--p": `${pct}%` }}
          onChange={(e) => seek(parseFloat(e.target.value))}
        />
        <label className="checkbox" style={{ whiteSpace: "nowrap" }}>
          <input
            type="checkbox"
            checked={Boolean(guides)}
            onChange={(e) => onToggleGuides?.(e.target.checked)}
          />
          Guides
        </label>
      </div>
    </div>
  );
}
