---
name: xb-add-world-sensing
description: Connect physical-world sensing to XR Blocks application state. Use when adding planes, scene meshes, depth, occlusion, world collision evidence, object or human recognition, face tracking, segmentation, or agent-facing scene context.
---

# Add world sensing

Build a complete **sensing behavior**: evidence enters the app, becomes current
state, and produces an observable reaction.

## 1. Write the sensor contract

Name the physical or scene signal, cadence, observable reaction, data freshness,
permissions, target runtime, and behavior for unsupported, denied, warming-up,
empty, stale, and failed states.

Read [`references/branches.md`](references/branches.md), select the narrowest
branch that supplies the signal, and read only that branch's manual and example.

Complete this step when one named signal maps to one reaction and every absence
state maps to an explicit application state.

## 2. Prove the selected branch

Verify each planned symbol in
[`../../src/xrblocks.ts`](../../src/xrblocks.ts) and its implementation. Inspect
the linked current manual, template, or sample. Record the exact option,
permission, WebXR session feature, optional dependency, simulator fidelity, and
real-device check before editing application code.

Complete this step when every input has current source or executable evidence
and the target runtime is explicit.

## 3. Connect evidence to app state

Configure the branch before `xb.init(options)` and keep application behavior in
an `xb.Script`. Let XR Blocks own sensor and render update loops. For explicit
detection, prevent uncontrolled concurrent requests and display pending state.
For continuous detectors, use `start(client)` and `stop(client)` with the same
client object.

Convert success into the requested reaction. Convert empty arrays, `null`,
missing sensor data, denied permission, rejected session startup, and stale
observations into the contract's absence state. Clear previous output when it
is no longer current.

Complete this step when fresh evidence changes observable state and missing or
stale evidence clears or replaces it deterministically.

## 4. Preserve targeting and placement ownership

Use the interaction pipeline's resolved hit for ray-based placement. A reticle
displays that hit; it does not own target data. Use
`xb.world.placeOnHorizontalSurface()` for one-time surface placement. Use the
[Placement manual](../../docs/docs/manual/Placement.md) for continuous
follow/face/orbit behavior and its manipulation rebasing.

Complete this step when the sensor, interaction resolver, reticle, and placed
object each have one clear responsibility.

## 5. Prove and hand off sensing

Build or type-check the app and start the exact simulator route when available.
Confirm options, imports, permissions, detector ownership, freshness, result
mapping, absence states, and cleanup. Add deterministic simulator ground truth
only when the branch supports it.

Give separate simulator and device instructions when their evidence differs.
Name the signal to present, expected reaction, empty result, stale clearing,
permissions, and synthetic versus native evidence.

Finish when successful, empty, denied, unsupported, failed, and stale states
have reproducible checks for the selected branch.
