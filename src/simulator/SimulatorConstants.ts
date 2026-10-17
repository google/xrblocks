export const AVERAGE_IPD_METERS = 0.063;
export const DEGREES_TO_RADIANS = Math.PI / 180;
export const RADIANS_TO_DEGREES = 180 / Math.PI;
export const ANGLE_DOUBLING_FACTOR = 2;
export const MIN_DISPLAY_DIAGONAL_FOV_DEGREES = 0;
export const MAX_DISPLAY_DIAGONAL_FOV_DEGREES = 180;
export const DEFAULT_SIMULATOR_ASPECT_RATIO = 1;
export const MIN_SIMULATOR_CAMERA_ASPECT_RATIO = 0;
export const UNIT_VERTICAL_ASPECT_COMPONENT = 1;

export enum SimulatorRenderMode {
  DEFAULT = 'default',
  STEREO_LEFT = 'left',
  STEREO_RIGHT = 'right',
}
