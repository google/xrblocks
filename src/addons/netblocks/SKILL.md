---
name: netblocks
description: >-
  Add real-time multiplayer to an XR Blocks app with the netblocks addon —
  presence avatars (remote heads + hands), replicated `NetObject` transforms with
  cooperative ownership, typed pub/sub RPC events, and opt-in spatial WebRTC voice,
  over pluggable transports (BroadcastChannel for local dev, WebRTC/PeerJS for
  serverless P2P, WebSocket relay for scalable rooms). Use when authoring or
  debugging shared/co-located XR, `enableNet()`, `joinRoom()`, `NetObject`,
  `session.events`, or `session.voice` imported from `xrblocks/addons/netblocks/src`.
  For the wire protocol, transport details, and threat model, read the full
  reference in this folder's README.md.
---

# netblocks — multiplayer XR for XR Blocks

`netblocks` turns any XR Blocks app into a shared experience. Mental model: **a `Transport`
moves opaque bytes between peers; a `NetSession` layers presence, RPC, replicated objects, and
voice on top.** Swap transports without changing app code.

> Full reference (concepts, wire protocol, transports, security/threat model, samples):
> [`README.md`](./README.md). Samples: [`samples/SAMPLES.md`](./samples/SAMPLES.md).

## When to use

Use netblocks for **cooperative, trusted rooms** — hack-day demos, co-located classrooms,
shared-screen moments. It is prototype-grade: ownership claims and events are cooperative,
transports don't authenticate peers, and there's no rate limiting. For adversarial settings
(anti-cheat, payments) terminate state at a server you control and treat netblocks as a
presence/transport veneer.

## Quick start

```ts
import * as xb from 'xrblocks';
import {
  enableNet,
  BroadcastChannelTransport,
} from 'xrblocks/addons/netblocks/src/index.js';

class MyApp extends xb.Script {
  async init() {
    const net = enableNet(); // ticks on the standard xb frame loop
    const session = await net.joinRoom('my-room', {
      transport: new BroadcastChannelTransport(), // two tabs see each other instantly
      displayName: 'Alice',
    });
    session.events.on('chat', (text, fromPeerId) =>
      console.log(`${fromPeerId}: ${text}`)
    );
  }
}

xb.add(new MyApp());
xb.init();
```

Open the page in two tabs to see the other tab's head as a labeled avatar (plus hands in XR
with hand tracking).

## Replicating an object

Wrap any `Object3D` in a `NetObject` and register it; owners broadcast, non-owners interpolate.
Ownership is cooperative — claim on grab, release on drop.

```ts
import {
  NetObject,
  WebRTCTransport,
} from 'xrblocks/addons/netblocks/src/index.js';

const sharedCube = new NetObject({id: 'cube', object: this.cube});
const net = enableNet();
await net.joinRoom('demo', {
  transport: new WebRTCTransport(),
  displayName: 'Alice',
});
net.session?.netObjects.add(sharedCube);
// session.claim(obj) on grab, session.release(obj) on drop.
```

## Key surface

- `enableNet()` → `NetCore` (also `xb.core.net`); `joinRoom(roomId, opts?)`, `leaveRoom()`,
  `send(topic, data)`. `joinRoom` defaults to `WebRTCTransport` when no transport is given.
- `xb.core.net.peers` — `list()`, `remoteUsers`, `on('join'|'leave', cb)`, `events`.
- `xb.core.net.user` — local network identity (`peerId`, `displayName`, `role`). Distinct from
  `xb.user` (the local XR input device).
- `session.events` — typed pub/sub: `on(topic, cb)`, `emit(topic, payload)`, `emitTo(peerId, …)`.
- `session.voice.enable()` or `joinRoom({voice: true})` — spatial WebRTC audio per peer head.

## Transports

| Transport                   | Use for                                                                          |
| --------------------------- | -------------------------------------------------------------------------------- |
| `BroadcastChannelTransport` | local dev — two tabs, zero infrastructure                                        |
| `WebRTCTransport`           | serverless P2P via PeerJS broker (≤ ~12 peers); pass `iceServers`/`signalingUrl` |
| `WebSocketTransport`        | a small relay (`server/relay.js`) for reliable, scalable rooms                   |
