import { NetObject, NetObjectClaim } from "./NetObject.js";
//#region src/addons/netblocks/src/core/objects/NetObjectRegistry.d.ts
export declare class NetObjectRegistry {
  private _byId;
  add(obj: NetObject): void;
  remove(obj: NetObject): void;
  get(id: string): NetObject | undefined;
  has(id: string): boolean;
  values(): IterableIterator<NetObject>;
  /**
   * Apply a causal explicit claim. A later counter preempts; equal counters
   * choose the lex-smaller peer ID. Legacy unstamped claims still preempt.
   */
  applyClaim(id: string, peerId: string, counter?: number): boolean;
  /** Apply a "release" — only the current owner may release. */
  applyRelease(id: string, peerId: string, counter?: number): boolean;
  /** Adopt catch-up ownership without overwriting a newer claim or reviving a release. */
  applyOwnershipSnapshot(id: string, ownerId: string, revision?: NetObjectClaim): boolean;
  /** When a peer leaves, drop their ownership claims so others can take over. */
  releaseOwnedBy(peerId: string): void;
}
//#endregion