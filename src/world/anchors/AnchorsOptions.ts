import {deepMerge} from '../../utils/OptionsUtils';
import {DeepPartial} from '../../utils/Types';

/**
 * Configuration for the spatial anchor subsystem.
 *
 * Anchors pin content to a real place so the platform keeps it there as its
 * understanding of the room improves. With {@link AnchorsOptions.persistent}
 * enabled, anchor handles are saved so the same content can be restored in a
 * later session.
 */
export class AnchorsOptions {
  /** Logs anchor lifecycle transitions. */
  debugging = false;

  /** Whether the anchor subsystem is created at all. */
  enabled = false;

  /**
   * Whether anchor handles are saved so they can be restored in a later
   * session. Requires platform support for persistent handles; when the
   * platform only offers session-scoped anchors this degrades to in-session
   * behaviour rather than failing.
   */
  persistent = false;

  /** Storage key used when persistence is enabled. */
  storageKey = 'xrblocks.anchors';

  /**
   * Upper bound on saved handles. Persistent handles accumulate across
   * sessions and would otherwise grow without limit; the oldest are evicted
   * first once the cap is reached.
   */
  maxStoredAnchors = 128;

  constructor(options?: DeepPartial<AnchorsOptions>) {
    if (options) {
      deepMerge(this, options);
    }
  }

  /**
   * Enables anchors.
   * @returns This options object, for chaining.
   */
  enable() {
    this.enabled = true;
    return this;
  }

  /**
   * Enables anchors and saves handles for restoration in later sessions.
   * @returns This options object, for chaining.
   */
  enablePersistence() {
    this.enabled = true;
    this.persistent = true;
    return this;
  }
}
