import {afterEach, describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';
import {decodeMessage} from '../codec/MessageCodec';
import {NetSession} from '../NetSession';
import {NetObject} from '../objects/NetObject';
import {WebRTCTransport} from './WebRTCTransport';

// Keep the real session/replication code; only rendering/audio need a DOM stub.
vi.mock('xrblocks', async () => {
  const T = await import('three');
  class Element extends T.Object3D {
    dispose() {}
  }
  return {
    core: {sound: {listener: undefined}},
    StylizedFace: Element,
    UICard: Element,
    UIText: class extends Element {
      text = '';
    },
  };
});

interface Signal {
  type: string;
  src?: string;
  dst?: string;
  payload?: {sdp?: RTCSessionDescriptionInit; metadata?: unknown};
}

class Channel extends EventTarget {
  readyState = 'connecting';
  bufferedAmount = 0;
  binaryType = '';
  other?: Channel;
  get ordered() {
    return this.options.ordered ?? true;
  }
  get maxRetransmits() {
    return this.options.maxRetransmits ?? null;
  }
  send = vi.fn((data: ArrayBuffer | Uint8Array) => {
    // Browser delivery creates a buffer in the receiving realm (TextEncoder
    // in jsdom can produce Node-realm buffers).
    const buffer = new ArrayBuffer(data.byteLength);
    new Uint8Array(buffer).set(
      ArrayBuffer.isView(data) ? data : new Uint8Array(data)
    );
    queueMicrotask(() => {
      if (this.other?.readyState === 'open')
        this.other.dispatchEvent(new MessageEvent('message', {data: buffer}));
    });
  });
  constructor(
    readonly label: string,
    readonly options: RTCDataChannelInit
  ) {
    super();
  }
  open() {
    if (this.readyState !== 'connecting') return;
    this.readyState = 'open';
    this.dispatchEvent(new Event('open'));
  }
  close() {
    if (this.readyState === 'closed') return;
    this.readyState = 'closed';
    this.dispatchEvent(new Event('close'));
    this.other?.close();
  }
}

class Peer extends EventTarget {
  static instances: Peer[] = [];
  static failUnreliable = false;
  static deferReliableOpen = false;
  readonly id = `peer-${Peer.instances.length}`;
  readonly owner = Broker.deliveringTo ?? Broker.latestOpened;
  readonly created: Channel[] = [];
  readonly channels: Channel[] = [];
  readonly createCalls: string[] = [];
  other?: Peer;
  legacyMain?: Channel;
  connectionState = 'new';
  signalingState = 'stable';
  remoteDescription?: RTCSessionDescriptionInit;
  localDescription?: RTCSessionDescriptionInit;
  sctp: {maxMessageSize: number} | null = {maxMessageSize: 65536};

  constructor() {
    super();
    Peer.instances.push(this);
    // Emulate the pre-#716 receiver's dangerous "every channel is primary"
    // policy before the current transport listener runs. An unexpected extra
    // channel would overwrite legacyMain and closing it would close this PC.
    if (Broker.isLegacy(this.owner))
      this.addEventListener('datachannel', (event) => {
        const channel = (event as Event & {channel: Channel}).channel;
        this.legacyMain = channel;
        channel.addEventListener('close', () => this.close());
      });
  }
  createDataChannel(label: string, options: RTCDataChannelInit) {
    this.createCalls.push(label);
    if (
      label === 'netblocks-unreliable' &&
      !this.other?.channels.some((channel) => channel.label === 'netblocks')
    )
      throw new Error('Reliable channel must exist first');
    if (label === 'netblocks-unreliable' && Peer.failUnreliable)
      throw new Error('Optional channel rejected');
    const channel = new Channel(label, options);
    this.created.push(channel);
    this.channels.push(channel);
    if (this.connectionState === 'connected')
      queueMicrotask(() => this.deliver(channel));
    return channel;
  }
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return {type: 'offer', sdp: this.id};
  }
  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return {type: 'answer', sdp: this.id};
  }
  async setLocalDescription(description: RTCSessionDescriptionInit) {
    this.localDescription = description;
    this.signalingState =
      description.type === 'offer' ? 'have-local-offer' : 'stable';
  }
  async setRemoteDescription(description: RTCSessionDescriptionInit) {
    this.remoteDescription = description;
    this.other = Peer.instances.find((peer) => peer.id === description.sdp);
    if (!this.other) throw new Error('Missing remote peer');
    this.other.other = this;
    this.signalingState =
      description.type === 'offer' ? 'have-remote-offer' : 'stable';
    if (description.type === 'answer') {
      this.connectionState = this.other.connectionState = 'connected';
      // Open reliable before setRemoteDescription resolves, exercising the
      // race between the channel's open event and processing answer metadata.
      for (const channel of [...this.created]) this.deliver(channel);
    }
  }
  async addIceCandidate() {}
  deliver(channel: Channel) {
    if (!this.other || channel.other || channel.readyState === 'closed') return;
    const remote = new Channel(channel.label, channel.options);
    channel.other = remote;
    remote.other = channel;
    this.other.channels.push(remote);
    this.other.dispatchEvent(
      Object.assign(new Event('datachannel'), {channel: remote})
    );
    const open = () => {
      remote.open();
      channel.open();
    };
    if (Peer.deferReliableOpen && channel.label === 'netblocks')
      setTimeout(open, 0);
    else open();
  }
  close() {
    if (this.connectionState === 'closed') return;
    this.connectionState = 'closed';
    this.dispatchEvent(new Event('connectionstatechange'));
    for (const channel of this.channels) channel.close();
  }
}

class Broker extends EventTarget {
  static OPEN = 1;
  static instances: Broker[] = [];
  static clients = new Map<string, Broker>();
  static signals: Signal[] = [];
  static latestOpened = '';
  static deliveringTo?: string;
  static legacySlot?: 0 | 1;
  static isLegacy(id: string) {
    return this.legacySlot !== undefined && id.endsWith(`_${this.legacySlot}`);
  }
  readonly id: string;
  readyState = 1;
  constructor(url: string) {
    super();
    Broker.instances.push(this);
    this.id = new URL(url).searchParams.get('id')!;
    queueMicrotask(() => {
      if (this.readyState !== 1) return;
      const taken = Broker.clients.has(this.id);
      if (!taken) {
        Broker.clients.set(this.id, this);
        Broker.latestOpened = this.id;
      }
      this.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify({type: taken ? 'ID-TAKEN' : 'OPEN'}),
        })
      );
    });
  }
  send(data: string) {
    const message = JSON.parse(data) as Signal;
    if (!message.dst) return;
    message.src = this.id;
    // An old build neither advertises nor echoes capability metadata.
    if (Broker.isLegacy(this.id) && message.payload)
      delete message.payload.metadata;
    Broker.signals.push(message);
    const destination = Broker.clients.get(message.dst);
    queueMicrotask(() => {
      if (destination?.readyState !== 1) return;
      const previous = Broker.deliveringTo;
      Broker.deliveringTo = destination.id;
      destination.dispatchEvent(
        new MessageEvent('message', {data: JSON.stringify(message)})
      );
      Broker.deliveringTo = previous;
    });
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    if (Broker.clients.get(this.id) === this) Broker.clients.delete(this.id);
    this.dispatchEvent(new Event('close'));
  }
}

const transports: WebRTCTransport[] = [];
const sessions: NetSession[] = [];
afterEach(() => {
  sessions.splice(0).forEach((session) => session.close());
  transports.splice(0).forEach((transport) => transport.close());
  Peer.instances = [];
  Peer.failUnreliable = false;
  Peer.deferReliableOpen = false;
  Broker.instances = [];
  Broker.clients.clear();
  Broker.signals = [];
  Broker.legacySlot = undefined;
  Broker.deliveringTo = undefined;
  Broker.latestOpened = '';
  vi.unstubAllGlobals();
});

async function pair(firstEnabled: boolean, secondEnabled: boolean) {
  vi.stubGlobal('WebSocket', Broker);
  vi.stubGlobal('RTCPeerConnection', Peer);
  const first = new WebRTCTransport({unreliableChannel: firstEnabled});
  const second = new WebRTCTransport({unreliableChannel: secondEnabled});
  transports.push(first, second);
  const errors = vi.fn();
  first.on('error', errors);
  second.on('error', errors);
  await first.connect({roomId: 'negotiation'});
  await second.connect({roomId: 'negotiation'});
  await vi.waitFor(() => {
    expect(first.remotePeerIds.has(second.localPeerId)).toBe(true);
    expect(second.remotePeerIds.has(first.localPeerId)).toBe(true);
  });
  const firstPeer = Peer.instances.find(
    (peer) => peer.owner === first.localPeerId
  )!;
  const secondPeer = Peer.instances.find(
    (peer) => peer.owner === second.localPeerId
  )!;
  expect(errors).not.toHaveBeenCalled();
  return {first, second, firstPeer, secondPeer, errors};
}

async function reliableWorks(a: WebRTCTransport, b: WebRTCTransport) {
  // Drain any lossy sends queued by the preceding assertions.
  await Promise.resolve();
  const receivedA = vi.fn();
  const receivedB = vi.fn();
  a.on('message', receivedA);
  b.on('message', receivedB);
  a.send(new Uint8Array([1]), b.localPeerId);
  b.send(new Uint8Array([2]), a.localPeerId);
  await vi.waitFor(() => {
    expect(receivedA).toHaveBeenCalledOnce();
    expect(receivedB).toHaveBeenCalledOnce();
  });
  expect(receivedA.mock.calls[0][0].detail).toEqual({
    peerId: b.localPeerId,
    data: new Uint8Array([2]),
  });
  expect(receivedB.mock.calls[0][0].detail).toEqual({
    peerId: a.localPeerId,
    data: new Uint8Array([1]),
  });
  a.off('message', receivedA);
  b.off('message', receivedB);
}

describe('WebRTC unreliable negotiation', () => {
  it.each([false, true])(
    'negotiates a bidirectional lane with reliable open deferred=%s',
    async (deferred) => {
      Peer.deferReliableOpen = deferred;
      const s = await pair(true, true);
      await vi.waitFor(() => expect(s.secondPeer.created).toHaveLength(2));
      expect(s.secondPeer.createCalls).toEqual([
        'netblocks',
        'netblocks-unreliable',
      ]);
      expect(s.firstPeer.createCalls).toEqual([]);
      for (const type of ['OFFER', 'ANSWER'])
        expect(
          Broker.signals.find((signal) => signal.type === type)?.payload
            ?.metadata
        ).toEqual({netblocks: {unreliableChannel: 1}});
      const incoming = vi.fn();
      s.first.on('message', incoming);
      s.second.on('message', incoming);
      expect(
        s.first.sendUnreliable(new Uint8Array([3]), s.second.localPeerId)
      ).toBe(true);
      expect(
        s.second.sendUnreliable(new Uint8Array([4]), s.first.localPeerId)
      ).toBe(true);
      await vi.waitFor(() => expect(incoming).toHaveBeenCalledTimes(2));
      for (const [event] of incoming.mock.calls)
        expect(event.detail.delivery).toBe('unreliable');
      s.first.off('message', incoming);
      s.second.off('message', incoming);
      const lane = s.secondPeer.created[1];
      expect(lane.options).toEqual({ordered: false, maxRetransmits: 0});
      lane.close();
      expect(s.first.remotePeerIds.size).toBe(1);
      expect(s.second.remotePeerIds.size).toBe(1);
      expect(
        s.second.sendUnreliable(new Uint8Array([5]), s.first.localPeerId)
      ).toBe(false);
      await reliableWorks(s.first, s.second);
    }
  );

  it.each([
    [true, false],
    [false, true],
    [false, false],
  ])(
    'keeps reliable-only delivery for responder=%s, offerer=%s',
    async (first, second) => {
      const s = await pair(first, second);
      expect(s.secondPeer.created).toHaveLength(1);
      expect(
        Broker.signals.find((signal) => signal.type === 'ANSWER')?.payload
          ?.metadata
      ).toEqual({netblocks: {unreliableChannel: 0}});
      expect(
        s.first.sendUnreliable(new Uint8Array([1]), s.second.localPeerId)
      ).toBe(false);
      expect(
        s.second.sendUnreliable(new Uint8Array([1]), s.first.localPeerId)
      ).toBe(false);
      await reliableWorks(s.first, s.second);
    }
  );

  it.each([0, 1] as const)(
    'never exposes a second channel to an old-style peer in slot %s',
    async (legacySlot) => {
      Broker.legacySlot = legacySlot;
      const s = await pair(legacySlot !== 0, legacySlot !== 1);
      const legacy = legacySlot === 0 ? s.firstPeer : s.secondPeer;
      expect(s.secondPeer.created).toHaveLength(1);
      if (legacySlot === 0) expect(legacy.legacyMain?.label).toBe('netblocks');
      const legacySignal = Broker.signals.find(
        (signal) => signal.src === legacy.owner
      );
      expect(legacySignal?.payload?.metadata).toBeUndefined();
      expect(legacy.connectionState).toBe('connected');
      await reliableWorks(s.first, s.second);
    }
  );

  it.each([false, true])(
    'rejects an unnegotiated incoming channel with local opt-in=%s',
    async (enabled) => {
      const s = await pair(enabled, false);
      const unsolicited = s.secondPeer.createDataChannel(
        'netblocks-unreliable',
        {ordered: false, maxRetransmits: 0}
      );
      await vi.waitFor(() => expect(unsolicited.readyState).toBe('closed'));
      expect(
        s.first.sendUnreliable(new Uint8Array([1]), s.second.localPeerId)
      ).toBe(false);
      expect(s.firstPeer.connectionState).toBe('connected');
      await reliableWorks(s.first, s.second);
    }
  );

  it('isolates a second createDataChannel failure and does not retry on duplicate answers', async () => {
    Peer.failUnreliable = true;
    const s = await pair(true, true);
    await vi.waitFor(() => expect(s.secondPeer.createCalls).toHaveLength(2));
    expect(s.secondPeer.created).toHaveLength(1);
    expect(
      s.second.sendUnreliable(new Uint8Array([1]), s.first.localPeerId)
    ).toBe(false);
    expect(s.errors).not.toHaveBeenCalled();
    const answer = Broker.signals.find((signal) => signal.type === 'ANSWER')!;
    Broker.clients
      .get(s.second.localPeerId)!
      .dispatchEvent(
        new MessageEvent('message', {data: JSON.stringify(answer)})
      );
    await reliableWorks(s.first, s.second);
    expect(s.secondPeer.createCalls).toHaveLength(2);
  });

  it('caps messages, includes the new message in the buffer budget, and honors the negotiated SCTP maximum', async () => {
    const s = await pair(true, true);
    await vi.waitFor(() => expect(s.secondPeer.created).toHaveLength(2));
    const lane = s.secondPeer.created[1];
    const target = s.first.localPeerId;
    expect(s.second.sendUnreliable(new Uint8Array(1201), target)).toBe(false);
    expect(lane.send).not.toHaveBeenCalled();
    lane.bufferedAmount = 16384 - 100;
    expect(s.second.sendUnreliable(new Uint8Array(101), target)).toBe(false);
    expect(s.second.sendUnreliable(new Uint8Array(100), target)).toBe(true);
    lane.bufferedAmount = 0;
    s.secondPeer.sctp = {maxMessageSize: 256};
    expect(s.second.sendUnreliable(new Uint8Array(257), target)).toBe(false);
    expect(s.second.sendUnreliable(new Uint8Array(256), target)).toBe(true);
    for (const maximum of [0, Infinity, 65536]) {
      s.secondPeer.sctp.maxMessageSize = maximum;
      expect(s.second.sendUnreliable(new Uint8Array(1200), target)).toBe(true);
      expect(s.second.sendUnreliable(new Uint8Array(1201), target)).toBe(false);
    }
    s.secondPeer.sctp = null;
    expect(s.second.sendUnreliable(new Uint8Array(1200), target)).toBe(true);
    lane.send.mockImplementationOnce(() => {
      throw new Error('Send failed');
    });
    expect(s.second.sendUnreliable(new Uint8Array([1]), target)).toBe(false);
    await reliableWorks(s.first, s.second);
  });

  it('can cancel a pending broker claim without creating replacement sockets', async () => {
    class PendingBroker extends Broker {
      constructor(url: string) {
        super(url);
        this.readyState = 0;
      }
    }
    vi.stubGlobal('WebSocket', PendingBroker);
    const transport = new WebRTCTransport();
    transports.push(transport);
    const pending = transport.connect({roomId: 'cancel'});
    transport.close();
    await expect(pending).rejects.toThrow('cancelled');
    expect(Broker.instances).toHaveLength(1);
    expect(Broker.instances[0].readyState).toBe(3);
  });

  it.each(['open', 'creation-failed', 'legacy'] as const)(
    'preserves session catch-up, stale-state rejection and rejoin with optional lane %s',
    async (mode) => {
      vi.stubGlobal('WebSocket', Broker);
      vi.stubGlobal('RTCPeerConnection', Peer);
      Peer.failUnreliable = mode === 'creation-failed';
      if (mode === 'legacy') Broker.legacySlot = 1;
      const createSession = (enabled: boolean) => {
        const transport = new WebRTCTransport({unreliableChannel: enabled});
        const session = new NetSession(transport, new THREE.Group());
        transports.push(transport);
        sessions.push(session);
        const objects = Array.from(
          {length: 140},
          (_, i) => new NetObject({id: `cube-${i}`})
        );
        objects.forEach((object) => session.netObjects.add(object));
        return {transport, session, objects};
      };
      const host = createSession(true);
      await host.session.open('catch-up');
      host.objects.forEach((object, i) => {
        object.position.set(i + 1, 2, 3);
        object.snapToXform(object.toXform());
        host.session.claim(object);
      });
      const joiner = createSession(mode !== 'legacy');
      const snapshots: Uint8Array[] = [];
      joiner.transport.on('message', (event) => {
        if (decodeMessage(event.detail.data).type === 'netobject.snapshot') {
          expect(event.detail.delivery).toBeUndefined();
          snapshots.push(event.detail.data);
        }
      });
      await joiner.session.open('catch-up');
      await vi.waitFor(() =>
        expect(joiner.transport.remotePeerIds.size).toBe(1)
      );
      await vi.waitFor(() => {
        expect(snapshots.length).toBeGreaterThan(0);
        expect(joiner.objects.map((object) => object.position.x)).toEqual(
          host.objects.map((object) => object.position.x)
        );
      });
      // A reliable catch-up snapshot must bypass BOTH lossy message/buffer caps.
      expect(snapshots[0].byteLength).toBeGreaterThan(16384);
      const peer = Peer.instances.find(
        (peer) => peer.owner === joiner.transport.localPeerId
      )!;
      if (mode === 'open') {
        await vi.waitFor(() => expect(peer.created).toHaveLength(2));
        peer.created[1].close();
      }
      expect(host.session.users.size).toBe(1);
      const object = host.objects[0];
      host.session.release(object);
      host.session.claim(object);
      object.position.x = 777;
      host.session.release(object);
      await vi.waitFor(() =>
        expect(joiner.objects[0]._targetPosition.x).toBe(777)
      );
      // An older catch-up snapshot arriving after a newer claim/release cannot
      // roll the joiner back. A subsequent RPC proves the queue has drained.
      const barrier = vi.fn();
      joiner.session.events.on('barrier', barrier);
      host.transport.send(snapshots[0], joiner.transport.localPeerId);
      host.session.events.emitTo(joiner.transport.localPeerId, 'barrier', null);
      await vi.waitFor(() => expect(barrier).toHaveBeenCalledOnce());
      expect(joiner.objects[0].claim?.counter).toBe(2);
      expect(joiner.objects[0].ownerId).toBe('');
      expect(joiner.objects[0]._targetPosition.x).toBe(777);

      joiner.session.close();
      await vi.waitFor(() => expect(host.session.users.size).toBe(0));
      object.position.x = 999;
      const rejoined = createSession(mode !== 'legacy');
      await rejoined.session.open('catch-up');
      await vi.waitFor(() => {
        expect(rejoined.objects.map((object) => object.position.x)).toEqual(
          host.objects.map((object) => object.position.x)
        );
        expect(rejoined.objects[0].claim?.counter).toBe(2);
        expect(host.session.users.size).toBe(1);
      });
      for (const pc of Peer.instances) {
        const lane = pc.channels.find(
          (channel) => channel.label === 'netblocks-unreliable'
        );
        expect(lane?.send.mock.calls.length ?? 0).toBe(0);
      }
    }
  );
});
