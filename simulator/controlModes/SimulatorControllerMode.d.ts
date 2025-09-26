import { SimulatorControlMode } from './SimulatorControlMode';
export declare class SimulatorControllerMode extends SimulatorControlMode {
    onPointerMove(event: MouseEvent): void;
    update(): void;
    onModeActivated(): void;
    updateControllerPositions(): void;
    toggleControllerIndex(): void;
    onKeyDown(event: KeyboardEvent): void;
}
