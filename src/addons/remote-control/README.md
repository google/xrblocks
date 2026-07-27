# remote-control

Local API for driving an XR Blocks page from an external JavaScript, Python,
or agent process.

`remote-control` owns the WebSocket protocol, request routing, registered scene
tools, and built-in tools. `embodied-control` remains the movement/action layer
used for simulator locomotion, hand motion, and select gestures.

## Page Endpoint

Add `RemoteControl` to the XR Blocks page that should receive commands. The
page connects to the relay, handles requests, and returns tool results.

```ts
import * as xb from 'xrblocks';
import {RemoteControl} from 'xrblocks/addons/remote-control/index.js';

const game = new GameScript();
xb.add(game);

const options = new xb.Options();

xb.add(
  new RemoteControl({
    url: 'ws://127.0.0.1:8791',
    sessionId: 'default',
    reconnect: true,
    embodiedOptions: {autoPause: true, realTime: false},
    tools: {
      getScore: async () => ({score: game.score}),
      resetGame: async () => game.reset(),
    },
  })
);

await xb.init(options);
```

Tools are explicit named functions exposed by the scene. External clients
cannot send arbitrary JavaScript to evaluate in the page.

## Built-In Tools

Built-in tools are defined under `built-in-tools/`. `RemoteControl`
automatically registers them before the page is exposed:

- `step({durationMs?: number, control?: XRCompoundControl})`
- `applyControl({control: XRCompoundControl})`
- `teleportTo({target, options?})`
- `lookAtTarget({target, options?})`
- `pointTo({handIndex, target, options?})`
- `reachTo({handIndex, target, options?})`
- `click({handIndex?, options?})`
- `getCamera({screenshot?: boolean, overlayOnCamera?: boolean})`
- `getHands()`
- `getScreenshot({overlayOnCamera?: boolean})`
- `getSimulatorState()`

Scene tools registered with the same name override built-in tools.

## Relay

Run the local relay next to the XR Blocks dev server:

```bash
npx xrblocks-remote-control
```

The relay defaults to `ws://127.0.0.1:8791`. It keeps no state beyond the
connected pages, connected controllers, and pending request IDs. It is intended
for local development, automation, and evaluation harnesses.

## Sessions

One relay port can host multiple independent browser pages. Put each page and
its client in the same `sessionId`:

```ts
xb.add(
  new RemoteControl({
    url: 'ws://127.0.0.1:8791',
    sessionId: 'run-1',
  })
);
```

```ts
const client = new RemoteControlClient({
  url: 'ws://127.0.0.1:8791',
  sessionId: 'run-1',
});
```

Sessions default to `default`, so single-page usage does not need to set one.

## JavaScript Client

```ts
import {RemoteControlClient} from 'xrblocks/addons/remote-control/index.js';

const client = new RemoteControlClient({
  url: 'ws://127.0.0.1:8791',
  sessionId: 'default',
});
await client.connect();
await client.waitForPage();

const camera = await client.getCamera({screenshot: true});

await client.step({
  durationMs: 250,
  control: {
    locomotion: {move: [0, 0, -0.25]},
  },
});

const hands = await client.getHands();
const score = await client.callTool('getScore', {});
```

Client movement helpers are convenience wrappers around built-in tool calls.
Movement tools return completion only. Request camera, hands, screenshots, or
simulator state with tool calls when needed.

## Smoke Test Sample

The repository includes a minimal browser scene and command-line helper:

```bash
npm run build
npm run serve
```

In another terminal, start the local relay:

```bash
npx xrblocks-remote-control
```

Open the sample:

```text
http://127.0.0.1:8080/samples/remote_control/
```

For multiple pages on one relay, open each with a different session:

```text
http://127.0.0.1:8080/samples/remote_control/?remoteControlSession=run-1
http://127.0.0.1:8080/samples/remote_control/?remoteControlSession=run-2
```

Then send commands from a third terminal:

```bash
node samples/remote_control/send.mjs observe
node samples/remote_control/send.mjs get-camera '{"screenshot":true}'
node samples/remote_control/send.mjs step-forward
node samples/remote_control/send.mjs get-hands
node samples/remote_control/send.mjs get-state
node samples/remote_control/send.mjs screenshot
node samples/remote_control/send.mjs tool getCamera '{"screenshot":true}'
node samples/remote_control/send.mjs get-cube
node samples/remote_control/send.mjs nudge-cube
node samples/remote_control/send.mjs nudge-cube '{"dx":0.25}'
node samples/remote_control/send.mjs reset-cube
```

Target a non-default session with `REMOTE_CONTROL_SESSION`:

```bash
REMOTE_CONTROL_SESSION=run-1 node samples/remote_control/send.mjs get-state
```

Each command prints the JSON response. `observe`, `get-camera`, `get-hands`,
`get-state`, and `screenshot` call built-in observation tools. The sample
enables the simulator camera, and the screenshot commands request
`overlayOnCamera: true` by default. `tool <name>` calls any built-in or scene
tool by name. When a result contains a `data:image/...` URL, the helper writes
it to the OS temp directory and replaces that value with the saved file path.

## Protocol Internals

Most users should use `RemoteControl` in the page and `RemoteControlClient`
outside the page instead of constructing protocol messages by hand.

External controllers send request messages:

```json
{
  "id": "req-1",
  "type": "callTool",
  "name": "getCamera",
  "args": {"screenshot": true}
}
```

Movement uses the same request shape:

```json
{
  "id": "req-2",
  "type": "callTool",
  "name": "step",
  "args": {
    "durationMs": 250,
    "control": {"locomotion": {"move": [0, 0, -0.25]}}
  }
}
```

The page returns one response per request:

```json
{
  "type": "response",
  "id": "req-1",
  "ok": true,
  "result": {
    "position": [0, 1.5, 0],
    "quaternion": [0, 0, 0, 1],
    "screenshot": "data:image/png;base64,..."
  }
}
```

Supported request types:

- `ping`
- `callTool`
