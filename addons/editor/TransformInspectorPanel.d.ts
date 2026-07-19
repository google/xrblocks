import * as xb from 'xrblocks';
import type { CommandHistory } from './CommandHistory';
import type { SceneManager } from './SceneManager';
import type { SelectionManager } from './SelectionManager';
type Axis = 'x' | 'y' | 'z';
interface AxisInputs {
    x: HTMLInputElement;
    y: HTMLInputElement;
    z: HTMLInputElement;
}
export interface TransformInspectorPanelOptions {
    parent?: HTMLElement;
}
/**
 * Numeric position/rotation/scale readout+editor for the current
 * selection (single or multi). Desktop/simulator-only 2D HTML overlay
 * (self-contained: builds and injects its own DOM/CSS) rather than a 3D
 * SpatialPanel -- gives real typed number inputs instead of stepper
 * buttons. Still an xb.Script purely to get a free per-frame update()
 * tick; it has no 3D presence.
 *
 * With multiple objects selected, a field shows a value only if every
 * selected object agrees on it (within a small epsilon); otherwise it's
 * blanked with a "Mixed" placeholder, Blender/Unity-style. Committing a
 * value in any field applies it as an absolute value to every selected
 * object at once, as a single batched undo step.
 *
 * Rotation is displayed/edited via Euler degrees for readability, but the
 * gizmo itself (TransformGizmo) always drives objects via quaternions --
 * Euler here is just a convenience readout, and can show axis-coupling
 * artifacts if you mix field edits with gizmo drags on other axes.
 */
export declare class TransformInspectorPanel extends xb.Script {
    selectionManager: SelectionManager;
    sceneManager: SceneManager;
    commandHistory: CommandHistory | null;
    root: HTMLDivElement;
    nameLabel: HTMLDivElement;
    spaceButton: HTMLButtonElement;
    positionInputs: AxisInputs;
    rotationInputs: AxisInputs;
    scaleInputs: AxisInputs;
    constructor(selectionManager: SelectionManager, sceneManager: SceneManager, commandHistory?: CommandHistory | null, { parent }?: TransformInspectorPanelOptions);
    toggleSpace(): void;
    updateSpaceButton(): void;
    wireInput(input: HTMLInputElement, apply: () => void): void;
    update(): void;
    onKeyDown(event: KeyboardEvent): void;
    applyPosition(axis: Axis): void;
    applyRotation(axis: Axis): void;
    applyScale(axis: Axis): void;
    duplicateSelected(): Promise<void>;
    deleteSelected(): void;
    /** Writes one axis-triple of values into `inputs`, blanking any field
     * the selection doesn't agree on (within `epsilon`) with a "Mixed"
     * placeholder instead. Skips a field the user is actively typing into,
     * or the live per-frame refresh would overwrite keystrokes mid-edit. */
    setFieldValues(inputs: AxisInputs, valuesByAxis: Record<Axis, number[]>, decimals: number, epsilon: number): void;
    refresh(): void;
}
export {};
