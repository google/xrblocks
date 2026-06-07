# XR Blocks Skills

Focused, task-oriented skills for building **AI + XR** apps with the XR Blocks SDK
(`import * as xb from 'xrblocks'`). Each subfolder is one skill with a `SKILL.md` whose YAML
`description` tells an agent _what it does and when to use it_. Start with **`xb-core`**, then
pull in feature skills as needed.

For repo/build/architecture rules see [`../AGENTS.md`](../AGENTS.md); for the agent rules of
engagement see [`../CONTEXT.md`](../CONTEXT.md); for the full SDK overview see
[`../src/SKILL.md`](../src/SKILL.md).

## Naming convention

`xb-<area>` for a capability, `xb-<area>-<action>` for a narrower task (mirrors the
`gws-<service>[-<action>]` scheme in [googleworkspace/cli](https://github.com/googleworkspace/cli)).
The `xb-` prefix matches the `xb` import alias.

## Registry

| Skill                                       | Use when you need to…                                             |
| ------------------------------------------- | ----------------------------------------------------------------- |
| [`xb-core`](xb-core/SKILL.md)               | Bootstrap an app: `Script`, `Options`, the frame loop, run it     |
| [`xb-ui`](xb-ui/SKILL.md)                   | Build a HUD/menu with the core `SpatialPanel` grid                |
| [`xb-uiblocks`](xb-uiblocks/SKILL.md)       | Build rich flexbox UI (gradients, shadows) via the uiblocks addon |
| [`xb-modelviewer`](xb-modelviewer/SKILL.md) | Load & display GLTF / splat / primitive 3D models                 |
| [`xb-hands`](xb-hands/SKILL.md)             | Use hand tracking (joints, pinch, touch, grab)                    |
| [`xb-gestures`](xb-gestures/SKILL.md)       | Detect pinch/fist/point/spread/thumbs-up/open-palm                |
| [`xb-depth`](xb-depth/SKILL.md)             | Add depth sensing, occlusion, and depth-mesh colliders            |
| [`xb-world`](xb-world/SKILL.md)             | Detect real-world planes, meshes, and objects                     |
| [`xb-ai`](xb-ai/SKILL.md)                   | Query Gemini/OpenAI, run a live session, generate images          |
| [`xb-physics`](xb-physics/SKILL.md)         | Add Rapier rigid-body physics                                     |
| [`xb-simulator`](xb-simulator/SKILL.md)     | Develop/test in the desktop simulator                             |
| [`xb-netblocks`](xb-netblocks/SKILL.md)     | Add multiplayer presence, shared objects, voice                   |
| [`xb-lipsync`](xb-lipsync/SKILL.md)         | Drive audio-driven avatar mouths from any `MediaStream`           |
| [`xb-sound`](xb-sound/SKILL.md)             | Play spatial audio, record, recognize/synthesize speech           |

Deep references some skills link to live next to the code:
[`../src/SKILL.md`](../src/SKILL.md), [`../src/addons/uiblocks/SKILL.md`](../src/addons/uiblocks/SKILL.md),
[`../src/addons/netblocks/SKILL.md`](../src/addons/netblocks/SKILL.md), [`../src/addons/lipsync/SKILL.md`](../src/addons/lipsync/SKILL.md).
