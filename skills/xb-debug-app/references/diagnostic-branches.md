# XR Blocks diagnostic branches

Read only the branch selected by the captured failure signal. The installed
package declarations, the repository public entry, and current implementation
override old examples and refactor notes.

## Authority and generated evidence

Start every branch with the version the application resolves, not the newest
source visible elsewhere.

1. Inspect the application's resolved `xrblocks/package.json` and dependency
   graph.
2. Verify root imports in its public declaration and package export. In the SDK
   repository, verify them in `src/xrblocks.ts`.
3. Verify addon imports in that addon's deliberate public entry and README.
4. Use the manual for concepts and the nearest current template or sample for
   executable composition.

Treat generated output as evidence only when a clean build produced it. An old
file below `build/`, a repository-only alias, or an implementation source path
is not an application API.

## Import, packaging, or startup failure

Use this branch for unresolved modules, duplicate-library behavior, lazy-chunk
404s, stale output, or failure before the application reaches `Script.init()`.

- Keep one compatible `three` instance. Confirm the package version and the
  browser import map or bundler graph resolve the same peer.
- Resolve every bare browser import, including peers used by private lazy
  chunks. Application code still imports public UI from `xrblocks`.
- Deploy the complete generated `build/` unit. Replace stale private or addon
  output instead of merging new files into an old directory.
- Import only the root package or a declared addon path. Keep
  `build/internal/`, shaders, codecs, transports, and source helpers private.
- Distinguish a parseable import map from a complete one. Confirm JSON syntax,
  exact specifiers, versions, and paths.

The nearest public import and import-map patterns live in `xb-build-app` and
its `references/import-maps.md`.

## Core initialization or first-frame failure

Use this branch when the module loads but engine services are missing, the
first frame never appears, or restart and disposal behave incorrectly.

- Register application scripts before `xb.init(options)` for the predictable
  startup path.
- Read engine-created services in or after `Script.init()`. Constructors run
  before renderer, camera, simulator, and optional subsystems are ready.
- Configure options, permissions, session features, physics, and optional
  dependencies before initialization. Guard runtime services that can remain
  undefined.
- Keep frame behavior in `update()` and let Core own the animation and sensor
  loops.
- Await terminal `xb.core.dispose()` and release application-owned resources in
  `Script.dispose()`.
- Trace asynchronous initialization across removal or teardown. A late promise
  must not reactivate a disconnected script.

## UI rendering, layout, or input failure

Use this branch when UI is missing, clipped, incorrectly sized, restyled
unexpectedly, or visible but not interactive.

- Use `UICard` for meter-sized world UI, `UIOverlay` for view-space UI, and
  `UIPanel` only as nested layout or grouping.
- Add public UI objects to the normal scene tree. Built-in UI mounts
  automatically and uses the shared interaction pipeline.
- Keep world root size and transforms in meters. Treat descendant layout
  numbers as layout units. Numeric `lineHeight` is a font-size multiplier; use
  an explicit unit string when that is the intent.
- Mutate public content, state, and `style` properties. Keep renderer nodes and
  UIKit backend state private.
- Run `xb.ui.validate()` after layout settles. Use its structured issues before
  guessing from private render geometry.
- Diagnose visual opacity, depth writing, and pointer participation as separate
  properties. A transparent surface can still affect depth or input.
- Treat a theme as palette plus structural roles. Confirm padding, gaps,
  radii, and control metrics as well as colors.

Read the current UI and Placement manuals before changing root type, style
units, theme, or spatial behavior.

## Interaction, reticle, touch, or manipulation failure

Use this branch when the wrong object reacts, callbacks have the wrong
identity, releases stick, touch fires twice, or manipulation claims the wrong
source or owner.

- Follow the resolved event: `source` is physical input, `target` is the
  logical object, `surface` is the physical hit surface, `currentTarget` is the
  dispatch listener, and `intersection` is the resolved hit.
- Use the event intersection inside the callback. Query `xb.user` outside that
  flow only when a fresh public ray result is required.
- Treat the reticle as presentation of Interaction's resolved hit. Visibility
  does not make it the target-data owner.
- Separate hover, contact, selection, grab, and manipulation phases. Confirm
  start, active, end, cancel, source loss, and release-outside behavior.
- Use handler propagation and `preventDefault()` for their implemented separate
  jobs. Verify the current event type before applying either.
- Store manipulation state per owner. Two sources can manipulate different
  owners, while an enabled two-source scale action can claim the free source
  for one owner.
- Let placement scripts suspend and rebase around manipulation. Keep placement
  policy outside the manipulation manager.

Read the current Interaction manual and only the matching reference in
`xb-add-interactions` before editing event or manipulation code.

## Model or scene-object failure

Use this branch when a model is absent, wrongly scaled, incorrectly centered,
not hittable, replaced unsafely, or loses animation state.

- Use the current retained `ModelViewer` load or `setContent()` surface.
- Separate authored asset normalization, application presentation scale,
  parent hierarchy scale, animation scale, bounds, and requested physical
  size. Measure the stage that is actually wrong.
- Use the object's supported bounds contract. Do not assume every renderable is
  a normal `THREE.Mesh`; splats and composite viewers can supply object-level
  bounds.
- Confirm origin alignment happens against the loaded content and current
  bounds.
- Keep stale asynchronous loads from replacing newer content. Dispose only
  content and resources the application owns.

Read the current ModelViewer manual. Physical meter fitting remains
application work unless the installed version exports an explicit fitting API.

## World sensing or simulator/device mismatch

Use this branch when planes, depth, meshes, recognition, context, hands, or
camera behavior is empty, stale, unsupported, or different on hardware.

- Confirm the exact option, permission, WebXR session feature, optional model
  dependency, and target device support before entering XR.
- Separate unsupported, denied, warming-up, empty, stale, and failed states.
  Clear observations when they stop being current.
- Let XR Blocks own sensor update loops. Bound explicit requests and use the
  same client identity to start and stop continuous detectors.
- Identify whether simulator evidence is synthetic, recorded, approximated, or
  unavailable. Do not use simulator success as proof of native sensor support.
- Keep sensing, interaction resolution, reticle presentation, and placement as
  separate owners.

Read only the selected branch in `xb-add-world-sensing/references/branches.md`
and its named current manual.

## Post-processing or XR-mode failure

Use this branch for a blank effects frame, per-eye mismatch, incorrect depth
pass, or confusion between visual AR/VR fades and WebXR session mode.

- Set `options.usePostprocessing` before initialization and register each
  `XRPass` once in `Script.init()` through `xb.core.effects`.
- Keep at least one pass when immersive XR post-processing is enabled. Confirm
  pass order, `readBuffer`, `writeBuffer`, and per-view `viewId` handling.
- Release custom pass GPU resources from `dispose()`; Core owns disposal of
  registered passes and intermediate targets.
- Use `xb.core.transition.toAR()` and `.toVR()` for the visual background fade.
  Use `options.enableVR()` before initialization to request an
  `immersive-vr` session.

Read the XR rendering effects and AR/VR transition sections in the Core manual.

## AI, media, sound, or network lifetime failure

Use this branch for provider unavailability, duplicate starts, remote close,
silent media, stale callbacks, or resources that survive teardown.

- Verify the selected provider or addon path supports the requested modality
  and that required credentials and permissions exist before connection.
- Make pending, unavailable, empty, disconnected, denied, and failed states
  observable.
- Give one owner to each microphone track, playback graph, live session,
  connection, timer, listener, and generated asset.
- Register callbacks before connection and make readiness depend on the real
  provider or transport open state.
- Route local stop, remote close, error, restart, and disposal through one
  idempotent cleanup path.
- Use an addon's README and public entry for its setup and lifecycle. Recheck
  runtime dependencies and clean-build output instead of importing protocol or
  transport internals.

Use `xb-add-ai` for provider behavior. Use the Sound manual or addon README for
the selected non-AI branch.
