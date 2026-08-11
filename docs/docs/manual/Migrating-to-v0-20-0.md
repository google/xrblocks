---
sidebar_position: 1.5
---

# Migrating to v0.20.0

## Overview

XR Blocks now has one interaction pipeline and one built-in spatial UI system.
This is a breaking migration. The SDK does not provide compatibility aliases
for the removed UI, UIBlocks, reticle, drag, or `Script.ux` APIs.

The main changes are:

- Spatial UI components are exported from `xrblocks`. UIBlocks is not a
  separate application API.
- Applications do not enable UI, create `UICore`, configure UIKit, or install
  a second UI raycaster.
- `UICard` and `UIOverlay` are the two UI roots. Their descendants use retained
  flex layout.
- Mouse, gaze, hand rays, controller rays, direct touch, reticles, semantic UI,
  and manipulation use one resolved target.
- `event.target` is the logical target. Read the physical input from
  `event.source.controller`.
- Targeted events use `event.stopPropagation()`. Returning `true` does not stop
  propagation.
- Object hit, reticle, and manipulation settings live in the optional
  `Object3D.xb` namespace.
- `DragManager`, `DragMode`, and `Script.ux` are removed. Use automatic
  manipulation, interaction events, and `xb.user` queries.
- `Core.dispose()` is asynchronous and terminal.
- The main ESM bundle loads private chunks from `build/internal/`. Deploy the
  complete build output.

The public export boundary is [`src/xrblocks.ts`](../../../src/xrblocks.ts). The
current UI export family is in [`src/ui/index.ts`](../../../src/ui/index.ts). Do not
call a symbol unless it is exported from a public entry.

## Recommended migration order

1. Update package dependencies, import maps, and deployed build files.
2. Remove old UI and UIKit setup.
3. Replace legacy UI trees with `UICard` or `UIOverlay` trees.
4. Update interaction event fields and propagation.
5. Replace drag and `Script.ux` state with `Object3D.xb` and `xb.user`.
6. Replace reticle filters and old interaction options.
7. Update `ModelViewer`, placement behavior, and addon integrations.
8. Await disposal and test cancellation paths.

## 1. Update dependencies and deployment

### npm applications

Keep `three` aligned with the version in [`package.json`](../../../package.json).
Install the peer packages used by the built-in UI and simulator browser UI:

```bash
npm install xrblocks three @pmndrs/uikit @preact/signals-core lit
```

Install `three-pathfinding` only when the simulator navmesh feature needs it.
Other features can require their own optional packages. See
[`docs/docs/manual/Integrations.mdx`](./Integrations.mdx).

Remove application imports from `uiblocks` and direct UIKit configuration:

```ts
// Remove.
import * as uikit from '@pmndrs/uikit';
import {UICard, UICore, UIPanel} from 'uiblocks';
```

Import public UI components from the main package:

```ts
import * as xb from 'xrblocks';
import {
  UIButton,
  UICard,
  UIIcon,
  UIImage,
  UIOverlay,
  UIPanel,
  UISlider,
  UIText,
} from 'xrblocks';
```

### Browser import maps

Browser applications must map the bare module specifiers used by the selected
features. For built-in UI, this includes:

- `@pmndrs/uikit`
- `@pmndrs/uikit-pub-sub`
- `@pmndrs/msdfonts`
- `@preact/signals-core`
- `yoga-layout/load`

Map `lit` and `lit/` when the simulator browser UI is used. Copy the current,
version-aligned mappings from `templates/01_spatial_ui/index.html` or
[`rollup.config.js`](../../../rollup.config.js). Application code must not import
these modules to configure XR Blocks. They are renderer dependencies.

Map both `lit` and the `lit/` prefix to the same release. Remove older mixed
CDN mappings such as a `lit-core.min.js` entry paired with a different `lit/`
release. Pages that load Lit through the import map can suppress its bundle
notice before the import map:

```html
<script>
  window.litDisableBundleWarning = true;
</script>
```

The simulator is part of the main XR Blocks runtime. Remove the old simulator
side-effect import:

```ts
// Remove.
import 'xrblocks/addons/simulator/SimulatorAddons.js';
```

That addon entry no longer exists and returns 404 when a migrated application
tries to load it.

### Build output

The SDK build is code-split:

```text
build/
├── xrblocks.js
├── xrblocks.min.js
└── internal/
    └── private runtime chunks
```

Copy and serve the complete `build/` directory. Do not deploy only
`xrblocks.js`. Do not import a file from `build/internal/`; chunk names and
contents are private.

## 2. Remove old UI setup

Before:

```ts
import * as uikit from '@pmndrs/uikit';
import {UICore, raycastSortFunction} from 'uiblocks';

const options = new xb.Options();
options.enableUI();
options.uikit.enable(uikit);
xb.core.input.raycaster.sortFunction = raycastSortFunction;

const ui = new UICore(this);
```

After:

```ts
const options = new xb.Options();

const card = new xb.UICard({
  size: {width: 0.6, height: 0.32},
  children: [new xb.UIText({text: 'Ready'})],
});
this.add(card);
```

Remove all uses of:

- `Options.enableUI()`
- `Options.uikit` and `UIKitOptions`
- `uikit.enable(...)`
- `UICore`
- `raycastSortFunction`
- manual UI hit registration
- manual UI renderer updates

XR Blocks finds UI roots in the scene, starts the private renderer, and maps
private hit geometry back to public UI objects.

## 3. Build the current spatial UI tree

### Choose the correct root

| Class       | Coordinate space | Purpose                                              |
| ----------- | ---------------- | ---------------------------------------------------- |
| `UICard`    | World space      | Menus, tools, labels, and movable spatial surfaces   |
| `UIOverlay` | View space       | HUDs, instructions, and viewport-fixed controls      |
| `UIPanel`   | Parent UI layout | Rows, columns, sections, and passive visual grouping |

`UIPanel` is not a root. Put it inside a `UICard` or `UIOverlay`. A card's
Three.js transform controls its world pose. An overlay's world transform has
no rendering effect.

All UI elements are `Script` and `THREE.Object3D` instances. Build the tree
with constructors, `children`, `.add()`, and `.remove()`. UI elements accept UI
children. A `UICard` also accepts direct `TransformScript` children.

### Constructor and retained-update example

```ts
const status = new xb.UIText({
  text: 'Ready',
  style: {fontSize: 28, color: '#ffffff'},
});

const retry = new xb.UIButton({
  label: 'Retry',
  onClick: () => runAgain(),
  style: {
    width: 180,
    height: 64,
    backgroundColor: '#246bfd',
    borderRadius: 12,
    ':hover': {backgroundColor: '#397cff'},
    ':active': {backgroundColor: '#1758da'},
    ':disabled': {opacity: 0.45},
  },
});

const content = new xb.UIPanel({
  style: {
    width: '100%',
    height: '100%',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    padding: 24,
  },
  children: [status, retry],
});

const card = new xb.UICard({
  size: {width: 0.6, height: 0.32},
  children: [content],
});
card.position.set(0, 1.4, -1.2);
this.add(card);

status.text = 'Complete';
retry.disabled = true;
retry.style.backgroundColor = '#315274';
card.size.width = 0.7;
```

Constructors use one options object:

```ts
new xb.UIText({text: 'Hello', style: {fontSize: 24}});
new xb.UIImage({src: texture, style: {width: 160, height: 120}});
new xb.UIIcon({icon: 'check', style: {width: 40, height: 40}});
```

Do not use positional forms such as `new UIText('Hello', options)`.

### Move layout and appearance under `style`

| Old field or method                   | Current field                         |
| ------------------------------------- | ------------------------------------- |
| `width`, `height`                     | `style.width`, `style.height`         |
| `fillColor` or `setFillColor()`       | `style.backgroundColor`               |
| `color` or `setColor()`               | `style.color`                         |
| `cornerRadius` or `setBorderRadius()` | `style.borderRadius`                  |
| `strokeColor`                         | `style.borderColor`                   |
| `strokeWidth`                         | `style.borderWidth`                   |
| `setOpacity()`                        | `style.opacity`                       |
| flex, spacing, font, overflow         | the same concept under `style`        |
| manual hover and pressed setters      | `style[':hover']`, `style[':active']` |
| manual disabled styling               | `style[':disabled']` plus `disabled`  |

`UICard.size` and world transforms use meters. Descendant numeric style values
use UI layout units. Percent strings and `'auto'` are supported only where the
`UIStyle` type permits them. Unknown keys and invalid values throw.

### Use semantic controls

Use `UIButton` instead of a handmade clickable panel:

```ts
const save = new xb.UIButton({
  label: 'Save',
  icon: 'save',
  onClick: persist,
});
```

A button activates after a valid press and release on the same button. A
disabled button does not activate. A button with custom children needs an
`ariaLabel`. Do not combine custom UI children with the `label` or `icon`
convenience fields.

Use `UISlider` for a horizontal semantic slider:

```ts
const volume = new xb.UISlider({
  ariaLabel: 'Volume',
  min: 0,
  max: 1,
  step: 0.05,
  value: 0.5,
  onInput: (value) => previewVolume(value),
  onChange: (value) => saveVolume(value),
  style: {width: 280, height: 48},
});
```

`onInput` runs as a captured value changes. `onChange` runs once after a
changed interaction completes. Cancellation restores the starting value.
Programmatic `slider.value` changes do not call these callbacks.

### Configure card manipulation and edges

`manipulation: true` gives a card face-camera translation and two-source scale.
An edge requires translation. The edge does not enable missing actions.

```ts
const card = new xb.UICard({
  size: {width: 0.7, height: 0.4},
  manipulation: true,
  edge: {translateFromSurface: true},
});
```

Use `edge: true` when translation must start only from the edge. Use
`translateFromSurface: true` when the card surface can also start translation.
There is no `edge.scale` option.

### Use overlays for view-fixed UI

```ts
const overlay = new xb.UIOverlay({
  appearance: 'none',
  style: {
    width: 360,
    position: 'absolute',
    left: '50%',
    bottom: 24,
    transform: {translateX: '-50%'},
  },
  children: [new xb.UIButton({label: 'Menu', onClick: openMenu})],
});
this.add(overlay);
```

### Update themes through the public settings object

Choose a built-in preset:

```ts
xb.ui.theme = 'glimmer';
```

The presets are `grayGlass`, `colorful`, `glimmer`, `glimmerOpaque`,
`glimmerAmber`, and `glimmerGreen`.

Use `setTheme()` for a partial update:

```ts
xb.ui.setTheme({
  colors: {primary: '#ff6b6b'},
  borderRadius: 18,
});
```

Theme snapshots are immutable. Do not mutate `xb.ui.theme.colors` or another
nested theme field directly.

After the renderer completes a frame, validate one root or all roots:

```ts
const report = xb.ui.validate(card);
if (!report.ok) console.table(report.issues);
```

### Legacy UI replacement table

| Removed API                                                             | Current replacement                                     |
| ----------------------------------------------------------------------- | ------------------------------------------------------- |
| `UI.compose`, `UI.registerComponent`, `UIJsonNode`                      | constructors, `children`, and `.add()`                  |
| `View`, `Panel`, `PanelMesh`                                            | `UICard`, `UIOverlay`, and `UIPanel`                    |
| `Grid`, `Row`, `Col`                                                    | `UIPanel` flex styles                                   |
| `SpatialPanel`                                                          | `UICard` with `UIPanel` content                         |
| `TextView`, `LabelView`, scrolling text views                           | `UIText` with overflow styles or application state      |
| `ImageView`                                                             | `UIImage`                                               |
| `IconView`, `MaterialSymbolsView`                                       | `UIIcon`                                                |
| `TextButton`, `IconButton`, `ExitButton`                                | `UIButton` with an explicit callback                    |
| `FreestandingSlider`                                                    | `UISlider`                                              |
| `Pager`, `HorizontalPager`, `VerticalPager`, `PageIndicator`, `Orbiter` | application state and normal panel composition          |
| `VideoView`, `SketchPanel`                                              | application-owned Three.js surfaces; no direct UI class |
| `UICore` and UIBlocks behavior classes                                  | Core lifecycle, manipulation, and placement scripts     |
| UIBlocks signals and `setProperties()`                                  | direct public properties and nested `style`             |

## 4. Move object interaction settings under `Object3D.xb`

Importing XR Blocks augments `THREE.Object3D` with an optional `xb` field:

```ts
object.xb = {
  pointerEvents: 'auto',
  interactionEnabled: true,
  reticleMode: 'auto',
  manipulation: false,
  manipulationHandle: 'none',
};
```

| Field                   | Values                            | Effect                                                         |
| ----------------------- | --------------------------------- | -------------------------------------------------------------- |
| `xb.pointerEvents`      | `'auto'`, `'none'`                | Includes or excludes the complete object branch from hit tests |
| `xb.interactionEnabled` | boolean                           | Stops logical targeting from continuing past this boundary     |
| `xb.reticleMode`        | `'auto'`, `'surface'`, `'hidden'` | Changes reticle presentation without changing callbacks        |

Replace `ignoreReticleRaycast` according to its real intent:

```ts
// The helper branch must not block pointer hits.
helper.xb = {...helper.xb, pointerEvents: 'none'};

// The surface can block a ray, but parent scripts must not become targets.
wall.xb = {...wall.xb, interactionEnabled: false};

// Interaction stays active, but the reticle is hidden.
target.xb = {...target.xb, reticleMode: 'hidden'};
```

Do not add these fields as loose properties on `Object3D`.

## 5. Update interaction events

### Read the target and input from the correct fields

Before:

```ts
onObjectSelectStart(event) {
  const controller = event.target;
}
```

After:

```ts
onObjectSelectStart(event: xb.SelectEvent): void {
  const controller = event.source.controller;
  const sourceType = event.source.type;
  const selectedObject = event.target;
  const hitSurface = event.surface;
  const receivingScript = event.currentTarget;
  const currentHit = event.intersection;

  event.stopPropagation();
}
```

`InteractionSource.type` is `mouse`, `controller-ray`, `hand-ray`,
`direct-touch`, `gaze`, or `simulator`. `handedness` is `left`, `right`, or
`none`.

| Event                   | Important fields                                                            |
| ----------------------- | --------------------------------------------------------------------------- |
| `SelectEvent`           | `source`, optional `target`, `surface`, `currentTarget`, and `intersection` |
| `SelectEndEvent`        | select fields plus `completed` and `reason`                                 |
| `LongSelectEvent`       | select fields plus `duration`                                               |
| `HoverEvent`            | select fields with the current optional `intersection`                      |
| `ObjectTouchStartEvent` | touch fields plus `preventDefault()`                                        |
| `ObjectTouchEvent`      | `source`, `target`, `surface`, `handIndex`, `hand`, `touchPosition`         |
| `ObjectGrabEvent`       | touch fields with a required `hand`                                         |
| `ManipulationEvent`     | phase, action, owner, sources, target, surface, and action-specific values  |

An intersection is present only while the ray still hits the captured surface.
Use optional access after a release outside the target.

### Replace return-value propagation

Targeted callbacks bubble from the nearest `Script` toward ancestor scripts.
Call `event.stopPropagation()` to stop later ancestors:

```ts
onHoverEnter(event: xb.HoverEvent): void {
  this.showHover();
  event.stopPropagation();
}
```

Do not return `true`. Global callbacks still run independently.

### Handle selection completion and cancellation

`SelectEndEvent.reason` is `released`, `released-outside`, `source-lost`,
`pointer-cancel`, `removed`, `hidden`, or `disabled`.

```ts
onObjectSelectEnd(event: xb.SelectEndEvent): void {
  if (event.completed) this.activate();
  else this.cancelPreview(event.reason);
}
```

Use `onSelect` for a global completed selection. Use `onLongSelect` or
`onObjectLongSelect` for a held selection. Set the delay with
`options.interaction.longSelectDuration`. A manipulation capture does not also
emit long-select.

### Separate propagation from default behavior

`event.stopPropagation()` stops ancestor callbacks. `event.preventDefault()`
suppresses a framework default action. They are not interchangeable.

Direct touch starts selection by default. Keep touch callbacks but suppress
that selection when needed:

```ts
onObjectTouchStart(event: xb.ObjectTouchStartEvent): void {
  event.preventDefault();
  this.showContactFeedback();
  event.stopPropagation();
}
```

The engine selects one ordered touch target. Do not depend on callbacks from
every overlapping mesh.

## 6. Replace `DragManager` with automatic manipulation

### Configure the owner

```ts
object.xb = {
  ...object.xb,
  manipulation: {
    actions: {
      translate: {faceCamera: true, mode: 'cylindrical', smoothing: 0.1},
      rotate: {axis: 'y', space: 'world', sensitivity: 1},
      scale: {minScale: 0.25, maxScale: 4},
    },
    handle: {action: xb.ManipulationAction.Translate},
  },
};
```

`manipulation: true` enables Translate and Scale and uses Translate as the
surface action. The action values are `translate`, `rotate`, `scale`, and
`none`, also available through `ManipulationAction`.

### Use child handles for specific actions

```ts
moveHandle.xb = {
  manipulationHandle: {action: xb.ManipulationAction.Translate},
};

rotateHandle.xb = {
  manipulationHandle: {action: xb.ManipulationAction.Rotate},
};

decorativeChild.xb = {manipulationHandle: 'none'};
```

A handle selects an enabled action on the nearest manipulation owner. It does
not enable that action.

### Replace legacy drag fields

| Removed                  | Current replacement                   |
| ------------------------ | ------------------------------------- |
| `DragManager`            | engine-owned automatic manipulation   |
| `DragMode.TRANSLATING`   | `ManipulationAction.Translate`        |
| `DragMode.ROTATING`      | `ManipulationAction.Rotate`           |
| `DragMode.SCALING`       | `ManipulationAction.Scale`            |
| `draggable`              | `xb.manipulation` owner configuration |
| `draggingMode`           | `xb.manipulationHandle.action`        |
| `dragFacingCamera`       | `actions.translate.faceCamera`        |
| `Script.ux.isDragging()` | `xb.user.isManipulating(object)`      |

### Replace the automatic transform when necessary

```ts
onObjectManipulate(event: xb.ManipulationEvent): void {
  if (event.phase === 'start') event.preventDefault();

  if (
    event.phase === 'update' &&
    event.action === xb.ManipulationAction.Translate
  ) {
    this.position.copy(event.position);
  }

  event.stopPropagation();
}
```

Call `preventDefault()` during `start`. The choice applies to the complete
action phase. The event phases are `start`, `update`, `end`, and `cancel`.

Different sources can manipulate different owners at the same time. A second
free spatial source can join one scale-enabled owner for two-source scale. Do
not keep one application-wide `draggedObject` slot.

## 7. Replace `Script.ux` and reticle-owned state

Use interaction events during callbacks. Use `xb.user` for current state
outside an event:

```ts
const ray = xb.user.getRay(0);
const hit = xb.user.getRayIntersection(0);
const objectHit = xb.user.getIntersectionAt(object, 0);

const pointing = xb.user.isPointingAt(object);
const selecting = xb.user.isSelectingAt(object);
const manipulating = xb.user.isManipulating(object);
```

For built-in UI hits, `intersection.object` is the public UI object, not a
private renderer mesh.

| Removed or changed                          | Current replacement                                |
| ------------------------------------------- | -------------------------------------------------- |
| `user.getReticleDirection(id)`              | `user.getRay(id).direction`                        |
| `user.getReticleTarget(id)`                 | `user.getRayIntersection(id)?.object`              |
| `user.getReticleIntersection(id)`           | `user.getRayIntersection(id)`                      |
| `Script.ux.positions`, `.uvs`, `.distances` | event data or `user.getIntersectionAt()`           |
| `Script.ux.isHovered()`                     | `user.isPointingAt(object)`                        |
| `Script.ux.isSelected()`                    | `user.isSelectingAt(object)`                       |
| `Script.ux.isDragging()`                    | `user.isManipulating(object)`                      |
| `input.intersectionsForController`          | `User` queries or an application `THREE.Raycaster` |

The old XR Blocks `Raycaster` class is not exported from the package root.

## 8. Update interaction and reticle options

| Before                                               | Current option                                                  |
| ---------------------------------------------------- | --------------------------------------------------------------- |
| `options.controllers.performRaycastOnUpdate = true`  | `options.interaction.raycastMode = 'continuous'`                |
| `options.controllers.performRaycastOnUpdate = false` | `options.interaction.raycastMode = 'select'`                    |
| `options.reticles.defaultDistance`                   | `options.reticles.defaultRenderDistance`                        |
| no shared long-select option                         | `options.interaction.longSelectDuration`                        |
| `showReticleOnDepthMesh(true)`                       | `options.reticles.projectOnDepthMesh = true` before `xb.init()` |

Example:

```ts
const options = new xb.Options();
options.enableReticles();
options.enableDepth();
options.interaction.raycastMode = 'continuous';
options.interaction.longSelectDuration = 0.75;
options.reticles.projectOnDepthMesh = true;
options.reticles.maxDistance = 6;
options.reticles.defaultRenderDistance = 0;
```

`maxDistance` limits reticle drawing. It does not limit target resolution.
`defaultRenderDistance = 0` hides a reticle when no valid hit exists.

## 9. Replace UI behavior classes with placement scripts

Add a placement script as a direct child of the object it moves:

```ts
card.add(
  new xb.FollowHead({
    offset: new THREE.Vector3(0, -0.1, -1.2),
    smoothing: 0.1,
  }),
  new xb.FaceCamera({mode: 'spherical', smoothing: 0.1})
);
```

| Current script         | Purpose                                      |
| ---------------------- | -------------------------------------------- |
| `FollowHead`           | Keep the parent at a camera-space offset     |
| `FollowObject`         | Copy another object's position or rotation   |
| `FaceCamera`           | Rotate the parent toward the camera          |
| `Orbit`                | Move the parent around a target              |
| `VisibilityTransition` | Animate show, hide, and toggle               |
| `TransformScript`      | Base class for custom parent-transform logic |

These replace UIBlocks behavior classes such as `BillboardBehavior`,
`HeadLeashBehavior`, `ObjectAnchorBehavior`, and `ToggleAnimationBehavior`.

Automatic manipulation suspends direct `TransformScript` children. It rebases
and resumes them when manipulation ends or is canceled.

## 10. Update `ModelViewer`

`ModelViewer` loads glTF, GLB, and supported Gaussian splat formats. It can
also present an existing `THREE.Object3D`.

Add the viewer to the scene before awaiting `load()` so its dependencies are
ready:

```ts
const viewer = new xb.ModelViewer({
  origin: 'bottom-center',
  manipulation: true,
  autoplay: true,
  occlusion: false,
  castShadow: true,
  receiveShadow: true,
});
viewer.position.set(0, 0.7, -1.2);
this.add(viewer);

await viewer.load({
  url: 'models/Cat/cat.gltf',
  path: 'https://cdn.example.com/assets/',
  scale: 0.5,
  rotation: {x: 0, y: Math.PI, z: 0},
});
```

Important changes:

- `load()` accepts a URL or a `ModelSource` object.
- `ModelSource.path` is optional and applies only to glTF related resources.
- `origin` is `bottom-center`, `center`, or `source`.
- `manipulation: true` enables move, Y-axis rotate, and scale with private hit
  proxies.
- Configure detailed actions through `viewer.manipulation` or the constructor.
- Use `viewer.setContent(object)` for an existing Three.js object.
- Inspect `viewer.boundingBox` for normalized local bounds.
- Do not traverse or retain private platform or hit-proxy children.

There are no `draggable`, `rotatable`, `scalable`, or `raycastToChildren`
accessors in the current contract.

## 11. Update lifecycle, context, and addons

### Await terminal disposal

```ts
await xb.core.dispose();
```

Disposal stops render and physics loops, ends the WebXR session manager,
disposes scripts and input, cancels interaction, unmounts UI, and releases the
renderer. Repeated calls share one disposal promise.

The exported Core singleton cannot initialize again after disposal. Treat
disposal as the end of the application runtime.

Script initialization and removal are race-safe. A script removed while
`init()` is pending does not become active after disconnection. Do not reach
into private `ScriptsManager` collections from application or addon code.

### Use current semantic context

The context tree reports public UI kinds, labels, values, disabled state, and
interaction state. Private UI implementation objects are excluded. The
semantic source for built-in UI is `xrblocks`, not `uiblocks`.

### Keep addons on public seams

Third-party addons must:

- import only package-root exports or a documented addon public entry;
- not deep-import a removed UIBlocks tree;
- not implement `Draggable` or `HasDraggingMode`;
- not read `Script.ux`;
- not access private interaction state, UI renderer state, or internal chunks;
- expose application-visible hit surfaces through supported XR Blocks APIs;
- dispose listeners, resources, and child scripts through their public
  lifecycle.

## Final migration checklist

- [ ] Align `three` and peer dependency versions with `package.json`.
- [ ] Remove imports of `xrblocks/addons/simulator/SimulatorAddons.js`.
- [ ] Map both `lit` and `lit/` to the same current release when needed.
- [ ] Serve the complete `build/` directory, including `build/internal/`.
- [ ] Remove imports from `uiblocks` and private UI backend paths.
- [ ] Remove `enableUI()`, `Options.uikit`, `UICore`, and custom UI ray sorting.
- [ ] Replace legacy UI roots and constructors with public UI elements.
- [ ] Move layout and appearance fields under `style`.
- [ ] Replace UI signals and setters with retained public properties.
- [ ] Change controller reads from `event.target` to
      `event.source.controller`.
- [ ] Replace `return true` propagation with `event.stopPropagation()`.
- [ ] Handle `SelectEndEvent.completed`, `reason`, and missing intersections.
- [ ] Replace `ignoreReticleRaycast` with the correct `Object3D.xb` field.
- [ ] Replace drag state with `xb.manipulation` and manipulation handles.
- [ ] Replace `Script.ux` with events or `xb.user` queries.
- [ ] Update reticle and raycast option names.
- [ ] Update themes with a preset or `xb.ui.setTheme()`.
- [ ] Update `ModelViewer` construction and load sources.
- [ ] Await `xb.core.dispose()` and do not reinitialize the singleton.
- [ ] Test mouse, gaze, controller ray, hand ray, and direct touch when used.
- [ ] Test release outside, pointer cancel, source loss, hidden or removed
      targets, concurrent manipulation, and disposal.

## Current references

- [Spatial UI manual](./UI.mdx)
- [Interaction and manipulation manual](./Interaction.md)
- [Placement scripts manual](./Placement.md)
- [ModelViewer manual](./ModelViewer.md)
- [Integrations manual](./Integrations.mdx)
- [Public exports](../../../src/xrblocks.ts)
- [Public UI exports](../../../src/ui/index.ts)
