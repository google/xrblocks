---
name: xb-add-interactions
description: Design and implement XR Blocks interactions. Use when adding selection, hover, direct touch, grab, gestures, event ownership, propagation, automatic manipulation, or physics-driven object behavior.
---

# Add interactions

Produce a complete **interaction contract in code**: intent, target, phases,
state owner, feedback, cleanup, and test instructions.

## 1. Inventory each user intent

For every requested action, record the actor, target, trigger, start/update/end
or cancel phases, one application state transition, feedback, and desktop/XR
test route. Keep separate rows when two actions have different ownership or
phase models, even when they use the same object.

Complete this step when every action has a target, phase model, state owner,
feedback, and user-test path.

## 2. Select one event family

Read
[`../../docs/docs/manual/Interaction.md`](../../docs/docs/manual/Interaction.md).
Use:

- global `Script` hooks for scene-owned commands;
- object select and hover hooks for resolved ray targets;
- touch and grab hooks for direct hand contact;
- gesture event targets for recognized hand poses or completed head motion;
- `object.xb.manipulation` for automatic translation, rotation, or scale;
- Rapier only for collision, gravity, momentum, throwing, or forces.

Read the selected branch reference:

- [`references/selection-and-direct-hands.md`](references/selection-and-direct-hands.md)
- [`references/gesture-events.md`](references/gesture-events.md)
- [`references/manipulation-and-physics.md`](references/manipulation-and-physics.md)

Complete this step when every action maps to one public event family without a
second raycast loop or a reconstructed higher-level event.

## 3. Implement ownership and feedback

Put the handler on the script that owns application state or contains the
logical target. Give targets intentional hit geometry. Use the event's
`source`, `target`, `surface`, `currentTarget`, and `intersection` instead of
raycasting again. Treat the reticle as presentation of the resolved hit.

Represent useful phases explicitly, such as `idle`, `hovered`, `active`,
`held`, and `disabled`. Keep handlers thin: validate the resolved event, change
one domain state, then update feedback. Share the domain method when several
input sources mean the same action.

Complete this step when every intent row has an owner, target geometry,
handler, phase state, domain transition, feedback, and release or cancel path.

## 4. Preserve event and manipulation semantics

Return `true` from a targeted callback only when its ancestor propagation must
stop. Use `event.preventDefault()` only where the event exposes it: touch start
can suppress the default touch selection, and manipulation start can suppress
the automatic transform. Propagation and default behavior are independent.

Automatic manipulation supports independent simultaneous object owners and
two-source scale on one owner. Keep per-object state on the object or owning
script, not in one global drag slot. Placement scripts suspend during
manipulation and rebase on resume.

Guard optional hands, joints, recognizers, and tracked data. Store listener
functions and remove them in `dispose()`. Provide stable unavailable,
interrupted, disabled, and canceled states.

Complete this step when propagation, default behavior, paired lifecycle phases,
concurrent owners, optional data, and cleanup are explicit for every branch.

## 5. Prove and hand off each action

Build or type-check the app, run focused tests, and start the exact simulator
route when available. Confirm targets, affordances, handlers, event fields,
state transitions, release behavior, and relevant console output. Use
[`../../templates/02_object_interaction/`](../../templates/02_object_interaction/)
as the current interaction foundation.

Give the user one compact test card per action: simulator steps, XR input,
target, start/active/result/release feedback, state change, and device-only
checks.

Finish when every action can be tested without inferring its controls, expected
feedback, or cancellation behavior from source.
