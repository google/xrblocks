# Live, tools, and grounding

Read this reference only for a Live, tool, camera, screenshot, or scene-context
branch.

## Owned Live loop

`xrblocks/addons/ai/GeminiManager.js` owns the common microphone, playback,
camera or screenshot frame, callback, tool-dispatch, transcription, timer, and
cleanup loop. Subclass it when that ownership fits. Use lower-level `xb.ai`
methods only when the application needs a materially different loop.

Make `connecting`, `listening`, `speaking`, `interrupted`, `disconnected`, and
`failed` visible. A returned session can precede `onopen`, so use `onopen` as
the ready transition. Route startup failure, remote close, local stop, and
`dispose()` through one idempotent cleanup method.

The cleanup owner stops the Live session, application audio capture and
playback, screenshot or camera intervals, app-owned media tracks, pending UI
state, and duplicate-start lock.

For `GeminiManager.startGeminiLive()`, choose the capture source explicitly.
The default `captureMode: 'camera'` excludes virtual app objects and can be black
in an empty simulator environment. Use `captureMode: 'screenshot'` with
`overlayOnCamera: true` for virtual objects over the environment, or `false` for
virtual-only content. Enable the camera before initialization when capturing or
overlaying it. Startup also requires microphone input; DevTools sessions provide
a synthetic microphone, but separately launched browsers need their own mock.
See `docs/docs/manual/AI.mdx` for the startup example and audio injection usage.

## Narrow tools

Use an exported `xb.Tool` with a narrow name, description, and JSON schema. The
model's arguments are untrusted. Validate types, ranges, target identity, and
authorization in `onTriggered`, then return structured success or failure.

Keep scene mutation in the application. Return explicit failures for invalid
arguments, missing targets, unknown tools, denied actions, and execution
errors. Require visible confirmation for consequential actions.

## Smallest grounding input

Choose the smallest observation that answers the question:

1. known application state or prompt;
2. semantic tree or visible-object snapshot;
3. Set-of-Mark image when spatial labels are required;
4. rendered screenshot for virtual content;
5. device-camera frame for the physical view.

Enable context or camera before initialization. Request context outputs from
one snapshot when they must agree. Treat context IDs as opaque and resolve them
through the public context API. Pair continuous context `start(client)` with
`stop(client)` using the same client object.

Context collection and provider transmission are separate decisions. Collect
and send only the data required by the contract, and make physical-camera
capture distinct from virtual rendered capture in the disclosure.
