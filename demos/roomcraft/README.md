# Roomcraft demo

Speak a scene into your room.

This demo composes real 3D objects with the [Roomcraft add-on](../../src/addons/roomcraft/). It arranges preauthored procedural assets, builds new compound objects out of primitive parts, and loads one optional downloaded glTF model, then applies follow-up instructions to the same scene. New designs use bounded part recipes, not free-form mesh or texture generation.

## Run it

From the repository root, run `npm run build:sdk`, then `npm run serve`, and open `http://127.0.0.1:8080/demos/roomcraft/`.

The page opens on a handcrafted reading nook without an API key. The starter catalog uses procedural geometry, while browser dependencies and the SDK's default simulator environment still load from CDNs.

## What you can do

Load the reading nook, gallery, miniature city, or robot example starter scene. These are handcrafted data in [`scenes.js`](./scenes.js), clearly labelled as examples rather than AI output. Each button explicitly replaces the current scene, and Undo restores the previous one.

The robot example is one compound object written by hand from sixteen boxes, spheres, cylinders, and capsules. It shows what a grouped design looks like and what a live request has to produce, but no model wrote it and it is not a catalog preset. Live designs use the same part vocabulary and are validated by the same rules.

The miniature city fits on a 1.2-meter-wide model base rather than using room-sized towers. On narrow screens, the controls start collapsed so they do not cover the composition; press Open studio to expand them.

Press New design to empty the scene and work on one object at a time. The room stays empty until you ask for something, your camera is not moved, and Undo brings the previous scene back.

Type an instruction such as "create a little robot" and press Generate, or press Talk and say one instruction. A new object is assembled from primitive parts, and the console then reports its part count so you can see it is one compound design rather than a catalog item.

Refine the design with a follow-up instruction such as "give it longer arms and a backpack". Targeted part edits keep unchanged part definitions and the object's hand-edited pose instead of replacing the whole object. A plan can also explicitly change its transform, for example when you ask to move it. Nothing is recentered after a refinement.

Type an instruction such as "add a floor lamp beside the left chair" and press Generate to edit a room scene the same way. Speech submits only a final transcript, and the text field always stays usable. There is no automatic microphone and no request on load.

Click or pinch a scene object to select it, then say or type "make this blue" so the instruction has spatial context. Selected objects are shown by name and ID in the console, a compound design also shows its part count and a read-only list of part names and shapes, and any object can be chosen from the selection list. When one request adds exactly one object, that object is selected for you so the next "this" is unambiguous.

Drag or pinch any object to move or scale it, including a compound design, which moves as one object rather than as loose parts. Those hand transforms survive later edits, because the add-on sends explicit per-object updates rather than rewriting the whole scene.

Press Place on surface to move the composition onto a detected horizontal plane. Until that succeeds the scene is labelled a preview. Moving or editing it invalidates that fit, so use Place again to confirm the new footprint. When no scanned surface fits, the console says so and the current scene pose is kept.

Press Export JSON to download the current layout. The file contains titles, asset IDs, part definitions with their hierarchy, transforms, and colors only. It contains no API key and no prompt text, and the SDK's `applyLayout` accepts the same data back.

## Gemini

Starter scenes including the handcrafted robot, direct manipulation, New design, the downloaded exhibit, undo, and export all work without a key. Creating and refining new designs from your own words needs a configured provider.

Press Connect Gemini to opt in before entering XR. The demo sets the Gemini response schema to `SCENE_PLAN_SCHEMA` and then calls the SDK's public `AI.initializeModel` with `AIOptions.promptForApiKey`, so the browser dialog asks for a key that stays in the current page's memory. Canceling or leaving the key empty does not report a connection. A configured key is not proof of authentication or quota; those are checked by the provider on the first scene request. Nothing is written to storage by the demo, and no key is committed here. Loading the page with `?key=YOUR_KEY` configures it without the dialog, as in the other AI samples.

A browser API key is for local prototyping only. In production, pass the add-on a `planner` callback that calls your own server proxy and keep the provider key there.

Your instruction, the current scene's object names and transforms, the part definitions of any compound designs, the selected ID, and the catalog descriptions are sent to the configured provider. Speech input uses the browser's speech recognition service, which may process audio remotely. The add-on sends no camera imagery, and this demo does not request physical camera capture.

## Optional downloaded model

Add downloaded exhibit places a plinth and loads one real glTF model over the network, so the demo demonstrates a preauthored asset rather than procedural shapes alone. The starter scene objects require no model downloads.

The model is Boom Box, donated by Microsoft to the Khronos glTF sample models and released under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), loaded from `https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models@master/2.0/BoomBox/glTF-Binary/BoomBox.glb`. No asset file is copied into this repository.

If the download fails, the error is shown in the console and the previous scene is kept. The demo never fakes a successful load.

## Limitations

Scene composition uses the add-on's catalog of preauthored assets, which covers sofa, armchair, coffee table, bookshelf, floor lamp, plant, plinth, art panel, arch, building, tree, box, sphere, cylinder, cone, plus this demo's downloaded exhibit.

New objects outside that catalog are built from box, sphere, cylinder, cone, capsule, and torus parts. The result is a readable blocky design, not a photorealistic mesh, and there is no arbitrary geometry, no texture generation, and no generated code.

A design holds at most 48 parts, a scene holds at most 384 parts across all designs, and parts nest at most 8 levels deep. Each part measures 0.01 to 5 meters per axis and its center stays within +/-5 meters per axis of its parent. A whole design must stay within +/-10 meters of its own origin and measure no more than 10 meters across on any axis.

A scene holds at most 48 objects, positions stay within 10 meters of the scene origin, and scale multipliers run from 0.05 to 5.

Quality depends on the model and the prompt. A request can return an awkward design, and there is no built-in robot fallback: a failed or rejected plan leaves your scene exactly as it was.

Only one operation runs at a time. Invalid plans, provider failures, and asset load errors leave the current scene intact and surface a message in the console.

Surface placement uses the SDK's detected planes in WebXR and in the simulator, and it needs a scanned horizontal plane whose area fits the whole composition's footprint. It is session local and is not a persistent anchor, a fitting footprint does not guarantee clearance from real furniture, and there is no hidden fallback: when nothing fits, the preview arrangement is kept so you can scan more of the room and retry.

The XR panel offers the starter scenes, Talk, New, Place, and Undo, because there is no immersive text field. It shows the selected object's name and part count, displays the same errors and busy states as the desktop console, and is hidden during desktop use so it does not cover the composition. Typing longer instructions and reading the full part list are desktop tasks.

Headset behavior beyond the standard XR Blocks input and plane detection paths is not claimed here. The desktop simulator is what this demo has been exercised in.

## SDK ownership

Rendering, the frame loop, input, selection, manipulation, plane detection, speech recognition, and the AI facade all belong to XR Blocks. This demo adds no renderer, camera controls, raycaster, or bundled copy of three.js, and it adds no dependencies beyond the SDK's existing import map entries.
