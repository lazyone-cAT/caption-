---
name: motion-js
description: Use whenever building, editing, or debugging animations with Motion (aka "motion.js", "Motion One", "Framer Motion", npm packages "motion"/"framer-motion") or with Lottie/Lottie-Light ("lottie-web", "lottie_light" build, "lottie-react" — for playing back After Effects/Bodymovin JSON animations). Covers vanilla `animate()`/`timeline()`/`scroll()`/`stagger()`, React usage (`motion.div`, variants, `whileHover`/`whileTap`/`whileDrag`, `AnimatePresence` exits, `layoutId` shared-layout transitions, `useAnimate`/`useScroll`/`useSpring`), Framer Motion migration, and Lottie-Light JSON playback (`loadAnimation`, renderer choice, playback controls, React wrappers, expression-support gap vs full lottie-web). Trigger for "animate with Motion/Framer Motion", "hover/tap animation", "AnimatePresence list", "shared layout transition", "scroll-linked animation", "play this Lottie/Lottie-Light animation", "add Lottie to React", or any Motion/Framer Motion/Lottie code task — including HTML/React artifacts.
---

# Motion (formerly Framer Motion / Motion One)

"Motion" is the unified animation library from the Framer team — it merged the lightweight vanilla-JS **Motion One** and the React-focused **Framer Motion** into a single package. Install `motion` for new projects; `framer-motion` still exists as a React-only alias of the same underlying engine, and `motion/react` is the modern import path for React APIs within the unified package.

**Always check which import style is in play before writing code:**
- `import { motion } from "framer-motion"` → legacy/current Framer Motion package, still fully supported.
- `import { motion } from "motion/react"` → unified `motion` package, React APIs.
- `import { animate, timeline, scroll } from "motion"` → unified `motion` package, vanilla JS APIs (no React needed).

All three share the same animation engine and most option names, so concepts below apply across all of them — only the import path and (for vanilla) targeting-by-selector-vs-component differ.

## Setup

```bash
npm install motion          # unified package (vanilla + React)
# or, React-only legacy alias:
npm install framer-motion
```

```js
// Vanilla JS (no framework)
import { animate, timeline, stagger, scroll, spring, inView } from "motion";

// React
import { motion, AnimatePresence, useAnimate, useScroll, useSpring, useMotionValue, useTransform } from "motion/react";
```

CDN (quick HTML artifacts, no bundler):
```html
<script type="module">
  import { animate, stagger } from "https://cdn.jsdelivr.net/npm/motion@11/+esm";
</script>
```

## Vanilla JS: `animate()`

The core primitive — animates DOM elements, CSS selectors, or plain JS objects.

```js
import { animate } from "motion";

animate("#box", { x: 100, rotate: 90, backgroundColor: "#f00" }, { duration: 0.8, ease: "easeInOut" });

// Keyframes: array of values
animate("#box", { x: [0, 100, 0] }, { duration: 2, repeat: Infinity });

// Spring physics instead of duration-based easing
animate("#box", { scale: 1.2 }, { type: "spring", stiffness: 300, damping: 20 });
```

Key option fields: `duration`, `delay`, `ease` (`"linear"`, `"easeIn"`, `"easeOut"`, `"easeInOut"`, a cubic-bezier array, or a spring `type`), `repeat`, `repeatType` (`"loop" | "reverse" | "mirror"`), `type: "spring" | "tween" | "inertia"`.

## Stagger

```js
import { animate, stagger } from "motion";

animate(".item", { opacity: [0, 1], y: [20, 0] }, { delay: stagger(0.1, { from: "center" }) });
```

`stagger(duration, { from, easing })` — `from` accepts `"first"`, `"last"`, `"center"`, or an index.

## Timelines (sequencing)

```js
import { timeline } from "motion";

timeline([
  ["#a", { x: 100 }, { duration: 0.5 }],
  ["#b", { opacity: 1 }, { duration: 0.5, at: "-0.2" }], // overlap by 0.2s with previous
  [["#c", "#d"], { scale: 1.5 }, { at: "<" }],            // start together with previous segment
]);
```

Position shorthand (`at`): an absolute time, `"+0.2"`/`"-0.2"` relative offsets, `"<"` (same start as previous), or `"<0.1"` (offset from previous start).

## Scroll-linked and scroll-triggered animation

```js
import { scroll, animate, inView } from "motion";

// Scrub an animation directly to scroll progress
scroll(animate("#progress", { scaleX: [0, 1] }));

// Scoped to one element's scroll progress within the viewport
scroll(animate("#reveal", { opacity: [0, 1], y: [50, 0] }), {
  target: document.querySelector("#reveal"),
  offset: ["start end", "end start"],
});

// Trigger once when an element enters the viewport (no scroll scrubbing)
inView("#card", (element) => {
  animate(element, { opacity: [0, 1] });
  return () => animate(element, { opacity: 0 }); // optional cleanup on exit
});
```

## React: `motion` components

Any HTML/SVG tag becomes animatable by prefixing it: `motion.div`, `motion.svg`, `motion.path`, etc.

```jsx
import { motion } from "motion/react";

function Box() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    />
  );
}
```

- `initial` — starting state (or `false` to skip the initial animation entirely).
- `animate` — target state; re-running when this prop's values change triggers a new animation automatically.
- `exit` — state to animate to on unmount — **only fires inside `<AnimatePresence>`**.
- `transition` — per-animation timing/easing/spring config; can also be nested inside `animate`/`variants` per-property.

### Variants (named, orchestrated states)

Preferred over inline objects once children need to coordinate.

```jsx
const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } },
};
const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

function List() {
  return (
    <motion.ul variants={container} initial="hidden" animate="show">
      {items.map((i) => (
        <motion.li key={i} variants={item} />
      ))}
    </motion.ul>
  );
}
```

Child components automatically inherit the parent's variant label propagation — no need to repeat `initial`/`animate` on every child, just give each a matching `variants` object.

### Gestures

```jsx
<motion.button
  whileHover={{ scale: 1.05 }}
  whileTap={{ scale: 0.95 }}
  whileFocus={{ outline: "2px solid blue" }}
  whileDrag={{ cursor: "grabbing" }}
  drag
  dragConstraints={{ left: 0, right: 200 }}
/>
```

`whileHover`/`whileTap`/`whileFocus`/`whileInView`/`whileDrag` all take the same kind of target object as `animate` and automatically revert when the gesture ends.

### `AnimatePresence` — exit animations

Required for animating components *out* when they're removed from the React tree (React normally unmounts immediately with no chance to animate).

```jsx
import { AnimatePresence, motion } from "motion/react";

function List({ items }) {
  return (
    <AnimatePresence>
      {items.map((item) => (
        <motion.li
          key={item.id} // stable, unique key is required for AnimatePresence to track exits
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {item.label}
        </motion.li>
      ))}
    </AnimatePresence>
  );
}
```

Use `mode="wait"` on `AnimatePresence` to fully exit the current child before the next one enters (common for page/tab transitions): `<AnimatePresence mode="wait">`.

### Shared layout / `layoutId` transitions

```jsx
<motion.div layoutId="highlight" className="highlight-box" />
```

Two elements (even in different parts of the tree, or mounted at different times) sharing the same `layoutId` will smoothly animate between each other's position/size when one replaces the other — the classic "sliding tab indicator" or "card expands to modal" effect. Add `layout` (no `Id`) to any element to have Motion automatically animate its own position/size changes (e.g. on a flex/grid reflow) without a partner element.

### Hooks for imperative/advanced control

```jsx
import { useAnimate, useMotionValue, useTransform, useScroll, useSpring } from "motion/react";

function Component() {
  const [scope, animate] = useAnimate();
  const x = useMotionValue(0);
  const opacity = useTransform(x, [-100, 0, 100], [0, 1, 0]); // derive one value from another
  const smoothX = useSpring(x, { stiffness: 300, damping: 30 });
  const { scrollYProgress } = useScroll(); // or { target: ref } for a specific element

  const handleClick = () => {
    animate(scope.current, { x: 100 }, { duration: 0.5 }); // imperative animate, scoped to this component
  };

  return <div ref={scope} onClick={handleClick} style={{ x, opacity }} />;
}
```

`useMotionValue`/`useTransform`/`useSpring` avoid React re-renders entirely — values update on the DOM directly, which is why they're preferred for high-frequency updates (drag, scroll, mousemove).

## Lottie-Light (lottie-web)

Lottie plays back animations exported from After Effects via the Bodymovin plugin as JSON. `lottie-web` ships several builds — full `lottie.js`, and smaller ones (`lottie_light.js`, and the SVG/Canvas/HTML renderer-only variants). **Lottie-Light is the trimmed build with expression support stripped out**, roughly 30–40% smaller — use it whenever the source animation has no After Effects expressions (most icon/UI micro-animations) and bundle size matters. If a JSON file relies on expressions (dynamic math driving properties, common in more complex motion-design exports), the light build will silently ignore that logic and the animation will look wrong or static in those spots — fall back to the full `lottie.js` build in that case.

### Setup

```bash
npm install lottie-web
```

```js
// Light build (no expressions) — smallest bundle
import lottie from "lottie-web/build/player/lottie_light";
// Full build (supports expressions) — use only if the JSON needs it
import lottie from "lottie-web/build/player/lottie_canvas"; // or plain "lottie-web" for the full SVG build
```

CDN (quick HTML artifacts):
```html
<script src="https://cdn.jsdelivr.net/npm/lottie-web@5/build/player/lottie_light.min.js"></script>
```

### Loading and controlling an animation

```js
const anim = lottie.loadAnimation({
  container: document.getElementById("lottie-container"), // required: a DOM node
  renderer: "svg",       // "svg" (default, crispest/most features), "canvas" (better perf, many instances), or "html"
  loop: true,
  autoplay: true,
  path: "/animations/hero.json",   // OR: animationData: importedJsonObject (bundled at build time)
});

anim.play();
anim.pause();
anim.stop();
anim.setSpeed(1.5);
anim.setDirection(-1);            // play backwards
anim.goToAndStop(30, true);       // frame 30, `true` = frame number (not time in ms)
anim.playSegments([10, 60], true);// play only frames 10–60
anim.destroy();                   // always call on unmount/cleanup — frees canvas/SVG resources and stops the RAF loop
```

Key events (via `anim.addEventListener(name, cb)`): `"complete"`, `"loopComplete"`, `"enterFrame"`, `"DOMLoaded"`, `"data_ready"`, `"data_failed"`.

### React

Prefer a wrapper over calling `lottie-web` directly in a component:

```bash
npm install lottie-react
```

```jsx
import Lottie from "lottie-react";
import animationData from "./hero.json";

function Hero() {
  return <Lottie animationData={animationData} loop autoplay style={{ width: 300 }} />;
}
```

`lottie-react` uses the full renderer under the hood; for a Lottie-Light-only React setup, use `useLottie`/`useLottieInteractivity` from the same package and pass `renderer: "svg"` plus a manually-imported light build, or fall back to `useEffect` + `lottie.loadAnimation` from `lottie-web/build/player/lottie_light` directly, calling `.destroy()` in the cleanup function.

### Choosing a renderer

- `"svg"` — sharpest quality, supports the most features (masks, mattes, effects); heavier DOM cost with many simultaneous instances.
- `"canvas"` — cheaper for many on-screen instances (e.g. a grid of animated icons) at the cost of some SVG-only features.
- `"html"` — rarely needed; mainly for specific compatibility cases.

### Common pitfalls (Lottie-Light specific)

1. **Using the light build on a JSON that relies on After Effects expressions** — those properties silently freeze or misbehave since expression evaluation is exactly what's stripped out; check the export or test visually, and switch to the full `lottie.js` build if needed.
2. **Forgetting `anim.destroy()` on unmount** — leaves a running animation loop and DOM nodes behind, a common source of memory leaks in SPAs with frequently mounted/unmounted Lottie components.
3. **Importing the full `lottie-web` package when only the light build is needed** — defeats the purpose of choosing "Light"; import the specific `lottie_light` (or `lottie_light_canvas`/`lottie_light_html`) sub-path, not the package root.
4. **Large JSON files loaded via `path` blocking first paint** — prefer bundling smaller animations via `animationData` (import the JSON directly) so it's part of the JS bundle instead of a second network round-trip, unless the file is large enough that lazy-loading is worth it.
5. **Mismatching `goToAndStop`'s second argument** — `true` means the first argument is a frame number; omit or pass `false` to treat it as milliseconds instead. Mixing these up causes the animation to jump to the wrong point.

## Common pitfalls

1. **Missing `exit` animations because there's no `<AnimatePresence>`** — React unmounts instantly by default; wrap the conditionally-rendered/list area in `AnimatePresence` and give each child a stable `key`.
2. **Changing a list item's `key` on every render** (e.g. using array index when the list reorders) — breaks `AnimatePresence`'s ability to track which item is entering/exiting, causing wrong or missing exit animations.
3. **Mixing `framer-motion` and `motion` imports in the same project** — pick one package and import path consistently; they're compatible in concept but are separate installs.
4. **Driving high-frequency animation through React state** instead of `useMotionValue`/`useTransform` — causes unnecessary re-renders and jank; use motion values for drag/scroll-linked effects.
5. **Forgetting `dragConstraints`** on a `drag`-enabled element — it will drag infinitely off-screen unless constrained to a ref or a bounds object.
6. **Expecting `layoutId` to animate across a full page navigation without both elements mounted** in the same `AnimatePresence`/render tree at some point — shared layout transitions need Motion to see both elements (even briefly) to interpolate between them.
7. **Using CSS `transition` alongside Motion's own transitions on the same property** — the two systems fight; let Motion own any property it's animating.

## Reference

- Official docs: https://motion.dev/docs
- React API reference: https://motion.dev/docs/react-quick-start
- Migration notes (Framer Motion → unified Motion): https://motion.dev/docs/react-upgrade-guide
- Lottie-web docs/builds: https://github.com/airbnb/lottie-web
- `lottie-react` docs: https://github.com/Gamote/lottie-react
