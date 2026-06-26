#!/usr/bin/env node
/* eslint-env node */
/**
 * Local WebSocket relay for xrblocks remote-control.
 *
 * Run with:
 *
 *     node src/addons/remote-control/server/relay.js
 *
 * Dependencies: install `ws` in the consuming project when running the relay.
 */
import {WebSocketServer} from 'ws';

const PORT = Number(process.env.PORT ?? 8791);
const HOST = process.env.HOST ?? '127.0.0.1';

const wss = new WebSocketServer({
  host: HOST,
  port: PORT,
  maxPayload: 4 * 1024 * 1024,
});

const DEFAULT_SESSION_ID = 'default';
const sessions = new Map();

console.log(`[remote-control-relay] listening on ws://${HOST}:${PORT}`);

wss.on('connection', (ws) => {
  ws.role = null;
  ws.sessionId = DEFAULT_SESSION_ID;
  ws.isAlive = true;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      send(ws, {
        type: 'response',
        id: '',
        ok: false,
        error: {code: 'parse_error', message: 'Invalid JSON message.'},
      });
      return;
    }

    if (!msg || typeof msg.type !== 'string') return;

    if (msg.type === 'hello') {
      handleHello(ws, msg);
      return;
    }

    if (msg.type === 'response') {
      const session = getSession(ws.sessionId);
      const client = session.pending.get(msg.id);
      if (client) {
        session.pending.delete(msg.id);
        send(client, msg);
      }
      return;
    }

    if (ws.role === 'client') {
      const session = getSession(ws.sessionId);
      if (
        !session.simulator ||
        session.simulator.readyState !== session.simulator.OPEN
      ) {
        send(ws, {
          type: 'response',
          id: msg.id ?? '',
          ok: false,
          error: {
            code: 'simulator_unavailable',
            message: 'No simulator is connected to the relay.',
          },
        });
        return;
      }
      if (typeof msg.id === 'string') session.pending.set(msg.id, ws);
      send(session.simulator, msg);
    }
  });

  ws.on('close', () => {
    const session = getSession(ws.sessionId);
    if (ws.role === 'simulator' && session.simulator === ws) {
      session.simulator = null;
      rejectPending(
        session,
        'simulator_disconnected',
        'Simulator disconnected before responding.'
      );
      for (const client of session.clients) {
        send(client, {type: 'simulatorDisconnected'});
      }
    } else if (ws.role === 'client') {
      session.clients.delete(ws);
      for (const [id, client] of session.pending) {
        if (client === ws) session.pending.delete(id);
      }
    }
    deleteSessionIfEmpty(ws.sessionId);
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

function handleHello(ws, msg) {
  const previousSession = getSession(ws.sessionId);
  if (ws.role === 'client') {
    previousSession.clients.delete(ws);
  }
  if (ws.role === 'simulator' && previousSession.simulator === ws) {
    previousSession.simulator = null;
  }
  deleteSessionIfEmpty(ws.sessionId);

  ws.sessionId = normalizeSessionId(msg.sessionId);
  const session = getSession(ws.sessionId);

  if (msg.role === 'simulator') {
    if (session.simulator && session.simulator !== ws) {
      try {
        session.simulator.close(4000, 'Replaced by another simulator.');
      } catch {
        // ignore
      }
    }
    session.simulator = ws;
    ws.role = 'simulator';
    for (const client of session.clients) {
      send(client, {type: 'simulatorReady'});
    }
    return;
  }

  if (msg.role === 'client') {
    ws.role = 'client';
    session.clients.add(ws);
    if (
      session.simulator &&
      session.simulator.readyState === session.simulator.OPEN
    ) {
      send(ws, {type: 'simulatorReady'});
    }
  }
}

function normalizeSessionId(sessionId) {
  return typeof sessionId === 'string' && sessionId.length > 0
    ? sessionId
    : DEFAULT_SESSION_ID;
}

function getSession(sessionId) {
  const normalized = normalizeSessionId(sessionId);
  let session = sessions.get(normalized);
  if (!session) {
    session = {
      simulator: null,
      clients: new Set(),
      pending: new Map(),
    };
    sessions.set(normalized, session);
  }
  return session;
}

function deleteSessionIfEmpty(sessionId) {
  const normalized = normalizeSessionId(sessionId);
  const session = sessions.get(normalized);
  if (
    session &&
    !session.simulator &&
    session.clients.size === 0 &&
    session.pending.size === 0
  ) {
    sessions.delete(normalized);
  }
}

function rejectPending(session, code, message) {
  for (const [id, client] of session.pending) {
    send(client, {
      type: 'response',
      id,
      ok: false,
      error: {code, message},
    });
  }
  session.pending.clear();
}

function send(ws, obj) {
  if (ws.readyState !== ws.OPEN) return;
  try {
    ws.send(JSON.stringify(obj));
  } catch {
    // ignore
  }
}
