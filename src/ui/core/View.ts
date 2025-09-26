import * as THREE from 'three';

import {VIEW_DEPTH_GAP} from '../../constants';
import {Script} from '../../core/Script';
import {DP_TO_DMM} from '../constants';

import type {ViewOptions} from './ViewOptions';

// Temporary variables.
const worldScale = new THREE.Vector3();

/**
 * A fundamental UI component for creating interactive user
 * interfaces. It serves as a base class for other UI elements like Panels,
 * Rows, and Columns, providing core layout logic, visibility control, and
 * interaction hooks.
 *
 * Each `View` is a `THREE.Object3D` and inherits lifecycle methods from
 * `Script`.
 */
export class View<TEventMap extends THREE.Object3DEventMap =
                                        THREE.Object3DEventMap> extends
    Script<TEventMap> {
  /** Text description of the view */
  name = 'View';
  /** Flag indicating View behaves as a 2D quad in layout calculations. */
  isQuad = true;
  /** Flag indicating if this is the root view of a layout. */
  isRoot = false;
  /** Type identifier for easy checking with `instanceof`. */
  isView = true;
  /** Determines if this view can be targeted by user input. */
  selectable = true;

  // --- Layout Properties ---

  /** Proportional size used in layouts like `Row` or `Col`. */
  weight = 0.5;
  /** The width of the view, as a 0-1 ratio of its parent's available space. */
  width = 1;
  /** The height of the view, as a 0-1 ratio of its parent's available space. */
  height = 1;
  /**
   * The local x-coordinate within the parent's layout, from -0.5 to 0.5.
   * For root view (Panel), this will be addition to the global positioning.
   */
  x = 0;
  /**
   * The local y-coordinate within the parent's layout, from -0.5 to 0.5.
   * For root view (Panel), this will be addition to the global positioning.
   */
  y = 0;
  /**
   * The local z-coordinate within the parent's layout.
   * For root view (Panel), this will be addition to the global positioning.
   */
  z = 0;
  /** Horizontal padding, as a 0-1 ratio of the parent's width. */
  paddingX = 0;
  /** Vertical padding, as a 0-1 ratio of the parent's height. */
  paddingY = 0;
  /** Depth padding, for z-axis adjustment to prevent z-fighting. */
  paddingZ = 0;

  // --- Visual Properties ---

  /** The overall opacity of the view and its children. */
  opacity = 1.0;
  /** The underlying THREE.Mesh if the view has a visible geometry. */
  mesh?: THREE.Mesh;
  /** The calculated aspect ratio (width / height) of this view. */
  aspectRatio = 1.0;

  /**
   * Gets the effective horizontal range for child elements, normalized to 1.0
   * for the smaller dimension.
   * @returns The horizontal layout range.
   */
  get rangeX(): number {
    return Math.max(this.aspectRatio, 1.0);
  }

  /**
   * Gets the effective vertical range for child elements, normalized to 1.0 for
   * the smaller dimension.
   * @returns The vertical layout range.
   */
  get rangeY(): number {
    return Math.max(1.0 / this.aspectRatio, 1.0);
  }

  /**
   * Creates an instance of View.
   * @param options - Configuration options to apply to the view.
   * @param geometry - The geometry for the view's mesh.
   * @param material - The material for the view's mesh.
   */
  constructor(
      options: ViewOptions = {}, geometry?: THREE.BufferGeometry,
      material?: THREE.Material) {
    super();
    if (geometry && material) {
      this.mesh = new THREE.Mesh(geometry, material);
      this.add(this.mesh);
    }
    Object.assign(this, options);
  }

  /**
   * Converts a value from Density-Independent Pixels (DP) to meters.
   * @param dp - The value in density-independent pixels.
   * @returns The equivalent value in meters.
   */
  static dpToMeters(dp: number): number {
    return dp * DP_TO_DMM * 0.001;
  }

  /**
   * Converts a value from Density-Independent Pixels (DP) to local units.
   * @param dp - The value in density-independent pixels.
   * @returns The equivalent value in local units.
   */
  dpToLocalUnits(dp: number): number {
    this.getWorldScale(worldScale);
    return View.dpToMeters(dp) / worldScale.x;
  }

  /** Makes the view and all its descendants visible. */
  show() {
    this.visible = true;
    this.traverse((child) => {
      child.visible = true;
    });
  }

  /** Makes the view and all its descendants invisible. */
  hide() {
    this.visible = false;
    this.traverse((child) => {
      child.visible = false;
    });
  }

  /**
   * Calculates and applies the position and scale for this single view based on
   * its layout properties and its parent's dimensions.
   */
  updateLayout() {
    if (this.isRoot || this.parent == null) {
      // Root views are centered and scaled directly by their width and height.
      this.aspectRatio = this.width / this.height;
      this.scale.setScalar(Math.min(this.width, this.height));
    } else if (this.parent instanceof View) {
      // Child views are positioned relative to their parent with padding.
      // A small depth gap is added to prevent z-fighting between UI layers.
      this.position.set(
          (this.x + this.paddingX) * this.parent.rangeX,
          (this.y - this.paddingY) * this.parent.rangeY,
          this.paddingZ + VIEW_DEPTH_GAP);
      this.aspectRatio = (this.width / this.height) * this.parent.aspectRatio;
      this.scale.setScalar(Math.min(
          this.parent.rangeX * this.width, this.parent.rangeY * this.height));

      // Increment renderOrder to ensure children render on top of parents,
      // which is crucial for transparency.
      this.renderOrder = this.parent.renderOrder + 1;
    }
  }

  /** Triggers a layout update for this view and all its descendants. */
  updateLayouts() {
    this.updateLayoutsBFS();
  }

  /**
   * Performs a Breadth-First Search (BFS) traversal to update the layout tree,
   * ensuring parent layouts are calculated before their children.
   */
  updateLayoutsBFS() {
    const queue: THREE.Object3D[] = [this];
    while (queue.length > 0) {
      const currentView = queue.shift();
      if (currentView instanceof View) {
        currentView.updateLayout();
        currentView.children.forEach((childView) => {
          queue.push(childView);
        });
      }
    }
  }

  /**
   * Resets the layout state of this view. Intended for override by subclasses.
   */
  resetLayout() {}

  /** Resets the layout state for this view and all its descendants. */
  resetLayouts() {
    const queue: THREE.Object3D[] = [this];
    while (queue.length > 0) {
      const currentView = queue.shift();
      if (currentView instanceof View) {
        currentView.resetLayout();
        currentView.children.forEach((childView) => {
          queue.push(childView);
        });
      }
    }
  }

  /**
   * Overrides `THREE.Object3D.add` to automatically trigger a layout update
   * when a new `View` is added as a child.
   */
  add(...children: THREE.Object3D[]) {
    super.add(...children);
    for (const child of children) {
      if (child instanceof View) {
        child.updateLayoutsBFS();
      }
    }
    return this;
  }

  /**
   * Hook called on a complete select action (e.g., a click) when this view is
   * the target. Intended for override by subclasses.
   * @param _id - The ID of the controller that triggered the action.
   */
  onTriggered(_id: number) {}
}
