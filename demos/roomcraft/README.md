# Roomcraft demo

Speak a scene into your room.

This demo composes real 3D objects with the [Roomcraft add-on](../../src/addons/roomcraft/). It arranges preauthored procedural assets and one optional downloaded glTF model, then applies follow-up instructions to the same scene. It never generates meshes from text and never answers with a wall of text.

## Run it

From the repository root, run `npm run build:sdk`, then `npm run serve`, and open `http://127.0.0.1:8080/demos/roomcraft/`.

The page opens on a handcrafted reading nook without an API key. The starter catalog uses procedural geometry, while browser dependencies and the SDK's default simulator environment still load from CDNs.

## What you can do

Load the reading nook, gallery, or miniature city starter scene. These are handcrafted data in [`scenes.js`](./scenes.js), clearly labelled as examples rather than AI output. Each button explicitly replaces the current scene, and Undo restores the previous one.

The miniature city fits on a 1.2-meter-wide model base rather than using room-sized towers. On narrow screens, the controls start collapsed so they do not cover the composition; press Open studio to expand them.

Type an instruction such as "add a floor lamp beside the left chair" and press Generate, or press Talk and say one instruction. Speech submits only a final transcript, and the text field always stays usable. There is no automatic microphone and no request on load.

Click or pinch a scene object to select it, then say or type "make this blue" so the instruction has spatial context. Selected objects are shown by name and ID in the console, and can also be chosen from the selection list.

Drag or pinch any object to move or scale it. Those hand transforms survive later edits, because the add-on sends explicit per-object updates rather than rewriting the whole scene.

Press Place on surface to move the composition onto a detected horizontal plane. Until that succeeds the scene is labelled a preview. Moving or editing it invalidates that fit, so use Place again to confirm the new footprint. When no scanned surface fits, the console says so and the current scene pose is kept.

Press Export JSON to download the current layout. The file contains titles, asset IDs, transforms, and colors only. It contains no API key and no prompt text.

## Gemini

Starter scenes, direct manipulation, the downloaded exhibit, undo, and export all work without a key.

Press Connect Gemini to opt in before entering XR. The demo sets the Gemini response schema to `SCENE_PLAN_SCHEMA` and then calls the SDK's public `AI.initializeModel` with `AIOptions.promptForApiKey`, so the browser dialog asks for a key that stays in the current page's memory. Canceling or leaving the key empty does not report a connection. A configured key is not proof of authentication or quota; those are checked by the provider on the first scene request. Nothing is written to storage by the demo, and no key is committed here. Loading the page with `?key=YOUR_KEY` configures it without the dialog, as in the other AI samples.

A browser API key is for local prototyping only. In production, pass the add-on a `planner` callback that calls your own server proxy and keep the provider key there.

Your instruction, the current scene's object names and transforms, the selected ID, and the catalog descriptions are sent to the configured provider. Speech input uses the browser's speech recognition service, which may process audio remotely. The add-on sends no camera imagery, and this demo does not request physical camera capture.

## Optional downloaded model

Add downloaded exhibit places a plinth and loads one real glTF model over the network, so the demo demonstrates a preauthored asset rather than procedural shapes alone. The starter scene objects require no model downloads.

The model is Boom Box, donated by Microsoft to the Khronos glTF sample models and released under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), loaded from `https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models@master/2.0/BoomBox/glTF-Binary/BoomBox.glb`. No asset file is copied into this repository.

If the download fails, the error is shown in the console and the previous scene is kept. The demo never fakes a successful load.

## Limitations

Scene composition is limited to the add-on's catalog: sofa, armchair, coffee table, bookshelf, floor lamp, plant, plinth, art panel, arch, building, tree, box, sphere, cylinder, cone, plus this demo's downloaded exhibit.

A scene holds at most 48 objects, positions stay within 10 meters of the scene origin, and scale multipliers run from 0.05 to 5.

Only one operation runs at a time. Invalid plans, provider failures, and asset load errors leave the current scene intact and surface a message in the console.

Surface placement uses the SDK's detected planes in WebXR and in the simulator, and it needs a scanned horizontal plane whose area fits the whole composition's footprint. It is session local and is not a persistent anchor, a fitting footprint does not guarantee clearance from real furniture, and there is no hidden fallback: when nothing fits, the preview arrangement is kept so you can scan more of the room and retry.

The XR panel offers the starter scenes, Talk, Place, and Undo, because there is no immersive text field. It displays the same errors and busy states as the desktop console and is hidden during desktop use so it does not cover the composition. Typing longer instructions is a desktop task.

## SDK ownership

Rendering, the frame loop, input, selection, manipulation, plane detection, speech recognition, and the AI facade all belong to XR Blocks. This demo adds no renderer, camera controls, raycaster, or bundled copy of three.js, and it adds no dependencies beyond the SDK's existing import map entries.
