import * as THREE from 'three';

import {VIEW_DEPTH_GAP} from '../../constants';
import {getVec4ByColorString} from '../../utils/utils';
import {TextView, TextViewOptions} from '../components/TextView';
import {SquircleShader} from '../shaders/SquircleShader';

/**
 * An interactive button with a rounded rectangle background and a
 * text label. It provides visual feedback for hover and selection states.
 */
export type TextButtonOptions = TextViewOptions&{
  backgroundColor?: string,
  opacity?: number,
  maxWidth?: number,
  radius?: number,
  boxSize?: number,
};

export class TextButton extends TextView {
  /** Default description of this view in Three.js DevTools. */
  name = 'TextButton';
  /** The font size of the text label. */
  fontSize = 0.05;
  /** The color of the text in its default state. */
  fontColor: string|number = 0xFFFFFF;
  /** The opacity multiplier of the button. */
  opacity = 1.0;
  /** The intrinsic opacity of the button. */
  defaultOpacity = 1.0;

  /** The color of the text when the button is hovered. */
  hoverColor: string|number = 0xaaaaaa;
  /** The opacity multiplier of the text when the button is hovered. */
  hoverOpacity = 0.2;

  /** The color of the text when the button is pressed. */
  selectedFontColor: string|number = 0x999999;
  /** The opacity multiplier of the text when the button is pressed. */
  selectedOpacity = 0.4;

  /** Relative local width. */
  width = 0.9;
  /** Relative local height. */
  height = 0.9;

  /** Layout mode. */
  mode = 'center';

  /** The horizontal offset for the `imageOverlay` texture. */
  imageOffsetX = 0;
  /** The vertical offset for the `imageOverlay` texture. */
  imageOffsetY = 0;

  private uniforms;

  /**
   * @param options - Configuration options for the TextButton.
   */
  constructor(options: TextButtonOptions = {}) {
    const geometry = new THREE.PlaneGeometry(1, 1);
    const colorVec4 =
        getVec4ByColorString(options.backgroundColor ?? '#00000000');

    const {
      opacity = 0.0,
      radius = SquircleShader.uniforms.uRadius.value,
      boxSize = SquircleShader.uniforms.uBoxSize.value
    } = options;

    const uniforms = {
      ...SquircleShader.uniforms,
      uBackgroundColor: {value: colorVec4},
      uOpacity: {value: opacity},
      uAspect: {value: 1.0},
      uRadius: {value: radius},
      uBoxSize: {value: boxSize}
    };

    const material = new THREE.ShaderMaterial({
      ...SquircleShader,
      transparent: true,
      uniforms: uniforms,
      depthWrite: false
    });

    super(options, geometry, material);

    this.uniforms = uniforms;
    this.opacity = opacity;

    // Applies our own overrides to the default values.
    this.fontSize = options.fontSize ?? this.fontSize;
    this.fontColor = options.fontColor ?? this.fontColor;
  }

  /**
   * Initializes the text object after async dependencies are loaded.
   * @override
   */
  async init() {
    await super.init();
    this.textObj!.position.set(0, 0, VIEW_DEPTH_GAP);

    // Disable raycasting on the text part so it doesn't interfere
    // with the main button geometry's interaction.
    this.textObj!.raycast = () => {};
  };

  // TODO: Implement onHoverOver() and onHoverOut().
  update() {
    if (!this.textObj) {
      return;
    }
    if (this.textObj) {
      this.textObj.renderOrder = this.renderOrder + 1;
    }
    const ux = this.ux;
    if (ux.isHovered()) {
      if (ux.isSelected()) {
        this.setTextColor(0x666666);
      } else {
        this.setTextColor(0xaaaaaa);
      }
    } else {
      this.setTextColor(0xffffff);
      this.uniforms.uOpacity.value = this.defaultOpacity * this.opacity;
    }
  }
};
