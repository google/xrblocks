import * as THREE from 'three';
import { UICardBehavior } from './UICardBehavior';
/**
 * Configuration parameters for HeadLeashBehavior setup options.
 */
export interface HeadLeashConfig {
    /** Position offset relative to the user's camera view. */
    offset: THREE.Vector3;
    /** Smoothing slider for position tracks. */
    posLerp?: number;
    /** Smoothing slider for rotation tracks. */
    rotLerp?: number;
}
/**
 * HeadLeashBehavior
 * Makes a `UICard` gently follow the user's head movement with a delay (spring/damper).
 * Keeps the panel within comfortable viewing frustums maintaining responsive overlays.
 */
export declare class HeadLeashBehavior extends UICardBehavior<HeadLeashConfig> {
    private _targetPos;
    private _dummy;
    private _wasDragging;
    /**
     * Constructs a new HeadLeashBehavior.
     */
    constructor(config: HeadLeashConfig);
    update(): void;
}
