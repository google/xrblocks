---
name: xb-context
description: >-
  Read agent-facing scene context from `xb.context`: semantic trees with stable
  context ids, visible-object state, and Set-of-Mark screenshot labels. Use when
  an app or agent needs compact XR scene structure for selecting, inspecting, or
  acting on objects without traversing raw Three.js internals. Covers
  `options.enableContext()`, `options.enableSceneContext()`,
  `options.enableVisibleObjectsContext()`, `options.enableSetOfMarkContext()`,
  and `xb.context.scene.runContextDetection()`.
---

# xb-context — agent-facing scene context

`xb.context.scene` summarizes the XR scene for agents. It is not DOM-based: it
traverses XR Blocks, UIBlocks, and meaningful Three.js objects, omitting internal
helpers such as `XRSystems` descendants and depth meshes.

## Enable Context

```js
const options = new xb.Options();
options.enableContext(); // semantic tree + visible objects + SOM
```

For narrower streams:

```js
options.enableSceneContext(); // semantic tree only
options.enableVisibleObjectsContext(); // semantic tree + view visibility
options.enableSetOfMarkContext(); // semantic tree + visible objects + SOM image
options.context.scene.pollingIntervalMs = 3000;
```

Disabled modules match the `xb.world` shape: `xb.context.scene` is `undefined`
unless context is enabled before `xb.init(options)`.

## One-Off Snapshot

Use one scene context call when you need multiple streams from the same snapshot:

```js
const context = await xb.context.scene.runContextDetection({
  semanticTree: true,
  visibleObjects: true,
  setOfMark: true,
});

console.log(context.semanticTree.nodes);
console.log(context.visibleObjects.nodes);
console.log(context.setOfMark.marks);
```

Each semantic node has a stable `ctx_*` id, role, name, parent/children
relationships, object id, visibility flags, and optional `view` state. SOM marks
reuse stable labels so labels do not realign between app snapshots.

## Continuous Polling

```js
const client = {};
xb.context.scene.start(client);
// read xb.context.scene.tree / visibleObjects / setOfMark after polling
xb.context.scene.stop(client);
```

Continuous detection uses `options.context.scene.pollingIntervalMs` and shares a
single poll across enabled context streams.

## Acting On Context Ids

Remote/embodied action tools can target context nodes with the structured target:

```json
{"type": "contextNode", "id": "ctx_7"}
```

The scene detector resolves that id through its current semantic snapshot, so do
not infer targets from the `ctx_` prefix yourself.
