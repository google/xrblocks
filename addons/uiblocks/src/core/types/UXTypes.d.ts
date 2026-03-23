import * as THREE from 'three';
/**
 * Interface representing the interactive state and capabilities of the UX system.
 * Tracks pointer states (hover, selection, drag) across multiple controllers or input sources.
 */
export interface UX {
    /** Array indicating hover state per input index (e.g., [leftHand, rightHand]). */
    hovered: boolean[];
    /** Array indicating selection/click state per input index. */
    selected: boolean[];
    /** Array indicating active drag sessions per input index. */
    activeDragged: boolean[];
    /** Array containing the current UV coordinates of the pointer intersection per input index. */
    uvs: THREE.Vector2[];
    /**
     * Determines if the given intersection is eligible for processing by this UX instance.
     * @param intersection - The raycast intersection to evaluate.
     * @returns True if the intersection is relevant, false otherwise.
     */
    isRelevantIntersection(intersection: THREE.Intersection): boolean;
    /**
     * Retrieves the IDs of the two primary controllers (e.g., left and right hands).
     * @returns A tuple containing the IDs, or null for indices that are not set.
     */
    getPrimaryTwoControllerIds(): [number | null, number | null];
}
/**
 * Empty export to guarantee Rollup compiler does not emit EMPTY_BUNDLE warnings
 * for pure typescript files.
 */
export declare const _UXTYPES_MODULE_ = true;
