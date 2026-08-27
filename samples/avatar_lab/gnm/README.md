# GNM XR Blocks Demo

- Live demo: https://xrblocks.github.io/docs/samples/GNM-Head/
- Recording: https://www.youtube.com/watch?v=bOFyFlFIcdU

Introduces a purely browser-based demonstration for the Generative aNthropometric Model (GNM) that runs across desktop, mobile, and Android XR devices. This demo leverages the XR Blocks SDK for 3D scene management, rendering, and spatial UI.

- Core WebGL/JS components: GNMModel, GNMControls, GNMScene, and SemanticSampler to handle model logic, rendering, and interactions.
- Demo web application structure: index.html, main.js, and CSS files.
- Python export utility (tools/export_gnm_web.py) to convert GNM weights into web-optimized binary formats.
- Python texture utility (tools/gnm_texture_from_photo.py) to paint a GNM skin texture from a reference photo with Nano Banana 2, conditioned on UV guides baked out of the GNM mesh. Skin and hair are generated as separate passes and composited through a scalp mask taken from the mesh, so the hairline lands where the geometry says rather than where the image model would put it. Reads the Gemini key from `keys.json` at the repository root.

## Textured heads

View → Material has a **Mona Lisa** button that paints her skin onto the head and fits the head to her, in the browser and in XR. It also fits the geometry: the portrait the face fitter already ships with is the same C2RMF scan the texture was painted from, so pressing the button runs a fit against it and the head arrives with her proportions, expression and head turn under the matching texture. Nothing is downloaded until it is pressed.

The texture, the UV sidecar and the pose file all come from the same CDN as the model, so it works on the plain URL. `?localAssets=1` switches every asset to the sample's `assets/` folder, which is how to try a texture you have just generated:

```bash
python demos/gnm/tools/export_gnm_web.py --out_dir=samples/avatar_lab/gnm/assets
```

```bash
python demos/gnm/tools/gnm_texture_from_photo.py --out=samples/avatar_lab/gnm/assets/gnm_skin_mona_lisa.png
```

If an asset is missing the button says so in the status line rather than doing nothing. If the landmark tracker cannot load or finds no face, the fit is skipped and the precomputed eye pose is applied instead, so the eyes still read as hers.

The exporter writes UVs into `gnm_head_web.bin` and also, separately, into a 0.4 MB `gnm_head_uvs.bin`. The sidecar exists because the published model container predates UVs: the viewer keeps using the 35 MB container and pulls the sidecar in on demand, so texturing can ship without re-uploading the model.

The tool also solves for a small expression that hoods the eyes into almonds and writes it beside the texture as `_pose.json`, which the demo applies when the texture loads (`--eye_narrow`, default 8%). The painted likeness cannot do this on its own: GNM's neutral eyes are round and wide, and the skin texture can't cover the eyeballs because they are a separate mesh with their own UV square. GNM's expression basis is per-region PCA rather than named blendshapes, so there is no lid slider either — but the eye aperture is linear in the coefficients, so its gradient over the eye-region components is the cheapest direction that closes the lid. Only the expression is touched; identity and pose are left alone, and Neutral undoes it.

Two things the image model will not do reliably, so the tool does them itself. It puts the hairline wherever a portrait would put it, ignoring the layout, which renders as a bald head — so hair is generated as its own square and composited through a scalp mask taken from the mesh (`--hairline`, `--temple_drop`; higher hairline and lower temple drop mean more forehead). And it drifts toward a neutral, pinker complexion than the reference — so the reference's lit skin is measured, quoted into the prompt as hex targets, and the painted result is then pulled onto it per channel (`--tone`). It also paints a lit face, bright down the middle and falling away at the temples, which doubles up with the renderer's own shading and turns the sides of the head muddy; `--deshade` divides that low-frequency luminance back out and leaves the pores and craquelure alone.

GNM gives every mesh component its own 0..1 UV square, so the texture covers the `skin` component only; the eyes, teeth and tongue keep their per-vertex colors, drawn as a second geometry group. Vertices on a UV seam carry more than one texture coordinate, so the exporter splits them into extra render vertices (616 of them for the v3.0 head) that copy their position from the vertex they came from — the model itself, its skinning, the landmarks and the wireframe are all untouched.

The webcam tracking part is ported from [GNM Webcam Puppet](https://github.com/edualvarado/gnm-webcam-puppet) by Eduardo Alvarado.
