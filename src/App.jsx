/**
 * App.jsx — shell: top bar, tabbed sidebar, preview stage, timeline.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ProjectProvider, useProject, useClockValue } from "./state/store.jsx";
import Preview from "./components/Preview.jsx";
import Timeline from "./components/Timeline.jsx";
import MediaPanel from "./components/MediaPanel.jsx";
import TranscribePanel from "./components/TranscribePanel.jsx";
import CaptionList from "./components/CaptionList.jsx";
import StylePanel from "./components/StylePanel.jsx";
import ExportPanel from "./components/ExportPanel.jsx";

const TABS = [
  { id: "media", label: "Media", Comp: MediaPanel },
  { id: "transcribe", label: "Transcribe", Comp: TranscribePanel },
  { id: "captions", label: "Captions", Comp: CaptionList },
  { id: "style", label: "Style", Comp: StylePanel },
  { id: "export", label: "Export", Comp: ExportPanel },
];

/** Right-most edge of all timed content — the timeline should never clip it. */
function contentEnd(p) {
  let end = 0;
  if (p.video) end = Math.max(end, p.video.trimOut);
  for (const c of p.cues) end = Math.max(end, c.end);
  for (const g of p.gifs) end = Math.max(end, g.end);
  return end;
}

function Studio() {
  const { project, setProject, engine, toast } = useProject();
  const [tab, setTab] = useState("media");
  const [guides, setGuides] = useState(false);
  const [selectedCue, setSelectedCue] = useState(null);
  const canvasRef = useRef(null);
  const { time } = useClockValue(10);

  const Active = useMemo(() => TABS.find((t) => t.id === tab)?.Comp || MediaPanel, [tab]);

  // The composition length is entirely user-controlled: it is seeded from the
  // audio at import and from transcription, then only grown by the explicit
  // "⤢ Fit" button. Nothing silently stretches the timeline under the user.

  // ── Theatre.js (dev only): studio → store, clock → studio playhead ──────
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    let unsubscribe = null;
    let alive = true;

    (async () => {
      const { initStudio, getTheatre } = await import("./lib/theatre.js");
      await initStudio();
      if (!alive) return;
      const th = getTheatre();
      if (!th) return;
      unsubscribe = th.motion.onValuesChange((v) => {
        setProject((p) => ({
          ...p,
          style: {
            ...p.style,
            vPos: v.captionY,
            fontSize: v.fontSize,
            letterSpacing: v.letterSpacing,
            inDuration: v.inDuration,
            outDuration: v.outDuration,
            glowIntensity: v.glowIntensity,
            glowBlur: v.glowBlur,
            transitionDuration: v.transitionDuration,
          },
          background: { ...p.background, angle: v.bgAngle },
        }));
      });
    })().catch((err) => console.warn("[theatre] init failed:", err));

    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, [setProject]);

  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    let mod = null;
    import("./lib/theatre.js").then((m) => {
      mod = m;
    });
    return engine.clock.subscribe((c) => mod?.syncTheatrePosition?.(c.time));
  }, [engine]);

  const panelProps = { selectedCue, onSelectCue: setSelectedCue };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="logo" />
          <div>
            Caption Forge
            <small>offline caption studio</small>
          </div>
        </div>

        <div className="spacer" />

        <label className="checkbox lengthCtl">
          <span>Length</span>
          <input
            type="number"
            min={1}
            step={1}
            value={project.duration}
            onChange={(e) => {
              const v = Math.max(1, parseFloat(e.target.value) || 1);
              setProject((p) => ({ ...p, duration: v }));
            }}
          />
          <span className="unit">s</span>
        </label>

        <button
          className="btn small ghost"
          title="Stretch the composition to cover every cue, GIF and the video window"
          onClick={() =>
            setProject((p) => ({ ...p, duration: Math.max(1, Math.ceil(contentEnd(p))) }))
          }
        >
          Fit
        </button>

        <span className="muted mono timeReadout">{time.toFixed(2)}s</span>

        {import.meta.env.DEV ? (
          <span className="badge" title="Theatre.js studio is enabled in dev mode">
            dev · theatre
          </span>
        ) : null}
      </header>

      <div className="main">
        <aside className="sidebar">
          <div className="tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={`tab${tab === t.id ? " active" : ""}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="panel">
            <Active {...panelProps} canvasRef={canvasRef} />
          </div>
        </aside>

        <Preview canvasRef={canvasRef} guides={guides} onToggleGuides={setGuides} />
      </div>

      <Timeline selectedCue={selectedCue} onSelectCue={setSelectedCue} />

      {toast ? (
        <div
          className="toast"
          style={
            toast.kind === "err"
              ? { borderLeftColor: "var(--bad)" }
              : undefined
          }
        >
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}

export default function App() {
  return (
    <ProjectProvider>
      <Studio />
    </ProjectProvider>
  );
}
