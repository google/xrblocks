# XR Blocks Skills

Focused, task-oriented skills for building **AI + XR** apps with the XR Blocks SDK
(`import * as xb from 'xrblocks'`). Each subfolder is one skill with a `SKILL.md` whose YAML
`description` tells an agent _what it does and when to use it_. Start with
**`xb-build-app`**, then compose only the focused workflow skills the request
actually triggers.

For repo/build/architecture rules see [`../AGENTS.md`](../AGENTS.md); for the agent rules of
engagement see [`../CONTEXT.md`](../CONTEXT.md); for the full SDK overview see
[`../src/SKILL.md`](../src/SKILL.md).

## Naming convention

Workflow skills use `xb-<verb>-<outcome>` so their invocation matches a developer
intent, such as `xb-build-app` or `xb-add-ai`. Existing capability references use
`xb-<area>`. The `xb-` prefix matches the `xb` import alias.

## Primary workflow skills

| Skill                                                   | Use when you need to…                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| [`xb-build-app`](xb-build-app/SKILL.md)                 | Build an app through a simulator or XR user-testing handoff        |
| [`xb-add-interactions`](xb-add-interactions/SKILL.md)   | Generate hands, gaze, grabbing, gesture, or manipulation behavior  |
| [`xb-add-spatial-ui`](xb-add-spatial-ui/SKILL.md)       | Add a usable menu, HUD, card, dashboard, label, or control surface |
| [`xb-add-world-sensing`](xb-add-world-sensing/SKILL.md) | Make the app observe and react to the physical world               |
| [`xb-add-ai`](xb-add-ai/SKILL.md)                       | Add complete query, Live, generation, or tool-driven AI behavior   |
| [`xb-automate-app`](xb-automate-app/SKILL.md)           | Expose browser or remote controls to an external process           |
| [`xb-contribute-sdk`](xb-contribute-sdk/SKILL.md)       | Change SDK seams, public APIs, tests, examples, and docs together  |

## Supporting capability references

The workflow skills above consolidate these narrower references and the manual.
Use a capability reference when debugging that subsystem or when a workflow
skill points to it; start app-generation work from the workflow layer.

| Skill                                           | Use when you need to…                                                |
| ----------------------------------------------- | -------------------------------------------------------------------- |
| [`xb-core`](xb-core/SKILL.md)                   | Bootstrap an app: `Script`, `Options`, the frame loop, run it        |
| [`xb-ui`](xb-ui/SKILL.md)                       | Build a HUD/menu with the core `SpatialPanel` grid                   |
| [`xb-uiblocks`](xb-uiblocks/SKILL.md)           | Build rich flexbox UI (gradients, shadows) via the uiblocks addon    |
| [`xb-modelviewer`](xb-modelviewer/SKILL.md)     | Load & display GLTF / splat / primitive 3D models                    |
| [`xb-hands`](xb-hands/SKILL.md)                 | Use hand tracking (joints, pinch, touch, grab)                       |
| [`xb-agenthands`](xb-agenthands/SKILL.md)       | Give an AI agent gesturing hands + an orb that point at real objects |
| [`xb-gestures`](xb-gestures/SKILL.md)           | Detect pinch/fist/point/spread/thumbs-up/open-palm                   |
| [`xb-head-gestures`](xb-head-gestures/SKILL.md) | Detect completed head nod and shake motions                          |
| [`xb-depth`](xb-depth/SKILL.md)                 | Add depth sensing, occlusion, and depth-mesh colliders               |
| [`xb-world`](xb-world/SKILL.md)                 | Detect real-world planes, meshes, and objects                        |
| [`xb-context`](xb-context/SKILL.md)             | Read agent-facing scene context, visible objects, and SOM labels     |
| [`xb-ai`](xb-ai/SKILL.md)                       | Query Gemini/OpenAI, run a live session, generate images             |
| [`xb-physics`](xb-physics/SKILL.md)             | Add Rapier rigid-body physics                                        |
| [`xb-simulator`](xb-simulator/SKILL.md)         | Develop/test in the desktop simulator                                |
| [`xb-netblocks`](xb-netblocks/SKILL.md)         | Add multiplayer presence, shared objects, voice                      |
| [`xb-lipsync`](xb-lipsync/SKILL.md)             | Drive audio-driven avatar mouths from any `MediaStream`              |
| [`xb-sound`](xb-sound/SKILL.md)                 | Play spatial audio, record, recognize/synthesize speech              |
| [`xb-testing`](xb-testing/SKILL.md)             | Write sequential functional, integration, or simulator tests         |

Deep references some skills link to live next to the code:
[`../src/SKILL.md`](../src/SKILL.md), [`../src/addons/uiblocks/SKILL.md`](../src/addons/uiblocks/SKILL.md),
[`../src/addons/netblocks/SKILL.md`](../src/addons/netblocks/SKILL.md), [`../src/addons/lipsync/SKILL.md`](../src/addons/lipsync/SKILL.md).
