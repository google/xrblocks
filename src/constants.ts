// --- Hands ---
/**
 * The number of hands tracked in a typical XR session (left and right).
 */
export const NUM_HANDS = 2;

/**
 * The number of joints per hand tracked in a typical XR session.
 */
export const HAND_JOINT_COUNT = 25;

/**
 * The pairs of joints as an adjcent list.
 */
export const HAND_JOINT_IDX_CONNECTION_MAP = [
  [1, 2],   [2, 3],   [3, 4],              // Thumb has 3 bones
  [5, 6],   [6, 7],   [7, 8],   [8, 9],    // Index finger has 4 bones
  [10, 11], [11, 12], [12, 13], [13, 14],  // Middle finger has 4 bones
  [15, 16], [16, 17], [17, 18], [18, 19],  // Ring finger has 4 bones
  [20, 21], [21, 22], [22, 23], [23, 24],  // Little finger has 4 bones
];

/**
 * The pairs of bones' ids per angle as an adjcent list.
 */
// clang-format off
export const HAND_BONE_IDX_CONNECTION_MAP = [
  [0, 1], [1, 2],                // Thumb has 2 angles
  [3, 4], [4, 5], [5, 6],        // Index finger has 3 angles
  [7, 8], [8, 9], [9, 10],       // Middle finger has 3 angles
  [11, 12], [12, 13], [13, 14],  // Ring finger has 3 angles
  [15, 16], [16, 17], [17, 18],  // Little finger has 3 angles
];
// clang-format on

// --- UI ---
/**
 * A small depth offset (in meters) applied between layered UI elements to
 * prevent Z-fighting, which is a visual artifact where surfaces at similar
 * depths appear to flicker.
 */
export const VIEW_DEPTH_GAP = 0.002;

// --- Renderer Layer ---
/**
 * The THREE.js rendering layer used exclusively for objects that should only be
 * visible to the left eye's camera in stereoscopic rendering.
 */
export const LEFT_VIEW_ONLY_LAYER = 1;

/**
 * The THREE.js rendering layer used exclusively for objects that should only be
 * visible to the right eye's camera in stereoscopic rendering.
 */
export const RIGHT_VIEW_ONLY_LAYER = 2;

/**
 * The THREE.js rendering layer for virtual objects that should be realistically
 * occluded by real-world objects when depth sensing is active.
 */
export const OCCLUDABLE_ITEMS_LAYER = 3;

/**
 * Layer used for rendering overlaid UI text. Currently only used for LabelView.
 */
export const UI_OVERLAY_LAYER = 4;

// --- Camera ---

/**
 * The default ideal width in pixels for requesting the device camera stream.
 * Corresponds to a 720p resolution.
 */
export const DEFAULT_DEVICE_CAMERA_WIDTH = 1280;

/**
 * The default ideal height in pixels for requesting the device camera stream.
 * Corresponds to a 720p resolution.
 */
export const DEFAULT_DEVICE_CAMERA_HEIGHT = 720;

export const XR_BLOCKS_ASSETS_PATH = 'https://cdn.jsdelivr.net/gh/xrblocks/assets@34228db7ec7cef66fd65ef3250ef6f4a930fe373/';
