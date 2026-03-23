import * as THREE from 'three';
import { UICardBehavior } from './UICardBehavior';
/**
 * AnchorMode
 * 'position' - Matches X,Y,Z translations only (good if you want Billboarding for rotation).
 * 'rotation' - Matches rotation locks orientation only.
 * 'pose' - Matches both position and rotation triggers (like a sticker anchor).
 */
export type AnchorMode = 'position' | 'rotation' | 'pose';
/**
 * AnchorTarget
 * Flexible interface: works with DetectedObject, THREE.Object3D, or simple data structs.
 */
export interface AnchorTarget {
    position: THREE.Vector3;
    quaternion?: THREE.Quaternion;
}
/**
 * Configuration parameters for ObjectAnchorBehavior setup options.
 */
export interface ObjectAnchorConfig {
    /** The target object to anchor alignment onto. */
    target: AnchorTarget;
    /** The alignment lock approaches frame. Defaults to 'position'. */
    mode?: AnchorMode;
    /** Position offsets offset mappings. */
    positionOffset?: THREE.Vector3;
    /** Rotation offsets offset mappings. */
    rotationOffset?: THREE.Quaternion;
}
/**
 * ObjectAnchorBehavior
 * Anchors a `UICard` to another 3D object in the scene with optional continuous offset buffers.
 * Supports position, rotation, or full pose alignment hooks seamlessly.
 */
export declare class ObjectAnchorBehavior extends UICardBehavior<ObjectAnchorConfig> {
    private positionOffset;
    private rotationOffset;
    private _wasDragging;
    /**
     * Constructs a new ObjectAnchorBehavior.
     */
    constructor(config: ObjectAnchorConfig);
    update(): void;
}
