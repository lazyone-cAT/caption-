/**
 * StylePanel.jsx — the caption look: font, text effect, glow, gradient,
 * transition and the seeded randomisers.
 *
 * Every randomiser goes through `rollStyle(seed)`, so pressing 🎲 with the same
 * seed reproduces the exact same look — handy when a project is reopened.
 */

import React from "react";
import { useProject } from "../state/store.jsx";
import {
  FONTS,
  TEXT_EFFECTS,
  TRANSITIONS,
  GLOW_COLORS,
  rollStyle,
} from "../lib/styles.js";

const ALIGNMENTS = [
  { id: "left", name: "Left" },
  { id: "center", name: "Center" },
  { id: "right", name: "Right" },
];

export default function StylePanel() {
  const { project, setProject, patchStyle, showToast } = useProject();
  const s = project.style;

  const roll = () => {
    const seed = (Math.random() * 2 ** 31) | 0;
    patchStyle(rollStyle(seed));
    showToast(`Randomised look (seed ${seed}).`);
  };

  const rollPart = (part) => {
    const seed = (Math.random() * 2 ** 31) | 0;
    const rolled = rollStyle(seed);
    const pick = {};
    if (part === "font") pick.fontId = rolled.fontId;
    if (part === "effect") pick.effectId = rolled.effectId;
    if (part === "glow") {
      pick.glowColor = rolled.glowColor;
      pick.glowIntensity = rolled.glowIntensity;
      pick.glowBlur = rolled.glowBlur;
      pick.glowEnabled = true;
    }
    if (part === "transition") {
      const t = TRANSITIONS.filter((x) => x.id !== "none");
      pick.transitionId = t[(Math.random() * t.length) | 0].id;
    }
    patchStyle(pick);
  };

  return (
    <div>
      <h3>Style</h3>
      <p className="hint">
        Fonts, text effects, glow and colourful transitions — all rendered with
        anime.js timelines that are seeked, never played, so preview and export
        match frame for frame.
      </p>

      <div className="row wrap">
        <button className="btn primary" onClick={roll}>
          🎲 Randomise everything
        </button>
        <button className="btn small" onClick={() => rollPart("font")}>
          🅰 Font
        </button>
        <button className="btn small" onClick={() => rollPart("effect")}>
          ✨ Effect
        </button>
        <button className="btn small" onClick={() => rollPart("glow")}>
          💡 Glow
        </button>
        <button className="btn small" onClick={() => rollPart("transition")}>
          🌈 Transition
        </button>
      </div>

      <div className="divider" />

      <div className="field">
        <label>Font</label>
        <select value={s.fontId} onChange={(e) => patchStyle({ fontId: e.target.value })}>
          {FONTS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>Text effect</label>
        <select value={s.effectId} onChange={(e) => patchStyle({ effectId: e.target.value })}>
          {TEXT_EFFECTS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} — {f.desc}
            </option>
          ))}
        </select>
      </div>

      <div className="grid2">
        <div className="field">
          <label>
            Size <b>{s.fontSize}px</b>
          </label>
          <input
            type="range"
            min={28}
            max={140}
            step={2}
            value={s.fontSize}
            onChange={(e) => patchStyle({ fontSize: parseInt(e.target.value, 10) })}
          />
        </div>
        <div className="field">
          <label>
            Tracking <b>{s.letterSpacing}px</b>
          </label>
          <input
            type="range"
            min={-4}
            max={14}
            step={1}
            value={s.letterSpacing}
            onChange={(e) => patchStyle({ letterSpacing: parseInt(e.target.value, 10) })}
          />
        </div>
      </div>

      <div className="grid2">
        <div className="field">
          <label>
            In <b>{s.inDuration}ms</b>
          </label>
          <input
            type="range"
            min={80}
            max={1600}
            step={20}
            value={s.inDuration}
            onChange={(e) => patchStyle({ inDuration: parseInt(e.target.value, 10) })}
          />
        </div>
        <div className="field">
          <label>
            Out <b>{s.outDuration}ms</b>
          </label>
          <input
            type="range"
            min={60}
            max={1200}
            step={20}
            value={s.outDuration}
            onChange={(e) => patchStyle({ outDuration: parseInt(e.target.value, 10) })}
          />
        </div>
      </div>

      <div className="field">
        <label>Alignment</label>
        <div className="seg">
          {ALIGNMENTS.map((a) => (
            <button
              key={a.id}
              className={s.align === a.id ? "on" : ""}
              onClick={() => patchStyle({ align: a.id })}
            >
              {a.name}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>
          Vertical position <b>{Math.round(s.vPos * 100)}%</b>
        </label>
        <input
          type="range"
          min={0.1}
          max={0.94}
          step={0.01}
          value={s.vPos}
          onChange={(e) => patchStyle({ vPos: parseFloat(e.target.value) })}
        />
      </div>

      <div className="divider" />
      <h3>Colour</h3>

      <div className="row wrap">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={s.gradientEnabled}
            onChange={(e) => patchStyle({ gradientEnabled: e.target.checked })}
          />
          Gradient fill
        </label>
        <input
          type="color"
          value={s.gradientA}
          onChange={(e) => patchStyle({ gradientA: e.target.value })}
        />
        <input
          type="color"
          value={s.gradientB}
          onChange={(e) => patchStyle({ gradientB: e.target.value })}
        />
      </div>

      <div className="row wrap">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={s.strokeWidth > 0}
            onChange={(e) => patchStyle({ strokeWidth: e.target.checked ? 6 : 0 })}
          />
          Outline
        </label>
        <input
          type="color"
          value={s.stroke}
          onChange={(e) => patchStyle({ stroke: e.target.value })}
        />
        <input
          type="range"
          min={0}
          max={16}
          step={1}
          value={s.strokeWidth}
          style={{ width: 90 }}
          onChange={(e) => patchStyle({ strokeWidth: parseInt(e.target.value, 10) })}
        />
      </div>

      <div className="divider" />
      <h3>Glow</h3>

      <div className="row wrap">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={s.glowEnabled}
            onChange={(e) => patchStyle({ glowEnabled: e.target.checked })}
          />
          Glow enabled
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={s.glowPulse}
            onChange={(e) => patchStyle({ glowPulse: e.target.checked })}
          />
          Pulse
        </label>
      </div>

      <div className="chips" style={{ marginBottom: 10 }}>
        {GLOW_COLORS.map((c) => (
          <button
            key={c}
            className={`chip${s.glowColor === c ? " on" : ""}`}
            style={{
              background: s.glowColor === c ? undefined : c,
              width: 26,
              height: 22,
              padding: 0,
            }}
            title={c}
            onClick={() => patchStyle({ glowColor: c, glowEnabled: true })}
          />
        ))}
        <input
          type="color"
          value={s.glowColor}
          onChange={(e) => patchStyle({ glowColor: e.target.value })}
          title="Custom glow colour"
        />
      </div>

      <div className="grid2">
        <div className="field">
          <label>
            Intensity <b>{s.glowIntensity.toFixed(2)}</b>
          </label>
          <input
            type="range"
            min={0}
            max={3}
            step={0.05}
            value={s.glowIntensity}
            onChange={(e) => patchStyle({ glowIntensity: parseFloat(e.target.value) })}
          />
        </div>
        <div className="field">
          <label>
            Blur <b>{s.glowBlur}px</b>
          </label>
          <input
            type="range"
            min={4}
            max={110}
            step={2}
            value={s.glowBlur}
            onChange={(e) => patchStyle({ glowBlur: parseInt(e.target.value, 10) })}
          />
        </div>
      </div>

      <div className="divider" />
      <h3>Transitions</h3>

      <div className="field">
        <label>On each cue entrance</label>
        <select
          value={s.transitionId}
          onChange={(e) => patchStyle({ transitionId: e.target.value })}
        >
          {TRANSITIONS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>
          Duration <b>{s.transitionDuration.toFixed(2)}s</b>
        </label>
        <input
          type="range"
          min={0.15}
          max={2}
          step={0.05}
          value={s.transitionDuration}
          onChange={(e) => patchStyle({ transitionDuration: parseFloat(e.target.value) })}
        />
      </div>

      <div className="divider" />

      <div className="row wrap">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={s.perCueRandom}
            onChange={(e) => patchStyle({ perCueRandom: e.target.checked })}
          />
          Per-cue variation (font / jitter / glow)
        </label>
      </div>

      <div className="field">
        <label>
          Seed <b>{s.randomSeed}</b>
        </label>
        <input
          type="number"
          value={s.randomSeed}
          onChange={(e) => patchStyle({ randomSeed: parseInt(e.target.value, 10) || 0 })}
        />
      </div>

      <div className="divider" />
      <h3>Background</h3>

      <div className="field">
        <div className="seg">
          {[
            { id: "gradient", name: "Gradient" },
            { id: "solid", name: "Solid" },
          ].map((b) => (
            <button
              key={b.id}
              className={project.background.type === b.id ? "on" : ""}
              onClick={() => setProject((p) => ({ ...p, background: { ...p.background, type: b.id } }))}
            >
              {b.name}
            </button>
          ))}
        </div>
      </div>

      <div className="row wrap">
        <input
          type="color"
          value={project.background.colorA}
          title="Colour A"
          onChange={(e) =>
            setProject((p) => ({ ...p, background: { ...p.background, colorA: e.target.value } }))
          }
        />
        <input
          type="color"
          value={project.background.colorB}
          title="Colour B"
          onChange={(e) =>
            setProject((p) => ({ ...p, background: { ...p.background, colorB: e.target.value } }))
          }
        />
        <span className="muted">A / B</span>
      </div>

      <div className="field">
        <label>
          Angle <b>{project.background.angle}°</b>
        </label>
        <input
          type="range"
          min={0}
          max={360}
          step={1}
          value={project.background.angle}
          onChange={(e) =>
            setProject((p) => ({
              ...p,
              background: { ...p.background, angle: parseInt(e.target.value, 10) },
            }))
          }
        />
      </div>
    </div>
  );
}
