/**
 * Configuration for the Mudra Link addon.
 *
 * Mudra Link connects to the Mudra Companion app via WebSocket to receive
 * neural input signals from the Mudra Band / Mudra Link wearable device.
 *
 * @see https://mudra-studio.com
 */

/** Valid Mudra signal names that can be subscribed to. */
export type MudraSignalName =
  | 'gesture'
  | 'button'
  | 'pressure'
  | 'navigation'
  | 'nav_direction'
  | 'imu_acc'
  | 'imu_gyro'
  | 'snc'
  | 'battery';

/**
 * Mudra gesture types that can map to XR Blocks select events.
 */
export type MudraGestureType = 'tap' | 'double_tap' | 'twist' | 'double_twist';

/**
 * Mapping from Mudra gesture types to XR Blocks input actions.
 */
export interface MudraGestureMapping {
  /** Mudra gesture that triggers an XR Blocks `select` event. */
  select: MudraGestureType;
  /** Mudra gesture that triggers an XR Blocks `squeeze` event. */
  squeeze: MudraGestureType;
}

/**
 * Options for the Mudra Link addon.
 */
export class MudraLinkOptions {
  /** Whether the Mudra Link addon is enabled. */
  enabled = false;

  /**
   * WebSocket URL for the Mudra Companion app.
   * Default: `ws://127.0.0.1:8766`
   */
  url = 'ws://127.0.0.1:8766';

  /**
   * Signals to subscribe to on connection.
   * Default: `['gesture', 'pressure']`
   *
   * Note: Three mutually exclusive motion groups exist - pick ONE per app:
   * - Pointer mode: `navigation` + `button`
   * - Direction mode: `nav_direction`
   * - IMU mode: `imu_acc` + `imu_gyro`
   *
   * All other signals (`gesture`, `pressure`, `snc`, `battery`) combine
   * freely with any group.
   */
  signals: MudraSignalName[] = ['gesture', 'pressure'];

  /**
   * Mapping from Mudra gesture types to XR Blocks input actions.
   * `tap` fires a `select` event, `twist` fires a `squeeze` event by
   * default.
   */
  gestureMapping: MudraGestureMapping = {
    select: 'tap',
    squeeze: 'twist',
  };

  /**
   * Whether to automatically reconnect on WebSocket close.
   */
  autoReconnect = true;

  /**
   * Delay in milliseconds before attempting to reconnect.
   */
  reconnectDelayMs = 3000;

  /**
   * Maximum number of reconnection attempts. 0 means unlimited.
   */
  maxReconnectAttempts = 0;

  /**
   * Whether to log Mudra signal data to the console for debugging.
   */
  debug = false;

  /**
   * Enable this option to create the addon instance.
   * @returns The instance for chaining.
   */
  enable() {
    this.enabled = true;
    return this;
  }

  /**
   * Set the signals to subscribe to.
   * @param signals - Array of signal names.
   * @returns The instance for chaining.
   */
  setSignals(signals: MudraSignalName[]) {
    this.signals = signals;
    return this;
  }
}
