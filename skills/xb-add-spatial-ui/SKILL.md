---
name: xb-add-spatial-ui
description: >-
  Add a spatial interface to an XR Blocks app. Use for menus,
  HUDs, cards, dashboards, dialogs, labels, buttons, controls, or object-attached
  interfaces, including fixing their layout, styling, placement, or interaction.
---

# Add spatial UI

Build a **usable surface**: information and controls that remain legible,
targetable, and observable in their intended spatial pose.

## 1. Specify the surface contract

Record:

- the values the surface presents and the actions it exposes;
- whether it is world-fixed, object-anchored, head-leashed, or billboarded;
- when it appears, moves, updates, and disappears;
- the desktop and XR input paths that must operate it.

The contract is complete when every displayed value and control has a user
purpose, state source, spatial anchor, and observable result.

## 2. Establish the UIBlocks foundation

Use the `uiblocks` addon for app UI. Its flexbox layout, rich styling,
interactive panels, and spatial behaviors make it the stable default even for a
simple first surface. Keep each physical surface entirely within UIBlocks.

Before implementation, read
[references/uiblocks.md](references/uiblocks.md) completely. Copy its verified
bare `uiblocks` import, import map or bundler setup, renderer registration, and
raycast sorting. Confirm imported addon symbols exist in
`src/addons/uiblocks/src/index.ts` rather than assuming they belong to core
`xrblocks`.

Use core `xb.SpatialPanel` only after identifying a concrete constraint that
UIBlocks cannot satisfy, such as an environment that cannot load its browser
peers or an explicitly required legacy `SpatialPanel` integration. Record the
constraint, then read
[references/core-ui-fallback.md](references/core-ui-fallback.md). A preference
for fewer setup lines is not a constraint.

The foundation is complete when the app resolves `xrblocks`, `uiblocks`,
`three`, and UIBlocks peers from one dependency graph; calls `enableUI()` and
`options.uikit.enable(uikit)` before `xb.init()`; and installs
`raycastSortFunction` before controls are created.

## 3. Compose one coherent surface

Create one `UICard` per spatial pivot and partition it with nested `UIPanel`
flex layouts. Establish a small density, type, spacing, shape, and color scale;
then add `UIText`, `UIImage`, and `UIIcon` in reading order. Compose buttons from
an interactive `UIPanel` plus content. Use behaviors for leash, billboard,
manipulation, anchoring, and show/hide motion when the surface contract calls for
them.

The surface is complete when every required value is visible, the layout fits
inside the card at its intended physical dimensions, and every state-changing
control has hover feedback plus an observable click result.

## 4. Prepare the spatial UI handoff

Build or type-check the app and load its initial surface when browser access is
available. Confirm imports, renderer registration, layout construction,
raycast sorting, control handlers, feedback states, and cleanup are present
without relevant startup errors.

Give the user the exact simulator/XR URL, intended viewing pose, input path, and
one short instruction per control. State the expected idle, hover, active,
disabled, and result visuals that apply. Hand off spatial judgments—legibility
over the real background, target size, occlusion, reach, head motion, and
repositioning—as an explicit checklist.

Finish when the surface implementation is complete and the user can evaluate
every control and spatial state without inferring expected behavior from code.
