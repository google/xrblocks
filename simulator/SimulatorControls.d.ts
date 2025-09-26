import * as THREE from 'three';
import { Input } from '../input/Input';
import { Keycodes } from '../utils/Keycodes';
import { SimulatorControlMode } from './controlModes/SimulatorControlMode';
import { SimulatorRenderMode } from './SimulatorConstants';
import { SimulatorControllerState } from './SimulatorControllerState';
import { SimulatorHands } from './SimulatorHands';
import { SimulatorInterface } from './SimulatorInterface';
import { SimulatorMode, SimulatorOptions } from './SimulatorOptions';
export type SimulatorModeIndicatorElement = HTMLElement & {
    simulatorMode: SimulatorMode;
};
export declare class SimulatorControls {
    simulatorControllerState: SimulatorControllerState;
    hands: SimulatorHands;
    private userInterface;
    pointerDown: boolean;
    downKeys: Set<Keycodes>;
    modeIndicatorElement?: SimulatorModeIndicatorElement;
    simulatorMode: SimulatorMode;
    simulatorModeControls: SimulatorControlMode;
    simulatorModes: {
        [key: string]: SimulatorControlMode;
    };
    renderer: THREE.WebGLRenderer;
    private _onPointerDown;
    private _onPointerUp;
    private _onKeyDown;
    private _onKeyUp;
    private _onPointerMove;
    /**
     * Create the simulator controls.
     * @param hands - The simulator hands manager.
     * @param setStereoRenderMode - A function to set the stereo mode.
     * @param userInterface - The simulator user interface manager.
     */
    constructor(simulatorControllerState: SimulatorControllerState, hands: SimulatorHands, setStereoRenderMode: (_: SimulatorRenderMode) => void, userInterface: SimulatorInterface);
    /**
     * Initialize the simulator controls.
     */
    init({ camera, input, timer, renderer, simulatorOptions }: {
        camera: THREE.Camera;
        input: Input;
        timer: THREE.Timer;
        renderer: THREE.WebGLRenderer;
        simulatorOptions: SimulatorOptions;
    }): void;
    connect(): void;
    update(): void;
    onPointerMove(event: MouseEvent): void;
    onPointerDown(event: MouseEvent): void;
    onPointerUp(event: MouseEvent): void;
    onKeyDown(event: KeyboardEvent): void;
    onKeyUp(event: KeyboardEvent): void;
    setSimulatorMode(mode: SimulatorMode): void;
    setModeIndicatorElement(element: SimulatorModeIndicatorElement): void;
}
