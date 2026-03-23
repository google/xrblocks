import { UICardBehavior } from './UICardBehavior';
/**
 * BillboardMode
 * 'cylindrical' - Restrict rotation to position locks on the Y-axis.
 * 'spherical' - Full dimensional look-at view framing.
 */
export type BillboardMode = 'cylindrical' | 'spherical';
/**
 * Configuration parameters for BillboardBehavior setup options.
 */
export interface BillboardConfig {
    /** The lock axis framing approach configuration. */
    mode?: BillboardMode;
    /** Smoothing lerp value coefficient mapping framerate increments. */
    lerpFactor?: number;
}
/**
 * BillboardBehavior
 * Makes a `UICard` automatically face the user's camera view.
 * Dynamically resolves continuous frames updating smoothly into calculated thresholds.
 */
export declare class BillboardBehavior extends UICardBehavior<BillboardConfig> {
    private _targetPos;
    private _dummy;
    /**
     * Constructs a new BillboardBehavior.
     */
    constructor(config?: BillboardConfig);
    update(): void;
}
