---
sidebar_position: 7
title: Interaction & Manipulation
---

# Interaction and manipulation

XR Blocks uses one interaction pipeline for mouse, gaze, hand rays, tracked
controllers, direct touch, reticles, built-in UI, and automatic manipulation.
For each input source, the pipeline resolves one public hit surface and one
logical target. Private renderer meshes are normalized to their public owner.

```text
input source
  -> one ordered hit list
  -> physical blocking surface
  -> logical target and ancestor path
  -> hover, capture, selection, semantic control, or manipulation
  -> one shared event vocabulary
```

Application code does not add a UI raycaster or sort a second set of UI hits.

## Event fields

Object callbacks receive resolved event data:

| Field           | Meaning                                                                                                                     | Lifetime                                                                               |
| --------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `source`        | Logical mouse, gaze, hand, controller-ray, direct-touch, or simulator source; `source.controller` identifies its controller | Stable for the callback                                                                |
| `target`        | Logical object that owns the selected behavior                                                                              | Captured for the action; optional for a global event without a target                  |
| `surface`       | Public object representing the resolved hit surface; private renderer meshes are normalized to their public owner           | Captured for targeted actions; optional for a global event                             |
| `currentTarget` | Script currently receiving the bubbled callback                                                                             | Changes at each ancestor callback                                                      |
| `intersection`  | Cloned current ray intersection on the captured surface                                                                     | Present only while the ray still hits that surface; often absent after release outside |
| `touchPosition` | World-space direct-contact position                                                                                         | Present on touch and grab events instead of a ray intersection                         |

`target` and `surface` can be different. An explicit hit registration can map a
private physical mesh to a public surface while application behavior belongs to
another logical ancestor. The private mesh is not part of the public event.

```js
class SelectableCube extends xb.MeshScript {
  constructor() {
    super(
      new THREE.BoxGeometry(0.2, 0.2, 0.2),
      new THREE.MeshStandardMaterial({color: 0xfbbc04})
    );
  }

  onObjectSelectStart(event) {
    console.log({
      sourceType: event.source.type,
      controller: event.source.controller,
      target: event.target,
      surface: event.surface,
      receiver: event.currentTarget,
      point: event.intersection?.point,
    });
    this.material.color.set(0x4285f4);
    event.stopPropagation();
  }

  onObjectSelectEnd(event) {
    console.log(event.completed, event.reason);
    this.material.color.set(0xfbbc04);
    event.stopPropagation();
  }
}
```

## Use the resolved hit

Inside an interaction callback, use the event's `target`, `surface`, and
`intersection`. Repeating a raycast inside the callback can observe a different
frame, ignore capture, or select a different physical surface.

Use current target queries only when code outside an event flow needs the
current state:

```js
const hit = xb.user.getRayIntersection(0);
const objectHit = xb.user.getIntersectionAt(object, 0);

xb.user.isPointingAt(object);
xb.user.isSelectingAt(object);
xb.user.isManipulating(object);
```

## Reticles present targeting

A reticle is a visual presentation of the resolved hit. It is not a data owner
and does not define another targeting API.

```js
const options = new xb.Options();
options.enableReticles();
options.enableDepth();
options.reticles.projectOnDepthMesh = true;
```

Read the hit from the interaction event or `xb.user.getRayIntersection()`. The
projection option changes where the reticle is drawn when depth is available;
it does not create or store a separate intersection contract.

## Propagation and default behavior

These controls solve different problems:

| Control                   | Meaning                                                             | Where available                                                       |
| ------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `event.stopPropagation()` | Stop the targeted event from continuing to later ancestor scripts   | Object select, hover, touch, grab, and manipulation callback dispatch |
| `event.preventDefault()`  | Keep callbacks but suppress the framework's proposed default action | Touch start and automatic manipulation events                         |

For example, a child can handle touch without starting the default selection:

```js
onObjectTouchStart(event) {
  event.preventDefault(); // no default touch selection or manipulation
  this.showContactFeedback();
  event.stopPropagation(); // parent scripts do not also handle this touch-start event
}
```

Calling `stopPropagation()` does not suppress a default transform. Calling
`preventDefault()` does not stop ancestor callbacks. Use each only for its own
purpose.

## Selection completion and capture

`onSelectEnd` and `onObjectSelectEnd` include:

- `completed`: `true` only when a valid selection completes;
- `reason`: `released`, `released-outside`, `source-lost`, `pointer-cancel`,
  `removed`, `hidden`, or `disabled`.

Use `onSelect` for a global completed selection. Use `onLongSelect` or
`onObjectLongSelect` for a held selection. Configure the delay with
`options.interaction.longSelectDuration`. Manipulation captures do not also
emit long-select behavior.

## Touch, selection, grab, and manipulation are separate

Direct-hand interaction uses related but distinct lifecycles:

| State        | Starts when                                            | Continues with                     | Ends when                                             | Default relationship                            |
| ------------ | ------------------------------------------------------ | ---------------------------------- | ----------------------------------------------------- | ----------------------------------------------- |
| Touch        | Index tip enters a target                              | `onObjectTouching`                 | Tip leaves                                            | Starts selection unless touch start prevents it |
| Selection    | Source presses or direct touch starts                  | `onSelecting`                      | Release, contact end, or cancellation                 | Owns completion and end reason                  |
| Grab         | A touching hand pinches                                | `onObjectGrabbing`                 | Pinch ends or contact is lost                         | Can start direct manipulation                   |
| Manipulation | A selected source claims an enabled manipulation owner | `onObjectManipulate` with `update` | Release, cancel, owner invalidation, or action change | Applies a proposed transform unless prevented   |

Typical direct sequence:

```text
touch start
  -> select start
  -> touch/selecting updates
  -> grab start
  -> manipulation start/update
  -> grab end
  -> manipulation end
  -> touch end
  -> select end
```

Releasing a pinch can end grab and manipulation while touch and selection
continue. Call `event.preventDefault()` in touch start when contact must not
start the default selection.

## Automatic manipulation

Configure manipulation on the owner object. Do not create a manager:

```js
object.xb = {
  manipulation: {
    actions: {
      translate: {faceCamera: true},
      rotate: {axis: 'y', space: 'world'},
      scale: {minScale: 0.5, maxScale: 2},
    },
  },
};
```

For a plain object, `manipulation: true` enables translate and scale and uses
translate as the surface action. `UICard` makes translation face the camera and
can display an edge. `ModelViewer` enables move, Y-axis rotate, and scale with
its own private interaction proxies.

Face-camera translation uses `mode: 'capsule'` by default. It keeps an object
upright within `0.25` meters above or below the camera, then tilts it toward the
viewer. Set `capsuleHalfHeight` to change that region, or select `cylindrical`
or `spherical` mode explicitly.

Use a handle when one surface must select a specific action:

```js
rotateHandle.xb = {manipulationHandle: {action: 'rotate'}};
object.add(rotateHandle);
```

`onObjectManipulate(event)` observes `start`, `update`, `end`, and `cancel`.
The event includes `action`, `owner`, primary `source`, and all active
`sources`. Action-specific events also contain the proposed position, rotation,
or scale values. Call `event.preventDefault()` during `start` to replace the
automatic transform for that phase.

## Concurrency and two-source scale

Manipulation state is stored per owner, not in one global drag slot:

- different sources can manipulate different objects at the same time;
- one source has only one active role;
- a second source can join one active scale-enabled owner for two-source scale;
- the first source remains the primary owner of that session;
- releasing the auxiliary source ends scale and resumes the primary configured
  action when one exists;
- hiding, removing, reparenting, disabling, or invalidating an active owner
  cancels its session.

Keep application state per object or owning script. Do not store the active
object in one application-wide `draggedObject` field if simultaneous
manipulation is allowed.

## Placement scripts during manipulation

XR Blocks suspends direct `TransformScript` children of a manipulation owner.
It resumes and rebases them after end or cancel. This prevents a follow, face,
or orbit update from fighting the user's transform.

Read [Placement scripts](Placement.md) for supported combinations, suspension,
manual rebasing, and one-time surface placement.

## Visual, depth, and pointer participation

Opacity, depth behavior, and interaction are independent. For custom Three.js
objects, use `material.depthTest` and `material.depthWrite` for depth and
`object.xb.pointerEvents` for hit participation. `visible = false` removes an
object branch from rendering and interaction. A transparent object can still
write depth and block a pointer.

Built-in UI registers its private physical surfaces with this same interaction
resolver. Application code configures public UI components and does not access
or sort the private render meshes.

## Executable foundation

See `templates/02_object_interaction` for ray selection, direct touch, and
automatic manipulation. See `demos/interaction_playground/main.js` for
placement scripts, UI, handles, concurrent object behavior, and two-source
scale in one scene.
