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
});
