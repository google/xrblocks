# XR Blocks app runtime patterns

Read this before implementing an app's runtime. These are the durable app-side
rules from the SDK's in-tree guidance. Check the public entries and current
manual when a requested capability needs more detail.

## Engine model

- `xb.core` is the singleton engine. `xb.init(options)` creates the renderer,
  camera, XR session, subsystems, and frame loop.
- An `xb.Script` is a `THREE.Object3D` and the normal app extension point. Add
  scene content beneath it with `this.add(object)`.
- Register every script with `xb.add(script)` before `xb.init(options)`.
- Do not create a competing render loop, renderer, camera, or XR session. Put
  per-frame behavior in `update(time, frame)`.
- Access engine-created state in or after `init()`, not in a constructor.
- Use meters. Start from `xb.user.height`, `xb.user.objectDistance`, and
  `xb.user.panelDistance` instead of device-specific constants.

The useful singleton aliases are `xb.scene`, `xb.user`, `xb.world`, `xb.ai`,
`xb.depth`, `xb.sound`, `xb.input`, and `xb.camera`. Use the high-level alias
when it is the intended public API. For reusable scripts that consume engine
services, prefer dependency injection:

```js
class MainScript extends xb.Script {
  static dependencies = {world: xb.World};

  init({world}) {
    this.world = world;
  }
}
```

Copy the dependency key and class from a current manual page or working source
example; the registry key must exist.

## Pick the narrowest lifecycle hook

Override only the hooks the experience needs:

| Hook                                     | Use                                          |
| ---------------------------------------- | -------------------------------------------- |
| `init(deps?)`                            | Build initial state once; may be async.      |
| `update(time?, frame?)`                  | Run frame-dependent behavior.                |
| `initPhysics(physics)` / `physicsStep()` | Create and advance app physics behavior.     |
| `onSelectStart/End(event)`               | Respond globally to pinch or desktop click.  |
| `onSqueezeStart/End(event)`              | Respond globally to controller grip.         |
| `onKeyDown/Up(event)`                    | Provide keyboard input through `event.code`. |
| `onXRSessionStarted/Ended()`             | Enter or leave a real XR session.            |
| `onSimulatorStarted()`                   | React to desktop simulator startup.          |
| `dispose()`                              | Release resources owned by the script.       |

For an action aimed at scene content, use object-targeted hooks such as
`onObjectSelectStart/End`, `onObjectTouchStart/Touching/End`,
`onObjectGrabStart/Grabbing/End`, or `onHoverEnter/Hovering/Exit`. Return `true`
from a handled object selection or hover callback when propagation should stop.
Use `xb-add-interactions` for the complete interaction-generation workflow.

## Enable capabilities before initialization

Create one `xb.Options`, enable only the capabilities the experience uses, and
pass that same instance to `xb.init()`:

```js
const options = new xb.Options();
options.enableHands();
options.enableGestures();
options.enableDepth();
options.enablePlaneDetection();
options.enableObjectDetection();
options.enableCamera('environment');
options.enableAI();
options.enableContext();
options.enableXRTransitions();
```

Other current helpers include `enableUI`, `enableReticles`,
`enableControllers`, `enableHandRays`, `enableHeadGestures`, `enableStrokes`,
`enableHumanDetection`, `enableFaceDetection`, `enableSegmentation`,
`enableSceneContext`, `enableVisibleObjectsContext`, and
`enableSetOfMarkContext`. Verify the exact helper in
`src/core/Options.ts` before using it; some helpers enable prerequisite
capabilities and permissions themselves.

Physics is the important exception. There is no `enablePhysics()`:

```js
import RAPIER from '@dimforge/rapier3d-simd-compat';

options.physics.RAPIER = RAPIER;
```

Then implement `initPhysics(physics)` and, if needed, `physicsStep()` on the
script. Keep app physics separate from simulator environment physics.

## Use public APIs only

- Core imports must be exported by `src/xrblocks.ts`.
- Addon imports must come from that addon's public entry and match a working
  sample or documentation page.
- Treat source classes as behavioral evidence, not permission to deep-import
  internal files.
- Keep the app's `three` version aligned with the peer dependency and load only
  one copy. Follow `import-maps.md` for browser-native modules.
- Favor UIBlocks for spatial UI through `xb-add-spatial-ui`; use core UI only
  when a concrete constraint requires the fallback.

## Frequent generated-code failures

| Avoid                                                             | Use instead                                                  |
| ----------------------------------------------------------------- | ------------------------------------------------------------ |
| `options.enablePhysics()`                                         | Assign `options.physics.RAPIER`.                             |
| Reading `xb.core.renderer` or physics in a constructor            | Read initialized services in or after `init()`.              |
| Driving `requestAnimationFrame` directly                          | Implement `update(time, frame)`.                             |
| Calling `xb.init()` before `xb.add(script)`                       | Register all scripts first.                                  |
| Importing a symbol because a similarly named internal file exists | Confirm it in the public core or addon entry.                |
| Loading another `three` build for an addon                        | Share the pinned import-map or bundler dependency.           |
| `xb.ai.query('text')`                                             | Guard availability and call `xb.ai.query({prompt: 'text'})`. |
| Assuming client-side AI credentials are production-safe           | Use local keys only for prototyping; proxy production calls. |

When an API shape remains unclear, consult `docs/docs/manual/`, then a working
template, sample, or demo, and finally the implementation. Do not invent a
plausible method to bridge missing information.
