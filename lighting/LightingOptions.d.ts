import { DeepPartial, DeepReadonly } from '../utils/Types';
/**
 * Default options for controlling Lighting module features.
 */
export declare class LightingOptions {
    /** Enables debugging renders and logs. */
    debugging: boolean;
    /** Enables XR lighting. */
    enabled: boolean;
    /** Add ambient spherical harmonics to lighting. */
    useAmbientSH: boolean;
    /** Add main diredtional light to lighting. */
    useDirectionalLight: boolean;
    /** Cast shadows using diretional light. */
    castDirectionalLightShadow: boolean;
    /**
     * Adjust hardness of shadows according to relative brightness of main light.
     */
    useDynamicSoftShadow: boolean;
    constructor(options?: DeepReadonly<DeepPartial<LightingOptions>>);
}
