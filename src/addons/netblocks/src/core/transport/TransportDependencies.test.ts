import {describe, expect, it, vi} from 'vitest';

vi.mock('three', () => {
  throw new Error('Byte transports must not load three.js.');
});

describe('Standalone byte transports', () => {
  it('loads each transport without a renderer or three.js', async () => {
    const [
      {WebRTCTransport},
      {BroadcastChannelTransport},
      {WebSocketTransport},
    ] = await Promise.all([
      import('./WebRTCTransport'),
      import('./BroadcastChannelTransport'),
      import('./WebSocketTransport'),
    ]);
    expect(new WebRTCTransport().isOpen).toBe(false);
    expect(new BroadcastChannelTransport().isOpen).toBe(false);
    expect(new WebSocketTransport({url: 'ws://localhost:8765'}).isOpen).toBe(
      false
    );
  });
});
