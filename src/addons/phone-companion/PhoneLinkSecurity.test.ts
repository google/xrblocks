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
import type {SessionCrypto} from './SessionCrypto';

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
    this.emitError(new Error(message));
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

async function pair({page = false, factory = true, approve = true} = {}) {
  const network = new Network();
  const invitation = createPhonePairing();
  const hostWire = network.create(),
    phoneWire = network.create();
  const hostErrors = vi.fn(),
    phoneErrors = vi.fn();
  const states: PhoneConnectionState[] = [],
    received: PhoneMessage[] = [];
  const host = new PhoneLink(
    'host',
    invitation,
    {
      transport: hostWire,
      transportFactory: factory ? network.create : undefined,
      onError: hostErrors,
    },
    () => {},
    () => {}
  );
  const root = document.createElement('div');
  document.body.append(root);
  const options = {
    pairing: phonePairingFromCode(invitation.code!),
    transport: phoneWire,
    transportFactory: factory ? network.create : undefined,
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
  };
}

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
