---
name: uiblocks
description: >-
  Build rich spatial user interfaces in XR Blocks apps with the uiblocks addon —
  flexbox-laid-out 3D cards and panels with gradients, strokes, rounded corners,
  drop/inner shadows, MSDF text, material icons, images, and spatial behaviors
  (head-leash, billboard, grab/manipulate, object-anchor, show/hide animations).
  Use when authoring or debugging `UICard` / `UIPanel` / `UIText` / `UIImage` /
  `UIIcon` UI imported from `xrblocks/addons/uiblocks/src` (wrapping `@pmndrs/uikit`
  + yoga-layout) — for panels, menus, HUDs, dialogs, or any styled, web-like UI in
  WebXR / Android XR. Includes the bootstrap (`options.uikit.enable(uikit)` +
  `raycastSortFunction`), styling/layout rules, behavior config, and a
  troubleshooting playbook for clicks/styling/sizing failures. (For lightweight
  panels with no extra deps, prefer core `xb.SpatialPanel` instead.) Includes a design
  guide (§6) for UX designers composing complex, elegant, multi-section spatial UI —
  tokens, spatial comfort, elevation/shadows, passthrough legibility, motion, and
  grab/anchor behaviors.
---

# UIBlocks Skills Guide

This reference helps developers and AI agents build interactive spatial user interfaces in
`xrblocks` projects. `uiblocks` wraps the [`@pmndrs/uikit`](https://github.com/pmndrs/uikit)
Flexbox yoga-layout engine and Three.js, offering unified layout components, rich styling
(gradients, borders, shadows), and spatial behaviors.

> Only use APIs documented here or visible in the [`src/core/`](./src/core/) sources and the
> [`samples/`](./samples). uiblocks property names differ from CSS (e.g. `strokeWidth` not
> `borderWidth`, hex colors not `rgba()`); guessing CSS-like names is the most common cause of
> broken UI.

## 0. When to use uiblocks vs. core `xb.SpatialPanel`

The XR Blocks core ships a lighter UI system (`xb.SpatialPanel().addGrid().addRow()...`). Choose
deliberately — **do not mix the two on the same panel**, and never import `UIPanel`/`UICard`
from `xrblocks` core (they exist only in this addon).

| Use **core `xb.SpatialPanel`** when... | Use **uiblocks** when                                             |
| -------------------------------------- | ----------------------------------------------------------------- |
| Quick HUD, menu, or debug panel        | You need real flexbox layout (rows/columns, grow/shrink, gap)     |
| No extra dependencies wanted           | You need gradients, strokes, rounded corners, drop/inner shadows  |
| Simple text + buttons                  | You want web-like styling fidelity and reusable spatial behaviors |

## 1. Setup & Bootstrap

### 1.1 Import map & boilerplate

Configure the HTML import map to load `xrblocks` and `uiblocks` alongside their peer
dependencies (`@pmndrs/uikit`, `three`, `yoga-layout`, troika, signals). It must match the
versions in the canonical bootstrap sample exactly:

- **Bootstrap sample**: [samples/uiblocks/index.html](../../../samples/uiblocks/index.html)
- **Full import-map block & version notes**: [README.md](./README.md)

> [!NOTE]
> Adjust the relative paths of `uiblocks` and `xrblocks` in the import map for the depth of your
> implementation folder relative to the repository root.

### 1.2 Minimal quick start

The 80% case: create a `UICore` in your Script's constructor, wire the raycast sort in `init()`,
then build a `UICard` → `UIPanel` → elements. (Full version:
[samples/uiblocks/index.html](../../../samples/uiblocks/index.html).)

```js
import * as uikit from '@pmndrs/uikit';
import * as THREE from 'three';
import {UICore, UIPanel, UIText, raycastSortFunction} from 'uiblocks';
import * as xb from 'xrblocks';

class CustomScript extends xb.Script {
  constructor() {
    super();
    this.uiCore = new UICore(this);
  }

  init() {
    // REQUIRED for raycasting against uiblocks to work correctly.
    if (xb.core.input.raycaster) {
      xb.core.input.raycaster.sortFunction = raycastSortFunction;
    }

    const card = this.uiCore.createCard({
      name: 'HelloCard',
      sizeX: 1.0,
      sizeY: 0.6,
      position: new THREE.Vector3(0, 1.5, -1),
      width: 'auto', // shrink-wrap (see §5.1)
      alignItems: 'center',
    });

    const panel = new UIPanel({
      width: '100%',
      height: '100%',
      fillColor: '#1a1a24',
      cornerRadius: 20,
      padding: 30,
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
    });
    card.add(panel);
    panel.add(
      new UIText('Hello World', {
        fontSize: 32,
        fontWeight: 'bold',
        color: 'white',
      })
    );
  }
}

async function start() {
  const options = new xb.Options();
  options.enableUI();
  options.uikit.enable(uikit); // REQUIRED to register the uikit renderer
  xb.add(new CustomScript());
  await xb.init(options);
}
document.addEventListener('DOMContentLoaded', start);
```

## 2. Canvas Mounting & Lifecycle

### 2.1 UICore

Central entry point for the UI lifecycle. Automatically adds/removes cards from the parent
script group. Construct it with the owning Script: `new UICore(this)`.

- `createCard(config: UICardOutProperties): UICard`
- `createAdditiveCard(config: UICardOutProperties): AdditiveUICard`
- `unregister(card: UICard): void`
- `clear(): void`

### 2.2 UICard

A `UICard` is the physical spatial canvas in 3D space. It is grabbable by default if it has
behaviors attached.

- **Position & rotation**: `position: THREE.Vector3`, `rotation: THREE.Quaternion`.
- **Dimensions**: absolute bounds `sizeX` and `sizeY` (meters).
- **Resolution (`pixelSize`)**: physical size of exactly 1 flexbox pixel (default `0.002` m).
- **Anchors**: `anchorX` (`'left'|'right'|'center'|number`), `anchorY`
  (`'bottom'|'top'|'center'|number`) in local space.
- **Flexbox layout**: `UICard` inherits `@pmndrs/uikit`'s `Container` (via `ManipulationPanel`),
  so it supports `flexDirection`, `justifyContent`, `alignItems`, `gap`, `padding`, etc.

> [!TIP]
> For card mounting, sizing, anchoring, and density configs: [samples/basic/cards/](./samples/basic/cards/).

## 3. Primitives & Elements API

uiblocks primitives derive from `@pmndrs/uikit` classes, enhanced with spatial features.
Sources: [core source directory](./src/core/).

### 3.1 UIPanel

Generic layout container (like an HTML `<div>`) — the primary element for grouping, styling,
layout, and capturing interactions.

#### 3.1.1 Flexbox layout

Driven by the Yoga engine: `flexDirection: 'row' | 'column'`; `justifyContent` (primary axis);
`alignItems` (cross axis); `gap` / `padding` / `margin`; `flexGrow`, `flexShrink`, and
percent/absolute `width`/`height`. → [samples/basic/layouts/](./samples/basic/layouts/).

#### 3.1.2 Strokes, corners & shadows

- **Strokes (borders)**: `strokeWidth`, `strokeColor`, `strokeAlign: 'inside'|'outside'|'center'`.
- **Corner rounding**: `cornerRadius`.
- **Drop shadows**: `dropShadowColor` (color or gradient), `dropShadowBlur`,
  `dropShadowPosition` (`[x,y]` or `THREE.Vector2`), `dropShadowSpread`, `dropShadowFalloff`.
- **Inner shadows**: `innerShadowColor`, `innerShadowBlur`, `innerShadowPosition`,
  `innerShadowSpread`, `innerShadowFalloff`.

> [!IMPORTANT]
> **Anti-pattern:** never use CSS-like `borderWidth` / `borderColor` on `UIPanel` — they force a
> rigid rectangular border that ignores `cornerRadius`, producing sharp, non-rounded edges.
> **Correct:** use `strokeWidth` / `strokeColor`, which follow corner clipping.

#### 3.1.3 Linear/radial gradients

Fills (`fillColor`) and strokes (`strokeColor`) accept multi-stop gradient objects:
`gradientType: 'linear' | 'radial'`, `rotation` (degrees, linear), `stops: [{position, color}]`.
→ [samples/basic/panels/](./samples/basic/panels/).

#### 3.1.4 Interactions & reactivity

- **Hover**: `onHoverEnter`, `onHoverExit`.
- **Click/select**: `onClick` (fires when the controller trigger/select finishes on the panel).
- **Handler return type**: return `true` to mark the event handled and suppress downstream
  fallback clicks. → [samples/basic/interactions/](./samples/basic/interactions/).

### 3.2 UIText

Multi-channel signed distance field (MSDF) text.

- **Props**: `fontSize` (px), `fontWeight` (`'normal'|'bold'|number`), `color`, `textAlign`
  (`'left'|'right'|'center'`), `maxWidth`, `lineHeight`.
- **Methods**: `setText(text)`, `setFontSize(size)`, `setColor(color)`, `setOpacity(opacity)`.

### 3.3 UIImage

Static 2D images/textures.

- **Methods**: `setSrc(src: string | THREE.Texture)`, `setColor(color)`, `setOpacity(opacity)`,
  `setBorderRadius(radius)`.

### 3.4 UIIcon

Reactive Material Design vector icon loader (queries CDN repositories).

- **Props**: `icon` (snake_case, e.g. `'star'`), `iconStyle` (`'outlined'|'rounded'|'sharp'`),
  `iconWeight` (100–700), `iconFill` (0 or 1).
- **Methods**: `setIcon(icon)`, `setIconStyle(style)`, `setIconWeight(weight)`,
  `setIconFill(fill)`, `setColor(color)`.

> [!TIP]
> Text/image/icon examples: [samples/basic/elements/](./samples/basic/elements/).

## 4. Spatial Behaviors

Behaviors extend `UICardBehavior` and attach to cards via the `behaviors: [...]` array on
`createCard`, to manage positioning relative to the camera, controllers, or other objects.

- **HeadLeashBehavior** — card gently follows the camera. `offset: THREE.Vector3`,
  `posLerp` (default `0.1`), `rotLerp` (default `0.1`).
- **BillboardBehavior** — card faces the camera. `mode: 'cylindrical' | 'spherical'`
  (cylindrical locks to Y), `lerpFactor`.
- **ManipulationBehavior** — 3DOF grabbable drag via controller rays. `draggable`,
  `faceCamera`, `manipulationMargin` (px), `manipulationCornerRadius`.
- **ObjectAnchorBehavior** — lock pose to another `THREE.Object3D`. `target`,
  `mode: 'position' | 'rotation' | 'pose'`, `positionOffset`, `rotationOffset`.
- **ToggleAnimationBehavior** — scale animations on show/hide/toggle. `showAnimation: 'scale'`,
  `hideAnimation: 'scale'`, `duration` (s).

> [!TIP]
> Attaching/configuring behaviors: [samples/basic/behaviors/](./samples/basic/behaviors/).

## 5. Gotchas & Best Practices

### 5.1 Default sizing & flex centering

`uiCore.createCard()` defaults the root box to `200` layout px with `alignItems: 'stretch'`.

- **Quirk**: a nested child with `maxWidth` < 200 aligns to the left edge, not center.
- **Fix**: pass `width: 'auto'` and `alignItems: 'center'` to `createCard()` to shrink-wrap and
  center on the card pivot.

### 5.2 SVG asset color tinting

When tinting a `UIImage` via `color`, the SVG source must use pure white (`fill="#FFFFFF"` /
`stroke="#FFFFFF"`). Hardcoded greys multiply with the overlay and darken the tint.

### 5.3 Creating buttons

There is no built-in "button" class. Compose one: a `UIPanel` container (dimensions, background,
interaction hooks) with a `UIText` / `UIIcon` / `UIImage` child. See the
[interactions sample](./samples/basic/interactions/).

### 5.4 Multi-section layouts

- **Typical**: one centered section under one `UICard` (`width: 'auto'`, `alignItems: 'center'`).
- **Complex** (sidebar / header / grid under one pivot):
  - **One canvas**: do **not** spawn a `UICard` per section — it is costly and causes spatial
    drift. Use a single card.
  - **Partition with flexbox**: set layout on the root card (e.g. `flexDirection: 'row'`,
    `gap: 20`, `padding: 40`) and add child `UIPanel`s as sections.
  - **Proportions**: scale sections with `flexGrow` or percentage `width`/`height`.

## 6. Designing complex & elegant spatial UI

For designers composing rich, multi-section interfaces. Design with a **2D flexbox mindset,
composed into 3D space**: each `UICard` is a flat canvas you lay out with `UIPanel`s and flexbox,
then place, anchor, and animate as an object in the world.

> Golden rule: **one `UICard` per spatial pivot; express structure with nested `UIPanel`s +
> flexbox** (§5.4). Multiple cards drift apart and depth-sort against each other; one card stays
> crisp and coherent.

### 6.1 Establish a design-token scale

Elegance at a distance comes from consistency. Fix a small token system up front and reuse it:

- **Density (`pixelSize`)** — meters per layout pixel of a card (default `0.002`). Set it once
  per card and size all children in layout pixels against it. Lower = crisper/denser (text-heavy
  panels); higher = chunkier (glanceable HUDs). Keep it constant across a screen so type and
  spacing read uniformly.
- **Type scale** — a few `fontSize` steps (e.g. 40 / 28 / 20) plus `fontWeight` for emphasis.
- **Spacing scale** — multiples of one base unit for `gap` / `padding` / `margin` (e.g. 8 →
  8/16/24/40). Consistent rhythm is what makes a layout feel designed.
- **Shape scale** — one or two `cornerRadius` values, reused on the card and nested panels.
- **Palette** — a restrained hex set (surface, surface-variant, accent, text, text-muted).
  Gradients for depth, sparingly; strokes for emphasis.

### 6.2 Place for comfort and readability

- Anchor primary panels near eye height and arm's length:
  `position.set(0, xb.user.height, -xb.user.panelDistance)`. Keep the whole card within a relaxed
  field of view — wide dashboards should curve toward the user, not force head-turning.
- Size text for distance: at ~1.5–1.75 m, body text around `fontSize: 20–28` with a sensible
  `pixelSize` reads comfortably. Verify in the simulator, then on device.
- For **persistent HUDs**, attach a `HeadLeashBehavior` with gentle `posLerp`/`rotLerp` (~0.1) so
  the panel trails the gaze smoothly instead of snapping. For **world-placed** panels, a
  `BillboardBehavior` (`'cylindrical'` keeps text upright) keeps them legible from any angle.
- Don't spawn panels inside `xb.user.safeSpaceRadius`.

### 6.3 Express hierarchy with elevation, not big Z gaps

Large literal Z offsets between sibling surfaces cause uncomfortable parallax and depth-fighting.
Convey layering the way good 2D material design does — with light and edges:

- **Drop shadows** (`dropShadowColor/Blur/Spread/Position`) lift a surface above its background.
- **Inner shadows** carve recessed wells (input fields, track grooves).
- **Strokes** (`strokeWidth`/`strokeColor`, never `borderWidth`) separate adjacent surfaces and
  emphasize the active element.
- Tiny `position.z` nudges (≈0.001) only to resolve coplanar z-fighting — not for visual depth.

A surface reads cleanly as fill → stroke → shadow, with `cornerRadius` shared so shadows follow
the corners.

### 6.4 Stay legible over passthrough

In AR the panel sits over the unpredictable real world. To stay elegant _and_ readable:

- Use sufficiently opaque `fillColor` (high alpha) for surfaces carrying text — translucent glass
  looks great on a clean wall and unreadable over clutter.
- Add a subtle drop shadow and/or stroke so the card edge separates from any background.
- Keep strong text/background contrast; prefer one `text` + one `text-muted` over many greys.
- Gradient fills add depth, but check contrast at **both** ends of the gradient.

### 6.5 Make motion and state purposeful

- **Enter/exit**: a `ToggleAnimationBehavior` (`showAnimation: 'scale'`, `duration` ~0.2 s) makes
  panels appear/dismiss with a quick scale instead of popping.
- **Affordance**: give interactive panels visible hover/press states via `onHoverEnter` /
  `onHoverExit` (brighten `fillColor`, grow `strokeWidth`) and act on `onClick`.
- **Restraint**: animate one or two properties, briefly. Smooth `lerp` on leash/billboard reads
  as "organic"; everything bouncing reads as noise.

### 6.6 Grabbing and contextual anchoring

- Make a card movable with `ManipulationBehavior({draggable: true, faceCamera: true})`. Give it a
  `manipulationMargin` (px) so users grab the **frame** without hitting inner controls, and match
  `manipulationCornerRadius` to the card's `cornerRadius`. A title/header row doubles as a natural
  grab handle.
- Attach UI to a real or virtual object with `ObjectAnchorBehavior({target, mode: 'pose'})` for
  labels and contextual menus; pair with a `BillboardBehavior` so the label stays readable. Anchor
  - `ManipulationBehavior` combine (anchored, still nudgeable).

### 6.7 Worked example — an elegant settings card

Header / scrollable body / footer-actions in a single card: tokens applied, elevation via stroke

- shadow, draggable, animated in.

```js
import {
  UICore,
  UIPanel,
  UIText,
  UIIcon,
  ManipulationBehavior,
  ToggleAnimationBehavior,
} from 'uiblocks';

const SURFACE = '#16181d',
  SURFACE_2 = '#1f232b',
  ACCENT = '#4285f4',
  TEXT = '#f5f7fa';

const card = this.uiCore.createCard({
  name: 'Settings',
  sizeX: 0.9,
  sizeY: 0.62,
  pixelSize: 0.0016, // crisp at arm's length
  position: new THREE.Vector3(0, xb.user.height, -xb.user.panelDistance),
  width: 'auto',
  behaviors: [
    new ManipulationBehavior({
      draggable: true,
      faceCamera: true,
      manipulationMargin: 24,
      manipulationCornerRadius: 28,
    }),
    new ToggleAnimationBehavior({
      showAnimation: 'scale',
      hideAnimation: 'scale',
      duration: 0.18,
    }),
  ],
});

// Root surface: shared cornerRadius + stroke + drop shadow = one elevated panel.
const root = new UIPanel({
  width: '100%',
  height: '100%',
  flexDirection: 'column',
  fillColor: SURFACE,
  cornerRadius: 28,
  padding: 28,
  gap: 16,
  strokeWidth: 1,
  strokeColor: '#33384a', // subtle light-on-dark edge (6-digit hex is always supported)
  strokeAlign: 'inside',
  dropShadowColor: '#000000',
  dropShadowBlur: 24,
  dropShadowSpread: 2,
});
card.add(root);

// Header (also the grab handle): icon + title on one row.
const header = new UIPanel({
  width: '100%',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 12,
});
header.add(new UIIcon({icon: 'settings', iconStyle: 'rounded', color: ACCENT}));
header.add(
  new UIText('Settings', {fontSize: 30, fontWeight: 'bold', color: TEXT})
);
root.add(header);

// Body: a recessed well (inner shadow) that grows to fill the remaining height.
const body = new UIPanel({
  width: '100%',
  flexGrow: 1,
  flexDirection: 'column',
  gap: 10,
  padding: 16,
  fillColor: SURFACE_2,
  cornerRadius: 18,
  innerShadowColor: '#000000',
  innerShadowBlur: 12,
});
body.add(
  new UIText('Display, audio, and account preferences...', {
    fontSize: 20,
    color: '#aab2c0',
    maxWidth: 480,
  })
);
root.add(body);

// Footer: actions pushed to the edges with justifyContent.
const footer = new UIPanel({
  width: '100%',
  flexDirection: 'row',
  justifyContent: 'space-between',
  gap: 12,
});
// Compose each action as a UIPanel + UIText/UIIcon child (§5.3).
root.add(footer);
```

> [!TIP]
> Study the assembled patterns in [`samples/basic/cards/`](./samples/basic/cards/),
> [`samples/basic/panels/`](./samples/basic/panels/), and
> [`samples/basic/behaviors/`](./samples/basic/behaviors/) — they show density, gradients,
> shadows, and behavior combinations end-to-end.

## 7. Troubleshooting & Developer Dialog Guide

When a developer reports UI not rendering, wrong styling, or interactions not firing, **first
investigate the code** (read the files, grep) before asking questions. Only ask for what code
cannot reveal (simulator/headset visuals, console logs, design intent).

### Dialog rules

- **Request screenshots** when a visual issue can't be explained from code.
- **Escalate library limitations**: if the root cause looks like a `uiblocks` bug/limitation
  (not developer setup), **stop debugging**, summarize the developer's goal and the suspected
  gap, and tell them: _"I suspect this is a limitation of the current uiblocks library. Please
  share the summary below with the core engineering team for support."_

### 7.1 Interaction & input failures

Clicks/selections/hovers not triggering. Self-check:

1. In the Script's `init()`, verify `xb.core.input.raycaster.sortFunction = raycastSortFunction`
   is assigned.
2. In bootstrap (`main.js` / `index.html`), verify `options.enableUI()` **and**
   `options.uikit.enable(uikit)` are called.
3. Ensure `pointerEvents: 'none'` is not set on the target.
4. Check the hierarchy under the `UICard` for overlapping siblings physically masking the
   interactive element.

### 7.2 Styling & render failures

Shadows / strokes / corners not rendering. Self-check:

1. Verify `strokeWidth`/`strokeColor` are used instead of `borderWidth`/`borderColor`.
2. Verify shadow blurs (`dropShadowBlur`, `innerShadowBlur`) are non-zero.
3. Add small Z offsets on nested elements (e.g. `transformTranslateZ` or `position.z = 0.001`) to
   rule out Z-fighting.
4. Verify colors are hex strings (`'#ffffff'`/`'#fff'`) or `THREE.Color` — **not** `rgba(...)` /
   `hsla(...)`.
   - _Ask only if code checks pass_: "Are your colors hex strings? If using rgba/hsla, convert
     them to hex or `THREE.Color`."

### 7.3 Sizing & flexbox failures

Elements squished to zero, overflowing, or misaligned. Self-check:

1. Verify the parent `UICard` dimensions (`sizeX`/`sizeY` or `width`/`height`).
2. Check the card uses `width: 'auto'` + `alignItems: 'center'` to avoid default stretching.
3. Inspect `pixelSize` so child pixel measurements map correctly.
   - _Ask only if code checks pass_: target physical dimensions (m) and `pixelSize`; expected
     child pixel dims / padding / margins / alignment; any design spec (e.g. Figma) to match.
