import * as THREE from 'three';

import type {SelectionEndReason} from '../core/Script';
import type {Reticle} from '../interaction/reticle/Reticle';

export interface ControllerEventMap extends THREE.Object3DEventMap {
  connected: {target: Controller; data?: XRInputSource};
  disconnected: {target: Controller; data?: XRInputSource};
  select: {target: Controller; data?: XRInputSource};
  selectstart: {target: Controller; data?: XRInputSource};
  selectend: {target: Controller; data?: XRInputSource};
  squeeze: {target: Controller; data?: XRInputSource};
  squeezestart: {target: Controller; data?: XRInputSource};
  squeezeend: {target: Controller; data?: XRInputSource};
  /**
   * Dispatched by Interaction when this controller's selection ends, even if a
   * target stopped global propagation. `completed` marks a successful
   * selection.
   */
  selectionend: {
    target: Controller;
    completed: boolean;
    reason: SelectionEndReason;
  };
}

export interface Controller extends THREE.Object3D<ControllerEventMap> {
  reticle?: Reticle;
  gamepad?: Gamepad;
  inputSource?: Partial<XRInputSource>;
  updatePose?(): void;
}

export interface ControllerEvent {
  type: keyof ControllerEventMap;
  target: Controller;
  data?: Partial<XRInputSource>;
}
