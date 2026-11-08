---
name: theatre-js
description: Use this skill whenever building, editing, or debugging animations with Theatre.js (also written "theatre.js", "theatrejs", or "@theatre/core"). Covers Project/Sheet/Object setup, keyframing values on a timeline, the visual Studio editor, headless/production playback with state JSON, React integration via @theatre/r3f and react hooks, and driving Theatre sequences from scroll or other external signals. Trigger this for tasks like "animate this with Theatre.js", "set up a Theatre.js sequence", "add the Theatre Studio editor", "drive my Three.js/R3F scene with Theatre", "export Theatre.js state for production", or any request to write, fix, or migrate Theatre.js code — including inside HTML/React artifacts.
---

# Theatre.js

Theatre.js is an animation library built around a **visual, scrubbable timeline editor** ("Studio") paired with a headless runtime (`@theatre/core`) that plays back the same data in production without the editor UI. It's commonly used for motion design on DOM elements, SVG, Three.js/WebGL scenes (especially via `@theatre/r3f`), and any plain JS values.

The defining workflow: you write code that declares *what* can be animated (objects and their props), then use Studio's UI to scrub time and set keyframes visually. Studio persists that keyframe data as JSON, which ships to production and drives playback with `@theatre/core` alone (Studio itself is dev-only and should not ship).

## Core mental model

| Concept | Purpose |
|---|---|
| `Project` | Top-level container for one animation project. Holds one or more Sheets and (in dev) syncs state with Studio. |
| `Sheet` | A named "scene" or timeline within a project — e.g. `project.sheet('Hero Scene')`. Has its own sequence. |
| `Object` (Theatre object) | A set of animatable props registered on a sheet, e.g. `sheet.object('Ball', { x: 0, y: 0, color: types.rgba(...) })`. Not a DOM/3D object itself — just the animatable data + a way to react to changes. |
| `Sequence` | The sheet's timeline. `sheet.sequence.play()`, `.pause()`, `.position = t`. |
| Studio | The visual editor (`@theatre/studio`). Injects a UI overlay for scrubbing time and setting keyframes. Dev-only. |
| Props / `types` | Typed prop schemas from `@theatre/core`, e.g. `types.number(0, { range: [0, 100] })`, `types.rgba()`, `types.compound({...})`, `types.stringLiteral(...)`. |

## Setup

```bash
npm install @theatre/core @theatre/studio
# For Three.js / React Three Fiber scenes:
npm install @theatre/r3f
# For React state/prop-panel integration:
npm install @theatre/react
```

CDN (quick HTML artifacts, no bundler):
```html
<script type="module">
  import studio from 'https://cdn.jsdelivr.net/npm/@theatre/studio@0.7/dist/index.min.js';
  import { getProject, types } from 'https://cdn.jsdelivr.net/npm/@theatre/core@0.7/dist/index.min.js';
</script>
```
Always pin matching versions across `@theatre/core`, `@theatre/studio`, `@theatre/react`, and `@theatre/r3f` — mismatched versions are a common source of runtime errors.

## The basic pattern

```js
import { getProject, types } from '@theatre/core';
import studio from '@theatre/studio';

// 1. Initialize Studio ONLY in development — never ship it to production.
if (import.meta.env.DEV) {
  studio.initialize();
}

// 2. Create (or load) a project. Pass persisted state in production.
const project = getProject('My Animation'); // add { state } in prod, see "Production playback" below

// 3. Create a sheet — a named scene/timeline.
const sheet = project.sheet('Scene 1');

// 4. Register an object with animatable props.
const ball = sheet.object('Ball', {
  position: types.compound({ x: types.number(0), y: types.number(0) }),
  radius: types.number(20, { range: [1, 100] }),
  color: types.rgba({ r: 1, g: 0, b: 0, a: 1 }),
});

// 5. React to changes — this is what actually moves things on screen.
ball.onValuesChange((values) => {
  ballEl.style.transform = `translate(${values.position.x}px, ${values.position.y}px)`;
  ballEl.style.width = `${values.radius * 2}px`;
});

// 6. Play the sheet's sequence.
sheet.sequence.play({ iterationCount: Infinity, range: [0, 4] });
```

At this point, opening the page in dev shows the Studio panel: click the object in the outline, scrub the timeline, and right-click a prop to set a keyframe. Studio persists keyframes automatically (to browser storage in dev, or via `studio.createContentOfSaveFile()` / the export button to get JSON for production).

## Production playback (no Studio)

Studio must never ship to production — it's a dev/authoring tool. Export the state JSON (via Studio's export button, or `studio.createContentOfSaveFile(projectName)`), save it as a file, then load it in production:

```js
import { getProject } from '@theatre/core';
import state from './my-animation-state.json';

const project = getProject('My Animation', { state });
const sheet = project.sheet('Scene 1');
// same object/onValuesChange code as above — no studio.initialize() call at all
```

A clean setup conditionally imports Studio only in dev builds (e.g. behind `import.meta.env.DEV` or a separate entry point) so it's tree-shaken out of the production bundle entirely.

## Controlling playback

```js
sheet.sequence.play();                                  // play once
sheet.sequence.play({ iterationCount: Infinity });       // loop
sheet.sequence.play({ range: [1, 3], direction: 'alternate' }); // ping-pong a sub-range
sheet.sequence.pause();
sheet.sequence.position = 2.5;                           // scrub directly (great for scroll-linking)
const promise = sheet.sequence.play();
promise.then(() => console.log('done'));                 // resolves when playback finishes/stops
```

### Scroll-linked / externally driven animation

Since `sequence.position` is just a settable number, drive it from anything — scroll position, drag, audio analysis:

```js
window.addEventListener('scroll', () => {
  const progress = window.scrollY / (document.body.scrollHeight - window.innerHeight);
  sheet.sequence.position = progress * sheet.sequence.pointer.length /* or a known duration */;
});
```

## React integration

Two layers depending on what you're building:

**`@theatre/react`** — hooks for reading Theatre values into React state (`useVal`) — useful for building custom control panels or reacting to values outside Theatre's own DOM/3D helpers.

```jsx
import { useVal } from '@theatre/react';

function Ball({ obj }) {
  const { x, y } = useVal(obj.props.position);
  return <div style={{ transform: `translate(${x}px, ${y}px)` }} />;
}
```

**`@theatre/r3f`** — purpose-built for React Three Fiber scenes. Wraps the R3F canvas so any child can become a Theatre object via `e()` (the `editable` wrapper), auto-registering position/rotation/scale/etc. as animatable and giving you Studio's transform gizmos for free.

```jsx
import { Canvas } from '@react-three/fiber';
import { SheetProvider, PerspectiveCamera, editable as e } from '@theatre/r3f';
import { getProject } from '@theatre/core';
import studio from '@theatre/studio';
import extension from '@theatre/r3f/dist/extension';

if (import.meta.env.DEV) {
  studio.initialize();
  studio.extend(extension); // adds the R3F-aware panel (viewport gizmos, object outline)
}

const sheet = getProject('R3F Demo').sheet('Scene');

function App() {
  return (
    <Canvas>
      <SheetProvider sheet={sheet}>
        <PerspectiveCamera theatreKey="Camera" position={[0, 0, 5]} />
        <e.mesh theatreKey="Cube" position={[0, 1, 0]}>
          <boxGeometry />
          <meshStandardMaterial color="orange" />
        </e.mesh>
      </SheetProvider>
    </Canvas>
  );
}
```

Every `e.<threeElementName>` (e.g. `e.mesh`, `e.group`, `e.spotLight`) needs a unique `theatreKey` within its sheet — this is what shows up as the object name in Studio's outline and the persisted-state JSON.

## Prop types worth knowing

- `types.number(default, { range: [min, max], nudgeMultiplier })`
- `types.rgba({ r, g, b, a })` — color picker in Studio
- `types.compound({ ...nestedProps })` — group related props (e.g. `{x, y}` under `position`)
- `types.stringLiteral('a', { a: 'Option A', b: 'Option B' })` — dropdown/enum in Studio
- `types.boolean(default)`
- Nest compounds freely; `onValuesChange` receives the full nested shape matching what you declared.

## Common pitfalls

1. **Shipping `@theatre/studio` to production** — bloats the bundle and exposes an editor UI end users shouldn't see. Gate `studio.initialize()`/`studio.extend()` behind a dev-only condition or separate entry point.
2. **Forgetting to pass `{ state }` to `getProject()` in production** — without it, the project has no keyframes and everything stays at default values.
3. **Mismatched package versions** across `@theatre/core`, `@theatre/studio`, `@theatre/react`, `@theatre/r3f` — pin them together and upgrade in lockstep.
4. **Re-registering the same object** (`sheet.object('Name', {...})`) with a different prop schema across renders — Theatre keys objects by name within a sheet; changing the shape means re-declaring, which can orphan old keyframe data. Keep prop schemas stable, or version the object name.
5. **Driving visuals only through Studio's UI feel** — `onValuesChange` (or `@theatre/react`'s `useVal`) is what actually applies values to DOM/3D/whatever; Studio only edits the data, it doesn't render your scene for you outside R3F's `editable` helpers.
6. **Missing `theatreKey` on `editable` R3F elements**, or reusing one — causes objects to silently collide or fail to appear in the outline.
7. **Calling `studio.initialize()` more than once** — it's idempotent-ish but redundant calls (e.g. on hot reload without guarding) can cause duplicate panels; guard with a module-level flag if needed.

## Reference

- Official docs: https://www.theatrejs.com/docs
- `@theatre/r3f` docs: https://github.com/theatre-js/theatre/tree/main/packages/r3f
