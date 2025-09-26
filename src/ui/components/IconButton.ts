import * as THREE from 'three';

import {VIEW_DEPTH_GAP} from '../../constants';
import {TextView, TextViewOptions} from '../components/TextView';

import {MATERIAL_ICONS_FONT_FILE} from './utils/FontFamilies';

/**
 * An interactive circular button that displays a single character
 * icon from the Material Icons font library. It provides visual feedback for
 * hover and selection states by changing its background opacity.
 */
export type IconButtonOptions = TextViewOptions&{
  backgroundColor?: THREE.ColorRepresentation;
  defaultOpacity?: number;
  hoverColor?: number;
  hoverOpacity?: number;
  selectedOpacity?: number;
  opacity?: number;
};

export class IconButton extends TextView {
  /** The overall opacity when the button is not being interacted with. */
  opacity = 1.0;
  /** The background opacity when the button is not being interacted with. */
  defaultOpacity = 0.0;
  /** The background color when a reticle hovers over the button. */
  hoverColor = 0xaaaaaa;
  /** The background opacity when a reticle hovers over the button. */
  hoverOpacity = 0.2;
  /** The background opacity when the button is actively being pressed. */
  selectedOpacity = 0.4;

  /** The icon font file to use. Defaults to Material Icons. */
  font = MATERIAL_ICONS_FONT_FILE;
  /** The underlying mesh for the button's background. */
  mesh!: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

  /**
   * Overrides the parent `rangeX` to ensure the circular shape is not affected
   * by panel aspect ratio.
   */
  get rangeX() {
    return 1;
  }

  /**
   * Overrides the parent `rangeY` to ensure the circular shape is not affected
   * by panel aspect ratio.
   */
  get rangeY() {
    return 1;
  }

  /**
   * An interactive button that displays a single character icon from a font
   * file. Inherits from TextView to handle text rendering.
   * @param options - The options for the IconButton.
   */
  constructor(options: IconButtonOptions = {}) {
    const {backgroundColor = 0xaaaaaa} = options;

    const radius = 0.5;
    const segments = 32;
    const geometry = new THREE.CircleGeometry(radius, segments);
    const material = new THREE.MeshBasicMaterial({
      color: backgroundColor,
      transparent: true,
      depthWrite: false,
      opacity: 0,  // Start with zero opacity, will be controlled by interaction
                   // logic
      side: THREE.FrontSide
    });

    // Pass geometry and material to the TextView -> View chain.
    super(options, geometry, material);

    // Applies all provided options to this instance.
    Object.assign(this, options);
  }

  /**
   * Handles behavior when the cursor hovers over the button.
   * @override
   */
  onHoverOver() {
    if (!this.ux) return;
    this.update();  // Consolidate logic in update()
  }

  /**
   * Handles behavior when the cursor moves off the button.
   * @override
   */
  onHoverOut() {
    if (!this.ux) return;
    this.update();  // Consolidate logic in update()
  }

  /**
   * Updates the button's visual state based on hover and selection status.
   */
  update() {
    if (!this.ux) return;
    if (this.ux.isHovered() || this.ux.isSelected()) {
      this.mesh!.material.opacity = this.ux.isSelected() ?
          this.selectedOpacity * this.opacity :
          this.hoverOpacity * this.opacity;
    } else {
      this.mesh!.material.opacity = this.defaultOpacity * this.opacity;
    }
  }

  /**
   * Overrides the parent's private initialization method. This is called by the
   * parent's `init()` method after the Troika module is confirmed to be loaded.
   */
  protected override _initializeText() {
    // First, run the parent's initialization to ensure this.textObj is created.
    super._initializeText();

    // Now that this.textObj is guaranteed to exist, run IconButton-specific
    // logic.
    if (this.textObj) {
      this.textObj.position.set(0, 0, VIEW_DEPTH_GAP);

      // Disable raycasting on the text part of the object so it doesn't
      // interfere with the main button geometry's interaction.
      this.textObj.raycast = () => {};

      // Run initial state update
      this.update();

      switch (this.mode) {
        case 'center':
          this.textObj.scale.setScalar(this.rangeX);
          break;
      }
      this.textObj.scale.set(1, 1, 1);
    }

    this.syncTextObj();

    // The parent _initializeText already calls updateLayout, so this is not
    // strictly necessary, but kept for clarity.
    this.updateLayout();
  }
}
