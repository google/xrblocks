/**
 * NetObjectRegistry: stores NetObjects by their id and resolves ownership
 * conflicts. Operations are intentionally O(1) and synchronous — netblocks
 * runs this in the per-frame update loop.
 *
 * **Security note (cooperative-only).** Ownership claims and releases are
 * trusted as-stated: the registry has no way to verify that a peer
 * claiming `obj` actually grabbed it on their end, and a malicious peer
 * could forge claims, refuse to release, or spoof another peer's id at
 * the transport layer. netblocks is demo-grade — for adversarial
 * environments, layer a server-authoritative arbiter on top.
 */
import {NetObject} from './NetObject';

export class NetObjectRegistry {
  private _byId = new Map<string, NetObject>();

  add(obj: NetObject): void {
    this._byId.set(obj.netId, obj);
  }

  remove(obj: NetObject): void {
    this._byId.delete(obj.netId);
  }

  get(id: string): NetObject | undefined {
    return this._byId.get(id);
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  values(): IterableIterator<NetObject> {
    return this._byId.values();
  }

  /**
   * Apply a "claim" message: peer wants ownership. Always grants the
   * claim — explicit grabs are intentional and should preempt the
   * previous owner so users can pass objects between each other. (The
   * older lex-tiebreak only made sense for racing implicit claims.)
   */
  applyClaim(id: string, peerId: string): boolean {
    const obj = this._byId.get(id);
    if (!obj) return false;
    if (obj.ownerId !== peerId) {
      obj.ownerId = peerId;
      // Drop any stale interp target buffered from a previous remote-owner
      // period; otherwise the new ownership state would lerp the object
      // back toward an ancient position before the new owner sends one.
      // Also abandon any post-release interpolation in flight — the new
      // owner is about to take over and broadcast their own pose.
      obj._hasTarget = false;
      obj._pendingFinal = false;
    }
    return true;
  }

  /** Apply a "release" — only the current owner may release. */
  applyRelease(id: string, peerId: string): boolean {
    const obj = this._byId.get(id);
    if (!obj) return false;
    if (obj.ownerId !== peerId) return false;
    obj.ownerId = '';
    obj._hasTarget = false;
    return true;
  }

  /** When a peer leaves, drop their ownership claims so others can take over. */
  releaseOwnedBy(peerId: string): void {
    for (const obj of this._byId.values()) {
      if (obj.ownerId === peerId) obj.ownerId = '';
    }
  }
}
