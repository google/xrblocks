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
import {NetObject, type NetObjectClaim} from './NetObject';

function readClaim(counter: number, peerId: string): NetObjectClaim {
  if (
    !Number.isSafeInteger(counter) ||
    counter < 1 ||
    counter >= Number.MAX_SAFE_INTEGER ||
    typeof peerId !== 'string' ||
    !peerId ||
    peerId.length > 128
  ) {
    throw new Error('Invalid NetObject claim revision.');
  }
  return {counter, peerId};
}

function compareClaim(a: NetObjectClaim, b: NetObjectClaim): number {
  return (
    a.counter - b.counter ||
    (a.peerId === b.peerId ? 0 : a.peerId < b.peerId ? 1 : -1)
  );
}

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
   * Apply a causal explicit claim. A later counter preempts; equal counters
   * choose the lex-smaller peer ID. Legacy unstamped claims still preempt.
   */
  applyClaim(id: string, peerId: string, counter?: number): boolean {
    const obj = this._byId.get(id);
    if (!obj) return false;
    const claim =
      counter === undefined ? undefined : readClaim(counter, peerId);
    if (claim && obj.claim) {
      const order = compareClaim(claim, obj.claim);
      if (order < 0 || (order === 0 && obj.ownerId !== peerId)) return false;
    }
    obj.claim = claim;
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
  applyRelease(id: string, peerId: string, counter?: number): boolean {
    const obj = this._byId.get(id);
    if (!obj) return false;
    if (counter !== undefined) {
      const claim = readClaim(counter, peerId);
      if (!obj.claim || compareClaim(claim, obj.claim) !== 0) return false;
    }
    if (obj.ownerId !== peerId) return false;
    obj.ownerId = '';
    obj._hasTarget = false;
    return true;
  }

  /** Adopt catch-up ownership without overwriting a newer claim or reviving a release. */
  applyOwnershipSnapshot(
    id: string,
    ownerId: string,
    revision?: NetObjectClaim
  ): boolean {
    const obj = this._byId.get(id);
    if (!obj) return false;
    const claim = revision && readClaim(revision.counter, revision.peerId);
    // A current peer can send a pre-claim snapshot before seeing our claim.
    if (!claim && obj.claim) return false;
    if (claim && ownerId && ownerId !== claim.peerId) {
      throw new Error('NetObject snapshot owner does not match its claim.');
    }
    if (claim && obj.claim) {
      const order = compareClaim(claim, obj.claim);
      if (order < 0 || (order === 0 && !obj.ownerId && !!ownerId)) return false;
    }
    obj.claim = claim;
    obj.ownerId = ownerId;
    return true;
  }

  /** When a peer leaves, drop their ownership claims so others can take over. */
  releaseOwnedBy(peerId: string): void {
    for (const obj of this._byId.values()) {
      if (obj.ownerId === peerId) obj.ownerId = '';
    }
  }
}
