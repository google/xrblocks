# netblocks samples

Each sample is self-contained and can be opened directly from the repo
root once xrblocks has been built (`npm run build`). For all of these,
**open the sample URL in two or more browser tabs** to see multiplayer in
action.

## Basic samples

- **presence** — `basic/presence/index.html`
  Minimal demo. Shows how to join a room with `BroadcastChannelTransport`
  (the default for all basic samples — same-origin tabs only, no
  signaling broker) and how each peer's head appears as a default avatar
  (hands appear too when a peer is in XR with hand tracking). Swap in
  `WebRTCTransport` for cross-device.

- **objects** — `basic/objects/index.html`
  Demonstrates `NetObject`. A shared cube hovers in the middle of the room;
  click/drag it (mouse or pinch) to grab. Ownership transfers automatically
  and the cube's transform replicates to all other tabs.

- **events** — `basic/events/index.html`
  Uses `session.events` to broadcast emoji "fireworks" between peers — the
  canonical pattern for chat, reactions, and one-shot signals.

- **voice** — `basic/voice/index.html`
  Push-to-hold spatial voice chat. Hold the on-screen button to broadcast
  your microphone to other tabs; their voice spatializes around their
  remote avatar.

- **transports** — `basic/transports/index.html`
  Pick `BroadcastChannel`, `WebRTC`, or `WebSocket` from a small UI and
  connect — useful for sanity-checking each transport.

## Integration sample

- **shared room** — `samples/netblocks/index.html` (in the repo root
  `samples/` folder, alongside the `uiblocks` integration sample)
  Combines presence, shared cubes, emoji RPC, and spatial voice into a
  single demo room.

## Picker

Open `index.html` in this folder for a hub linking to all samples.
