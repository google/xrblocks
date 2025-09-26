import * as THREE from 'three';
import { SimulatorMediaDeviceInfo } from './SimulatorMediaDeviceInfo';
export declare class SimulatorCamera {
    private renderer;
    private cameraCreated;
    private cameraInfo?;
    private mediaStream?;
    private canvas?;
    private context?;
    private fps;
    matchRenderingCamera: boolean;
    width: number;
    height: number;
    camera: THREE.PerspectiveCamera;
    constructor(renderer: THREE.WebGLRenderer);
    init(): void;
    createSimulatorCamera(): void;
    enumerateDevices(): Promise<SimulatorMediaDeviceInfo[]>;
    onBeforeSimulatorSceneRender(camera: THREE.Camera, renderScene: (_: THREE.Camera) => void): void;
    onSimulatorSceneRendered(): void;
    restartVideoTrack(): void;
    getMedia(constraints?: MediaTrackConstraints): MediaStream | null | undefined;
}
