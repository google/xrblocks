import * as THREE from 'three';
import { Script } from '../../core/Script';
import type { ViewOptions } from './ViewOptions';
/**
 * A fundamental UI component for creating interactive user
 * interfaces. It serves as a base class for other UI elements like Panels,
 * Rows, and Columns, providing core layout logic, visibility control, and
 * interaction hooks.
 *
 * Each `View` is a `THREE.Object3D` and inherits lifecycle methods from
 * `Script`.
 */
export declare class View<TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap> extends Script<TEventMap> {
    /** Text description of the view */
    name: string;
    /** Flag indicating View behaves as a 2D quad in layout calculations. */
    isQuad: boolean;
    /** Flag indicating if this is the root view of a layout. */
    isRoot: boolean;
    /** Type identifier for easy checking with `instanceof`. */
    isView: boolean;
    /** Determines if this view can be targeted by user input. */
    selectable: boolean;
    /** Proportional size used in layouts like `Row` or `Col`. */
    weight: number;
    /** The width of the view, as a 0-1 ratio of its parent's available space. */
    width: number;
    /** The height of the view, as a 0-1 ratio of its parent's available space. */
    height: number;
    /**
     * The local x-coordinate within the parent's layout, from -0.5 to 0.5.
     * For root view (Panel), this will be addition to the global positioning.
     */
    x: number;
    /**
     * The local y-coordinate within the parent's layout, from -0.5 to 0.5.
     * For root view (Panel), this will be addition to the global positioning.
     */
    y: number;
    /**
     * The local z-coordinate within the parent's layout.
     * For root view (Panel), this will be addition to the global positioning.
     */
    z: number;
    /** Horizontal padding, as a 0-1 ratio of the parent's width. */
    paddingX: number;
    /** Vertical padding, as a 0-1 ratio of the parent's height. */
    paddingY: number;
    /** Depth padding, for z-axis adjustment to prevent z-fighting. */
    paddingZ: number;
    /** The overall opacity of the view and its children. */
    opacity: number;
    /** The underlying THREE.Mesh if the view has a visible geometry. */
    mesh?: THREE.Mesh;
    /** The calculated aspect ratio (width / height) of this view. */
    aspectRatio: number;
    /**
     * Gets the effective horizontal range for child elements, normalized to 1.0
     * for the smaller dimension.
     * @returns The horizontal layout range.
     */
    get rangeX(): number;
    /**
     * Gets the effective vertical range for child elements, normalized to 1.0 for
     * the smaller dimension.
     * @returns The vertical layout range.
     */
    get rangeY(): number;
    /**
     * Creates an instance of View.
     * @param options - Configuration options to apply to the view.
     * @param geometry - The geometry for the view's mesh.
     * @param material - The material for the view's mesh.
     */
    constructor(options?: ViewOptions, geometry?: THREE.BufferGeometry, material?: THREE.Material);
    /**
     * Converts a value from Density-Independent Pixels (DP) to meters.
     * @param dp - The value in density-independent pixels.
     * @returns The equivalent value in meters.
     */
    static dpToMeters(dp: number): number;
    /**
     * Converts a value from Density-Independent Pixels (DP) to local units.
     * @param dp - The value in density-independent pixels.
     * @returns The equivalent value in local units.
     */
    dpToLocalUnits(dp: number): number;
    /** Makes the view and all its descendants visible. */
    show(): void;
    /** Makes the view and all its descendants invisible. */
    hide(): void;
    /**
     * Calculates and applies the position and scale for this single view based on
     * its layout properties and its parent's dimensions.
     */
    updateLayout(): void;
    /** Triggers a layout update for this view and all its descendants. */
    updateLayouts(): void;
    /**
     * Performs a Breadth-First Search (BFS) traversal to update the layout tree,
     * ensuring parent layouts are calculated before their children.
     */
    updateLayoutsBFS(): void;
    /**
     * Resets the layout state of this view. Intended for override by subclasses.
     */
    resetLayout(): void;
    /** Resets the layout state for this view and all its descendants. */
    resetLayouts(): void;
    /**
     * Overrides `THREE.Object3D.add` to automatically trigger a layout update
     * when a new `View` is added as a child.
     */
    add(...children: THREE.Object3D[]): this;
    /**
     * Hook called on a complete select action (e.g., a click) when this view is
     * the target. Intended for override by subclasses.
     * @param _id - The ID of the controller that triggered the action.
     */
    onTriggered(_id: number): void;
}
