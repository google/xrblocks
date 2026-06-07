import {describe, it, expect, vi} from 'vitest';

import {VoiceChat} from './VoiceChat';

describe('VoiceChat subscriptions', () => {
  it('onTrack supports multiple listeners; unsubscribe removes only that listener', () => {
    const vc = new VoiceChat(() => {});
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = vc.onTrack(a);
    vc.onTrack(b);

    // Synthesise a dispatch via the internal Set. Avoids spinning up a
    // full RTCPeerConnection just to verify subscription semantics.
    const inner = vc as unknown as {
      _onTrack: Set<(peerId: string, stream: MediaStream) => void>;
    };
    const fakeStream = {} as MediaStream;
    for (const h of inner._onTrack) h('p1', fakeStream);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    unsubA();
    for (const h of inner._onTrack) h('p2', fakeStream);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
  });

  it('onTrackRemoved supports multiple listeners with idempotent unsubscribe', () => {
    const vc = new VoiceChat(() => {});
    const a = vi.fn();
    const unsub = vc.onTrackRemoved(a);
    const inner = vc as unknown as {
      _onTrackRemoved: Set<(peerId: string) => void>;
    };
    for (const h of inner._onTrackRemoved) h('p1');
    expect(a).toHaveBeenCalledTimes(1);

    unsub();
    unsub(); // idempotent
    for (const h of inner._onTrackRemoved) h('p2');
    expect(a).toHaveBeenCalledTimes(1);
  });
});

describe('VoiceChat re-negotiation signalling', () => {
  // Use the internal _peers map to plant a fake peer entry so we can
  // exercise the bye/hello + teardown logic without spinning up a full
  // RTCPeerConnection (which jsdom does not implement).
  function plantPeer(vc: VoiceChat, peerId: string) {
    const close = vi.fn();
    const inner = vc as unknown as {
      _peers: Map<
        string,
        {
          pc: {close: () => void; getSenders: () => unknown[]};
          isOfferer: boolean;
        }
      >;
    };
    inner._peers.set(peerId, {
      pc: {close, getSenders: () => []},
      isOfferer: false,
    });
    return {close};
  }

  it('disable() sends bye to every peer and tears down their PCs', () => {
    const send = vi.fn();
    const vc = new VoiceChat(send);
    // Force-mark as enabled so disable() actually runs the cleanup path.
    (vc as unknown as {_enabled: boolean})._enabled = true;
    const a = plantPeer(vc, 'peer-a');
    const b = plantPeer(vc, 'peer-b');

    vc.disable();

    const byes = send.mock.calls
      .map((c) => c[0])
      .filter((m) => m.type === 'voice' && m.signal?.kind === 'bye');
    expect(byes).toHaveLength(2);
    expect(byes.map((m) => m.to).sort()).toEqual(['peer-a', 'peer-b']);
    expect(a.close).toHaveBeenCalled();
    expect(b.close).toHaveBeenCalled();
    expect((vc as unknown as {_peers: Map<string, unknown>})._peers.size).toBe(
      0
    );
  });

  it('handleSignal(bye) tears down the PC for that peer only', async () => {
    const vc = new VoiceChat(() => {});
    const a = plantPeer(vc, 'peer-a');
    const b = plantPeer(vc, 'peer-b');

    await vc.handleSignal('peer-a', {
      type: 'voice',
      to: 'self',
      signal: {kind: 'bye'},
    });

    expect(a.close).toHaveBeenCalled();
    expect(b.close).not.toHaveBeenCalled();
    const peers = (vc as unknown as {_peers: Map<string, unknown>})._peers;
    expect(peers.has('peer-a')).toBe(false);
    expect(peers.has('peer-b')).toBe(true);
  });

  it('handleSignal(hello) is a no-op when we are not enabled', async () => {
    const send = vi.fn();
    const vc = new VoiceChat(send);
    vc.setLocalPeerId('aaa'); // lower id, would normally be the offerer

    await vc.handleSignal('zzz', {
      type: 'voice',
      to: 'aaa',
      signal: {kind: 'hello'},
    });

    expect(send).not.toHaveBeenCalled();
    expect((vc as unknown as {_peers: Map<string, unknown>})._peers.size).toBe(
      0
    );
  });

  it('handleSignal(hello) is ignored when the local side is not the natural offerer', async () => {
    const send = vi.fn();
    const vc = new VoiceChat(send);
    vc.setLocalPeerId('zzz'); // higher id than 'aaa' → other side should offer
    (vc as unknown as {_enabled: boolean})._enabled = true;

    await vc.handleSignal('aaa', {
      type: 'voice',
      to: 'zzz',
      signal: {kind: 'hello'},
    });

    expect((vc as unknown as {_peers: Map<string, unknown>})._peers.size).toBe(
      0
    );
  });
});

describe('VoiceChat onLocalStateChange', () => {
  it('fires true on successful enable() and false on disable()', async () => {
    const onLocalStateChange = vi.fn();
    const stream = {
      getTracks: () => [],
    } as unknown as MediaStream;
    const origNav = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        mediaDevices: {
          getUserMedia: vi.fn().mockResolvedValue(stream),
        },
      },
    });
    try {
      const vc = new VoiceChat(() => {}, {onLocalStateChange});
      await vc.enable(new Set());
      expect(onLocalStateChange).toHaveBeenCalledWith(true);

      vc.disable();
      expect(onLocalStateChange).toHaveBeenCalledWith(false);
      expect(onLocalStateChange).toHaveBeenCalledTimes(2);
    } finally {
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: origNav,
      });
    }
  });

  it('disable() without prior enable() does not fire onLocalStateChange', () => {
    const onLocalStateChange = vi.fn();
    const vc = new VoiceChat(() => {}, {onLocalStateChange});
    vc.disable();
    expect(onLocalStateChange).not.toHaveBeenCalled();
  });

  it('disable() during a pending enable() cancels it: stream stopped, no false state flip', async () => {
    // Simulate the rapid-toggle race: user hits the mic button, then
    // hits it again before getUserMedia resolves. The pending enable
    // must NOT flip `_enabled` true after the disable arrived.
    const onLocalStateChange = vi.fn();
    let resolveGum!: (s: MediaStream) => void;
    const pending = new Promise<MediaStream>((r) => (resolveGum = r));
    const trackStop = vi.fn();
    const stream = {
      getTracks: () => [{stop: trackStop} as unknown as MediaStreamTrack],
    } as unknown as MediaStream;
    const origNav = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        mediaDevices: {
          getUserMedia: vi.fn().mockReturnValue(pending),
        },
      },
    });
    try {
      const vc = new VoiceChat(() => {}, {onLocalStateChange});
      const enableP = vc.enable(new Set());
      // disable arrives while getUserMedia is still pending
      vc.disable();
      // Now resolve the pending getUserMedia with the stream.
      resolveGum(stream);
      await enableP;
      // The stale stream must have been stopped, not flipped on.
      expect(trackStop).toHaveBeenCalled();
      expect(vc.isEnabled()).toBe(false);
      expect(onLocalStateChange).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: origNav,
      });
    }
  });
});
