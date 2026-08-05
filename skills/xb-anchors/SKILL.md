---
name: xb-anchors
description: >-
  Pin content to a real place with WebXR spatial anchors, and bring it back in a
  later session. Use when virtual content must stay put as the headset refines its
  map of the room, or when an app should remember where things were left. Covers
  `enableAnchors()`, `enableAnchorPersistence()`, creating and restoring anchors,
  the `capability` states, and the desktop fallback that lets anchor code be
  developed without a headset. Pair with xb-world for detecting what to anchor to.
---

# xb-anchors: spatial anchors & persistence

An anchor tells the platform "keep this exactly here". As the headset improves its
understanding of the room, anchored content is corrected along with it, which plain
world coordinates are not. With persistence enabled, anchors can also be restored in
a later session, so an app can remember where things were left. See `demos/anchors`.

## Why not just store coordinates

World coordinates are relative to the session's tracking origin. That origin is not
guaranteed to be the same next time, so coordinates saved to storage can come back
meaning a different place. Anchors avoid this: the platform re-localises them.

## Enable

```js
const options = new xb.Options();
options.world.enableAnchors(); // anchors for this session only
xb.init(options);
```

To also carry anchors into later sessions:

```js
options.world.enableAnchorPersistence();
```

The `anchors` WebXR feature is requested as optional, so a browser without it still
enters the session and the subsystem reports itself unsupported.

## Create and persist

```js
const anchors = xb.core.world.anchors;

const pose = new XRRigidTransform({x, y, z}, {x: 0, y: 0, z: 0, w: 1});
const tracked = await anchors.create(pose, 'coffee table');
if (tracked) {
  await anchors.persist(tracked.id); // survives the session
}
```

`create()` returns `null` rather than throwing when the platform cannot anchor, so
callers can degrade instead of guarding every call.

## Restore

```js
for (const result of await anchors.restoreAll()) {
  if (result.status === 'restored') {
    attachContent(result.anchor); // the tracked anchor, ready to use
  }
}
```

`restoreAll()` is safe to call more than once; already-restored records are reported
as restored rather than duplicated.

A `not-found` result is normal, not a failure: re-localisation is probabilistic, and
a handle saved in one room will not resolve in another. One failure never stops the
rest of the batch.

## Follow an anchor each frame

```js
update(time, frame) {
  const referenceSpace = xb.core.renderer.xr.getReferenceSpace();
  const pose = anchors.getPose(id, referenceSpace);
  if (pose) mesh.position.copy(pose.transform.position);
}
```

Read poses inside the frame loop. An `XRFrame` is only valid during its own callback,
so `getPose` returns `null` rather than throwing if called later.

## Capability

Check `anchors.capability` before promising anything in your UI:

| value          | meaning                                                 |
| -------------- | ------------------------------------------------------- |
| `persistent`   | anchors work and survive sessions                       |
| `session-only` | anchors work, but cannot be saved                       |
| `simulated`    | no platform anchors; poses are held locally (see below) |
| `unsupported`  | no anchor support at all; `create()` returns `null`     |

## Developing without a headset

The desktop simulator has no tracking system to anchor against, so anchor code would
otherwise be untestable until you have a device:

```js
options.world.anchors.simulatorFallback = true;
```

This holds poses locally and reports `capability === 'simulated'`. It is off by
default and deliberately named: it proves your wiring, never that a device can
re-localise anything. Say so in your UI, or a desktop run will look like evidence
that anchoring works.

## Storage

Persistent handles are saved to `localStorage` under `options.world.anchors.storageKey`,
capped at `maxStoredAnchors` (oldest evicted first). Supply your own `AnchorStore` to
put them somewhere else.

A persistent handle is a durable identifier for a physical place. Keep handles local
unless you have a reason to do otherwise, and treat them as you would any other
location data.
