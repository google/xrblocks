# Browser import maps

Read this reference when an application uses browser-native modules.

## One dependency graph

Map `three`, `three/addons/`, `xrblocks`, and `xrblocks/addons/` to compatible
artifacts. Map every bare transitive dependency required by the selected
feature. Keep one Three.js version and do not mix npm package output with a
different repository build.

The minimum local-repository map is:

```html
<script type="importmap">
  {
    "imports": {
      "three": "../../node_modules/three/build/three.module.js",
      "three/addons/": "../../node_modules/three/examples/jsm/",
      "xrblocks": "../../build/xrblocks.js",
      "xrblocks/addons/": "../../build/addons/"
    }
  }
</script>
```

The minimum CDN pattern is documented in
[`../../../docs/docs/manual/Intro.mdx`](../../../docs/docs/manual/Intro.mdx).
Copy optional mappings from the closest current template. The built-in UI uses
`@pmndrs/uikit` and `@preact/signals-core` as peer dependencies; application
code still imports UI components from `xrblocks`.

## Verification

Before handoff:

1. parse the import map as JSON;
2. list each bare specifier in application code;
3. resolve each specifier through the map;
4. confirm `three` and XR Blocks use one intended version or build;
5. load the complete XR Blocks `build/` directory so private lazy chunks remain
   available;
6. keep application imports out of `build/internal/`.

The map is ready when every bare import resolves to one intended dependency
graph and the exact application entry starts without module-load errors.
