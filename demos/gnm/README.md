# GNM Head Explorer

An interactive XR Blocks demo of **[GNM](https://github.com/google/gnm)**
(Generative aNthropometric Model) — Google's parametric 3D statistical model of
the human head that powers [Android XR](https://www.android.com/xr/)'s
[Likeness](https://play.google.com/store/apps/details?id=com.google.android.apps.vr.doppel&hl=en_US).
The full GNM v3.0 forward function runs live in the browser:

- **17,821 vertices**, quad topology, controllable internal anatomy (eyes,
  teeth, tongue), skinned to a 4-joint rig (neck → head → left/right eye).
- **253 identity** + **383 expression** PCA components, all exposed as grouped
  sliders with incremental (sub-millisecond) mesh updates.
- **Live semantic sampling** — the identity and expression conditional-VAE
  decoders from `gnm.shape.semantic_sampler` are ported to JavaScript, so you
  can sample gender × ethnicity identities and 20 expression classes (happy,
  surprise, pucker, …) or random blends entirely client-side.
- **Pose & gaze** — joint rotation sliders, plus eyes/head camera tracking.
- **Animation drivers** — expression tour, identity morph random-walk,
  per-component pulse explorer, idle sway, turntable.
- **Inspection views** — studio / clay / normals / anatomical-region materials,
  quad wireframe, 68 barycentric facial landmarks, skeleton, per-component
  visibility toggles, and OBJ export of the current mesh.
- **Spatial panels (uiblocks)** — inside XR, three draggable
  [uiblocks](../../src/addons/uiblocks/SKILL.md) cards arranged around the head
  (Sample / Motion / View) expose semantic sampling, all 20 expression classes
  (paged), gaze + animation toggles, material modes, and overlays. Their state
  stays in sync with the desktop DOM panel in both directions.

## Running

Serve the repository as usual (see the root README development guide) and open:

```text
http://localhost:8080/demos/gnm/
```

Keyboard: `R` random identity · `E` random expression · `N` neutral ·
`T` expression tour · `W` wireframe · `G` turntable.

## Model assets (hosted on a CDN)

The model weights — `gnm_head_web.bin` (~35 MB) and `gnm_samplers_web.bin`
(~2.7 MB) — are **not** checked into this repo. They are fetched at runtime from
the [xrblocks/assets-gnm](https://github.com/xrblocks/assets-gnm) repository via
jsDelivr's githack CDN, pinned to a commit hash in
[main.js](main.js). To develop against local copies instead, drop the two
`.bin` files into `assets/` (git-ignored) and repoint `HEAD_MODEL_URL` /
`SAMPLERS_URL` in `main.js` at `./assets/…`.

## Regenerating the model assets

`gnm_head_web.bin` and `gnm_samplers_web.bin` are generated from a
[google/gnm](https://github.com/google/gnm) checkout by
[tools/export_gnm_web.py](tools/export_gnm_web.py) (requires only `numpy` and
`h5py`):

```bash
python tools/export_gnm_web.py --gnm_root=/path/to/gnm
```

The exporter int8-quantizes the identity/expression bases with one float32
scale per PCA component (max vertex error ≈ 0.25 mm, mean ≈ 0.03 mm — measured
and printed at export time) and ships the topology, skinning weights, joint
identity basis, vertex-group id maps, landmark definitions, and both CVAE
decoder MLPs in a single binary container format (`GNMW`).

[tools/reference_case.json](https://github.com/xrblocks/assets-gnm/blob/main/tools/reference_case.json) holds ground-truth
vertex/joint/landmark positions computed with the Python reference
implementation for a fixed parameter set; the JavaScript port in
[GNMModel.js](GNMModel.js) reproduces them to float32 precision (~3e-8 m).

## License

The GNM model data is released by Google under the Apache License 2.0 (see the
[google/gnm](https://github.com/google/gnm) repository, which also discusses
the model's limitations in human representation). Demo code is Apache 2.0 like
the rest of XR Blocks.
