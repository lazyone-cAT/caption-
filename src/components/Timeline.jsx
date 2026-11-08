/**
 * Timeline.jsx — the multi-track strip under the stage.
 *
 *   ▸ one 46px track holds the video window, every caption cue and every GIF
 *     layer, each as a positioned block (percentages of `project.duration`).
 *   ▸ clicking the track seeks; clicking a cue block selects it in the list.
 */

import React, { useRef } from "react";
import { useProject, useClockValue } from "../state/store.jsx";

const pct = (v, d) => `${Math.max(0, Math.min(100, (v / Math.max(0.001, d)) * 100))}%`;

export default function Timeline({ selectedCue, onSelectCue }) {
  const { project, engine } = useProject();
  const { time } = useClockValue(30);
  const trackRef = useRef(null);
  const d = Math.max(0.1, project.duration);

  const seekFromEvent = (e) => {
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    engine.clock.seek(Math.max(0, Math.min(1, ratio)) * d);
  };

  return (
    <div className="timeline">
      <div className="timelineHead">
        <span>Timeline — {d.toFixed(1)}s</span>
        <span>
          {project.cues.length} cues · {project.gifs.length} gif layers
          {project.video ? " · 1 video" : ""}
        </span>
      </div>

      <div className="track" ref={trackRef} onMouseDown={seekFromEvent}>
        {project.video ? (
          <div
            className="block video"
            style={{
              left: pct(project.video.trimIn, d),
              width: pct(project.video.trimOut - project.video.trimIn, d),
            }}
            title={`${project.video.name} (${project.video.trimIn.toFixed(2)}s → ${project.video.trimOut.toFixed(2)}s)`}
          >
            🎞 {project.video.name}
          </div>
        ) : null}

        {project.cues.map((cue) => (
          <div
            key={cue.id}
            className="block cue"
            style={{
              left: pct(cue.start, d),
              width: pct(Math.max(0.12, cue.end - cue.start), d),
              outline: selectedCue === cue.id ? "2px solid #ffd166" : "none",
            }}
            title={`${cue.start.toFixed(2)}s → ${cue.end.toFixed(2)}s`}
            onMouseDown={(e) => {
              e.stopPropagation();
              onSelectCue?.(cue.id);
              engine.clock.seek(cue.start);
            }}
          >
            {cue.text.replace(/\n/g, " ")}
          </div>
        ))}

        {project.gifs.map((g) => (
          <div
            key={g.id}
            className="block gif"
            style={{
              left: pct(g.start, d),
              width: pct(Math.max(0.12, g.end - g.start), d),
            }}
            title={`${g.name}: ${g.inEffect} → ${g.outEffect}`}
            onMouseDown={(e) => {
              e.stopPropagation();
              engine.clock.seek(g.start);
            }}
          >
            {g.name}
          </div>
        ))}

        <div className="playhead" style={{ left: pct(time, d) }} />
      </div>
    </div>
  );
}
