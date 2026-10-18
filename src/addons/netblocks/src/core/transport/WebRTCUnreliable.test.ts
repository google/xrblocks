import {afterEach, describe, expect, it, vi} from 'vitest';
import {WebRTCTransport} from './WebRTCTransport';

class Channel extends EventTarget {
  readyState = 'connecting';
  bufferedAmount = 0;
  binaryType = '';
  send = vi.fn();
  constructor(
    readonly label: string,
    readonly options: RTCDataChannelInit
  ) {
    super();
  }
  open() {
    this.readyState = 'open';
    this.dispatchEvent(new Event('open'));
  }
  close() {
    if (this.readyState === 'closed') return;
    this.readyState = 'closed';
    this.dispatchEvent(new Event('close'));
  }
}
class Peer extends EventTarget {
  static instances: Peer[] = [];
  channels: Channel[] = [];
  constructor() {
    super();
    Peer.instances.push(this);
  }
  createDataChannel(label: string, options: RTCDataChannelInit) {
    const channel = new Channel(label, options);
    this.channels.push(channel);
    return channel;
  }
  async createOffer() {
    return {type: 'offer', sdp: 'test'};
  }
  async setLocalDescription() {}
  close() {
    for (const channel of this.channels) channel.close();
  }
}
class Broker extends EventTarget {
  static OPEN = 1;
  static instances: Broker[] = [];
  readyState = 1;
  send = vi.fn();
  constructor(url: string) {
    super();
    Broker.instances.push(this);
    queueMicrotask(() => {
      if (this.readyState !== 1) return;
      const id = new URL(url).searchParams.get('id')!;
      this.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify({type: id.endsWith('_0') ? 'ID-TAKEN' : 'OPEN'}),
        })
      );
    });
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.dispatchEvent(new Event('close'));
  }
}
let transport: WebRTCTransport | undefined;
afterEach(() => {
  transport?.close();
  transport = undefined;
  Peer.instances = [];
  Broker.instances = [];
  vi.unstubAllGlobals();
});

describe('WebRTC optional unreliable lane', () => {
  it('keeps the default transport reliable-only and never silently falls back', async () => {
    vi.stubGlobal('WebSocket', Broker);
    vi.stubGlobal('RTCPeerConnection', Peer);
    transport = new WebRTCTransport();
    await transport.connect({roomId: 'reliable-only'});
    await vi.waitFor(() => expect(Peer.instances[0]?.channels).toHaveLength(1));
    const reliable = Peer.instances[0].channels[0];
    reliable.open();
    expect(transport.supportsUnreliable).toBe(false);
    expect(
      transport.sendUnreliable(
        new Uint8Array([1]),
        [...transport.remotePeerIds][0]
      )
    ).toBe(false);
    expect(reliable.send).not.toHaveBeenCalled();
  });
  it('creates separate channels and keeps lossy delivery, backpressure and teardown isolated', async () => {
    vi.stubGlobal('WebSocket', Broker);
    vi.stubGlobal('RTCPeerConnection', Peer);
    transport = new WebRTCTransport({unreliableChannel: true});
    await transport.connect({roomId: 'unreliable-test'});
    await vi.waitFor(() => expect(Peer.instances[0]?.channels).toHaveLength(2));
    const [reliable, motion] = Peer.instances[0].channels;
    expect(reliable.options).toEqual({ordered: true});
    expect(motion.options).toEqual({ordered: false, maxRetransmits: 0});
    reliable.open();
    motion.open();
    const peer = [...transport.remotePeerIds][0];
    const payload = new Uint8Array([1, 2, 3]);
    transport.send(payload, peer);
    transport.sendUnreliable(payload, peer);
    expect(reliable.send).toHaveBeenCalledOnce();
    expect(motion.send).toHaveBeenCalledOnce();
    motion.bufferedAmount = 20000;
    expect(transport.sendUnreliable(payload, peer)).toBe(false);
    expect(reliable.send).toHaveBeenCalledOnce();
    const messages = vi.fn();
    transport.on('message', messages);
    motion.dispatchEvent(new MessageEvent('message', {data: payload.buffer}));
    expect(messages.mock.calls[0][0].detail).toMatchObject({
      peerId: peer,
      delivery: 'unreliable',
      data: payload,
    });
    reliable.close();
    expect(motion.readyState).toBe('closed');
    expect(transport.remotePeerIds.size).toBe(0);
  });

  it('can cancel a pending broker claim without creating replacement sockets', async () => {
    class PendingBroker extends Broker {
      constructor(url: string) {
        super(url);
        this.readyState = 0;
      }
    }
    vi.stubGlobal('WebSocket', PendingBroker);
    transport = new WebRTCTransport();
    const pending = transport.connect({roomId: 'cancel'});
    transport.close();
    await expect(pending).rejects.toThrow('cancelled');
    expect(Broker.instances).toHaveLength(1);
    expect(Broker.instances[0].readyState).toBe(3);
    expect(transport.isOpen).toBe(false);
  });
});
