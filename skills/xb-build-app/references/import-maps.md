# Import maps for XR Blocks apps

Read this file when an app uses browser-native ES modules. Import maps apply in
the browser, must appear before the first module script, and resolve the exact
strings used by JavaScript imports.

## Resolution rules

- Map `three`, `three/`, and `three/addons/` to one three.js version. XR Blocks'
  peer dependency in `package.json` is authoritative; currently it is
  `^0.184.0`. A second three.js instance breaks identity checks and scene types.
- Map `xrblocks` to `build/xrblocks.js` and `xrblocks/addons/` to
  `build/addons/` from the same checkout, published package version, or build
  artifact. The trailing slash makes the addon entry a prefix mapping.
- A bare addon name is a different specifier. Code using
  `from 'uiblocks'` requires an exact `uiblocks` entry; the
  `xrblocks/addons/` prefix cannot resolve it. Apply the same rule whenever an
  addon's working sample imports another bare name.
- Add every external package imported by the selected SDK/addon path. Start
  from the closest working sample instead of inventing a partial map.
- After editing, compare every bare import in the transitive browser graph with
  the map and load from a clean page with no module-resolution errors.

## Minimal local-repository map

Use this for core XR Blocks and addon imports such as
`xrblocks/addons/simulator/SimulatorAddons.js`:

```html
<script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.184.0/build/three.module.js",
      "three/": "https://cdn.jsdelivr.net/npm/three@0.184.0/",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/",
      "lit": "https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js",
      "lit/": "https://esm.run/lit@3/",
      "xrblocks": "../../build/xrblocks.js",
      "xrblocks/addons/": "../../build/addons/"
    }
  }
</script>
```

Adjust only the relative path depth for the app's location. For a published
deployment, replace both XR Blocks targets with URLs from the same pinned
`xrblocks` package version or the same build commit; keep their `/build/` paths
parallel.

## Local map for `uiblocks`

Use `uiblocks` as the application import specifier. This complete map mirrors
the working [`../../../samples/uiblocks/index.html`](../../../samples/uiblocks/index.html):

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
      "lit": "https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js",
      "lit/": "https://esm.run/lit@3/",
      "@pmndrs/uikit": "https://cdn.jsdelivr.net/npm/@pmndrs/uikit@1.0.56/dist/index.min.js",
      "@pmndrs/uikit-pub-sub": "https://cdn.jsdelivr.net/npm/@pmndrs/uikit-pub-sub@1.0.56/dist/index.min.js",
      "@pmndrs/msdfonts": "https://cdn.jsdelivr.net/npm/@pmndrs/msdfonts@1.0.56/dist/index.min.js",
      "@preact/signals-core": "https://cdn.jsdelivr.net/npm/@preact/signals-core@1.12.1/dist/signals-core.mjs",
      "yoga-layout/load": "https://cdn.jsdelivr.net/npm/yoga-layout@3.2.1/dist/src/load.js",
      "uiblocks": "../../build/addons/uiblocks/src/index.js",
      "xrblocks": "../../build/xrblocks.js",
      "xrblocks/addons/": "../../build/addons/"
    }
  }
</script>
```

Keep the three.js entries on one version, the three UIkit-family entries on one
version, and `xrblocks` plus `uiblocks` on one XR Blocks artifact. Then import:

```js
import * as uikit from '@pmndrs/uikit';
import {UICore, UIPanel, UIText, raycastSortFunction} from 'uiblocks';
import * as xb from 'xrblocks';
```

For another bare addon, add an exact mapping to its built public entry. Prefer
the name and path already used by that addon's working sample.

## Bundler projects

Vite and other bundlers resolve installed packages instead of browser import
maps. Keep `three` aligned with the `xrblocks` peer dependency and install each
external peer used by the chosen capability, including `lit` when loading
`SimulatorAddons`. The npm export pattern supports
`xrblocks/addons/...`; configure a bundler alias named `uiblocks` when source
code intentionally keeps `from 'uiblocks'`, targeting the XR Blocks uiblocks
entry from the same installed package.
