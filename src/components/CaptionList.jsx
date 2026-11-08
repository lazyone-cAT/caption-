/**
 * CaptionList.jsx — the editable cue list.
 *
 * Each card exposes the two things an editor actually touches: the text and the
 * in/out times. Timing edits keep the list sorted (the compositor's
 * `activeCue()` assumes ascending starts) and clamp against neighbours so cues
 * can never overlap.
 */

import React from "react";
import { useProject, useClockValue } from "../state/store.jsx";

const num = (v, fallback = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

export default function CaptionList({ selectedCue, onSelectCue }) {
  const { project, patchCue, removeCue, addCue, setCues, engine, showToast } = useProject();
  const { time } = useClockValue(15);

  const cues = project.cues;
  const active = cues.find((c) => time >= c.start && time < c.end);

  const setTimes = (cue, start, end) => {
    const idx = cues.findIndex((c) => c.id === cue.id);
    const prev = cues[idx - 1];
    const next = cues[idx + 1];
    const minStart = prev ? prev.start : 0;
    const maxEnd = next ? next.end : Math.max(project.duration, end);
    const s = Math.max(minStart, Math.min(start, end - 0.1));
    const e = Math.min(Math.max(end, s + 0.1), Math.max(maxEnd, s + 0.1));
    patchCue(cue.id, { start: round(s), end: round(e) });
  };

  const duplicate = (cue) => {
    const dur = cue.end - cue.start;
    addCue({
      start: round(cue.end + 0.05),
      end: round(cue.end + 0.05 + dur),
      text: cue.text,
      words: cue.words,
    });
    showToast("Cue duplicated.");
  };

  const autoSplit = (cue) => {
    const words = cue.text.split(/\s+/).filter(Boolean);
    if (words.length < 2) return;
    const mid = Math.ceil(words.length / 2);
    const ratio = words.slice(0, mid).join(" ").length / Math.max(1, cue.text.length);
    const cut = cue.start + (cue.end - cue.start) * ratio;
    patchCue(cue.id, { end: round(cut - 0.03), text: words.slice(0, mid).join(" ") });
    addCue({
      start: round(cut),
      end: cue.end,
      text: words.slice(mid).join(" "),
      words: cue.words,
    });
    showToast("Cue split in two.");
  };

  return (
    <div>
      <h3>Captions</h3>
      <p className="hint">
        {cues.length
          ? `${cues.length} cue${cues.length > 1 ? "s" : ""} · click one to seek to it.`
          : "Generate cues from audio, or add one manually."}
      </p>

      <div className="row wrap">
        <button
          className="btn small"
          onClick={() =>
            addCue({
              start: round(engine.clock.time),
              end: round(engine.clock.time + 2),
              text: "New caption",
              words: [],
            })
          }
        >
          ＋ Add cue
        </button>
        <button
          className="btn small ghost"
          disabled={!cues.length}
          onClick={() => setCues([])}
        >
          Clear
        </button>
      </div>

      {!cues.length ? (
        <div className="status" style={{ marginTop: 8 }}>
          No captions yet. Open <b>Transcribe</b> and run speech-to-text, or add a
          cue by hand.
        </div>
      ) : null}

      <div style={{ marginTop: 10 }}>
        {cues.map((cue, i) => {
          const isActive = active?.id === cue.id;
          const isSelected = selectedCue === cue.id;
          return (
            <div
              key={cue.id}
              className={`cueCard${isActive || isSelected ? " active" : ""}`}
              onClick={() => {
                onSelectCue?.(cue.id);
                engine.clock.seek(cue.start);
              }}
            >
              <div className="times">
                <input
                  type="number"
                  step={0.05}
                  min={0}
                  value={cue.start}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setTimes(cue, num(e.target.value, cue.start), cue.end)}
                />
                <input
                  type="number"
                  step={0.05}
                  min={0}
                  value={cue.end}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setTimes(cue, cue.start, num(e.target.value, cue.end))}
                />
                <span className="muted mono" style={{ alignSelf: "center" }}>
                  #{i + 1} · {(cue.end - cue.start).toFixed(2)}s
                </span>
              </div>

              <textarea
                value={cue.text}
                rows={2}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => patchCue(cue.id, { text: e.target.value })}
              />

              <div className="actions" onClick={(e) => e.stopPropagation()}>
                <button className="btn small ghost" onClick={() => duplicate(cue)}>
                  Duplicate
                </button>
                <button className="btn small ghost" onClick={() => autoSplit(cue)}>
                  Split
                </button>
                <div style={{ flex: 1 }} />
                <button className="btn small ghost" onClick={() => removeCue(cue.id)}>
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="footer-note">
        Cue ids are stable, so the seeded per-cue randomisation (font, jitter,
        glow) stays identical between preview and export.
      </div>
    </div>
  );
}

const round = (n) => Math.round(n * 1000) / 1000;
