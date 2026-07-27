# Runtime and public API guardrails

Read this when implementation touches application runtime, `xb.Options`,
`xb.Script`, public exports, addon imports, or engine lifecycle behavior.

## Engine model

- `xb.core` is the singleton engine. `xb.init(options)` creates the renderer,
  camera, XR session, subsystems, and frame loop.
- An `xb.Script` is a `THREE.Object3D` and the normal app extension point. Add
  scene content beneath it with `this.add(object)`.
- Register every app script with `xb.add(script)` before `xb.init(options)`.
- Do not create a competing render loop, renderer, camera, or XR session. Put
  per-frame application behavior in `update(time, frame)`.
- Access engine-created state in or after `init()`, not in a constructor.
- Use meters. Start app placement from `xb.user.height`,
  `xb.user.objectDistance`, and `xb.user.panelDistance` instead of
  device-specific constants.

The useful singleton aliases are `xb.scene`, `xb.user`, `xb.world`, `xb.ai`,
`xb.depth`, `xb.sound`, `xb.input`, and `xb.camera`. Use a high-level alias when
it is the intended public API. For reusable scripts that consume engine
services, prefer dependency injection:

```js
class MainScript extends xb.Script {
  static dependencies = {world: xb.World};

  init({world}) {
    this.world = world;
  }
}
```

Copy the dependency key and constructor from a current working example or
source registration; the registry key must exist. SDK changes must register
option and runtime objects before dependent scripts initialize.

## Pick the narrowest lifecycle hook

Override only what the behavior needs:

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

For scene-targeted actions, use object hooks such as
`onObjectSelectStart/End`, `onObjectTouchStart/Touching/End`,
`onObjectGrabStart/Grabbing/End`, or `onHoverEnter/Hovering/Exit`. Return `true`
from a handled object selection or hover callback when propagation should stop.
Use `xb-add-interactions` for complete interaction generation.

When changing SDK lifecycle behavior, trace the same phases through the
constructor, registry, `Core`, `ScriptsManager`, subsystem owner, and disposal
path. Preserve established frame and initialization order unless the change
contract explicitly requires otherwise.

## Configure capabilities before initialization

Create one `xb.Options`, enable only the capabilities the experience uses, and
pass that instance to `xb.init()`:

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
`enableSetOfMarkContext`. Verify the exact helper in `src/core/Options.ts`;
some helpers enable prerequisite capabilities and permissions themselves.

Physics is the important exception. There is no `enablePhysics()`:

```js
import RAPIER from '@dimforge/rapier3d-simd-compat';

options.physics.RAPIER = RAPIER;
```

Then implement `initPhysics(physics)` and, if needed, `physicsStep()` on the
script. Keep app physics separate from simulator environment physics.

When adding or changing a user-facing SDK capability, keep defaults inert,
make `enable*()` chainable when a high-level switch is warranted, encode
permissions and prerequisites in `Options`, and initialize runtime owners
before dependent scripts.

## Use intentional public boundaries

- App-facing core imports must be exported by `src/xrblocks.ts`.
- Addon imports must come from that addon's public entry and match its emitted
  `build/addons/...` path.
- Treat source classes as behavioral evidence, not permission for app code to
  deep-import internal files.
- Keep `three` aligned with the peer dependency and load only one copy.
- Include every external peer imported by the selected core or addon path.
- In SDK work, add intentional public values and types to the correct root or
  addon entry and confirm declaration output can resolve them.
- Edit source inputs and regenerate `build/`; never hand-edit generated output.

For browser-native application modules, follow
[`xb-build-app`'s import-map reference](../../xb-build-app/references/import-maps.md).
For app UI, use `xb-add-spatial-ui` and its UIBlocks-first path.

## Frequent implementation failures

| Avoid                                                             | Use instead                                                  |
| ----------------------------------------------------------------- | ------------------------------------------------------------ |
| `options.enablePhysics()`                                         | Assign `options.physics.RAPIER`.                             |
| Reading `xb.core.renderer` or physics in a constructor            | Read initialized services in or after `init()`.              |
| Driving `requestAnimationFrame` directly                          | Implement `update(time, frame)`.                             |
| Calling `xb.init()` before `xb.add(script)`                       | Register all app scripts first.                              |
| Importing a symbol because a similarly named internal file exists | Confirm it in the public core or addon entry.                |
| Loading another `three` build for an addon                        | Share the pinned import-map or package dependency.           |
| `xb.ai.query('text')`                                             | Guard availability and call `xb.ai.query({prompt: 'text'})`. |
| Assuming client-side AI credentials are production-safe           | Use local keys only for prototyping; proxy production calls. |
| Adding a global to make an SDK dependency reachable               | Register it and declare `static dependencies`.               |
| Exporting an internal helper only to make it testable             | Test through its nearest stable owner or boundary.           |

When a shape remains unclear, consult `docs/docs/manual/`, then a working
template, sample, or demo, and finally the implementation. Do not invent a
method, option, export, or import path to bridge missing information.
