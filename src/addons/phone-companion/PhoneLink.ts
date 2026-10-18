import {WebRTCTransport} from '../netblocks/src/core/transport/WebRTCTransport.js';
import type {
  Transport,
  TransportMessageEventDetail,
} from '../netblocks/src/core/transport/Transport.js';
import {
  createPhonePairing,
  phonePairingFromCode,
  PAIRING_ATTEMPTS,
  PAIRING_WINDOW_MS,
  type PhonePairing,
} from './Pairing.js';
import {
  createEphemeralKey,
  credentialProof,
  keyCommitment,
  randomSecret,
  SessionCrypto,
  verifyCredential,
} from './SessionCrypto.js';
import {MessageLimits} from './MessageLimits.js';
import {
  HOST_MESSAGES,
  PHONE_MESSAGES,
  validMessage,
  type MotionState,
  type PhoneMessage,
} from './protocol.js';

export {
  createPhonePairing,
  phonePairingFromCode,
  phonePairingURL,
  readPhonePairing,
  type PhonePairing,
} from './Pairing.js';

export interface PhonePairingRequest {
  id: string;
  /** Compare this with the six digits on the phone before accepting. */
  comparison: string;
}

export interface PhoneConnectionOptions {
  /** Fresh, exclusively owned instance. Hosts needing replacement should use transportFactory. */
  transport?: Transport;
  transportFactory?: () => Transport;
  onConnectionChange?: (connected: boolean) => void;
  onPairingRequest?: (request: PhonePairingRequest | null) => void;
  onPairingChange?: () => void;
  onStatus?: (message: string) => void;
  onError?: (error: Error) => void;
}

type Lane = 'reliable' | 'unreliable';
type Challenge = {
  commit: string;
  nonce: string;
  key: {privateKey: CryptoKey; publicKey: string};
  mode: 'code' | 'qr';
};
type Candidate = {
  peer: string;
  membership: number;
  crypto: SessionCrypto;
  transcript: string;
  id: string;
};
type Session = {crypto: SessionCrypto; peer: string; epoch: string};
const EMPTY_MOTION = (): MotionState => ({
  sample: 0,
  x: 0,
  y: 0,
  scroll: 0,
  zoom: 0,
});
const text = (value: unknown, max = 200): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max;
const nonce = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);

/** Approved, encrypted one-to-one channel. Invitation credentials never appear on the wire. */
export class PhoneLink {
  private readonly transport: Transport;
  private readonly roomCode?: string;
  private readonly roomId: string;
  private announced = new Set<string>();
  private memberships = new Map<string, number>();
  private membershipCounter = 0;
  private peer?: string;
  private session?: Session;
  private candidate?: Candidate;
  private challenges = new Map<string, Challenge>();
  private resumeChallenges = new Map<
    string,
    {nonce: string; expiresAt: number}
  >();
  private clientKeys = new Map<
    string,
    {privateKey: CryptoKey; publicKey: string; commit: string}
  >();
  private preparingKeys = new Set<string>();
  private deadline = 0;
  private attempts = 0;
  private offerOpen = true;
  private started = false;
  private closed = false;
  private generation = 0;
  private lastSeen = 0;
  private timer?: ReturnType<typeof setInterval>;
  private limits = new MessageLimits();
  private wireLimits = new MessageLimits();
  private sendSequence = {reliable: 0, unreliable: 0};
  private receiveSequence = {reliable: 0, unreliable: 0};
  private outbound: Record<Lane, Promise<void>> = {
    reliable: Promise.resolve(),
    unreliable: Promise.resolve(),
  };
  private inbound: Record<Lane, Promise<void>> = {
    reliable: Promise.resolve(),
    unreliable: Promise.resolve(),
  };
  private pending = {reliable: 0, unreliable: 0};
  private sending = {reliable: 0, unreliable: 0};
  private motion = EMPTY_MOTION();
  private motionDirty = false;
  private cancelMotionFrame?: () => void;
  private sensitivity = 1.5;
  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder();

  constructor(
    private readonly role: 'host' | 'phone',
    public pairing: PhonePairing,
    private readonly options: PhoneConnectionOptions & {
      onRoomCollision?: () => void;
    },
    private readonly receive: (message: PhoneMessage) => void,
    private readonly connection: (connected: boolean) => void
  ) {
    if (!text(pairing.roomId) || (!pairing.code && !pairing.token))
      throw new Error('A pairing invitation is required.');
    const manual = pairing.code
      ? phonePairingFromCode(pairing.code)
      : undefined;
    if (manual && manual.roomId !== pairing.roomId)
      throw new Error('Pairing code does not match its room.');
    if (pairing.token && !/^[A-Za-z0-9_-]{32,128}$/.test(pairing.token))
      throw new Error('QR pairing requires a long random token.');
    this.pairing = {...pairing, code: manual?.code};
    this.transport =
      options.transport ??
      options.transportFactory?.() ??
      new WebRTCTransport({unreliableChannel: true});
    this.roomCode = manual?.code;
    this.roomId = pairing.roomId;
  }

  get connected(): boolean {
    return this.peer !== undefined;
  }
  get canSharePairing(): boolean {
    return (
      this.role === 'host' &&
      this.offerOpen &&
      (!this.started || Date.now() < this.deadline) &&
      this.attempts < PAIRING_ATTEMPTS
    );
  }
  get pairingOpen(): boolean {
    return (
      this.role === 'host' &&
      this.offerOpen &&
      this.deadline > Date.now() &&
      this.attempts < PAIRING_ATTEMPTS
    );
  }
  get pendingPhone(): PhonePairingRequest | undefined {
    return this.role === 'host' && this.candidate
      ? {id: this.candidate.id, comparison: this.candidate.crypto.comparison}
      : undefined;
  }

  async connect(): Promise<void> {
    if (this.started || this.closed)
      throw new Error('Phone connection is single-use.');
    if (!crypto.subtle)
      throw new Error('Phone pairing requires HTTPS and Web Crypto.');
    if (!this.transport.supportsUnreliable)
      throw new Error(
        'Phone control requires an unreliable transport lane. Enable WebRTCTransport.unreliableChannel.'
      );
    this.started = true;
    this.transport.on('message', this.onMessage);
    this.transport.on('peer-join', this.onJoin);
    this.transport.on('peer-leave', this.onLeave);
    this.transport.on('close', this.onClose);
    this.transport.on('error', this.onError);
    try {
      await this.transport.connect({roomId: this.pairing.roomId});
      if (this.closed) {
        this.transport.close();
        return;
      }
      this.deadline = Date.now() + PAIRING_WINDOW_MS;
      this.pairing = {...this.pairing, expiresAt: this.deadline};
      for (const peer of this.transport.remotePeerIds)
        if (!this.memberships.has(peer))
          this.memberships.set(peer, ++this.membershipCounter);
      this.options.onPairingChange?.();
      this.tick();
      this.timer = setInterval(() => this.tick(), 1000);
    } catch (error) {
      this.close();
      throw error;
    }
  }

  /** Explicit headset decision, bound to this exchange and its comparison digits. */
  async accept(id: string): Promise<boolean> {
    const candidate = this.candidate;
    if (
      this.role !== 'host' ||
      this.closed ||
      !candidate ||
      candidate.id !== id ||
      this.memberships.get(candidate.peer) !== candidate.membership ||
      !this.offerOpen ||
      Date.now() >= this.deadline
    )
      return false;
    this.offerOpen = false; // Consume before awaiting crypto: an invitation is one-use.
    this.challenges.clear();
    this.candidate = undefined;
    this.pairing = createPhonePairing(); // Rotate both credentials; not offered until explicit replacement.
    this.options.onPairingRequest?.(null);
    this.options.onPairingChange?.();
    if (this.closed) return false;
    const epoch = randomSecret();
    const activeCrypto = await candidate.crypto.establish(epoch);
    const proof = await candidate.crypto.prove(
      JSON.stringify(['approved', candidate.transcript, epoch])
    );
    if (
      this.closed ||
      this.memberships.get(candidate.peer) !== candidate.membership
    )
      return false;
    this.session = {crypto: activeCrypto, peer: candidate.peer, epoch};
    this.write(
      {type: 'approved', id: candidate.crypto.id, epoch, proof},
      candidate.peer
    );
    this.activate(candidate.peer, epoch);
    return true;
  }

  reject(id: string): void {
    if (this.role !== 'host' || this.candidate?.id !== id) return;
    this.write({type: 'rejected'}, this.candidate.peer);
    this.candidate = undefined;
    this.options.onPairingRequest?.(null);
  }

  send(message: PhoneMessage): void {
    if (!this.connected || !validMessage(message)) return;
    if (
      message.type === 'move' ||
      message.type === 'scroll' ||
      message.type === 'zoom'
    ) {
      this.motion.sample++;
      if (message.type === 'move') {
        this.motion.x = Math.max(
          -1.2,
          Math.min(1.2, this.motion.x - message.x * this.sensitivity)
        );
        this.motion.y = Math.max(
          -1.2,
          Math.min(1.2, this.motion.y - message.y * this.sensitivity)
        );
      } else if (message.type === 'scroll') this.motion.scroll += message.delta;
      else this.motion.zoom += Math.log(message.factor);
      this.motionDirty = true;
      if (!this.cancelMotionFrame) {
        if (typeof requestAnimationFrame === 'function') {
          const id = requestAnimationFrame(() => this.flushMotion());
          this.cancelMotionFrame = () => cancelAnimationFrame(id);
        } else {
          const id = setTimeout(() => this.flushMotion(), 16);
          this.cancelMotionFrame = () => clearTimeout(id);
        }
      }
      return;
    }
    if (message.type === 'center') {
      this.motion.x = this.motion.y = 0;
      this.motion.sample++;
    }
    if (message.type === 'cancel') {
      this.cancelMotionFrame?.();
      this.cancelMotionFrame = undefined;
      this.motionDirty = false;
    }
    if (
      message.type === 'button' ||
      message.type === 'cancel' ||
      message.type === 'center'
    ) {
      // Reliable edge poses preserve press/release locations across lossy motion.
      message = {...message, motion: {...this.motion}};
    }
    if (!this.sendEncrypted(message, 'reliable')) this.close();
  }

  flushMotion(): void {
    this.cancelMotionFrame?.();
    this.cancelMotionFrame = undefined;
    if (!this.motionDirty || !this.connected) return;
    this.motionDirty = false;
    if (
      !this.sendEncrypted(
        {type: 'motion', state: {...this.motion}},
        'unreliable'
      )
    ) {
      this.motionDirty = true;
      const id = setTimeout(() => this.flushMotion(), 16);
      this.cancelMotionFrame = () => clearTimeout(id);
    }
  }

  close(): void {
    if (this.closed) return;
    // Teardown revokes local session keys synchronously, including pending work.
    this.closed = true;
    this.generation++;
    clearInterval(this.timer);
    this.cancelMotionFrame?.();
    this.transport.off('message', this.onMessage);
    this.transport.off('peer-join', this.onJoin);
    this.transport.off('peer-leave', this.onLeave);
    this.transport.off('close', this.onClose);
    this.transport.off('error', this.onError);
    this.transport.close();
    this.drop();
    this.session = undefined;
    this.candidate = undefined;
    this.clientKeys.clear();
    this.preparingKeys.clear();
    this.challenges.clear();
    this.resumeChallenges.clear();
    this.offerOpen = false;
    this.memberships.clear();
    this.options.onPairingRequest?.(null);
  }

  private write(packet: object, peer: string): void {
    if (!this.closed && this.transport.isOpen && text(peer))
      this.transport.send(
        this.encoder.encode(JSON.stringify({v: 2, ...packet})),
        peer
      );
  }

  private tick(): void {
    if (this.peer && Date.now() - this.lastSeen > 5000) this.drop();
    if (this.peer) {
      this.send({type: 'ping'});
      return;
    }
    if (this.role === 'host') {
      if (this.offerOpen && Date.now() >= this.deadline) {
        this.close();
        this.options.onPairingChange?.();
      }
      for (const peer of this.transport.remotePeerIds) void this.announce(peer);
      return;
    }
    if (!this.session && this.deadline > 0 && Date.now() >= this.deadline) {
      this.deadline = 0;
      this.candidate = undefined;
      this.clientKeys.clear();
      this.options.onStatus?.(
        'Invitation timed out. Choose New code on the headset.'
      );
      return;
    }
    if (this.candidate || this.challenges.size) return;
    for (const peer of this.transport.remotePeerIds) this.knock(peer);
  }

  private knock(peer: string): void {
    if (!text(peer)) return;
    if (this.session) {
      this.write({type: 'resume', id: this.session.crypto.id}, peer);
    } else if (
      Date.now() < this.deadline &&
      !this.clientKeys.has(peer) &&
      !this.preparingKeys.has(peer) &&
      this.wireLimits.allow('knock-send', 1, 2)
    ) {
      this.preparingKeys.add(peer);
      const membership = this.memberships.get(peer);
      void (async () => {
        const key = await createEphemeralKey();
        const commit = await keyCommitment(key.publicKey);
        if (
          this.closed ||
          this.candidate ||
          this.session ||
          Date.now() >= this.deadline ||
          this.memberships.get(peer) !== membership
        )
          return;
        this.clientKeys.set(peer, {...key, commit});
        this.write(
          {type: 'knock', mode: this.pairing.token ? 'qr' : 'code', commit},
          peer
        );
      })()
        .catch((error) => this.options.onError?.(error))
        .finally(() => this.preparingKeys.delete(peer));
    }
  }

  private async announce(peer: string): Promise<void> {
    if (
      this.closed ||
      !this.roomCode ||
      !text(peer) ||
      this.announced.has(peer)
    )
      return;
    this.announced.add(peer);
    const value = randomSecret();
    const proof = await credentialProof(
      this.roomCode,
      JSON.stringify([
        'host-presence',
        this.roomId,
        this.transport.localPeerId,
        peer,
        value,
      ])
    );
    this.write({type: 'host-presence', nonce: value, proof}, peer);
  }

  private transcript(
    peer: string,
    challenge: Challenge,
    clientPublic: string
  ): string {
    const host = this.role === 'host' ? this.transport.localPeerId : peer;
    const phone = this.role === 'phone' ? this.transport.localPeerId : peer;
    return JSON.stringify([
      'xrblocks-phone-v2',
      host,
      phone,
      challenge.mode,
      challenge.commit,
      challenge.nonce,
      challenge.key.publicKey,
      clientPublic,
    ]);
  }

  private async handle(
    packet: Record<string, unknown>,
    peer: string,
    lane: Lane,
    membership: number
  ): Promise<void> {
    const current = () =>
      !this.closed && this.memberships.get(peer) === membership;
    if (!current()) return;
    if (packet.type === 'data') {
      await this.receiveEncrypted(packet, peer, lane);
      return;
    }
    if (lane !== 'reliable' || !this.wireLimits.allow('handshake', 10, 15))
      return;
    if (this.role === 'host' && packet.type === 'host-presence') {
      if (
        this.session ||
        !this.offerOpen ||
        !this.roomCode ||
        peer === this.transport.localPeerId ||
        !nonce(packet.nonce) ||
        !nonce(packet.proof)
      )
        return;
      if (
        !(await verifyCredential(
          this.roomCode,
          JSON.stringify([
            'host-presence',
            this.roomId,
            peer,
            this.transport.localPeerId,
            packet.nonce,
          ]),
          packet.proof
        )) ||
        !current() ||
        this.session ||
        !this.offerOpen
      )
        return;
      // Both tentative hosts may roll on a simultaneous claim. Their independent
      // random invitations break the tie; an approved session is never displaced.
      this.offerOpen = false;
      this.candidate = undefined;
      this.challenges.clear();
      this.options.onPairingRequest?.(null);
      this.options.onPairingChange?.();
      this.options.onRoomCollision?.();
    } else if (this.role === 'host' && packet.type === 'knock') {
      if (!this.pairingOpen || this.candidate || this.challenges.has(peer))
        return;
      const mode = packet.mode;
      if (mode !== 'qr' && mode !== 'code') return;
      this.attempts++;
      if (!nonce(packet.commit)) return;
      const secret = mode === 'qr' ? this.pairing.token : this.pairing.code;
      if (!secret) return;
      const key = await createEphemeralKey();
      if (!this.offerOpen || !current() || Date.now() >= this.deadline) return;
      const challenge: Challenge = {
        nonce: randomSecret(),
        key,
        mode,
        commit: packet.commit,
      };
      this.challenges.set(peer, challenge);
      const proof = await credentialProof(
        secret,
        JSON.stringify([
          'challenge',
          this.transport.localPeerId,
          peer,
          mode,
          challenge.commit,
          challenge.nonce,
          key.publicKey,
        ])
      );
      if (!current()) return;
      this.write(
        {
          type: 'challenge',
          commit: challenge.commit,
          nonce: challenge.nonce,
          key: key.publicKey,
          mode,
          proof,
        },
        peer
      );
      this.options.onPairingChange?.();
    } else if (this.role === 'phone' && packet.type === 'challenge') {
      const clientKey = this.clientKeys.get(peer);
      if (
        !clientKey ||
        packet.commit !== clientKey.commit ||
        Date.now() >= this.deadline ||
        this.session ||
        this.candidate ||
        !nonce(packet.nonce) ||
        !text(packet.key) ||
        !nonce(packet.proof) ||
        packet.mode !== (this.pairing.token ? 'qr' : 'code')
      )
        return;
      if (
        !(await verifyCredential(
          this.pairing.token ?? this.pairing.code!,
          JSON.stringify([
            'challenge',
            peer,
            this.transport.localPeerId,
            packet.mode,
            clientKey.commit,
            packet.nonce,
            packet.key,
          ]),
          packet.proof
        ))
      )
        return;
      if (!current()) return;
      const challenge: Challenge = {
        commit: clientKey.commit,
        nonce: packet.nonce,
        key: {privateKey: clientKey.privateKey, publicKey: packet.key},
        mode: this.pairing.token ? 'qr' : 'code',
      };
      const transcript = this.transcript(peer, challenge, clientKey.publicKey);
      const session = await SessionCrypto.derive(
        clientKey.privateKey,
        packet.key,
        transcript
      );
      if (!current()) return;
      const proof = await credentialProof(
        this.pairing.token ?? this.pairing.code!,
        transcript
      );
      if (!current()) return;
      this.candidate = {
        peer,
        membership,
        crypto: session,
        transcript,
        id: session.id,
      };
      this.write({type: 'claim', key: clientKey.publicKey, proof}, peer);
      this.clientKeys.clear();
      this.options.onStatus?.(
        `Compare ${session.comparison} in the headset, then choose Accept.`
      );
    } else if (this.role === 'host' && packet.type === 'claim') {
      const challenge = this.challenges.get(peer);
      this.challenges.delete(peer); // Every challenge can be attempted only once.
      if (
        !challenge ||
        !this.offerOpen ||
        this.candidate ||
        Date.now() >= this.deadline ||
        !text(packet.key) ||
        !nonce(packet.proof)
      )
        return;
      const transcript = this.transcript(peer, challenge, packet.key);
      if ((await keyCommitment(packet.key)) !== challenge.commit) return;
      const secret =
        challenge.mode === 'qr' ? this.pairing.token : this.pairing.code;
      if (
        !secret ||
        !(await verifyCredential(secret, transcript, packet.proof))
      ) {
        this.write({type: 'rejected'}, peer);
        return;
      }
      const session = await SessionCrypto.derive(
        challenge.key.privateKey,
        packet.key,
        transcript
      );
      if (!current() || !this.offerOpen || Date.now() >= this.deadline) return;
      this.candidate = {
        peer,
        membership,
        crypto: session,
        transcript,
        id: session.id,
      };
      this.options.onPairingRequest?.({
        id: session.id,
        comparison: session.comparison,
      });
    } else if (this.role === 'phone' && packet.type === 'approved') {
      const candidate = this.candidate;
      if (
        !candidate ||
        peer !== candidate.peer ||
        packet.id !== candidate.crypto.id ||
        !nonce(packet.epoch) ||
        !nonce(packet.proof)
      )
        return;
      if (
        !(await candidate.crypto.verify(
          JSON.stringify(['approved', candidate.transcript, packet.epoch]),
          packet.proof
        )) ||
        !current()
      )
        return;
      const activeCrypto = await candidate.crypto.establish(packet.epoch);
      if (!current() || this.candidate !== candidate) return;
      this.session = {crypto: activeCrypto, peer, epoch: packet.epoch};
      this.candidate = undefined;
      this.clientKeys.clear();
      this.pairing = {roomId: this.pairing.roomId};
      this.activate(peer, packet.epoch);
    } else if (this.role === 'host' && packet.type === 'resume') {
      if (
        !this.session ||
        this.peer ||
        packet.id !== this.session.crypto.id ||
        !this.wireLimits.allow('resume', 2, 4)
      )
        return;
      const existing = this.resumeChallenges.get(peer);
      const pending =
        existing && existing.expiresAt > Date.now()
          ? existing
          : {nonce: randomSecret(), expiresAt: Date.now() + 10000};
      const challenge = pending.nonce;
      this.resumeChallenges.set(peer, pending);
      if (this.resumeChallenges.size > 12)
        this.resumeChallenges.delete(
          this.resumeChallenges.keys().next().value!
        );
      this.write(
        {
          type: 'resume-challenge',
          id: this.session.crypto.id,
          nonce: challenge,
        },
        peer
      );
    } else if (this.role === 'phone' && packet.type === 'resume-challenge') {
      if (
        !this.session ||
        this.peer ||
        packet.id !== this.session.crypto.id ||
        !nonce(packet.nonce)
      )
        return;
      const transcript = JSON.stringify([
        'resume',
        this.session.crypto.id,
        peer,
        this.transport.localPeerId,
        packet.nonce,
      ]);
      const proof = await this.session.crypto.prove(transcript);
      if (!current()) return;
      this.resumeChallenges.set(peer, {
        nonce: packet.nonce,
        expiresAt: Date.now() + 10000,
      });
      this.write(
        {
          type: 'resume-proof',
          id: this.session.crypto.id,
          nonce: packet.nonce,
          proof,
        },
        peer
      );
    } else if (this.role === 'host' && packet.type === 'resume-proof') {
      const session = this.session;
      const pending = this.resumeChallenges.get(peer);
      if (
        !session ||
        this.peer ||
        !pending ||
        pending.expiresAt < Date.now() ||
        pending.nonce !== packet.nonce ||
        packet.id !== session.crypto.id ||
        !nonce(packet.proof)
      )
        return;
      this.resumeChallenges.delete(peer);
      const challenge = pending.nonce;
      const transcript = JSON.stringify([
        'resume',
        session.crypto.id,
        this.transport.localPeerId,
        peer,
        challenge,
      ]);
      if (
        !(await session.crypto.verify(transcript, packet.proof)) ||
        !current() ||
        this.session !== session
      )
        return;
      const proof = await session.crypto.prove(`accepted:${transcript}`);
      if (!current()) return;
      this.write(
        {type: 'resumed', id: session.crypto.id, nonce: challenge, proof},
        peer
      );
      this.activate(peer, challenge);
    } else if (this.role === 'phone' && packet.type === 'resumed') {
      const session = this.session;
      const pending = this.resumeChallenges.get(peer);
      if (
        !session ||
        !pending ||
        pending.expiresAt < Date.now() ||
        packet.nonce !== pending.nonce ||
        packet.id !== session.crypto.id ||
        !nonce(packet.proof)
      )
        return;
      this.resumeChallenges.delete(peer);
      const challenge = pending.nonce;
      const transcript = JSON.stringify([
        'resume',
        session.crypto.id,
        peer,
        this.transport.localPeerId,
        challenge,
      ]);
      if (
        (await session.crypto.verify(`accepted:${transcript}`, packet.proof)) &&
        current() &&
        this.session === session
      )
        this.activate(peer, challenge);
    } else if (
      this.role === 'phone' &&
      packet.type === 'rejected' &&
      this.candidate?.peer === peer
    ) {
      this.candidate = undefined;
      this.deadline = 0;
      this.options.onStatus?.(
        'Pairing rejected or code expired. Ask the headset for a fresh invitation.'
      );
    }
  }

  private activate(peer: string, epoch: string): void {
    if (!this.session || this.closed) return;
    this.session.peer = peer;
    this.session.epoch = epoch;
    this.peer = peer;
    this.lastSeen = Date.now();
    this.generation++;
    this.sendSequence = {reliable: 0, unreliable: 0};
    this.receiveSequence = {reliable: 0, unreliable: 0};
    this.motion = EMPTY_MOTION();
    this.motionDirty = false;
    this.connection(true);
    this.options.onConnectionChange?.(true);
  }

  private sendEncrypted(message: PhoneMessage, lane: Lane): boolean {
    const session = this.session;
    const peer = this.peer;
    const generation = this.generation;
    if (
      !session ||
      !peer ||
      this.closed ||
      this.sending[lane] >= (lane === 'unreliable' ? 1 : 32)
    )
      return false;
    this.sending[lane]++;
    const epoch = session.epoch;
    this.outbound[lane] = this.outbound[lane]
      .then(async () => {
        if (this.closed || generation !== this.generation || !this.peer) return;
        const seq = ++this.sendSequence[lane];
        const header = JSON.stringify([
          session.crypto.id,
          epoch,
          this.role,
          lane,
          seq,
        ]);
        const encrypted = await session.crypto.encrypt(
          this.role,
          header,
          message
        );
        if (this.closed || generation !== this.generation) return;
        const data = this.encoder.encode(
          JSON.stringify({
            v: 2,
            type: 'data',
            id: session.crypto.id,
            epoch,
            lane,
            seq,
            ...encrypted,
          })
        );
        if (lane === 'unreliable') this.transport.sendUnreliable(data, peer);
        else this.transport.send(data, peer);
      })
      .catch((error) => this.options.onError?.(error))
      .finally(() => {
        this.sending[lane]--;
      });
    return true;
  }

  private async receiveEncrypted(
    packet: Record<string, unknown>,
    peer: string,
    lane: Lane
  ): Promise<void> {
    const session = this.session;
    const generation = this.generation;
    if (
      !session ||
      peer !== this.peer ||
      packet.id !== session.crypto.id ||
      packet.epoch !== session.epoch ||
      packet.lane !== lane ||
      !Number.isSafeInteger(packet.seq) ||
      (packet.seq as number) <= this.receiveSequence[lane] ||
      !text(packet.iv, 32) ||
      !text(packet.body, 95000)
    )
      return;
    const sender = this.role === 'host' ? 'phone' : 'host';
    const header = JSON.stringify([
      session.crypto.id,
      session.epoch,
      sender,
      lane,
      packet.seq,
    ]);
    const message = await session.crypto.decrypt(
      sender,
      header,
      packet.iv,
      packet.body
    );
    if (this.closed || generation !== this.generation || !validMessage(message))
      return;
    const rate = (this.role === 'host' ? HOST_MESSAGES : PHONE_MESSAGES)[
      message.type
    ];
    if (!rate || (message.type === 'motion') !== (lane === 'unreliable'))
      return;
    // Authenticate before reacting to a gap. Losing a reliable release must
    // cancel capture, not leave a button held while later pings keep it alive.
    if (lane === 'reliable' && packet.seq !== this.receiveSequence[lane] + 1) {
      this.drop();
      return;
    }
    this.receiveSequence[lane] = packet.seq as number;
    if (!this.limits.allow(message.type, rate, rate * 2)) {
      if (lane === 'reliable') this.drop();
      return;
    }
    this.lastSeen = Date.now();
    if (message.type === 'bye') {
      this.drop();
      return;
    }
    if (message.type === 'pointer-config')
      this.sensitivity = message.sensitivity;
    this.receive(message);
  }

  private onMessage = (
    event: CustomEvent<TransportMessageEventDetail>
  ): void => {
    const {peerId, data} = event.detail;
    const trustedPeer = peerId === this.peer;
    if (
      this.closed ||
      data.byteLength > 100000 ||
      !this.wireLimits.allow(
        trustedPeer ? 'active-wire' : 'untrusted-wire',
        trustedPeer ? 200 : 20,
        trustedPeer ? 250 : 30
      )
    )
      return;
    let packet: Record<string, unknown>;
    try {
      packet = JSON.parse(this.decoder.decode(data));
    } catch {
      return;
    }
    if (!packet || packet.v !== 2 || !text(packet.type, 32)) return;
    const lane = event.detail.delivery ?? 'reliable';
    const membership = this.memberships.get(peerId);
    if (membership === undefined) return;
    if (this.pending[lane] >= (lane === 'unreliable' ? 2 : 32)) return;
    this.pending[lane]++;
    this.inbound[lane] = this.inbound[lane]
      .then(() =>
        this.closed ? undefined : this.handle(packet, peerId, lane, membership)
      )
      .catch(() => {
        // Invalid proofs/ciphertexts are unauthenticated input, not app errors.
      })
      .finally(() => {
        this.pending[lane]--;
      });
  };

  private drop(): void {
    if (!this.peer) return;
    this.peer = undefined;
    this.generation++;
    this.cancelMotionFrame?.();
    this.cancelMotionFrame = undefined;
    this.connection(false);
    this.options.onConnectionChange?.(false);
  }
  private onJoin = (event: CustomEvent<{peerId: string}>): void => {
    if (!this.memberships.has(event.detail.peerId))
      this.memberships.set(event.detail.peerId, ++this.membershipCounter);
    if (this.role === 'phone' && !this.peer) this.knock(event.detail.peerId);
    if (this.role === 'host') void this.announce(event.detail.peerId);
  };
  private onLeave = (event: CustomEvent<{peerId: string}>): void => {
    const peer = event.detail.peerId;
    this.clientKeys.delete(peer);
    this.memberships.delete(peer);
    this.announced.delete(peer);
    this.challenges.delete(peer);
    this.resumeChallenges.delete(peer);
    if (this.candidate?.peer === peer) {
      this.candidate = undefined;
      this.clientKeys.clear();
      this.options.onPairingRequest?.(null);
      if (this.role === 'phone' && !this.session) {
        this.deadline = 0;
        this.options.onStatus?.(
          'Headset changed its invitation. Enter the new code.'
        );
      }
    }
    if (peer === this.peer) this.drop();
  };
  private onClose = (): void => {
    this.close();
  };
  private onError = (event: CustomEvent<{error: Error}>): void => {
    this.options.onError?.(event.detail.error);
  };
}
