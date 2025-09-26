import { DeepPartial } from '../utils/Types';
import { ObjectsOptions } from './objects/ObjectsOptions';
import { PlanesOptions } from './planes/PlanesOptions';
export declare class WorldOptions {
    debugging: boolean;
    enabled: boolean;
    planes: PlanesOptions;
    objects: ObjectsOptions;
    constructor(options?: DeepPartial<WorldOptions>);
    /**
     * Enables plane detection.
     */
    enablePlaneDetection(): this;
    /**
     * Enables object detection.
     */
    enableObjectDetection(): this;
}
