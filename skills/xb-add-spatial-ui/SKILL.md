---
name: xb-add-spatial-ui
description: Build spatial UI in XR Blocks. Use when adding cards, overlays, panels, text, controls, model-viewer interfaces, layout, styling, themes, or UI placement with the built-in UI system.
---

# Add spatial UI

Build a **usable surface**: information and controls that remain legible,
targetable, and observable in their intended pose.

## 1. Write the surface contract

Record every displayed value and action, its state owner, spatial anchor,
appearance states, update cadence, desktop input, XR input, and observable
result.

Complete this step when every value and control has a user purpose, source,
anchor, and testable result.

## 2. Select the correct UI root

Read [`../../docs/docs/manual/UI.mdx`](../../docs/docs/manual/UI.mdx) before
implementation.

- Use `UICard` for a world-space surface measured and positioned in meters.
- Use `UIOverlay` for a bounded view-space surface.
- Use `UIPanel` only inside a card or overlay for layout or visual grouping.

Import components from `xrblocks`. Built-in UI starts automatically and joins
the normal XR Blocks interaction pipeline. Application code does not enable a
UI subsystem, register UIKit, or install a second raycaster.

Complete this step when one root owns the intended coordinate space and every
nested element has one layout parent.

## 3. Compose semantic UI

Build reading order with `UIPanel`, `UIText`, `UIImage`, and `UIIcon`. Use
`UIButton` and `UISlider` for actions instead of raw pointer handlers. Use
`ModelViewer` for supported interactive model presentation. Use semantic UI for
status, telemetry, instructions, and debug state instead of canvas sprites.

Treat `UICard.size` and world transforms as meters. Treat descendant numeric
layout values as UIKit layout units. Treat numeric `lineHeight` as a font-size
multiplier; use `px` or `%` strings for explicit units.

Use `size: {width, height: 'auto'}` for content-driven cards. Keep the width
fixed so text and percentage-width children have a stable wrapping constraint.
Use a numeric height only when the surface must have a fixed physical size.

Complete this step when all content fits at the intended physical size and each
state-changing control has hover or active feedback plus an observable result.

## 4. Connect state, theme, and spatial behavior

Update component properties directly. Keep mounted text and controls stable;
change structure only when the application structure changes. Use a theme
preset or theme update for shared palette and structural roles, then use local
styles for exceptions.

Use `pointerEvents`, `interactionEnabled`, visibility, material depth behavior,
and opacity for their separate purposes. Transparency alone does not disable
depth writes or input.

Read [`../../docs/docs/manual/Placement.md`](../../docs/docs/manual/Placement.md)
when the root follows, faces, or orbits another object. Read
[`../../docs/docs/manual/Interaction.md`](../../docs/docs/manual/Interaction.md)
for manipulation and target semantics.

Complete this step when state changes update the intended mounted element,
theme changes produce the intended structure and palette, and placement does
not compete with user manipulation.

## 5. Validate and hand off

Build or type-check the app. After a completed UI frame, run `xb.ui.validate()`
for the root or all roots. Check overflow, clipping, disabled behavior, input,
cleanup, and relevant console output. Start from
[`../../templates/01_spatial_ui/`](../../templates/01_spatial_ui/) or the
closest focused sample for executable evidence.

Give the user the exact URL, viewing pose, input route, control instructions,
and expected idle, hover, active, disabled, and result states. Name real-device
checks for legibility, target size, occlusion, reach, and head motion.

Finish when validation and available smoke checks pass and the user can test
every control and state without inferring expected behavior from source.
