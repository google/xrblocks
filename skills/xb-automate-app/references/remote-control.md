# Remote-control automation bridge

Use this branch when a process outside the page needs an explicit WebSocket
surface for commands and observations.

## Expose the page

```js
import * as xb from 'xrblocks';
import {RemoteControl} from 'xrblocks/addons/remote-control/index.js';

const game = new GameScript();
const options = new xb.Options().enableAutomationMode();

xb.add(game);
xb.add(
  new RemoteControl({
    url: 'ws://127.0.0.1:8791',
    sessionId: 'run-1',
    reconnect: false,
    embodiedOptions: {autoPause: true, realTime: false},
    tools: {
      getGameState: async () => game.getState(),
      resetGame: async () => game.reset(),
    },
  })
);
await xb.init(options);
```

Return JSON-serializable results and validate custom tool arguments. A custom
tool with a built-in name replaces that built-in, so use domain-specific names
unless replacement is intentional.

Start the local relay with `npx xrblocks-remote-control`. Its default endpoint
is `ws://127.0.0.1:8791`. Match page and client `sessionId` values; the id routes
messages and provides no authentication.

## Connect and prove readiness

```js
import {RemoteControlClient} from 'xrblocks/addons/remote-control/index.js';

const client = new RemoteControlClient({
  url: 'ws://127.0.0.1:8791',
  sessionId: 'run-1',
});

await client.connect();
await withTimeout(client.waitForPage(), 8_000);
const simulator = unwrap(await client.getSimulatorState());
```

`waitForPage()` resolves after the page simulator announces readiness and has no
built-in deadline. Every helper returns a `RemoteControlResponse`; unwrap it:

```js
function unwrap(response) {
  if (!response.ok) {
    throw new Error(`${response.error?.code}: ${response.error?.message}`);
  }
  return response.result;
}
```

## Built-in commands

- `step({durationMs?, control?})`
- `applyControl({control})` through `client.apply(control)`
- `teleportTo(target, options?)`
- `lookAtTarget(target, options?)`
- `pointTo(handIndex, target, options?)`
- `reachTo(handIndex, target, options?)`
- `click(handIndex?, options?)`

Targets are a `[x, y, z]` tuple, an exact `Object3D.name`, or
`{type: 'contextNode', id: 'ctx_…'}`. Context-node targeting requires context
and an id learned from the current page. Context discovery is not built in;
expose a narrow custom `getContext` tool when the controller needs it.

## Built-in observations

- `getCamera({screenshot?, overlayOnCamera?})`
- `getHands()`
- `getScreenshot({overlayOnCamera?})`
- `getSimulatorState()`
- `callTool(name, args?)`
- `ping()`

`getSimulatorState().frame` counts observations; it is not the renderer frame.
Expose a custom tool when domain state is the useful observation.

## Smoke, cleanup, and security

Smoke one connection with `ping()` and one read-only observation. Call
`client.close()` afterward and stop a relay owned by the current run. Use
`reconnect: false` for bounded external runs and reconnect for interactive local
control.

The bundled relay has no authentication or TLS. Keep it on loopback, expose
narrow tools, validate input, and keep credentials entirely outside the bridge.

The bridge is ready when the bounded handshake succeeds, read-only responses
are checked, the documented commands are registered, and cleanup releases its
sockets.

Authoritative sources:

- [`../../../src/addons/remote-control/README.md`](../../../src/addons/remote-control/README.md)
- [`../../../src/addons/remote-control/RemoteControlClient.ts`](../../../src/addons/remote-control/RemoteControlClient.ts)
- [`../../../src/addons/remote-control/built-in-tools/`](../../../src/addons/remote-control/built-in-tools/)
- [`../../../samples/remote_control/`](../../../samples/remote_control/)
