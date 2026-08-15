import {AnchorCapability} from './AnchorTypes';

/**
 * Determines what the running platform can do with anchors.
 *
 * The anchor APIs are optional in three independent places: a frame may not be
 * able to create anchors, a session may not be able to restore them, and an
 * individual anchor may not be able to hand back a persistent handle. Presence
 * of an XR session says nothing about any of them, so each is probed directly
 * rather than inferred.
 *
 * `persistent` is therefore a statement about the session, not a promise about
 * any particular anchor: whether an anchor can hand back a handle is only
 * knowable once that anchor exists. {@link AnchorManager.persist} reports that
 * per anchor, so treat this as "saving is worth offering" rather than
 * "saving will work".
 *
 * @param session - The active XR session, if any.
 * @param frame - The current XR frame, if any.
 * @returns What the platform supports.
 */
export function anchorCapability(
  session: XRSession | null | undefined,
  frame: XRFrame | null | undefined
): AnchorCapability {
  if (!frame || !session) return 'unsupported';
  if (typeof frame.createAnchor !== 'function') return 'unsupported';
  return typeof session.restorePersistentAnchor === 'function'
    ? 'persistent'
    : 'session-only';
}
