import { PeerCapabilities, PeerRole } from "./codec/MessageCodec.js";
import { RemoteUserAvatar } from "./presence/RemoteUserAvatar.js";
//#region src/addons/netblocks/src/core/NetUser.d.ts
export declare class NetUser {
  readonly peerId: string;
  displayName?: string;
  /**
   * Self-reported peer role. Cooperative metadata only — do not trust
   * for authority decisions. Defaults to `'user'` when the remote did
   * not send one.
   */
  role: PeerRole;
  capabilities: PeerCapabilities;
  /** Three.js avatar — also a child of `xb.core.scene` while the peer is connected. */
  readonly avatar: RemoteUserAvatar;
  /** Wall-clock ms of the last received message from this peer. */
  lastSeenMs: number;
  constructor(peerId: string, capabilities: PeerCapabilities, displayName?: string, role?: PeerRole);
  dispose(): void;
}
//#endregion