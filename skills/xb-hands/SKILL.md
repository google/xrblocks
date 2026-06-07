---
name: xb-hands
description: >-
  Add WebXR hand tracking to an XR Blocks app — enable hand joints, optional joint
  and mesh visualizations, pinch-to-select, and direct touch/grab of meshes. Use
  when you need the user's hands (index-finger touch, grab, wrist/joint positions)
  rather than just controller rays, or want to visualize hands in the simulator's
  pose mode. Covers `enableHands()`, the `options.hands.*` flags, `xb.user.hands`
  (`getIndexTip`, `getWrist`), and the object touch/grab lifecycle hooks. For named
  gestures (fist, point, spread…) use xb-gestures.
---

# xb-hands: hand tracking

## Setup

```js
const options = new xb.Options();
options.enableReticles();
options.enableHands();

options.hands.enabled = true;
options.hands.visualization = true; // render hands
options.hands.visualizeJoints = true; // show joint spheres
options.hands.visualizeMeshes = true; // show hand meshes

// Develop hands on desktop: simulator pose mode.
options.simulator.defaultMode = xb.SimulatorMode.POSE;
xb.init(options);
```

## Reacting to hands

`xb.user` drives direct interaction. Pinch maps to select, so `onSelectStart/End` already
covers "pinch". For direct touch and grab of meshes in the scene, use the object-targeted
hooks on your `Script` (return `true` to stop propagation):

```js
class Grabbable extends xb.Script {
  init() {
    this.box = new THREE.Mesh(/* … */);
    this.add(this.box);
  }
  onObjectTouchStart(e) {
    // index fingertip entered a mesh's bounds
    // e.handIndex (0|1), e.touchPosition: THREE.Vector3
  }
  onObjectGrabStart(e) {
    // touching + pinching
    // e.handIndex, e.hand: THREE.Object3D (the wrist)
  }
  onObjectGrabbing(e) {}
  onObjectGrabEnd(e) {}
}
```

## Reading joints directly

```js
const hands = xb.user.hands; // present once enableHands() + tracking
if (hands) {
  const tip = hands.getIndexTip(0); // index fingertip of hand 0 (THREE.Object3D)
  const wrist = hands.getWrist(1);
  if (tip) tip.getWorldPosition(this._v3);
}
xb.user.isSelecting(0); // is hand 0 pinching?
```

## Notes

- `numHands` is 2; hand index `0`/`1`. `xb.user.handedness` (0 left, 1 right, 2 both).
- Joint name constants are exported (`HandJointNames`).
- Touch detection uses each mesh's bounding box vs. the index fingertip; grab = touch +
  pinch. See [`src/core/User.ts`](../../src/core/User.ts) for exact semantics.
- See `templates/2_hands` for a complete example.
