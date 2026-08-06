---
name: xb-add-interactions
description: >-
  Generate and implement user interactions for an XR Blocks app. Use when
  adding scene-wide actions, ray hover or selection, direct hand touch or grab,
  gestures, dragging, manipulation, or physics-driven object behavior.
---

# Add interactions

Produce a complete **interaction design in code**: input intent, event
ownership, target geometry, state transitions, feedback, cleanup, and user test
instructions. If the app shell does not run yet, establish it with
[`xb-build-app`](../xb-build-app/SKILL.md) first.

## 1. Inventory every action

For each requested interaction, record:

1. **actor** — mouse, keyboard, gaze, hand, tracked controller, or head motion;
2. **target** — whole scene, object, handle, UI control, or empty space;
3. **trigger** — click, pinch, squeeze, hover, touch, grab, pose, motion, or key;
4. **phases** — start, continuous update, end, cancel, and disabled where used;
5. **result** — the single application state transition owned by the action;
6. **feedback** — visible, audible, or haptic response for available phases;
7. **parity** — the simulator input and any XR-only behavior.

Keep one row per distinct user intent. A drag and a tap on the same object are
separate actions because their ownership and phases differ.

This step is complete when every requested action has a target, event phases,
state owner, feedback, and user-test path.

## 2. Select the interaction system

Choose the highest-level public API that expresses each action:

- **Scene-wide action:** global `Script` hooks such as `onSelect*`,
  `onSqueeze*`, and `onKey*`.
- **Pointed object:** `onObjectSelectStart/End` and `onHover*`; enable reticles
  when users need a visible ray target.
- **Direct hand contact:** `options.enableHands()` with `onObjectTouch*` or
  `onObjectGrab*`.
- **Named hand pose:** `options.enableGestures()` with
  `xb.core.gestureRecognition` events.
- **Completed head motion:** `options.enableHeadGestures()` with
  `xb.input.headGestures` events.
- **Ray-driven translation, rotation, or scaling:** `xb.core.dragManager` and
  `xb.DragMode`.
- **Collision, gravity, momentum, throwing, or forces:** Rapier through
  `options.physics.RAPIER`, `initPhysics()`, and `physicsStep()`.

Read [selection and direct hands](references/selection-and-direct-hands.md),
[gesture events](references/gesture-events.md), or
[manipulation and physics](references/manipulation-and-physics.md) for the
selected branch. Confirm every symbol in
[`../../src/xrblocks.ts`](../../src/xrblocks.ts) and every hook signature in
[`../../src/core/Script.ts`](../../src/core/Script.ts).

This step is complete when each action maps to one public event family without
reconstructing a higher-level event in `update()`.

## 3. Generate the interaction structure

Create the code around the action inventory:

- Put the handler on the `xb.Script` that owns the application state or contains
  the targeted mesh.
- Give ray and touch targets intentional geometry. Use a separate invisible hit
  mesh when the visible geometry is too thin, irregular, or small to target
  comfortably.
- Represent relevant phases explicitly—commonly `idle`, `hovered`, `active`,
  `held`, and `disabled`—and derive visuals from that state.
- Keep event handlers thin: validate the source/target, update one domain state,
  then update feedback. Share the domain method when several input sources mean
  the same action.
- Use continuous callbacks only for continuous behavior such as hover, held
  selection, grabbing, dragging, or physics synchronization.
- Make affordances readable before activation: reticle, outline, handle,
  highlight, label, cursor change, or another cue appropriate to the scene.
- Give start/hover/held states immediate feedback and make end/cancel restore a
  stable state.
- Name interactive objects and handles when simulator instructions, context,
  automation, or debugging must identify them.

For direct manipulation, preserve the initial hand-to-object or
controller-to-object offset so the object does not snap on grab. For physics,
keep the rigid body authoritative and synchronize the visual object during
`physicsStep()`.

This step is complete when every inventory row has an owning object, target
geometry, handler, phase state, domain transition, feedback, and release path in
the implementation.

## 4. Preserve XR Blocks event semantics

Enable required options before `xb.init(options)` and implement matching start
and end phases.

- Return `true` from object-select or hover hooks only when that script consumes
  the event and ancestor handling should stop.
- Treat touch and grab hooks as always-bubbling callbacks; their return values
  do not stop propagation.
- Assign one domain transition to either the global or object-select family so
  a single select input cannot apply it twice.
- Store event-listener functions and remove them in `dispose()`.
- Guard optional hands, joints, gesture recognizers, and tracked input data.
- Provide waiting, unavailable, disabled, and interrupted states when the
  selected input may disappear.
- Add Rapier only when physical dynamics are part of the requested behavior.

This step is complete when paired lifecycle phases, propagation, optional data,
and cleanup are explicit for every interaction branch.

## 5. Prepare the user interaction handoff

Run code-level checks available in the environment: resolve imports, build or
type-check changed code, load the initial scene, and confirm interactive targets
and affordances initialize without relevant console errors. Inspect that each
inventory row is wired to its intended public callback and state owner.

Give the user one compact card per action:

- simulator mode and exact mouse, keyboard, controller, or simulated-hand steps;
- XR input source and gesture;
- target or handle to operate;
- expected start, active, result, and release feedback;
- expected application state change;
- device-only checks such as reach, tracking, target size, grip comfort,
  throwing feel, or haptics.

Finish when the interaction implementation is complete and the user can test
every action without inferring controls, expected feedback, or device-specific
checks from the source.
