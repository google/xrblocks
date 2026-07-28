# Selection and direct hands

Use this reference for scene-wide hooks, ray-targeted objects, or direct hand
contact. The authoritative event declarations are in
[`src/core/Script.ts`](../../../src/core/Script.ts); dispatch semantics are in
[`src/core/User.ts`](../../../src/core/User.ts).

## Select the ownership level

| Intent                    | API                                                          | Event data                               | Desktop path                                                 |
| ------------------------- | ------------------------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------ |
| Scene-wide click or pinch | `onSelectStart`, `onSelecting`, `onSelectEnd`, `onSelect`    | `event.target` is the controller         | User or Pointer Lock mode; primary click                     |
| Scene-wide tracked grip   | `onSqueezeStart`, `onSqueezing`, `onSqueezeEnd`, `onSqueeze` | `event.target` is the controller         | Controller handoff; keyboard fallback if required by the app |
| Keyboard shortcut         | `onKeyDown`, `onKeyUp`                                       | `event.code`                             | Physical keyboard                                            |
| Pointed object            | `onObjectSelectStart`, `onObjectSelectEnd`                   | `event.target` is the controller         | User or Pointer Lock mode; point and click                   |
| Ray hover                 | `onHoverEnter`, `onHovering`, `onHoverExit`                  | controller object directly               | Move the simulator mouse ray                                 |
| Index-tip contact         | `onObjectTouchStart`, `onObjectTouching`, `onObjectTouchEnd` | `handIndex`, world-space `touchPosition` | Navigation/Pose or Hands/Controller mode                     |
| Contact plus pinch        | `onObjectGrabStart`, `onObjectGrabbing`, `onObjectGrabEnd`   | `handIndex`, wrist `hand` object         | Hands/Controller mode; Space toggles pinch                   |

Controllers are enabled by default. `options.enableControllers()` exists for
explicit configuration and runtime input can be toggled with
`xb.core.input.enableControllers()` / `disableControllers()`. Call
`options.enableReticles()` when pointing needs a visible target.

## Global versus object events

Global select hooks run on every active `Script`. Use them for scene-owned
commands. Object select hooks begin at the closest raycast mesh and walk up its
ancestors; place the hook on a `Script` that contains the hit mesh. Returning
`true` stops that object-select event at the current script.

Hover follows the same ancestor walk and may also return `true` to stop it.
Direct touch and grab call every `Script` ancestor; their return values are
ignored.

Avoid applying the same state transition in a global hook and an object hook:
both participate in the same select input. If a global script needs to know the
ray result, inspect `event.target` with the public input API:

```js
onSelectStart(event) {
  const hits = xb.core.input.intersectionsForController.get(event.target) ?? [];
  const nearest = hits[0]?.object;
}
```

## Direct hands

Enable hands before initialization and choose a simulator mode deliberately:

```js
const options = new xb.Options();
options.enableHands();
options.hands.visualization = true;
options.simulator.defaultMode = xb.SimulatorMode.CONTROLLER;
```

`SimulatorMode.POSE` is displayed as Navigation mode: it shows simulated hands
while mouse drag turns the camera and the pose panel/gamepad changes poses.
`SimulatorMode.CONTROLLER` is displayed as Hands mode: WASD/QE moves the active
hand, `T` switches hands, and Space toggles pinch.

Touch tests the index fingertip against each visible mesh's world-space bounding
box. Grab means that mesh is currently touched and that hand is selecting. This
is direct-contact interaction, not Rapier collision.

Use the handedness enum and guard live joint data:

```js
const hands = xb.user.hands;
const tip = hands?.getIndexTip(xb.Handedness.LEFT);
if (tip) tip.getWorldPosition(this._worldPosition);
```

The public names are `xb.Handedness`, `xb.HAND_JOINT_NAMES`, and
`xb.user.hands.getJoint/getIndexTip/getThumbTip/getWrist`. Left and right map to
`0` and `1`; `Handedness.NONE` asks `Hands` to use its dominant hand.

For a complete touch/grab lifecycle and a transform that preserves the initial
hand-to-object offset, copy the pattern in
[`templates/2_hands/HandsInteraction.js`](../../../templates/2_hands/HandsInteraction.js).
The simpler [hand tracking manual](../../../docs/docs/manual/Hands.mdx) describes
joint access.
