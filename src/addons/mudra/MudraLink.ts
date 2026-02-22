/**
 * MudraLink addon for XR Blocks.
 *
 * Connects to the Mudra Companion app via WebSocket and bridges neural input
 * signals from Mudra Band / Mudra Link devices into XR Blocks input events.
 *
 * Gesture signals are mapped to `selectstart`/`selectend` and
 * `squeezestart`/`squeezeend` events. Pressure, navigation, IMU, and other
 * signals are dispatched as typed custom events that scripts can listen to.
 *
 * Usage:
 * ```ts
 * import {MudraLink} from 'xrblocks/addons/mudra/MudraLink.js';
 *
 * const mudra = new MudraLink();
 * xb.add(mudra);
 *
 * // Listen to Mudra-specific events:
 * mudra.addEventListener('mudrapressure', (e) => {
 *   console.log('Pressure:', e.detail.normalized);
 * });
 * ```
 *
 * @see https://mudra-studio.com
 */

import * as THREE from 'three';
import {Script, Input, MudraLinkOptions} from 'xrblocks';
import type {MudraSignalName} from 'xrblocks';
import type {
  AnyMudraMessage,
  MudraButtonData,
  MudraConnectionStatusData,
  MudraGestureData,
  MudraImuData,
  MudraNavDirectionData,
  MudraNavigationData,
  MudraPressureData,
  MudraSncData,
  MudraBatteryData,
} from 'xrblocks';

// --- Custom event types dispatched by MudraLink ---

interface MudraEventBase<T extends string, D> {
  type: T;
  target: MudraLink;
  detail: D;
}

type MudraGestureEvent = MudraEventBase<'mudragesture', MudraGestureData>;
type MudraPressureEvent = MudraEventBase<'mudrapressure', MudraPressureData>;
type MudraNavigationEvent = MudraEventBase<
  'mudranavigation',
  MudraNavigationData
>;
type MudraButtonEvent = MudraEventBase<'mudrabutton', MudraButtonData>;
type MudraNavDirectionEvent = MudraEventBase<
  'mudranavdirection',
  MudraNavDirectionData
>;
type MudraImuAccEvent = MudraEventBase<'mudraimuacc', MudraImuData>;
type MudraImuGyroEvent = MudraEventBase<'mudraimugyro', MudraImuData>;
type MudraSncEvent = MudraEventBase<'mudrasnc', MudraSncData>;
type MudraBatteryEvent = MudraEventBase<'mudrabattery', MudraBatteryData>;
type MudraConnectionEvent = MudraEventBase<
  'mudraconnection',
  MudraConnectionStatusData
>;

export interface MudraLinkEventMap extends THREE.Object3DEventMap {
  mudragesture: MudraGestureEvent;
  mudrapressure: MudraPressureEvent;
  mudranavigation: MudraNavigationEvent;
  mudrabutton: MudraButtonEvent;
  mudranavdirection: MudraNavDirectionEvent;
  mudraimuacc: MudraImuAccEvent;
  mudraimugyro: MudraImuGyroEvent;
  mudrasnc: MudraSncEvent;
  mudrabattery: MudraBatteryEvent;
  mudraconnection: MudraConnectionEvent;
}

/**
 * Connection state of the Mudra Link WebSocket.
 */
export enum MudraConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DEVICE_READY = 'device_ready',
}

/**
 * MudraLink bridges the Mudra Companion WebSocket to XR Blocks input events.
 *
 * When added to the scene, it connects to the Mudra Companion, subscribes to
 * configured signals, and dispatches XR Blocks controller events (select,
 * squeeze) plus Mudra-specific typed events for each signal.
 */
export class MudraLink extends Script<MudraLinkEventMap> {
  static dependencies = {
    input: Input,
    options: MudraLinkOptions,
  };

  /** Current connection state. */
  connectionState = MudraConnectionState.DISCONNECTED;

  /** Latest pressure value (normalized 0-1). Updated every pressure frame. */
  pressure = 0;

  /** Accumulated navigation position. Updated every navigation frame. */
  navigationX = 0;
  navigationY = 0;

  /** Latest IMU accelerometer values [x, y, z] in m/s². */
  imuAcc: [number, number, number] = [0, 0, 0];

  /** Latest IMU gyroscope values [x, y, z] in deg/s. */
  imuGyro: [number, number, number] = [0, 0, 0];

  /** Latest battery level (0-100). */
  batteryLevel = 0;

  /** Whether the Mudra air-touch button is currently pressed. */
  buttonPressed = false;

  private options!: MudraLinkOptions;
  private input!: Input;
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  init({options, input}: {options: MudraLinkOptions; input: Input}) {
    this.options = options;
    this.input = input;

    if (!this.options.enabled) {
      console.info(
        '[MudraLink] Initialized but disabled. Set options.mudraLink.enabled = true to activate.'
      );
      return;
    }

    this.connect();
  }

  /**
   * Opens the WebSocket connection to Mudra Companion.
   */
  connect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.connectionState = MudraConnectionState.CONNECTING;
    if (this.options.debug) {
      console.log(`[MudraLink] Connecting to ${this.options.url}...`);
    }

    try {
      this.ws = new WebSocket(this.options.url);
    } catch {
      console.warn('[MudraLink] Failed to create WebSocket.');
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.connectionState = MudraConnectionState.CONNECTED;
      this.reconnectAttempts = 0;
      if (this.options.debug) {
        console.log('[MudraLink] WebSocket connected.');
      }
      this.subscribeAll();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const msg: AnyMudraMessage = JSON.parse(event.data as string);
        this.handleMessage(msg);
      } catch {
        // Ignore non-JSON messages.
      }
    };

    this.ws.onclose = () => {
      this.connectionState = MudraConnectionState.DISCONNECTED;
      if (this.options.debug) {
        console.log('[MudraLink] WebSocket closed.');
      }
      if (!this.disposed) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose fires after onerror, reconnection is handled there.
    };
  }

  /**
   * Disconnects the WebSocket and stops reconnection.
   */
  disconnect() {
    this.disposed = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connectionState = MudraConnectionState.DISCONNECTED;
  }

  /**
   * Sends a command to the Mudra Companion.
   */
  send(command: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(command));
    }
  }

  /**
   * Subscribes to a single signal.
   */
  subscribe(signal: MudraSignalName) {
    this.send({command: 'subscribe', signal});
  }

  /**
   * Unsubscribes from a single signal.
   */
  unsubscribe(signal: MudraSignalName) {
    this.send({command: 'unsubscribe', signal});
  }

  /**
   * Triggers a simulated gesture for testing without a physical device.
   */
  triggerGesture(type: string) {
    this.send({command: 'trigger_gesture', data: {type}});
  }

  dispose() {
    this.disconnect();
  }

  // --- Private ---

  private subscribeAll() {
    // CRITICAL: one subscribe command per signal, sent separately.
    for (const signal of this.options.signals) {
      this.subscribe(signal);
    }
  }

  private scheduleReconnect() {
    if (!this.options.autoReconnect || this.disposed) return;
    if (
      this.options.maxReconnectAttempts > 0 &&
      this.reconnectAttempts >= this.options.maxReconnectAttempts
    ) {
      console.warn('[MudraLink] Max reconnection attempts reached.');
      return;
    }
    this.reconnectAttempts++;
    if (this.options.debug) {
      console.log(
        `[MudraLink] Reconnecting in ${this.options.reconnectDelayMs}ms (attempt ${this.reconnectAttempts})...`
      );
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.options.reconnectDelayMs);
  }

  private handleMessage(msg: AnyMudraMessage) {
    if (this.options.debug) {
      console.log('[MudraLink]', msg.type, msg.data);
    }

    switch (msg.type) {
      case 'connection_status':
        this.handleConnectionStatus(msg.data);
        break;
      case 'gesture':
        this.handleGesture(msg.data);
        break;
      case 'pressure':
        this.handlePressure(msg.data);
        break;
      case 'navigation':
        this.handleNavigation(msg.data);
        break;
      case 'button':
        this.handleButton(msg.data);
        break;
      case 'nav_direction':
        this.handleNavDirection(msg.data);
        break;
      case 'imu_acc':
        this.handleImuAcc(msg.data);
        break;
      case 'imu_gyro':
        this.handleImuGyro(msg.data);
        break;
      case 'snc':
        this.handleSnc(msg.data);
        break;
      case 'battery':
        this.handleBattery(msg.data);
        break;
    }
  }

  private handleConnectionStatus(data: MudraConnectionStatusData) {
    if (data.status === 'connected') {
      this.connectionState = MudraConnectionState.DEVICE_READY;
    } else {
      this.connectionState = MudraConnectionState.CONNECTED;
    }
    this.dispatchEvent({
      type: 'mudraconnection',
      detail: data,
      target: this,
    });
  }

  private handleGesture(data: MudraGestureData) {
    this.dispatchEvent({
      type: 'mudragesture',
      detail: data,
      target: this,
    });

    // Bridge to XR Blocks input events.
    const mapping = this.options.gestureMapping;
    if (data.type === mapping.select) {
      this.fireInputEvent('selectstart');
      // Select events are instantaneous: fire start then end on next tick.
      setTimeout(() => {
        this.fireInputEvent('selectend');
        this.fireInputEvent('select');
      }, 50);
    } else if (data.type === mapping.squeeze) {
      this.fireInputEvent('squeezestart');
      setTimeout(() => {
        this.fireInputEvent('squeezeend');
        this.fireInputEvent('squeeze');
      }, 50);
    }
  }

  private handlePressure(data: MudraPressureData) {
    this.pressure = data.normalized;
    this.dispatchEvent({
      type: 'mudrapressure',
      detail: data,
      target: this,
    });
  }

  private handleNavigation(data: MudraNavigationData) {
    this.navigationX += data.delta_x;
    this.navigationY += data.delta_y;
    this.dispatchEvent({
      type: 'mudranavigation',
      detail: data,
      target: this,
    });
  }

  private handleButton(data: MudraButtonData) {
    this.buttonPressed = data.state === 'pressed';
    this.dispatchEvent({
      type: 'mudrabutton',
      detail: data,
      target: this,
    });

    // Bridge button to select events.
    if (data.state === 'pressed') {
      this.fireInputEvent('selectstart');
    } else {
      this.fireInputEvent('selectend');
      this.fireInputEvent('select');
    }
  }

  private handleNavDirection(data: MudraNavDirectionData) {
    this.dispatchEvent({
      type: 'mudranavdirection',
      detail: data,
      target: this,
    });
  }

  private handleImuAcc(data: MudraImuData) {
    this.imuAcc = data.values;
    this.dispatchEvent({
      type: 'mudraimuacc',
      detail: data,
      target: this,
    });
  }

  private handleImuGyro(data: MudraImuData) {
    this.imuGyro = data.values;
    this.dispatchEvent({
      type: 'mudraimugyro',
      detail: data,
      target: this,
    });
  }

  private handleSnc(data: MudraSncData) {
    this.dispatchEvent({
      type: 'mudrasnc',
      detail: data,
      target: this,
    });
  }

  private handleBattery(data: MudraBatteryData) {
    this.batteryLevel = data.level;
    this.dispatchEvent({
      type: 'mudrabattery',
      detail: data,
      target: this,
    });
  }

  /**
   * Dispatches a controller event through the XR Blocks Input system so that
   * all scripts receive standard onSelectStart / onSelectEnd / etc. callbacks.
   */
  private fireInputEvent(
    eventType:
      | 'selectstart'
      | 'selectend'
      | 'select'
      | 'squeezestart'
      | 'squeezeend'
      | 'squeeze'
  ) {
    const controller = this.input.mouseController;
    const event = {
      type: eventType,
      target: controller,
    };
    this.input.dispatchEvent(event);
  }
}
