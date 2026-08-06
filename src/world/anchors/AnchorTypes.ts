/**
 * Shared types for the spatial anchor subsystem.
 *
 * Kept free of WebXR and three.js imports so the storage and capability logic
 * can be unit tested without a device or a GPU.
 */

/**
 * What the current platform can do with anchors.
 *
 * The WebXR anchor APIs are all optional in the typings and genuinely absent on
 * many browsers, so capability is probed rather than inferred from the presence
 * of an XR session.
 */
export type AnchorCapability =
  /** No anchor support at all; anchor calls are no-ops. */
  | 'unsupported'
  /** Anchors can be created, but not carried into a later session. */
  | 'session-only'
  /** Anchors can be created and restored in later sessions. */
  | 'persistent';

/** A saved anchor, as written to storage. */
export interface AnchorRecord {
  /** Platform-issued persistent handle, opaque to us. */
  uuid: string;
  /** Caller-supplied label, so restored anchors can be matched to content. */
  label: string;
  /** Epoch milliseconds when the handle was saved; used for eviction order. */
  createdAt: number;
}

/**
 * Why a restore attempt ended the way it did.
 *
 * Re-localisation is probabilistic: a handle can be perfectly valid and still
 * fail to resolve because the user is in a different room, or the space has
 * changed too much. That is an expected outcome, not an error.
 */
export type AnchorRestoreStatus =
  /** The anchor came back and is usable. */
  | 'restored'
  /** The platform could not resolve this handle here. */
  | 'not-found'
  /** The platform cannot restore anchors at all. */
  | 'unsupported';

/** Outcome of restoring a single saved anchor. */
export interface AnchorRestoreResult {
  /** The record that was attempted. */
  record: AnchorRecord;
  /** How the attempt ended. */
  status: AnchorRestoreStatus;
}
