import * as THREE from 'three';
import { Font } from 'three/addons/loaders/FontLoader.js';
export declare class TextBillboard extends THREE.Object3D {
    private text;
    private font?;
    private textMaterial;
    private textGeometry?;
    private textMesh?;
    /**
     * Constrct a text billboard.
     * @param text - Text to show.
     * @param material - Color of the material.
     * @param font - Font to use. If not provided, a default font will be loaded.
     */
    constructor(text?: string, material?: THREE.Material, font?: Font | undefined);
    generateTextMesh(): void;
    updateText(text: string): void;
    dispose(): void;
}
