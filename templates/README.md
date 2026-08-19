# XR Blocks Templates

Templates are small, complete starting points for common XR application goals.
Each no-build template runs in the desktop simulator and uses the same input
path in WebXR where the required device capability is available.

Run the repository server, then open a template at its numbered path:

```bash
npm run build:sdk
npm run serve
```

For example, open `http://127.0.0.1:8080/templates/00_basic/`.

## Start

- [`00_basic`](00_basic): Script lifecycle, one animated object, and selection.
- [`01_spatial_ui`](01_spatial_ui): Core flex-layout spatial UI and controls.
- [`13_typescript_vite`](13_typescript_vite): Separate npm project starter for
  TypeScript and Vite.

## Interact

- [`02_object_interaction`](02_object_interaction): Select, touch, grab, move, and
  release an object.
- [`03_spatial_placement`](03_spatial_placement): Follow a live depth raycast and
  place content.
- [`12_hand_gestures`](12_hand_gestures): Inspect built-in heuristic gestures
  for both hands.

## Sense and understand

- [`05_camera_view`](05_camera_view): Display and switch device-camera feeds.
- [`08_scene_understanding`](08_scene_understanding): Detect physical objects and
  attach readable spatial results.
- [`11_agent_context`](11_agent_context): Generate semantic, visibility, and
  Set-of-Mark context for agents.

## AI

- [`06_ai_query`](06_ai_query): Send a text query to an AI model.
- [`07_ai_live_assistant`](07_ai_live_assistant): Run a live audio and camera AI
  session.

The AI templates can show an opt-in browser key prompt for local prototypes.
Never ship provider API keys in client code. Production applications must send
AI requests through a server that you control.

## Present and simulate

- [`04_stereo`](04_stereo): Present different media to the left and right eyes.
- [`09_xr_modes`](09_xr_modes): Change between passthrough AR and immersive VR.
- [`10_environment_physics`](10_environment_physics): Collide Rapier objects
  with the live depth mesh.
- [`14_simulator_setup`](14_simulator_setup): Start the desktop simulator with
  its interface, control modes, and common debug visualizations enabled.

Each folder includes its own controls, requirements, device behavior, and next
customization steps in `README.md`.
