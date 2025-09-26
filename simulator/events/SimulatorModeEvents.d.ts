import { SimulatorMode } from '../SimulatorOptions';
export declare class SetSimulatorModeEvent extends Event {
    simulatorMode: SimulatorMode;
    static type: string;
    constructor(simulatorMode: SimulatorMode);
}
