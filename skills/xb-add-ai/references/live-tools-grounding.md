# Live, tools, and grounding

Read this reference only for a Live, tool-calling, camera/scene grounding, or
embodied-action branch.

## Prefer the owned Live loop

`xrblocks/addons/ai/GeminiManager.js` owns the common loop: microphone streaming,
model audio playback, camera or rendered-scene frames, Live callbacks, tool
dispatch, transcription events, interruption, timers, and cleanup. Subclass it
when that ownership fits; use the lower-level `xb.ai` methods only when the app
needs a materially different loop.

```js
import {GeminiManager} from 'xrblocks/addons/ai/GeminiManager.js';

class Companion extends GeminiManager {
  init() {
    super.init();
    this.captureMode = 'screenshot'; // or 'camera'
    this.overlayScreenshotOnCamera = true;
  }
}
```

Before starting, call `await xb.core.sound.enableAudio()`. Its default
`streamToAI: true` captures PCM and sends correctly nested `audio` messages.
Model audio arrives as `message.data`; play it with
`xb.core.sound.playAIAudio(message.data)`. On interruption, call
`xb.core.sound.stopAIAudio()`.

The addon starts frame capture only after `onopen`, defaults to one frame per
second, and supports camera `fps`, JPEG `quality`, `width`, and `height`. Match
resolution and frequency to what the task needs; every frame leaves the device.

## Make Live readiness observable

`await xb.ai.startLiveSession()` resolves when the provider returns a session,
which may precede the `onopen` callback. If the interaction requires a ready
socket, wrap startup in a promise resolved by `onopen` and rejected by `onerror`
or a pre-open `onclose`. Represent connecting, listening, speaking,
interrupted, disconnected, and failed states in the experience.

Route local stop, remote close, startup failure, and `dispose()` through one
idempotent cleanup routine. It owns:

- `await xb.ai.stopLiveSession()` for local shutdown;
- `xb.core.sound.disableAudio()` and `xb.core.sound.stopAIAudio()`;
- screenshot/camera intervals and app-created media tracks;
- pending UI state and the lock that prevents duplicate sessions.

## Constrain tools

Use an exported `xb.Tool` with a narrow name, description, and JSON schema. Keep
the final authorization and scene mutation in `onTriggered`; model-provided
arguments are untrusted input.

```js
const setColor = new xb.Tool({
  name: 'set_object_color',
  description: 'Set one allowed scene object to an approved hex color.',
  parameters: {
    type: 'OBJECT',
    properties: {
      objectId: {type: 'STRING'},
      color: {type: 'STRING'},
    },
    required: ['objectId', 'color'],
  },
  onTriggered: async ({objectId, color}) => {
    // Resolve against an allowlist and validate color before mutation.
    return {objectId, color};
  },
});
```

Pass tools to `GeminiManager.startGeminiLive({tools: [setColor]})`. The addon
adds their declarations, executes matching calls, and sends:

```js
xb.ai.sendToolResponse({
  functionResponses: {
    id: functionCall.id,
    name: functionCall.name,
    response: {output, error},
  },
});
```

Return a structured failure for invalid arguments, missing targets, unknown
tools, denied actions, and execution errors. Keep a visible confirmation step
for consequential actions.

## Ground on the smallest observation

Choose the narrowest input that answers the model's question:

- a prompt or known app state before any image;
- a compact semantic tree or visible-object snapshot before raw scene traversal;
- a Set-of-Mark screenshot when spatial labels are needed;
- a rendered screenshot for virtual content;
- a device-camera frame only for the physical view.

Enable scene context before initialization with `options.enableContext()` or a
narrower `enableSceneContext()`, `enableVisibleObjectsContext()`, or
`enableSetOfMarkContext()`. Use one
`xb.context.scene.runContextDetection({...})` call when multiple outputs must
describe the same frame. Stable `ctx_*` ids are opaque; resolve one with
`xb.context.scene.resolveNodeObject(id)` instead of interpreting it.

If continuous context polling is required, pair
`xb.context.scene.start(client)` with `stop(client)` using the same client
object. Context collection and provider transmission are separate decisions:
enable only needed context streams and send only the selected result.

Camera grounding requires `options.enableCamera('environment')` and user
permission. Rendered screenshots come from
`xb.core.screenshotSynthesizer.getScreenshot(overlayOnCamera)`. Make capture
obvious to the user and distinguish physical-camera data from virtual rendered
content in the disclosure.
