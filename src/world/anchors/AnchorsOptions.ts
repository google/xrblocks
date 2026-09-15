import {deepMerge} from '../../utils/OptionsUtils';
import {DeepPartial} from '../../utils/Types';

/**
 * Builds the default storage key for a page.
 *
 * Scoped to the path because anchors are stored per origin: two apps served
 * from one host would otherwise restore each other's anchors, which reads as
 * mysterious content appearing on first run rather than as a shared store.
 *
 * @param pathname - Page path; omit when there is no document.
 * @returns The storage key to default to.
 */
export function defaultAnchorStorageKey(pathname?: string): string {
  if (!pathname) return 'xrblocks.anchors';
  // Keyed on the directory rather than the raw path, because the same page is
  // reachable both as a directory and as its index file. Keying on the path
  // gave those two routes separate stores, so anchors saved through one were
  // invisible through the other while the platform still held their handles.
  const withoutFile = pathname.replace(/\/[^/]*\.[^/]*$/, '/');
  const directory = withoutFile.endsWith('/') ? withoutFile : `${withoutFile}/`;
  return `xrblocks.anchors:${directory}`;
}

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

  /**
   * Whether to hold poses locally when the platform has no anchor support.
   *
   * Off by default: on a real headset a silent stand-in would look like
   * working anchors while nothing is actually pinned. Demos and desktop
   * development opt in deliberately.
   */
  simulatorFallback = false;

  /**
   * Storage key used when persistence is enabled.
   *
   * Defaults to a page-scoped key. Set it explicitly to share anchors between
   * pages, or to keep a stable key if the app might move path.
   */
  storageKey = defaultAnchorStorageKey(
    typeof location === 'undefined' ? undefined : location.pathname
  );

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
