---
sidebar_position: 8.5
title: Placement Scripts
---

# Placement scripts

Placement scripts keep an object in a useful spatial relationship after it is
in the scene. They can keep a card near the viewer, make a label follow a
moving object, face content toward the camera, move an object in an orbit, or
animate visibility.

They are different from one-time room placement. Use
`xb.world.placeOnHorizontalSurface()` to find a physical surface once. Use a
placement script when XR Blocks must update the object's transform over time.

## How they work

A placement script is a `Script` child that changes its parent object. Add the
script to the object that must move. Add the object itself to the XR Blocks
scene.

```text
XR Blocks scene
└─ statusCard                 <- the object that moves
   ├─ UIText
   ├─ FollowHead             <- changes statusCard.position
   └─ FaceCamera             <- changes statusCard.quaternion
```

```js
import * as THREE from 'three';
import * as xb from 'xrblocks';

const statusCard = new xb.UICard({
  size: {width: 0.42, height: 0.16},
  children: [new xb.UIText({text: 'Ready'})],
});

statusCard.add(
  new xb.FollowHead({
    offset: new THREE.Vector3(0, -0.12, -0.8),
    smoothing: 0.1,
  }),
  new xb.FaceCamera({mode: 'spherical', smoothing: 0.1})
);

xb.add(statusCard);
xb.init(new xb.Options());
```

XR Blocks finds the child scripts and calls their `init()` and `update()`
methods. Do not call those lifecycle methods yourself.

Placement scripts do not need an `Options.enable*()` call. They use the camera
and frame timer that XR Blocks creates during normal initialization.

All built-in placement scripts support objects under transformed parents. They
read and write the correct world or local transform as required.

## Choose a script

| Script                                                      | Transform or state that it controls | Typical use                                                  |
| ----------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------ |
| [`FollowHead`](/api/classes/FollowHead)                     | Position                            | A view-relative HUD or tool palette                          |
| [`FollowObject`](/api/classes/FollowObject)                 | Position, rotation, or both         | A label, companion, or proxy that tracks another object      |
| [`FaceCamera`](/api/classes/FaceCamera)                     | Rotation                            | Readable world-space UI and labels                           |
| [`Orbit`](/api/classes/Orbit)                               | Position                            | Satellites, indicators, and animated displays around a focus |
| [`VisibilityTransition`](/api/classes/VisibilityTransition) | Visibility and scale                | Show, hide, or toggle content without an abrupt change       |

These scripts do not create visible content. They control the parent that owns
them.

## Keep content near the viewer

`FollowHead` treats `offset` as a camera-space offset in meters. Negative Z is
in front of the viewer. The script converts this offset to the coordinate
space of the object's parent each frame.

```js
const follow = new xb.FollowHead({
  offset: new THREE.Vector3(0.3, -0.2, -0.9),
  smoothing: 0.08,
});

card.add(follow);
```

`smoothing` controls how quickly the object reaches the target position. A
higher value responds faster. The default is `0.1`.

Combine `FollowHead` with `FaceCamera` when the object must follow the viewer
and remain readable. The scripts control different transform parts, so they do
not compete.

```js
card.add(
  new xb.FollowHead({
    offset: new THREE.Vector3(0, -0.15, -0.75),
  }),
  new xb.FaceCamera({mode: 'spherical'})
);
```

Use `UIOverlay` instead when the content must be fixed to the 2D viewport.
`FollowHead` is for a real world-space object that moves relative to the head.

## Follow another object

`FollowObject` copies the target's world position, world rotation, or full
pose. `positionOffset` uses world axes. `rotationOffset` is applied after the
target's world rotation, so it keeps a relative orientation to the target.

```js
const label = new xb.UICard({
  size: {width: 0.28, height: 0.1},
  children: [new xb.UIText({text: 'Robot A'})],
});

label.add(
  new xb.FollowObject({
    target: robot,
    mode: 'position',
    positionOffset: new THREE.Vector3(0, 0.35, 0),
  }),
  new xb.FaceCamera({mode: 'spherical'})
);

xb.add(label);
```

Choose the mode based on which transform parts the follower must copy:

| Mode       | Result                                             |
| ---------- | -------------------------------------------------- |
| `position` | Copies world position and adds `positionOffset`    |
| `rotation` | Copies world rotation and applies `rotationOffset` |
| `pose`     | Copies both position and rotation                  |

The default mode is `position`. Use it with `FaceCamera` for a label: the first
script controls position and the second controls rotation. Do not use
`mode: 'pose'` with `FaceCamera`, because both scripts would write the
follower's rotation each frame.

Use a quaternion for a rotation offset:

```js
const quarterTurn = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(0, Math.PI / 2, 0)
);

model.add(
  new xb.FollowObject({
    target: controllerModel,
    mode: 'pose',
    rotationOffset: quarterTurn,
  })
);
```

## Face content toward the camera

`FaceCamera` rotates its parent toward the active camera.

```js
card.add(
  new xb.FaceCamera({
    mode: 'cylindrical',
    smoothing: 0.1,
  })
);
```

| Mode          | Behavior                                            | Typical use                               |
| ------------- | --------------------------------------------------- | ----------------------------------------- |
| `cylindrical` | Turns around the vertical axis and stays upright    | Panels and signs at about eye height      |
| `spherical`   | Turns vertically and horizontally toward the camera | Labels above, below, or around the viewer |

The default mode is `cylindrical`. A higher `smoothing` value responds faster.
The default is `0.1`.

`UICard` can accept a `TransformScript` as a direct child. Nested UI elements
such as `UIPanel` accept UI children, not placement scripts. Attach the script
to the card root that must move.

## Orbit around a target

`Orbit` moves its parent around a target object. The parent and target must be
separate scene branches. Neither object can be the other object's ancestor or
descendant.

```js
const focus = new THREE.Mesh(
  new THREE.SphereGeometry(0.08),
  new THREE.MeshStandardMaterial({color: 0xfbbc04})
);
focus.position.set(0, 1.2, -1);

const satellite = new THREE.Mesh(
  new THREE.SphereGeometry(0.04),
  new THREE.MeshStandardMaterial({color: 0xea4335})
);
satellite.add(
  new xb.Orbit({
    target: focus,
    radius: 0.35,
    period: 6,
    path: 'elliptical',
    eccentricity: 0.3,
    inclination: Math.PI / 5,
    precessionPeriod: 12,
    direction: 'counterclockwise',
    clearance: 0.02,
  })
);

xb.add(focus, satellite);
```

The main options are:

| Option             | Meaning                                           | Default                             |
| ------------------ | ------------------------------------------------- | ----------------------------------- |
| `target`           | Object at the focus of the orbit                  | Required                            |
| `radius`           | Semi-major radius in meters                       | `0.5`                               |
| `period`           | Seconds for one orbit                             | `20`                                |
| `path`             | `circular` or `elliptical`                        | `circular`                          |
| `frame`            | `world`, `target`, or `view` reference frame      | `world`                             |
| `eccentricity`     | Ellipse shape in the range `0` to less than `1`   | `0.2` for an ellipse, otherwise `0` |
| `inclination`      | Initial orbital-plane tilt in radians             | `0`                                 |
| `precessionPeriod` | Seconds for one rotation of the orbital plane     | No precession                       |
| `direction`        | `clockwise` or `counterclockwise`                 | `counterclockwise`                  |
| `clearance`        | Extra minimum gap between object bounds in meters | `0`                                 |

For `frame: 'world'`, the orbital plane stays aligned with the world. For
`frame: 'target'`, it follows the target rotation. For `frame: 'view'`, it is
oriented relative to the active camera.

`Orbit` measures the world bounds of the target and the orbiting object. It
increases the effective radius when needed to prevent the captured bounds from
overlapping. Call `orbit.resume()` after geometry or scale changes so the
script captures the new bounds.

```js
const orbit = new xb.Orbit({target: focus, radius: 0.2});
satellite.add(orbit);

satellite.scale.setScalar(2);
orbit.resume(); // Refresh bounds and restart from the current position.
```

## Animate show and hide

`VisibilityTransition` changes its parent's scale and `visible` state. Keep a
reference to the script so application code can call `show()`, `hide()`, or
`toggle()`.

```js
const transition = new xb.VisibilityTransition({duration: 0.3});
detailsCard.add(transition);

const toggleButton = new xb.UIButton({
  label: 'Details',
  onClick: () => transition.toggle(),
});
```

`duration` is in seconds. When hiding starts, the script captures the parent's
current scale. It restores that scale when the object is shown again. Do not
replace the scale from another per-frame script while the transition runs.

## Use placement scripts with manipulation

Placement scripts work with automatic object manipulation. XR Blocks suspends
the direct `TransformScript` children while the user manipulates their parent.
It resumes them when the manipulation ends or is canceled.

```js
const card = new xb.UICard({
  size: {width: 0.4, height: 0.2},
  manipulation: true,
});

const follow = new xb.FollowHead({
  offset: new THREE.Vector3(0, 0, -0.8),
});
card.add(follow);
```

On resume, scripts that track a spatial relationship use the manipulated pose
as their new baseline:

- `FollowHead` captures a new camera-space offset.
- `FollowObject` captures new world position and rotation offsets.
- `Orbit` restarts from the manipulated position and refreshes overlap bounds.
- `FaceCamera` resumes facing the camera.
- `VisibilityTransition` continues to use its visibility transition state.

You can use the same behavior for a transform that your application controls.
Suspend the script, move the object, and then resume it.

```js
follow.suspend();
card.position.set(0.4, 1.4, -1);
follow.resume(); // Preserve this pose as the new follow relationship.
```

## Combine scripts safely

One object can have more than one placement script when each script controls a
different part of the object state.

| Combination                                      | Result                                                  |
| ------------------------------------------------ | ------------------------------------------------------- |
| `FollowHead` + `FaceCamera`                      | View-relative world-space content that faces the viewer |
| `FollowObject` in `position` mode + `FaceCamera` | A readable label that tracks an object                  |
| `Orbit` + `FaceCamera`                           | Orbiting content that stays oriented toward the viewer  |
| A position script + `VisibilityTransition`       | Moving content that can animate in and out              |

Avoid combinations in which two scripts write the same transform part. For
example, do not combine `FollowHead` with `Orbit`, because both write position.
Do not combine `FollowObject` in `rotation` or `pose` mode with `FaceCamera`,
because both write rotation.

## Place once, then keep updating

One-time surface placement and continuous placement scripts can be used
together. Place an object on a detected surface first, then attach behavior
that must continue.

```js
class SurfaceLabel extends xb.Script {
  async init() {
    const card = new xb.UICard({
      size: {width: 0.3, height: 0.12},
      children: [new xb.UIText({text: 'Placed'})],
    });
    card.visible = false;
    this.add(card);

    const placed = await xb.world.placeOnHorizontalSurface(card, {
      seconds: 15,
    });
    card.visible = placed;

    if (placed) {
      card.add(new xb.FaceCamera({mode: 'cylindrical'}));
    }
  }
}

const options = new xb.Options();
options.enableDepth();
options.enablePlaneDetection();

xb.add(new SurfaceLabel());
xb.init(options);
```

See `templates/03_spatial_placement` for the one-time surface placement flow.
See `demos/interaction_playground/main.js` for all placement scripts together
with UI and automatic manipulation.
