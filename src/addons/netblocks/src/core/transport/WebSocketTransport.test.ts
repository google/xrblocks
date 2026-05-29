import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {bytesToBase64} from '../codec/PoseCodec';

import {WebSocketTransport} from './WebSocketTransport';

class FakeWebSocket extends EventTarget {
  static OPEN = 1;
  static CLOSED = 3;
  static last: FakeWebSocket | undefined;
  static instances: FakeWebSocket[] = [];

  url: string;
  readyState = 0;
  sent: string[] = [];

  constructor(url: string) {
    super();
    this.url = url;
    FakeWebSocket.last = this;
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatchEvent(new Event('close'));
  }

  // Test helpers ------------------------------------------------------------

  fireOpen() {
    this.readyState = FakeWebSocket.OPEN;
    this.dispatchEvent(new Event('open'));
  }

  fireServerMessage(obj: unknown) {
    this.dispatchEvent(
      new MessageEvent('message', {data: JSON.stringify(obj)})
    );
  }

  fireRawMessage(data: string) {
    this.dispatchEvent(new MessageEvent('message', {data}));
  }

  fireClose() {
    this.dispatchEvent(new Event('close'));
  }
}

describe('WebSocketTransport', () => {
  let originalWebSocket: typeof WebSocket | undefined;

  beforeEach(() => {
    originalWebSocket = (globalThis as {WebSocket?: typeof WebSocket})
      .WebSocket;
    (globalThis as unknown as {WebSocket: unknown}).WebSocket = FakeWebSocket;
    FakeWebSocket.last = undefined;
    FakeWebSocket.instances = [];
  });

  afterEach(() => {
    (globalThis as unknown as {WebSocket: unknown}).WebSocket =
      originalWebSocket as unknown;
  });

  function makeWelcomed(opts?: {peerId?: string; peers?: string[]}) {
    const t = new WebSocketTransport({
      url: 'ws://test',
      reconnectAttempts: 0,
    });
    const connected = t.connect({
      roomId: 'room1',
      peerId: opts?.peerId ?? 'me',
    });
    const ws = FakeWebSocket.last!;
    ws.fireOpen();
    ws.fireServerMessage({
      type: 'welcome',
      peerId: opts?.peerId ?? 'me',
      peers: opts?.peers ?? [],
    });
    return {t, ws, connected};
  }

  it('opens a websocket to the configured url and sends a join frame', async () => {
    const {ws, connected} = makeWelcomed();
    await connected;
    expect(ws.url).toBe('ws://test');
    expect(ws.sent.length).toBe(1);
    expect(JSON.parse(ws.sent[0])).toEqual({
      type: 'join',
      roomId: 'room1',
      peerId: 'me',
    });
  });

  it('resolves connect() on welcome and adopts server-assigned peer id', async () => {
    const t = new WebSocketTransport({
      url: 'ws://test',
      reconnectAttempts: 0,
    });
    const connected = t.connect({roomId: 'r'});
    const ws = FakeWebSocket.last!;
    ws.fireOpen();
    ws.fireServerMessage({type: 'welcome', peerId: 'assigned-id', peers: []});
    await connected;
    expect(t.isOpen).toBe(true);
    expect(t.localPeerId).toBe('assigned-id');
  });

  it('emits peer-join for each existing peer in the welcome list', async () => {
    const t = new WebSocketTransport({
      url: 'ws://test',
      reconnectAttempts: 0,
    });
    const joins: string[] = [];
    t.on('peer-join', (e) => joins.push((e as CustomEvent).detail.peerId));
    const connected = t.connect({roomId: 'r', peerId: 'me'});
    const ws = FakeWebSocket.last!;
    ws.fireOpen();
    ws.fireServerMessage({
      type: 'welcome',
      peerId: 'me',
      peers: ['alice', 'bob', 'me'],
    });
    await connected;
    expect(joins).toEqual(['alice', 'bob']);
    expect([...t.remotePeerIds]).toEqual(['alice', 'bob']);
  });

  it('emits peer-join and peer-leave on server notifications', async () => {
    const {t, ws, connected} = makeWelcomed();
    await connected;
    const joins: string[] = [];
    const leaves: string[] = [];
    t.on('peer-join', (e) => joins.push((e as CustomEvent).detail.peerId));
    t.on('peer-leave', (e) => leaves.push((e as CustomEvent).detail.peerId));

    ws.fireServerMessage({type: 'peer-join', peerId: 'alice'});
    ws.fireServerMessage({type: 'peer-join', peerId: 'alice'}); // duplicate ignored
    ws.fireServerMessage({type: 'peer-leave', peerId: 'alice'});
    ws.fireServerMessage({type: 'peer-leave', peerId: 'ghost'}); // unknown ignored

    expect(joins).toEqual(['alice']);
    expect(leaves).toEqual(['alice']);
    expect([...t.remotePeerIds]).toEqual([]);
  });

  it('decodes inbound message frames as Uint8Array with sender id', async () => {
    const {t, ws, connected} = makeWelcomed();
    await connected;
    const inbox: Array<{from: string; bytes: Uint8Array}> = [];
    t.on('message', (e) => {
      const d = (e as CustomEvent).detail;
      inbox.push({from: d.peerId, bytes: d.data});
    });
    const payload = new Uint8Array([1, 2, 3, 4]);
    ws.fireServerMessage({
      type: 'message',
      from: 'alice',
      data: bytesToBase64(payload),
    });
    expect(inbox.length).toBe(1);
    expect(inbox[0].from).toBe('alice');
    expect(Array.from(inbox[0].bytes)).toEqual([1, 2, 3, 4]);
  });

  it('send(payload) frames a broadcast send', async () => {
    const {t, ws, connected} = makeWelcomed();
    await connected;
    ws.sent.length = 0;
    t.send(new Uint8Array([9, 9]));
    expect(ws.sent.length).toBe(1);
    const frame = JSON.parse(ws.sent[0]);
    expect(frame.type).toBe('send');
    expect(frame.to).toBeUndefined();
    expect(frame.data).toBe(bytesToBase64(new Uint8Array([9, 9])));
  });

  it('send(payload, target) frames a direct send', async () => {
    const {t, ws, connected} = makeWelcomed();
    await connected;
    ws.sent.length = 0;
    t.send(new Uint8Array([7]), 'alice');
    const frame = JSON.parse(ws.sent[0]);
    expect(frame.to).toBe('alice');
  });

  it('send() is a no-op before the welcome frame arrives', () => {
    const t = new WebSocketTransport({
      url: 'ws://test',
      reconnectAttempts: 0,
    });
    t.connect({roomId: 'r', peerId: 'me'});
    const ws = FakeWebSocket.last!;
    ws.fireOpen();
    const sentBefore = ws.sent.length; // includes the join frame
    t.send(new Uint8Array([1]));
    expect(ws.sent.length).toBe(sentBefore);
  });

  it('emits peer-leave for known peers and a close event when the socket closes', async () => {
    const t = new WebSocketTransport({
      url: 'ws://test',
      reconnectAttempts: 0,
    });
    const leaves: string[] = [];
    let closed = false;
    t.on('peer-leave', (e) => leaves.push((e as CustomEvent).detail.peerId));
    t.addEventListener('close', () => (closed = true));
    const connected = t.connect({roomId: 'r', peerId: 'me'});
    const ws = FakeWebSocket.last!;
    ws.fireOpen();
    ws.fireServerMessage({
      type: 'welcome',
      peerId: 'me',
      peers: ['alice'],
    });
    await connected;
    ws.fireClose();
    expect(leaves).toEqual(['alice']);
    expect(closed).toBe(true);
    expect(t.isOpen).toBe(false);
    expect([...t.remotePeerIds]).toEqual([]);
  });

  it('does not reconnect after close() is called explicitly', async () => {
    vi.useFakeTimers();
    try {
      const t = new WebSocketTransport({
        url: 'ws://test',
        reconnectAttempts: 5,
      });
      const connected = t.connect({roomId: 'r', peerId: 'me'});
      const ws = FakeWebSocket.last!;
      ws.fireOpen();
      ws.fireServerMessage({type: 'welcome', peerId: 'me', peers: []});
      await connected;
      t.close();
      vi.advanceTimersByTime(60_000);
      expect(FakeWebSocket.instances.length).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('schedules a reconnect with exponential backoff after an unexpected close', async () => {
    vi.useFakeTimers();
    try {
      const t = new WebSocketTransport({
        url: 'ws://test',
        reconnectAttempts: 3,
      });
      const connected = t.connect({roomId: 'r', peerId: 'me'});
      const ws = FakeWebSocket.last!;
      ws.fireOpen();
      ws.fireServerMessage({type: 'welcome', peerId: 'me', peers: []});
      await connected;
      // Drop the connection unexpectedly.
      ws.fireClose();
      // First retry waits 500ms (base * 2^0).
      vi.advanceTimersByTime(499);
      expect(FakeWebSocket.instances.length).toBe(1);
      vi.advanceTimersByTime(1);
      expect(FakeWebSocket.instances.length).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('emits an error event when the server sends malformed JSON', async () => {
    const {t, ws, connected} = makeWelcomed();
    await connected;
    const errors: Error[] = [];
    t.on('error', (e) => errors.push((e as CustomEvent).detail.error));
    ws.fireRawMessage('{not json');
    expect(errors.length).toBe(1);
    expect(errors[0]).toBeInstanceOf(Error);
  });

  it('forwards relayed error frames to the error event', async () => {
    const {t, ws, connected} = makeWelcomed();
    await connected;
    const errors: Error[] = [];
    t.on('error', (e) => errors.push((e as CustomEvent).detail.error));
    ws.fireServerMessage({type: 'error', message: 'room is full'});
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe('room is full');
  });
});
