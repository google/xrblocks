# Implementation Plan: Optimizing Spatial UI from 81 to 12 Draw Calls

## 1. Executive Summary & Objective

In `samples/spatial_ui/ui/index.html`, the spatial UI scene issues **81 draw calls** and renders **5,198 triangles** per frame. A benchmark comparing this to a vanilla `@pmndrs/uikit` implementation proved that the equivalent visual interface can render in only **12 draw calls** and **1,858 triangles**, reducing CPU render dispatch time from **3.41 ms to 1.31 ms** (~2.6x improvement) on an Intel UHD 630 iGPU.

The goal of this optimization is to reduce `samples/spatial_ui/ui/index.html` down to **12 draw calls** without breaking any gradient features, shadows, borders, or animations supported by `GradientPanel` (as verified by `samples/spatial_ui/panels/index.html`).

---

## 2. Draw Call Budget Breakdown

| Layer / Element Type      | Current Draw Calls | Target Draw Calls  | Optimization Strategy                                                    |
| :------------------------ | :----------------: | :----------------: | :----------------------------------------------------------------------- |
| **Material Symbol Icons** |       **34**       |  **0** (absorbed)  | Render via MSDF icon font glyphs batched into `InstancedGlyphMesh`       |
| **Containers & Buttons**  |       **31**       | **3** (1 per card) | Route flat/standard containers to `@pmndrs/uikit`'s `InstancedPanelMesh` |
| **Text Glyphs**           |       **6**        | **6** (2 per card) | Retained as standard MSDF `InstancedGlyphMesh`                           |
| **Images & Media**        |       **1**        |       **1**        | Retained as textured quad (`Image`)                                      |
| **Reticles & Pointers**   |       **1**        |       **1**        | Retained as `Reticle` shader                                             |
| **Scene Objects / Light** |       **1**        |       **1**        | Retained as `MeshStandardMaterial` sphere                                |
| **Total**                 |       **81**       |       **12**       | **-69 draw calls (-85.2%)**                                              |

---

## 3. Root Cause Analysis

### Cause A: Vector Path Meshes on `UIIcon` (+34 draw calls)

- `src/ui/internal/UIKitBackend.ts` loads Material Symbols SVGs via `SVGLoader`.
- `SVGLoader` generates independent Three.js `Mesh` objects per path and sub-contour.
- The 11 icons across the 3 cards generate **34 separate meshes**, each rendered with an unbatched `MeshBasicMaterial`.

### Cause B: Universal `GradientPanel` Instantiation (+28 draw calls)

- Every `UIPanel`, `UICard`, `UIButton`, and `UISlider` component in XR Blocks maps to a `GradientPanel` (`src/ui/primitives/GradientPanel.ts`).
- `GradientPanel` extends `@pmndrs/uikit`'s `Custom` with a `ShaderMaterial`. In `@pmndrs/uikit`, any component using a custom `ShaderMaterial` **cannot be instanced into `InstancedPanelMesh`**.
- Even simple flat containers with solid colors (like button backgrounds, feature badge backings, and slider tracks) trigger dedicated draw calls with unique `ShaderMaterial` instances.

### Cause C: Multi-Pass Layer Decomposition (+31 draw calls)

- `GradientPanel` decomposes every panel into 4–6 separate geometry layers:
  1. `DropShadowLayer` (`ShaderMaterial`)
  2. `FillLayer` (`ShaderMaterial`)
  3. `InnerShadowLayer` (`ShaderMaterial`)
  4. `StrokeLayer` (`ShaderMaterial`)
  5. `BackfaceLayer` & `BackfaceStrokeLayer` (when backface is configured)
- Each layer creates its own Three.js `Mesh` with separate state changes and matrix updates.

---

## 4. Technical Pillars of the Optimization

### Pillar 1: Hybrid UI Backend Router (Dynamic Container Specialization)

- **Principle**: Only use `GradientPanel` when an element actually requires gradient or advanced shadow features.
- In `src/ui/internal/UIKitBackend.ts`, inspect the element's computed style before instantiating the `@pmndrs/uikit` node:
  - **Gradient / Advanced SDF Path**: If `isGradient(fillColor)`, `isGradient(strokeColor)`, `innerShadowBlur > 0`, `dropShadowBlur > 0`, or custom gradient paint is defined, instantiate `GradientPanel`.
  - **Flat / Standard Path**: If the element only uses flat solid colors, uniform border radius, standard border width, and standard opacity (`backgroundColor`, `borderRadius`, `borderColor`, `borderWidth`), instantiate `@pmndrs/uikit`'s native `Container`.
- **Impact**: Native `Container` instances within the same card root are automatically batched by `@pmndrs/uikit` into **1 single `InstancedPanelMesh`**. All buttons, slider tracks, slider thumbs, and feature badges collapse from ~28 draw calls down to **3 draw calls** (1 per card).

### Pillar 2: MSDF Icon Font Atlas for `UIIcon`

- **Principle**: Icons should be rendered as font glyphs, not tessellated 2D vector meshes.
- In `@pmndrs/uikit`, text glyphs from `FontFamily` are instanced together in `InstancedGlyphMesh`.
- Material Symbols is available as an MSDF glyph atlas (`MaterialSymbols-Regular.json` + `.png`).
- In `UIKitBackend.ts`, register Material Symbols as a recognized font family or sprite atlas. When `kind === 'icon'`, render the icon as a ligature or codepoint character inside a `Text` node rather than generating separate `Svg` meshes.
- **Impact**: All 11 icons across the 3 cards are drawn inside the existing **6 `InstancedGlyphMesh` passes**, completely eliminating **34 draw calls** (+0 additional draw calls).

### Pillar 3: Single-Pass Unified SDF Shader for `GradientPanel`

- **Principle**: A signed distance field (SDF) evaluation can compute outer drop shadows, borders, inner fills, and inner shadows in a single fragment shader pass.
- Currently, `DropShadowLayer`, `FillLayer`, `InnerShadowLayer`, and `StrokeLayer` each run a separate geometry pass over a quad.
- Merge these 4 shaders into `UnifiedGradientPanel.frag.ts`:

  ```glsl
  // Single-pass evaluation:
  float d = roundedBoxSDF(p - offset, halfSize, cornerRadius);
  vec4 color = vec4(0.0);

  // 1. Drop shadow (d > 0.0)
  if (u_hasDropShadow) {
    float shadowAlpha = evaluateShadow(d - u_dropSpread, u_dropBlur);
    color = mix(color, u_dropColor, shadowAlpha);
  }
  // 2. Fill (d <= 0.0)
  if (d <= 0.0) {
    vec4 fill = evaluateFill(p);
    // 3. Inner shadow
    if (u_hasInnerShadow) {
      fill = applyInnerShadow(fill, d, p);
    }
    color = mix(color, fill, fill.a);
  }
  // 4. Stroke / Border (|d| <= strokeWidth / 2.0)
  if (abs(d) <= u_strokeWidth * 0.5) {
    vec4 stroke = evaluateStroke(p);
    color = mix(color, stroke, stroke.a);
  }
  gl_FragColor = color;
  ```

- **Impact**: Any complex panel that requires custom gradient styling collapses from 4–6 draw passes down to **1 single draw pass**.

---

## 5. Step-by-Step Implementation Phases

### Phase 1: Hybrid Backend Routing in `UIKitBackend.ts`

1. Add helper `hasComplexShaderRequirements(style: UIStyle): boolean`:
   - Checks if `isGradient(style.backgroundColor)` or `isGradient(style.borderColor)`
   - Checks if `style.innerShadowBlur > 0` or `style.dropShadowBlur > 0`
   - Checks if `style.borderAlign === 'outside' || style.borderAlign === 'inside'`
2. In `createNode(element)`:
   - If `hasComplexShaderRequirements(style)` is `false`, create `new Container(mappedProps)`.
   - If `true`, create `new GradientPanel(properties)`.
3. In `commit(context)`:
   - Handle transitions if styles dynamically switch between flat and gradient.

### Phase 2: Material Symbols MSDF Icon Integration

1. Provide an MSDF font asset for Material Symbols (or load via jsdelivr from `@pmndrs/msdfonts`).
2. Update `UIKitBackend.ts`'s icon handler:
   - Map icon names to unicode codepoints.
   - Use `new Text({ text: codepoint, fontFamily: 'MaterialSymbols', ... })`.
3. Keep fallback to `Svg` when an icon is not present in the font atlas.

### Phase 3: Single-Pass `GradientPanel` Shader Consolidation

1. Author `src/ui/shaders/UnifiedGradientPanel.frag.ts`.
2. Consolidate `DropShadowLayer`, `FillLayer`, `InnerShadowLayer`, and `StrokeLayer` uniforms into a single `ShaderMaterial`.
3. Replace the 4 sub-meshes in `GradientPanel.ts` with a single mesh quad.
4. Verify all gradient types (linear, radial, angular, diamond) and shadow combinations render identically against `samples/spatial_ui/panels/index.html`.

---

## 6. Verification & Quality Gates

1. **Draw Call Validation**:
   - Run `renderer.info.render.calls` via headless Chrome.
   - Verify `samples/spatial_ui/ui/index.html` drops from **81 calls to 12 calls**.
2. **Feature Regression Suite**:
   - Load `samples/spatial_ui/panels/index.html` and compare rendered pixel output across:
     - All 5 gradient types (solid, linear, radial, angular, diamond)
     - All inner shadow permutations (blur, spread, falloff, position, gradient)
     - All drop shadow permutations (blur, spread, falloff, position, gradient)
     - All stroke alignments and gradient borders
     - Dynamic property animations
3. **Automated Tests**:
   - `npm test` (all 2,440 unit tests must pass)
   - `npm run lint` & `npm run format:check` must pass with 0 warnings.
4. **Performance Benchmark**:
   - Re-run `EXT_disjoint_timer_query_webgl2` on Intel UHD 630 iGPU.
   - Confirm CPU render dispatch drops from **~3.4 ms to ~1.3 ms**.
