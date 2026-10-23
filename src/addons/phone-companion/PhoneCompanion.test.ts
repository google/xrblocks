import {webcrypto} from 'node:crypto';
import * as THREE from 'three';
import {afterEach, describe, expect, it, vi} from 'vitest';

vi.hoisted(() => {
  vi.stubGlobal('AudioContext', function () {
    return {createGain: () => ({connect: () => {}}), destination: {}};
  });
});
vi.stubGlobal('crypto', webcrypto);

import {
  Input,
  Options,
  UIButton,
  UICard,
  UITextInput,
  Interaction,
} from 'xrblocks';
import {ScriptsManager} from '../../core/components/ScriptsManager';
import {TextInputEditor} from '../../ui/internal/TextInputEditor';
import {
  Transport,
  type TransportConnectOptions,
} from '../netblocks/src/core/transport/Transport';
import {
  PhoneCompanion,
  createPhonePairing,
  phonePairingFromCode,
  phonePairingURL,
  readPhonePairing,
} from './index';
import {PhoneControllerPage} from './phone';
import {PhoneLink, type PhoneConnectionState} from './PhoneLink';
import {NetSession} from '../netblocks/src/core/NetSession';
import {PAIRING_ATTEMPTS, PAIRING_WINDOW_MS} from './Pairing';
import {
  createEphemeralKey,
  credentialProof,
  keyCommitment,
  randomSecret,
} from './SessionCrypto';
import type {PhoneMessage} from './protocol';

class Network {
  nodes: Wire[] = [];
  create() {
    const node = new Wire(this);
    this.nodes.push(node);
    return node;
  }
}

class Wire extends Transport {
  name = 'test';
  get supportsUnreliable(): boolean {
    return true;
  }
  isOpen = false;
  localPeerId = crypto.randomUUID();
  remotePeerIds = new Set<string>();
  roomId = '';
  packets: Array<{
    target: string;
    packet: Record<string, unknown>;
    delivery: 'reliable' | 'unreliable';
    data: Uint8Array;
  }> = [];
  dropNextReliable = false;
  loseSignaling() {
    this.emitError(new Error('Signaling channel closed.'));
  }
  allowBroadcast = false;
  constructor(private network: Network) {
    super();
  }
  async connect(options: TransportConnectOptions) {
    this.roomId = options.roomId;
    this.isOpen = true;
    for (const node of this.network.nodes) {
      if (node !== this && node.isOpen && node.roomId === this.roomId) {
        this.join(node);
        node.join(this);
      }
    }
  }
  join(node: Wire) {
    this.remotePeerIds.add(node.localPeerId);
    this.emitPeerJoin(node.localPeerId);
  }
  leave(node: Wire) {
    this.remotePeerIds.delete(node.localPeerId);
    this.emitPeerLeave(node.localPeerId);
  }
  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    for (const node of this.network.nodes)
      if (node !== this && node.isOpen && node.roomId === this.roomId)
        node.leave(this);
    this.remotePeerIds.clear();
    this.dispatchEvent(new Event('close'));
  }
  send(data: Uint8Array, target?: string) {
    if (!target && this.allowBroadcast) {
      for (const peer of this.remotePeerIds)
        this.deliver(data, peer, 'reliable');
      return;
    }
    this.deliver(data, target, 'reliable');
  }
  sendUnreliable(data: Uint8Array, target: string) {
    this.deliver(data, target, 'unreliable');
    return true;
  }
  private deliver(
    data: Uint8Array,
    target: string | undefined,
    delivery: 'reliable' | 'unreliable'
  ) {
    if (!target) throw new Error('Companion packets must never broadcast.');
    this.packets.push({
      target,
      packet: JSON.parse(new TextDecoder().decode(data)),
      delivery,
      data,
    });
    if (delivery === 'reliable' && this.dropNextReliable) {
      this.dropNextReliable = false;
      return;
    }
    for (const node of this.network.nodes) {
      if (
        node.isOpen &&
        node.roomId === this.roomId &&
        node.localPeerId === target
      )
        queueMicrotask(() => {
          if (node.isOpen) node.emitMessage(this.localPeerId, data, delivery);
        });
    }
  }
  raw(packet: object, target: string) {
    this.send(new TextEncoder().encode(JSON.stringify(packet)), target);
  }
}

const cleanup: Array<() => void> = [];
afterEach(() => {
  cleanup
    .splice(0)
    .reverse()
    .forEach((fn) => fn());
  vi.useRealTimers();
});
const settle = (assertion: () => void) =>
  vi.waitFor(assertion, {timeout: 3000, interval: 10});
const drain = () => new Promise((resolve) => setTimeout(resolve, 30));

async function addHost(network: Network, pairing = createPhonePairing()) {
  const input = new Input();
  input.options = new Options();
  const host = new PhoneCompanion({
    pairing,
    transportFactory: () => network.create(),
  });
  const interaction = new Interaction({
    callbacks: new ScriptsManager(async () => {}),
    scene: new THREE.Scene(),
  });
  cleanup.push(() => {
    host.dispose();
    input.dispose();
  });
  await host.init({input, interaction, camera: new THREE.PerspectiveCamera()});
  return host;
}

async function setup(
  page = false,
  approve = true,
  allowTextInput?: (field: UITextInput) => boolean
) {
  const network = new Network();
  const input = new Input();
  input.options = new Options();
  const camera = new THREE.PerspectiveCamera();
  const callbacks = new ScriptsManager(async () => {});
  const scene = new THREE.Scene();
  const interaction = new Interaction({callbacks, scene});
  const hostStates: PhoneConnectionState[] = [];
  const host = new PhoneCompanion({
    transportFactory: () => network.create(),
    allowTextInput,
    onStateChange: (state) => hostStates.push(state),
  });
  await host.init({input, camera, interaction});
  const invitation = {...host.pairing};
  const hostWire = network.nodes[0];
  const phoneWire = network.create();
  const messages: PhoneMessage[] = [];
  const statuses: string[] = [];
  const root = document.createElement('div');
  document.body.append(root);
  const phone = page
    ? new PhoneControllerPage(root, {
        pairing: phonePairingFromCode(invitation.code!),
        transport: phoneWire,
        transportFactory: () => network.create(),
        onStatus: (status) => statuses.push(status),
      })
    : new PhoneLink(
        'phone',
        phonePairingFromCode(invitation.code!),
        {
          transport: phoneWire,
          transportFactory: () => network.create(),
          onStatus: (status) => statuses.push(status),
        },
        (message) => messages.push(message),
        () => {}
      );
  cleanup.push(() => {
    host.dispose();
    if (phone instanceof PhoneLink) phone.close();
    else phone.dispose();
    input.dispose();
    root.remove();
  });
  await phone.connect();
  await settle(() => expect(host.pendingPhone).toBeDefined());
  expect(statuses.at(-1)).toContain(host.pendingPhone!.comparison);
  const requestId = host.pendingPhone!.id;
  const confirmPhone = async () => {
    if (phone instanceof PhoneLink) await phone.confirmNumbers(requestId);
    else
      root
        .firstElementChild!.shadowRoot!.querySelector<HTMLButtonElement>(
          '#numbers-match'
        )!
        .click();
  };
  if (approve) {
    await confirmPhone();
    await host.acceptPhone(host.pendingPhone!.id);
    await settle(() => expect(phone.connected && host.connected).toBe(true));
  }
  const frame = () => {
    scene.updateMatrixWorld(true);
    input.sampleSources();
    interaction.update(input.getFrame());
    host.update();
  };
  return {
    confirmPhone,
    hostStates,
    host,
    phone,
    hostWire,
    phoneWire,
    network,
    invitation,
    messages,
    statuses,
    root,
    input,
    camera,
    callbacks,
    scene,
    interaction,
    frame,
  };
}

function mountField(options: ConstructorParameters<typeof UITextInput>[0]) {
  const field = new UITextInput(options);
  const native = new TextInputEditor(field, {
    isReady: () => true,
    caretAtPoint: () => undefined,
  });
  cleanup.push(() => native.dispose());
  field.focus();
  return field;
}

function pointer(
  target: HTMLElement,
  type: string,
  id: number,
  x = 10,
  y = 10
) {
  const event = new MouseEvent(type, {
    clientX: x,
    clientY: y,
    cancelable: true,
  });
  Object.defineProperty(event, 'pointerId', {value: id});
  target.dispatchEvent(event);
}

describe('Approved phone sessions', () => {
  it('forwards connection states from the headset options', async () => {
    const s = await setup();
    expect(s.hostStates.map((state) => state.type)).toEqual([
      'connecting',
      'connected',
    ]);
  });
  it('recovers repeated background signaling losses using the same approved session after invitation expiry', async () => {
    const s = await setup(true);
    let hidden = false;
    const visibility = vi
      .spyOn(document, 'hidden', 'get')
      .mockImplementation(() => hidden);
    cleanup.push(() => visibility.mockRestore());
    vi.useFakeTimers({toFake: ['Date', 'performance']});
    await settle(() =>
      expect(s.hostWire.packets.some((p) => p.packet.type === 'data')).toBe(
        true
      )
    );
    const sessionId = s.hostWire.packets.find((p) => p.packet.type === 'data')!
      .packet.id;
    let previous = s.phoneWire;
    const activePhone = () =>
      (s.phone as unknown as {link: {transport: Wire}}).link.transport;
    const activeHost = () =>
      (s.host as unknown as {link: {transport: Wire}}).link.transport;
    for (let cycle = 0; cycle < 3; cycle++) {
      hidden = true;
      document.dispatchEvent(new Event('visibilitychange'));
      previous.loseSignaling();
      expect(s.phone.connected).toBe(true);
      previous.close();
      expect(s.phone.connected).toBe(false);
      vi.advanceTimersByTime(120000);
      hidden = false;
      document.dispatchEvent(new Event('visibilitychange'));
      document.dispatchEvent(new Event('visibilitychange'));
      await settle(() =>
        expect(s.phone.connected && s.host.connected).toBe(true)
      );
      const current = activePhone();
      expect(current).not.toBe(previous);
      expect(previous.isOpen).toBe(false);
      expect(s.host.pendingPhone).toBeUndefined();
      expect(
        current.packets.some((p) => p.packet.type === 'resume-proof')
      ).toBe(true);
      expect(
        current.packets.some(
          (p) => p.packet.type === 'knock' || p.packet.type === 'claim'
        )
      ).toBe(false);
      const resumed = activeHost().packets.findLast(
        (p) => p.target === current.localPeerId && p.packet.type === 'resumed'
      );
      expect(resumed!.packet.id).toBe(sessionId);
      // Exercise the new session past the reported second-drop interval,
      // then cause another live signaling failure without a visibility event.
      vi.advanceTimersByTime(30000);
      previous = current;
    }
    previous.loseSignaling();
    await drain();
    await settle(() =>
      expect(s.phone.connected && s.host.connected).toBe(true)
    );
    expect(activePhone()).toBe(previous);
    expect(
      s.statuses.some((status) => status.includes('Signaling channel closed'))
    ).toBe(false);
  });

  it('cancels foreground recovery when the phone page is disposed', async () => {
    const s = await setup(true);
    s.phoneWire.loseSignaling();
    (s.phone as PhoneControllerPage).dispose();
    await drain();
    expect(
      (s.phone as unknown as {link: {transport: Wire}}).link.transport
    ).toBe(s.phoneWire);
    expect(s.host.connected).toBe(false);
  });

  it('does not renew an unapproved invitation during foreground recovery', async () => {
    const s = await setup(true, false);
    vi.useFakeTimers({toFake: ['Date']});
    vi.setSystemTime(Date.now() + PAIRING_WINDOW_MS + 1);
    s.phoneWire.loseSignaling();
    await settle(() =>
      expect(
        s.root.firstElementChild!.shadowRoot!.querySelector('#status')!
          .textContent
      ).toContain('expired')
    );
    expect(s.host.pairingOpen).toBe(false);
    expect(s.phone.connected).toBe(false);
  });

  it('retries a failed signaling reopen without consuming another invitation', async () => {
    const s = await setup(true);
    const create = s.network.create.bind(s.network);
    const factory = vi
      .spyOn(s.network, 'create')
      .mockImplementationOnce(() => {
        const wire = create();
        wire.connect = async () => {
          throw new Error('Broker temporarily unreachable');
        };
        return wire;
      })
      .mockImplementation(create);
    cleanup.push(() => factory.mockRestore());
    s.phoneWire.loseSignaling();
    await settle(() => expect(factory).toHaveBeenCalledTimes(1));
    expect(s.phone.connected && s.host.connected).toBe(true);
    await settle(() => expect(factory).toHaveBeenCalledTimes(2));
    s.phoneWire.close();
    await settle(() =>
      expect(s.phone.connected && s.host.connected).toBe(true)
    );
    expect(s.host.pendingPhone).toBeUndefined();
    expect(
      (
        s.phone as unknown as {link: {transport: Wire}}
      ).link.transport.packets.some((p) => p.packet.type === 'resume-proof')
    ).toBe(true);
  });

  it('keeps an approved session through a persisted pagehide/pageshow cycle', async () => {
    const s = await setup(true);
    window.dispatchEvent(
      new PageTransitionEvent('pagehide', {persisted: true})
    );
    expect(s.root.firstElementChild).not.toBeNull();
    window.dispatchEvent(
      new PageTransitionEvent('pageshow', {persisted: true})
    );
    await settle(() =>
      expect(s.phone.connected && s.host.connected).toBe(true)
    );
    expect(s.network.nodes.at(-1)).toBe(s.phoneWire);
    expect(s.host.pendingPhone).toBeUndefined();
  });

  it.each([false, true])(
    'keeps two phone pages host-only with a separate multiplayer session=%s',
    async (multiplayer) => {
      const s = await setup(true, false);
      let multiplayerHost: NetSession | undefined;
      let multiplayerOther: NetSession | undefined;
      let roomHost: Wire | undefined;
      let roomOther: Wire | undefined;
      if (multiplayer) {
        roomHost = s.network.create();
        roomOther = s.network.create();
        roomHost.allowBroadcast = roomOther.allowBroadcast = true;
        multiplayerHost = new NetSession(roomHost, new THREE.Group());
        multiplayerOther = new NetSession(roomOther, new THREE.Group());
        cleanup.push(() => {
          multiplayerHost!.close();
          multiplayerOther!.close();
        });
        await multiplayerHost.open('multiplayer-room');
        await multiplayerOther.open('multiplayer-room');
        await settle(() => expect(multiplayerHost!.users.size).toBe(1));
      }
      const root = document.createElement('div');
      document.body.append(root);
      const secondWire = s.network.create();
      const second = new PhoneControllerPage(root, {
        pairing: phonePairingFromCode(s.invitation.code!),
        transport: secondWire,
      });
      cleanup.push(() => {
        second.dispose();
        root.remove();
      });
      await second.connect();
      await settle(() =>
        expect(secondWire.packets.some((p) => p.packet.type === 'knock')).toBe(
          true
        )
      );
      // The generic transport is still a mesh. PhoneLink ignores that extra
      // connection and does not even send pairing/resume probes to other phones.
      expect(secondWire.remotePeerIds.has(s.phoneWire.localPeerId)).toBe(true);
      await s.confirmPhone();
      await s.host.acceptPhone(s.host.pendingPhone!.id);
      await settle(() => expect(s.phone.connected).toBe(true));
      for (const wire of [s.phoneWire, secondWire]) {
        expect(wire.packets.length).toBeGreaterThan(0);
        expect(
          wire.packets.every(
            (packet) => packet.target === s.hostWire.localPeerId
          )
        ).toBe(true);
      }
      expect(second.connected).toBe(false);
      if (multiplayer) {
        expect(roomHost!.remotePeerIds).toEqual(
          new Set([roomOther!.localPeerId])
        );
        expect(roomOther!.remotePeerIds).toEqual(
          new Set([roomHost!.localPeerId])
        );
        expect([...multiplayerHost!.users.keys()]).toEqual([
          roomOther!.localPeerId,
        ]);
        expect([...multiplayerOther!.users.keys()]).toEqual([
          roomHost!.localPeerId,
        ]);
        const received = vi.fn();
        multiplayerOther!.events.on('still-multiplayer', received);
        multiplayerHost!.events.emit('still-multiplayer', 42);
        await settle(() =>
          expect(received).toHaveBeenCalledWith(42, roomHost!.localPeerId)
        );
        expect(
          roomHost!.packets.every(
            (packet) => packet.target === roomOther!.localPeerId
          )
        ).toBe(true);
      }
    }
  );

  it('rejects a different client key after its commitment, even with a valid code proof', async () => {
    const network = new Network();
    const host = await addHost(network);
    const hostWire = network.nodes[0];
    const attacker = network.create();
    await attacker.connect({roomId: host.pairing.roomId});
    const original = await createEphemeralKey();
    const substituted = await createEphemeralKey();
    const commit = await keyCommitment(original.publicKey);
    attacker.raw(
      {v: 2, type: 'knock', mode: 'code', commit},
      hostWire.localPeerId
    );
    await settle(() =>
      expect(hostWire.packets.some((p) => p.packet.type === 'challenge')).toBe(
        true
      )
    );
    const challenge = hostWire.packets.find(
      (p) => p.packet.type === 'challenge'
    )!.packet;
    const transcript = JSON.stringify([
      'xrblocks-phone-v2',
      hostWire.localPeerId,
      attacker.localPeerId,
      'code',
      commit,
      challenge.nonce,
      challenge.key,
      substituted.publicKey,
    ]);
    attacker.raw(
      {
        v: 2,
        type: 'claim',
        key: substituted.publicKey,
        proof: await credentialProof(host.pairing.code!, transcript),
      },
      hostWire.localPeerId
    );
    await drain();
    expect(host.pendingPhone).toBeUndefined();
    expect(host.connected).toBe(false);
  });
  it('keeps expiry windows and invitation tokens local to each headset', async () => {
    vi.useFakeTimers({toFake: ['Date']});
    const start = Date.now();
    const network = new Network();
    const a = await addHost(network);
    vi.setSystemTime(start + 45000);
    const b = await addHost(network);
    expect(b.pairing.token).not.toBe(a.pairing.token);
    expect(b.pairing.expiresAt! - a.pairing.expiresAt!).toBe(45000);
    vi.setSystemTime(start + PAIRING_WINDOW_MS + 1);
    expect(a.pairingOpen).toBe(false);
    expect(b.pairingOpen).toBe(true);
  });
  it('keeps the controller registered when Replace Phone cancels an unfinished initial connection', async () => {
    const network = new Network();
    const first = network.create();
    let reject!: (error: Error) => void;
    first.connect = () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      });
    first.close = () => reject(new Error('cancelled'));
    let initial = true;
    const input = new Input();
    input.options = new Options();
    const host = new PhoneCompanion({
      transportFactory: () => {
        if (initial) {
          initial = false;
          return first;
        }
        return network.create();
      },
    });
    cleanup.push(() => {
      host.dispose();
      input.dispose();
    });
    const pending = host.init({
      input,
      interaction: new Interaction({
        callbacks: new ScriptsManager(async () => {}),
      }),
      camera: new THREE.PerspectiveCamera(),
    });
    await host.replacePhone();
    await pending;
    expect(input.controllers).toContain(host.controller);
    expect(host.pairingOpen).toBe(true);
  });
  it('rerolls simultaneous headset code collisions and keeps approvals, QR tokens and replacement independent', async () => {
    const network = new Network();
    const first = createPhonePairing();
    const second = {
      ...createPhonePairing(),
      roomId: first.roomId,
      code: first.code,
    };
    const [a, b] = await Promise.all([
      addHost(network, first),
      addHost(network, second),
    ]);
    await settle(() => {
      expect(a.pairingOpen && b.pairingOpen).toBe(true);
      expect(a.pairing.code).not.toBe(b.pairing.code);
    });
    expect(a.pairing.token).not.toBe(b.pairing.token);
    const phoneA = new PhoneLink(
      'phone',
      phonePairingFromCode(a.pairing.code!),
      {transport: network.create()},
      () => {},
      () => {}
    );
    const phoneB = new PhoneLink(
      'phone',
      phonePairingFromCode(b.pairing.code!),
      {transport: network.create()},
      () => {},
      () => {}
    );
    cleanup.push(() => {
      phoneA.close();
      phoneB.close();
    });
    await Promise.all([phoneA.connect(), phoneB.connect()]);
    await settle(() => {
      expect(a.pendingPhone).toBeDefined();
      expect(b.pendingPhone).toBeDefined();
    });
    expect(a.pendingPhone!.id).not.toBe(b.pendingPhone!.id);
    await phoneA.confirmNumbers(a.pendingPhone!.id);
    await a.acceptPhone(a.pendingPhone!.id);
    await settle(() => expect(phoneA.connected).toBe(true));
    expect(b.connected).toBe(false);
    expect(phoneB.connected).toBe(false);
    const tokenA = a.pairing.token;
    await b.replacePhone();
    expect(a.connected).toBe(true);
    expect(a.pairing.token).toBe(tokenA);
    expect(b.pairingOpen).toBe(true);
  });

  it('keeps an approved headset session when a later headset rolls its old room code', async () => {
    const s = await setup();
    const originalToken = s.host.pairing.token;
    const other = await addHost(s.network, {
      ...createPhonePairing(),
      roomId: s.invitation.roomId,
      code: s.invitation.code!,
    });
    await settle(() => expect(other.pairing.code).not.toBe(s.invitation.code));
    expect(s.host.connected).toBe(true);
    expect(s.host.pairing.token).toBe(originalToken);
    expect(other.connected).toBe(false);
    expect(other.pairingOpen).toBe(true);
  });

  it('requires explicit matching-digit acceptance, consumes/rotates the invitation, and never sends credentials', async () => {
    const s = await setup(false, false);
    expect(s.host.connected).toBe(false);
    expect(s.phone.connected).toBe(false);
    expect(s.input.getFrame().raySources).toHaveLength(0);
    const request = s.host.pendingPhone!;
    expect(await s.host.acceptPhone('stale-request')).toBe(false);
    await s.confirmPhone();
    expect(await s.host.acceptPhone(request.id)).toBe(true);
    await settle(() => expect(s.phone.connected).toBe(true));
    expect(await s.host.acceptPhone(request.id)).toBe(false);
    expect(s.host.pairing.token).not.toBe(s.invitation.token);
    expect(s.host.pairingOpen).toBe(false);
    expect(() => s.host.pairingURL('https://example.com/phone.html')).toThrow(
      'Replace'
    );
    for (const wire of [s.hostWire, s.phoneWire])
      for (const {target, packet} of wire.packets) {
        expect(target).toBeTruthy();
        expect(packet).not.toHaveProperty('token');
        expect(packet).not.toHaveProperty('code');
        expect(packet).not.toHaveProperty('identity');
        expect(Object.values(packet)).not.toContain(s.invitation.token);
        expect(Object.values(packet)).not.toContain(s.invitation.code);
      }
  });

  it('expires a pending code and enforces a host-wide attempt budget across peer IDs', async () => {
    const s = await setup(false, false);
    vi.useFakeTimers({toFake: ['Date']});
    vi.setSystemTime(Date.now() + PAIRING_WINDOW_MS + 1);
    expect(await s.host.acceptPhone(s.host.pendingPhone!.id)).toBe(false);
    expect(s.host.pairingOpen).toBe(false);
    vi.useRealTimers();
    await s.host.replacePhone();
    const room = s.host.pairing.roomId;
    const hostWire = s.network.nodes.at(-1)!;
    const other = await addHost(s.network);
    const otherToken = other.pairing.token;
    for (let i = 0; i < PAIRING_ATTEMPTS + 2; i++) {
      const attacker = s.network.create();
      await attacker.connect({roomId: room});
      attacker.raw(
        {v: 2, type: 'knock', mode: 'code', commit: randomSecret()},
        hostWire.localPeerId
      );
    }
    await settle(() => expect(s.host.pairingOpen).toBe(false));
    await drain();
    expect(
      hostWire.packets.filter((p) => p.packet.type === 'challenge')
    ).toHaveLength(PAIRING_ATTEMPTS);
    expect(s.host.pendingPhone).toBeUndefined();
    expect(other.pairingOpen).toBe(true);
    expect(other.pairing.token).toBe(otherToken);
  });

  it('rejects ciphertext replay and UUID/credential takeover, but resumes with the derived secret', async () => {
    const s = await setup();
    const phone = s.phone as PhoneLink;
    const activePhone = () => (phone as unknown as {transport: Wire}).transport;
    const activeHost = () =>
      (s.host as unknown as {link: {transport: Wire}}).link.transport;
    phone.send({type: 'button', down: true});
    await settle(() => {
      s.frame();
      expect(s.host.controller.userData.selected).toBe(true);
    });
    const oldData = s.phoneWire.packets
      .filter((p) => p.packet.type === 'data')
      .at(-1)!;
    const oldEpoch = oldData.packet.epoch;
    s.hostWire.leave(s.phoneWire);
    s.phoneWire.leave(s.hostWire);
    expect(s.host.connected).toBe(false);
    s.phoneWire.send(oldData.data, s.hostWire.localPeerId);
    s.phoneWire.raw(
      {
        protocol: 'xrblocks-phone-1',
        token: s.invitation.token,
        identity: crypto.randomUUID(),
        message: {type: 'button', down: true},
      },
      s.hostWire.localPeerId
    );
    await drain();
    s.frame();
    expect(s.host.controller.userData.selected).toBe(false);
    s.hostWire.join(s.phoneWire);
    s.phoneWire.join(s.hostWire);
    await settle(() => expect(s.host.connected && phone.connected).toBe(true));
    phone.send({type: 'button', down: true});
    await settle(() => {
      s.frame();
      expect(s.host.controller.userData.selected).toBe(true);
    });
    expect(
      activePhone()
        .packets.filter((p) => p.packet.type === 'data')
        .at(-1)!.packet.epoch
    ).not.toBe(oldEpoch);
    phone.send({type: 'button', down: false});
    await settle(() => {
      s.frame();
      expect(s.host.controller.userData.selected).toBe(false);
    });
    s.phoneWire.send(oldData.data, s.hostWire.localPeerId);
    await drain();
    s.frame();
    expect(s.host.controller.userData.selected).toBe(false);
    const lastPhoneId = activePhone().localPeerId;
    phone.close();
    const attacker = s.network.create();
    attacker.localPeerId = lastPhoneId;
    await attacker.connect({roomId: s.invitation.roomId});
    attacker.send(oldData.data, activeHost().localPeerId);
    attacker.raw({v: 2, type: 'knock', mode: 'code'}, activeHost().localPeerId);
    await drain();
    expect(s.host.connected).toBe(false);
    expect(s.host.pendingPhone).toBeUndefined();
  });

  it('allows a fresh phone only after the host explicitly replaces the old session', async () => {
    const s = await setup();
    await s.host.replacePhone();
    expect(s.host.connected).toBe(false);
    expect(s.host.pairing.token).not.toBe(s.invitation.token);
    const replacement = new PhoneLink(
      'phone',
      readPhonePairing(s.host.pairingURL('https://example.com/phone.html')),
      {transport: s.network.create()},
      () => {},
      () => {}
    );
    cleanup.push(() => replacement.close());
    await replacement.connect();
    await settle(() => expect(s.host.pendingPhone).toBeDefined());
    expect(replacement.connected).toBe(false);
    await replacement.confirmNumbers(s.host.pendingPhone!.id);
    await s.host.acceptPhone(s.host.pendingPhone!.id);
    await settle(() => expect(replacement.connected).toBe(true));
  });
});

describe('Phone input and text boundaries', () => {
  it('cancels rather than retaining a held button if a reliable frame is lost at a queue boundary', async () => {
    const s = await setup();
    const phone = s.phone as PhoneLink;
    phone.send({type: 'button', down: true});
    await settle(() => {
      s.frame();
      expect(s.host.controller.userData.selected).toBe(true);
    });
    s.phoneWire.dropNextReliable = true;
    phone.send({type: 'button', down: false});
    phone.send({type: 'ping'});
    await settle(() => expect(s.host.connected).toBe(false));
    expect(s.host.controller.userData.selected).toBe(false);
  });
  it('rate-limits reliable commands and cancels a held source on violation', async () => {
    const s = await setup();
    const phone = s.phone as PhoneLink;
    phone.send({type: 'button', down: true});
    await settle(() => {
      s.frame();
      expect(s.host.controller.userData.selected).toBe(true);
    });
    for (let i = 0; i < 24; i++) phone.send({type: 'center'});
    await settle(() => expect(s.host.connected).toBe(false));
    expect(s.host.controller.userData.selected).toBe(false);
  });
  it('coalesces motion onto the lossy lane while preserving reliable edge poses and real button clicks', async () => {
    const s = await setup();
    const phone = s.phone as PhoneLink;
    const click = vi.fn();
    const button = new UIButton({label: 'Tap', onClick: click});
    const card = new UICard({size: {width: 1, height: 1}, children: [button]});
    s.scene.add(card);
    await s.callbacks.initScript(card);
    await s.callbacks.initScript(button);
    s.host.controller.userData.lastIntersection = {
      object: button,
      point: new THREE.Vector3(0, 0, -1),
      distance: 1,
    };
    const before = s.phoneWire.packets.filter(
      (p) => p.delivery === 'unreliable'
    ).length;
    for (let i = 0; i < 50; i++) phone.send({type: 'move', x: 0.001, y: 0});
    phone.send({type: 'scroll', delta: 20});
    phone.send({type: 'zoom', factor: 1.1});
    phone.flushMotion();
    await settle(() =>
      expect(
        s.phoneWire.packets.filter((p) => p.delivery === 'unreliable')
      ).toHaveLength(before + 1)
    );
    phone.send({type: 'button', down: true});
    phone.send({type: 'button', down: false});
    await settle(() => {
      s.frame();
      expect(click).toHaveBeenCalledOnce();
    });
    expect(
      s.phoneWire.packets.filter(
        (p) => p.packet.type === 'data' && p.delivery === 'reliable'
      ).length
    ).toBeGreaterThanOrEqual(2);
    expect(s.input.getFrame().raySources[0].ray.direction.x).toBeGreaterThan(0);
  });

  it('keeps field values private until Open keyboard and supports a host-side sensitive-field opt-out', async () => {
    const s = await setup(
      false,
      true,
      (field) => field.ariaLabel !== 'Password'
    );
    const field = mountField({
      ariaLabel: 'Message',
      value: 'private until requested',
    });
    s.host.input = field;
    s.host.update();
    await settle(() =>
      expect(
        s.messages.some(
          (m) => m.type === 'field' && m.field?.label === 'Message'
        )
      ).toBe(true)
    );
    expect(s.messages.filter((m) => m.type === 'text' && m.state)).toHaveLength(
      0
    );
    const meta = s.messages
      .filter((m) => m.type === 'field' && m.field)
      .at(-1)!;
    (s.phone as PhoneLink).send({
      type: 'open-keyboard',
      fieldId: meta.field!.id,
    });
    await settle(() =>
      expect(
        s.messages.some(
          (m) => m.type === 'text' && m.state?.value === field.value
        )
      ).toBe(true)
    );
    const password = mountField({ariaLabel: 'Password', value: 'never shared'});
    s.host.input = password;
    s.host.update();
    await drain();
    expect(
      s.messages.some(
        (m) => m.type === 'field' && m.field?.label === 'Password'
      )
    ).toBe(false);
    expect(
      s.messages.some(
        (m) => m.type === 'text' && m.state?.value === password.value
      )
    ).toBe(false);
  });

  it('never edits while applying remote text, preserves an unchanged over-limit value, and permits deletion without truncating the rest', async () => {
    const s = await setup(true);
    const onInput = vi.fn();
    const onChange = vi.fn();
    const field = mountField({
      ariaLabel: 'Message',
      value: 'already longer',
      maxLength: 4,
      onInput,
      onChange,
    });
    s.host.input = field;
    const shadow = s.root.querySelector('section')!.shadowRoot!;
    const keyboard = shadow.querySelector<HTMLButtonElement>('#keyboard')!;
    const editor = shadow.querySelector<HTMLTextAreaElement>('#editor')!;
    await settle(() => expect(keyboard.hidden).toBe(false));
    expect(editor.value).toBe('');
    // Keep the host's jsdom native editor focused: real devices have separate documents.
    editor.focus = vi.fn();
    keyboard.click();
    await settle(() => expect(editor.value).toBe('already longer'));
    editor.dispatchEvent(new Event('select'));
    editor.dispatchEvent(new InputEvent('input'));
    await drain();
    expect(onInput).not.toHaveBeenCalled();
    expect(field.value).toBe('already longer');
    editor.value = 'already longe';
    editor.setSelectionRange(13, 13);
    editor.dispatchEvent(new InputEvent('input'));
    await settle(() => expect(field.value).toBe('already longe'));
    expect(onInput).toHaveBeenCalledOnce();
    editor.dispatchEvent(new CompositionEvent('compositionstart'));
    editor.value = '你好🙂';
    editor.dispatchEvent(new InputEvent('input'));
    await drain();
    expect(field.value).toBe('already longe');
    editor.dispatchEvent(new CompositionEvent('compositionend'));
    await settle(() => expect(field.value).toBe('你好🙂'));
    shadow.querySelector<HTMLElement>('main')!.scrollIntoView = vi.fn();
    s.root.querySelector<HTMLElement>('section')!.scrollIntoView = vi.fn();
    shadow.querySelector<HTMLButtonElement>('#done')!.click();
    await settle(() => expect(field.focused).toBe(false));
    expect(onChange).toHaveBeenCalledWith('你好🙂');
    const pad = shadow.querySelector<HTMLElement>('#pad')!;
    pad.setPointerCapture = vi.fn();
    pointer(pad, 'pointerdown', 1);
    pointer(pad, 'pointermove', 1, 30, 10);
    pointer(pad, 'pointerup', 1, 30, 10);
    await settle(() => {
      s.frame();
      expect(s.input.getFrame().raySources[0].ray.direction.x).toBeGreaterThan(
        0
      );
    });
  });
});

describe('Phone page states and dragging', () => {
  it('separates verification from accepted controls and gives a clear rejection state', async () => {
    const s = await setup(true, false);
    const shadow = s.root.querySelector('section')!.shadowRoot!;
    const request = s.host.pendingPhone!;
    expect(shadow.querySelector('#verification')!.textContent).toBe(
      `${request.comparison.slice(0, 3)} ${request.comparison.slice(3)}`
    );
    expect(shadow.querySelector<HTMLElement>('#controls')!.hidden).toBe(true);
    expect(shadow.querySelector('#stage-help')!.textContent).toContain(
      'Accept phone'
    );
    expect(shadow.querySelector('#stage-help')!.textContent).toContain(
      'Reject phone'
    );
    s.host.rejectPhone(request.id);
    await settle(() =>
      expect(shadow.querySelector('#status')!.textContent).toBe(
        'Pairing was declined'
      )
    );
    expect(shadow.querySelector<HTMLElement>('#verification')!.hidden).toBe(
      true
    );
    expect(shadow.querySelector('#stage-help')!.textContent).toContain(
      'Pair a different phone'
    );
  });

  it('supports one-finger hold/slide/release and an accessible drag toggle', async () => {
    const s = await setup(true);
    const shadow = s.root.querySelector('section')!.shadowRoot!;
    const pad = shadow.querySelector<HTMLElement>('#pad')!;
    const drag = shadow.querySelector<HTMLButtonElement>('#select')!;
    pad.setPointerCapture = vi.fn();
    pointer(pad, 'pointerdown', 1);
    await settle(() => {
      s.frame();
      expect(s.host.controller.userData.selected).toBe(true);
    });
    expect(shadow.querySelector('#feedback')!.textContent).toContain(
      'Release to drop'
    );
    pointer(pad, 'pointermove', 1, 30, 20);
    pointer(pad, 'pointerup', 1, 30, 20);
    await settle(() => {
      s.frame();
      expect(s.host.controller.userData.selected).toBe(false);
    });
    expect(drag.getAttribute('aria-pressed')).toBe('false');
    drag.click();
    await settle(() => {
      s.frame();
      expect(s.host.controller.userData.selected).toBe(true);
    });
    pointer(pad, 'pointerdown', 2);
    pointer(pad, 'pointermove', 2, 40, 10);
    pointer(pad, 'pointerup', 2, 40, 10);
    expect(drag.getAttribute('aria-pressed')).toBe('true');
    expect(drag.textContent).toBe('Drop');
    drag.click();
    await settle(() => {
      s.frame();
      expect(s.host.controller.userData.selected).toBe(false);
    });
  });

  it('cancels a held drag before a two-finger gesture and shows zoom/scroll feedback', async () => {
    const s = await setup(true);
    const shadow = s.root.querySelector('section')!.shadowRoot!;
    const pad = shadow.querySelector<HTMLElement>('#pad')!;
    pad.setPointerCapture = vi.fn();
    shadow.querySelector<HTMLButtonElement>('#select')!.click();
    await settle(() => {
      s.frame();
      expect(s.host.controller.userData.selected).toBe(true);
    });
    pointer(pad, 'pointerdown', 1, 10, 10);
    pointer(pad, 'pointerdown', 2, 100, 10);
    pointer(pad, 'pointermove', 2, 140, 10);
    await settle(() =>
      expect(shadow.querySelector('#feedback')!.textContent).toBe('Zooming')
    );
    await settle(() => {
      s.frame();
      expect(s.host.controller.userData.selected).toBe(false);
    });
    pointer(pad, 'pointerup', 1);
    pointer(pad, 'pointerup', 2);
    pointer(pad, 'pointerdown', 1, 10, 10);
    pointer(pad, 'pointerdown', 2, 100, 10);
    pointer(pad, 'pointermove', 1, 10, 40);
    pointer(pad, 'pointermove', 2, 100, 40);
    await settle(() =>
      expect(shadow.querySelector('#feedback')!.textContent).toBe('Scrolling')
    );
    pointer(pad, 'pointercancel', 1);
    expect(shadow.querySelector('#feedback')!.textContent).toBe('');
  });

  it('dims controls during recovery, explains a prolonged failure and briefly announces reconnection', async () => {
    const s = await setup(true);
    const shadow = s.root.querySelector('section')!.shadowRoot!;
    const create = s.network.create.bind(s.network);
    const finish: Array<() => Promise<void>> = [];
    const factory = vi.spyOn(s.network, 'create').mockImplementation(() => {
      const wire = create();
      const connect = wire.connect.bind(wire);
      wire.connect = (options) =>
        new Promise<void>((resolve) => {
          finish.push(async () => {
            await connect(options);
            resolve();
          });
        });
      return wire;
    });
    cleanup.push(() => factory.mockRestore());
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
    s.phoneWire.close();
    await Promise.resolve();
    await Promise.resolve();
    expect(shadow.querySelector('#status')!.textContent).toBe(
      'Connection lost. Trying to reconnect…'
    );
    expect(shadow.querySelector('#pad')!.getAttribute('aria-disabled')).toBe(
      'true'
    );
    expect(shadow.querySelector<HTMLButtonElement>('#select')!.disabled).toBe(
      true
    );
    vi.advanceTimersByTime(20000);
    expect(shadow.querySelector('#status')!.textContent).toBe(
      'Couldn’t reconnect'
    );
    expect(shadow.querySelector('#recovery-help')!.textContent).toContain(
      'Disconnect'
    );
    expect(shadow.textContent).not.toContain('Signaling channel closed');
    vi.useRealTimers();
    await Promise.all(finish.map((resolve) => resolve()));
    await settle(() =>
      expect(shadow.querySelector('#status')!.textContent).toBe('Reconnected')
    );
    expect(shadow.querySelector('#pad')!.getAttribute('aria-disabled')).toBe(
      'false'
    );
  });
});

describe('Invitation URLs', () => {
  it('uses a long QR credential, derives short-code rooms, and consumes the current URL once', () => {
    const pairing = createPhonePairing();
    expect(pairing.code).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
    expect(pairing.token).toHaveLength(43);
    const url = phonePairingURL('http://localhost:3000/phone.html', pairing);
    expect(new URLSearchParams(new URL(url).hash.slice(1)).has('code')).toBe(
      false
    );
    expect(readPhonePairing(url)).toEqual({
      roomId: pairing.roomId,
      token: pairing.token,
    });
    expect(phonePairingFromCode(pairing.code.toLowerCase()).roomId).toBe(
      pairing.roomId
    );
    const current = new URL(location.href);
    current.hash = `code=${pairing.code}`;
    history.replaceState(null, '', current);
    expect(readPhonePairing(location.href).code).toBe(pairing.code);
    expect(location.hash).toBe('');
    history.replaceState(null, '', phonePairingURL(location.href, pairing));
    expect(readPhonePairing(location.href).token).toBe(pairing.token);
    expect(location.hash).toBe('');
    expect(() => phonePairingFromCode('bad')).toThrow('4-character');
  });
});
