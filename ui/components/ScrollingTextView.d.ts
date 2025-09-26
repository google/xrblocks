import * as THREE from 'three';
import { View } from '../core/View';
/**
 * A View that displays text on a canvas and supports smooth
 * scrolling when new content is added. This component is designed as a
 * performant fallback for displaying simple, multi-line text (like logs or
 * chat messages) when advanced SDF text rendering is not needed or available.
 * It operates its own render loop using `requestAnimationFrame` to update the
 * canvas texture.
 */
export declare class ScrollingTextView extends View {
    options: {
        width: number;
        height: number;
        maxLines: number;
        fontSize: number;
        lineHeight: number;
        font: string;
        fillStyle: string;
        scrollingSpeed: number;
    };
    mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    private lines;
    private startLineId;
    private currentDeltaY;
    private targetDeltaY;
    private isResetting;
    private canvas;
    private ctx;
    constructor(options?: {});
    getLines(text: string, maxWidth: number): string[];
    addText(text: string): void;
    clear(): this;
    renderText(): void;
}
