import * as THREE from 'three';
import { SelectEvent } from '../../core/Script';
import { User } from '../../core/User';
import { View } from '../core/View';
/**
 * A `View` that functions as a drawable canvas in 3D space. It uses
 * an HTML canvas as a texture on a plane, allowing users to draw on its surface
 * with their XR controllers. It supports basic drawing, undo, and redo
 * functionality.
 */
export declare class SketchPanel extends View {
    #private;
    static dependencies: {
        user: typeof User;
    };
    private canvas;
    private ctx;
    private activeHand;
    private activeLine;
    private activeLines;
    private removedLines;
    private isDrawing;
    private user;
    material: THREE.MeshBasicMaterial;
    constructor();
    /**
     * Init the SketchPanel.
     */
    init({ user }: {
        user: User;
    }): void;
    getContext(): CanvasRenderingContext2D;
    triggerUpdate(): void;
    onSelectStart(event: SelectEvent): void;
    onSelectEnd(event: SelectEvent): void;
    /**
     * Updates the painter's line to the current pivot position during selection.
     */
    onSelecting(event: SelectEvent): void;
    clearCanvas(forceUpdate?: boolean): void;
    removeAll(): void;
    undo(): void;
    redo(): void;
    update(): void;
}
