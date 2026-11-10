/**
 * Frames per second that `smoothing` rates such as `FollowHead.smoothing` are
 * expressed in: a rate of 1 closes the gap by a factor of e per frame at this
 * frame rate.
 */
export const SMOOTHING_RATE_FRAMES_PER_SECOND = 60;

/**
 * Returns the share of the remaining gap that exponential smoothing with a
 * `timeConstantSeconds` closes over `deltaSeconds`, independent of frame rate.
 */
export function smoothingAlpha(
  deltaSeconds: number,
  timeConstantSeconds: number
): number {
  return 1 - Math.exp(-deltaSeconds / timeConstantSeconds);
}

/** Returns the time constant, in seconds, of a `smoothing` rate. */
export function smoothingTimeConstant(smoothing: number): number {
  return 1 / (smoothing * SMOOTHING_RATE_FRAMES_PER_SECOND);
}
