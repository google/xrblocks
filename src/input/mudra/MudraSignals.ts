/**
 * Type definitions for Mudra Companion WebSocket signal data.
 *
 * All messages from the Mudra Companion follow the structure:
 * `{ type: string, data: object, timestamp: number }`
 *
 * @see https://mudra-studio.com
 */

/** Base message envelope shared by all Mudra signals. */
export interface MudraMessage<T extends string = string, D = unknown> {
  type: T;
  data: D;
  timestamp: number;
}

// --- Signal data payloads ---

export interface MudraGestureData {
  type: 'tap' | 'double_tap' | 'twist' | 'double_twist';
  confidence: number;
  timestamp: number;
}

export interface MudraPressureData {
  /** Pressure value 0-100. */
  value: number;
  /** Normalized pressure 0.0-1.0. */
  normalized: number;
  timestamp: number;
}

export interface MudraNavigationData {
  /** Left/right movement delta. */
  delta_x: number;
  /** Up/down movement delta. */
  delta_y: number;
  timestamp: number;
}

export interface MudraButtonData {
  state: 'pressed' | 'released';
  timestamp: number;
}

export type MudraNavDirectionValue =
  | 'None'
  | 'Right'
  | 'Left'
  | 'Up'
  | 'Down'
  | 'Roll Left'
  | 'Roll Right'
  | 'Reverse Right'
  | 'Reverse Left'
  | 'Reverse Up'
  | 'Reverse Down';

export interface MudraNavDirectionData {
  direction: MudraNavDirectionValue;
  timestamp: number;
}

export interface MudraImuData {
  /** [x, y, z] values. Accelerometer in m/s², gyroscope in deg/s. */
  values: [number, number, number];
  frequency: number;
  timestamp: number;
}

export interface MudraSncData {
  /** 3 sensor values in [-1, 1] for ulnar, median, radial nerves. */
  values: [number, number, number];
  frequency: number;
  timestamp: number;
}

export interface MudraBatteryData {
  level: number;
  charging: boolean;
  timestamp: number;
}

export interface MudraConnectionStatusData {
  status: 'connected' | 'disconnected';
  message: string;
}

// --- Typed message aliases ---

export type MudraGestureMessage = MudraMessage<'gesture', MudraGestureData>;
export type MudraPressureMessage = MudraMessage<'pressure', MudraPressureData>;
export type MudraNavigationMessage = MudraMessage<
  'navigation',
  MudraNavigationData
>;
export type MudraButtonMessage = MudraMessage<'button', MudraButtonData>;
export type MudraNavDirectionMessage = MudraMessage<
  'nav_direction',
  MudraNavDirectionData
>;
export type MudraImuAccMessage = MudraMessage<'imu_acc', MudraImuData>;
export type MudraImuGyroMessage = MudraMessage<'imu_gyro', MudraImuData>;
export type MudraSncMessage = MudraMessage<'snc', MudraSncData>;
export type MudraBatteryMessage = MudraMessage<'battery', MudraBatteryData>;
export type MudraConnectionStatusMessage = MudraMessage<
  'connection_status',
  MudraConnectionStatusData
>;

/** Union of all possible Mudra messages. */
export type AnyMudraMessage =
  | MudraGestureMessage
  | MudraPressureMessage
  | MudraNavigationMessage
  | MudraButtonMessage
  | MudraNavDirectionMessage
  | MudraImuAccMessage
  | MudraImuGyroMessage
  | MudraSncMessage
  | MudraBatteryMessage
  | MudraConnectionStatusMessage;
