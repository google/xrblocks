import * as THREE from 'three';
import { DepthOptions } from './DepthOptions';
export declare class DepthTextures {
    private options;
    private uint16Arrays;
    private uint8Arrays;
    private textures;
    depthData: XRCPUDepthInformation[];
    constructor(options: DepthOptions);
    private createDepthTextures;
    update(depthData: XRCPUDepthInformation, view_id: number): void;
    get(view_id: number): THREE.DataTexture;
}
