/**
 * ExportPanel.jsx — renders the composition to a .webm and downloads the
 * subtitle files.
 *
 * The recorder captures the *preview canvas* and the AudioEngine's own
 * MediaStreamDestination, so there is no second render path to keep in sync.
 * Recording runs in real time (MediaRecorder has no offline mode).
 */

import React, { useState } from "react";
import { useProject, useClockValue } from "../state/store.jsx";
import { recordWebm, downloadBlob, pickMime } from "../lib/exporter.js";
import { cuesToSRT, cuesToVTT, downloadText } from "../lib/transcribe.js";
import { syncVideo } from "../lib/media.js";
import { videoSourceTime } from "./Preview.jsx";

const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

export default function ExportPanel({ canvasRef }) {
  const { project, engine, showToast } = useProject();
  const { time, playing } = useClockValue(10);
  const [state, setState] = useState({ status: "idle", percent: 0, message: "" });
  const [lastBlob, setLastBlob] = useState(null);

  const busy = state.status === "recording";
  const mime = pickMime();

  const start = async () => {
    if (busy) return;
    if (!mime) {
      setState({ status: "error", percent: 0, message: "MediaRecorder unsupported." });
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Stop any running preview playback first.
    engine.clock.pause();
    engine.audio.stop();
    project.video?.element?.pause();

    setState({ status: "recording", percent: 0, message: "Preparing…" });
    setLastBlob(null);

    try {
      const result = await recordWebm({
        canvas,
        audio: engine.audio,
        clock: engine.clock,
        onProgress: ({ t }) =>
          setState({
            status: "recording",
            percent: Math.min(100, (t / Math.max(0.1, project.duration)) * 100),
            message: `Recording ${fmt(t)} / ${fmt(project.duration)}`,
          }),
        prepare: async () => {
          // Accurately seek the video to the first frame so the opening of the
          // recording is not a stale frame.
          const v = project.video;
          if (v?.element) {
            await syncVideo(v.element, videoSourceTime(v, 0), false, true);
          }
          engine.compositor.render(canvas.getContext("2d"), project, 0, { guides: false });
        },
      });

      setLastBlob(result.blob);
      setState({
        status: "done",
        percent: 100,
        message: `Recorded ${(result.blob.size / 1048576).toFixed(1)} MB · ${fmt(result.seconds)}`,
      });
      showToast("Video export finished.");
    } catch (err) {
      console.error(err);
      setState({ status: "error", percent: 0, message: err.message });
      showToast(`Export failed: ${err.message}`, "err");
    } finally {
      engine.clock.seek(0);
    }
  };

  const saveVideo = () => {
    if (!lastBlob) return;
    downloadBlob(lastBlob, `caption-forge-${Date.now()}.webm`);
  };

  return (
    <div>
      <h3>Export</h3>
      <p className="hint">
        Real-time capture of the preview canvas + audio into a WebM file, plus
        SRT / WebVTT subtitle downloads.
      </p>

      {!mime ? (
        <div className="status err">MediaRecorder is not available in this browser.</div>
      ) : (
        <div className="status">
          Codec: <span className="mono">{mime}</span>
        </div>
      )}

      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn primary" onClick={start} disabled={busy || !mime}>
          {busy ? "Recording…" : "⬤ Record video (.webm)"}
        </button>
      </div>

      {state.status !== "idle" ? (
        <div
          className={`status ${
            state.status === "error" ? "err" : state.status === "done" ? "ok" : "warn"
          }`}
        >
          {state.message}
          {busy ? (
            <div className="progress">
              <i style={{ width: `${state.percent}%` }} />
            </div>
          ) : null}
        </div>
      ) : null}

      {lastBlob ? (
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn accent" onClick={saveVideo}>
            ⬇ Save video
          </button>
        </div>
      ) : null}

      <div className="divider" />

      <div className="row wrap">
        <button
          className="btn small"
          disabled={!project.cues.length}
          onClick={() => downloadText("captions.srt", cuesToSRT(project.cues), "application/x-subrip")}
        >
          ⬇ captions.srt
        </button>
        <button
          className="btn small"
          disabled={!project.cues.length}
          onClick={() => downloadText("captions.vtt", cuesToVTT(project.cues), "text/vtt")}
        >
          ⬇ captions.vtt
        </button>
      </div>

      <div className="footer-note">
        Recording takes as long as the composition ({fmt(project.duration)}). Keep
        this tab in the foreground — background tabs throttle the render loop.
        {playing ? " Stop playback before exporting." : ""}
      </div>
    </div>
  );
}
