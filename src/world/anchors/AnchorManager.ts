import {Script} from '../../core/Script';
import {WorldOptions} from '../WorldOptions';

import {anchorCapability} from './AnchorCapability';
import {AnchorStore} from './AnchorStore';
import {LocalStorageAnchorStore} from './LocalStorageAnchorStore';
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
  static dependencies = {options: WorldOptions};

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
  private store!: AnchorStore;
  private options!: WorldOptions;
  private currentFrame?: XRFrame;
  private warnedUnsupported = false;

  /**
   * @param store - Storage for persistent handles. Defaults to local storage,
   *     configured from options during {@link AnchorManager.init}.
   */
  constructor(private readonly injectedStore?: AnchorStore) {
    super();
  }

  /**
   * Initializes the manager.
   * @param dependencies - Resolved dependencies.
   * @param dependencies.options - World options carrying the anchor settings.
   */
  override init({options}: {options: WorldOptions}) {
    this.options = options;
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
    if (!frame) return;
    this.currentFrame = frame;
    this.capability = anchorCapability(frame.session, frame);
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
    const frame = this.currentFrame;
    if (!frame || typeof frame.createAnchor !== 'function') {
      return null;
    }
    try {
      const anchor = await frame.createAnchor(pose, space ?? frame.session!);
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
    const tracked = this.anchors.get(id);
    if (!tracked) return false;
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
      this.store.save({uuid, label: tracked.label, createdAt: Date.now()});
      this.debug(`persisted ${id} as ${uuid}`);
      return true;
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
    const records = this.store.load();
    if (records.length === 0) return [];
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
      return {record, status: 'restored'};
    } catch (error) {
      // Expected whenever the user is somewhere else; not an error state.
      this.debug(`could not restore ${record.uuid}: ${error}`);
      return {record, status: 'not-found'};
    }
  }

  /**
   * Reads an anchor's current pose.
   * @param id - Id of a tracked anchor.
   * @param referenceSpace - Space to express the pose in.
   * @returns The pose, or null when the anchor is not currently tracked.
   */
  getPose(id: string, referenceSpace: XRReferenceSpace): XRPose | null {
    const tracked = this.anchors.get(id);
    const frame = this.currentFrame;
    if (!tracked || !frame) return null;
    return frame.getPose(tracked.anchor.anchorSpace, referenceSpace) ?? null;
  }

  /**
   * Stops tracking an anchor and forgets any saved handle for it.
   * @param id - Id of a tracked anchor.
   */
  delete(id: string): void {
    const tracked = this.anchors.get(id);
    if (!tracked) return;
    this.anchors.delete(id);
    if (tracked.uuid) this.store.remove(tracked.uuid);
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

  /** Forgets every saved handle, leaving live anchors alone. */
  forgetAll(): void {
    this.store.clear();
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
   * Logs when anchor debugging is enabled.
   * @param message - Message to log.
   */
  private debug(message: string): void {
    if (this.options?.anchors.debugging) {
      console.log(`[anchors] ${message}`);
    }
  }
}
