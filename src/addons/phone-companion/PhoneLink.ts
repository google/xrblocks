import {WebRTCTransport} from '../netblocks/src/core/transport/WebRTCTransport.js';
import type {
  Transport,
  TransportMessageEventDetail,
} from '../netblocks/src/core/transport/Transport.js';
import {validMessage, type PhoneMessage} from './protocol.js';

export interface PhonePairing {
  roomId: string;
  token: string;
}

export interface PhoneConnectionOptions {
  /** A fresh, exclusively owned transport. Defaults to netblocks WebRTC. */
  transport?: Transport;
  onConnectionChange?: (connected: boolean) => void;
  onError?: (error: Error) => void;
}

export function createPhonePairing(): PhonePairing {
  return {roomId: crypto.randomUUID(), token: crypto.randomUUID()};
}

/** Pairing credentials live in the fragment, not a server query or QR service. */
export function phonePairingURL(
  page: string | URL,
  pairing: PhonePairing
): string {
  const url = new URL(page, globalThis.location?.href);
  url.hash = new URLSearchParams({
    room: pairing.roomId,
    token: pairing.token,
  }).toString();
  return url.href;
}

export function readPhonePairing(url: string | URL): PhonePairing {
  const params = new URLSearchParams(new URL(url).hash.slice(1));
  const roomId = params.get('room');
  const token = params.get('token');
  if (!roomId || !token || roomId.length > 200 || token.length > 200) {
    throw new Error('Open the phone pairing link from the headset.');
  }
  return {roomId, token};
}

/** Private one-to-one channel; separate from an application's multiplayer room. */
export class PhoneLink {
  private readonly transport: Transport;
  private peer?: string;
  // Independent of transport peer IDs: WebRTC slot IDs can be reused after leave.
  private readonly identity = crypto.randomUUID();
  private pairedIdentity?: string;
  private pairedPeer?: string;
  private lastSeen = 0;
  private timer?: ReturnType<typeof setInterval>;
  private started = false;
  private closed = false;
  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder();

  constructor(
    private readonly role: 'host' | 'phone',
    private readonly pairing: PhonePairing,
    private readonly options: PhoneConnectionOptions,
    private readonly receive: (message: PhoneMessage) => void,
    private readonly connection: (connected: boolean) => void
  ) {
    this.transport = options.transport ?? new WebRTCTransport();
  }

  get connected(): boolean {
    return this.peer !== undefined;
  }

  async connect(): Promise<void> {
    if (this.started || this.closed)
      throw new Error('Phone connection is single-use.');
    this.started = true;
    this.transport.on('message', this.onMessage);
    this.transport.on('peer-leave', this.onLeave);
    this.transport.on('close', this.onClose);
    this.transport.on('error', this.onError);
    try {
      await this.transport.connect({roomId: this.pairing.roomId});
      if (this.closed) {
        this.transport.close();
        return;
      }
      this.tick();
      this.timer = setInterval(() => this.tick(), 1000);
    } catch (error) {
      this.close();
      throw error;
    }
  }

  send(message: PhoneMessage): void {
    if (this.peer) this.write(message, this.peer);
  }

  close(): void {
    if (this.closed) return;
    this.send({type: 'bye'});
    this.closed = true;
    clearInterval(this.timer);
    this.transport.off('message', this.onMessage);
    this.transport.off('peer-leave', this.onLeave);
    this.transport.off('close', this.onClose);
    this.transport.off('error', this.onError);
    this.transport.close();
    this.drop();
  }

  private write(message: PhoneMessage, peer?: string): void {
    if (this.closed || !this.transport.isOpen) return;
    // TODO(netblocks): use a separate unordered, maxRetransmits: 0 data channel
    // for move/scroll/zoom once Transport exposes delivery classes. Its current
    // send() contract has only one reliable ordered channel. Keep button edges,
    // pairing and text ordered; do not change that channel's reliability globally.
    this.transport.send(
      this.encoder.encode(
        JSON.stringify({
          protocol: 'xrblocks-phone-1',
          token: this.pairing.token,
          identity: this.identity,
          message,
        })
      ),
      peer
    );
  }

  private tick(): void {
    if (this.peer && Date.now() - this.lastSeen > 5000) this.drop();
    if (this.peer) this.send({type: 'ping'});
    // After pairing, never rebroadcast the instance credential to new room peers.
    else this.write({type: 'hello', role: this.role}, this.pairedPeer);
  }

  private onMessage = (
    event: CustomEvent<TransportMessageEventDetail>
  ): void => {
    const {peerId, data} = event.detail;
    if (this.closed || data.byteLength > 100000) return;
    let packet;
    try {
      packet = JSON.parse(this.decoder.decode(data));
    } catch {
      return;
    }
    if (
      packet?.protocol !== 'xrblocks-phone-1' ||
      packet.token !== this.pairing.token ||
      typeof packet.identity !== 'string' ||
      packet.identity.length !== 36 ||
      (this.pairedIdentity !== undefined &&
        packet.identity !== this.pairedIdentity) ||
      !validMessage(packet.message)
    )
      return;
    const message: PhoneMessage = packet.message;
    if (
      (message.type === 'hello' || message.type === 'welcome') &&
      message.role !== this.role &&
      (!this.peer || this.peer === peerId)
    ) {
      const newlyPaired = !this.peer;
      this.pairedIdentity = packet.identity;
      this.pairedPeer = peerId;
      this.peer = peerId;
      this.lastSeen = Date.now();
      if (message.type === 'hello')
        this.write({type: 'welcome', role: this.role}, peerId);
      if (newlyPaired) {
        this.connection(true);
        this.options.onConnectionChange?.(true);
      }
    }
    if (peerId !== this.peer) return;
    this.lastSeen = Date.now();
    if (message.type === 'bye') this.drop();
    else this.receive(message);
  };

  private drop(): void {
    if (!this.peer) return;
    this.peer = undefined;
    this.connection(false);
    this.options.onConnectionChange?.(false);
  }
  private onLeave = (event: CustomEvent<{peerId: string}>): void => {
    if (event.detail.peerId === this.peer) this.drop();
  };
  private onClose = (): void => {
    this.close();
  };
  private onError = (event: CustomEvent<{error: Error}>): void => {
    this.options.onError?.(event.detail.error);
  };
}
