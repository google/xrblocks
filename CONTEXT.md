# XR Blocks agent contract

XR Blocks is a WebXR SDK for AI and XR applications that also run in its
desktop simulator. Use this file as the compact authoring contract. Load the
manual page and executable example for the specific task instead of guessing
from subsystem names.

## Authority order

When sources disagree, use this order:

1. [`src/xrblocks.ts`](src/xrblocks.ts) and an addon's public entry define what
   application code can import.
2. Source TSDoc and generated declarations define signatures, defaults, return
   values, and lifecycle details.
3. [`docs/docs/manual/`](docs/docs/manual/) defines concepts, setup, behavior,
   limits, and current composition patterns.
4. [`templates/`](templates/) and [`samples/`](samples/) provide executable
   patterns. Prefer a focused template or sample over a large demo.
5. Consumer task skills define the process for completing a task. They are not
   API catalogs.

If a symbol is not exported by the intended public entry, it is internal.

## Application shape

```js
import * as THREE from 'three';
import * as xb from 'xrblocks';

class MainScript extends xb.Script {
  init() {
    this.add(new THREE.HemisphereLight(0xffffff, 0x666666, 3));
  }

  update() {
    // Per-frame application behavior.
  }

  dispose() {
    // Release owned GPU, listener, timer, media, and network resources.
  }
}

const options = new xb.Options();
xb.add(new MainScript());
await xb.init(options);
```

- Register scripts before `xb.init(options)`.
- Use engine-created objects only in or after `init()`.
- Put frame behavior in `update()`. XR Blocks owns the renderer, camera,
  animation loop, WebXR session, input resolution, and UI renderer.
- Configure permissions and optional subsystems before initialization.
- Use `formFactor: 'auto'` unless the application intentionally targets only
  one surface. `?formFactor=desktop` forces the simulator.

## Spatial and UI units

- World positions, model dimensions, placement offsets, and `UICard.size` use
  meters.
- Descendant UI layout numbers use UIKit layout units. Percent strings and
  `auto` are accepted where the property type permits them.
- Numeric `lineHeight` is a multiplier of `fontSize`. Use a `px` or percentage
  string for an explicit line height.
- Use `UICard` for world-space UI, `UIOverlay` for view-space UI, and `UIPanel`
  only as a nested layout group.
- Built-in UI starts automatically and participates in the normal interaction
  pipeline. There is no application UI enable call or second UI raycaster.

## Interaction vocabulary

XR Blocks resolves one hit for each source:

- `source`: the mouse, gaze, hand, or tracked-controller interaction source.
- `target`: the logical object that owns the behavior.
- `surface`: the public object representing the hit surface. Private renderer
  meshes are normalized to their public owner.
- `currentTarget`: the script currently receiving a bubbled callback.
- `intersection`: the resolved ray hit when the source still intersects the
  surface.

Use the event's resolved fields inside callbacks. Query
`xb.user.getRayIntersection()` only when code outside an event needs the current
hit. A reticle displays the resolved hit; it is not a second source of target
data.

Configure automatic manipulation through `object.xb.manipulation`. It supports
independent simultaneous object owners and two-source scale. Read
[Interaction](docs/docs/manual/Interaction.md) and
[Placement](docs/docs/manual/Placement.md) before implementing manipulation or
continuous placement.

## Security and runtime limits

- Never commit provider keys. URL keys and `keys.json` are local-prototype
  mechanisms only. Production applications use a server-controlled proxy or
  short-lived credentials.
- Camera, microphone, geolocation, depth, and world-sensing support depend on
  the browser and device. Declare required permissions before entering XR and
  provide visible unsupported, denied, pending, empty, and failure states.
- `three` is a peer dependency. Use one aligned version and one import-map or
  bundler dependency graph.
- The package uses private lazy-loaded chunks. Deploy the complete `build/`
  directory and do not import `build/internal/` files.

## Task workflows

The Codex plugin exposes five consumer workflows:

- `xb-build-app`
- `xb-add-spatial-ui`
- `xb-add-interactions`
- `xb-add-world-sensing`
- `xb-add-ai`

Repository contributors use `.agents/skills/xb-contribute-sdk`.
