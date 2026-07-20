# UIBlocks implementation reference

Read this file before authoring or repairing an XR Blocks app surface. UIBlocks
wraps `@pmndrs/uikit` and Yoga flexbox. Its public addon entry is
`src/addons/uiblocks/src/index.ts`; its built browser entry is
`build/addons/uiblocks/src/index.js`.

## Browser import map

Place the import map before every `type="module"` script. This complete map is
the repository's working browser configuration from `samples/uiblocks/index.html`:

```html
<script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.184.0/build/three.module.js",
      "three/": "https://cdn.jsdelivr.net/npm/three@0.184.0/",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/",
      "troika-three-text": "https://cdn.jsdelivr.net/gh/protectwise/troika@028b81cf308f0f22e5aa8e78196be56ec1997af5/packages/troika-three-text/src/index.js",
      "troika-three-utils": "https://cdn.jsdelivr.net/gh/protectwise/troika@v0.52.4/packages/troika-three-utils/src/index.js",
      "troika-worker-utils": "https://cdn.jsdelivr.net/gh/protectwise/troika@v0.52.4/packages/troika-worker-utils/src/index.js",
      "bidi-js": "https://esm.sh/bidi-js@%5E1.0.2?target=es2022",
      "webgl-sdf-generator": "https://esm.sh/webgl-sdf-generator@1.1.1/es2022/webgl-sdf-generator.mjs",
      "@pmndrs/uikit": "https://cdn.jsdelivr.net/npm/@pmndrs/uikit@1.0.56/dist/index.min.js",
      "@pmndrs/uikit-pub-sub": "https://cdn.jsdelivr.net/npm/@pmndrs/uikit-pub-sub@1.0.56/dist/index.min.js",
      "@pmndrs/msdfonts": "https://cdn.jsdelivr.net/npm/@pmndrs/msdfonts@1.0.56/dist/index.min.js",
      "@preact/signals-core": "https://cdn.jsdelivr.net/npm/@preact/signals-core@1.12.1/dist/signals-core.mjs",
      "yoga-layout/load": "https://cdn.jsdelivr.net/npm/yoga-layout@3.2.1/dist/src/load.js",
      "uiblocks": "../../build/addons/uiblocks/src/index.js",
      "xrblocks": "../../build/xrblocks.js"
    }
  }
</script>
```

Adjust only the two local `build/` URLs for the app's depth in this repository.
For a CDN app, use the paired entries documented in
`src/addons/uiblocks/README.md`:

```json
{
  "uiblocks": "https://cdn.jsdelivr.net/gh/google/xrblocks@build/addons/uiblocks/src/index.js",
  "xrblocks": "https://cdn.jsdelivr.net/gh/google/xrblocks@build/xrblocks.js"
}
```

Replace `build` with the same build-branch commit SHA in both URLs when the app
requires reproducible loading. Keep `three` aligned with the SDK peer dependency
and keep the three `@pmndrs/*` browser packages on one version.

The app code uses the stable bare specifier:

```js
import * as uikit from '@pmndrs/uikit';
import * as THREE from 'three';
import {
  UICore,
  UIIcon,
  UIImage,
  UIPanel,
  UIText,
  raycastSortFunction,
} from 'uiblocks';
import * as xb from 'xrblocks';
```

## Bundler setup

Install `xrblocks`, `three`, `@pmndrs/uikit`, and
`@preact/signals-core`. Import UIBlocks from the package subpath represented by
its built addon entry when the bundler cannot resolve the repository-only
`uiblocks` alias, or configure the bundler alias `uiblocks` to that entry. Keep
one `three` instance. The repository's Vite template externalizes
`@pmndrs/uikit` and `@preact/signals-core`; follow its treatment when building
against local XR Blocks output.

## Required bootstrap

Create `UICore` with its owning `xb.Script`. Configure the UI renderer before
`xb.init()`, and configure intersection ordering in the script's `init()`:

```js
class MenuScript extends xb.Script {
  constructor() {
    super();
    this.uiCore = new UICore(this);
  }

  init() {
    if (xb.core.input.raycaster) {
      xb.core.input.raycaster.sortFunction = raycastSortFunction;
    }
    this.createUI();
  }

  createUI() {
    const card = this.uiCore.createCard({
      name: 'MainMenu',
      sizeX: 1,
      sizeY: 0.6,
      pixelSize: 0.002,
      position: new THREE.Vector3(0, 1.5, -1.2),
      flexDirection: 'column',
      alignItems: 'stretch',
    });

    const root = new UIPanel({
      width: '100%',
      height: '100%',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 16,
      padding: 24,
      fillColor: '#16181dee',
      cornerRadius: 24,
      strokeWidth: 2,
      strokeColor: '#ffffff44',
    });
    card.add(root);

    root.add(
      new UIText('Main menu', {
        color: '#ffffff',
        fontSize: 32,
        fontWeight: 'bold',
      })
    );
  }
}

const options = new xb.Options();
options.enableUI();
options.uikit.enable(uikit);
xb.add(new MenuScript());
await xb.init(options);
```

`options.uikit.enable(uikit)` enables renderer clipping and UIKit's transparent
sort. `raycastSortFunction` separately orders UI intersections for hover and
selection. Both are part of the foundation.

## Surface composition

- Use one `UICard` per world pose or movement behavior. `UICore.createCard()`
  adds it to the owning script and manages disposal.
- Treat `sizeX` and `sizeY` as physical meters. `pixelSize` maps every layout
  pixel to meters; keep it consistent across one surface.
- Partition the card with nested `UIPanel`s. Use `flexDirection`,
  `justifyContent`, `alignItems`, `gap`, `padding`, `margin`, `flexGrow`,
  `flexShrink`, percentage sizes, and absolute layout-pixel sizes.
- Use `strokeWidth` and `strokeColor` for outlines that follow
  `cornerRadius`. Use `fillColor`, `dropShadow*`, and `innerShadow*` for visual
  hierarchy. The addon's alpha-aware parser accepts hex with alpha, `rgb()`,
  `rgba()`, CSS color names, numeric Three.js colors, and `THREE.Color`;
  `hsla()` is unsupported.
- Use `new UIText(text, properties)`, `new UIImage(src, properties)`, and
  `new UIIcon(iconName, properties)`. Dynamic setters include `setText`,
  `setSrc`, `setIcon`, `setColor`, and `setOpacity` on their respective types.
- Compose a button as `UIPanel({onClick, onHoverEnter, onHoverExit, ...})` with
  a text, image, or icon child. Give every button distinct idle, hover, and
  activated feedback.

Example button:

```js
const button = new UIPanel({
  width: 220,
  height: 72,
  fillColor: '#2b2f3a',
  cornerRadius: 18,
  justifyContent: 'center',
  alignItems: 'center',
  onHoverEnter: () => button.setFillColor('#3b4252'),
  onHoverExit: () => button.setFillColor('#2b2f3a'),
  onClick: () => setMode('ready'),
});
button.add(new UIText('Continue', {fontSize: 24, color: '#ffffff'}));
```

## Spatial behaviors

Pass behaviors in `createCard({behaviors: [...]})` or attach them with
`card.addBehavior(...)`:

- `HeadLeashBehavior({offset, posLerp?, rotLerp?})` follows the camera.
- `BillboardBehavior({mode?, lerpFactor?})` faces the camera; mode is
  `cylindrical` or `spherical`.
- `ManipulationBehavior({draggable?, faceCamera?, manipulationMargin?,
manipulationCornerRadius?})` provides controller-ray dragging.
- `ObjectAnchorBehavior({target, mode?, positionOffset?, rotationOffset?})`
  tracks a target; mode is `position`, `rotation`, or `pose`.
- `ToggleAnimationBehavior({showAnimation?, hideAnimation?, duration?})`
  powers `card.show()`, `card.hide()`, and `card.toggle()`; the current animation
  type is `scale`.

## Diagnostic ladder

For missing UI, first verify all import-map entries resolve and that the console
has no module errors. Then verify `options.uikit.enable(uikit)` runs before
`xb.init()` and the `UICard` has nonzero physical and layout dimensions.

For missing hover or clicks, verify `raycastSortFunction` is installed, the
target `UIPanel` has handlers, and no overlapping sibling masks it. Include
mouse simulation and the intended controller path in the user handoff.

For incorrect layout, inspect the card's `sizeX`, `sizeY`, and `pixelSize`, then
walk parent flex dimensions before changing children. `width: 'auto'` with
`alignItems: 'center'` shrink-wraps a centered card when the default stretched
root is undesirable.

For incorrect corners or outlines, use `strokeWidth` and `strokeColor` with
`cornerRadius`. For passthrough UI, provide sufficient opacity, contrast,
stroke, and shadow, then include target-background legibility in the user
handoff.

Use these repository examples as executable truth:

- `samples/uiblocks/index.html` for browser bootstrap and a complete card;
- `src/addons/uiblocks/samples/basic/layouts/` for flex layout;
- `src/addons/uiblocks/samples/basic/interactions/` for controls;
- `src/addons/uiblocks/samples/basic/behaviors/` for spatial placement.
