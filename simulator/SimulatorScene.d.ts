import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { SimulatorOptions } from './SimulatorOptions';
export declare class SimulatorScene extends THREE.Scene {
    gltf?: GLTF;
    constructor();
    init(simulatorOptions: SimulatorOptions): Promise<void>;
    addLights(): void;
    loadGLTF(path: string, initialPosition: THREE.Vector3): Promise<unknown>;
}
