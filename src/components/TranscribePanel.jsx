/**
 * TranscribePanel.jsx — offline speech-to-text.
 *
 * Wraps the algorithm in `lib/transcribe.js`:
 *   loadVoskModel()  → downloads + unpacks the WASM model once (cached by
 *                      vosk-browser in IndexedDB / Emscripten FS)
 *   transcribeFile() → decode → resample 16 kHz → stream to KaldiRecognizer →
 *                      wordsToCues() segmentation
 *
 * The model is held in a module-level cache so re-runs are instant.
 */

import React, { useRef, useState } from "react";
import { useProject } from "../state/store.jsx";
import {
  DEFAULT_MODEL_URL,
  loadVoskModel,
  transcribeFile,
  cuesToSRT,
  cuesToVTT,
  downloadText,
} from "../lib/transcribe.js";

let sharedModel = null; // survives React remounts

export default function TranscribePanel() {
  const { project, setCues, showToast } = useProject();
  const [modelState, setModelState] = useState(() =>
    sharedModel ? { ready: true, percent: 100, message: "Model cached." } : { ready: false, percent: 0, message: "" }
  );
  const [run, setRun] = useState(null); // { percent, message }
  const [error, setError] = useState("");
  const abortRef = useRef(null);

  const ensureModel = async () => {
    if (sharedModel) return sharedModel;
    setError("");
    setModelState({ ready: false, percent: 0, message: "Loading model…" });
    try {
      const model = await loadVoskModel(DEFAULT_MODEL_URL, (s) =>
        setModelState({ ready: false, percent: s.percent, message: s.message })
      );
      sharedModel = model;
      setModelState({ ready: true, percent: 100, message: "Model ready." });
      return model;
    } catch (err) {
      console.error(err);
      setError(`Model load failed: ${err.message}`);
      setModelState({ ready: false, percent: 0, message: "" });
      throw err;
    }
  };

  const start = async () => {
    if (!project.audio) {
      setError("Import an audio file first (Media tab).");
      return;
    }
    if (!project.audio.file) {
      setError("This audio has no source file to re-read — re-import it.");
      return;
    }
    try {
      setError("");
      const model = await ensureModel();
      const controller = new AbortController();
      abortRef.current = controller;

      const result = await transcribeFile(project.audio.file, {
        model,
        signal: controller.signal,
        onStatus: (s) => setRun({ percent: s.percent, message: s.message }),
      });

      if (!result.cues.length) {
        setError("No speech detected in this audio.");
      } else {
        setCues(result.cues.map((c) => ({ ...c, id: c.id })));
        showToast(`Created ${result.cues.length} caption cue(s).`);
      }
    } catch (err) {
      if (err.name === "AbortError") setError("Transcription cancelled.");
      else {
        console.error(err);
        setError(err.message);
      }
    } finally {
      setRun(null);
      abortRef.current = null;
    }
  };

  const cancel = () => abortRef.current?.abort();

  const busy = Boolean(run);

  return (
    <div>
      <h3>Speech → Captions</h3>
      <p className="hint">
        Offline Vosk (Kaldi WASM) recognition, then a segmentation algorithm that
        breaks the word stream into readable cues. Nothing leaves this device.
      </p>

      <div className={`status ${modelState.ready ? "ok" : ""}`}>
        {modelState.message || "Model not loaded yet."}
        {!modelState.ready && modelState.percent > 0 ? (
          <div className="progress">
            <i style={{ width: `${modelState.percent}%` }} />
          </div>
        ) : null}
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn" onClick={ensureModel} disabled={busy || modelState.ready}>
          {modelState.ready ? "✓ Model loaded" : "1 · Load model (41 MB)"}
        </button>
      </div>

      <div className="row">
        <button className="btn primary" onClick={start} disabled={busy || !project.audio}>
          {busy ? "Transcribing…" : "2 · Generate captions"}
        </button>
        {busy ? (
          <button className="btn ghost" onClick={cancel}>
            Cancel
          </button>
        ) : null}
      </div>

      {busy && run ? (
        <div className="status warn">
          {run.message}
          <div className="progress">
            <i style={{ width: `${run.percent}%` }} />
          </div>
        </div>
      ) : null}

      {error ? <div className="status err" style={{ marginTop: 8 }}>{error}</div> : null}

      <div className="divider" />

      <div className="row wrap">
        <button
          className="btn small"
          disabled={!project.cues.length}
          onClick={() =>
            downloadText("captions.srt", cuesToSRT(project.cues), "application/x-subrip")
          }
        >
          ⬇ SRT
        </button>
        <button
          className="btn small"
          disabled={!project.cues.length}
          onClick={() => downloadText("captions.vtt", cuesToVTT(project.cues), "text/vtt")}
        >
          ⬇ VTT
        </button>
        <div style={{ flex: 1 }} />
        <button
          className="btn small ghost"
          disabled={!project.cues.length}
          onClick={() => setCues([])}
        >
          Clear all
        </button>
      </div>

      <div className="footer-note">
        Model: vosk-model-small-en-us-0.15 (≈41 MB, downloaded once and cached).
        Segmentation defaults: 42 chars · 10 words · 0.6 s silence gap · 4.2 s max.
      </div>
    </div>
  );
}
