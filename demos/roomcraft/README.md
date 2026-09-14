# Roomcraft demo

Speak a scene into your room.

This demo composes real 3D objects with the [Roomcraft add-on](../../src/addons/roomcraft/). It arranges preauthored procedural assets, builds new compound objects out of primitive parts that can swing or spin around authored pivots, and loads one optional downloaded glTF model, then applies follow-up instructions to the same scene. New designs use bounded part and motion recipes, not free-form mesh, texture, or animation generation.

The same application is designed for Android XR and Meta Quest headsets, mobile devices and laptops. Use a browser that meets XR Blocks' requirements; immersive XR, hand tracking and microphone availability depend on the device and browser. Non-immersive use follows the SDK's simulator and browser controls rather than requiring a headset.

An optional [virtual world mode](#virtual-world-mode) authors a whole place, with its own ground, sky, light, ponds, paths, and plantings, instead of decorating your room.

## Run it

From the repository root, run `npm run build:sdk`, then `npm run serve`, and open `http://127.0.0.1:8080/demos/roomcraft/`.

The page opens on a handcrafted reading nook without an API key. The starter catalog uses procedural geometry, while browser dependencies and the SDK's default simulator environment still load from CDNs.

A dependency-independent launcher reports module loading and SDK initialization before the scene starts. Late module evaluation still starts the page even if DOM readiness has already fired. Import or initialization failures appear in the page's error area rather than leaving the initial loading message indefinitely; a slow import remains marked as loading rather than being reported as a successful or failed scene.

Open `http://127.0.0.1:8080/demos/roomcraft/?environment=1` instead for the optional fully virtual mode described below. The default page is unchanged by that option.

To open a saved scene on another device, serve its exported JSON alongside the demo and append `&scene=./garden.json` to the virtual-mode URL. The file is imported through `applyLayout`, without making an AI request. Saved-scene downloads use the same HTTP(S) origin, send no credentials, and reject redirects. A failed or invalid import shows an error instead of substituting an example, and edits made while the file downloads are kept rather than overwritten.

A standalone headset needs an HTTPS URL it can reach on your LAN, with a certificate its browser trusts. The headset's `127.0.0.1` is not the development computer. Open the LAN URL with `?environment=1`, without the desktop-forcing `formFactor=desktop` or `xrAutomation=1` flags, and use the SDK's XR entry button.

Roomcraft uses the standard SDK XR entry screen and shared browser API-key dialog. On a headset, open the browser controls, choose Connect Gemini near the top, enter your key in the password field, and choose Use for this session before entering XR. Hide controls if they cover the XR entry button. A key configured on another device does not transfer to the headset. The spatial keyboard is for scene instructions, not API keys; exit XR to change the key.

The XR entry button shows `ENTERING XR...` while the browser responds. If entry fails, the browser error appears below the buttons and Enter XR becomes available to retry.

## Collaboration and connectivity

Open `/demos/roomcraft-collab/` for the room-code entry. This small launch alias opens the shared Roomcraft editor in its collaboration lobby; it does not copy or fork the editor. The website also lists **Collaborative Roomcraft** as its own sample. The lobby stays local until you choose **Start new room** or enter a four-letter code and press **Join**. Both actions use WebRTC, announce the display name from Connection settings and keep the current scene and authoring draft without reloading the page. Joining an existing room then imports its established shared scene. **Copy code** copies only the code, which is a meeting identifier rather than a password or a guaranteed-unique private room.

The same controls are available inside Spatial studio under **People > Room codes**. The existing spatial keyboard edits the code without touching the authoring prompt; Enter finishes editing, and the separate Join button connects. **One code joins the same scene from either physical or virtual viewing setup, on any supported device.** Start a room on one device, then enter its code on another; nobody needs to match an `environment` URL flag. Starting or joining another room releases the previous session and peer microphone; capture never restarts automatically. No Gemini key is needed to start or join.

**Start new room** supplies the initial scene. **Join** and code invitations wait for an existing peer snapshot rather than offering the joiner's default scene, even if WebRTC discovery takes longer than expected. A missing host produces a snapshot timeout; it does not silently create a competing scene. This also protects an imported recovery scene from an empty joiner replacing it.

Choose your name directly in the lobby or spatial Room codes panel; it shares the same draft as Connection settings. When the entered code and name already match your connection, Join reads **Joined** and does not reconnect or interrupt audio. Changing the name offers **Rejoin**. After the first connection, the DOM room options compact to keep the code and separate microphone/listening buttons easy to reach, without closing a name field being edited. Manually reopened options and text selection remain stable through participant updates.

Code-only invitations are for WebRTC. For BroadcastChannel, WebSocket or rooms without a four-letter code, Copy code is unavailable; use **Open peer link** to include the applied room, transport and relay settings instead. Starting or joining a code always selects WebRTC.

Open `http://127.0.0.1:8080/demos/roomcraft/?collab=1&room=roomcraft-demo&name=Alice`, then choose Open peer link in Collaboration. Add `&environment=1` to choose virtual-world startup; a peer link preserves that viewing hint, but entering the code from the other view joins the same room. Collaboration is strictly opt-in: only the exact `collab=1` value loads the optional module, after the local starter or saved scene and key setup finish. Ordinary single-player startup does not enable networking.

Open **Connection settings**, choose a connection, then **Apply & reconnect**. The disclosure starts collapsed so the common microphone and listening controls stay near the top, before a growing participant roster. Configuration errors open it automatically; ordinary state updates preserve your disclosure choice. All options use existing public netblocks transports:

- **BroadcastChannel · same browser** is the default for direct `?collab=1` links (or `&transport=broadcast`). Tabs must use the same browser profile and exact origin, including scheme, hostname, and port. No signaling service is used. A headset and desktop cannot join each other this way.
- **WebRTC · cross-device / off-LAN** (`&transport=webrtc`) uses `WebRTCTransport` with its existing default public PeerJS signaling broker and STUN servers, with no new hosting project. Each device needs internet access and a reachable copy of this page; the broker does not host or expose your LAN demo. Use the same room code and transport; physical and virtual viewing setups can differ. The public broker is best-effort, rate-limited, and supports a maximum of 12 peers per room. STUN is not TURN: restrictive NAT, firewalls, or broker outages can prevent a connection. No TURN credentials or broker overrides are configured here; this is not a guaranteed off-LAN service.
- **WebSocket · existing relay** (`&transport=websocket&relay=wss%3A%2F%2Frelay.example%2Froomcraft`) needs an explicit existing netblocks-compatible relay URL reachable by every peer. The demo does not start or host a relay. HTTPS pages require `wss://` and a certificate trusted by each browser; HTTP pages may also use `ws://`. Credentials, query parameters, and fragments in relay URLs are rejected so they cannot leak through peer links. Use a non-secret relay endpoint; never put a provider key or token in its path. Relay scene traffic is visible to that relay.

The panel shows connection state, pending synchronization, your announced identity, and a colored participant roster with selected-object names. Retry sync asks the bridge to synchronize again, or rejoins after disconnection. Apply & reconnect creates a fresh session without reloading or resetting the locally authored scene, its selection, or the Gemini configuration. Normal shared-scene conflict rules still apply when a peer's scene arrives. Switching or leaving stops peer voice, including a pending microphone request; rejoining never automatically unmutes. The previous bridge/session is released and late async completions cannot replace the new connection. Underlying broker connection attempts may take time to settle; superseded sessions are closed again when they finish.

An open room with no remote participants says **Waiting for peers**, not Connected. Check that someone started the room and that both devices use the same code and transport. Every viewing setup uses the same network identity, for example `roomcraft:shared:BCDF`. The view shown in diagnostics is local configuration, not a separate multiplayer room. Shared objects and authored environment data arrive without changing the recipient's local XR session mode.

Use **Diagnostics / local log** in the browser controls or **People > Diagnostics** in the spatial studio to compare devices without a remote debugger. The report includes the full room ID, mode, transport, local and remote peer IDs, channel membership, object IDs/counts, scene revision, pending work, message counts and recent state changes. **Refresh report** only reads local state; **Copy diagnostics** works in both views, and **Download diagnostics** saves a JSON report from the browser controls if copying is unavailable on the headset.

Diagnostics stay in page memory and retain the last 64 distinct states until reload. Times are elapsed within that page, not synchronized timestamps across devices. They exclude display names, prompts, keys, page/relay URLs, audio, full scene recipes and raw error text. No report is uploaded automatically. Reports do include room, peer and object identifiers; review them before sharing. Send counts describe local submissions, not delivery acknowledgements, and peer presence alone is not proof that scene content or physical alignment matches. Refresh or copy after the problem occurs, then provide reports from both devices. Remote browser debugging is optional if these reports do not explain the failure.

Connection failures appear in the panel and existing console. Leave stops collaboration while keeping local editing available. Leaving the page or disposing its console also releases the bridge and its session.

Live positions slightly below the scene origin are valid shared state, so moving a sofa below that reference does not block a later cat or any other scene edit. Shared/imported positions remain bounded to -10 through 10 meters on each axis, and AI-authored placement rules remain unchanged. Snapshot requests retry missing replies within their timeout window and display the peer's actual validation/transfer reason when available. Rejected local edits remain pending rather than being overwritten by an older snapshot during Retry or reconnect; correction followed by Retry republishes them. Both views clear recovered bridge errors without hiding unrelated settings or audio errors.

Collaboration is also available inside Spatial studio, in its **People** tab, in both the default and virtual modes. **People / audio** contains participants and voice/listening controls; **Connection settings** edits the applied connection's draft. The spatial and DOM interfaces subscribe to one controller and invoke the same actions; they do not create separate sessions or audio graphs. Applied room, connection and identity are shown separately from editable draft settings. The spatial roster shows two other people per page, with larger names and controls; your identity and microphone stay above the roster rather than occupying a disabled participant row. Connection errors are shown once, below a short status summary.

Editing a connection name or relay in the spatial keyboard updates only that settings draft, including its DOM counterpart. Enter finishes the field; Apply & reconnect applies the connection. It does not overwrite the authoring prompt, change scene selection, or invoke Generate/Gemini. Returning to authoring restores the authoring keyboard context and cancels held settings-key captures before changing routes. Controls and participant rows are kept stable on unchanged state rather than rebuilt on each update.

Unapplied connection changes are marked in both views. **Discard changes** discards unapplied name, transport and relay edits and restores the current connection's settings without reconnecting, changing audio, or editing the scene or authoring prompt. It also updates an open settings keyboard and clears configuration errors, but preserves unrelated connection or playback errors. Stored relay text does not mark a BroadcastChannel/WebRTC draft as changed while that relay is unused.

Room IDs use the common `roomcraft:shared:` prefix, independent of viewing setup. The `room` parameter accepts 1 to 48 ASCII letters, digits, underscores, or hyphens, starting with a letter or digit; an omitted or empty value on a direct `?collab=1` link uses `roomcraft-demo`, while an invalid ID shows an error without joining a different room. The dedicated collaboration lobby waits for Start or Join instead of selecting a default room.

### Names and share links

The generated peer link deliberately omits the current display name. Its recipient gets a new **Maker ####** name, not Bob or a copy of Alice. Set **Your display name** and Apply & reconnect to announce a chosen name, or explicitly open `?collab=1&room=roomcraft-demo&name=Bob`. Names are bounded to 40 characters and rendered as text, not HTML. Plain **Maker** is only a display fallback for missing remote metadata; **Maker ####** is an actual announced default name. The roster listens for metadata refreshes as well as joins/departures, including a hello arriving after netblocks' 1.5-second initial-metadata grace window.

The peer link is built from an allowlist: collaboration, room, transport, the validated relay URL when needed, virtual mode, and supported desktop/debug flags. It never copies API keys, the current display name, saved-scene URLs, arbitrary parameters, or fragments. It also sends no referrer. The current page URL is not rewritten; share the panel's applied peer link rather than a stale address-bar URL. Each tab configures Gemini independently; a remote scene is applied as validated layout data, never as a new AI request. Text and Gemini Talk editing, selection, dragging, spatial controls, placement, export, and starter scenes keep their existing paths.

### Opt-in peer spatial voice

**Unmute my mic** first acquires the microphone through `session.voice.enable(session.transport.remotePeerIds)`. It never runs automatically. **Mute my mic** uses `setMuted(true)` to silence outgoing audio without closing incoming peer audio or requesting another microphone stream. Unmute reuses that stream with `setMuted(false)`. A muted track stays muted when peers join or renegotiate. **Disconnect** is different: it releases capture and closes the session's audio connections. Switching transports also releases capture; reconnecting never silently unmutes or starts a new microphone request.

**Mute everyone for me** controls all incoming peer playback locally. Each remote participant also has **Mute/Unmute for me**. These controls do not change anyone's microphone, announced mic indicator, peer connection, or unrelated scene audio. Turning the master listening control off and on preserves individual choices. Choices apply to new or replaced streams; individual entries clear when that peer leaves or the session is replaced, since a display name is not a persistent identity. The master listening preference survives reconnects and is applied before incoming streams are attached.

While permission is pending, **Cancel mic request** invalidates only the capture request; a late grant is stopped by netblocks without disconnecting incoming audio. Denying microphone permission also leaves existing listening connections intact. The UI follows `voice.isEnabled()`, `voice.isMuted()`, and `local-voice-state`, not an optimistic toggle. The roster shows peers' announced mic transmission state. Permission, capture-ended, and peer audio-connection errors appear in the peer-voice status without failing scene synchronization.

Peer voice is completely separate from **Gemini Talk** transcription: it does not need a Gemini key, send audio to Gemini, or generate scene edits. Netblocks spatializes remote audio at peer avatar heads using the SDK's listener. Incoming peer audio can be received while your own mic is off. Capture requires a supported secure context (HTTPS or localhost) and site permission. Use headphones to avoid feedback; mute peer conversation separately when recording a Gemini Talk instruction if you do not want peers to hear it.

Audio always uses direct WebRTC with STUN, including when scene messages use BroadcastChannel or a WebSocket relay. A scene relay does not act as an audio TURN server. A mic-on state confirms local transmission is enabled, not successful remote audibility. Real audible voice, cross-device/off-LAN traversal, and headset microphone routing require device testing; synthetic-track browser tests are not evidence of those outcomes. A LAN/VPN-hosted page must still be reachable by each device: using a public signaling broker does not publish the page to the internet.

This is a cooperative prototype, not authenticated access control or conflict-free editing. Whole-scene edits use simple last-writer-wins overwrite semantics; concurrent edits can replace one another, and local Undo or Redo writes a whole scene to everyone. Authored bounds and the existing 60 KB network-message cap still apply: synchronization reports an explicit error rather than clamping content or silently truncating it. A locally valid scene can still exceed the network cap; simplify it before retrying.

The bridge shares numerical root placement, object transforms, and authored motion definitions in the same coordinate convention. It does not align physical anchors or scanned rooms.

For a desktop mouse test, use `&formFactor=desktop` and the simulator's User mode. The automation flag `xrAutomation=1` instead starts in Navigation mode; browser probes can switch with `xb.core.simulator.controls.setSimulatorMode(xb.SimulatorMode.USER)` after initialization.

## Virtual world mode

`?environment=1` chooses virtual-world startup rather than decorating the room around you. This is a per-device viewing and XR-entry setup, chosen when the page opens. Without collaboration, each page keeps its local scene and history. With collaboration, both viewing setups join the same code and receive the same authored scene; camera and XR-entry behavior remain local.

This page requests an immersive VR session and uses the empty simulator environment declared in [`virtual-environment.json`](./virtual-environment.json), which names no scene, no planes, no navigation mesh, and no objects. No prebuilt living room or background asset is downloaded, so everything in view is either the environment the add-on builds or the objects you author. XR entry stays available on supported headsets. When immersive VR is unavailable, the SDK starts the simulator automatically with your eye near the front edge of the ground.

Virtual mode omits the unused `unbounded` reference-space request because Quest can reject the entire VR session with `NotSupportedError` even when that feature is optional. Floor-relative tracking, bounded-floor support, and hand tracking remain enabled. The default room mode and SDK-wide reference-space settings are unchanged.

Without a saved-scene URL, the page opens on an honestly empty authoring canvas: a neutral 14 by 14 meter daylight ground with nothing on it. It is not a generated place, nothing is preselected for you, and no AI request is sent on load. Describe a place, for example "create a moonlit Japanese garden", and press Generate.

Follow-ups such as "make the pond bigger" and "change the garden to sunrise" go through the same request path as the default page, so the model plans them. The demo does not match your words against hard-coded phrases and never substitutes a stock garden for a real answer.

Press New environment to clear everything back to that empty ground. Undo restores the previous environment.

### Landscape features

Ponds, paths, and plantings are compact recipes rather than long lists of objects, which keeps a whole garden inside one small plan. A pond declares a water size and a bank width, a path declares 2 to 12 points and a width, and a planting declares a style, a planting area, a specimen count, a height, and a seed. The seed keeps a planting stable, so the same scene arranges its specimens the same way every time it is loaded.

Each feature is one ordinary scene object with a name and an ID. Select it by clicking it, from the selection list, or with Previous and Next, then drag or scale it like any other object. The console names the feature and reports its editable numbers, for example a pond's water surface and bank width or a planting's style, count, height, and seed. An edit replaces a feature's whole recipe rather than individual parts, because a landscape feature has no editable part list.

Moonlit garden under Starter scenes is handcrafted data in [`scenes.js`](./scenes.js), clearly labelled as an example rather than AI output. It combines a pond, a winding path, six seeded plantings, and three part-based structures, and it exists to show what these recipes look like at the scale a single request has to produce.

### Atmosphere and the view

The Environment section reports the active ground size, time of day, and ground color, and the spatial studio repeats the same summary.

Moonlight and Sunrise are direct atmosphere edits, not AI requests. Each changes only the time of day, leaves every object and color untouched, and is covered by Undo and Redo like any other scene command. Natural language still works for the same change if you would rather ask for it.

Enter world moves the desktop camera to a clear standing spot, preferring the front of the ground and looking across it. The bounded search reserves body and head clearance against individual object bounds, ignores flat paths and shallow water, and reports when it finds no clear candidate instead of placing you inside an object. No object or environment value changes, and the simulator's navigation controls continue from the new pose. The button is hidden during an immersive XR session.

Virtual XR entry uses that same search after the opening scene has loaded and headset tracking is available. A per-session WebXR reference-space offset places the viewer at a clear spot facing across the ground, preserving real eye height and keeping headset and controller tracking in the same space. The world and studio appear after a frame in the new space, so the old origin is not shown through a bridge or another object. Authored transforms, selection, and undo history are unchanged.

If entry cannot be placed, the world stays hidden and the studio explains why. New, object selection, Remove, and the other authoring controls remain available; a scene edit retries placement. Exiting XR restores the world's previous visibility. The search is conservative: an object's full bounds, including its motion envelope, may cover gaps that would be walkable in a mesh-level collision system.

Frame scene accounts for the ground extent, so an empty environment can still be framed without any object in it.

### Placement and export in this mode

Place on surface is unavailable while a virtual environment is active, because the environment supplies its own ground. The button is disabled and the console explains why rather than failing silently.

Export JSON keeps the environment's size, ground color, and time of day alongside the objects, including for an environment that holds no objects yet, and `applyLayout` accepts the same file back.

## What you can do

Load the reading nook, gallery, miniature city, or clockwork robot starter scene. These are handcrafted data in [`scenes.js`](./scenes.js), clearly labelled as examples rather than AI output. Each button explicitly replaces the current scene, and Undo restores the previous one.

The clockwork robot example is one compound object written by hand from seventeen boxes, spheres, cylinders, and capsules, four of which carry an authored motion. Its arms swing around shoulder pivots, its head turns, and a wind-up key spins behind its back, with the hands parented to the arms and the eyes and antenna to the head so they travel with the part that moves them. It shows what a grouped moving design looks like and what a live request has to produce, but no model wrote it and it is not a catalog preset. Live designs use the same part vocabulary and motion rules and are validated the same way.

The miniature city fits on a 1.2-meter-wide model base rather than using room-sized towers. On narrow screens, the controls start collapsed so they do not cover the composition; press Open studio to expand them.

Press New design to empty the scene and work on one object at a time. The room stays empty until you ask for something, your camera is not moved, and Undo brings the previous scene back.

Type an instruction such as "create a little robot" and press Generate, or press Talk, say one instruction, and press Finish. A new object is assembled from primitive parts, and the console then reports its part count so you can see it is one compound design rather than a catalog item.

The full-width prompt shows eight lines and can be resized vertically. Typing does not activate simulator keyboard navigation. Enter submits once, Shift+Enter adds a new line, and held-key repeats or IME composition confirmation do not submit extra requests.

Refine the design with a follow-up instruction such as "give it longer arms and a backpack". Targeted part edits keep unchanged part definitions and the object's hand-edited pose instead of replacing the whole object. A plan can also explicitly change its transform, for example when you ask to move it. Nothing is recentered after a refinement.

Ask for movement with an instruction such as "make it wave", tune it with "make its arm swing faster", and end it with "stop its motion". A motion is a bounded swing or spin around an authored pivot on one part, and every child of that part travels with it. Editing a part that keeps its motion kind and declared starting phase keeps its place in the cycle, so a refinement does not restart the animation.

Press Pause motion to freeze playback while you inspect or edit a design, and Resume motion to continue from where each part paused. Pausing is a viewing state rather than a scene edit: it changes no layout, history, selection, or placement, and it stays available while a request is running. The control is disabled only when nothing in the scene moves.

Type an instruction such as "add a floor lamp beside the left chair" and press Generate to edit a room scene the same way. Voice submits only a completed Gemini transcript, and the text field always stays usable. There is no automatic microphone and no request on load.

### Gemini Talk transcription

Voice uses the same configured Gemini client and key as scene editing. No additional account or cloud provider is used, and Roomcraft does not start the browser's separate speech-recognition service, even when that API is available.

Press Talk to request microphone permission and start one recording. Press Finish to stop the microphone, send the audio to Gemini for transcription, and submit the resulting instruction through the normal scene-editing flow. The same controls are available in the spatial studio. Each spoken edit uses a transcription request followed by the normal scene-generation request, so both count toward Gemini usage and quota. An invalid scene plan can add one correction request.

If the text field already has a draft, Talk first asks you to choose Replace draft or Keep draft. No microphone starts until you choose Replace draft. The old text is kept until transcription succeeds; cancellation or an error leaves it unchanged. Changing the text before confirming requires a new replacement decision. This applies to both the browser panel and spatial studio, including a transcript left for review after the recording limit.

At the 30-second limit, recording stops and Gemini produces a transcript for review, without automatically submitting a scene edit. The transcript stays in the shared draft until you explicitly press Generate. A user-pressed Finish still transcribes and applies the spoken edit directly. The demo rejects recordings larger than 4 MiB and gives transcription a 60-second deadline. Cancel stops recording or aborts transcription and prevents a late result from applying an edit. Changing the draft cancels voice; changing the selected target or scene during transcription cancels it too. Leaving or hiding the page, entering, ending or hiding XR, hiding the voice controls, and disposing the console also stop voice input. A partly obscured XR permission prompt does not by itself cancel microphone setup.

Audio stays in page memory until it is sent or discarded. It is not saved to a file, browser storage, scene JSON, or application logs. Cancellation cannot recall audio already sent to Gemini. An empty or invalid transcript produces an error rather than an invented scene edit. Once the scene request has begun, use the normal Undo flow after it finishes.

Microphone recording requires a supported browser on HTTPS or localhost and site microphone permission. The demo uses native MediaRecorder formats supported by Gemini, including WebM/Opus, Ogg, and audio-only MP4/M4A. It does not depend on `SpeechRecognition`, so absence of that API alone does not block Quest voice input. If capture is unavailable or permission is denied, the error is shown and Keyboard remains available.

Pending operations show Working or Generating on the action button, with a gentle pulse in both interfaces and a spinner in the browser status. Reduced-motion preferences disable the animation without hiding the busy label. These indicate activity, not estimated completion percentages, and clear on either success or failure.

Studio buttons and spatial keyboard keys play a quiet click through the SDK's shared sound synthesizer, respecting its UI and master volume and mute settings. Audio starts on interaction, not page load. If the browser blocks playback, the console reports an audio warning and the button action still works.

Click or pinch a scene object to select it, then say or type "make this blue" so the instruction has spatial context. Selected objects are shown by name and ID in the console, a compound design also shows its part count, which parts move and how, and a read-only list of part names and shapes, and any object can be chosen from the selection list. When one request adds exactly one object, that object is selected for you so the next "this" is unambiguous.

Drag or pinch any object to move or scale it, including a compound design, which moves as one object rather than as loose parts. Those hand transforms survive later edits, because the add-on sends explicit per-object updates rather than rewriting the whole scene.

Use Undo and Redo to move through the last 20 scene commands. Redo replays the saved result without asking Gemini again. A new edit clears the redo branch, and moving an object after Undo prevents Redo from overwriting that new pose.

On desktop, Focus selected frames one object and Frame scene shows the whole composition. Both keep your viewing direction and move only the existing camera, not the objects. They reserve a moving design's full motion envelope rather than the pose of one frame, so a swinging arm does not leave the view, and they account for the camera's field of view, aspect ratio, zoom, and clipping range. These controls never move the camera during an immersive XR session.

Press Place on surface to move the composition onto a detected horizontal plane. Until that succeeds the scene is labelled a preview. Moving or editing it invalidates that fit, so use Place again to confirm the new footprint. When no scanned surface fits, the console says so and the current scene pose is kept.

Press Export JSON to download the current layout. The file contains the title, environment settings, asset IDs, landscape recipes, part definitions with their hierarchy and motion, transforms, and colors. Parts are written in their authored rest transforms, so the current playback phase and the paused state are not saved. It contains no API key and no prompt text. The SDK's `applyLayout` imports this format subject to the documented authoring limits.

## Spatial studio

Press Spatial studio in the page header to use the in-scene controls in the desktop simulator, even with the DOM console collapsed. The same studio opens automatically in XR. Its Create / edit tab offers Talk, a prompt preview, and Generate. Keyboard opens a separate movable card for typing and submitting instructions without an immersive DOM text field.

The keyboard reuses the existing [virtualkeyboard add-on](../../src/addons/virtualkeyboard/), following the card-and-keyboard pattern in [Math3D](../math3d/). It adds no npm dependency. Spatial keys, desktop input, and final speech transcripts share one draft. Enter or Generate submits it, and a new draft entered while a request is running is kept when that request finishes.

Previous and Next cycle through scene objects, including objects that are difficult to point at. Remove deletes the selected object without asking Gemini; Undo restores it. Pause and Resume control part playback from the same row and stay usable while a request is running. New, Place, Undo, and Redo are available below both tabs. Examples contains the clearly labelled handcrafted starter scenes, not generated content.

In virtual world mode the studio adds the environment summary and Moonlight and Sunrise controls. Its desktop preview also shows Enter world; that desktop-only action is hidden during XR. The default page builds none of those extra controls.

The studio and keyboard have draggable edges. Recenter brings them back near your current view without moving the camera or scene, and closing the keyboard keeps its draft. On desktop, opening or recentering the studio chooses the side with less overlap from nearby authored objects, including their full motion envelopes. This is not room collision avoidance: drag the cards elsewhere if both sides are crowded. The desktop Spatial studio button hides both cards when you want an unobstructed composition. Configure Gemini in the browser controls before entering XR; the spatial keyboard is for scene instructions, not API keys.

In XR, the studio waits for a tracked view and opens upright at head height, even when entry begins while looking down or tilting your head. Later head movement does not continually recenter it or undo manual dragging.

## Gemini

Starter scenes including the handcrafted clockwork robot and the handcrafted moonlit garden, direct manipulation, motion playback and its pause control, New design, the Moonlight and Sunrise atmosphere shortcuts, Enter world, the downloaded exhibit, undo/redo, desktop framing, and export all work without a key. Creating and refining new designs and environments from your own words needs a configured provider.

Press Connect Gemini to opt in before entering XR. The demo sets the Gemini response schema to `SCENE_PLAN_SCHEMA` and then calls the SDK's public `AI.initializeModel` with `AIOptions.promptForApiKey`, so the browser dialog asks for a key that stays in the current page's memory. Canceling or leaving the key empty does not report a connection. A configured key is not proof of authentication or quota; those are checked by the provider on the first scene request. Nothing is written to storage by the demo, and no key is committed here. Loading the page with `?key=YOUR_KEY` or `?geminiKey=YOUR_KEY` configures it without the dialog, as in the other AI samples. Append `&key=YOUR_KEY` when the URL already contains `?environment=1`. URL keys can appear in browser history, access logs, and copied links, so prefer the dialog and never publish a key-bearing URL.

A browser API key is for local prototyping only. In production, pass the add-on a `planner` callback that calls your own server proxy and keep the provider key there.

Your instruction, the environment settings, the current scene's object names and transforms, landscape recipes, the part definitions of any compound designs, the selected ID, and the catalog descriptions are sent to Gemini. Voice additionally sends the recorded audio to Gemini for transcription, using a separate response schema that does not change the scene planner's settings. The add-on sends no camera imagery, and microphone capture explicitly requests audio without video.

## Optional downloaded model

Add downloaded exhibit places a plinth and loads one real glTF model over the network, so the demo demonstrates a preauthored asset rather than procedural shapes alone. The starter scene objects require no model downloads.

The model is Boom Box, donated by Microsoft to the Khronos glTF sample models and released under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), loaded from `https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models@master/2.0/BoomBox/glTF-Binary/BoomBox.glb`. No asset file is copied into this repository.

If the download fails, the error is shown in the console and the previous scene is kept. The demo never fakes a successful load.

## Limitations

Scene composition uses the add-on's catalog of preauthored assets, which covers sofa, armchair, coffee table, bookshelf, floor lamp, plant, plinth, art panel, arch, building, tree, box, sphere, cylinder, cone, plus this demo's downloaded exhibit.

New objects outside that catalog are built from box, sphere, cylinder, cone, capsule, and torus parts. The result is a readable blocky design, not a photorealistic mesh, and there is no arbitrary geometry, no texture generation, and no generated code.

Parts can swing or spin around authored pivots, which is bounded rigid-part motion and nothing more. There are no autonomous agents or behaviors, no skeletal skinning, no physics joints or collisions, and no arbitrary generated animation or generated code. A swing turns up to 180 degrees with a period of 0.25 to 60 seconds, and a spin runs up to about four PI radians per second in either direction.

Pausing playback is inspection only and is never recorded in the layout, history, or an export. Undo and redo restore motion definitions rather than a recording of elapsed time. See [Articulated parts and playback](../../src/addons/roomcraft/README.md#articulated-parts-and-playback) in the add-on README for the exact motion contract.

A design holds at most 48 parts, a scene holds at most 384 parts across all designs, and parts nest at most 8 levels deep. Each part measures 0.01 to 5 meters per axis and its center stays within +/-5 meters per axis of its parent. A whole design must stay within +/-10 meters of its own origin and measure no more than 10 meters across on any axis, including everywhere its moving parts can reach. This is a per-object limit, not the world size: a larger setting uses separate compact objects positioned across its ground, along with landscape recipes. Reducing an object's scale does not relax its authored part bounds.

A scene holds at most 48 objects, positions stay within 10 meters of the scene origin, and scale multipliers run from 0.05 to 5.

A virtual environment is locally generated bounded visual geometry. Its ground, sky, water, banks, paths, and planting are constructed from application-authored geometry recipes. The model chooses layouts and parameters; it does not generate arbitrary mesh topology, textures, or executable shaders. There is no terrain heightmap, water or fluid simulation, weather, automatic day and night cycle, or physics. Planting areas have no automatic exclusion masks for ponds or paths, so overlapping features may need a follow-up edit.

Walking inside a virtual environment uses the SDK's existing simulator navigation controls. There is no ongoing collision, navigation mesh, or gravity, so you can still pass through a pond or a tree and walk off the edge of the ground. Clear standing-space selection happens only when choosing an entry pose, not continuously while walking or generating content.

Clear entry requires a level, nonsheared virtual ground. Translation, yaw rotation, and nonuniform scaling are supported, with standing clearance measured in world metres rather than scaled scene units. Physical-room mode does not offset the headset reference space.

A ground measures 4 to 20 meters per side. A planting holds 1 to 128 specimens and a scene holds at most 1024 specimens across all plantings, a path holds 2 to 12 points and is 0.15 to 3 meters wide, and a pond's water surface measures 0.2 to 20 meters per side with a 0.05 to 1 meter bank. Specimens stand 0.1 to 6 meters tall.

The environment's own sky, ground, and lights replace the demo's fallback lighting while an environment is active, and the fallback returns when there is none.

Quality depends on the model and the prompt. If a generated plan fails local validation, the demo shows Correcting and asks Gemini once more using the original request and bounded validation feedback. This handles malformed JSON and out-of-bounds designs without relaxing the limits, substituting a canned scene, or applying a partial result. The current world remains in place until a whole valid plan is ready, and success creates one undoable change. The correction adds at most one scene-planning request; if it also fails, the error is shown and your scene and draft are kept. Network, quota, loading, and concurrent-edit failures are not automatically retried. Multi-batch world generation is not implemented.

Only one operation runs at a time. Invalid plans, provider failures, and asset load errors leave the current scene intact and surface a message in the console.

Surface placement uses the SDK's detected planes in WebXR and in the simulator, and it needs a scanned horizontal plane whose area fits the whole composition's footprint. It is session local and is not a persistent anchor, a fitting footprint does not guarantee clearance from real furniture, and there is no hidden fallback: when nothing fits, the preview arrangement is kept so you can scan more of the room and retry.

The XR studio shows the selected object's name, part count, and how many of its parts move, offers the same Pause and Resume control, and shares errors and operation state with the desktop console. Typing uses the spatial keyboard rather than a native immersive text field. The full read-only part list with per-part motion, the JSON download, and Gemini key configuration remain in the desktop console.

Recorded hardware checks include Meta Quest immersive entry, scene generation and speech input, plus collaboration with a laptop. Automated browser checks cover additional scene, input, synchronization and error paths. These results are not exhaustive hardware validation for Android XR, mobile devices or every browser. Permission, audio routing, interruption and spatial-placement behavior still need checking on the target device.

## SDK ownership

Rendering, the frame loop, input, selection, manipulation, plane detection, and the AI facade all belong to XR Blocks. The demo's one-shot voice recorder uses native MediaRecorder and the SDK's configured Gemini client without taking over its live-audio capture subsystem. Part playback uses the SDK's injected frame timer, and the framing buttons reposition the existing desktop camera; the demo adds no renderer, animation loop, navigation system, raycaster, or bundled copy of three.js, and it adds no dependencies beyond the SDK's existing import map entries.

The virtual world mode is ordinary SDK configuration. It sets the session mode to VR, points `options.simulator.environments` at this directory's empty manifest, keeps the SDK's normal headset entry and unsupported-browser simulator fallback, chooses the opening simulator camera position through `options.simulator.initialCameraPosition`, and enables renderer shadow maps for that mode only. Desktop Enter world writes one camera pose, while initial XR placement uses three.js's shared WebXR reference space. Neither adds a movement loop or a collision solver.
