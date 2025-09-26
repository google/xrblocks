import * as THREE from 'three';
import * as xb from 'xrblocks';
export declare class ModelManager extends xb.Script {
    modelsData: xb.GLTFData[];
    private enableOcclusion;
    models: xb.ModelViewer[];
    occludableShaders: xb.Shader[];
    currentModelIndex: number;
    constructor(modelsData: xb.GLTFData[], enableOcclusion?: boolean);
    init(): void;
    getCurrentModel(): xb.ModelViewer;
    positionModelAtIntersection(intersection: THREE.Intersection, camera: THREE.Object3D): void;
    getOcclusionEnabled(): any;
    setOcclusionEnabled(enabled: boolean): void;
}
