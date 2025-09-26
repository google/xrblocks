import { SimulatorControlMode } from './SimulatorControlMode.js';
export declare class SimulatorUserMode extends SimulatorControlMode {
    onModeActivated(): void;
    onModeDeactivated(): void;
    onPointerDown(event: MouseEvent): void;
    onPointerUp(): void;
    onPointerMove(event: MouseEvent): void;
}
