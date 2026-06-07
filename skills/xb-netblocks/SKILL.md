---
name: xb-netblocks
description: >-
  Add real-time multiplayer to an XR Blocks app with the netblocks addon — presence
  avatars (remote heads + hands), replicated `NetObject` transforms with cooperative
  ownership, typed pub/sub RPC events, and opt-in spatial WebRTC voice, over
  pluggable transports (BroadcastChannel for local dev, WebRTC/PeerJS for serverless
  P2P, WebSocket relay for scalable rooms). Use when building shared or co-located XR.
  Covers `enableNet()`, `joinRoom()`, `NetObject`, and `session.events`; the full
  reference (wire protocol, transports, threat model) is at src/addons/netblocks/.
---

# xb-netblocks: multiplayer XR

A `Transport` moves bytes between peers; a `NetSession` layers presence, RPC, replicated
objects, and voice on top. Swap transports without changing app code.

> **Full reference**: [`../../src/addons/netblocks/SKILL.md`](../../src/addons/netblocks/SKILL.md)
> and [`../../src/addons/netblocks/README.md`](../../src/addons/netblocks/README.md).

## When to use

Cooperative, trusted rooms (demos, classrooms, co-presence). It is prototype-grade — no peer
authentication, cooperative ownership, no rate limiting. For adversarial workloads, put a
server-authoritative arbiter on top.

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

## Share an object

```ts
import {
  NetObject,
  WebRTCTransport,
} from 'xrblocks/addons/netblocks/src/index.js';

const shared = new NetObject({id: 'cube', object: this.cube});
const net = enableNet();
await net.joinRoom('demo', {
  transport: new WebRTCTransport(),
  displayName: 'Alice',
});
net.session?.netObjects.add(shared);
// session.claim(obj) on grab, session.release(obj) on drop; owners broadcast, others interpolate.
```

## Transports

- `BroadcastChannelTransport` — local dev, two tabs, zero infra.
- `WebRTCTransport` — serverless P2P via PeerJS (≤ ~12 peers); pass `iceServers`/`signalingUrl`.
- `WebSocketTransport` — a small relay (`server/relay.js`) for scalable rooms.

Enable voice with `joinRoom({voice: true})` or `session.voice.enable()`.
