#!/usr/bin/env node
/* eslint-env node */
/**
 * Minimal WebSocket relay for netblocks.
 *
 * Run with:
 *
 *     node src/addons/netblocks/server/relay.js
 *
 * or via npx (from the package root) once published. The server keeps an
 * in-memory map of `roomId → Set<peer>` and forwards messages between peers
 * without inspecting payloads. There is no authentication, persistence, or
 * rate-limiting — bring your own for production deployments.
 *
 * Wire protocol (see WebSocketTransport.ts for the client side):
 *   Client → Server: {"type":"join","roomId":string,"peerId":string}
 *                    {"type":"send","to"?:peerId,"data":base64}
 *   Server → Client: {"type":"welcome","peerId":string,"peers":string[]}
 *                    {"type":"peer-join","peerId":string}
 *                    {"type":"peer-leave","peerId":string}
 *                    {"type":"message","from":peerId,"data":base64}
 *
 * Dependencies: only the `ws` package, declared as an optional peer for
 * users who want the relay. Install with `npm i ws`.
 */
import {WebSocketServer} from 'ws';

const PORT = Number(process.env.PORT ?? 8765);
const HOST = process.env.HOST ?? '0.0.0.0';

const rooms = new Map(); // roomId -> Map<peerId, ws>

// 64 KiB cap mirrors MAX_MESSAGE_BYTES on the client; relay never inspects
// payloads but a hostile client could otherwise stream gigabytes.
const wss = new WebSocketServer({
  host: HOST,
  port: PORT,
  maxPayload: 64 * 1024,
});

console.log(`[netblocks-relay] listening on ws://${HOST}:${PORT}`);

wss.on('connection', (ws) => {
  let peerId = null;
  let roomId = null;
  ws.isAlive = true;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== 'string') return;

    if (msg.type === 'join') {
      if (peerId) return; // already joined
      roomId = String(msg.roomId);
      peerId = String(msg.peerId || randomId());
      let room = rooms.get(roomId);
      if (!room) {
        room = new Map();
        rooms.set(roomId, room);
      }
      // Reject the join if someone else already holds this peerId in the
      // room. Otherwise a second client could overwrite the slot, then
      // their disconnect would evict the original.
      if (room.has(peerId)) {
        send(ws, {type: 'error', reason: 'peer-id-taken', peerId});
        try {
          ws.close();
        } catch {
          // ignore
        }
        peerId = null;
        roomId = null;
        return;
      }
      // Tell the joiner who's already here.
      const peers = [...room.keys()];
      send(ws, {type: 'welcome', peerId, peers});
      // Tell existing peers about the new one.
      for (const [, peerWs] of room) send(peerWs, {type: 'peer-join', peerId});
      room.set(peerId, ws);
      return;
    }

    if (msg.type === 'send' && peerId && roomId) {
      const room = rooms.get(roomId);
      if (!room) return;
      const out = {type: 'message', from: peerId, data: msg.data};
      if (msg.to) {
        const target = room.get(String(msg.to));
        if (target) send(target, out);
      } else {
        for (const [otherId, otherWs] of room) {
          if (otherId !== peerId) send(otherWs, out);
        }
      }
    }
  });

  ws.on('close', () => {
    if (!roomId || !peerId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    room.delete(peerId);
    for (const [, otherWs] of room) send(otherWs, {type: 'peer-leave', peerId});
    if (room.size === 0) rooms.delete(roomId);
  });
});

setInterval(() => {
  for (const client of wss.clients) {
    if (client.isAlive === false) {
      try {
        client.terminate();
      } catch {
        // ignore
      }
      continue;
    }
    client.isAlive = false;
    try {
      client.ping();
    } catch {
      // ignore
    }
  }
}, 15000);

function send(ws, obj) {
  if (ws.readyState !== ws.OPEN) return;
  try {
    ws.send(JSON.stringify(obj));
  } catch {
    // ignore
  }
}

function randomId() {
  return Math.random().toString(36).slice(2, 12);
}
