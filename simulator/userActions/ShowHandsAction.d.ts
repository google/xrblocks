import { Simulator } from '../Simulator';
import { SimulatorUserAction } from './SimulatorUserAction';
export declare class ShowHandsAction extends SimulatorUserAction {
    static dependencies: {
        simulator: typeof Simulator;
    };
    simulator: Simulator;
    init({ simulator }: {
        simulator: Simulator;
    }): Promise<void>;
    play(): Promise<void>;
}
