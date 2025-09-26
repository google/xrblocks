import * as THREE from 'three';
import { SelectEvent } from '../../core/Script';
import { Input } from '../../input/Input';
import { View } from '../core/View';
import { ViewOptions } from '../core/ViewOptions';
import { PagerState } from './PagerState';
export type PagerOptions = ViewOptions & {
    state?: PagerState;
    enableRaycastOnChildren?: boolean;
    continuousScrolling?: boolean;
};
/**
 * A layout container that manages a collection of `Page` views and
 * allows the user to navigate between them, typically through swiping
 * gestures. It clips the content of its pages to create a sliding window
 * effect.
 */
export declare class Pager extends View {
    static dependencies: {
        renderer: typeof THREE.WebGLRenderer;
        input: typeof Input;
    };
    localClippingPlanes: THREE.Plane[];
    raycastMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial, THREE.Object3DEventMap>;
    state: PagerState;
    clippingPlanes: THREE.Plane[];
    private selecting;
    private selectStartPositionLocal;
    private selectStartPage;
    private raycastPlane;
    private selectingRay;
    private selectingRayTarget;
    private selectingController;
    private enableRaycastOnChildren;
    private continuousScrolling;
    private input;
    constructor(options?: PagerOptions);
    init({ renderer, input }: {
        renderer: THREE.WebGLRenderer;
        input: Input;
    }): void;
    updatePageCount(): void;
    updatePagePositions(): void;
    resetClippingPlanesToLocalSpace(): void;
    updateClippingPlanes(): void;
    update(): void;
    updateLayout(): void;
    onObjectSelectStart(event: SelectEvent): boolean;
    protected computeSelectingDelta(selectingPosition: THREE.Vector3, startSelectPosition: THREE.Vector3): number;
    onSelecting(): void;
    onObjectSelectEnd(event: SelectEvent): boolean;
    /**
     * Raycast to the pager's raycastMesh so the user can scroll across pages.
     */
    raycast(raycaster: THREE.Raycaster, intersects: THREE.Intersection[]): boolean;
}
