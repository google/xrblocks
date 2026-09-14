import {afterEach, describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';

// NetSession imports `xrblocks` only to read `xb.core.sound.listener` inside
// open(). The real module instantiates a Core (and AudioContext) at import
// time, which jsdom can't satisfy.
// `RemoteUserAvatar` also reaches into `xb.StylizedFace` in its
// constructor, so stub that with a bare Object3D.
const mockCore = vi.hoisted(() => ({
  sound: {listener: undefined as unknown},
}));

vi.mock('xrblocks', async () => {
  const T = await import('three');
  class FakeUIElement extends T.Object3D {
    dispose() {}
  }
  return {
    core: mockCore,
    StylizedFace: class extends T.Object3D {
      dispose() {}
    },
    UICard: FakeUIElement,
    UIText: class extends FakeUIElement {
      text = '';
      constructor(opts?: {text?: string}) {
        super();
        this.text = opts?.text ?? '';
      }
    },
  };
});

import {
  decodeMessage,
  encodeMessage,
  HelloMessage,
  NetMessage,
  NetObjectMessage,
  NetObjectSnapshotMessage,
} from './codec/MessageCodec';
import {NET_PROTOCOL_VERSION} from './constants/NetConstants';
import {NetSession, PlaybackStateEventDetail} from './NetSession';
import {NetObject} from './objects/NetObject';
import {Transport} from './transport/Transport';
import {SpatialVoice} from './voice/SpatialVoice';

class FakeTransport extends Transport {
  readonly name = 'fake';
  localPeerId = 'local-peer';
  isOpen = true;
  remotePeerIds: ReadonlySet<string> = new Set();
  sent: Array<{payload: Uint8Array; to?: string}> = [];

  async connect() {
    // no-op
  }
  close() {
    this.isOpen = false;
  }
  send(payload: Uint8Array, targetPeerId?: string) {
    this.sent.push({payload, to: targetPeerId});
  }

  // Test helper.
  receive(fromPeerId: string, msg: NetMessage) {
    this.emitMessage(fromPeerId, encodeMessage({...msg, from: fromPeerId}));
  }
}

function decodeSent(sent: Array<{payload: Uint8Array; to?: string}>) {
  return sent.map((s) => ({to: s.to, msg: decodeMessage(s.payload)}));
}

describe('NetSession incoming playback preferences', () => {
  const sessions: NetSession[] = [];

  afterEach(() => {
    for (const session of sessions) session.close();
    sessions.length = 0;
    mockCore.sound.listener = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function setup() {
    const transport = new FakeTransport();
    const session = new NetSession(transport, new THREE.Group());
    sessions.push(session);
    const changes: PlaybackStateEventDetail[] = [];
    session.addEventListener('playback-state', (event) => {
      changes.push((event as CustomEvent<PlaybackStateEventDetail>).detail);
    });
    const attach = vi
      .spyOn(SpatialVoice.prototype, 'attach')
      .mockImplementation(() => {});
    const playback = vi.spyOn(SpatialVoice.prototype, 'setPlaybackMuted');
    const detach = vi.spyOn(SpatialVoice.prototype, 'detach');
    const dispose = vi.spyOn(SpatialVoice.prototype, 'dispose');
    return {transport, session, changes, attach, playback, detach, dispose};
  }

  function join(transport: FakeTransport, peerId: string) {
    transport.receive(peerId, {
      type: 'hello',
      protocol: NET_PROTOCOL_VERSION,
      capabilities: {pose: true, voice: true, netobject: true},
    });
  }

  // Exercise VoiceChat's existing subscribers without creating WebRTC.
  function track(session: NetSession, peerId: string, stream: MediaStream) {
    const voice = session.voice as unknown as {
      _onTrack: Set<(peerId: string, stream: MediaStream) => void>;
    };
    for (const callback of voice._onTrack) callback(peerId, stream);
  }

  function removeTrack(session: NetSession, peerId: string) {
    const voice = session.voice as unknown as {
      _onTrackRemoved: Set<(peerId: string) => void>;
    };
    for (const callback of voice._onTrackRemoved) callback(peerId);
  }

  it('keeps master and individual choices independent, emitting only real changes', async () => {
    const {session, transport, changes, playback} = setup();
    mockCore.sound.listener = {};
    await session.open('room');
    join(transport, 'bob');
    join(transport, 'alice');
    expect(session.playbackMuted).toBe(false);
    expect(session.isPeerPlaybackMuted('bob')).toBe(false);
    session.setPlaybackMuted(false);
    session.setPeerPlaybackMuted('bob', false);
    expect(changes).toEqual([]);

    session.setPeerPlaybackMuted('bob', true);
    session.setPeerPlaybackMuted('bob', true);
    session.setPlaybackMuted(true);
    session.setPlaybackMuted(true);
    expect(session.playbackMuted).toBe(true);
    expect(session.isPeerPlaybackMuted('bob')).toBe(true);
    expect(session.isPeerPlaybackMuted('alice')).toBe(false);
    session.setPlaybackMuted(false);
    expect(playback.mock.calls.slice(-2)).toEqual([
      ['bob', true],
      ['alice', false],
    ]);
    expect(session.isPeerPlaybackMuted('bob')).toBe(true);
    session.setPlaybackMuted(true);
    session.setPeerPlaybackMuted('bob', false);
    expect(session.isPeerPlaybackMuted('bob')).toBe(false);
    expect(playback).toHaveBeenLastCalledWith('bob', true);
    session.setPlaybackMuted(false);
    expect(playback.mock.calls.slice(-2)).toEqual([
      ['bob', false],
      ['alice', false],
    ]);
    expect(changes).toEqual([
      {peerId: 'bob', muted: true},
      {muted: true},
      {muted: false},
      {muted: true},
      {peerId: 'bob', muted: false},
      {muted: false},
    ]);
  });

  it('applies pre-open master and lazy per-peer choices to every new/replaced stream', async () => {
    const {session, transport, attach} = setup();
    const first = {} as MediaStream;
    const replacement = {} as MediaStream;
    session.setPlaybackMuted(true);
    await session.open('room');
    join(transport, 'bob');
    join(transport, 'alice');
    session.setPeerPlaybackMuted('bob', true);
    track(session, 'bob', first);
    expect(attach).not.toHaveBeenCalled();

    mockCore.sound.listener = {};
    track(session, 'alice', first);
    expect(attach).toHaveBeenLastCalledWith(
      'alice',
      session.users.get('alice')!.avatar.headPivot,
      first,
      true
    );
    session.setPlaybackMuted(false);
    track(session, 'bob', first);
    track(session, 'bob', replacement);
    expect(attach).toHaveBeenLastCalledWith(
      'bob',
      session.users.get('bob')!.avatar.headPivot,
      replacement,
      true
    );
    track(session, 'alice', replacement);
    expect(attach).toHaveBeenLastCalledWith(
      'alice',
      session.users.get('alice')!.avatar.headPivot,
      replacement,
      false
    );
    expect(new Set(attach.mock.contexts).size).toBe(1);
  });

  it.each(['bye', 'peer-leave'] as const)(
    'retains choices on track removal but clears only the departing ID on %s',
    async (leave) => {
      const {session, transport, attach, detach, changes} = setup();
      mockCore.sound.listener = {};
      await session.open('room');
      join(transport, 'bob');
      join(transport, 'alice');
      session.setPeerPlaybackMuted('bob', true);
      session.setPeerPlaybackMuted('alice', true);
      const stream = {} as MediaStream;
      track(session, 'bob', stream);
      removeTrack(session, 'bob');
      expect(detach).toHaveBeenLastCalledWith('bob');
      expect(session.isPeerPlaybackMuted('bob')).toBe(true);
      track(session, 'bob', stream);
      expect(attach).toHaveBeenLastCalledWith(
        'bob',
        session.users.get('bob')!.avatar.headPivot,
        stream,
        true
      );
      if (leave === 'bye') transport.receive('bob', {type: 'bye'});
      else
        transport.dispatchEvent(
          new CustomEvent('peer-leave', {detail: {peerId: 'bob'}})
        );
      expect(session.isPeerPlaybackMuted('bob')).toBe(false);
      expect(session.isPeerPlaybackMuted('alice')).toBe(true);
      join(transport, 'bob');
      track(session, 'bob', stream);
      expect(attach).toHaveBeenLastCalledWith(
        'bob',
        session.users.get('bob')!.avatar.headPivot,
        stream,
        false
      );
      expect(changes).toEqual([
        {peerId: 'bob', muted: true},
        {peerId: 'alice', muted: true},
      ]);
    }
  );

  it('does not capture/toggle the mic, close connections, or announce voice changes', async () => {
    const {session, transport} = setup();
    const mic = Object.assign(new EventTarget(), {
      enabled: true,
      stop: vi.fn(),
    });
    const gum = vi.fn(async () => ({
      getTracks: () => [mic],
      getAudioTracks: () => [mic],
    }));
    vi.stubGlobal('navigator', {mediaDevices: {getUserMedia: gum}});
    await session.open('room');
    join(transport, 'bob');
    session.setPlaybackMuted(true);
    expect(gum).not.toHaveBeenCalled();
    expect(session.voice.isEnabled()).toBe(false);
    await session.voice.enable(new Set());
    const close = vi.fn();
    const inner = session.voice as unknown as {
      _peers: Map<string, {pc: {close: () => void}}>;
    };
    inner._peers.set('bob', {pc: {close}});
    const setMuted = vi.spyOn(session.voice, 'setMuted');
    const voiceChange = vi.fn();
    for (const name of [
      'voice-state',
      'local-voice-state',
      'peer-voice-state',
    ]) {
      session.addEventListener(name, voiceChange);
    }
    transport.sent.length = 0;
    session.setPeerPlaybackMuted('bob', true);
    session.setPlaybackMuted(false);
    session.setPlaybackMuted(true);
    session.setPeerPlaybackMuted('bob', false);
    expect(mic.enabled).toBe(true);
    expect(mic.stop).not.toHaveBeenCalled();
    expect(gum).toHaveBeenCalledOnce();
    expect(setMuted).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(session.voice.isEnabled()).toBe(true);
    expect(session.voice.isMuted()).toBe(false);
    expect(voiceChange).not.toHaveBeenCalled();
    expect(transport.sent).toEqual([]);
  });

  it('disposes its graph and preferences, ignoring late tracks after close', async () => {
    const {session, transport, attach, dispose} = setup();
    mockCore.sound.listener = {};
    await session.open('room');
    join(transport, 'bob');
    session.setPlaybackMuted(true);
    session.setPeerPlaybackMuted('bob', true);
    track(session, 'bob', {} as MediaStream);
    session.close();
    expect(dispose).toHaveBeenCalledOnce();
    expect(session.playbackMuted).toBe(false);
    expect(session.isPeerPlaybackMuted('bob')).toBe(false);
    track(session, 'bob', {} as MediaStream);
    expect(attach).toHaveBeenCalledOnce();
    session.close();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('clears a stored master preference when closed before open', () => {
    const {session} = setup();
    session.setPlaybackMuted(true);
    session.close();
    expect(session.playbackMuted).toBe(false);
  });

  it('rejects invalid values explicitly without changing state or emitting events', async () => {
    const {session, transport, changes} = setup();
    await session.open('room');
    join(transport, 'bob');
    for (const muted of [undefined, null, 0, 1, 'true', {}]) {
      expect(() => session.setPlaybackMuted(muted as boolean)).toThrow(
        TypeError
      );
      expect(() =>
        session.setPeerPlaybackMuted('bob', muted as boolean)
      ).toThrow(TypeError);
    }
    for (const peerId of [undefined, null, '', '  ', 123]) {
      expect(() =>
        session.setPeerPlaybackMuted(peerId as string, true)
      ).toThrow(TypeError);
      expect(() => session.isPeerPlaybackMuted(peerId as string)).toThrow(
        TypeError
      );
    }
    for (const peerId of ['unknown', session.localPeerId]) {
      expect(() => session.setPeerPlaybackMuted(peerId, true)).toThrow(
        RangeError
      );
      expect(session.isPeerPlaybackMuted(peerId)).toBe(false);
    }
    expect(session.playbackMuted).toBe(false);
    expect(session.isPeerPlaybackMuted('bob')).toBe(false);
    expect(changes).toEqual([]);
  });
});

describe('NetSession hello handler', () => {
  it('announces muted transmission to new peers and exposes remote mic state', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [],
          getAudioTracks: () => [],
        })),
      },
    });
    const transport = new FakeTransport();
    const session = new NetSession(transport, new THREE.Group());
    try {
      await session.open('room');
      const local = vi.fn();
      const remote = vi.fn();
      session.addEventListener('local-voice-state', local);
      session.addEventListener('peer-voice-state', remote);
      await session.voice.enable(new Set());
      session.voice.setMuted(true);
      expect(local).toHaveBeenLastCalledWith(
        expect.objectContaining({detail: {on: false}})
      );
      expect(session.voice.isEnabled()).toBe(true);
      transport.sent.length = 0;
      transport.receive('new-peer', {
        type: 'hello',
        protocol: NET_PROTOCOL_VERSION,
        capabilities: {pose: true, voice: true, netobject: true},
        displayName: 'Bob',
      });
      expect(decodeSent(transport.sent)).toContainEqual(
        expect.objectContaining({
          to: 'new-peer',
          msg: expect.objectContaining({
            type: 'rpc',
            topic: 'netblocks/voice-state',
            payload: false,
          }),
        })
      );
      transport.receive('new-peer', {
        type: 'rpc',
        topic: 'netblocks/voice-state',
        payload: true,
      });
      expect(remote).toHaveBeenLastCalledWith(
        expect.objectContaining({detail: {peerId: 'new-peer', on: true}})
      );
      expect(session.users.get('new-peer')!.avatar.voiceActive).toBe(true);
      expect(session.voice.isMuted()).toBe(true);
    } finally {
      session.close();
      vi.unstubAllGlobals();
    }
  });

  it('notifies metadata changes after the deferred join grace window without joining twice', async () => {
    vi.useFakeTimers();
    const transport = new FakeTransport();
    const session = new NetSession(transport, new THREE.Group());
    const joined = vi.fn();
    const updated = vi.fn();
    session.addEventListener('user-join', joined);
    session.addEventListener('user-update', updated);
    try {
      await session.open('room');
      transport.receive('bob', {type: 'rpc', topic: 'probe', payload: null});
      vi.advanceTimersByTime(1500);
      expect(joined).toHaveBeenCalledOnce();
      expect(session.users.get('bob')?.displayName).toBeUndefined();
      transport.receive('bob', {
        type: 'hello',
        protocol: NET_PROTOCOL_VERSION,
        capabilities: {pose: true, voice: true, netobject: true},
        displayName: 'Bob',
      });
      expect(session.users.get('bob')?.displayName).toBe('Bob');
      expect(joined).toHaveBeenCalledOnce();
      expect(updated).toHaveBeenCalledOnce();
      expect(updated.mock.calls[0][0].detail.user.displayName).toBe('Bob');
    } finally {
      session.close();
      vi.useRealTimers();
    }
  });

  it('announces a timely named hello once and refreshes existing welcome metadata', async () => {
    const transport = new FakeTransport();
    const session = new NetSession(transport, new THREE.Group());
    const joined = vi.fn();
    const updated = vi.fn();
    session.addEventListener('user-join', joined);
    session.addEventListener('user-update', updated);
    try {
      await session.open('room');
      const capabilities = {pose: true, voice: true, netobject: true};
      transport.receive('bob', {
        type: 'hello',
        protocol: NET_PROTOCOL_VERSION,
        capabilities,
        displayName: 'Bob',
      });
      expect(joined).toHaveBeenCalledOnce();
      expect(joined.mock.calls[0][0].detail.user.displayName).toBe('Bob');
      expect(updated).not.toHaveBeenCalled();
      transport.receive('bob', {
        type: 'welcome',
        peers: [{id: 'bob', displayName: 'Robert', role: 'user', capabilities}],
      });
      expect(joined).toHaveBeenCalledOnce();
      expect(updated).toHaveBeenCalledOnce();
      expect(updated.mock.calls[0][0].detail.user.displayName).toBe('Robert');
    } finally {
      session.close();
    }
  });

  it('flushes a pending join with its real name without a duplicate update', async () => {
    vi.useFakeTimers();
    const transport = new FakeTransport();
    const session = new NetSession(transport, new THREE.Group());
    const joined = vi.fn();
    const updated = vi.fn();
    session.addEventListener('user-join', joined);
    session.addEventListener('user-update', updated);
    try {
      await session.open('room');
      transport.receive('bob', {type: 'rpc', topic: 'probe', payload: null});
      transport.receive('bob', {
        type: 'hello',
        protocol: NET_PROTOCOL_VERSION,
        capabilities: {pose: true, voice: true, netobject: true},
        displayName: 'Bob',
      });
      vi.advanceTimersByTime(1500);
      expect(joined).toHaveBeenCalledOnce();
      expect(joined.mock.calls[0][0].detail.user.displayName).toBe('Bob');
      expect(updated).not.toHaveBeenCalled();
    } finally {
      session.close();
      vi.useRealTimers();
    }
  });

  it('replies with a netobject.snapshot of dirty NetObjects, targeted at the joiner', async () => {
    const transport = new FakeTransport();
    const session = new NetSession(transport, new THREE.Group());
    await session.open('room');
    const dirty = new NetObject({id: 'cube-1'});
    dirty.position.set(1, 2, 3);
    dirty._dirty = true;
    const pristine = new NetObject({id: 'cube-2'});
    session.netObjects.add(dirty);
    session.netObjects.add(pristine);

    transport.sent.length = 0;
    transport.receive('joiner', {
      type: 'hello',
      protocol: NET_PROTOCOL_VERSION,
      capabilities: {pose: true, voice: true, netobject: true},
      displayName: 'Joiner',
    } as HelloMessage);

    const decoded = decodeSent(transport.sent);
    const snapshot = decoded.find(
      (d) => d.msg.type === 'netobject.snapshot'
    ) as {to?: string; msg: NetObjectSnapshotMessage} | undefined;

    expect(snapshot).toBeDefined();
    expect(snapshot!.to).toBe('joiner');
    expect(snapshot!.msg.objects.map((o) => o.id)).toEqual(['cube-1']);
    expect(snapshot!.msg.objects[0].xform.slice(0, 3)).toEqual([1, 2, 3]);
  });

  it('always replies with a welcome to the joiner', async () => {
    const transport = new FakeTransport();
    const session = new NetSession(transport, new THREE.Group());
    await session.open('room');

    transport.sent.length = 0;
    transport.receive('joiner', {
      type: 'hello',
      protocol: NET_PROTOCOL_VERSION,
      capabilities: {pose: true, voice: true, netobject: true},
    } as HelloMessage);

    const welcome = decodeSent(transport.sent).find(
      (d) => d.msg.type === 'welcome'
    );
    expect(welcome).toBeDefined();
    expect(welcome!.to).toBe('joiner');
  });
});

describe('NetSession late-join state-reset regression', () => {
  it('does not let a delayed pre-claim snapshot erase a newer ownership generation', async () => {
    const peers = ['a', 'b', 'c'].map((id) => {
      const transport = new FakeTransport();
      transport.localPeerId = id;
      const session = new NetSession(transport, new THREE.Group());
      const object = new NetObject({id: 'cube'});
      session.netObjects.add(object);
      return {transport, session, object};
    });
    const [a, b, c] = peers;
    try {
      for (const p of peers) await p.session.open('room');
      c.object.snapToXform(c.object.toXform());
      c.transport.receive('b', {
        type: 'hello',
        protocol: NET_PROTOCOL_VERSION,
        capabilities: {pose: true, voice: false, netobject: true},
      });
      const delayed = decodeSent(c.transport.sent).find(
        ({msg}) => msg.type === 'netobject.snapshot'
      )!.msg;
      expect(delayed).toMatchObject({objects: [{id: 'cube', ownerId: ''}]});
      a.session.claim(a.object);
      const claim = decodeSent(a.transport.sent).at(-1)!.msg;
      b.transport.receive('a', claim);
      c.transport.receive('a', claim);
      // The old C-to-B snapshot and A-to-B claim cross in flight.
      b.transport.receive('c', delayed);
      expect(b.object.claim).toEqual({counter: 1, peerId: 'a'});
      expect(b.object.ownerId).toBe('a');
      a.session.release(a.object);
      const release = decodeSent(a.transport.sent).at(-1)!.msg;
      b.transport.receive('a', release);
      c.transport.receive('a', release);
      b.session.claim(b.object);
      const takeover = decodeSent(b.transport.sent).at(-1)!.msg;
      a.transport.receive('b', takeover);
      c.transport.receive('b', takeover);
      for (const p of peers) {
        expect(p.object.ownerId).toBe('b');
        expect(p.object.claim).toEqual({counter: 2, peerId: 'b'});
      }
    } finally {
      for (const p of peers) p.session.close();
    }
  });

  it('increments a caught-up claim generation when a late joiner takes over', async () => {
    const transport = new FakeTransport();
    const session = new NetSession(transport, new THREE.Group());
    await session.open('room');
    try {
      const object = new NetObject({id: 'cube'});
      session.netObjects.add(object);
      transport.receive('a', {
        type: 'netobject.snapshot',
        objects: [
          {
            id: 'cube',
            ownerId: '',
            claim: {counter: 7, peerId: 'a'},
            xform: [2, 0, 0, 0, 0, 0, 1, 1, 1, 1],
          },
        ],
      });
      expect(object.claim).toEqual({counter: 7, peerId: 'a'});
      session.claim(object);
      expect(object.ownerId).toBe('local-peer');
      expect(decodeSent(transport.sent).at(-1)?.msg).toMatchObject({
        type: 'netobject.claim',
        claimCounter: 8,
      });
      session.release(object);
      expect(decodeSent(transport.sent).at(-1)?.msg).toMatchObject({
        type: 'netobject.release',
        claimCounter: 8,
      });
      transport.receive('joiner', {
        type: 'hello',
        protocol: NET_PROTOCOL_VERSION,
        capabilities: {pose: true, voice: false, netobject: true},
      });
      const snapshot = decodeSent(transport.sent)
        .filter(({msg}) => msg.type === 'netobject.snapshot')
        .at(-1);
      expect(snapshot?.msg).toMatchObject({
        objects: [
          {id: 'cube', ownerId: '', claim: {counter: 8, peerId: 'local-peer'}},
        ],
      });
    } finally {
      session.close();
    }
  });

  it('rejects old poses/releases from the same peer after a newer grab', async () => {
    const transport = new FakeTransport();
    const session = new NetSession(transport, new THREE.Group());
    await session.open('room');
    try {
      const object = new NetObject({id: 'cube'});
      session.netObjects.add(object);
      for (const claimCounter of [1, 2]) {
        transport.receive('a', {
          type: 'netobject.claim',
          id: 'cube',
          claimCounter,
        });
      }
      const pose = (x: number) => [x, 0, 0, 0, 0, 0, 1, 1, 1, 1];
      transport.receive('a', {
        type: 'netobject',
        id: 'cube',
        claimCounter: 2,
        xform: pose(2),
      });
      transport.receive('a', {
        type: 'netobject',
        id: 'cube',
        claimCounter: 1,
        xform: pose(99),
      });
      transport.receive('a', {
        type: 'netobject.release',
        id: 'cube',
        claimCounter: 1,
        xform: pose(99),
      });
      expect(object.ownerId).toBe('a');
      expect(object._targetPosition.x).toBe(2);
      transport.receive('a', {
        type: 'netobject.release',
        id: 'cube',
        claimCounter: 2,
        xform: pose(3),
      });
      transport.receive('a', {
        type: 'netobject',
        id: 'cube',
        claimCounter: 2,
        xform: pose(99),
      });
      expect(object.ownerId).toBe('');
      expect(object._targetPosition.x).toBe(3);
      expect(object._pendingFinal).toBe(true);
    } finally {
      session.close();
    }
  });

  it('joiner adopts a snapshot for an auto-owned NetObject it has never moved', async () => {
    // Joiner side. We're "local-peer", we just constructed a NetObject which
    // is auto-owned (ownerId === localPeerId) and pristine. An existing peer
    // sends us a snapshot. We should *apply* it (xform + ownerId) — the old
    // skip-if-I-own guard caused us to discard the snapshot and stay at
    // constructor defaults.
    const transport = new FakeTransport();
    const session = new NetSession(transport, new THREE.Group());
    await session.open('room');
    const local = new NetObject({id: 'cube-1', ownerId: 'local-peer'});
    session.netObjects.add(local);
    expect(local._dirty).toBe(false);

    transport.receive('existing-peer', {
      type: 'netobject.snapshot',
      objects: [
        {
          id: 'cube-1',
          xform: [5, 6, 7, 0, 0, 0, 1, 1, 1, 1],
          ownerId: 'existing-peer',
        },
      ],
    } as NetObjectSnapshotMessage);

    expect(local.position.toArray()).toEqual([5, 6, 7]);
    expect(local.ownerId).toBe('existing-peer');
  });

  it('dirty owner does not yield to a lex-smaller silent broadcaster', async () => {
    // Existing peer side. We own and have moved cube-1 (`_dirty=true`). A
    // lex-smaller joiner ("aaa") starts broadcasting netobject updates with
    // their constructor defaults before our snapshot reaches them. The old
    // tiebreak handed ownership to "aaa" and snapped us to defaults; the
    // new one keeps our authoritative state.
    const transport = new FakeTransport();
    transport.localPeerId = 'zzz';
    const session = new NetSession(transport, new THREE.Group());
    await session.open('room');
    const owned = new NetObject({id: 'cube-1', ownerId: 'zzz'});
    owned.position.set(1, 2, 3);
    owned._dirty = true;
    session.netObjects.add(owned);

    transport.receive('aaa', {
      type: 'netobject',
      id: 'cube-1',
      xform: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1],
    } as NetObjectMessage);

    expect(owned.ownerId).toBe('zzz');
    expect(owned.position.toArray()).toEqual([1, 2, 3]);
  });
});

describe('NetSession close ordering', () => {
  // Regression: close() previously sent the session `bye` BEFORE
  // calling voice.disable(). voice.disable() then broadcasts
  // `netblocks/voice-state=false` and per-peer voice `bye` signals.
  // On the remote, the session bye would remove the user first, and
  // the trailing voice messages would land in `_onMessage` where any
  // message from an unknown peer creates a fresh `NetUser` — leaving
  // a ghost avatar behind for the peer that just left.
  it('emits the session bye AFTER voice disable so remotes never resurrect a ghost user', async () => {
    const transport = new FakeTransport();
    const session = new NetSession(transport, new THREE.Group());
    await session.open('room');
    // Force voice into the enabled state without going through
    // navigator.mediaDevices (jsdom doesn't have it). disable() still
    // runs its full broadcast path because `wasEnabled` is true.
    (session.voice as unknown as {_enabled: boolean})._enabled = true;
    // Plant a peer connection so voice.disable() emits a voice bye too.
    (
      session.voice as unknown as {
        _peers: Map<
          string,
          {
            pc: {close: () => void; getSenders: () => unknown[]};
            isOfferer: boolean;
          }
        >;
      }
    )._peers.set('peer-x', {
      pc: {close: () => {}, getSenders: () => []},
      isOfferer: false,
    });
    transport.sent.length = 0;

    session.close();

    const decoded = decodeSent(transport.sent);
    const byeIdx = decoded.findIndex(
      (d) => d.msg.type === 'bye' && d.to === undefined
    );
    const voiceByeIdx = decoded.findIndex(
      (d) =>
        d.msg.type === 'voice' &&
        (d.msg as {signal: {kind: string}}).signal.kind === 'bye'
    );
    expect(byeIdx).toBeGreaterThanOrEqual(0);
    expect(voiceByeIdx).toBeGreaterThanOrEqual(0);
    // Voice bye must precede the session bye so the remote sees voice
    // cleanup against the still-known sender, not against an
    // already-removed user.
    expect(voiceByeIdx).toBeLessThan(byeIdx);
  });

  // Regression: WebRTC peers only detect a closed peer via ICE
  // failure, which takes 15–30s — long enough that the departed
  // avatar reads as a frozen ghost in the room. Opening a session
  // now registers a `pagehide` listener that calls `close()` so the
  // session-level `bye` goes out over the data channel and the
  // remote tears down immediately.
  it('open() registers a pagehide handler that closes the session', async () => {
    const added: Array<{type: string; listener: EventListener}> = [];
    const removed: Array<{type: string; listener: EventListener}> = [];
    const origAdd = window.addEventListener.bind(window);
    const origRemove = window.removeEventListener.bind(window);
    window.addEventListener = ((type: string, listener: EventListener) => {
      added.push({type, listener});
      return origAdd(type, listener);
    }) as typeof window.addEventListener;
    window.removeEventListener = ((type: string, listener: EventListener) => {
      removed.push({type, listener});
      return origRemove(type, listener);
    }) as typeof window.removeEventListener;
    try {
      const transport = new FakeTransport();
      const session = new NetSession(transport, new THREE.Group());
      await session.open('room');
      const ph = added.find((a) => a.type === 'pagehide');
      expect(ph).toBeDefined();

      // Trigger pagehide; session should close (and the transport
      // should observe the call).
      const closeSpy = vi.spyOn(transport, 'close');
      ph!.listener(new Event('pagehide'));
      expect(closeSpy).toHaveBeenCalled();
      // close() must remove its own pagehide listener so a re-opened
      // session in the same window doesn't fire stale handlers.
      expect(
        removed.find(
          (r) => r.type === 'pagehide' && r.listener === ph!.listener
        )
      ).toBeDefined();
    } finally {
      window.addEventListener = origAdd;
      window.removeEventListener = origRemove;
    }
  });
});
