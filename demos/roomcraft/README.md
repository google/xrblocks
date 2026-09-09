# Roomcraft demo

Speak a scene into your room.

This demo composes real 3D objects with the [Roomcraft add-on](../../src/addons/roomcraft/). It arranges preauthored procedural assets, builds new compound objects out of primitive parts that can swing or spin around authored pivots, and loads one optional downloaded glTF model, then applies follow-up instructions to the same scene. New designs use bounded part and motion recipes, not free-form mesh, texture, or animation generation.

## Run it

From the repository root, run `npm run build:sdk`, then `npm run serve`, and open `http://127.0.0.1:8080/demos/roomcraft/`.

The page opens on a handcrafted reading nook without an API key. The starter catalog uses procedural geometry, while browser dependencies and the SDK's default simulator environment still load from CDNs.

## What you can do

Load the reading nook, gallery, miniature city, or clockwork robot starter scene. These are handcrafted data in [`scenes.js`](./scenes.js), clearly labelled as examples rather than AI output. Each button explicitly replaces the current scene, and Undo restores the previous one.

The clockwork robot example is one compound object written by hand from seventeen boxes, spheres, cylinders, and capsules, four of which carry an authored motion. Its arms swing around shoulder pivots, its head turns, and a wind-up key spins behind its back, with the hands parented to the arms and the eyes and antenna to the head so they travel with the part that moves them. It shows what a grouped moving design looks like and what a live request has to produce, but no model wrote it and it is not a catalog preset. Live designs use the same part vocabulary and motion rules and are validated the same way.

The miniature city fits on a 1.2-meter-wide model base rather than using room-sized towers. On narrow screens, the controls start collapsed so they do not cover the composition; press Open studio to expand them.

Press New design to empty the scene and work on one object at a time. The room stays empty until you ask for something, your camera is not moved, and Undo brings the previous scene back.

Type an instruction such as "create a little robot" and press Generate, or press Talk and say one instruction. A new object is assembled from primitive parts, and the console then reports its part count so you can see it is one compound design rather than a catalog item.

Refine the design with a follow-up instruction such as "give it longer arms and a backpack". Targeted part edits keep unchanged part definitions and the object's hand-edited pose instead of replacing the whole object. A plan can also explicitly change its transform, for example when you ask to move it. Nothing is recentered after a refinement.

Ask for movement with an instruction such as "make it wave", tune it with "make its arm swing faster", and end it with "stop its motion". A motion is a bounded swing or spin around an authored pivot on one part, and every child of that part travels with it. Editing a part that keeps its motion kind and declared starting phase keeps its place in the cycle, so a refinement does not restart the animation.

Press Pause motion to freeze playback while you inspect or edit a design, and Resume motion to continue from where each part paused. Pausing is a viewing state rather than a scene edit: it changes no layout, history, selection, or placement, and it stays available while a request is running. The control is disabled only when nothing in the scene moves.

Type an instruction such as "add a floor lamp beside the left chair" and press Generate to edit a room scene the same way. Speech submits only a final transcript, and the text field always stays usable. There is no automatic microphone and no request on load.

Click or pinch a scene object to select it, then say or type "make this blue" so the instruction has spatial context. Selected objects are shown by name and ID in the console, a compound design also shows its part count, which parts move and how, and a read-only list of part names and shapes, and any object can be chosen from the selection list. When one request adds exactly one object, that object is selected for you so the next "this" is unambiguous.

Drag or pinch any object to move or scale it, including a compound design, which moves as one object rather than as loose parts. Those hand transforms survive later edits, because the add-on sends explicit per-object updates rather than rewriting the whole scene.

Use Undo and Redo to move through the last 20 scene commands. Redo replays the saved result without asking Gemini again. A new edit clears the redo branch, and moving an object after Undo prevents Redo from overwriting that new pose.

On desktop, Focus selected frames one object and Frame scene shows the whole composition. Both keep your viewing direction and move only the existing camera, not the objects. They reserve a moving design's full motion envelope rather than the pose of one frame, so a swinging arm does not leave the view, and they account for the camera's field of view, aspect ratio, zoom, and clipping range. These controls never move the camera during an immersive XR session.

Press Place on surface to move the composition onto a detected horizontal plane. Until that succeeds the scene is labelled a preview. Moving or editing it invalidates that fit, so use Place again to confirm the new footprint. When no scanned surface fits, the console says so and the current scene pose is kept.

Press Export JSON to download the current layout. The file contains titles, asset IDs, part definitions with their hierarchy, part motion definitions, transforms, and colors only. Parts are written in their authored rest transforms, so the current playback phase and the paused state are not saved. It contains no API key and no prompt text, and the SDK's `applyLayout` accepts the same data back.

## Spatial studio

Press Spatial studio in the page header to use the in-scene controls in the desktop simulator, even with the DOM console collapsed. The same studio opens automatically in XR. Its Create / edit tab offers Talk, a prompt preview, and Generate. Keyboard opens a separate movable card for typing and submitting instructions without an immersive DOM text field.

The keyboard reuses the existing [virtualkeyboard add-on](../../src/addons/virtualkeyboard/), following the card-and-keyboard pattern in [Math3D](../math3d/). It adds no npm dependency. Spatial keys, desktop input, and final speech transcripts share one draft. Enter or Generate submits it, and a new draft entered while a request is running is kept when that request finishes.

Previous and Next cycle through scene objects, including objects that are difficult to point at. Remove deletes the selected object without asking Gemini; Undo restores it. Pause and Resume control part playback from the same row and stay usable while a request is running. New, Place, Undo, and Redo are available below both tabs. Examples contains the clearly labelled handcrafted starter scenes, not generated content.

The studio and keyboard have draggable edges. Recenter brings them back near your current view without moving the camera or scene, and closing the keyboard keeps its draft. On desktop, opening or recentering the studio chooses the side with less overlap from nearby authored objects, including their full motion envelopes. This is not room collision avoidance: drag the cards elsewhere if both sides are crowded. The desktop Spatial studio button hides both cards when you want an unobstructed composition. Configure Gemini in the desktop controls before entering XR; the spatial keyboard is for scene instructions, not API keys.

## Gemini

Starter scenes including the handcrafted clockwork robot, direct manipulation, motion playback and its pause control, New design, the downloaded exhibit, undo/redo, desktop framing, and export all work without a key. Creating and refining new designs from your own words needs a configured provider.

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

Parts can swing or spin around authored pivots, which is bounded rigid-part motion and nothing more. There are no autonomous agents or behaviors, no skeletal skinning, no physics joints or collisions, and no arbitrary generated animation or generated code. A swing turns up to 180 degrees with a period of 0.25 to 60 seconds, and a spin runs up to about four PI radians per second in either direction.

Pausing playback is inspection only and is never recorded in the layout, history, or an export. Undo and redo restore motion definitions rather than a recording of elapsed time. See [Articulated parts and playback](../../src/addons/roomcraft/README.md#articulated-parts-and-playback) in the add-on README for the exact motion contract.

A design holds at most 48 parts, a scene holds at most 384 parts across all designs, and parts nest at most 8 levels deep. Each part measures 0.01 to 5 meters per axis and its center stays within +/-5 meters per axis of its parent. A whole design must stay within +/-10 meters of its own origin and measure no more than 10 meters across on any axis, including everywhere its moving parts can reach.

A scene holds at most 48 objects, positions stay within 10 meters of the scene origin, and scale multipliers run from 0.05 to 5.

Quality depends on the model and the prompt. A request can return an awkward design, and there is no built-in robot fallback: a failed or rejected plan leaves your scene exactly as it was. Incomplete or invalid JSON is rejected as a whole, with a suggestion to retry a smaller edit rather than applying a partial design.

Only one operation runs at a time. Invalid plans, provider failures, and asset load errors leave the current scene intact and surface a message in the console.

Surface placement uses the SDK's detected planes in WebXR and in the simulator, and it needs a scanned horizontal plane whose area fits the whole composition's footprint. It is session local and is not a persistent anchor, a fitting footprint does not guarantee clearance from real furniture, and there is no hidden fallback: when nothing fits, the preview arrangement is kept so you can scan more of the room and retry.

The XR studio shows the selected object's name, part count, and how many of its parts move, offers the same Pause and Resume control, and shares errors and operation state with the desktop console. Typing uses the spatial keyboard rather than a native immersive text field. The full read-only part list with per-part motion, the JSON download, and Gemini key configuration remain in the desktop console.

Headset behavior beyond the standard XR Blocks input and plane detection paths is not claimed here. The desktop simulator is what this demo has been exercised in.

## SDK ownership

Rendering, the frame loop, input, selection, manipulation, plane detection, speech recognition, and the AI facade all belong to XR Blocks. Part playback uses the SDK's injected frame timer, and the framing buttons reposition the existing desktop camera; the demo adds no renderer, animation loop, navigation system, raycaster, or bundled copy of three.js, and it adds no dependencies beyond the SDK's existing import map entries.
