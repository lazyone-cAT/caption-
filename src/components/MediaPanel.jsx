/**
 * MediaPanel.jsx — importing the three media types and trimming them.
 *
 *   • audio  → decoded to an AudioBuffer, becomes the clock's time source
 *   • video  → an off-DOM <video> element kept in the project (never rendered
 *              by React, only sampled by the compositor) + a trim window
 *   • GIF    → decoded by gifuct-js into full frames, placed as a timeline layer
 */

import React, { useRef, useState } from "react";
import { useProject, nextId } from "../state/store.jsx";
import { loadGif } from "../lib/media.js";
import { decodeAudio } from "../lib/transcribe.js";
import { GIF_IN_EFFECTS, GIF_OUT_EFFECTS } from "../lib/styles.js";

const fits = [
  { id: "cover", name: "Cover" },
  { id: "contain", name: "Contain" },
  { id: "stretch", name: "Stretch" },
];

function Drop({ label, hint, accept, onFile, disabled }) {
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);

  const take = (files) => {
    const file = files?.[0];
    if (file) onFile(file);
  };

  return (
    <div
      className={`drop${over ? " over" : ""}`}
      style={disabled ? { opacity: 0.5, pointerEvents: "none" } : undefined}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        take(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          take(e.target.files);
          e.target.value = "";
        }}
      />
      <div>
        <b>{label}</b>
      </div>
      <div>{hint}</div>
    </div>
  );
}

export default function MediaPanel() {
  const { project, setProject, patch, patchGif, removeGif, engine, showToast } = useProject();
  const [busy, setBusy] = useState("");

  /* ---------------------------------------------------------------- audio */
  const onAudio = async (file) => {
    try {
      setBusy("Decoding audio…");
      const buffer = await decodeAudio(file);
      engine.audio.setBuffer(buffer, file.name);
      engine.audio.ensureContext();
      setProject((p) => ({
        ...p,
        audio: { buffer, name: file.name, file },
        duration: Math.max(p.duration, Math.ceil(buffer.duration)),
      }));
      showToast(`Audio “${file.name}” loaded (${buffer.duration.toFixed(1)}s)`);
    } catch (err) {
      console.error(err);
      showToast(`Audio failed: ${err.message}`, "err");
    } finally {
      setBusy("");
    }
  };

  /* --------------------------------------------------------------- video */
  const onVideo = async (file) => {
    try {
      setBusy("Loading video…");
      const url = URL.createObjectURL(file);
      const el = document.createElement("video");
      el.src = url;
      el.crossOrigin = "anonymous";
      el.preload = "auto";
      el.muted = false;
      el.playsInline = true;
      await new Promise((resolve, reject) => {
        el.onloadedmetadata = resolve;
        el.onerror = () => reject(new Error("Could not read this video file."));
      });
      if (engine.videoEl?.src) URL.revokeObjectURL(engine.videoEl.src);
      engine.videoEl = el;

      const vd = Number.isFinite(el.duration) ? el.duration : 10;
      setProject((p) => ({
        ...p,
        video: {
          element: el,
          url,
          name: file.name,
          duration: vd,
          trimIn: 0,
          trimOut: Math.min(vd, Math.max(1, p.duration)),
          srcIn: 0,
          fit: "cover",
        },
        duration: Math.max(p.duration, Math.min(vd, 10)),
      }));
      showToast(`Video “${file.name}” loaded (${vd.toFixed(1)}s)`);
    } catch (err) {
      console.error(err);
      showToast(`Video failed: ${err.message}`, "err");
    } finally {
      setBusy("");
    }
  };

  /* ----------------------------------------------------------------- gif */
  const onGif = async (file) => {
    try {
      setBusy("Decoding GIF…");
      const gif = await loadGif(file);
      const start = Math.min(engine.clock.time, Math.max(0, project.duration - 0.5));
      const len = Math.min(gif.duration, 4);
      const id = nextId();
      engine.gifCache.set(id, gif);
      setProject((p) => ({
        ...p,
        gifs: [
          ...p.gifs,
          {
            id,
            gif,
            name: file.name,
            start: Math.round(start * 100) / 100,
            end: Math.round((start + len) * 100) / 100,
            inEffect: "zoomin",
            outEffect: "fade",
            inDuration: 0.45,
            outDuration: 0.4,
            scale: 1,
            x: 0,
            y: 0,
            opacity: 1,
            fit: "contain",
          },
        ],
        duration: Math.max(p.duration, Math.ceil(start + len)),
      }));
      showToast(`GIF “${file.name}” added at ${start.toFixed(2)}s`);
    } catch (err) {
      console.error(err);
      showToast(`GIF failed: ${err.message}`, "err");
    } finally {
      setBusy("");
    }
  };

  const v = project.video;

  return (
    <div>
      <h3>Media</h3>
      <p className="hint">
        Everything is processed locally in your browser — no uploads, no API keys.
        {busy ? ` ${busy}` : ""}
      </p>

      <Drop
        label={project.audio ? `🎵 ${project.audio.name}` : "🎵 Import audio"}
        hint="MP3 / WAV / M4A / OGG — used for speech-to-text and as the master clock"
        accept="audio/*"
        onFile={onAudio}
      />
      {project.audio ? (
        <div className="row" style={{ marginTop: 8 }}>
          <span className="muted mono">
            {project.audio.buffer.duration.toFixed(2)}s · {project.audio.buffer.sampleRate} Hz
          </span>
          <div style={{ flex: 1 }} />
          <button
            className="btn small ghost"
            onClick={() => {
              engine.audio.stop();
              patch({ audio: null });
            }}
          >
            Remove
          </button>
        </div>
      ) : null}

      <div className="divider" />

      <Drop
        label={v ? `🎞 ${v.name}` : "🎞 Import video"}
        hint="MP4 / WebM / MOV — trimmed with the window below"
        accept="video/*"
        onFile={onVideo}
      />

      {v ? (
        <div className="card" style={{ marginTop: 8 }}>
          <div className="head">
            <b>Trim</b>
            <span className="muted mono">{v.duration.toFixed(2)}s source</span>
          </div>

          <div className="field">
            <label>
              Start <b>{v.trimIn.toFixed(2)}s</b>
            </label>
            <input
              type="range"
              min={0}
              max={Math.max(0.1, v.duration)}
              step={0.05}
              value={v.trimIn}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setProject((p) => ({
                  ...p,
                  video: { ...p.video, trimIn: Math.min(val, p.video.trimOut - 0.2) },
                }));
              }}
            />
          </div>

          <div className="field">
            <label>
              End <b>{v.trimOut.toFixed(2)}s</b>
            </label>
            <input
              type="range"
              min={0}
              max={Math.max(0.1, v.duration)}
              step={0.05}
              value={v.trimOut}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setProject((p) => ({
                  ...p,
                  video: { ...p.video, trimOut: Math.max(val, p.video.trimIn + 0.2) },
                }));
              }}
            />
          </div>

          <div className="field">
            <label>
              Source in <b>{(v.srcIn ?? 0).toFixed(2)}s</b>
            </label>
            <input
              type="range"
              min={0}
              max={Math.max(0.1, v.duration)}
              step={0.05}
              value={v.srcIn ?? 0}
              onChange={(e) =>
                setProject((p) => ({
                  ...p,
                  video: { ...p.video, srcIn: parseFloat(e.target.value) },
                }))
              }
            />
          </div>

          <div className="field">
            <label>Fit</label>
            <div className="seg">
              {fits.map((f) => (
                <button
                  key={f.id}
                  className={v.fit === f.id ? "on" : ""}
                  onClick={() =>
                    setProject((p) => ({ ...p, video: { ...p.video, fit: f.id } }))
                  }
                >
                  {f.name}
                </button>
              ))}
            </div>
          </div>

          <div className="row">
            <button
              className="btn small"
              onClick={() =>
                setProject((p) => ({
                  ...p,
                  video: { ...p.video, trimIn: 0, trimOut: p.video.duration, srcIn: 0 },
                }))
              }
            >
              Reset window
            </button>
            <div style={{ flex: 1 }} />
            <button
              className="btn small ghost"
              onClick={() => {
                engine.videoEl?.pause();
                if (v.url) URL.revokeObjectURL(v.url);
                engine.videoEl = null;
                patch({ video: null });
              }}
            >
              Remove
            </button>
          </div>
        </div>
      ) : null}

      <div className="divider" />

      <Drop
        label="🖼 Import GIF"
        hint="GIF / APNG — dropped at the playhead as an in/out-animated layer"
        accept="image/gif,image/apng,image/*"
        onFile={onGif}
      />

      {project.gifs.map((g) => (
        <div className="card" key={g.id} style={{ marginTop: 8 }}>
          <div className="head">
            <b>🖼 {g.name}</b>
            <button className="btn small ghost" onClick={() => removeGif(g.id)}>
              ✕
            </button>
          </div>

          <div className="grid2">
            <div className="field">
              <label>
                Start <b>{g.start.toFixed(2)}s</b>
              </label>
              <input
                type="range"
                min={0}
                max={project.duration}
                step={0.05}
                value={g.start}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  patchGif(g.id, { start: Math.min(val, g.end - 0.2) });
                }}
              />
            </div>
            <div className="field">
              <label>
                End <b>{g.end.toFixed(2)}s</b>
              </label>
              <input
                type="range"
                min={0}
                max={Math.max(project.duration, g.end)}
                step={0.05}
                value={g.end}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  patchGif(g.id, { end: Math.max(val, g.start + 0.2) });
                }}
              />
            </div>
          </div>

          <div className="grid2">
            <div className="field">
              <label>In effect</label>
              <select
                value={g.inEffect}
                onChange={(e) => patchGif(g.id, { inEffect: e.target.value })}
              >
                {GIF_IN_EFFECTS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Out effect</label>
              <select
                value={g.outEffect}
                onChange={(e) => patchGif(g.id, { outEffect: e.target.value })}
              >
                {GIF_OUT_EFFECTS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid2">
            <div className="field">
              <label>
                In dur <b>{g.inDuration.toFixed(2)}s</b>
              </label>
              <input
                type="range"
                min={0.05}
                max={2}
                step={0.05}
                value={g.inDuration}
                onChange={(e) => patchGif(g.id, { inDuration: parseFloat(e.target.value) })}
              />
            </div>
            <div className="field">
              <label>
                Out dur <b>{g.outDuration.toFixed(2)}s</b>
              </label>
              <input
                type="range"
                min={0.05}
                max={2}
                step={0.05}
                value={g.outDuration}
                onChange={(e) => patchGif(g.id, { outDuration: parseFloat(e.target.value) })}
              />
            </div>
          </div>

          <div className="grid2">
            <div className="field">
              <label>
                Scale <b>{g.scale.toFixed(2)}×</b>
              </label>
              <input
                type="range"
                min={0.2}
                max={3}
                step={0.05}
                value={g.scale}
                onChange={(e) => patchGif(g.id, { scale: parseFloat(e.target.value) })}
              />
            </div>
            <div className="field">
              <label>
                Opacity <b>{Math.round(g.opacity * 100)}%</b>
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={g.opacity}
                onChange={(e) => patchGif(g.id, { opacity: parseFloat(e.target.value) })}
              />
            </div>
          </div>

          <div className="grid2">
            <div className="field">
              <label>
                Offset X <b>{g.x}px</b>
              </label>
              <input
                type="range"
                min={-600}
                max={600}
                step={10}
                value={g.x}
                onChange={(e) => patchGif(g.id, { x: parseFloat(e.target.value) })}
              />
            </div>
            <div className="field">
              <label>
                Offset Y <b>{g.y}px</b>
              </label>
              <input
                type="range"
                min={-400}
                max={400}
                step={10}
                value={g.y}
                onChange={(e) => patchGif(g.id, { y: parseFloat(e.target.value) })}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
