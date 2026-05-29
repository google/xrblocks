# VRM Avatar — XRBlocks Demo

A point-to-walk VRM avatar demo built on [XRBlocks](https://github.com/google/xrblocks). Click (or pinch in XR) anywhere on the floor and the avatar walks there, then returns to idle. Spring bones, facial expressions, and Mixamo animation retargeting all work out of the box.

![Demo: point-to-walk avatar in XRBlocks simulator]()

---

## What it does

- Loads any `.vrm` file using `@pixiv/three-vrm`
- Retargets Mixamo FBX animations onto the VRM humanoid skeleton
- Crossfades between idle and walk animations
- Walks the avatar to a floor point selected by the user via controller ray or mouse click
- Procedural eye blink using VRM expression manager
- Works in the XRBlocks desktop simulator and in WebXR

---

## Project structure

```
demos/vrm-avatar/
  index.html          — entry point, import map, scene setup
  VRMAvatar.js        — utility class: VRM load, animation, blink, update()
  VRMAvatarScript.js  — xb.Script subclass: scene lifecycle, point-to-walk
  models/             — place your .vrm file here
  animations/         — place your Mixamo .fbx files here
```

---

## Assets required

The VRM model is loaded automatically via CDN and requires no manual download. The Mixamo animation files are **not included in the repo** and must be downloaded manually:

| File                     | Source                                                    |
| ------------------------ | --------------------------------------------------------- |
| `animations/Idle.fbx`    | [Mixamo](https://www.mixamo.com/) — free account required |
| `animations/Walking.fbx` | [Mixamo](https://www.mixamo.com/) — free account required |

### Downloading Mixamo animations

1. Go to [mixamo.com](https://www.mixamo.com/) and sign in with a free Adobe account.
2. Search for **Idle** — select any standing idle animation, set **In Place** if available.
3. Click **Download**, choose **FBX Binary (.fbx)**, and select **Without Skin**.
4. Save the file as `animations/Idle.fbx` inside `demos/vrm-avatar/`.
5. Repeat for **Walking**, saving as `animations/Walking.fbx`.

The FBX files cannot be redistributed in this repo due to Mixamo's license terms.

---

## Key implementation notes

**Why not `xb.ModelViewer`?**
`VRMLoaderPlugin` must be registered on the `GLTFLoader` instance before the load call. `xb.ModelViewer` is a display container with no loader injection point, so `GLTFLoader` is used directly.

**Mixamo retargeting**
`VRMAvatar.js` includes a full `MIXAMO_VRM_RIG_MAP` (sourced from the three-vrm examples) and a `retargetMixamoClip()` function that remaps bone names and corrects rest-pose rotations. Root motion on the hips X/Z axes is zeroed out to prevent position drift on loop.

**Depth mesh floor detection**
On device, `onSelectEnd` raycasts against `xb.core.depth.depthMesh` for accurate floor hits. When depth mesh is not enabled, it falls back to intersecting the y=0 ground plane.

---

## Known gaps

- **`.vrma` format** — `@pixiv/three-vrm-animation` (VRM Animation format) is not used. Mixamo FBX retargeting is sufficient for walk/idle.
- **First-person mode** — VRM first-person metadata (head mesh hiding) is not configured.
- **MToon** — MToon anime-style materials load correctly at `three@0.184.0` but may render as standard material fallback on some devices.
- **Quest test** — simulator tested and working. Depth sensing is enabled via `options.enableDepth()` using the standard WebXR Depth Sensing API, which Quest 3 supports, but on-device testing has not been done yet.

---

## Dependencies

| Package            | Version   | Source      |
| ------------------ | --------- | ----------- |
| `three`            | `0.184.0` | CDN         |
| `@pixiv/three-vrm` | `^3`      | CDN         |
| `xrblocks`         | `0.12.0`  | Local build |
| `xrblocks/addons/` | `0.12.0`  | Local build |

All other dependencies (troika, rapier3d, lit) are CDN — see the import map in `index.html`.

---

## Potential Next steps

- Extract `VRMAvatar.js` into `src/addons/vrm/` as a proper XRBlocks addon with TypeScript types
- Integrate `@pixiv/three-vrm-animation` for `.vrma` support and AI-driven expressions
