import { Registry } from '../core/components/Registry.js';
import { WaitFrame } from '../core/components/WaitFrame.js';
import { Script } from '../core/Script.js';
import { SimulatorUserAction } from './userActions/SimulatorUserAction.js';
export declare class SimulatorUser extends Script {
    static dependencies: {
        waitFrame: typeof WaitFrame;
        registry: typeof Registry;
    };
    journeyId: number;
    waitFrame: WaitFrame;
    registry: Registry;
    constructor();
    init({ waitFrame, registry }: {
        waitFrame: WaitFrame;
        registry: Registry;
    }): void;
    stopJourney(): void;
    isOnJourneyId(id: number): boolean;
    loadJourney(actions: SimulatorUserAction[]): Promise<void>;
}
