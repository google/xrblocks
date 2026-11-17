import {describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';

vi.hoisted(() => {
  vi.stubGlobal('AudioContext', function () {
    return {createGain: () => ({connect() {}}), destination: {}};
  });
});
import {core} from 'xrblocks';
import {
  decodeMessage,
  encodeMessage,
  NetMessage,
  NetObjectSnapshotMessage,
} from './codec/MessageCodec';
import {NET_PROTOCOL_VERSION} from './constants/NetConstants';
import {NetSession} from './NetSession';
import {NetObject} from './objects/NetObject';
import {Transport} from './transport/Transport';

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

it('keeps playback preferences on new streams and removes audio on session close', async () => {
  const node = () => ({connect() {}, disconnect() {}});
  const context = {
    currentTime: 0,
    destination: node(),
    resume: async () => {},
    createGain: () => {
      const gain = {
        value: 1,
        cancelScheduledValues() {},
        setValueAtTime(value: number) {
          gain.value = value;
        },
      };
      return {...node(), gain};
    },
    createPanner: node,
    createMediaStreamSource: node,
  };
  vi.spyOn(THREE.AudioContext, 'getContext').mockReturnValue(
    context as unknown as AudioContext
  );
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const peers: EventTarget[] = [];
  class NativePeer extends EventTarget {
    connectionState = 'connected';
    constructor() {
      super();
      peers.push(this);
    }
    addTransceiver() {}
    async setRemoteDescription() {}
    async createAnswer() {
      return {type: 'answer', sdp: 'answer'};
    }
    async setLocalDescription() {}
    close() {
      this.connectionState = 'closed';
    }
  }
  vi.stubGlobal('RTCPeerConnection', NativePeer);
  const listener = core.sound.listener;
  core.sound.listener = new THREE.AudioListener();
  const transport = new FakeTransport();
  const session = new NetSession(transport, new THREE.Group());
  try {
    session.setPlaybackMuted(true);
    await session.open('room');
    for (const id of ['bob', 'alice']) {
      transport.receive(id, {
        type: 'hello',
        protocol: NET_PROTOCOL_VERSION,
        capabilities: {pose: true, voice: true, netobject: true},
      });
      await session.voice.handleSignal(id, {
        type: 'voice',
        signal: {kind: 'offer', sdp: 'offer'},
      });
      const track = new EventTarget();
      const stream = {getTracks: () => [track], getAudioTracks: () => [track]};
      peers
        .at(-1)!
        .dispatchEvent(
          Object.assign(new Event('track'), {track, streams: [stream]})
        );
    }
    const audio = (id: string) =>
      session.users
        .get(id)!
        .avatar.headPivot.children.find(
          (child) => child instanceof THREE.PositionalAudio
        ) as THREE.PositionalAudio;
    expect(audio('bob').getVolume()).toBe(0);
    expect(audio('alice').getVolume()).toBe(0);
    session.setPeerPlaybackMuted('bob', true);
    session.setPlaybackMuted(false);
    expect(audio('bob').getVolume()).toBe(0);
    expect(audio('alice').getVolume()).toBe(1);
    const held = [audio('bob'), audio('alice')];
    session.close();
    expect(held.every((value) => value.parent === null)).toBe(true);
    expect(session.users.size).toBe(0);
  } finally {
    session.close();
    core.sound.listener = listener;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
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
});

it('does not recreate a remote user when a speaking session closes', async () => {
  const senderTransport = new FakeTransport();
  senderTransport.localPeerId = 'sender';
  const receiverTransport = new FakeTransport();
  receiverTransport.localPeerId = 'receiver';
  senderTransport.send = (data) => {
    receiverTransport.receive('sender', decodeMessage(data));
  };
  const sender = new NetSession(senderTransport, new THREE.Group());
  const receiver = new NetSession(receiverTransport, new THREE.Group());
  const track = new EventTarget() as EventTarget & {
    enabled: boolean;
    kind: string;
    stop(): void;
  };
  track.enabled = true;
  track.kind = 'audio';
  let stopped = false;
  track.stop = () => {
    stopped = true;
  };
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: async () => ({
        getTracks: () => [track],
        getAudioTracks: () => [track],
      }),
    },
  });
  try {
    await receiver.open('room');
    await sender.open('room');
    await sender.voice.enable(new Set());
    expect(receiver.users.has('sender')).toBe(true);
    sender.close();
    expect(stopped).toBe(true);
    expect(receiver.users.has('sender')).toBe(false);
  } finally {
    sender.close();
    receiver.close();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  }
});
