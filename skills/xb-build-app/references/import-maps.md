# Import maps for XR Blocks apps

Import maps must appear before the first module script and must resolve every
exact bare specifier used by the browser module graph.

## Rules

- Map `three`, `three/`, and `three/addons/` to the one version required by
  `package.json`.
- Map `xrblocks` and `xrblocks/addons/` to the same package version or build
  commit.
- Add every external package imported by the selected SDK and addon paths.
- Start from the closest working sample, then load a clean page and check for
  module-resolution errors.

## Local repository map

The main SDK includes spatial UI, so its UIKit browser peers are part of the
normal map.

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
      "@pmndrs/uikit": "https://cdn.jsdelivr.net/npm/@pmndrs/uikit@1.0.64/dist/index.min.js",
      "@pmndrs/uikit-pub-sub": "https://cdn.jsdelivr.net/npm/@pmndrs/uikit-pub-sub@1.0.64/dist/index.min.js",
      "@pmndrs/msdfonts": "https://cdn.jsdelivr.net/npm/@pmndrs/msdfonts@1.0.64/dist/index.min.js",
      "@preact/signals-core": "https://cdn.jsdelivr.net/npm/@preact/signals-core@1.14.0/dist/signals-core.mjs",
      "yoga-layout/load": "https://cdn.jsdelivr.net/npm/yoga-layout@3.2.1/dist/src/load.js",
      "lit": "https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js",
      "lit/": "https://esm.run/lit@3/",
      "xrblocks": "../../build/xrblocks.js",
      "xrblocks/addons/": "../../build/addons/"
    }
  }
</script>
```

Adjust only the relative path depth for the app. For deployment, replace both
XR Blocks targets with URLs from one pinned artifact.

## Bundler projects

Bundlers resolve installed packages instead of import maps. Keep `three`
aligned with the XR Blocks peer dependency and install the external peers used
by the selected capabilities. Addons import through `xrblocks/addons/...`.
