import {webcrypto} from 'node:crypto';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  Transport,
  type TransportConnectOptions,
} from '../netblocks/src/core/transport/Transport';
import {
  PhoneLink,
  createPhonePairing,
  phonePairingFromCode,
  type PhoneConnectionState,
} from './PhoneLink';
import {PhoneControllerPage} from './PhoneControllerPage';
import type {PhoneMessage} from './protocol';
import {SessionCrypto} from './SessionCrypto';
import {WebRTCTransport} from '../netblocks/src/core/transport/WebRTCTransport';

vi.stubGlobal('crypto', webcrypto);

class Network {
  nodes: Wire[] = [];
  block?: (from: Wire, bytes: Uint8Array) => boolean;
  create = () => {
    const node = new Wire(this, `peer-${this.nodes.length}`);
    this.nodes.push(node);
    return node;
  };
}
class Wire extends Transport {
  name = 'security-test';
  isOpen = false;
  roomId = '';
  remotePeerIds = new Set<string>();
  sent: Array<{peer: string; bytes: Uint8Array}> = [];
  override get supportsUnreliable() {
    return true;
  }
  constructor(
    private network: Network,
    readonly localPeerId: string
  ) {
    super();
  }
  async connect(options: TransportConnectOptions) {
    this.roomId = options.roomId;
    this.isOpen = true;
    for (const peer of this.network.nodes)
      if (peer !== this && peer.isOpen && peer.roomId === this.roomId) {
        this.join(peer);
        peer.join(this);
      }
  }
  join(peer: Wire) {
    this.remotePeerIds.add(peer.localPeerId);
    this.emitPeerJoin(peer.localPeerId);
  }
  leave(peer: Wire) {
    if (this.remotePeerIds.delete(peer.localPeerId))
      this.emitPeerLeave(peer.localPeerId);
  }
  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    for (const peer of this.network.nodes) {
      peer.leave(this);
      this.leave(peer);
    }
    this.dispatchEvent(new Event('close'));
  }
  error(message: string) {
    const error = new Error(message);
    this.emitError(error);
    return error;
  }
  inject(peer: string, bytes: Uint8Array) {
    this.emitMessage(peer, bytes);
  }
  send(bytes: Uint8Array, peer: string) {
    this.sent.push({peer, bytes});
    if (this.network.block?.(this, bytes)) return;
    const receiver = this.network.nodes.find(
      (node) => node.localPeerId === peer && node.isOpen
    );
    if (receiver && this.isOpen)
      queueMicrotask(() => receiver.inject(this.localPeerId, bytes));
  }
  override sendUnreliable(bytes: Uint8Array, peer: string) {
    this.send(bytes, peer);
    return true;
  }
  packets(type: string) {
    return this.sent
      .map(
        ({bytes}) =>
          JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>
      )
      .filter((packet) => packet.type === type);
  }
  raw(peer: string, packet: object) {
    this.send(new TextEncoder().encode(JSON.stringify(packet)), peer);
  }
}

// Real PhoneLink/WebRTC capability dispatch with a deterministic wire instead
// of browser sockets. Used to exercise timer-driven signaling decisions.
class SignalingWire extends WebRTCTransport {
  constructor(readonly wire: Wire) {
    super({unreliableChannel: true});
    for (const type of [
      'message',
      'peer-join',
      'peer-leave',
      'close',
      'error',
    ] as const)
      wire.on(type, (event) =>
        this.dispatchEvent(new CustomEvent(type, {detail: event.detail}))
      );
  }
  override get localPeerId() {
    return this.wire.localPeerId;
  }
  override get remotePeerIds() {
    return this.wire.remotePeerIds;
  }
  override get isOpen() {
    return this.wire.isOpen;
  }
  override get isSignalingOpen() {
    return true;
  }
  override reconnectSignaling = vi.fn(async () => {});
  override discoverPeers = vi.fn(() => {});
  override dropPeer = vi.fn((peerId: string) => {
    if (this.wire.remotePeerIds.delete(peerId))
      this.wire.dispatchEvent(
        new CustomEvent('peer-leave', {detail: {peerId}})
      );
  });
  override connect(options: TransportConnectOptions) {
    return this.wire.connect(options);
  }
  override send(bytes: Uint8Array, peer: string) {
    this.wire.send(bytes, peer);
  }
  override sendUnreliable(bytes: Uint8Array, peer: string) {
    return this.wire.sendUnreliable(bytes, peer);
  }
  override close() {
    this.wire.close();
  }
}

const dispose: Array<() => void> = [];
afterEach(() => {
  dispose
    .splice(0)
    .reverse()
    .forEach((fn) => fn());
  vi.restoreAllMocks();
  vi.useRealTimers();
});
const settle = (assertion: () => void) =>
  vi.waitFor(assertion, {timeout: 4000, interval: 10});

async function pair({
  page = false,
  factory: allowFactory = true,
  phoneFactory = allowFactory,
  approve = true,
  signaling = false,
  crowded = false,
  activationMessages = [] as PhoneMessage[],
}: {
  page?: boolean;
  factory?: boolean;
  phoneFactory?: boolean;
  approve?: boolean;
  signaling?: boolean;
  crowded?: boolean;
  activationMessages?: PhoneMessage[];
} = {}) {
  const network = new Network();
  const invitation = createPhonePairing();
  const hostWire = network.create(),
    phoneWire = network.create();
  const hostErrors = vi.fn(),
    phoneErrors = vi.fn();
  const states: PhoneConnectionState[] = [],
    hostStates: PhoneConnectionState[] = [],
    received: PhoneMessage[] = [];
  const hostTransport = signaling ? new SignalingWire(hostWire) : hostWire;
  const phoneTransport = signaling ? new SignalingWire(phoneWire) : phoneWire;
  const create = () =>
    signaling ? new SignalingWire(network.create()) : network.create();
  const host = new PhoneLink(
    'host',
    invitation,
    {
      transport: hostTransport,
      transportFactory: allowFactory ? create : undefined,
      onError: hostErrors,
      onStateChange: (state) => hostStates.push(state),
    },
    () => {},
    (connected) => {
      if (connected)
        for (const message of activationMessages) host.send(message);
    }
  );
  const root = document.createElement('div');
  document.body.append(root);
  const options = {
    pairing: phonePairingFromCode(invitation.code!),
    transport: phoneTransport,
    transportFactory: phoneFactory ? create : undefined,
    onError: phoneErrors,
    onStateChange: (state: PhoneConnectionState) => states.push(state),
  };
  const phone = page
    ? new PhoneControllerPage(root, options)
    : new PhoneLink(
        'phone',
        options.pairing,
        options,
        (message) => received.push(message),
        () => {}
      );
  dispose.push(() => {
    host.close();
    if (phone instanceof PhoneLink) phone.close();
    else phone.dispose();
    root.remove();
  });
  await host.connect();
  if (crowded) {
    for (let i = 0; i < 40; i++) {
      const idle = network.create();
      await idle.connect({roomId: hostWire.roomId});
      if (i < 32)
        hostWire.inject(
          idle.localPeerId,
          new TextEncoder().encode('{"v":2,"type":"garbage"}')
        );
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  await phone.connect();
  await settle(() => expect(host.pendingPhone).toBeDefined());
  const request = host.pendingPhone!;
  const confirm = async () => {
    if (phone instanceof PhoneLink) {
      await phone.confirmNumbers(request.id);
    } else
      root
        .firstElementChild!.shadowRoot!.querySelector<HTMLButtonElement>(
          '#numbers-match'
        )!
        .click();
  };
  if (approve) {
    await confirm();
    await host.accept(request.id);
    await settle(() => expect(phone.connected && host.connected).toBe(true));
  }
  return {
    network,
    host,
    phone,
    hostWire,
    phoneWire,
    request,
    root,
    received,
    states,
    hostErrors,
    phoneErrors,
    confirm,
    hostStates,
    hostTransport,
    phoneTransport,
  };
}

async function delivered(phone: PhoneLink) {
  await Promise.resolve();
  await (phone as unknown as {inbound: {reliable: Promise<void>}}).inbound
    .reliable;
}

describe('Membership-scoped recovery budgets', () => {
  it.each(['headset', 'phone'] as const)(
    're-authenticates a new %s peer ID while another peer floods the receiver',
    async (moving) => {
      const s = await pair({
        factory: moving === 'headset',
        phoneFactory: moving === 'phone',
      });
      const attacker = s.network.create();
      await attacker.connect({roomId: s.hostWire.roomId});
      const receiver = moving === 'headset' ? s.phoneWire : s.hostWire;
      const oldSender = moving === 'headset' ? s.hostWire : s.phoneWire;
      const id = (s.host as unknown as {session: {crypto: {id: string}}})
        .session.crypto.id;
      const junk = new TextEncoder().encode(
        JSON.stringify(
          moving === 'headset'
            ? {
                v: 2,
                type: 'host-presence',
                id,
                nonce: 'A'.repeat(43),
                resumeProof: 'A'.repeat(43),
              }
            : {v: 2, type: 'resume', id, phoneNonce: 'A'.repeat(43)}
        )
      );
      let flooded = 0;
      s.network.block = (from) => {
        if (from !== receiver && from !== attacker) {
          for (let i = 0; i < 100; i++)
            receiver.inject(attacker.localPeerId, junk);
          flooded++;
        }
        return false;
      };
      oldSender.close();
      await settle(() =>
        expect(s.phone.connected && s.host.connected).toBe(true)
      );
      const link = (moving === 'headset' ? s.host : s.phone) as unknown as {
        transport: Wire;
      };
      expect(link.transport.localPeerId).not.toBe(oldSender.localPeerId);
      expect(flooded).toBeGreaterThan(0);
    }
  );

  it('bounds membership budgets and retires them on leave rather than retaining peer-ID history', async () => {
    const s = await pair({factory: false});
    const junk = new TextEncoder().encode(
      JSON.stringify({v: 2, type: 'garbage'})
    );
    const peers: Wire[] = [];
    for (let i = 0; i < 40; i++) {
      const peer = s.network.create();
      peers.push(peer);
      await peer.connect({roomId: s.hostWire.roomId});
      s.hostWire.inject(peer.localPeerId, junk);
    }
    const state = s.host as unknown as {
      memberships: Map<string, number>;
      peerBudgets: Map<number, unknown>;
    };
    expect(state.peerBudgets).toBeInstanceOf(Map);
    expect(state.peerBudgets.size).toBeLessThanOrEqual(32);
    const oldMembership = state.memberships.get(peers[0].localPeerId)!;
    expect(state.peerBudgets.has(oldMembership)).toBe(true);
    s.hostWire.leave(peers[0]);
    expect(state.peerBudgets.has(oldMembership)).toBe(false);
    s.hostWire.join(peers[0]);
    s.hostWire.inject(peers[0].localPeerId, junk);
    const nextMembership = state.memberships.get(peers[0].localPeerId)!;
    expect(nextMembership).not.toBe(oldMembership);
    expect(state.peerBudgets.has(nextMembership)).toBe(true);
    expect(state.peerBudgets.size).toBeLessThanOrEqual(32);
  });
});

describe('Third-pass recovery boundaries', () => {
  it.each(['phone', 'headset'] as const)(
    'drops a same-ID impostor after a bounded re-authentication wait on the %s',
    async (side) => {
      const s = await pair({signaling: true});
      const wire = side === 'phone' ? s.phoneWire : s.hostWire;
      const other = side === 'phone' ? s.hostWire : s.phoneWire;
      const transport = (
        side === 'phone' ? s.phoneTransport : s.hostTransport
      ) as SignalingWire;
      const link = (side === 'phone' ? s.phone : s.host) as PhoneLink;
      const tick = () => (link as unknown as {tick(): void}).tick();
      s.network.block = () => true;
      wire.leave(other);
      other.leave(wire);
      wire.join(other);
      other.join(wire);
      const unrelated = s.network.create();
      await unrelated.connect({roomId: wire.roomId});
      vi.useFakeTimers({toFake: ['Date']});
      const start = Date.now();
      tick();
      vi.setSystemTime(start + 9999);
      tick();
      expect(transport.dropPeer).not.toHaveBeenCalled();
      // Repeated joins or unauthenticated traffic must not extend the deadline.
      wire.join(other);
      wire.inject(
        other.localPeerId,
        new TextEncoder().encode('{"v":2,"type":"garbage"}')
      );
      vi.setSystemTime(start + 10001);
      tick();
      expect(transport.dropPeer).toHaveBeenCalledExactlyOnceWith(
        other.localPeerId
      );
      expect(wire.remotePeerIds.has(unrelated.localPeerId)).toBe(true);
      expect(transport.discoverPeers).toHaveBeenCalled();
      s.network.block = undefined;
      wire.join(other);
      other.leave(wire);
      other.join(wire);
      await settle(() =>
        expect(s.phone.connected && s.host.connected).toBe(true)
      );
      transport.dropPeer.mockClear();
      // An authenticated membership must not inherit the expired timeout.
      vi.setSystemTime(start + 20002);
      s.host.send({type: 'ping'});
      (s.phone as PhoneLink).send({type: 'ping'});
      await settle(() =>
        expect(
          (link as unknown as {lastSeen: number}).lastSeen
        ).toBeGreaterThanOrEqual(start + 20002)
      );
      tick();
      expect(transport.dropPeer).not.toHaveBeenCalled();
      expect(link.connected).toBe(true);
    }
  );

  it('does not decode large packets from a code-knowing chosen headset before local confirmation', async () => {
    const s = await pair({factory: false, approve: false});
    const junk = new TextEncoder().encode(
      JSON.stringify({v: 2, type: 'garbage', padding: 'x'.repeat(90000)})
    );
    const before = vi.spyOn(TextDecoder.prototype, 'decode');
    s.phoneWire.inject(s.hostWire.localPeerId, junk);
    expect(before).not.toHaveBeenCalled();
    before.mockRestore();
    await s.host.accept(s.request.id);
    await delivered(s.phone as PhoneLink);
    const after = vi.spyOn(TextDecoder.prototype, 'decode');
    s.phoneWire.inject(s.hostWire.localPeerId, junk);
    expect(after).not.toHaveBeenCalled();
    expect(s.phone.connected).toBe(false);
  });
});

describe('Second-pass security and recovery regressions', () => {
  it('ignores an approval delivered after the invitation deadline', async () => {
    const s = await pair({approve: false, factory: false});
    s.network.block = (from, bytes) =>
      from === s.hostWire &&
      JSON.parse(new TextDecoder().decode(bytes)).type === 'approved';
    await s.host.accept(s.request.id);
    const approved = s.hostWire.packets('approved').at(-1)!;
    vi.useFakeTimers({toFake: ['Date']});
    vi.setSystemTime(Date.now() + 91000);
    s.network.block = undefined;
    s.hostWire.raw(s.phoneWire.localPeerId, approved);
    await delivered(s.phone as PhoneLink);
    expect(await (s.phone as PhoneLink).confirmNumbers(s.request.id)).toBe(
      false
    );
    expect(s.phone.connected).toBe(false);
  });

  it('closes a pending standby when the session recovers on its old transport', async () => {
    const s = await pair({factory: false, phoneFactory: true});
    const create = s.network.create;
    let finish!: () => Promise<void>;
    vi.spyOn(s.network, 'create').mockImplementation(() => {
      const wire = create();
      const connect = wire.connect.bind(wire);
      wire.connect = (options) =>
        new Promise<void>((resolve) => {
          finish = async () => {
            await connect(options);
            resolve();
          };
        });
      return wire;
    });
    s.phoneWire.error('Signaling channel closed.');
    await settle(() => expect(finish).toBeDefined());
    const standby = s.network.nodes.at(-1)!;
    s.hostWire.leave(s.phoneWire);
    s.phoneWire.leave(s.hostWire);
    s.hostWire.join(s.phoneWire);
    s.phoneWire.join(s.hostWire);
    await settle(() =>
      expect(s.phone.connected && s.host.connected).toBe(true)
    );
    await finish();
    await delivered(s.phone as PhoneLink);
    await settle(() => expect(standby.isOpen).toBe(false));
    expect((s.phone as unknown as {needsRecovery: boolean}).needsRecovery).toBe(
      false
    );
    expect(s.hostWire.remotePeerIds).toEqual(
      new Set([s.phoneWire.localPeerId])
    );
  });
});

describe('Phone pairing and recovery security regressions', () => {
  it('repairs headset signaling in the background without dropping its healthy data channel', async () => {
    const s = await pair();
    s.hostWire.error('Signaling channel closed.');
    expect(s.host.connected && s.phone.connected).toBe(true);
    await settle(() => expect(s.network.nodes.length).toBeGreaterThan(2));
    expect(s.hostWire.isOpen).toBe(true);
    s.hostWire.close();
    await settle(() =>
      expect(s.host.connected && s.phone.connected).toBe(true)
    );
    expect(s.host.pendingPhone).toBeUndefined();
  });

  it('limits unidentified senders before decoding or parsing their packets', async () => {
    const s = await pair();
    const attacker = s.network.create();
    await attacker.connect({roomId: s.hostWire.roomId});
    const small = new TextEncoder().encode(
      JSON.stringify({v: 2, type: 'garbage', padding: 'x'.repeat(1000)})
    );
    const huge = new TextEncoder().encode(
      JSON.stringify({v: 2, type: 'garbage', padding: 'x'.repeat(90000)})
    );
    const decode = vi.spyOn(TextDecoder.prototype, 'decode');
    const parse = vi.spyOn(JSON, 'parse');
    for (let i = 0; i < 100; i++) s.hostWire.inject(attacker.localPeerId, huge);
    expect(decode).not.toHaveBeenCalled();
    expect(parse).not.toHaveBeenCalled();
    for (let i = 0; i < 100; i++)
      s.hostWire.inject(attacker.localPeerId, small);
    expect(decode.mock.calls.length).toBeLessThanOrEqual(30);
    expect(parse.mock.calls.length).toBeLessThanOrEqual(30);
  });

  it('does not trust an impostor headset approval until the phone user confirms the number', async () => {
    // This host can legitimately prove knowledge of the short pairing code,
    // exactly like another room peer impersonating the intended headset.
    const s = await pair({approve: false});
    await s.host.accept(s.request.id);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(s.phone.connected).toBe(false);
    const candidate = (
      s.host as unknown as {
        candidate: {
          transcript: string;
          approval: {crypto: SessionCrypto; epoch: string};
        };
      }
    ).candidate;
    const {crypto: keys, epoch} = candidate.approval;
    s.hostWire.raw(s.phoneWire.localPeerId, {
      v: 2,
      type: 'paired',
      id: keys.id,
      epoch,
      proof: await keys.prove(
        JSON.stringify(['paired', candidate.transcript, epoch])
      ),
    });
    const encrypted = await keys.encrypt(
      'host',
      JSON.stringify([keys.id, epoch, 'host', 'reliable', 1]),
      {type: 'field', field: {id: 1, revision: 1, label: 'Fake password field'}}
    );
    s.hostWire.raw(s.phoneWire.localPeerId, {
      v: 2,
      type: 'data',
      id: keys.id,
      epoch,
      lane: 'reliable',
      seq: 1,
      ...encrypted,
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(s.received).toEqual([]);
    expect(s.phone.connected).toBe(false);
    await s.confirm();
    await settle(() =>
      expect(s.phone.connected && s.host.connected).toBe(true)
    );
  });

  it('rejects a recorded resume on the phone, then accepts a fresh two-nonce exchange', async () => {
    const s = await pair({factory: false});
    const rejoin = () => {
      s.hostWire.leave(s.phoneWire);
      s.phoneWire.leave(s.hostWire);
      s.hostWire.join(s.phoneWire);
      s.phoneWire.join(s.hostWire);
    };
    rejoin();
    await settle(() =>
      expect(s.phone.connected && s.host.connected).toBe(true)
    );
    const challenge = s.hostWire.packets('resume-challenge').at(-1)!;
    const accepted = s.hostWire.packets('resumed').at(-1)!;
    const previousRequests = s.phoneWire.packets('resume').length;
    s.network.block = (from, bytes) =>
      from === s.phoneWire &&
      ['resume', 'resume-proof'].includes(
        JSON.parse(new TextDecoder().decode(bytes)).type
      );
    rejoin();
    await settle(() =>
      expect(s.phoneWire.packets('resume').length).toBeGreaterThan(
        previousRequests
      )
    );
    s.hostWire.raw(s.phoneWire.localPeerId, challenge);
    s.hostWire.raw(s.phoneWire.localPeerId, accepted);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(s.phone.connected).toBe(false);
    s.network.block = undefined;
    await settle(() =>
      expect(s.phone.connected && s.host.connected).toBe(true)
    );
    const fresh = s.hostWire.packets('resumed').at(-1)!;
    expect(fresh.phoneNonce).not.toBe(accepted.phoneNonce);
    expect(fresh.hostNonce).not.toBe(accepted.hostNonce);
  });
});
