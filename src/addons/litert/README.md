# LiteRT.js helpers

Loads [LiteRT.js](https://www.npmjs.com/package/@litertjs/core) from a CDN,
downloads `.tflite` models once into the Cache API, and compiles and runs them
on WebGPU (or wasm). Nothing from `@litertjs/core`, no wasm runtime and no
model file is bundled into `xrblocks` or checked into this repository: the
package is resolved by the page's import map and loaded at runtime with a
dynamic `import()`.

```html
<script type="importmap">
  {
    "imports": {
      "@litertjs/core": "https://cdn.jsdelivr.net/npm/@litertjs/core@2.5.3/dist/index.js",
      "@litertjs/wasm-utils": "https://cdn.jsdelivr.net/npm/@litertjs/wasm-utils@2.5.3/dist/index.js",
      "xrblocks/addons/": "../../build/addons/"
    }
  }
</script>
```

Both entries are needed: the core module imports `@litertjs/wasm-utils` by its
bare name.

```js
import {
  compileModel,
  fetchCachedModel,
  loadLiteRtRuntime,
  runModel,
} from 'xrblocks/addons/litert/index.js';

const runtime = await loadLiteRtRuntime(); // {accelerator: 'webgpu' | 'wasm', threads}
const bytes = await fetchCachedModel(MODEL_URL, {
  cacheName: 'my-demo-v1',
  onProgress: (received, total) => console.log(received, total),
});
const {model} = await compileModel(bytes, {accelerator: runtime.accelerator});
const [output] = await runModel(model, [
  {data: input, shape: [1, 3, 448, 448]},
]);
```

- `loadLiteRtRuntime()` loads the wasm runtime once per page (repeat calls share
  the same promise) and reports the accelerator to compile for. The default
  `wasmDir` is the matching `@litertjs/core@2.5.3/wasm/` directory on jsDelivr.
- `compileModel()` compiles for the requested accelerator and, by default, falls
  back to wasm when a WebGPU compile fails. Pass `cpuOptions.numThreads` for
  models that run on wasm; `defaultNumThreads()` gives a capped hardware count.
- `runModel()` wraps typed arrays in tensors, reads every output back to host
  memory and deletes all tensors, also when the run throws. Its signature is
  exported as `RunModelFn` so model code can take it as a parameter and stay
  testable without LiteRT.
- `fetchCachedModel()` streams the download with progress and stores the bytes
  in the Cache API. Cache failures fall through to the network.
- `describeError()` turns anything LiteRT.js or `fetch` can throw (`Error`,
  string, `Event`) into text for a status line.

## Threads

The multi-threaded wasm build (`{threads: true}`) is only attempted on a
cross-origin isolated page (`crossOriginIsolated === true`, which needs COOP and
COEP headers or a service worker that injects them). Emscripten starts each
pthread with `new Worker(<glue URL>)`, which browsers refuse for a cross-origin
CDN URL, so the helper fetches the threaded glue with CORS and hands it over as
a same-origin blob through `Module.mainScriptUrlOrBlob`. If that rung fails the
single-threaded build is loaded instead; check `runtime.threads`.

## Size

The wasm runtime is about 9 MB and models are tens of megabytes; both are
fetched once and cached by the browser. Compile one model at a time and call
`model.delete()` when a script is disposed.
