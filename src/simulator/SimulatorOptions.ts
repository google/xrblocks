import type {TemplateResult} from 'lit';

import {XR_BLOCKS_ASSETS_PATH} from '../constants';
import {Handedness} from '../input/Hands';
import {deepMerge} from '../utils/OptionsUtils';
import {DeepPartial, DeepReadonly} from '../utils/Types';

export enum SimulatorMode {
  USER = 'User',
  POSE = 'Navigation',
  CONTROLLER = 'Hands',
}

export const NEXT_SIMULATOR_MODE = {
  [SimulatorMode.USER]: SimulatorMode.POSE,
  [SimulatorMode.POSE]: SimulatorMode.CONTROLLER,
  [SimulatorMode.CONTROLLER]: SimulatorMode.USER,
};

export interface SimulatorCustomInstruction {
  header: string | TemplateResult;
  videoSrc?: string;
  description: string | TemplateResult;
}

export class SimulatorOptions {
  initialCameraPosition = {x: 0, y: 1.5, z: 0};
  scenePath =
    XR_BLOCKS_ASSETS_PATH + 'simulator/scenes/XREmulatorsceneV5_livingRoom.glb';
  initialScenePosition = {x: -1.6, y: 0.3, z: 0};
  defaultMode = SimulatorMode.USER;
  defaultHand = Handedness.LEFT;
  modeIndicator = {
    enabled: true,
    element: 'xrblocks-simulator-mode-indicator',
  };
  instructions = {
    enabled: true,
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
  // Whether to render the main scene to a render texture before rendering the simulator scene
  // or directly to the canvas after rendering the simulator scene.
  renderToRenderTexture = true;
  // Blending mode when rendering the virtual scene.
  blendingMode: 'normal' | 'screen' = 'normal';

  constructor(options?: DeepReadonly<DeepPartial<SimulatorOptions>>) {
    deepMerge(this, options);
  }
}
