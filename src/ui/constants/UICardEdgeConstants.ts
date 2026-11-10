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
 * Arc width while its corner is pressed, in layout pixels. Android XR thins
 * the arc from the inside, so its outer edge barely moves.
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
 * Hover glow on a card's side edge, in layout pixels (1 mm at the default card
 * pixel size). Measured from Android XR's side edge affordance: a thin bright
 * rim on the outer border of the edge band with a soft fade toward the card,
 * windowed along the edge around the pointer.
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
 * Radial distance from the pointer within which the glow stays at full
 * strength. Android XR windows the glow with a radial falloff around the
 * pointer, evaluated along the rim: the distance combines the length along the
 * edge with the pointer's depth inside the band's outer border, so the lit
 * stretch is longest with the pointer on the rim and shortens as it moves
 * toward the card. Measured as 70 dp at 1.52 mm per dp, a scale uncertain by
 * about 5%. These radii also give the 87 mm full-strength and 194 mm zero
 * along-edge lengths measured earlier, for a pointer about 60 mm inside the rim.
 */
export const EDGE_GLOW_FLAT_RADIUS = 106;
/** Radial distance from the pointer where the glow's linear falloff ends; 135 dp. */
export const EDGE_GLOW_RADIUS = 205;
/**
 * Time for the glow to fade fully in or out, in seconds. The fade is linear,
 * and a hovered corner's arc appears only once the glow is gone.
 */
export const EDGE_GLOW_FADE_SECONDS = 0.09;

/**
 * Glow on a pressed side edge, in layout pixels. Measured from Android XR,
 * where pressing a side shortens the glow, tints it, and fills the band down
 * to the card. The glow stays where the card was grabbed.
 */
export const EDGE_GLOW_PRESSED_FLAT_RADIUS = 82;
/**
 * Pressed counterpart of EDGE_GLOW_RADIUS. Pressing scales both radii by about
 * 0.77, measured as 55 dp and 103 dp.
 */
export const EDGE_GLOW_PRESSED_RADIUS = 158;
/** Opacity of the pressed inward fill where it starts, just inside the rim. */
export const EDGE_GLOW_PRESSED_FADE_ALPHA = 1;
/** Distance over which the pressed inward fill drops by a factor of e. */
export const EDGE_GLOW_PRESSED_FADE_LENGTH = 42;
export const EDGE_GLOW_PRESSED_FILL_COLOR = '#dbeeff';
export const EDGE_GLOW_PRESSED_RIM_COLOR = '#eff9ff';
/** Time for the glow to shorten to its pressed length, in seconds. */
export const EDGE_GLOW_PRESS_LENGTH_SECONDS = 0.07;
/** Time for the glow's fill and color to reach their pressed look, in seconds. */
export const EDGE_GLOW_PRESS_FILL_SECONDS = 0.3;
/** Time for a released glow to return to its hover look, in seconds. */
export const EDGE_GLOW_RELEASE_SECONDS = 0.067;
