import { SimulatorControls } from './SimulatorControls.js';
import { SimulatorHands } from './SimulatorHands.js';
import { SimulatorOptions } from './SimulatorOptions.js';
export declare class SimulatorInterface {
    private elements;
    private interfaceVisible;
    /**
     * Initialize the simulator interface.
     */
    init(simulatorOptions: SimulatorOptions, simulatorControls: SimulatorControls, simulatorHands: SimulatorHands): void;
    createModeIndicator(simulatorOptions: SimulatorOptions, simulatorControls: SimulatorControls): void;
    showInstructions(simulatorOptions: SimulatorOptions): void;
    showGeminiLivePanel(simulatorOptions: SimulatorOptions): void;
    createHandPosePanel(simulatorOptions: SimulatorOptions, simulatorHands: SimulatorHands): void;
    hideUiElements(): void;
    showUiElements(): void;
    getInterfaceVisible(): boolean;
    toggleInterfaceVisible(): void;
}
