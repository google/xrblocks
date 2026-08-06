---
name: xb-add-world-sensing
description: >-
  Implement physical-world sensing in an XR Blocks app. Use when adding
  planes or scene meshes, depth or occlusion, world collision, object, human,
  or face recognition, segmentation, or agent-facing scene context; also use
  when choosing simulator and device evidence for those features.
---

# Add world sensing

Build a complete **sensing behavior**: physical or scene evidence enters the
app, becomes state, and produces an observable reaction. Use
[`../xb-build-app/SKILL.md`](../xb-build-app/SKILL.md) when the surrounding app
does not exist yet.

## 1. Write the sensor contract

Name all four parts before editing code:

1. **signal** — the physical fact or scene fact to observe;
2. **cadence** — engine-updated, one-shot, or continuous;
3. **reaction** — placement, UI state, physics, occlusion, or agent action;
4. **absence** — the stable behavior for unsupported, denied, warming-up,
   empty, stale, and failed states.

Choose the narrowest sensing branch that provides the signal. Read
[`references/branches.md`](references/branches.md) now for the selection table,
then read only the selected branch section.

This step is complete when one named signal maps to one reaction and every
absence state maps to an explicit application state.

## 2. Prove the branch before implementation

Verify every planned symbol in [`../../src/xrblocks.ts`](../../src/xrblocks.ts)
and its implementation. Then inspect the selected branch's linked sample,
template, demo, and manual page from the branch reference. Treat executable
code as authoritative when older prose differs.

Record before `xb.init(options)`:

- the exact option that enables the subsystem;
- browser permissions and WebXR session features;
- optional imports or import-map entries;
- simulator fidelity and the real-device check.

This step is complete when each required input has a source file or working
artifact that proves it exists and the target runtime is stated.

## 3. Connect signal to reaction

Configure sensing before `xb.init(options)`. Put application behavior in an
`xb.Script`; let XR Blocks own the render and sensor update loops. For explicit
detection, guard concurrent requests and render a pending state. For continuous
object, human, face, or context detection, call `start(client)` and later
`stop(client)` with the same object. Track freshness in application state when
stale observations matter.

Convert successful output into the requested reaction. Convert empty arrays,
`null`, missing data, permission failures, and rejected session startup into
the contract's absence state rather than leaving old output visible.

This step is complete when a fresh signal changes observable app state and a
missing signal clears or replaces it deterministically.

## 4. Prepare the sensing handoff

Run code-level checks and startup smoke available in the environment. Confirm
the selected options, imports, permissions, detector ownership, result-to-state
mapping, absence states, freshness handling, and cleanup are implemented. Add a
deterministic simulator environment or object ground-truth configuration when
that branch supports it.

Give the user separate simulator and device instructions where their evidence
differs. Name the URL, permission prompts, physical signal to present, expected
scene reaction, empty/no-result behavior, and how stale output clears. State
exactly which simulator signals are synthetic and which native behavior still
requires the target WebXR device.

Finish when the sensing implementation is complete and the user has
reproducible steps for successful, empty, denied, unsupported, and stale states
that apply to the selected branch.
