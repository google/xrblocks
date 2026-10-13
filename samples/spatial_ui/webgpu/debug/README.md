# WebGPU UI rendering comparison harness

Debug tooling for comparing the spatial UI rendering between the WebGL and
WebGPU paths, isolating shader math from platform behavior.

## Files

- `dbg-panels.html` — controlled GLSL-vs-TSL harness: one quad with the panel
  material (or a plain `MeshBasicMaterial` control), identical uniform maps,
  flat background, URL-parameterized.
- `quad-test.js` — in-scene debug quad rig (`makeDebugQuad`) for A/B-ing a
  plain material against the panels inside the real samples.

## Running

```sh
npm run build:sdk
npx http-server -p 51191 .          # serve the REPO ROOT
```

- Harness: `http://127.0.0.1:51191/samples/spatial_ui/webgpu/debug/dbg-panels.html`
  (add `&rendererBackend=webgpu` for the TSL path). Compare the quad's center
  pixels across the two URLs.
- In-scene quad: open `samples/spatial_ui/ui/index.html` or
  `samples/spatial_ui/webgpu/index.html?rendererBackend=webgpu`, paste
  `quad-test.js`'s body into the console, then `add()`/`remove()`.

**Measure within one page session.** The scene lighting drifts between page
loads, so only same-session A/B deltas are meaningful.

## Verified findings (2026-10)

1. **Blend spaces differ at the platform level.** WebGL blends the values the
   shader stored; WebGPU's canvas blends in linear space and encodes on write.
   Exact fit (red 1.0 over gray 150, `?mat=plain`-style solid fills):

   | alpha | WebGL (stored) | WebGPU (linear) |
   |-------|----------------|-----------------|
   | 0.25  | 176.0, 112.5   | 184.0, 131.0    |
   | 0.5   | 202.5, 75.0    | 211.0, 109.0    |
   | 0.75  | 228.8, 37.5    | 234.0, 78.0     |
   | 1.0   | 255.0, 0.0     | 255.0, 0.0      |

   Opaque draws match exactly. Translucent draws cannot be reconciled
   per-fragment: the needed correction depends on the covered pixels.

2. **Gradient uniforms are UV-space.** `getGradientColor` must receive
   `uv()` (0–1); pixel-space input clamps linear gradients to their last stop
   (the whole card painted with the darkest gradient color). Fixed in
   `WebGPUUIMaterials.ts`; `?fill=gradient` shows profiles matching within
   2–5/255.

3. **uikit fork re-application bug.** `@david18284/uikit`'s Image component
   re-runs `applyPanelMaterial` when its texture updates; the builder reads
   `material.colorNode` as the diffuse *source*, so the second pass sees its
   own `res.rgb` swizzle (no alpha) and forces the panel opaque — transparent
   canvas textures render as solid black bars. Worked around by wrapping the
   registry handler to be idempotent (`WebGPUUIMaterials.ts`).

4. **`rawOutput` (EOTF decode) in the TSL port** compensates the output
   transform the GLSL raw shaders skip (`gl_FragColor` without
   `<colorspace_fragment>`). It makes alpha=1 exact and is the best
   single-layer approximation for alpha<1.

## Implications

"Pixel-perfect" across the two backends is only well-defined for opaque
content or if the WebGL side is moved to linear blending too (identical
rendering algorithm, slight look change to the reference). Multi-layer
transparent stacks compound the per-layer blend difference.
