# Simulator Hand Poses Demo

Small developer demo for inspecting and authoring simulator hand poses.

The demo shows both simulator hands, exposes per-joint semantic rotation
controls, and displays the resolved raw joint transforms produced by forward
kinematics. It is useful when tuning preset hand poses, checking gesture
recognition behavior, or copying rotation JSON into simulator pose data.

## Controls

- Use the simulator hand pose controls to switch between built-in poses.
- Use the sidebar sliders to edit the currently displayed pose rotations.
- Rotation sliders are shown in degrees from `-180` to `180`.
- The runtime hand rotation API still uses radians.
- The controls mirror the active simulator hand and update as the displayed
  pose changes.
- `Reset` returns the edited hand rotations to neutral.

## JSON Views

- `Raw JSON` shows the currently displayed WebXR-style joint transforms after
  FK resolution.
- `Rotations JSON` shows the semantic rotation data for the active hand.
- Use `Copy` to copy either JSON view.

## AI Prompt

The prompt bubble can generate semantic hand rotations from a text
description when AI support is configured. Generated rotations are applied to
both hands and can then be inspected or adjusted with the sliders.
