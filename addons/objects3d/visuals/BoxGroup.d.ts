/**
 * Debug box-group builder and label sprite helpers.
 *
 * These helpers depend on the DOM (`document.createElement`) and are therefore
 * excluded from unit tests. They are only called when `showDebugBoxes` is
 * enabled on {@link Object3DDetector}.
 */
import * as THREE from 'three';
import type { InternalObb } from '../geometry/ObbFitting';
/**
 * Per-category edge colours for debug visualisation.
 * Flat (paintings/TV) = orange, furniture = green, small (cup/remote) = cyan,
 * light = yellow.
 */
export declare const CAT_COLOR: Record<string, number>;
/**
 * Build a canvas-based {@link THREE.Sprite} that displays `text` with a pill
 * background coloured to match `lineColor`. The sprite billboards toward the
 * camera automatically and scales with viewer distance so it reads at a
 * consistent visual size.
 *
 * @param text - Label string to render.
 * @param lineColor - Hex colour integer for the pill border (e.g. `0x4cd964`).
 * @returns A fully configured {@link THREE.Sprite} ready to add to the scene.
 */
export declare function makeLabelSprite(text: string, lineColor: number): THREE.Sprite;
/**
 * Build a debug box group for the given OBB with edge outlines (two passes:
 * ghost-faint with depth-test off + solid with depth-test on) and a label
 * sprite above the top face.
 *
 * @param obb - Oriented bounding box to visualise.
 * @param label - Text label shown above the box.
 * @param color - Hex colour integer for the edges and label border.
 * @returns A `THREE.Group` positioned and rotated to match `obb`.
 */
export declare function buildBoxGroup(obb: InternalObb, label: string, color?: number): THREE.Group;
/**
 * Rebuild the edge geometry of an existing box group in place after an OBB
 * fusion update, without destroying the label sprite or event listeners.
 *
 * @param group - Box group previously created by {@link buildBoxGroup}.
 * @param obb - New OBB to apply.
 */
export declare function rebuildBoxGroupGeometry(group: THREE.Group, obb: InternalObb): void;
