# VRM Avatar — XRBlocks Demo

A point-to-walk VRM avatar demo built on [XRBlocks](https://github.com/google/xrblocks). Click (or pinch in XR) anywhere on the floor and the avatar walks there, then returns to idle. Spring bones, facial expressions, and Mesh2Motion animation retargeting all work out of the box.

![Demo: point-to-walk avatar in XRBlocks simulator]()

---

## What it does

- Loads any `.vrm` file using `@pixiv/three-vrm`
- Retargets CC0 Mesh2Motion GLB animations onto the VRM humanoid skeleton
- Crossfades between idle and walk animations
- Walks the avatar to a floor point selected by the user via controller ray or mouse click
- Procedural eye blink using VRM expression manager
- Pixel-level passthrough occlusion: real-world geometry (desk, doorway, furniture) hides the avatar via the XRBlocks occlusion map
- Works in the XRBlocks desktop simulator and in WebXR

---

## Project structure

```
demos/vrm-avatar/
  index.html          — entry point, import map
  main.js             — entry point script (scene setup, VRMAvatarScript configuration)
  VRMAvatar.js        — utility class: VRM load, animation, blink, update()
  VRMAvatarScript.js  — xb.Script subclass: scene lifecycle, point-to-walk
  VRMOcclusion.js     — opts avatar materials into pixel-level passthrough occlusion
```

---

## Assets loaded

The VRM model and all animation assets (T-pose, idle, and walking GLB files) are loaded automatically via CDN and a GitHub assets repository, requiring no manual downloads or local asset management.

---

## Key implementation notes

**Why not `xb.ModelViewer`?**
`VRMLoaderPlugin` must be registered on the `GLTFLoader` instance before the load call. `xb.ModelViewer` is a display container with no loader injection point, so `GLTFLoader` is used directly.

**Mesh2Motion retargeting**
`VRMAvatar.js` includes a full `MESH2MOTION_VRM_RIG_MAP` mapping Mesh2Motion bone naming conventions to the VRM 1.0 specification. `retargetGLBClip()` remaps bone names, utilizes `Tpose.glb` as a pristine reference rest pose, and corrects rest-pose rotations. Root motion on the hips X/Z axes is zeroed out to prevent position drift on loop.

**Depth mesh floor detection**
On device, `onSelectEnd` uses the callback's `event.surface` and `event.intersection` values for accurate depth-mesh floor hits. `options.reticles.projectOnDepthMesh` keeps the reticle on that same surface. The avatar root uses `pointerEvents: 'none'`, so its meshes do not block the floor reticle. When the depth mesh is not available, the demo casts from `event.source.controller` to the y=0 ground plane.

**Passthrough occlusion**
`main.js` enables `options.depth.depthTexture` and `options.depth.occlusion`; `VRMOcclusion.js` then opts every avatar mesh into the XRBlocks occlusion map (layer + alpha-multiply shader patch + `occludableShaders` registration). MToon materials need a custom shader patch because `xb.OcclusionUtils.addOcclusionToShader` only supports built-in three.js materials — the patch anchors on MToon's `litFactor` uniform instead. Known limitations inherited from the occlusion system: the map lags animation by one frame, is rendered mono from the left eye, and forcing `transparent = true` can produce minor self-sorting artifacts on layered avatar meshes.

---

## Known gaps

- **`.vrma` format** — `@pixiv/three-vrm-animation` (VRM Animation format) is not used. Mesh2Motion GLB retargeting is sufficient for walk/idle.
- **First-person mode** — VRM first-person metadata (head mesh hiding) is not configured.
- **MToon** — MToon anime-style materials may render as standard material fallback on some devices.
- **Quest test** — simulator tested and working. Depth sensing is enabled via `options.enableDepth()` using the standard WebXR Depth Sensing API, which Quest 3 supports, but on-device testing has not been done yet.

---

## Dependencies

| Package            | Version   | Source      |
| ------------------ | --------- | ----------- |
| `three`            | `0.186.0` | CDN         |
| `@pixiv/three-vrm` | `^3`      | CDN         |
| `xrblocks`         | `0.21.1`  | Local build |
| `xrblocks/addons/` | `0.21.1`  | Local build |

All other dependencies (rapier3d, lit) are CDN — see the import map in `index.html`.

---

## Potential Next steps

- Extract `VRMAvatar.js` into `src/addons/vrm/` as a proper XRBlocks addon with TypeScript types
- Integrate `@pixiv/three-vrm-animation` for `.vrma` support and AI-driven expressions
