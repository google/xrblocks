# remote-control

WebSocket transport for remotely driving [xrblocks](https://github.com/google/xrblocks)
through `embodied-control`.

`remote-control` is intentionally thin: it owns the WebSocket connection and
message protocol, while `embodied-control` owns the action semantics. If you do
not need networking, use `EmbodiedControl` directly.

---

## Quick start

```ts
import * as xb from 'xrblocks';
import {RemoteControl} from 'xrblocks/addons/remote-control/index.js';

xb.add(
  new RemoteControl({
    url: 'ws://127.0.0.1:8765',
    reconnect: true,
    embodiedOptions: {
      includeScreenshot: true,
    },
  })
);

await xb.init();
```

`RemoteControl` is an XR Blocks `Script`. It uses normal dependency injection
for `Core`, `Simulator`, `Input`, and `Camera`, then creates an internal
`EmbodiedControl` instance unless one is supplied.

---

## Protocol

Messages are JSON strings.

### Handshake

Sent by the browser after the socket opens:

```json
{
  "type": "HANDSHAKE",
  "client": "xrblocks-remote-control",
  "version": 1,
  "capabilities": {
    "compoundControl": true,
    "embodiedControl": true
  }
}
```

### Step

Sent by the runner to the browser:

```json
{
  "type": "STEP",
  "id": "step-1",
  "durationMs": 250,
  "control": {
    "locomotion": {"move": [0, 0, -0.25]},
    "rightHand": {"selectStart": true}
  }
}
```

The `control` payload is the same `EmbodiedControlStep.control` object used for
local calls.

### Step completed

Sent by the browser after the step finishes:

```json
{
  "type": "STEP_COMPLETED",
  "id": "step-1",
  "elapsedMs": 250,
  "observation": {
    "state": {
      "camera": {"position": [0, 1.5, -0.25], "quaternion": [0, 0, 0, 1]},
      "leftHand": {
        "position": [-0.3, -0.1, -0.3],
        "quaternion": [0, 0, 0, 1],
        "selected": false,
        "squeezing": false,
        "visible": true
      },
      "rightHand": {
        "position": [0.3, -0.1, -0.3],
        "quaternion": [0, 0, 0, 1],
        "selected": true,
        "squeezing": false,
        "visible": true
      }
    }
  }
}
```

When screenshots are enabled, `observation.screenshot` contains a data URL.

### Busy and error responses

If a step arrives while another step is active:

```json
{
  "type": "ACTION_REJECTED",
  "id": "step-2",
  "reason": "active_step"
}
```

Malformed messages or execution failures produce:

```json
{
  "type": "ERROR",
  "id": "step-2",
  "message": "Invalid STEP payload"
}
```

---

## Local-first design

The transport layer is optional. For deterministic browser-local tests or
sample interactions, call `EmbodiedControl.step()` directly. Use
`RemoteControl` only when an external runner, Python process, or RL harness
needs to drive the browser over a socket.

---

## Public surface

- `RemoteControl` — XR Blocks `Script` that connects to a WebSocket endpoint
  and forwards `STEP` messages to embodied-control.
- `WebSocketRemoteControlTransport` — standalone transport class for custom
  runners.
- `RemoteControlProtocol` helpers — `createHandshake`,
  `parseRemoteControlMessage`, `isStepMessage`, and protocol message types.
