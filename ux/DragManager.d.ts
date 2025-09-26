import * as THREE from 'three';
import { Script, SelectEvent } from '../core/Script';
import { Input } from '../input/Input';
export interface Draggable extends THREE.Object3D {
    draggable: boolean;
    dragFacingCamera?: boolean;
}
export declare enum DragMode {
    TRANSLATING = "TRANSLATING",
    ROTATING = "ROTATING",
    SCALING = "SCALING",
    DO_NOT_DRAG = "DO_NOT_DRAG"
}
export interface HasDraggingMode {
    draggingMode: DragMode;
}
export declare class DragManager extends Script {
    static readonly dependencies: {
        input: typeof Input;
        camera: typeof THREE.Camera;
    };
    static readonly IDLE = "IDLE";
    static readonly TRANSLATING = DragMode.TRANSLATING;
    static readonly ROTATING = DragMode.ROTATING;
    static readonly SCALING = DragMode.SCALING;
    static readonly DO_NOT_DRAG = DragMode.DO_NOT_DRAG;
    private mode;
    private controller1?;
    private controller2?;
    private originalObjectPosition;
    private originalObjectRotation;
    private originalObjectScale;
    private originalController1Position;
    private originalController1RotationInverse;
    private originalController1MatrixInverse;
    private originalScalingControllerDistance;
    private originalScalingObjectScale;
    private intersection?;
    private draggableObject?;
    private input;
    private camera;
    init({ input, camera }: {
        input: Input;
        camera: THREE.Camera;
    }): void;
    onSelectStart(event: SelectEvent): void;
    onSelectEnd(): void;
    update(): void;
    beginDragging(intersection: THREE.Intersection, controller: THREE.Object3D): boolean;
    beginScaling(controller: THREE.Object3D): boolean;
    updateDragging(controller: THREE.Object3D): boolean | undefined;
    updateTranslating(): boolean;
    updateRotating(controller: THREE.Object3D): boolean | undefined;
    updateRotatingFromMouseController(controller: THREE.Object3D): boolean;
    updateScaling(): boolean;
    turnPanelToFaceTheCamera(): void;
    /**
     * Seach up the scene graph to find the first draggable object and the first
     * drag mode at or below the draggable object.
     * @param target - Child object to search.
     * @returns Array containing the first draggable object and the first drag
     *     mode.
     */
    private findDraggableObjectAndDraggingMode;
}
