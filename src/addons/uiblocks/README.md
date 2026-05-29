# uiblocks

A comprehensive 3D UI toolkit that brings familiar 2D flexbox layouts, advanced styling (gradients, shadows, rounded corners), and interactive behaviors (hover, click, head-leashing) into XRBlocks experiences. It bridges standard web UI patterns with spatial computing through optimized `three.js` and `@pmndrs/uikit` rendering.

## Features

- **Spatial UI**: Place UI components anywhere in 3D space with immersive behaviors such as:
  - **Object Anchoring**: Anchor UI to objects or surfaces.
  - **Head Leash & Billboard**: UI that dynamically follows the user's position.
  - **Manipulation**: Move and interact with cards naturally.
- **Rich Styling Panels**: Configure aesthetics with:
  - **Flexbox Layout**: Automatic item positioning using yoga-layout (flex-direction, justify, align, gap).
  - **Gradient Fill**: Smooth linear/radial background shading.
  - **Shadows & Borders**: Support for inner/outer dropshadows and curved strokes.
- **Built-in Interactions**: Ready-to-use raycast click callbacks and visual state states (hover/click setups).

## Structure

- `src/`: Library source code.
  - `index.ts`: Main entry point.
  - `core/`: Core UI components and logic.
- `samples/`: Sample applications consuming the library.

## Setup

`uiblocks` is compiled natively as part of the `xrblocks` root build process.

1.  Install dependencies from the `xrblocks` root:

    ```bash
    npm install
    ```

2.  Build the library and samples from the `xrblocks` root:
    ```bash
    npm run build
    ```

## Running Samples

After building, you must serve the **root of the `xrblocks` repository** using a static file server.
The sample HTML files use paths relative to the repository root to load the built assets.

Example with `python`:

```bash
# From the root of the xrblocks repository
python3 -m http.server
```

Then navigate to `http://localhost:8000/src/addons/uiblocks/samples/index.html`.

For a detailed breakdown of all available scenes and demonstrative layouts, see samples/SAMPLES.md.

## Using `uiblocks` in Your Own App

To build your own application outside of the `samples/` workspace, configure the following builds and HTML container setup.

### Prerequisites (What You Need)

1.  **Compiled `xrblocks` Build**:
    Run the build from the `xrblocks` root to output the bundled ES modules:

    ```bash
    npm run build
    ```

2.  **HTML Container & Import-Map**:
    Include an `<script type="importmap">` in your static server layout explicitly loading the peer distributions below for dynamic ambient rendering:

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
          "uiblocks": "https://cdn.jsdelivr.net/npm/xrblocks@0.9.0/build/addons/uiblocks/src/index.js",
          "xrblocks": "https://cdn.jsdelivr.net/npm/xrblocks@0.9.0/build/xrblocks.js"
        }
      }
    </script>
    ```

    > [!NOTE]
    > If developing `xrblocks` locally, change the paths above to point to your local `build/` directory.
    > Update the `xrblocks` version to the version you are using for both `uiblocks` and `xrblocks`.

---

### Integration Steps

#### 1. Setup Your `index.html`

Create a base document mounting an entry `main.js` module script:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>My Experience</title>
    <style>
      body {
        margin: 0;
        overflow: hidden;
        background: #000;
      }
    </style>
  </head>
  <body>
    <!-- Paste the Importmap Script block here -->
    <script type="module" src="./main.js"></script>
  </body>
</html>
```

#### 2. Initialize the UI Framework (`main.js`)

Compose layout blocks extending `xb.Script` using standard transparency depth filters overriding ambient sort structures accurately:

```javascript
import {reversePainterSortStable} from '@pmndrs/uikit';
import * as THREE from 'three';
import {UICore, UIPanel, UIText, raycastSortFunction} from 'uiblocks';
import * as xb from 'xrblocks';

class CustomScript extends xb.Script {
  constructor() {
    super();
    this.uiCore = new UICore(this);
  }

  async init() {
    // Configure Depth Filters for transparency sorting
    const renderer = xb.core.renderer;
    renderer.localClippingEnabled = true;
    renderer.setTransparentSort(reversePainterSortStable);
    // This is a must-have for raycasting to work.
    if (xb.core.input.raycaster) {
      xb.core.input.raycaster.sortFunction = raycastSortFunction;
    }

    this.createUI();
  }

  createUI() {
    // Instantiate a UICard as the root container.
    const card = this.uiCore.createCard({
      name: 'HelloCard',
      sizeX: 1.0,
      sizeY: 0.6,
      position: new THREE.Vector3(0, 1.5, -1),
    });

    // Setup child UI elements.
    // Add a panel.
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

    // Add a text.
    panel.add(
      new UIText('Hello World', {
        fontSize: 32,
        fontWeight: 'bold',
        color: 'white',
      })
    );
  }
}

// Bootstrap immersive loop
async function start() {
  await xb.core.init({
    canvas: document.createElement('canvas'),
  });
  document.body.appendChild(xb.core.canvas);

  xb.core.scene.add(new THREE.AmbientLight(0xffffff, 1));
  xb.core.scene.add(new THREE.DirectionalLight(0xffffff, 1));

  xb.core.addScript(new CustomScript());
  xb.core.start();
}
document.addEventListener('DOMContentLoaded', start);
```

> [!TIP]
> **Complete Reference:** For a fully assembled, working example of this initialization process and HTML file structure, check out `samples/uiblocks/index.html` located in the repository root.

#### 3. Run Your Engine

Serve your workspace containing the `index.html` layout:

```bash
python3 -m http.server
```

Navigate to the served local binding endpoint.

## Acknowledgements

This addon heavily relies on the excellent [`@pmndrs/uikit`](https://github.com/pmndrs/uikit) library for its core spatial UI rendering and Flexbox layout engine (powered by `yoga-layout`). We highly appreciate their open-source contributions to the Thre.js ecosystem. `@pmndrs/uikit` is distributed under the [MIT License](https://github.com/pmndrs/uikit/blob/main/LICENSE).
