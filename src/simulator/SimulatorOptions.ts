import type {TemplateResult} from 'lit';

import {Handedness} from '../input/Hands';
import {deepMerge} from '../utils/OptionsUtils';
import {DeepPartial, DeepReadonly} from '../utils/Types';
import {Keycodes} from '../utils/Keycodes';
import {DEFAULT_ENVIRONMENTS} from './DefaultManifests';

export enum SimulatorMode {
  USER = 'User',
  POSE = 'Navigation',
  CONTROLLER = 'Hands',
  POINTER_LOCK = 'PointerLock',
  EDITOR = 'Editor',
}

const DEFAULT_MODE_TOGGLE_ORDER = {
  [SimulatorMode.USER]: SimulatorMode.POSE,
  [SimulatorMode.POSE]: SimulatorMode.CONTROLLER,
  [SimulatorMode.CONTROLLER]: SimulatorMode.POINTER_LOCK,
  [SimulatorMode.POINTER_LOCK]: SimulatorMode.EDITOR,
  [SimulatorMode.EDITOR]: SimulatorMode.USER,
};

export interface SimulatorCustomInstruction {
  header: string | TemplateResult;
  videoSrc?: string;
  description: string | TemplateResult;
}

export interface SimulatorEnvironment {
  /** Optional display name; otherwise the manifest name is used. */
  name?: string;
  manifestPath: string;
}

export interface SimulatorHandPhysicsOptions {
  enabled: boolean;
  radius: number;
  mass: number;
  contactOffset: number;
  friction: number;
  restitution: number;
}

export class SimulatorOptions {
  initialCameraPosition = {x: 0, y: 1.5, z: 0};
  environments = DEFAULT_ENVIRONMENTS.map((environment) => ({...environment}));
  activeEnvironmentIndex = 0;
  defaultMode = SimulatorMode.USER;
  defaultHand = Handedness.LEFT;
  modeToggle = {
    enabled: false,
    toggleKey: Keycodes.LEFT_SHIFT_CODE as Keycodes | null,
    toggleOrder: DEFAULT_MODE_TOGGLE_ORDER,
  };
  simulatorSettingsPanel = {
    enabled: true,
    element: 'xrblocks-simulator-settings',
  };
  instructions = {
    enabled: true,
    showAutomatically: false,
    element: 'xrblocks-simulator-instructions',
    customInstructions: [] as SimulatorCustomInstruction[],
  };
  handPosePanel = {
    enabled: true,
    element: 'xrblocks-simulator-hand-pose-panel',
  };
  geminiLivePanel = {
    enabled: false,
    element: 'xrblocks-simulator-geminilive',
  };
  stereo = {
    enabled: false,
  };
  navMesh = {
    enabled: false,
    showDebugVisualizations: false,
    eyeHeight: 1.5,
  };
  /** Controls the isolated physics world used by the desktop simulator. */
  physics = {
    enabled: true,
  };
  deviceCamera = {
    // Whether to enable the simulator camera feed.
    // If disabled, the actual device camera will be used instead.
    enabled: true,
  };
  // Whether to render the main scene to a render texture before rendering the simulator scene
  // or directly to the canvas after rendering the simulator scene.
  renderToRenderTexture = true;
  // Blending mode when rendering the virtual scene.
  blendingMode: 'normal' | 'screen' = 'normal';
  /** Shoulder/chest origin of the left hand in local camera space. */
  leftHandOrigin = {x: -0.2, y: -0.2, z: 0};
  /** Shoulder/chest origin of the right hand in local camera space. */
  rightHandOrigin = {x: 0.2, y: -0.2, z: 0};
  /** Optional physical constraints for simulated hands. Requires Rapier. */
  handPhysics: SimulatorHandPhysicsOptions = {
    enabled: false,
    radius: 0.075,
    mass: 1,
    contactOffset: 0.002,
    friction: 0.8,
    restitution: 0,
  };
  /** Limits how far each hand controller can travel from the user's shoulder origin. */
  reachDistance = {
    enabled: false,
    /** The maximum distance in meters a controller can move from its origin point. */
    radius: 0.75,
  };
  /** Limits the angular cone in front of the user within which controllers can move. */
  reachAngle = {
    enabled: false,
    /** The maximum full cone angle in radians around the camera's forward direction (default is Math.PI, a front hemisphere). */
    angle: Math.PI,
  };

  constructor(options?: DeepReadonly<DeepPartial<SimulatorOptions>>) {
    deepMerge(this, options);
  }
}
