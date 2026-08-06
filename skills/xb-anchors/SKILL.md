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

## The platform runs out of anchors

`persist()` returns `false` when the platform refuses a handle, and the reason is on
`anchors.lastError`. Show it, because one of the reasons is not something an app can
design around:

```
InvalidStateError: Failed to execute 'requestPersistentHandle' on 'XRAnchor':
Maximum number of anchors reached!
```

The number of persistent anchors a browser can hold is capped **across every origin**,
not per site, so a headset can refuse yours because of anchors saved by a completely
different page ([immersive-web/anchors#79](https://github.com/immersive-web/anchors/issues/79)).
Browsers are not currently allowed to evict old anchors to make room, so once it is full
it stays full until something releases handles.

The budget belongs to the browser and is shared by every site in it, so a page visited
months ago can be holding the slot yours needs. It is also small: on a Quest 3 in August
2026 the sixth anchor was refused. Plan for a handful rather than hundreds, and expect to
meet the limit during ordinary testing.

What follows from that:

- Treat a failed `persist()` as normal, not exceptional, and say so in your UI. Silently
  dropping it leaves someone believing their content was saved.
- Release handles as soon as they stop being useful. `delete()` and `forgetAll()` do this
  for anchors they know about.
- Never lose the record of a handle you created. A handle nobody names cannot be released
  and holds its slot until the browser's storage is cleared at the device level.
- Do not read `platformHandles()` back to confirm a release. The list does not
  necessarily shrink during a session, and it contains a blank entry even on an origin
  that has never saved anything.

### Which cleanup to offer

|                               | reaches                                        | use for                          |
| ----------------------------- | ---------------------------------------------- | -------------------------------- |
| `delete(id)`                  | one anchor and its handle                      | the user removed one thing       |
| `forgetAll()`                 | every handle this store recorded               | the user cleared this app        |
| `releaseAllPlatformHandles()` | every handle the origin holds, recorded or not | recovery when the budget is full |

`forgetAll()` is the everyday one. `releaseAllPlatformHandles()` exists because records
and handles can drift apart: clear a site's storage, or lose a record any other way, and
the handle is stranded with nothing able to name it. It is origin wide, so a second app
on the same origin loses its anchors too. Offer it as an explicit user action, worded so
that is obvious, and never run it automatically.

### When the budget is full anyway

In order, least destructive first:

1. `releaseAllPlatformHandles()` from within the app. Frees everything the origin still
   names, which is enough whenever the records survived.
2. Clear the **browser app's data** from the headset's storage settings, not the browsing
   data from inside the browser. The two are different: clearing browsing data empties
   the handle list while leaving the anchors themselves in place, which looks like a full
   budget with nothing in it.
3. Re-running space setup does not help. Anchors outlive the boundary.

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
