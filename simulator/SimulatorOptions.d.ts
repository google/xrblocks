import type { TemplateResult } from 'lit';
import { Handedness } from '../input/Hands';
import { DeepPartial, DeepReadonly } from '../utils/Types';
export declare enum SimulatorMode {
    USER = "User",
    POSE = "Navigation",
    CONTROLLER = "Hands"
}
export declare const NEXT_SIMULATOR_MODE: {
    User: SimulatorMode;
    Navigation: SimulatorMode;
    Hands: SimulatorMode;
};
export interface SimulatorCustomInstruction {
    header: string | TemplateResult;
    videoSrc?: string;
    description: string | TemplateResult;
}
export declare class SimulatorOptions {
    initialCameraPosition: {
        x: number;
        y: number;
        z: number;
    };
    scenePath: string;
    initialScenePosition: {
        x: number;
        y: number;
        z: number;
    };
    defaultMode: SimulatorMode;
    defaultHand: Handedness;
    modeIndicator: {
        enabled: boolean;
        element: string;
    };
    instructions: {
        enabled: boolean;
        element: string;
        customInstructions: SimulatorCustomInstruction[];
    };
    handPosePanel: {
        enabled: boolean;
        element: string;
    };
    geminilive: boolean;
    stereo: {
        enabled: boolean;
    };
    renderToRenderTexture: boolean;
    blendingMode: 'normal' | 'screen';
    constructor(options?: DeepReadonly<DeepPartial<SimulatorOptions>>);
}
