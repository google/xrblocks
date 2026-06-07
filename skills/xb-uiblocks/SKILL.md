---
name: xb-uiblocks
description: >-
  Build rich spatial UI with the uiblocks addon — flexbox-laid-out 3D cards/panels
  (`UICard`, `UIPanel`, `UIText`, `UIImage`, `UIIcon`) with gradients, strokes,
  rounded corners, drop/inner shadows, and spatial behaviors (head-leash, billboard,
  grab/manipulate, object-anchor). Use when you need web-like styling fidelity or
  real flexbox layout beyond the lightweight core `xb.SpatialPanel`. Requires
  `options.uikit.enable(uikit)` and the `@pmndrs/uikit` peer deps. The complete
  reference (styling rules, behaviors, gotchas, troubleshooting) lives at
  src/addons/uiblocks/SKILL.md.
---

# xb-uiblocks — rich flexbox spatial UI

uiblocks wraps `@pmndrs/uikit` (yoga flexbox) for styled 3D cards. Use it over the core
[`xb-ui`](../xb-ui/SKILL.md) `SpatialPanel` when you need flexbox layout, gradients, strokes,
or shadows. **Don't mix the two on one panel**, and never import `UIPanel`/`UICard` from
`xrblocks` core — they exist only in this addon.

> **Full reference** (UICard/UIPanel/UIText/UIImage/UIIcon props, behaviors, sizing gotchas,
> and a clicks/styling/sizing troubleshooting playbook):
> [`../../src/addons/uiblocks/SKILL.md`](../../src/addons/uiblocks/SKILL.md). Samples:
> `src/addons/uiblocks/samples/`.

## Setup

Needs the `@pmndrs/uikit` + yoga/troika peer deps in your importmap (see the addon
[README](../../src/addons/uiblocks/README.md)) and:

```js
const options = new xb.Options();
options.enableUI();
options.uikit.enable(uikit); // REQUIRED — registers the uikit renderer
```

## Quick start

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
    // REQUIRED for raycasting against uiblocks to work.
    if (xb.core.input.raycaster) {
      xb.core.input.raycaster.sortFunction = raycastSortFunction;
    }
    const card = this.uiCore.createCard({
      name: 'HelloCard',
      sizeX: 1.0,
      sizeY: 0.6,
      position: new THREE.Vector3(0, 1.5, -1),
      width: 'auto',
      alignItems: 'center', // shrink-wrap + center (see full ref §5.1)
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
```

## Top rules (see full reference for the rest)

- Borders that follow corners: use `strokeWidth`/`strokeColor`, **not** `borderWidth`/`borderColor`.
- Colors are hex strings (`'#ffffff'`) or `THREE.Color` — never `rgba()`/`hsla()`.
- No built-in button class: compose a `UIPanel` + child `UIText`/`UIIcon`/`UIImage`.
- One `UICard` per spatial pivot; partition complex layouts with child `UIPanel`s + flexbox.

## Designing complex, elegant spatial UI

For multi-section, polished interfaces, follow the **design guide in §6** of the full reference
([`../../src/addons/uiblocks/SKILL.md`](../../src/addons/uiblocks/SKILL.md)). The essentials:

- **Tokens first.** Fix a `pixelSize` (density), a small `fontSize`/`fontWeight` type scale, a
  spacing scale (`gap`/`padding` multiples of one unit), one–two `cornerRadius` values, and a
  restrained hex palette — then reuse them everywhere.
- **Compose, don't multiply.** Build the whole screen inside one `UICard`; partition into
  sections with nested `UIPanel`s + flexbox (`flexDirection`, `justifyContent`, `flexGrow`).
- **Elevation, not Z gaps.** Convey layering with `dropShadow*`, `innerShadow*`, and
  `strokeWidth`/`strokeColor` (shared `cornerRadius`) — avoid large literal `position.z` offsets.
- **Comfort + legibility.** Place at `xb.user.height` / `-xb.user.panelDistance`; keep opaque
  enough `fillColor` + a shadow/stroke to read over AR passthrough; size text for distance.
- **Purposeful motion & affordances.** `ToggleAnimationBehavior` for enter/exit, hover/press
  states for feedback, gentle `lerp` on `HeadLeashBehavior`/`BillboardBehavior`.
- **Grab & anchor.** `ManipulationBehavior({draggable, faceCamera, manipulationMargin})` with a
  header as the grab handle; `ObjectAnchorBehavior` (+ billboard) for contextual, object-attached UI.

See §6.7 of the full reference for a complete, styled settings-card example.
