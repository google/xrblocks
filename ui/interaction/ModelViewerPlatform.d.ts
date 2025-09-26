import * as THREE from 'three';
import { AnimatableNumber } from './AnimatableNumber.js';
/**
 * A specialized `THREE.Mesh` that serves as the interactive base for
 * a `ModelViewer`. It has a distinct visual appearance and handles the logic
 * for fading in and out on hover. Its `draggingMode` is set to `TRANSLATING` to
 * enable movement.
 */
export declare class ModelViewerPlatform extends THREE.Mesh<THREE.BufferGeometry, THREE.Material[]> {
    draggingMode: import("../../xrblocks.js").DragMode;
    opacity: AnimatableNumber;
    constructor(width: number, depth: number, thickness: number);
    update(deltaTime: number): void;
}
