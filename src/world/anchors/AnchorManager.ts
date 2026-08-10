import * as THREE from 'three';

import {Script} from '../../core/Script';
import {WorldOptions} from '../WorldOptions';

import {anchorCapability} from './AnchorCapability';
import {AnchorStore} from './AnchorStore';
import {LocalStorageAnchorStore} from './LocalStorageAnchorStore';
import {SimulatorAnchor} from './SimulatorAnchor';
import {
  AnchorCapability,
  AnchorRecord,
  AnchorRestoreResult,
} from './AnchorTypes';

/** An anchor currently held by the manager. */
export interface TrackedAnchor {
  /** Stable id for this anchor within the session. */
  id: string;
  /** Caller-supplied label, carried through persistence. */
  label: string;
  /** The underlying WebXR anchor. */
  anchor: XRAnchor;
  /** Persistent handle, once one has been requested successfully. */
  uuid?: string;
}

let nextAnchorId = 0;

/**
 * Mints a handle for a simulated anchor.
 *
 * Deliberately not the anchor's id: that counter restarts whenever the page
 * loads, so a fresh anchor would eventually be handed an id a stored record
 * already used, and saving it would overwrite that record.
 *
 * @returns A handle that will not collide with an existing one.
 */
function simulatedHandle(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `sim-${uuid}`;
  // randomUUID needs a secure context, which a plain http dev server is not.
  return `sim-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Creates and tracks spatial anchors, and restores previously saved ones.
 *
 * Anchors let content stay attached to a real place as the platform refines
 * its understanding of the room. With persistence enabled, handles are saved
 * so the same content can be recovered in a later session.
 *
 * Every anchor API this uses is optional in WebXR, so the manager degrades
 * quietly: on a platform without anchors, creation returns `null` and nothing
 * throws.
 */
export class AnchorManager extends Script {
  static dependencies = {
    options: WorldOptions,
    renderer: THREE.WebGLRenderer,
  };

  /** What the current platform supports; refreshed each frame. */
  capability: AnchorCapability = 'unsupported';

  /**
   * The most recent failure, or null.
   *
   * Exposed rather than only logged so callers can surface anchor problems in
   * their own UI instead of leaving the user with silently missing content.
   */
  lastError: unknown = null;

  private readonly anchors = new Map<string, TrackedAnchor>();
  private store?: AnchorStore;
  private options!: WorldOptions;
  private renderer?: THREE.WebGLRenderer;
  private currentFrame?: XRFrame;
  private warnedUnsupported = false;
  private readonly pendingCreates: Array<{
    pose: XRRigidTransform;
    label: string;
    space?: XRSpace;
    resolve: (value: TrackedAnchor | null) => void;
    retried: boolean;
  }> = [];

  /**
   * @param store - Storage for persistent handles. Defaults to local storage,
   *     configured from options during {@link AnchorManager.init}.
   */
  constructor(private readonly injectedStore?: AnchorStore) {
    super();
  }

  /**
   * Initializes the manager.
   * @param dependencies - Resolved dependencies: the world options carrying
   *     the anchor settings, and the renderer supplying the reference space
   *     that anchor poses are expressed against.
   */
  override init({
    options,
    renderer,
  }: {
    options: WorldOptions;
    renderer?: THREE.WebGLRenderer;
  }) {
    this.options = options;
    this.renderer = renderer;
    this.store =
      this.injectedStore ??
      new LocalStorageAnchorStore(
        options.anchors.storageKey,
        options.anchors.maxStoredAnchors
      );
  }

  /**
   * Refreshes platform capability and drops anchors the platform has released.
   * @param _time - Frame timestamp, unused.
   * @param frame - The current XR frame.
   */
  override update(_time?: number, frame?: XRFrame) {
    if (!frame) {
      // Outside an immersive session there is no XRFrame at all, so waiting
      // for one would leave the fallback permanently inert on desktop.
      if (this.options?.anchors.simulatorFallback) {
        this.capability = 'simulated';
      }
      return;
    }
    this.currentFrame = frame;
    const probed = anchorCapability(frame.session, frame);
    this.capability =
      probed === 'unsupported' && this.options?.anchors.simulatorFallback
        ? 'simulated'
        : probed;
    if (this.capability === 'unsupported') {
      if (!this.warnedUnsupported) {
        this.warnedUnsupported = true;
        console.warn(
          '[anchors] this platform does not support anchors; content will ' +
            'not stay pinned across sessions'
        );
      }
      return;
    }
    this.pruneUntracked(frame);
    void this.flushPendingCreates(frame);
  }

  /**
   * Releases everything belonging to a session that has ended.
   *
   * Anchors do not survive their session, so keeping them would leave dead
   * handles that later restores would treat as already restored. Saved records
   * are untouched, since restoring them is the entire point.
   */
  onSessionEnded(): void {
    for (const tracked of this.anchors.values()) {
      try {
        tracked.anchor.delete?.();
      } catch {
        // The session is gone; nothing useful to do.
      }
    }
    this.anchors.clear();
    this.currentFrame = undefined;
    this.capability = this.options?.anchors.simulatorFallback
      ? 'simulated'
      : 'unsupported';
    for (const pending of this.pendingCreates.splice(0)) {
      pending.resolve(null);
    }
  }

  /**
   * Creates an anchor at a pose.
   *
   * @param pose - Pose for the new anchor.
   * @param label - Label carried through persistence.
   * @param space - Space the pose is expressed in. Defaults to the frame's
   *     own reference space when the platform provides one.
   * @returns The tracked anchor, or null when it could not be created.
   */
  async create(
    pose: XRRigidTransform,
    label: string,
    space?: XRSpace
  ): Promise<TrackedAnchor | null> {
    if (this.capability === 'simulated') {
      return this.createSimulated(pose, label);
    }
    const frame = this.currentFrame;
    if (!frame || typeof frame.createAnchor !== 'function') {
      return null;
    }
    // An XRSession is not an XRSpace. The two are interchangeable to the type
    // checker only because XRSpace is declared as an empty interface, so
    // passing a session here would compile and then misplace every anchor.
    const anchorSpace = space ?? this.referenceSpace();
    if (!anchorSpace) {
      console.warn(
        '[anchors] no reference space available; cannot create an anchor'
      );
      return null;
    }
    const immediate = await this.createOnFrame(frame, pose, label, anchorSpace);
    if (immediate) return immediate;
    // Only a rejected createAnchor reaches here, and the usual cause is a
    // frame that went inactive because the app created from an input handler.
    // Retry exactly once on the next live frame rather than looping.
    return new Promise((resolve) => {
      this.pendingCreates.push({
        pose,
        label,
        space: anchorSpace,
        resolve,
        retried: true,
      });
    });
  }

  /**
   * Runs queued creations against a live frame.
   * @param frame - The frame currently being rendered.
   */
  private async flushPendingCreates(frame: XRFrame): Promise<void> {
    if (this.pendingCreates.length === 0) return;
    for (const pending of this.pendingCreates.splice(0)) {
      pending.resolve(
        await this.createOnFrame(
          frame,
          pending.pose,
          pending.label,
          pending.space!
        )
      );
    }
  }

  /**
   * Creates an anchor on a frame known to be active.
   * @param frame - The frame currently being rendered.
   * @param pose - Pose for the new anchor.
   * @param label - Label carried through persistence.
   * @param space - Space the pose is expressed in.
   * @returns The tracked anchor, or null when it could not be created.
   */
  private async createOnFrame(
    frame: XRFrame,
    pose: XRRigidTransform,
    label: string,
    space: XRSpace
  ): Promise<TrackedAnchor | null> {
    // The retry path may be handed a different frame from the one create()
    // checked, so verify support here rather than relying on the caller.
    const createAnchor = frame.createAnchor;
    if (typeof createAnchor !== 'function') return null;
    try {
      const anchor = await createAnchor.call(frame, pose, space);
      if (!anchor) return null;
      const tracked: TrackedAnchor = {
        id: `anchor-${nextAnchorId++}`,
        label,
        anchor,
      };
      this.anchors.set(tracked.id, tracked);
      this.debug(`created ${tracked.id} (${label})`);
      return tracked;
    } catch (error) {
      this.lastError = error;
      console.warn('[anchors] could not create anchor', error);
      return null;
    }
  }

  /**
   * Saves an anchor's handle so it can be restored in a later session.
   *
   * @param id - Id of a tracked anchor.
   * @returns Whether a handle was saved.
   */
  async persist(id: string): Promise<boolean> {
    if (!this.store) return false;
    const tracked = this.anchors.get(id);
    if (!tracked) return false;
    if (this.capability === 'simulated') {
      const anchor = tracked.anchor as unknown as SimulatorAnchor;
      // Minted once and kept, so saving the same anchor twice updates its
      // record instead of adding another.
      tracked.uuid ??= simulatedHandle();
      return this.store.save({
        uuid: tracked.uuid,
        label: tracked.label,
        createdAt: Date.now(),
        pose: anchor.toStorablePose(),
      });
    }
    if (this.capability !== 'persistent') {
      this.debug(`cannot persist ${id}: platform is ${this.capability}`);
      return false;
    }
    const request = tracked.anchor.requestPersistentHandle;
    if (typeof request !== 'function') {
      this.debug(`cannot persist ${id}: anchor has no persistent handle`);
      return false;
    }
    try {
      const uuid = await request.call(tracked.anchor);
      tracked.uuid = uuid;
      const before = this.store.load();
      const saved = this.store.save({
        uuid,
        label: tracked.label,
        createdAt: Date.now(),
      });
      if (saved) this.releaseEvicted(before, uuid);
      this.debug(`persisted ${id} as ${uuid} (stored: ${saved})`);
      return saved;
    } catch (error) {
      this.lastError = error;
      console.warn('[anchors] could not persist anchor', error);
      return false;
    }
  }

  /**
   * Restores every saved anchor.
   *
   * Re-localisation is probabilistic, so a handle that cannot be resolved here
   * is reported as `not-found` rather than treated as an error, and one
   * failure never stops the rest of the batch.
   *
   * @returns One result per saved record, in stored order.
   */
  async restoreAll(): Promise<AnchorRestoreResult[]> {
    // World can expose this child during its own init, one scene scan before
    // ScriptsManager initializes newly added children. Treat that brief state
    // as not ready; callers can retry once the capability changes.
    if (!this.store) return [];
    const records = this.store.load();
    if (records.length === 0) return [];
    if (this.capability === 'simulated') {
      return records.map((record) => this.restoreSimulated(record));
    }
    const session = this.currentFrame?.session;
    const restore = session?.restorePersistentAnchor;
    if (this.capability !== 'persistent' || typeof restore !== 'function') {
      return records.map((record) => ({record, status: 'unsupported'}));
    }
    return Promise.all(
      records.map((record) => this.restoreOne(record, session!))
    );
  }

  /**
   * Restores a single record.
   * @param record - The saved record to restore.
   * @param session - Session able to restore handles.
   * @returns The outcome for this record.
   */
  private async restoreOne(
    record: AnchorRecord,
    session: XRSession
  ): Promise<AnchorRestoreResult> {
    // restoreAll may be called more than once; without this a second call
    // mints a duplicate TrackedAnchor for every stored record.
    const existing = this.findByUuid(record.uuid);
    if (existing) return {record, status: 'restored', anchor: existing};
    try {
      const anchor = await session.restorePersistentAnchor!(record.uuid);
      if (!anchor) return {record, status: 'not-found'};
      const tracked: TrackedAnchor = {
        id: `anchor-${nextAnchorId++}`,
        label: record.label,
        anchor,
        uuid: record.uuid,
      };
      this.anchors.set(tracked.id, tracked);
      return {record, status: 'restored', anchor: tracked};
    } catch (error) {
      // Expected whenever the user is somewhere else; not an error state.
      this.debug(`could not restore ${record.uuid}: ${error}`);
      return {record, status: 'not-found'};
    }
  }

  /**
   * Reads an anchor's current pose.
   *
   * @param id - Id of a tracked anchor.
   * @param referenceSpace - Space to express the pose in. Not needed for
   *     simulated anchors, which hold their own pose.
   * @returns The pose, or null when the anchor is not currently tracked.
   */
  getPose(id: string, referenceSpace?: XRReferenceSpace): XRPose | null {
    const tracked = this.anchors.get(id);
    if (!tracked) return null;
    // Simulated anchors have no tracked space to resolve against, and there is
    // no frame at all on desktop, so read the pose they are holding.
    if (SimulatorAnchor.isSimulatorAnchor(tracked.anchor)) {
      const {position, orientation} = (
        tracked.anchor as unknown as SimulatorAnchor
      ).pose;
      return {transform: {position, orientation}} as unknown as XRPose;
    }
    const frame = this.currentFrame;
    // The manager already holds the renderer, so callers should not have to
    // thread a reference space through every read.
    const space = referenceSpace ?? this.referenceSpace();
    if (!frame || !space) return null;
    try {
      // An XRFrame is only valid inside its own callback, so reading a pose
      // from outside the frame loop throws rather than returning nothing.
      return (
        frame.getPose(tracked.anchor.anchorSpace, space as XRReferenceSpace) ??
        null
      );
    } catch {
      return null;
    }
  }

  /**
   * Stops tracking an anchor and forgets any saved handle for it.
   * @param id - Id of a tracked anchor.
   */
  delete(id: string): void {
    const tracked = this.anchors.get(id);
    if (!tracked) return;
    this.anchors.delete(id);
    if (tracked.uuid && this.store) {
      this.store.remove(tracked.uuid);
      this.releasePersistentHandle(tracked.uuid);
    }
    try {
      tracked.anchor.delete?.();
    } catch (error) {
      this.debug(`anchor ${id} could not be released: ${error}`);
    }
  }

  /**
   * Every anchor currently tracked.
   * @returns The tracked anchors.
   */
  getAll(): TrackedAnchor[] {
    return [...this.anchors.values()];
  }

  /**
   * Every persistent handle the platform is currently holding for this origin.
   *
   * Only the headset runtimes implement this; Chrome ships the anchors module
   * without persistence, where the attribute is absent rather than empty. An
   * empty result therefore means "nothing to report", not "the platform holds
   * none".
   *
   * Scoped to the origin, not to this store. Two pages on one origin see each
   * other's handles here, so a handle missing from your own records is not
   * evidence of a leak and must not be deleted on that basis.
   *
   * @returns The handles, or an empty array when unavailable.
   */
  platformHandles(): string[] {
    const handles = (
      this.currentSession() as unknown as {
        persistentAnchors?: readonly string[];
      }
    )?.persistentAnchors;
    // Blank entries have been seen in the wild, and the platform refuses to
    // delete them, so they are not handles as far as anything here cares.
    return handles ? [...handles].filter((uuid) => !!uuid) : [];
  }

  /**
   * Releases every persistent handle the platform is holding for this origin.
   *
   * A recovery path, not routine cleanup. Platforms cap how many persistent
   * anchors may exist, and once local records are gone nothing names the
   * handles any more, so {@link AnchorManager.forgetAll} cannot reach them and
   * the cap stays full forever. This reads the platform's own list instead.
   *
   * Origin wide and destructive: another page on the same origin loses its
   * anchors too. Offer it as an explicit choice, never as automatic cleanup.
   *
   * The platform's list is not guaranteed to shrink as handles are released,
   * so do not read it back afterwards to judge whether this worked. The
   * returned count is what the platform actually accepted.
   *
   * @returns How many handles the platform accepted a release for.
   */
  async releaseAllPlatformHandles(): Promise<number> {
    const session = this.currentSession();
    const remove = session?.deletePersistentAnchor;
    if (!session || typeof remove !== 'function') {
      this.debug('cannot release: platform has no deletePersistentAnchor');
      return 0;
    }
    const handles = this.platformHandles();
    let released = 0;
    for (const uuid of handles) {
      try {
        await remove.call(session, uuid);
        released++;
        this.debug(`released handle ${uuid}`);
      } catch (error) {
        this.lastError = error;
        this.debug(`could not release handle ${uuid}: ${error}`);
      }
    }
    // Local records would otherwise point at handles that no longer exist.
    this.store?.clear();
    this.debug(`released ${released} of ${handles.length} platform handles`);
    return released;
  }

  /** Forgets every saved handle, leaving live anchors alone. */
  forgetAll(): void {
    if (!this.store) return;
    // Read before clearing: records the app never restored this session are
    // the only place their platform handles are named.
    for (const record of this.store.load()) {
      this.releasePersistentHandle(record.uuid);
    }
    this.store.clear();
  }

  /**
   * The session to ask about anchors.
   *
   * Prefers the frame's own session, falling back to the renderer so calls
   * made outside the frame loop still reach the platform.
   *
   * @returns The session, or undefined.
   */
  private currentSession(): XRSession | undefined {
    return (
      this.currentFrame?.session ??
      this.renderer?.xr.getSession?.() ??
      undefined
    );
  }

  /**
   * Releases handles the store dropped to stay under its cap.
   *
   * The store evicts silently, so without this the oldest handles stay
   * allocated on the platform with no record left able to name them.
   *
   * @param before - Records present immediately before the save.
   * @param saved - Handle just written, which is never evicted.
   */
  private releaseEvicted(before: AnchorRecord[], saved: string): void {
    if (!this.store) return;
    const kept = new Set(this.store.load().map((r) => r.uuid));
    for (const record of before) {
      if (record.uuid !== saved && !kept.has(record.uuid)) {
        this.debug(`store evicted ${record.uuid}`);
        this.releasePersistentHandle(record.uuid);
      }
    }
  }

  /**
   * Asks the platform to drop a persistent handle.
   *
   * Platforms cap how many handles an origin may hold, so forgetting a record
   * on our side without this slowly fills that quota with anchors no app can
   * name any more.
   *
   * @param uuid - The persistent handle to release.
   */
  private releasePersistentHandle(uuid: string): void {
    // Simulator handles name local pose records only. They were never issued
    // by an XRSession and must not be sent to the platform for deletion.
    if (uuid.startsWith('sim-')) return;
    const session = this.currentSession();
    const remove = session?.deletePersistentAnchor;
    // Optional in WebXR, and absent entirely for simulated anchors. Said out
    // loud, because a silent no-op here looks identical to a release that
    // worked, and the handle stays against the platform's cap either way.
    if (!session) {
      this.debug(`cannot release ${uuid}: no session`);
      return;
    }
    if (typeof remove !== 'function') {
      this.debug(
        `cannot release ${uuid}: platform has no deletePersistentAnchor`
      );
      return;
    }
    try {
      void Promise.resolve(remove.call(session, uuid)).then(
        () => this.debug(`released handle ${uuid}`),
        (error) => this.debug(`could not release handle ${uuid}: ${error}`)
      );
    } catch (error) {
      this.debug(`could not release handle ${uuid}: ${error}`);
    }
  }

  /** Releases every tracked anchor. Saved handles are left in storage. */
  override dispose() {
    for (const tracked of this.anchors.values()) {
      try {
        tracked.anchor.delete?.();
      } catch {
        // Nothing useful to do while tearing down.
      }
    }
    this.anchors.clear();
    this.currentFrame = undefined;
  }

  /**
   * Drops anchors the platform no longer reports as tracked.
   * @param frame - The current XR frame.
   */
  private pruneUntracked(frame: XRFrame): void {
    // Simulated anchors are not known to the platform, so its tracked set says
    // nothing about them and would remove every one of them.
    if (this.capability === 'simulated') return;
    const tracked = frame.trackedAnchors;
    // Absent means the platform does not report the set, which is different
    // from reporting an empty set; only the latter means everything is gone.
    if (!tracked) return;
    for (const [id, entry] of [...this.anchors]) {
      if (!tracked.has(entry.anchor)) {
        this.anchors.delete(id);
        this.debug(`platform released ${id}`);
      }
    }
  }

  /**
   * Creates a locally held anchor for environments without platform support.
   * @param pose - Pose to hold.
   * @param label - Label carried through persistence.
   * @returns The tracked anchor.
   */
  private createSimulated(
    pose: XRRigidTransform,
    label: string
  ): TrackedAnchor {
    const id = `anchor-${nextAnchorId++}`;
    const tracked: TrackedAnchor = {
      id,
      label,
      anchor: new SimulatorAnchor(id, pose) as unknown as XRAnchor,
    };
    this.anchors.set(id, tracked);
    this.debug(`created simulated ${id} (${label})`);
    return tracked;
  }

  /**
   * Rebuilds a simulated anchor from its stored pose.
   * @param record - The saved record.
   * @returns The outcome for this record.
   */
  private restoreSimulated(record: AnchorRecord): AnchorRestoreResult {
    const existing = this.findByUuid(record.uuid);
    if (existing) return {record, status: 'restored', anchor: existing};
    if (!record.pose) {
      // Saved by a real platform, so there is no pose to rebuild from here.
      return {record, status: 'not-found'};
    }
    const tracked: TrackedAnchor = {
      id: `anchor-${nextAnchorId++}`,
      label: record.label,
      uuid: record.uuid,
      anchor: SimulatorAnchor.fromStorablePose(
        record.uuid,
        record.pose
      ) as unknown as XRAnchor,
    };
    this.anchors.set(tracked.id, tracked);
    return {record, status: 'restored', anchor: tracked};
  }

  /**
   * The reference space anchor poses are expressed against.
   * @returns The reference space, or undefined when none is available yet.
   */
  private referenceSpace(): XRSpace | undefined {
    return this.renderer?.xr?.getReferenceSpace() ?? undefined;
  }

  /**
   * Finds a tracked anchor by its persistent handle.
   * @param uuid - Persistent handle to look for.
   * @returns The tracked anchor, or undefined.
   */
  private findByUuid(uuid: string): TrackedAnchor | undefined {
    for (const tracked of this.anchors.values()) {
      if (tracked.uuid === uuid) return tracked;
    }
    return undefined;
  }

  /**
   * Logs when anchor debugging is enabled.
   * @param message - Message to log.
   */
  private debug(message: string): void {
    if (this.options?.anchors.debugging) {
      console.log(`[anchors] ${message}`);
    }
  }
}
