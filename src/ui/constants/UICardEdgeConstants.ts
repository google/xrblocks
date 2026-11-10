/**
 * Length of each resize corner along the card's sides, measured from the card
 * edge, in layout pixels (1 mm at the default card pixel size). Measured from
 * Android XR, where moving along an edge switches from resize to move about
 * 45 mm from the corner.
 */
export const RESIZE_CORNER_LENGTH = 45;

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
export const RESIZE_CORNER_ARC_WIDTH = 15;
/** Centerline length between the arc's rounded caps, in layout pixels. */
export const RESIZE_CORNER_ARC_LENGTH = 33;
/** Distance from the card edge to the arc's centerline, in layout pixels. */
export const RESIZE_CORNER_ARC_GAP = 31;
export const RESIZE_CORNER_ARC_COLOR = '#c5e0fe';

/**
 * Hover glow on a card's side edge, in layout pixels (1 mm at the default card
 * pixel size). Measured from Android XR's side edge affordance: a thin bright
 * rim on the outer border of the edge band with a soft fade toward the card,
 * windowed along the edge around the pointer.
 */
export const EDGE_GLOW_RIM_WIDTH = 3;
/** Opacity of the rim line. */
export const EDGE_GLOW_RIM_ALPHA = 1;
/** Opacity of the inward fade where it starts, just inside the rim. */
export const EDGE_GLOW_FADE_ALPHA = 0.6;
/** Distance over which the inward fade drops by a factor of e. */
export const EDGE_GLOW_FADE_LENGTH = 17;
/** Distance along the edge from the pointer that the glow stays at full strength. */
export const EDGE_GLOW_FLAT_HALF_LENGTH = 87;
/** Distance along the edge from the pointer where the glow's linear falloff ends. */
export const EDGE_GLOW_HALF_LENGTH = 216;
/**
 * Time for the glow to fade fully in or out, in seconds. The fade is linear,
 * and a hovered corner's arc appears only once the glow is gone.
 */
export const EDGE_GLOW_FADE_SECONDS = 0.09;
