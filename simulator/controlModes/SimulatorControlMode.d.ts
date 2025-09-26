import * as THREE from 'three';
import { Input } from '../../input/Input.js';
import { Keycodes } from '../../utils/Keycodes';
import { SimulatorRenderMode } from '../SimulatorConstants';
import { SimulatorControllerState } from '../SimulatorControllerState';
import { SimulatorHands } from '../SimulatorHands.js';
export declare class SimulatorControlMode {
    protected simulatorControllerState: SimulatorControllerState;
    protected downKeys: Set<Keycodes>;
    protected hands: SimulatorHands;
    protected setStereoRenderMode: (_: SimulatorRenderMode) => void;
    protected toggleUserInterface: () => void;
    camera: THREE.Camera;
    input: Input;
    timer: THREE.Timer;
    /**
     * Create a SimulatorControlMode
     */
    constructor(simulatorControllerState: SimulatorControllerState, downKeys: Set<Keycodes>, hands: SimulatorHands, setStereoRenderMode: (_: SimulatorRenderMode) => void, toggleUserInterface: () => void);
    /**
     * Initialize the simulator control mode.
     */
    init({ camera, input, timer }: {
        camera: THREE.Camera;
        input: Input;
        timer: THREE.Timer;
    }): void;
    onPointerDown(_: MouseEvent): void;
    onPointerUp(_: MouseEvent): void;
    onPointerMove(_: MouseEvent): void;
    onKeyDown(event: KeyboardEvent): void;
    onModeActivated(): void;
    onModeDeactivated(): void;
    update(): void;
    updateCameraPosition(): void;
    updateControllerPositions(): void;
    rotateOnPointerMove(event: MouseEvent, objectQuaternion: THREE.Quaternion, multiplier?: number): void;
    enableSimulatorHands(): void;
    disableSimulatorHands(): void;
}
