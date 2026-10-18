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
  factory = true,
  phoneFactory = factory,
  approve = true,
  signaling = false,
  activationMessages = [] as PhoneMessage[],
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
      transportFactory: factory ? create : undefined,
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

describe('Third-pass recovery boundaries', () => {
  it('resumes with the chosen headset while other room peers continuously spend their own budget', async () => {
    const s = await pair({factory: false});
    const attacker = s.network.create();
    await attacker.connect({roomId: s.hostWire.roomId});
    const junk = new TextEncoder().encode(
      JSON.stringify({
        v: 2,
        type: 'host-presence',
        id: 'wrong-session',
        nonce: 'A'.repeat(43),
        resumeProof: 'A'.repeat(43),
      })
    );
    let floods = 0;
    s.network.block = (from) => {
      if (from === s.hostWire) {
        for (let i = 0; i < 100; i++)
          s.phoneWire.inject(attacker.localPeerId, junk);
        floods++;
      }
      return false;
    };
    s.hostWire.leave(s.phoneWire);
    s.phoneWire.leave(s.hostWire);
    s.hostWire.join(s.phoneWire);
    s.phoneWire.join(s.hostWire);
    await settle(() =>
      expect(s.phone.connected && s.host.connected).toBe(true)
    );
    expect(floods).toBeGreaterThanOrEqual(3);
  });

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

  it('finishes a timely phone confirmation when a frozen phone processes approval within the 30-second grace', async () => {
    const s = await pair({factory: false, approve: false});
    await s.confirm();
    (s.phone as PhoneLink).setForeground(false);
    s.network.block = (from, bytes) =>
      from === s.hostWire &&
      JSON.parse(new TextDecoder().decode(bytes)).type === 'approved';
    await s.host.accept(s.request.id);
    const approved = s.hostWire.packets('approved').at(-1)!;
    vi.useFakeTimers({toFake: ['Date']});
    vi.setSystemTime(Date.now() + 91000);
    (s.phone as PhoneLink).setForeground(true);
    (s.phone as unknown as {tick(): void}).tick();
    s.network.block = undefined;
    s.hostWire.raw(s.phoneWire.localPeerId, approved);
    await settle(() =>
      expect(s.phone.connected && s.host.connected).toBe(true)
    );
  });

  it('does not extend that frozen-phone grace beyond 30 seconds after the invitation deadline', async () => {
    const s = await pair({factory: false, approve: false});
    await s.confirm();
    s.network.block = (from, bytes) =>
      from === s.hostWire &&
      JSON.parse(new TextDecoder().decode(bytes)).type === 'approved';
    await s.host.accept(s.request.id);
    const approved = s.hostWire.packets('approved').at(-1)!;
    vi.useFakeTimers({toFake: ['Date']});
    vi.setSystemTime(Date.now() + 121000);
    s.network.block = undefined;
    s.hostWire.raw(s.phoneWire.localPeerId, approved);
    await delivered(s.phone as PhoneLink);
    expect(s.phone.connected).toBe(false);
    (s.phone as unknown as {tick(): void}).tick();
    expect(s.states.at(-1)).toEqual({type: 'failed', reason: 'expired'});
  });

  it('requests one opt-in discovery pass for an authenticated peer departure, not unrelated peers or retry ticks', async () => {
    const s = await pair({signaling: true});
    const other = s.network.create();
    await other.connect({roomId: s.hostWire.roomId});
    s.phoneWire.leave(other);
    expect(
      (s.phoneTransport as SignalingWire).discoverPeers
    ).not.toHaveBeenCalled();
    s.network.block = () => true;
    s.phoneWire.leave(s.hostWire);
    s.hostWire.leave(s.phoneWire);
    expect(
      (s.phoneTransport as SignalingWire).discoverPeers
    ).toHaveBeenCalledOnce();
    expect(
      (s.hostTransport as SignalingWire).discoverPeers
    ).toHaveBeenCalledOnce();
    for (let i = 0; i < 10; i++) (s.phone as unknown as {tick(): void}).tick();
    expect(
      (s.phoneTransport as SignalingWire).discoverPeers
    ).toHaveBeenCalledOnce();
    expect(
      (s.phoneTransport as SignalingWire).reconnectSignaling
    ).not.toHaveBeenCalled();
  });

  it('cleans its own failed standby even if data loss changed the generation during connect', async () => {
    const s = await pair({factory: false, phoneFactory: true});
    const create = s.network.create;
    let reject!: (error: Error) => void;
    const factory = vi
      .spyOn(s.network, 'create')
      .mockImplementationOnce(() => {
        const wire = create();
        wire.connect = () =>
          new Promise<void>((_resolve, fail) => {
            reject = fail;
          });
        return wire;
      })
      .mockImplementation(create);
    s.phoneWire.error('Signaling channel closed.');
    await settle(() => expect(reject).toBeDefined());
    const failed = s.network.nodes.at(-1)!;
    s.hostWire.leave(s.phoneWire);
    s.phoneWire.leave(s.hostWire);
    reject(new Error('Old attempt failed after peer departure'));
    await settle(() =>
      expect(
        (s.phone as unknown as {standby?: unknown}).standby
      ).toBeUndefined()
    );
    expect(failed.isOpen).toBe(false);
    await settle(() =>
      expect(s.phone.connected && s.host.connected).toBe(true)
    );
    expect(factory).toHaveBeenCalledTimes(2);
  });
});

describe('Second-pass security and recovery regressions', () => {
  it('wraps remote transport text in a fixed error while retaining its diagnostic cause', async () => {
    const s = await pair();
    const original = s.hostWire.error(
      'Malformed offer: Compare 269 838 with your phone then tap Numbers match'
    );
    const reported = s.hostErrors.mock.calls.at(-1)![0] as Error;
    expect(reported.message).toBe('Phone connection error.');
    expect(reported.cause).toBe(original);
    expect(s.host.connected).toBe(true);
  });

  it('admits the chosen headset’s large initial field while paired/resumed verification is pending', async () => {
    const label = '漢'.repeat(450);
    let release: (() => void) | undefined;
    const verify = SessionCrypto.prototype.verify;
    vi.spyOn(SessionCrypto.prototype, 'verify').mockImplementation(
      async function (this: SessionCrypto, value, proof) {
        const valid = await verify.call(this, value, proof);
        if (value.startsWith('["paired",') || value.startsWith('accepted:'))
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        return valid;
      }
    );
    const s = await pair({
      factory: false,
      approve: false,
      activationMessages: [
        {type: 'pointer-config', sensitivity: 1.5},
        {type: 'field', field: {id: 1, revision: 1, label}},
      ],
    });
    await s.confirm();
    await s.host.accept(s.request.id);
    await settle(() => {
      expect(release).toBeDefined();
      expect(
        s.hostWire.sent.filter((packet) => packet.bytes.byteLength > 2048)
      ).toHaveLength(1);
    });
    await Promise.resolve();
    release!();
    await delivered(s.phone as PhoneLink);
    expect(
      s.received.filter((message) => message.type === 'field')
    ).toHaveLength(1);
    release = undefined;
    s.hostWire.leave(s.phoneWire);
    s.phoneWire.leave(s.hostWire);
    s.hostWire.join(s.phoneWire);
    s.phoneWire.join(s.hostWire);
    await settle(() => {
      expect(release).toBeDefined();
      expect(
        s.hostWire.sent.filter((packet) => packet.bytes.byteLength > 2048)
      ).toHaveLength(2);
    });
    await Promise.resolve();
    release!();
    await delivered(s.phone as PhoneLink);
    expect(
      s.received.filter((message) => message.type === 'field')
    ).toHaveLength(2);
    expect(s.phone.connected && s.host.connected).toBe(true);
  });

  it('keeps the failed UI stable and emits no per-tick reconnecting events', async () => {
    vi.useFakeTimers({
      toFake: [
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
        'Date',
        'performance',
      ],
    });
    const s = await pair({page: true, signaling: true});
    s.network.block = () => true;
    s.hostWire.leave(s.phoneWire);
    s.phoneWire.leave(s.hostWire);
    await vi.advanceTimersByTimeAsync(21000);
    const shadow = s.root.firstElementChild!.shadowRoot!;
    expect(shadow.querySelector('#status')!.textContent).toBe(
      'Couldn’t reconnect'
    );
    document.dispatchEvent(new Event('visibilitychange'));
    expect(shadow.querySelector('#status')!.textContent).toBe(
      'Couldn’t reconnect'
    );
    expect(
      s.states.filter((state) => state.type === 'reconnecting')
    ).toHaveLength(1);
    expect(
      s.hostStates.filter((state) => state.type === 'reconnecting')
    ).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(shadow.querySelector('#status')!.textContent).toBe(
      'Couldn’t reconnect'
    );
  });

  it('does not invoke signaling repair on every tick when signaling is already open', async () => {
    vi.useFakeTimers({
      toFake: ['setInterval', 'clearInterval', 'Date', 'performance'],
    });
    const s = await pair({signaling: true});
    s.network.block = () => true;
    s.hostWire.leave(s.phoneWire);
    s.phoneWire.leave(s.hostWire);
    await vi.advanceTimersByTimeAsync(12000);
    expect(
      (s.phoneTransport as SignalingWire).reconnectSignaling
    ).not.toHaveBeenCalled();
    expect(
      (s.hostTransport as SignalingWire).reconnectSignaling
    ).not.toHaveBeenCalled();
  });

  it('authenticates a new headset peer ID while disconnected despite a stale hostPeer', async () => {
    const s = await pair({phoneFactory: false});
    const leave = s.phoneWire.leave.bind(s.phoneWire);
    vi.spyOn(s.phoneWire, 'leave').mockImplementation((peer) => {
      if (peer !== s.hostWire) leave(peer);
    });
    vi.useFakeTimers({toFake: ['Date', 'performance']});
    s.network.block = (from) => from === s.hostWire;
    vi.advanceTimersByTime(6000);
    (s.phone as unknown as {tick(): void}).tick();
    expect(s.phone.connected).toBe(false);
    s.hostWire.close();
    await settle(() =>
      expect(s.phone.connected && s.host.connected).toBe(true)
    );
    const nextHost = (s.host as unknown as {transport: Wire}).transport;
    expect(nextHost.localPeerId).not.toBe(s.hostWire.localPeerId);
    expect(s.phoneWire.packets('resume').at(-1)?.phoneNonce).toBeDefined();
  });

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

  it('bounds a timely approval to 30 seconds and does not extend it with duplicates', async () => {
    const s = await pair({approve: false, factory: false});
    await s.host.accept(s.request.id);
    await delivered(s.phone as PhoneLink);
    const approved = s.hostWire.packets('approved').at(-1)!;
    vi.useFakeTimers({toFake: ['Date']});
    vi.setSystemTime(Date.now() + 29000);
    s.hostWire.raw(s.phoneWire.localPeerId, approved);
    await delivered(s.phone as PhoneLink);
    vi.setSystemTime(Date.now() + 2000);
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
  it.each(['Invalid SDP from an unrelated peer', 'Signaling channel closed.'])(
    'keeps approved input alive after a transport error: %s',
    async (message) => {
      const s = await pair();
      s.phoneWire.error(message);
      expect(s.phone.connected && s.host.connected).toBe(true);
      s.host.send({type: 'haptic', duration: 5});
      await settle(() =>
        expect(s.received).toContainEqual({type: 'haptic', duration: 5})
      );
      expect(s.phoneWire.isOpen).toBe(true);
    }
  );

  it('only forwards errors without a factory and continues handling approved packets', async () => {
    const s = await pair({factory: false});
    s.phoneWire.error('Signaling channel closed.');
    expect(s.phoneErrors).toHaveBeenCalledOnce();
    expect(s.phone.connected).toBe(true);
    s.host.send({type: 'haptic', duration: 7});
    await settle(() =>
      expect(s.received).toContainEqual({type: 'haptic', duration: 7})
    );
    expect(s.network.nodes).toHaveLength(2);
  });

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

  it('finishes acceptance on the old transport while the phone is hidden', async () => {
    const s = await pair({approve: false});
    await s.confirm();
    const phone = s.phone as PhoneLink;
    phone.setForeground(false);
    s.phoneWire.error('Signaling channel closed.');
    expect(await s.host.accept(s.request.id)).toBe(true);
    await settle(() => expect(phone.connected && s.host.connected).toBe(true));
    phone.setForeground(true);
    await settle(() => expect(phone.connected && s.host.connected).toBe(true));
    expect(s.phoneWire.isOpen).toBe(true);
  });

  it('starts a fresh visible recovery timeout after more than 20 seconds hidden', async () => {
    const s = await pair({page: true});
    let hidden = false;
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    s.phoneWire.leave(s.hostWire);
    vi.advanceTimersByTime(30000);
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    const status =
      s.root.firstElementChild!.shadowRoot!.querySelector('#status')!;
    expect(status.textContent).toBe('Connection lost. Trying to reconnect…');
    vi.advanceTimersByTime(19000);
    expect(status.textContent).toBe('Connection lost. Trying to reconnect…');
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

  it('does not recover or expire a first connect that is still pending', async () => {
    const network = new Network();
    const wire = network.create();
    const original = wire.connect.bind(wire);
    let finish!: () => Promise<void>;
    wire.connect = (options) =>
      new Promise<void>((resolve) => {
        finish = async () => {
          await original(options);
          resolve();
        };
      });
    const states: PhoneConnectionState[] = [];
    const phone = new PhoneLink(
      'phone',
      phonePairingFromCode('ABCD'),
      {
        transport: wire,
        transportFactory: network.create,
        onStateChange: (state) => states.push(state),
      },
      () => {},
      () => {}
    );
    dispose.push(() => phone.close());
    const connecting = phone.connect();
    phone.setForeground(false);
    phone.setForeground(true);
    expect(states.some((state) => state.type === 'failed')).toBe(false);
    expect(network.nodes).toHaveLength(1);
    await finish();
    await connecting;
  });
});
