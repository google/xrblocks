import { DeepPartial } from '../../utils/Types';
export declare class PlanesOptions {
    debugging: boolean;
    enabled: boolean;
    showDebugVisualizations: boolean;
    constructor(options?: DeepPartial<PlanesOptions>);
    enable(): this;
}
