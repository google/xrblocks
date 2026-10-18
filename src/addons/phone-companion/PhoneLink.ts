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
  /** Headset accepted; keep the number visible until the phone confirms it. */
  accepted?: boolean;
}

export type PhoneConnectionState =
  | {type: 'connecting' | 'connected' | 'reconnecting'}
  | {type: 'verification'; id: string; comparison: string; confirmed: boolean}
  | {type: 'failed'; reason: 'expired' | 'rejected' | 'connection'};

export interface PhoneConnectionOptions {
  /** Fresh, exclusively owned instance. Supply transportFactory for automatic reconnection. */
  transport?: Transport;
  /** Returns a fresh exclusively owned transport for replacement/background recovery. */
  transportFactory?: () => Transport;
  onConnectionChange?: (connected: boolean) => void;
  onPairingRequest?: (request: PhonePairingRequest | null) => void;
  onPairingChange?: () => void;
  onStatus?: (message: string) => void;
  onStateChange?: (state: PhoneConnectionState) => void;
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
  confirmed?: boolean;
  accepting?: boolean;
  approval?: {epoch: string; crypto: SessionCrypto};
  confirmationDeadline?: number;
};
type Session = {crypto: SessionCrypto; peer: string; epoch: string};
const CONFIRMATION_WINDOW_MS = 30000;
const SESSION_ANNOUNCE_INTERVAL_MS = 3000;
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
  private transport: Transport;
  private readonly transportFactory?: () => Transport;
  private foreground = true;
  private needsRecovery = false;
  private recovering?: Promise<void>;
  private retryAt = 0;
  private recoveryAttempts = 0;
  private initialReady = false;
  private standby?: {
    transport: Transport;
    ready: boolean;
    packets: Map<string, TransportMessageEventDetail>;
    cleanup: () => void;
  };
  private readonly roomCode?: string;
  private readonly roomId: string;
  private announced = new Map<string, number>();
  private memberships = new Map<string, number>();
  private membershipCounter = 0;
  private peer?: string;
  // A phone's pairing transport may be a mesh. Only a credential/session-
  // authenticated host announcement admits a peer to the companion protocol.
  private hostPeer?: string;
  private session?: Session;
  private candidate?: Candidate;
  private challenges = new Map<string, Challenge>();
  private resumeChallenges = new Map<
    string,
    {phoneNonce: string; hostNonce?: string; expiresAt: number}
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
    this.transportFactory =
      options.transportFactory ??
      (options.transport
        ? undefined
        : () => new WebRTCTransport({unreliableChannel: true}));
    this.transport = options.transport ?? this.transportFactory!();
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
    return this.role === 'host' && this.candidate && !this.candidate.accepting
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
    this.options.onStateChange?.({type: 'connecting'});
    this.listen(this.transport);
    try {
      await this.transport.connect({roomId: this.pairing.roomId});
      if (this.closed) {
        this.transport.close();
        return;
      }
      this.deadline = Date.now() + PAIRING_WINDOW_MS;
      this.initialReady = true;
      this.pairing = {...this.pairing, expiresAt: this.deadline};
      for (const peer of this.transport.remotePeerIds)
        if (!this.memberships.has(peer))
          this.memberships.set(peer, ++this.membershipCounter);
      this.options.onPairingChange?.();
      this.tick();
      this.timer = setInterval(() => this.tick(), 1000);
    } catch (error) {
      this.close();
      this.options.onStateChange?.({type: 'failed', reason: 'connection'});
      throw new Error('Phone connection error.', {cause: error});
    }
  }

  /** The page stays alive while hidden; only explicit disposal revokes its session key. */
  setForeground(visible: boolean): void {
    const returning = !this.foreground && visible;
    this.foreground = visible;
    if (this.closed || this.role !== 'phone' || !this.initialReady) return;
    if (returning && this.session && !this.peer)
      this.options.onStateChange?.({type: 'reconnecting'});
    if (returning && this.needsRecovery) {
      this.retryAt = 0;
      void this.recoverTransport();
    }
  }

  private listen(transport: Transport): void {
    transport.on('message', this.onMessage);
    transport.on('peer-join', this.onJoin);
    transport.on('peer-leave', this.onLeave);
    transport.on('close', this.onClose);
    transport.on('error', this.onError);
  }

  private unlisten(transport: Transport): void {
    transport.off('message', this.onMessage);
    transport.off('peer-join', this.onJoin);
    transport.off('peer-leave', this.onLeave);
    transport.off('close', this.onClose);
    transport.off('error', this.onError);
  }

  private recoverTransport(): Promise<void> {
    if (this.recovering) return this.recovering;
    if (
      this.closed ||
      !this.initialReady ||
      (this.role === 'phone' && !this.foreground) ||
      !this.needsRecovery ||
      !this.transportFactory ||
      Date.now() < this.retryAt
    )
      return Promise.resolve();
    if (this.standby) {
      this.promoteStandby();
      return Promise.resolve();
    }
    const generation = this.generation;
    // A broker repair gets a standby connection. The approved data path and
    // pending verification stay live until they actually disconnect/expire.
    this.recovering = Promise.resolve()
      .then(async () => {
        if (this.closed || generation !== this.generation) return;
        if (
          this.transport instanceof WebRTCTransport &&
          this.transport.isOpen
        ) {
          if (this.transport.isSignalingOpen) {
            // Data-peer discovery has its own backoff. A lost peer is not a
            // reason to repeatedly reopen an already healthy broker socket.
            this.needsRecovery = false;
            return;
          }
          try {
            // Reclaiming the same slot with a *new* RTCPeerConnection would
            // replace the remote's healthy channel. Repair only signaling.
            await this.transport.reconnectSignaling();
            if (this.closed || generation !== this.generation) return;
            this.needsRecovery = false;
            this.retryAt = 0;
            this.recoveryAttempts = 0;
            return;
          } catch {
            if (this.closed || generation !== this.generation) return;
            if (
              this.peer ||
              this.candidate ||
              this.challenges.size ||
              this.clientKeys.size
            ) {
              this.retryAt =
                Date.now() +
                Math.min(1000 * 2 ** this.recoveryAttempts++, 10000);
              return;
            }
            // A lost data path may move to a fresh slot, but only once its
            // replacement has connected. The session key still authenticates it.
          }
        }
        try {
          const transport = this.transportFactory!();
          if (transport === this.transport || !transport.supportsUnreliable)
            throw new Error('A fresh unreliable transport is required.');
          const standby = {
            transport,
            ready: false,
            packets: new Map<string, TransportMessageEventDetail>(),
            cleanup: () => {},
          };
          const buffer = (event: CustomEvent<TransportMessageEventDetail>) => {
            const {peerId, data} = event.detail;
            if (
              data.byteLength > 2048 ||
              this.ownsPeer(peerId) ||
              !transport.remotePeerIds.has(peerId) ||
              !this.wireLimits.allow('standby-wire', 20, 30)
            )
              return;
            if (standby.packets.has(peerId) || standby.packets.size < 12)
              standby.packets.set(peerId, event.detail);
          };
          const failed = () => {
            if (this.standby !== standby) return;
            standby.cleanup();
            this.standby = undefined;
            transport.close();
            this.retryAt =
              Date.now() + Math.min(1000 * 2 ** this.recoveryAttempts++, 10000);
          };
          const error = (event: CustomEvent<{error: Error}>) => {
            if (event.detail.error.message === 'Signaling channel closed.')
              failed();
            else this.reportError(event.detail.error);
          };
          standby.cleanup = () => {
            transport.off('message', buffer);
            transport.off('close', failed);
            transport.off('error', error);
          };
          this.standby = standby;
          transport.on('message', buffer);
          transport.on('close', failed);
          transport.on('error', error);
          await transport.connect({roomId: this.roomId});
          if (this.closed || this.standby !== standby) {
            standby.cleanup();
            transport.close();
            return;
          }
          standby.ready = true;
          this.retryAt = 0;
          this.recoveryAttempts = 0;
          this.promoteStandby();
        } catch {
          if (this.closed || generation !== this.generation) return;
          this.standby?.cleanup();
          this.standby?.transport.close();
          this.standby = undefined;
          this.retryAt =
            Date.now() + Math.min(1000 * 2 ** this.recoveryAttempts++, 10000);
        }
      })
      .finally(() => {
        this.recovering = undefined;
      });
    return this.recovering;
  }

  private ownsPeer(peer: string): boolean {
    return (
      peer === this.transport.localPeerId ||
      peer === this.standby?.transport.localPeerId
    );
  }

  private promoteStandby(): void {
    const standby = this.standby;
    if (
      this.closed ||
      !standby?.ready ||
      this.peer ||
      this.candidate ||
      this.challenges.size ||
      this.clientKeys.size ||
      this.preparingKeys.size
    )
      return;
    const previous = this.transport;
    standby.cleanup();
    this.standby = undefined;
    this.unlisten(previous);
    this.transport = standby.transport;
    this.generation++;
    this.hostPeer = undefined;
    this.memberships.clear();
    this.announced.clear();
    this.resumeChallenges.clear();
    this.needsRecovery = false;
    if (this.session) this.options.onStateChange?.({type: 'reconnecting'});
    this.listen(this.transport);
    for (const peer of this.transport.remotePeerIds)
      if (!this.ownsPeer(peer) && peer !== previous.localPeerId)
        this.memberships.set(peer, ++this.membershipCounter);
    previous.close();
    if (this.role === 'host')
      for (const peer of this.memberships.keys()) void this.announce(peer);
    for (const detail of standby.packets.values())
      if (detail.peerId !== previous.localPeerId)
        this.onMessage(new CustomEvent('message', {detail}));
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
    candidate.accepting = true;
    this.pairing = createPhonePairing(); // Rotate both credentials; not offered until explicit replacement.
    this.options.onPairingRequest?.({
      id: candidate.id,
      comparison: candidate.crypto.comparison,
      accepted: true,
    });
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
    if (this.candidate !== candidate) return false;
    candidate.approval = {crypto: activeCrypto, epoch};
    this.write(
      {type: 'approved', id: candidate.crypto.id, epoch, proof},
      candidate.peer
    );
    return true;
  }

  /** Local phone decision, bound to the displayed verification request. */
  async confirmNumbers(id: string): Promise<boolean> {
    const candidate = this.candidate;
    if (
      this.closed ||
      this.role !== 'phone' ||
      !candidate ||
      candidate.id !== id ||
      Date.now() >= (candidate.confirmationDeadline ?? this.deadline)
    )
      return false;
    candidate.confirmed = true;
    this.options.onStateChange?.({
      type: 'verification',
      id,
      comparison: candidate.crypto.comparison,
      confirmed: true,
    });
    await this.confirmApproval(candidate);
    return true;
  }

  private async confirmApproval(candidate: Candidate): Promise<void> {
    const approval = candidate.approval;
    if (!candidate.confirmed || !approval) return;
    const proof = await approval.crypto.prove(
      JSON.stringify(['phone-confirmed', candidate.transcript, approval.epoch])
    );
    if (
      this.closed ||
      this.candidate !== candidate ||
      this.memberships.get(candidate.peer) !== candidate.membership
    )
      return;
    this.write(
      {
        type: 'phone-confirmed',
        id: approval.crypto.id,
        epoch: approval.epoch,
        proof,
      },
      candidate.peer
    );
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
    this.standby?.cleanup();
    this.standby?.transport.close();
    this.standby = undefined;
    this.generation++;
    clearInterval(this.timer);
    this.cancelMotionFrame?.();
    this.unlisten(this.transport);
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
    if (this.closed || !this.initialReady) return;
    if (this.role === 'phone' && !this.foreground) return;
    if (this.peer && Date.now() - this.lastSeen > 5000) this.drop();
    if (this.needsRecovery) void this.recoverTransport();
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
    if (
      !this.session &&
      !(this.candidate?.approval && this.candidate.confirmed) &&
      this.deadline > 0 &&
      Date.now() >= (this.candidate?.confirmationDeadline ?? this.deadline)
    ) {
      this.deadline = 0;
      this.candidate = undefined;
      this.clientKeys.clear();
      this.options.onStateChange?.({type: 'failed', reason: 'expired'});
      this.options.onStatus?.(
        'Invitation timed out. Choose Pair a different phone in the headset.'
      );
      return;
    }
    if (this.candidate || this.challenges.size) return;
    if (this.hostPeer && this.transport.remotePeerIds.has(this.hostPeer))
      this.knock(this.hostPeer);
  }

  private knock(peer: string): void {
    if (!text(peer) || peer !== this.hostPeer) return;
    if (this.session) {
      let pending = this.resumeChallenges.get(peer);
      if (!pending || pending.expiresAt <= Date.now()) {
        pending = {phoneNonce: randomSecret(), expiresAt: Date.now() + 10000};
        this.resumeChallenges.set(peer, pending);
      }
      this.write(
        {
          type: 'resume',
          id: this.session.crypto.id,
          phoneNonce: pending.phoneNonce,
        },
        peer
      );
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
        .catch((error) => this.reportError(error))
        .finally(() => this.preparingKeys.delete(peer));
    }
  }

  private async announce(peer: string): Promise<void> {
    const last = this.announced.get(peer);
    if (
      this.closed ||
      this.ownsPeer(peer) ||
      !text(peer) ||
      (last !== undefined &&
        (!this.session ||
          this.peer ||
          Date.now() - last < SESSION_ANNOUNCE_INTERVAL_MS))
    )
      return;
    this.announced.set(peer, Date.now());
    const membership = this.memberships.get(peer);
    const value = randomSecret();
    const session = this.session;
    const transcript = JSON.stringify([
      'host-presence',
      this.roomId,
      this.transport.localPeerId,
      peer,
      value,
    ]);
    const [proof, qrProof, resumeProof] = await Promise.all([
      this.roomCode ? credentialProof(this.roomCode, transcript) : undefined,
      !session && this.pairing.token
        ? credentialProof(this.pairing.token, transcript)
        : undefined,
      session
        ? session.crypto.prove(
            JSON.stringify([
              'resume-host',
              session.crypto.id,
              this.transport.localPeerId,
              peer,
              value,
            ])
          )
        : undefined,
    ]);
    if (this.session === session && this.memberships.get(peer) === membership)
      this.write(
        {
          type: 'host-presence',
          nonce: value,
          proof,
          qrProof,
          resumeProof,
          id: session?.crypto.id,
        },
        peer
      );
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
      !this.closed &&
      this.transport.isOpen &&
      this.memberships.get(peer) === membership;
    if (!current()) return;
    if (packet.type === 'data') {
      await this.receiveEncrypted(packet, peer, lane);
      return;
    }
    if (lane !== 'reliable' || !this.wireLimits.allow('handshake', 10, 15))
      return;
    if (this.role === 'phone' && packet.type === 'host-presence') {
      if (this.peer || this.candidate || !nonce(packet.nonce)) return;
      const session = this.session;
      if (session) {
        if (
          packet.id !== session.crypto.id ||
          !nonce(packet.resumeProof) ||
          !(await session.crypto.verify(
            JSON.stringify([
              'resume-host',
              session.crypto.id,
              peer,
              this.transport.localPeerId,
              packet.nonce,
            ]),
            packet.resumeProof
          ))
        )
          return;
      } else {
        const secret = this.pairing.token ?? this.pairing.code;
        const proof = this.pairing.token ? packet.qrProof : packet.proof;
        if (
          !secret ||
          !nonce(proof) ||
          Date.now() >= this.deadline ||
          !(await verifyCredential(
            secret,
            JSON.stringify([
              'host-presence',
              this.roomId,
              peer,
              this.transport.localPeerId,
              packet.nonce,
            ]),
            proof
          ))
        )
          return;
      }
      if (!current() || this.session !== session || this.candidate || this.peer)
        return;
      if (this.hostPeer !== peer) this.resumeChallenges.clear();
      this.hostPeer = peer;
      this.knock(peer);
    } else if (this.role === 'host' && packet.type === 'host-presence') {
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
        `Compare ${session.comparison} in the headset, then choose Accept phone.`
      );
      this.options.onStateChange?.({
        type: 'verification',
        id: session.id,
        comparison: session.comparison,
        confirmed: false,
      });
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
      const receivedAt = Date.now();
      if (
        !candidate ||
        candidate.approval ||
        receivedAt >= this.deadline ||
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
      if (
        !current() ||
        this.candidate !== candidate ||
        Date.now() >= receivedAt + CONFIRMATION_WINDOW_MS
      )
        return;
      candidate.approval = {crypto: activeCrypto, epoch: packet.epoch};
      candidate.confirmationDeadline = receivedAt + CONFIRMATION_WINDOW_MS;
      await this.confirmApproval(candidate);
    } else if (this.role === 'host' && packet.type === 'phone-confirmed') {
      const candidate = this.candidate;
      const approval = candidate?.approval;
      if (
        !candidate ||
        !approval ||
        candidate.peer !== peer ||
        packet.id !== approval.crypto.id ||
        packet.epoch !== approval.epoch ||
        !nonce(packet.proof)
      )
        return;
      if (
        !(await approval.crypto.verify(
          JSON.stringify([
            'phone-confirmed',
            candidate.transcript,
            approval.epoch,
          ]),
          packet.proof
        )) ||
        !current() ||
        this.candidate !== candidate
      )
        return;
      const proof = await approval.crypto.prove(
        JSON.stringify(['paired', candidate.transcript, approval.epoch])
      );
      if (!current() || this.candidate !== candidate) return;
      this.session = {crypto: approval.crypto, peer, epoch: approval.epoch};
      this.candidate = undefined;
      this.options.onPairingRequest?.(null);
      this.write(
        {type: 'paired', id: approval.crypto.id, epoch: approval.epoch, proof},
        peer
      );
      this.activate(peer, approval.epoch);
    } else if (this.role === 'phone' && packet.type === 'paired') {
      const candidate = this.candidate;
      const approval = candidate?.approval;
      if (
        !candidate?.confirmed ||
        !approval ||
        candidate.peer !== peer ||
        packet.id !== approval.crypto.id ||
        packet.epoch !== approval.epoch ||
        !nonce(packet.proof)
      )
        return;
      if (
        !(await approval.crypto.verify(
          JSON.stringify(['paired', candidate.transcript, approval.epoch]),
          packet.proof
        )) ||
        !current() ||
        this.candidate !== candidate
      )
        return;
      this.session = {crypto: approval.crypto, peer, epoch: approval.epoch};
      this.candidate = undefined;
      this.clientKeys.clear();
      this.pairing = {roomId: this.roomId};
      this.activate(peer, approval.epoch);
    } else if (this.role === 'host' && packet.type === 'resume') {
      if (
        !this.session ||
        this.peer ||
        packet.id !== this.session.crypto.id ||
        !nonce(packet.phoneNonce) ||
        !this.wireLimits.allow('resume', 2, 4)
      )
        return;
      const existing = this.resumeChallenges.get(peer);
      const pending =
        existing &&
        existing.expiresAt > Date.now() &&
        existing.phoneNonce === packet.phoneNonce
          ? existing
          : {
              phoneNonce: packet.phoneNonce,
              hostNonce: randomSecret(),
              expiresAt: Date.now() + 10000,
            };
      this.resumeChallenges.set(peer, pending);
      if (this.resumeChallenges.size > 12)
        this.resumeChallenges.delete(
          this.resumeChallenges.keys().next().value!
        );
      this.write(
        {
          type: 'resume-challenge',
          id: this.session.crypto.id,
          phoneNonce: pending.phoneNonce,
          hostNonce: pending.hostNonce,
        },
        peer
      );
    } else if (this.role === 'phone' && packet.type === 'resume-challenge') {
      const pending = this.resumeChallenges.get(peer);
      if (
        !this.session ||
        this.peer ||
        packet.id !== this.session.crypto.id ||
        !pending ||
        pending.expiresAt <= Date.now() ||
        packet.phoneNonce !== pending.phoneNonce ||
        !nonce(packet.hostNonce) ||
        (pending.hostNonce !== undefined &&
          pending.hostNonce !== packet.hostNonce)
      )
        return;
      const transcript = JSON.stringify([
        'resume',
        this.session.crypto.id,
        peer,
        this.transport.localPeerId,
        pending.phoneNonce,
        packet.hostNonce,
      ]);
      pending.hostNonce = packet.hostNonce;
      const proof = await this.session.crypto.prove(transcript);
      if (!current() || this.resumeChallenges.get(peer) !== pending) return;
      this.write(
        {
          type: 'resume-proof',
          id: this.session.crypto.id,
          phoneNonce: pending.phoneNonce,
          hostNonce: pending.hostNonce,
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
        pending.phoneNonce !== packet.phoneNonce ||
        pending.hostNonce !== packet.hostNonce ||
        !pending.hostNonce ||
        packet.id !== session.crypto.id ||
        !nonce(packet.proof)
      )
        return;
      const transcript = JSON.stringify([
        'resume',
        session.crypto.id,
        this.transport.localPeerId,
        peer,
        pending.phoneNonce,
        pending.hostNonce,
      ]);
      if (
        !(await session.crypto.verify(transcript, packet.proof)) ||
        !current() ||
        this.session !== session ||
        this.resumeChallenges.get(peer) !== pending
      )
        return;
      const proof = await session.crypto.prove(`accepted:${transcript}`);
      if (!current() || this.resumeChallenges.get(peer) !== pending) return;
      this.resumeChallenges.delete(peer);
      this.write(
        {
          type: 'resumed',
          id: session.crypto.id,
          phoneNonce: pending.phoneNonce,
          hostNonce: pending.hostNonce,
          proof,
        },
        peer
      );
      this.activate(peer, `resume:${pending.phoneNonce}:${pending.hostNonce}`);
    } else if (this.role === 'phone' && packet.type === 'resumed') {
      const session = this.session;
      const pending = this.resumeChallenges.get(peer);
      if (
        !session ||
        this.peer ||
        !pending ||
        pending.expiresAt < Date.now() ||
        packet.phoneNonce !== pending.phoneNonce ||
        packet.hostNonce !== pending.hostNonce ||
        !pending.hostNonce ||
        packet.id !== session.crypto.id ||
        !nonce(packet.proof)
      )
        return;
      const transcript = JSON.stringify([
        'resume',
        session.crypto.id,
        peer,
        this.transport.localPeerId,
        pending.phoneNonce,
        pending.hostNonce,
      ]);
      if (
        (await session.crypto.verify(`accepted:${transcript}`, packet.proof)) &&
        current() &&
        this.session === session &&
        this.resumeChallenges.get(peer) === pending
      ) {
        this.resumeChallenges.delete(peer);
        this.activate(
          peer,
          `resume:${pending.phoneNonce}:${pending.hostNonce}`
        );
      }
    } else if (
      this.role === 'phone' &&
      packet.type === 'rejected' &&
      this.candidate?.peer === peer
    ) {
      this.candidate = undefined;
      this.deadline = 0;
      this.options.onStateChange?.({type: 'failed', reason: 'rejected'});
      this.options.onStatus?.(
        'Pairing rejected or code expired. Ask the headset for a fresh invitation.'
      );
    }
  }

  private activate(peer: string, epoch: string): void {
    if (!this.session || this.closed) return;
    this.needsRecovery = false;
    this.retryAt = 0;
    this.recoveryAttempts = 0;
    this.resumeChallenges.clear();
    const standby = this.standby;
    this.standby = undefined;
    standby?.cleanup();
    standby?.transport.close();
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
    this.options.onStateChange?.({type: 'connected'});
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
      .catch((error) => this.reportError(error))
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
    const chosenHeadset = this.role === 'phone' && peerId === this.hostPeer;
    const membership = this.memberships.get(peerId);
    if (
      this.closed ||
      this.ownsPeer(peerId) ||
      membership === undefined ||
      data.byteLength > (trustedPeer || chosenHeadset ? 100000 : 2048) ||
      (this.role === 'phone' &&
        this.hostPeer !== undefined &&
        peerId !== this.hostPeer &&
        (this.peer !== undefined || !this.session))
    )
      return;
    // Unidentified senders spend their budget before UTF-8 decode/JSON.parse.
    if (
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
    if (
      this.role === 'phone' &&
      peerId !== this.hostPeer &&
      packet.type !== 'host-presence'
    )
      return;
    const lane = event.detail.delivery ?? 'reliable';
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
    if (!this.closed) this.options.onStateChange?.({type: 'reconnecting'});
    this.options.onConnectionChange?.(false);
    if (!this.closed && this.transportFactory) this.needsRecovery = true;
  }
  private onJoin = (event: CustomEvent<{peerId: string}>): void => {
    if (this.ownsPeer(event.detail.peerId)) return;
    if (!this.memberships.has(event.detail.peerId))
      this.memberships.set(event.detail.peerId, ++this.membershipCounter);
    if (this.role === 'host') void this.announce(event.detail.peerId);
  };
  private onLeave = (event: CustomEvent<{peerId: string}>): void => {
    const peer = event.detail.peerId;
    if (this.hostPeer === peer) this.hostPeer = undefined;
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
        this.options.onStateChange?.({type: 'failed', reason: 'expired'});
        this.options.onStatus?.(
          'Headset changed its invitation. Enter the new code.'
        );
      }
    }
    if (peer === this.peer) this.drop();
    if (this.needsRecovery) void this.recoverTransport();
  };
  private onClose = (): void => {
    if (this.closed) return;
    this.drop();
    if (this.transportFactory) {
      this.needsRecovery = true;
      void this.recoverTransport();
    }
  };
  private onError = (event: CustomEvent<{error: Error}>): void => {
    if (
      !this.closed &&
      this.initialReady &&
      this.transportFactory &&
      event.detail.error.message === 'Signaling channel closed.'
    ) {
      this.needsRecovery = true;
      void this.recoverTransport();
    } else this.reportError(event.detail.error);
  };

  private reportError(cause: unknown): void {
    this.options.onError?.(new Error('Phone connection error.', {cause}));
  }
}
