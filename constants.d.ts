/**
 * The number of hands tracked in a typical XR session (left and right).
 */
export declare const NUM_HANDS = 2;
/**
 * The number of joints per hand tracked in a typical XR session.
 */
export declare const HAND_JOINT_COUNT = 25;
/**
 * The pairs of joints as an adjcent list.
 */
export declare const HAND_JOINT_IDX_CONNECTION_MAP: number[][];
/**
 * The pairs of bones' ids per angle as an adjcent list.
 */
export declare const HAND_BONE_IDX_CONNECTION_MAP: number[][];
/**
 * A small depth offset (in meters) applied between layered UI elements to
 * prevent Z-fighting, which is a visual artifact where surfaces at similar
 * depths appear to flicker.
 */
export declare const VIEW_DEPTH_GAP = 0.002;
/**
 * The THREE.js rendering layer used exclusively for objects that should only be
 * visible to the left eye's camera in stereoscopic rendering.
 */
export declare const LEFT_VIEW_ONLY_LAYER = 1;
/**
 * The THREE.js rendering layer used exclusively for objects that should only be
 * visible to the right eye's camera in stereoscopic rendering.
 */
export declare const RIGHT_VIEW_ONLY_LAYER = 2;
/**
 * The THREE.js rendering layer for virtual objects that should be realistically
 * occluded by real-world objects when depth sensing is active.
 */
export declare const OCCLUDABLE_ITEMS_LAYER = 3;
/**
 * Layer used for rendering overlaid UI text. Currently only used for LabelView.
 */
export declare const UI_OVERLAY_LAYER = 4;
/**
 * The default ideal width in pixels for requesting the device camera stream.
 * Corresponds to a 720p resolution.
 */
export declare const DEFAULT_DEVICE_CAMERA_WIDTH = 1280;
/**
 * The default ideal height in pixels for requesting the device camera stream.
 * Corresponds to a 720p resolution.
 */
export declare const DEFAULT_DEVICE_CAMERA_HEIGHT = 720;
export declare const XR_BLOCKS_ASSETS_PATH = "https://cdn.jsdelivr.net/gh/xrblocks/assets@34228db7ec7cef66fd65ef3250ef6f4a930fe373/";
