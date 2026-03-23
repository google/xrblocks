import { UICard } from '../components/UICard';
import { UICardBehavior } from './UICardBehavior';
/**
 * Configuration parameters for ManipulationBehavior setup options.
 */
export interface ManipulationConfig {
    /** Enables dragging/moving the card in 3D frame space. */
    draggable?: boolean;
    /** Forces layout automatic updates maintaining face alignments viewport. */
    faceCamera?: boolean;
}
/**
 * ManipulationBehavior
 * Handles visual padding expansion, rounded edges, and interactive cursor glows for a `UICard`.
 * Also provides complete 3DOF Drag-and-Drop functionality using standard controllers.
 */
export declare class ManipulationBehavior extends UICardBehavior<ManipulationConfig> {
    static activeDraggingCard: UICard | null;
    get isDragging(): boolean;
    private dragging;
    private draggingControllerId;
    private draggingController?;
    private originalCardPosition;
    private originalCardRotation;
    private originalCardScale;
    private originalControllerMatrixInverse;
    private _vector3;
    private _up;
    onAttach(card: UICard): void;
    update(): void;
    dispose(): void;
}
