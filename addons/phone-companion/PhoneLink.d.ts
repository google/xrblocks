import { Transport } from "../netblocks/src/core/transport/Transport.js";
import { PhonePairing, createPhonePairing, phonePairingFromCode, phonePairingURL, readPhonePairing } from "./Pairing.js";
import { PhoneMessage } from "./protocol.js";
//#region src/addons/phone-companion/PhoneLink.d.ts
export interface PhonePairingRequest {
  id: string;
  /** Compare this with the six digits on the phone before accepting. */
  comparison: string;
  /** Headset accepted; keep the number visible until the phone confirms it. */
  accepted?: boolean;
}
export type PhoneConnectionState = {
  type: 'connecting' | 'connected' | 'reconnecting';
} | {
  type: 'verification';
  id: string;
  comparison: string;
  confirmed: boolean;
} | {
  type: 'failed';
  reason: 'expired' | 'rejected' | 'connection';
};
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
/** Approved, encrypted one-to-one channel. Invitation credentials never appear on the wire. */
export declare class PhoneLink {
  private readonly role;
  pairing: PhonePairing;
  private readonly options;
  private readonly receive;
  private readonly connection;
  private transport;
  private readonly transportFactory?;
  private foreground;
  private deferredDiscovery;
  private needsRecovery;
  private recovering?;
  private retryAt;
  private recoveryAttempts;
  private initialReady;
  private standby?;
  private readonly roomCode?;
  private readonly roomId;
  private announced;
  private memberships;
  private membershipCounter;
  private peer?;
  private hostPeer?;
  private session?;
  private candidate?;
  private challenges;
  private resumeChallenges;
  private clientKeys;
  private preparingKeys;
  private deadline;
  private attempts;
  private offerOpen;
  private started;
  private closed;
  private generation;
  private lastSeen;
  private timer?;
  private limits;
  private wireLimits;
  private selectedPeer?;
  private selectedLimits;
  private peerBudgets;
  private overflowBudget;
  private reauthentication?;
  private untrustedPending;
  private sendSequence;
  private receiveSequence;
  private outbound;
  private inbound;
  private pending;
  private sending;
  private motion;
  private motionDirty;
  private cancelMotionFrame?;
  private sensitivity;
  private readonly encoder;
  private readonly decoder;
  constructor(role: 'host' | 'phone', pairing: PhonePairing, options: PhoneConnectionOptions & {
    onRoomCollision?: () => void;
  }, receive: (message: PhoneMessage) => void, connection: (connected: boolean) => void);
  get connected(): boolean;
  get canSharePairing(): boolean;
  get pairingOpen(): boolean;
  get pendingPhone(): PhonePairingRequest | undefined;
  connect(): Promise<void>;
  /** The page stays alive while hidden; only explicit disposal revokes its session key. */
  setForeground(visible: boolean): void;
  private listen;
  private unlisten;
  private recoverTransport;
  private ownsPeer;
  private selectedBudget;
  private membershipBudget;
  private approvalDeadline;
  private promoteStandby;
  /** Explicit headset decision, bound to this exchange and its comparison digits. */
  accept(id: string): Promise<boolean>;
  /** Local phone decision, bound to the displayed verification request. */
  confirmNumbers(id: string): Promise<boolean>;
  private confirmApproval;
  reject(id: string): void;
  send(message: PhoneMessage): void;
  flushMotion(): void;
  close(): void;
  private write;
  private tick;
  private checkReauthentication;
  private knock;
  private announce;
  private transcript;
  private handle;
  private activate;
  private sendEncrypted;
  private receiveEncrypted;
  private onMessage;
  private drop;
  private onJoin;
  private onLeave;
  private onClose;
  private onError;
  private reportError;
}
//#endregion
export { type PhonePairing, createPhonePairing, phonePairingFromCode, phonePairingURL, readPhonePairing };