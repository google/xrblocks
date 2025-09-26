import * as THREE from 'three';
import type { Reticle } from '../ui/core/Reticle';
export interface ControllerEventMap extends THREE.Object3DEventMap {
    connected: {
        target: Controller;
        data?: XRInputSource;
    };
    disconnected: {
        target: Controller;
        data?: XRInputSource;
    };
    select: {
        target: Controller;
        data?: XRInputSource;
    };
    selectstart: {
        target: Controller;
        data?: XRInputSource;
    };
    selectend: {
        target: Controller;
        data?: XRInputSource;
    };
    squeeze: {
        target: Controller;
        data?: XRInputSource;
    };
    squeezestart: {
        target: Controller;
        data?: XRInputSource;
    };
    squeezeend: {
        target: Controller;
        data?: XRInputSource;
    };
}
export interface Controller extends THREE.Object3D<ControllerEventMap> {
    reticle?: Reticle;
    gamepad?: Gamepad;
    inputSource?: Partial<XRInputSource>;
}
export interface ControllerEvent {
    type: keyof ControllerEventMap;
    target: Controller;
    data?: Partial<XRInputSource>;
}
