---
sidebar_position: 7
title: Interaction & Manipulation
---

# Interaction and manipulation

XR Blocks uses one interaction pipeline for mouse, gaze, hand rays, tracked controllers,
direct touch, reticles, UI, and automatic object manipulation. The pipeline resolves one
logical target and one physical hit surface for each input source.

## Object-targeted callbacks

Put object callbacks on a `Script` or `MeshScript`. Events bubble from the hit object to
ancestor scripts. Return `true` to stop propagation.

```js
class SelectableCube extends xb.MeshScript {
  constructor() {
    super(
      new THREE.BoxGeometry(0.2, 0.2, 0.2),
      new THREE.MeshStandardMaterial({color: 0xfbbc04})
    );
  }

  onObjectSelectStart(event) {
    console.log(event.target, event.surface, event.source.controller);
    this.material.color.set(0x4285f4);
    return true;
  }

  onObjectSelectEnd(event) {
    console.log(event.completed, event.reason);
    this.material.color.set(0xfbbc04);
    return true;
  }
}
```

`event.target` is the logical object selected by the user. `event.surface` is the physical
mesh that produced the ray or touch hit. `event.currentTarget` is the script receiving the
bubbled event.

## Selection completion

`onSelectEnd` and `onObjectSelectEnd` include:

- `completed`: true only when a valid selection completes.
- `reason`: `released`, `released-outside`, `source-lost`, `pointer-cancel`, `removed`,
  `hidden`, or `disabled`.

Use `onSelect` for a global completed selection. Use `onLongSelect` or
`onObjectLongSelect` for a held selection. Configure the delay with
`options.interaction.longSelectDuration`.

## Hover, direct touch, and grab

Available object callbacks include:

- `onHoverEnter`, `onHovering`, and `onHoverExit`.
- `onObjectTouchStart`, `onObjectTouching`, and `onObjectTouchEnd`.
- `onObjectGrabStart`, `onObjectGrabbing`, and `onObjectGrabEnd`.

Direct touch selects for the full contact by default. Call `event.preventDefault()` in
`onObjectTouchStart` when an object must handle touch without starting selection or
automatic manipulation.

## Current target queries

```js
const hit = xb.user.getRayIntersection(0);
const objectHit = xb.user.getIntersectionAt(object, 0);

xb.user.isPointingAt(object);
xb.user.isSelectingAt(object);
xb.user.isManipulating(object);
```

## Automatic manipulation

Configure manipulation on the object. Do not create a separate manager.

```js
object.xb = {
  manipulation: {
    actions: {
      translate: {faceCamera: true},
      rotate: {axis: 'y'},
      scale: true,
    },
  },
};
```

`manipulation: true` enables the default action set. `UICard` and `ModelViewer` also accept
`manipulation` in their constructors.

Use `onObjectManipulate(event)` to observe `start`, `move`, `end`, and `cancel` phases.
Call `event.preventDefault()` during a start event to suppress the automatic transform.

See `templates/02_object_interaction` for ray, direct-touch, and manipulation behavior.
