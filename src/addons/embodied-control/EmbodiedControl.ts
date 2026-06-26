import * as THREE from 'three';
import {Core, Script, Simulator} from 'xrblocks';

import {EmbodiedControlExecutor} from './EmbodiedControlExecutor';
import {
  DEFAULT_EMBODIED_CONTROL_OPTIONS,
  type EmbodiedControlOptions,
  type EmbodiedControlStep,
  type XRCompoundControl,
} from './EmbodiedControlTypes';

export class EmbodiedControl extends Script {
  static dependencies = {
    core: Core,
    simulator: Simulator,
    camera: THREE.Camera,
  };

  editorIcon = 'sports_martial_arts';
  executor?: EmbodiedControlExecutor;
  private options: Required<EmbodiedControlOptions>;
  private core?: Core;
  private autoPauseScheduled = false;
  private autoPauseComplete = false;

  constructor(options: EmbodiedControlOptions = {}) {
    super();
    this.options = {
      ...DEFAULT_EMBODIED_CONTROL_OPTIONS,
      ...options,
    };
  }

  init(dependencies: {core: Core; simulator: Simulator; camera: THREE.Camera}) {
    this.core = dependencies.core;
    this.executor = new EmbodiedControlExecutor(dependencies, this.options);
    if (this.options.autoPause && dependencies.core.simulatorRunning) {
      this.scheduleAutoPause();
    }
  }

  override onSimulatorStarted() {
    if (this.options.autoPause) {
      this.scheduleAutoPause();
    }
  }

  private scheduleAutoPause() {
    if (this.autoPauseScheduled || this.autoPauseComplete) return;
    this.autoPauseScheduled = true;
    this.afterRenderedFrame(() => {
      if (!this.core) return;
      this.core.pause();
      this.autoPauseComplete = true;
    });
  }

  private afterRenderedFrame(callback: () => void) {
    const schedule =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (handler: FrameRequestCallback) => {
            setTimeout(() => handler(performance.now()), 0);
            return 0;
          };
    schedule(() => schedule(() => callback()));
  }

  step(step: EmbodiedControlStep): Promise<void> {
    if (!this.executor) {
      throw new Error('EmbodiedControl is not initialized.');
    }
    return this.executor.step({
      ...step,
      control: step.control || {},
    });
  }

  applyControl(control: XRCompoundControl) {
    if (!this.executor) {
      throw new Error('EmbodiedControl is not initialized.');
    }
    this.executor.applyControl(control);
  }

  get busy() {
    return this.executor?.busy ?? false;
  }

  teleportTo(
    target: THREE.Vector3 | [number, number, number] | THREE.Object3D,
    options?: {distance?: number; faceTarget?: boolean; snapToGround?: boolean}
  ): Promise<void> {
    if (!this.executor) {
      throw new Error('EmbodiedControl is not initialized.');
    }
    return this.executor.teleportTo(target, options);
  }

  lookAtTarget(
    target: THREE.Object3D | THREE.Vector3 | [number, number, number],
    options?: {velocity?: number}
  ): Promise<void> {
    if (!this.executor) {
      throw new Error('EmbodiedControl is not initialized.');
    }
    return this.executor.lookAtTarget(target, options);
  }

  pointTo(
    handIndex: number,
    target: THREE.Object3D | THREE.Vector3 | [number, number, number],
    options?: {velocity?: number}
  ): Promise<void> {
    if (!this.executor) {
      throw new Error('EmbodiedControl is not initialized.');
    }
    return this.executor.pointTo(handIndex, target, options);
  }

  reachTo(
    handIndex: number,
    target: THREE.Vector3 | [number, number, number] | THREE.Object3D,
    options?: {velocity?: number}
  ): Promise<void> {
    if (!this.executor) {
      throw new Error('EmbodiedControl is not initialized.');
    }
    return this.executor.reachTo(handIndex, target, options);
  }

  click(handIndex = 1, options?: {durationMs?: number}): Promise<void> {
    if (!this.executor) {
      throw new Error('EmbodiedControl is not initialized.');
    }
    return this.executor.click(handIndex, options);
  }
}
