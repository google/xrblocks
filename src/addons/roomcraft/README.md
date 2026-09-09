# Roomcraft

Roomcraft turns a description into actual, manipulable 3D content, then applies follow-up instructions to the same scene. "Add a lamp", "make this blue", and "remove the bookshelf" produce validated scene edits rather than a text answer or generated JavaScript.

The add-on can compose trusted catalog assets or generate new procedural designs from primitive parts. A robot, sculpture, or piece of furniture does not need a predefined catalog entry: the planner describes its parts, and Roomcraft builds them as one manipulable object. This is bounded procedural geometry, not a photorealistic text-to-mesh service or execution of generated JavaScript. The [interactive demo](../../../demos/roomcraft/) includes no-key handcrafted scenes and a compound robot example.

## Run the demo

From the repository root, run `npm run build:sdk`, then `npm run serve`, and open `http://127.0.0.1:8080/demos/roomcraft/`. See the [demo instructions](../../../demos/roomcraft/README.md) for controls and the optional downloaded model.

## Add it to an application

Use the demo's import map, including one shared copy of Three.js and the complete SDK `build/` directory.

```js
import * as THREE from 'three';
import * as xb from 'xrblocks';
import {Roomcraft, SCENE_PLAN_SCHEMA} from 'xrblocks/addons/roomcraft/index.js';

const options = new xb.Options();
options.enableAI();
options.enablePlaneDetection();
options.ai.promptForApiKey = true; // Local prototypes only.
options.ai.gemini.config = {
  responseMimeType: 'application/json',
  responseJsonSchema: SCENE_PLAN_SCHEMA,
};

const room = new Roomcraft();
room.position.set(0, 0, -2);
xb.add(room, new THREE.HemisphereLight(0xffffff, 0x556677, 3));
await xb.init(options);

await room.request('Create a small reading nook with a chair and a bookshelf.');
const placed = await room.placeOnSurface();
console.log(placed ? 'Placed on a detected surface.' : 'Still in preview.');
```

Initialization makes no model requests. The default planner uses the configured `xb.AI` facade. `SCENE_PLAN_SCHEMA` is an optional Gemini response schema; all plans are validated locally regardless of provider settings.

Catch rejected operations in the application's UI and show their errors. Failed validation, provider requests, or asset loads leave the previous scene intact. Only one operation can run at a time; `room.busy` and `statuschange` expose planning, loading, and placement state.

## Live editing and selection

Click or pinch an object to select it and use the SDK's native translation and two-source scaling. Selection belongs to a stable object ID, not to one of its private meshes. The next request receives that selected ID and a fresh snapshot of the objects' current transforms.

```js
await room.request('Add a floor lamp beside the chair.');
await room.request('Make this blue.'); // Uses the currently selected object.
await room.request('Remove the bookshelf.');
await room.undo();
await room.redo();

room.addEventListener('selectionchange', ({id}) => {
  console.log('Selected:', id);
});
room.addEventListener('change', ({layout}) => {
  console.log(layout.title, layout.objects.length);
});
```

Updates retain the same manipulation owner. Transform-only changes do not rebuild geometry. Model, color, and procedural design changes prepare replacement content before swapping it in; unrelated objects are untouched. Hand movement during a color-only or part-only request is preserved. A conflicting change during planning, or movement during asynchronous asset loading, rejects the edit instead of overwriting the user's work.

`room.getObject(id)` returns the stable Three.js owner when application code needs to change its transform. Do not reparent it, replace its children, or dispose its resources yourself.

## Generate and refine a new object

Start with an empty workshop, ask for a design, and select the returned object before using "this" or "it". The demo selects a newly added object automatically when a request adds exactly one.

```js
await room.applyLayout({title: 'Object workshop', objects: []});
const layout = await room.request(
  'Create a little robot with an antenna, two arms, and blue boots.'
);
const robot = layout.objects.find((object) => object.parts);
if (!robot) throw new Error('The planner did not return a procedural object.');
room.select(robot.id);

await room.request(
  'Give this longer arms and a backpack. Keep its position and overall scale.'
);
await room.placeOnSurface();
```

Every part is a `box`, `sphere`, `cylinder`, `cone`, `capsule`, or `torus` with a stable ID. Part positions specify centers in parent-local meters, rotations are XYZ Euler angles in radians, and sizes are physical width, height, and depth. A `parent` of `null` attaches the part to the object's origin; a part ID attaches it to that part's center and orientation. Parent size does not scale its children. Cylinder, cone, and capsule axes are Y; a torus lies in XY with its hole along Z.

All parts belong to one scene object, so pinching any part moves or scales the whole design. Refinement retains that outer owner and its hand-edited pose. The geometry is not automatically recentered, grounded, or rescaled when a limb grows or a backpack is added; the authored origin stays fixed. Place support parts with their bottoms at local Y=0, and update attached part positions when changing dimensions. Surface placement uses the full design bounds, including offset and rotated parts.

Use an object color of `#ffffff` to preserve individual part colors. Other object colors multiply every part's color; use targeted part edits when recoloring only a body, arm, or accessory.

## Layouts and edit plans

`room.layout` is a detached, scene-local snapshot. `applyLayout()` explicitly replaces the scene with a saved or hand-authored layout, while `applyPlan()` performs incremental edits without calling AI.

```js
await room.applyLayout({
  title: 'Reading corner',
  objects: [
    {
      id: 'reading-chair',
      asset: 'armchair',
      name: 'Reading chair',
      position: [0, 0, 0],
      rotation: 0,
      scale: [1, 1, 1],
      color: '#c87854',
    },
  ],
});

await room.applyPlan({
  title: 'Reading corner',
  edits: [
    {
      op: 'update',
      id: 'reading-chair',
      changes: {color: '#446688'},
    },
  ],
});

const json = JSON.stringify(room.layout, null, 2);
```

Every plan has a `title` and an `edits` array. An edit is `{op: 'add', object}`, `{op: 'update', id, changes}`, or `{op: 'remove', id}`. Updates include only changed fields, and a plan may edit each ID once. Unknown IDs, unknown fields, arbitrary URLs, invalid numbers, and unsupported asset names are rejected.

A scene object has exactly one content source: `asset` for a catalog entry, or `parts` for a new procedural design. Omit `asset` entirely when supplying `parts`. This small hand-authored recipe illustrates the format; a planner can create different parts and arrangements using the same protocol.

```js
await room.applyLayout({
  title: 'Part workshop',
  objects: [
    {
      id: 'robot',
      name: 'Robot body',
      position: [0, 0, 0],
      rotation: 0,
      scale: [1, 1, 1],
      color: '#ffffff',
      parts: [
        {
          id: 'body',
          name: 'Body',
          shape: 'box',
          parent: null,
          position: [0, 0.45, 0],
          rotation: [0, 0, 0],
          size: [0.4, 0.6, 0.25],
          color: '#88bb99',
        },
        {
          id: 'arm',
          name: 'Arm',
          shape: 'capsule',
          parent: 'body',
          position: [0.28, 0, 0],
          rotation: [0, 0, 0],
          size: [0.08, 0.4, 0.08],
          color: '#cc7733',
        },
      ],
    },
  ],
});

await room.applyPlan({
  title: 'Part workshop',
  edits: [
    {
      op: 'update',
      id: 'robot',
      changes: {},
      partEdits: [
        {op: 'update', id: 'arm', changes: {size: [0.08, 0.6, 0.08]}},
        {
          op: 'add',
          part: {
            id: 'backpack',
            name: 'Backpack',
            shape: 'box',
            parent: 'body',
            position: [0, 0, -0.25],
            rotation: [0, 0, 0],
            size: [0.3, 0.3, 0.2],
            color: '#4455aa',
          },
        },
      ],
    },
  ],
});
```

An object update can include `partEdits`, using `{op: 'add', part}`, `{op: 'update', id, changes}`, or `{op: 'remove', id}`. Use `changes: {}` for a part-only refinement. Part IDs are scoped to their scene object, and a batch may edit each part once. Parents can be added after their children in the same batch, but the final graph must contain every referenced parent and have no cycles. Removing a parent does not silently delete its children; remove or reparent them explicitly.

Use `changes.parts` to replace an entire design, or `changes.asset` to switch to a catalog asset while keeping the same outer owner. A source replacement cannot be combined with `partEdits`. Ordinary refinements should use part edits rather than replacing the whole recipe.

Object positions specify origins in scene-local meters: X right, Y up, and positive Z toward the viewer. Catalog assets are normalized to have their base at that origin; procedural designs retain their authored coordinates. Object rotation is an upright Y-axis angle in radians. Object scale multiplies the catalog dimensions or the authored part geometry. Colors use six-digit hexadecimal notation.

Model-authored and imported layouts are bounded to 48 objects, positions within 10 meters of the scene origin with nonnegative Y, and per-axis scale multipliers from 0.05 to 5. Plans have at most 96 edits. Direct hand transforms are preserved even if they move outside those planner input limits.

Each procedural object contains 1 to 48 parts with hierarchy depth at most 8; a scene contains at most 384 procedural parts. Individual sizes are 0.01 to 5 meters per axis, and parent-local centers are within +/-5 meters. A whole design must remain within +/-10 meters of its origin and be at most 10 meters across on each axis. There can be at most 96 part edits in one object update. Collection counts are enforced locally and described in the prompt rather than imposed on Gemini's nested response schema.

Undo and redo retain up to 20 successful scene commands, including part refinements and explicit replacements. `canUndo` and `canRedo` expose availability. Redo reuses the saved layout without another planner request, although catalog models may need to load again. Failed or no-op commands preserve the redo branch; a new successful edit clears it.

Redo requires the scene-local layout to still match the state restored by undo, so it refuses to overwrite later hand edits. Undoing after such a change starts a fresh redo branch. History does not record each drag or surface-placement action. Camera movement, selection changes, and placement of the whole composition do not by themselves invalidate redo.

Exported layouts preserve part definitions, hierarchy, colors, and edited object transforms, but contain no API keys, conversation history, or physical anchor. They are portable compositions, not persistent room mappings.

## Trusted asset catalogs

The default catalog is entirely procedural: `sofa`, `armchair`, `coffee-table`, `bookshelf`, `floor-lamp`, `plant`, `plinth`, `art-panel`, `arch`, `building`, `tree`, `box`, `sphere`, `cylinder`, and `cone`.

Catalog factories are convenient predefined assets, not the limit of what can be designed. Pass `catalog: []` when an application should author only new part-based objects.

Add a model from a URL controlled by the application, not returned by the model:

```js
import {
  createDefaultCatalog,
  createModelAsset,
  Roomcraft,
} from 'xrblocks/addons/roomcraft/index.js';

const room = new Roomcraft({
  catalog: [
    ...createDefaultCatalog(),
    createModelAsset({
      id: 'my-chair',
      description: "The application's preauthored lounge chair",
      size: [0.8, 0.9, 0.8],
      url: '/models/chair.glb', // Supply this asset in your application.
    }),
  ],
});
```

Only catalog IDs, descriptions, and physical dimensions are sent to the planner. The loader propagates network and decoding failures; it never substitutes a primitive for a failed model. Pass a renderer to `createModelAsset()` when the model requires KTX2 support.

A custom `SceneAsset` can instead provide `create(color)`, returning a fresh, detached `THREE.Object3D` or a promise for one. Roomcraft fits its bounding box to the declared width, height, and depth, centers X/Z, and grounds its base at Y=0. Choose dimensions matching a model's proportions to avoid stretching. Each result must own its geometry, materials, and textures; do not return shared cached resources. Removed, replaced, failed, or disposed content is released by Roomcraft.

## Surface placement and limits

`placeOnSurface()` uses XR Blocks' detected plane data in both WebXR and the simulator. It looks for an upward-facing horizontal plane in front of the viewer and checks that the whole composition's conservative footprint fits inside its polygon, including concave boundaries. If it cannot find a fit, it returns `false` without moving the preview. Scan an appropriate floor or table and retry, or make the composition smaller.

This is not a full room collision solver. A supported footprint does not guarantee clearance from furniture, people, or other physical obstacles. Placement is session-local, not a persistent WebXR anchor. Scenes can be larger than an available surface; a room-sized reading nook will not be squeezed onto a small table automatically. Singular, reflected, and sheared transforms are not supported for placement.

## Production providers and privacy

Browser API keys and the built-in key prompt are for local prototyping only. In production, provide a planner that calls a server you control:

```js
const room = new Roomcraft({
  planner: async (request) => {
    const response = await fetch('/api/scene-plan', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error('The scene planner request failed.');
    return response.json(); // A ScenePlan, still validated by Roomcraft.
  },
});
```

The server can use the exported `buildScenePrompt(request)` and `SCENE_PLAN_SCHEMA` with its configured provider. Authenticate and authorize requests on that server; do not place a long-lived provider key in a shipped browser application.

The add-on sends the instruction, generated-scene transforms and names, procedural part definitions, selection, and catalog descriptions to the configured planner. It does not capture camera images, room meshes, or microphone audio. The demo's optional speech input uses the browser's speech-recognition service, which may process audio remotely, before submitting a final transcript as an ordinary scene request.

Remove event listeners owned by your application and call `room.dispose()` when destroying a standalone scene. Disposal releases owned GPU resources and prevents pending provider or loading results from reattaching content.
