import { Injectable } from '../../utils/DependencyInjection';
export declare class SimulatorUserAction implements Injectable {
    static dependencies: {};
    init(_options?: object): Promise<void>;
    play(_options?: object): Promise<void>;
}
