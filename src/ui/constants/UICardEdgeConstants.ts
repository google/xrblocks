/**
 * Width of a card's manipulation edge band beyond the card, in layout pixels
 * (1 mm at the default card pixel size). The band's hit area has square outer
 * corners. Source: Android XR panel edge recordings.
 */
export const EDGE_BAND_MARGIN = 87;

/**
 * Length of each resize corner along the card's sides, from the card edge, in
 * layout pixels. Source: Android XR panel edge recordings.
 */
export const RESIZE_CORNER_LENGTH = 45;

/**
 * Largest share of each side's half-length a resize corner may cover, so the
 * middle of every side stays available for moving the card.
 */
export const MAX_RESIZE_CORNER_FRACTION = 0.5;

/**
 * Width of the round-capped arc shown on a hovered resize corner, concentric
 * with the card corner, in layout pixels. Source: Android XR panel corners.
 */
export const RESIZE_CORNER_ARC_WIDTH = 15;
/** Centerline length between the arc's rounded caps, in layout pixels. */
export const RESIZE_CORNER_ARC_LENGTH = 33;
/** Distance from the card edge to the arc's centerline, in layout pixels. */
export const RESIZE_CORNER_ARC_GAP = 31;
/** Color of the resize corner arc. */
export const RESIZE_CORNER_ARC_COLOR = '#c5e0fe';
/**
 * Arc width while its corner is pressed, in layout pixels. With
 * RESIZE_CORNER_ARC_PRESSED_GAP, the arc thins from the inside.
 */
export const RESIZE_CORNER_ARC_PRESSED_WIDTH = 11.5;
/** Distance from the card edge to the pressed arc's centerline, in layout pixels. */
export const RESIZE_CORNER_ARC_PRESSED_GAP = 33.5;
/**
 * Time for a pressed arc to thin, in seconds. The change is linear, and the
 * arc snaps back at once on release.
 */
export const RESIZE_CORNER_ARC_PRESS_SECONDS = 0.04;
/**
 * Time a full linear fade of the arc would take when the pointer leaves the
 * band from a corner, in seconds. Moving onto a side hides it at once.
 * Source: Android XR panel edge recordings.
 */
export const RESIZE_CORNER_ARC_LEAVE_FADE_SECONDS = 0.14;
/**
 * Time after the pointer leaves the band from a corner at which the rest of
 * the fading arc disappears at once, in seconds.
 */
export const RESIZE_CORNER_ARC_LEAVE_CUT_SECONDS = 0.1;

/**
 * Width of the hover glow's bright rim on the band's outer border, in layout
 * pixels. The glow fades from the rim toward the card and is windowed along
 * the edge around the pointer. Source: Android XR panel edge recordings.
 */
export const EDGE_GLOW_RIM_WIDTH = 3;
/** Opacity of the rim line. */
export const EDGE_GLOW_RIM_ALPHA = 1;
/** Opacity of the inward fade where it starts, just inside the rim. */
export const EDGE_GLOW_FADE_ALPHA = 0.73;
/**
 * Distance from the rim at which the inward fade reaches zero. The fade falls
 * off quadratically, leaving a clear gap before the card edge.
 */
export const EDGE_GLOW_FADE_WIDTH = 53;
/**
 * Straight-line distance from the pointer to a rim point within which the
 * glow stays at full strength, so a pointer deeper in the band lights a
 * shorter stretch and the glow wraps round corners.
 * Source: Android XR panel edge recordings.
 */
export const EDGE_GLOW_FLAT_RADIUS = 74;
/** Straight-line distance from the pointer where the glow's falloff ends. */
export const EDGE_GLOW_RADIUS = 206;
/**
 * Time for the glow to fade fully in or out, in seconds. The fade is linear,
 * and a hovered corner's arc appears only once the glow is gone.
 * Source: Android XR panel edge recordings.
 */
export const EDGE_GLOW_FADE_SECONDS = 0.1;

/**
 * Pressed counterpart of EDGE_GLOW_FLAT_RADIUS. Pressing a side shortens the
 * glow, tints it, and fills the band down to the card, and the glow stays
 * where the card was grabbed. Source: Android XR panel edge recordings.
 */
export const EDGE_GLOW_PRESSED_FLAT_RADIUS = 71;
/** Pressed counterpart of EDGE_GLOW_RADIUS. */
export const EDGE_GLOW_PRESSED_RADIUS = 163;
/** Opacity of the pressed inward fill where it starts, just inside the rim. */
export const EDGE_GLOW_PRESSED_FADE_ALPHA = 1;
/** Distance over which the pressed inward fill drops by a factor of e. */
export const EDGE_GLOW_PRESSED_FADE_LENGTH = 42;
/** Color of the pressed glow's inward fill. */
export const EDGE_GLOW_PRESSED_FILL_COLOR = '#dbeeff';
/** Color of the pressed glow's rim. */
export const EDGE_GLOW_PRESSED_RIM_COLOR = '#eff9ff';
/** Time for the glow to shorten to its pressed length, in seconds. */
export const EDGE_GLOW_PRESS_LENGTH_SECONDS = 0.07;
/** Time for the glow's fill and color to reach their pressed look, in seconds. */
export const EDGE_GLOW_PRESS_FILL_SECONDS = 0.3;
/** Time for a released glow to return to its hover look, in seconds. */
export const EDGE_GLOW_RELEASE_SECONDS = 0.067;

/**
 * Angle of a corner's diagonal from the side, in radians, on which the resize
 * corner arc is centred.
 */
export const CORNER_DIAGONAL_ANGLE = Math.PI / 4;
/**
 * Smallest normal component the edge shaders divide by when following a band
 * pixel's outward normal to the rim, so axis-aligned normals do not divide by
 * zero.
 */
export const EDGE_NORMAL_EPSILON = 0.0001;
/**
 * Alpha below which the edge shaders treat coverage as empty, also used to
 * keep divisions by alpha and glow weight away from zero.
 */
export const EDGE_ALPHA_EPSILON = 0.001;
