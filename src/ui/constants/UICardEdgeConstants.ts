/**
 * Length of each resize corner along the card's sides, beyond the rounded
 * corner, in edge margins.
 */
export const RESIZE_CORNER_SIDE_MARGINS = 2;

/**
 * Largest share of each side's half-length a resize corner may cover, so the
 * middle of every side stays available for moving the card.
 */
export const MAX_RESIZE_CORNER_FRACTION = 0.5;

/**
 * Arc shown on a hovered resize corner, in layout pixels (1 mm at the default
 * card pixel size). Measured from Android XR's corner resize affordance: a
 * round-capped arc concentric with the card corner, just outside it.
 */
export const RESIZE_CORNER_ARC_WIDTH = 12;
/** Centerline length between the arc's rounded caps, in layout pixels. */
export const RESIZE_CORNER_ARC_LENGTH = 41;
/** Distance from the card edge to the arc's centerline, in layout pixels. */
export const RESIZE_CORNER_ARC_GAP = 28;
export const RESIZE_CORNER_ARC_COLOR = '#c5e0fe';
/** Time for the arc to fade fully in or out, in seconds. */
export const RESIZE_CORNER_ARC_FADE_SECONDS = 0.2;
