import {afterEach, describe, expect, it, vi} from 'vitest';
import {WebRTCTransport} from './WebRTCTransport';

class Channel extends EventTarget {
  label = 'netblocks';
  readyState = 'connecting';
  binaryType = '';
  ordered = true;
  maxRetransmits = null;
  maxPacketLifeTime = null;
  send = vi.fn();
  open() {
    this.readyState = 'open';
    this.dispatchEvent(new Event('open'));
  }
  close() {
    if (this.readyState !== 'closed') {
      this.readyState = 'closed';
      this.dispatchEvent(new Event('close'));
    }
  }
}
class Peer extends EventTarget {
  static instances: Peer[] = [];
  channel = new Channel();
  constructor() {
    super();
    Peer.instances.push(this);
  }
  createDataChannel() {
    return this.channel;
  }
  async createOffer() {
    return {type: 'offer', sdp: 'test'};
  }
  async setLocalDescription() {}
  close = vi.fn();
}
class Broker extends EventTarget {
  static OPEN = 1;
  static instances: Broker[] = [];
  static rejectNext = false;
  static pending = false;
  readyState = 1;
  readonly id: string;
  send = vi.fn();
  constructor(url: string) {
    super();
    this.id = new URL(url).searchParams.get('id')!;
    Broker.instances.push(this);
    queueMicrotask(() => {
      if (this.readyState !== 1 || Broker.pending) return;
      const reject = this.id.endsWith('_0') || Broker.rejectNext;
      Broker.rejectNext = false;
      this.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify({type: reject ? 'ID-TAKEN' : 'OPEN'}),
        })
      );
    });
  }
  close() {
    if (this.readyState !== 3) {
      this.readyState = 3;
      this.dispatchEvent(new Event('close'));
    }
  }
}
let transport: WebRTCTransport;
afterEach(() => {
  transport?.close();
  Broker.instances = [];
  Broker.rejectNext = false;
  Broker.pending = false;
  Peer.instances = [];
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
async function connect() {
  vi.stubGlobal('WebSocket', Broker);
  vi.stubGlobal('RTCPeerConnection', Peer);
  transport = new WebRTCTransport();
  await transport.connect({roomId: 'signaling-recovery'});
  await vi.waitFor(() => expect(Peer.instances).toHaveLength(1));
  const peer = Peer.instances[0];
  peer.channel.open();
  return peer;
}
describe('WebRTC signaling-only recovery', () => {
  it('honors a second real departure immediately after the first recovery', async () => {
    const peer = await connect();
    peer.channel.close();
    transport.discoverPeers();
    await vi.waitFor(() => expect(Peer.instances).toHaveLength(2));
    Peer.instances[1].channel.open();
    Peer.instances[1].channel.close();
    transport.discoverPeers();
    await vi.waitFor(() => expect(Peer.instances).toHaveLength(3));
  });
  it('can explicitly discover once after peer loss without resetting idle backoff', async () => {
    vi.useFakeTimers({
      toFake: [
        'Date',
        'performance',
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
      ],
    });
    const peer = await connect();
    await vi.advanceTimersByTimeAsync(32000);
    const state = transport as unknown as {_discoveryIntervalMs: number};
    expect(state._discoveryIntervalMs).toBe(30000);
    peer.channel.close();
    const sockets = Broker.instances.length;
    transport.discoverPeers();
    transport.discoverPeers();
    transport.discoverPeers();
    await vi.waitFor(() => expect(Peer.instances).toHaveLength(2));
    expect(Broker.instances).toHaveLength(sockets + 1);
    expect(state._discoveryIntervalMs).toBe(30000);
  });
  it('leaves ordinary discovery/backoff alone while signaling is open even if a data peer is gone', async () => {
    const peer = await connect();
    peer.channel.close();
    const sockets = Broker.instances.length;
    expect(transport.isSignalingOpen).toBe(true);
    for (let i = 0; i < 20; i++) await transport.reconnectSignaling();
    expect(Broker.instances).toHaveLength(sockets);
    expect(Peer.instances).toHaveLength(1);
  });
  it('coalesces repeated broker repairs without closing/recreating healthy data channels', async () => {
    const peer = await connect();
    const id = transport.localPeerId;
    const remote = [...transport.remotePeerIds][0];
    for (let cycle = 0; cycle < 3; cycle++) {
      Broker.instances
        .findLast((socket) => socket.id === id && socket.readyState === 1)!
        .close();
      const count = Broker.instances.length;
      await Promise.all([
        transport.reconnectSignaling(),
        transport.reconnectSignaling(),
      ]);
      expect(Broker.instances).toHaveLength(count + 1);
      expect(Broker.instances.at(-1)!.id).toBe(id);
      expect(transport.remotePeerIds.has(remote)).toBe(true);
      transport.send(new Uint8Array([cycle]), remote);
    }
    expect(peer.channel.send).toHaveBeenCalledTimes(3);
    expect(peer.close).not.toHaveBeenCalled();
    expect(Peer.instances).toHaveLength(1);
  });
  it('leaves data usable if the broker slot is temporarily taken', async () => {
    const peer = await connect();
    Broker.instances
      .findLast(
        (socket) =>
          socket.id === transport.localPeerId && socket.readyState === 1
      )!
      .close();
    Broker.rejectNext = true;
    await expect(transport.reconnectSignaling()).rejects.toThrow('ID-TAKEN');
    expect(peer.channel.readyState).toBe('open');
    await transport.reconnectSignaling();
    expect(peer.close).not.toHaveBeenCalled();
  });
  it('cancels an in-flight reopen on disposal without reviving signaling', async () => {
    await connect();
    Broker.instances
      .findLast(
        (socket) =>
          socket.id === transport.localPeerId && socket.readyState === 1
      )!
      .close();
    Broker.pending = true;
    const pending = transport.reconnectSignaling();
    await Promise.resolve();
    transport.close();
    await expect(pending).rejects.toThrow();
    expect(Broker.instances.every((socket) => socket.readyState === 3)).toBe(
      true
    );
    await expect(transport.reconnectSignaling()).rejects.toThrow('not open');
  });
});
