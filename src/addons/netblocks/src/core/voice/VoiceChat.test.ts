import {afterEach, describe, it, expect, vi} from 'vitest';

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

  describe('VoiceChat microphone-only mute', () => {
    class Track extends EventTarget {
      kind = 'audio';
      enabled = true;
      readyState = 'live';
      stop = vi.fn(() => {
        this.readyState = 'ended';
      });
    }
    class Sender {
      track: Track | null;
      replaceTrack = vi.fn(async (track: Track | null) => {
        this.track = track;
      });
      constructor(track: Track) {
        this.track = track;
      }
    }
    class Peer extends EventTarget {
      connectionState = 'connected';
      senders: Sender[] = [];
      addTrack = vi.fn((track: Track) => {
        const sender = new Sender(track);
        this.senders.push(sender);
        return sender;
      });
      addTransceiver = vi.fn();
      getSenders = () => this.senders;
      createOffer = vi.fn(async () => ({type: 'offer', sdp: 'test-offer'}));
      createAnswer = vi.fn(async () => ({type: 'answer', sdp: 'test-answer'}));
      setRemoteDescription = vi.fn(async () => {});
      setLocalDescription = vi.fn(async () => {});
      close = vi.fn(() => {
        this.connectionState = 'closed';
      });
      constructor() {
        super();
        peers.push(this);
      }
    }
    const peers: Peer[] = [];
    afterEach(() => {
      peers.length = 0;
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    function setup(tracks = [new Track()]) {
      const stream = {getTracks: () => tracks, getAudioTracks: () => tracks};
      const gum = vi.fn(async () => stream);
      vi.stubGlobal('navigator', {mediaDevices: {getUserMedia: gum}});
      vi.stubGlobal('RTCPeerConnection', Peer);
      const send = vi.fn();
      const state = vi.fn();
      const mute = vi.fn();
      const error = vi.fn();
      const voice = new VoiceChat(send, {
        onLocalStateChange: state,
        onLocalMuteChange: mute,
        onError: error,
      });
      voice.setLocalPeerId('a');
      return {voice, track: tracks[0], gum, send, state, mute, error};
    }

    it('pending-request cancellation leaves already enabled capture and peer connections untouched', async () => {
      const {voice, track} = setup();
      await voice.enable(new Set(['b']));
      voice.cancelPendingEnable();
      expect(voice.isEnabled()).toBe(true);
      expect(voice.isMuted()).toBe(false);
      expect(track.stop).not.toHaveBeenCalled();
      expect(peers[0].close).not.toHaveBeenCalled();
      voice.disable();
    });

    it('keeps incoming connections while muted and preserves mute on peer arrival and enable calls', async () => {
      const {voice, track, gum, send, state, mute} = setup();
      await voice.enable(new Set(['b']));
      const first = peers[0];
      send.mockClear();
      voice.setMuted(true);
      expect(voice.isEnabled()).toBe(true);
      expect(voice.isMuted()).toBe(true);
      expect(track.enabled).toBe(false);
      expect(track.stop).not.toHaveBeenCalled();
      expect(first.close).not.toHaveBeenCalled();
      expect(
        send.mock.calls.some(([message]) => message.signal.kind === 'bye')
      ).toBe(false);
      expect(mute).toHaveBeenCalledWith(true);
      expect(state).toHaveBeenCalledTimes(1);
      voice.notifyPeerJoined('c');
      await voice.enable(new Set(['c']));
      expect(voice.isMuted()).toBe(true);
      expect(peers[1].addTrack.mock.calls[0][0].enabled).toBe(false);
      expect(gum).toHaveBeenCalledOnce();
      voice.setMuted(false);
      expect(track.enabled).toBe(true);
      expect(gum).toHaveBeenCalledOnce();
      voice.disable();
      expect(track.stop).toHaveBeenCalledOnce();
      expect(first.close).toHaveBeenCalledOnce();
    });

    it('nudges a newly arrived listener without changing an existing muted choice', async () => {
      const {voice, track, gum, send} = setup();
      voice.setLocalPeerId('z');
      await voice.enable(new Set());
      voice.setMuted(true);
      voice.notifyPeerJoined('a');
      expect(send).toHaveBeenCalledWith({
        type: 'voice',
        to: 'a',
        signal: {kind: 'hello'},
      });
      expect(track.enabled).toBe(false);
      expect(voice.isMuted()).toBe(true);
      expect(gum).toHaveBeenCalledOnce();
      voice.disable();
    });

    it('can listen to a higher-ID speaker without requesting a microphone', async () => {
      const {voice, gum, send} = setup();
      await voice.handleSignal('z', {type: 'voice', signal: {kind: 'hello'}});
      expect(gum).not.toHaveBeenCalled();
      expect(voice.isEnabled()).toBe(false);
      expect(peers[0].addTransceiver).toHaveBeenCalledWith('audio', {
        direction: 'recvonly',
      });
      await vi.waitFor(() =>
        expect(send).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'voice',
            to: 'z',
            signal: {kind: 'offer', sdp: 'test-offer'},
          })
        )
      );
      voice.disable();
    });

    it('keeps receiving peer audio when capture ends and announces the microphone failure', async () => {
      const {voice, track, gum, send, state, error} = setup();
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const received = vi.fn();
      const removed = vi.fn();
      voice.onTrack(received);
      voice.onTrackRemoved(removed);
      await voice.enable(new Set(['b']));
      const peer = peers[0];
      const remoteTrack = new Track();
      const inbound = {getTracks: () => [remoteTrack]};
      peer.dispatchEvent(
        Object.assign(new Event('track'), {
          track: remoteTrack,
          streams: [inbound],
        })
      );
      expect(received).toHaveBeenCalledWith('b', inbound);
      send.mockClear();

      track.readyState = 'ended';
      track.dispatchEvent(new Event('ended'));

      expect(peer.close).not.toHaveBeenCalled();
      expect(removed).not.toHaveBeenCalled();
      expect(remoteTrack.stop).not.toHaveBeenCalled();
      expect(
        send.mock.calls.some(([message]) => message.signal.kind === 'bye')
      ).toBe(false);
      expect(gum).toHaveBeenCalledOnce();
      expect(voice.isEnabled()).toBe(false);
      expect(voice.isMuted()).toBe(true);
      expect(state.mock.calls).toEqual([[true], [false]]);
      expect(error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Microphone capture ended'),
        }),
        undefined
      );
      expect(error).toHaveBeenCalledOnce();

      voice.disable();
      expect(peer.close).toHaveBeenCalledOnce();
      expect(removed).toHaveBeenCalledWith('b');
      expect(send).toHaveBeenCalledWith({
        type: 'voice',
        to: 'b',
        signal: {kind: 'bye'},
      });
      expect(state.mock.calls).toEqual([[true], [false]]);
    });

    it.each(['a', 'z'])(
      'reuses the audio sender on explicit microphone recovery for local peer %s',
      async (localId) => {
        const {voice, track, gum, send, state, error} = setup();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        voice.setLocalPeerId(localId);
        await voice.enable(new Set(['m']));
        const peer = peers[0];
        if (localId === 'z') {
          expect(send).toHaveBeenCalledWith({
            type: 'voice',
            to: 'm',
            signal: {kind: 'hello'},
          });
          await voice.handleSignal('m', {
            type: 'voice',
            signal: {kind: 'offer', sdp: 'remote-offer'},
          });
          expect(peer.createOffer).not.toHaveBeenCalled();
        }
        await vi.waitFor(() =>
          expect(send).toHaveBeenCalledWith({
            type: 'voice',
            to: 'm',
            signal:
              localId === 'a'
                ? {kind: 'offer', sdp: 'test-offer'}
                : {kind: 'answer', sdp: 'test-answer'},
          })
        );
        const received = vi.fn();
        const removed = vi.fn();
        voice.onTrack(received);
        voice.onTrackRemoved(removed);
        const remoteTrack = new Track();
        const inbound = {getTracks: () => [remoteTrack]};
        peer.dispatchEvent(
          Object.assign(new Event('track'), {
            track: remoteTrack,
            streams: [inbound],
          })
        );
        voice.setMuted(true);
        send.mockClear();

        track.readyState = 'ended';
        track.dispatchEvent(new Event('ended'));
        expect(gum).toHaveBeenCalledOnce();
        expect(voice.isMuted()).toBe(true);

        const recoveredTrack = new Track();
        const recoveredStream = {
          getTracks: () => [recoveredTrack],
          getAudioTracks: () => [recoveredTrack],
        };
        gum.mockResolvedValueOnce(recoveredStream);
        await voice.enable(new Set(['m']));

        expect(voice.isEnabled()).toBe(true);
        expect(voice.isMuted()).toBe(false);
        expect(recoveredTrack.enabled).toBe(true);
        expect(gum).toHaveBeenCalledTimes(2);
        expect(peers).toHaveLength(1);
        expect(peer.close).not.toHaveBeenCalled();
        expect(peer.addTrack).toHaveBeenCalledOnce();
        expect(peer.getSenders()).toHaveLength(1);
        expect(peer.getSenders()[0].track).toBe(recoveredTrack);
        expect(peer.getSenders()[0].replaceTrack).toHaveBeenCalledWith(
          recoveredTrack
        );
        expect(send).not.toHaveBeenCalled();
        expect(received).toHaveBeenCalledExactlyOnceWith('m', inbound);
        expect(removed).not.toHaveBeenCalled();
        expect(state.mock.calls).toEqual([[true], [false], [true]]);
        expect(error).toHaveBeenCalledOnce();

        voice.setMuted(true);
        await voice.enable(new Set(['m']));
        expect(voice.isMuted()).toBe(true);
        expect(recoveredTrack.enabled).toBe(false);
        expect(gum).toHaveBeenCalledTimes(2);
        voice.disable();
        expect(recoveredTrack.stop).toHaveBeenCalledOnce();
        expect(peer.close).toHaveBeenCalledOnce();
        expect(removed).toHaveBeenCalledExactlyOnceWith('m');
      }
    );

    it('stops every local track and ignores stale ended callbacks after microphone recovery', async () => {
      const tracks = [new Track(), new Track()];
      const {voice, gum, state, error} = setup(tracks);
      vi.spyOn(console, 'error').mockImplementation(() => {});
      await voice.enable(new Set(['b']));
      const peer = peers[0];

      tracks[0].readyState = 'ended';
      tracks[0].dispatchEvent(new Event('ended'));
      for (const track of tracks) {
        expect(track.stop).toHaveBeenCalledOnce();
        expect(track.readyState).toBe('ended');
      }
      expect(error).toHaveBeenCalledOnce();
      expect(gum).toHaveBeenCalledOnce();

      const recoveredTrack = new Track();
      gum.mockResolvedValueOnce({
        getTracks: () => [recoveredTrack],
        getAudioTracks: () => [recoveredTrack],
      });
      await voice.enable(new Set(['b']));
      tracks[1].dispatchEvent(new Event('ended'));
      expect(voice.isEnabled()).toBe(true);
      expect(recoveredTrack.stop).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledOnce();
      expect(state.mock.calls).toEqual([[true], [false], [true]]);
      expect(peer.getSenders().map((sender) => sender.track)).toEqual([
        recoveredTrack,
        tracks[1],
      ]);

      recoveredTrack.readyState = 'ended';
      recoveredTrack.dispatchEvent(new Event('ended'));
      const latestTracks = [new Track(), new Track()];
      gum.mockResolvedValueOnce({
        getTracks: () => latestTracks,
        getAudioTracks: () => latestTracks,
      });
      await voice.enable(new Set(['b']));
      expect(peer.getSenders().map((sender) => sender.track)).toEqual(
        latestTracks
      );
      expect(peer.addTrack).toHaveBeenCalledTimes(2);
      expect(peers).toHaveLength(1);
      expect(peer.close).not.toHaveBeenCalled();
      expect(gum).toHaveBeenCalledTimes(3);
      expect(error).toHaveBeenCalledTimes(2);
      voice.disable();
    });

    it('re-offers only when recovery adds a track beyond the existing senders', async () => {
      const {voice, track, gum, send} = setup();
      vi.spyOn(console, 'error').mockImplementation(() => {});
      voice.setLocalPeerId('z');
      await voice.enable(new Set(['a']));
      const peer = peers[0];
      await voice.handleSignal('a', {
        type: 'voice',
        signal: {kind: 'offer', sdp: 'remote-offer'},
      });
      expect(peer.createOffer).not.toHaveBeenCalled();
      send.mockClear();

      track.readyState = 'ended';
      track.dispatchEvent(new Event('ended'));
      const recoveredTracks = [new Track(), new Track()];
      gum.mockResolvedValueOnce({
        getTracks: () => recoveredTracks,
        getAudioTracks: () => recoveredTracks,
      });
      await voice.enable(new Set(['a']));

      expect(peer.getSenders().map((sender) => sender.track)).toEqual(
        recoveredTracks
      );
      expect(peer.addTrack).toHaveBeenCalledTimes(2);
      expect(peer.createOffer).toHaveBeenCalledOnce();
      await vi.waitFor(() =>
        expect(send).toHaveBeenCalledExactlyOnceWith({
          type: 'voice',
          to: 'a',
          signal: {kind: 'offer', sdp: 'test-offer'},
        })
      );
      expect(peers).toHaveLength(1);
      expect(peer.close).not.toHaveBeenCalled();
      voice.disable();
    });

    it('reports a sender replacement failure without interrupting listening or recovery for other peers', async () => {
      const {voice, track, gum, error} = setup();
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const removed = vi.fn();
      voice.onTrackRemoved(removed);
      await voice.enable(new Set(['b', 'c']));
      track.readyState = 'ended';
      track.dispatchEvent(new Event('ended'));
      error.mockClear();

      const replacementError = new Error('Audio replacement failed');
      peers[0]
        .getSenders()[0]
        .replaceTrack.mockRejectedValueOnce(replacementError);
      const recoveredTrack = new Track();
      gum.mockResolvedValueOnce({
        getTracks: () => [recoveredTrack],
        getAudioTracks: () => [recoveredTrack],
      });
      await voice.enable(new Set(['b', 'c']));

      expect(error).toHaveBeenCalledExactlyOnceWith(replacementError, 'b');
      expect(removed).not.toHaveBeenCalled();
      for (const peer of peers) {
        expect(peer.close).not.toHaveBeenCalled();
        expect(peer.addTrack).toHaveBeenCalledOnce();
      }
      expect(peers[1].getSenders()[0].track).toBe(recoveredTrack);
      expect(voice.isEnabled()).toBe(true);
      voice.disable();
    });

    it('reports peer connection failures without claiming the microphone was disabled', async () => {
      const {voice, error} = setup();
      vi.spyOn(console, 'error').mockImplementation(() => {});
      await voice.enable(new Set(['b']));
      peers[0].connectionState = 'failed';
      peers[0].dispatchEvent(new Event('connectionstatechange'));
      expect(error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Peer audio connection failed'),
        }),
        'b'
      );
      expect(voice.isEnabled()).toBe(true);
      voice.disable();
    });
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
