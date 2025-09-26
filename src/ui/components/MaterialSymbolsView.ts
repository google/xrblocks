import * as THREE from 'three';
import {SVGLoader, SVGResult} from 'three/addons/loaders/SVGLoader.js';

import {View} from '../core/View.js';

const SVG_BASE_PATH =
    'https://cdn.jsdelivr.net/gh/marella/material-symbols@v0.33.0/svg/{{weight}}/{{style}}/{{icon}}.svg'

export type MaterialSymbolsViewOptions = {
  /** The name of the icon (e.g., 'sunny', 'home'). */
  icon?: string;
  /** The weight of the icon (e.g., 100, 400, 700). */
  iconWeight?: number;
  /** The style of the icon ('outlined', 'filled', or 'round'). */
  iconStyle?: string;
  /** The scale factor for the icon. */
  iconScale?: number;
  /** The color of the icon in hex format (e.g., '#FFFFFF'). */
  iconColor?: string;
};

/**
 * A View that dynamically loads and displays an icon from the Google
 * Material Symbols library as a 3D object. It constructs the icon from SVG
 * data, allowing for customization of weight, style, color, and scale.
 */
export class MaterialSymbolsView extends View {
  #icon = '';
  get icon() {
    return this.#icon;
  }
  set icon(value) {
    if (this.#icon == value) return;
    this.#icon = value;
    this.updateIcon();
  }
  #iconWeight = 400;
  get iconWeight() {
    return this.#iconWeight;
  }
  set iconWeight(value) {
    if (this.#iconWeight == value) return;
    this.#iconWeight = value;
    this.updateIcon();
  }
  #iconStyle = '';
  get iconStyle() {
    return this.#iconStyle;
  }
  set iconStyle(value) {
    if (this.#iconStyle == value) return;
    this.#iconStyle = value;
    this.updateIcon();
  }
  #iconColor = '';
  get iconColor() {
    return this.#iconColor;
  }
  set iconColor(value) {
    if (this.#iconColor == value) return;
    this.#iconColor = value;
    this.group?.traverse?.((child) => {
      if (child instanceof THREE.Mesh) {
        child.material?.color?.set?.(value);
      }
    });
  }

  iconScale = 1;
  private loadedSvgPath?: string;
  private loadingSvgPath?: string;
  private group?: THREE.Group;

  /**
   * Construct a Material Symbol view.
   * @param options - Options for the icon.
   */
  constructor({
    icon = 'sunny',
    iconWeight = 400,
    iconStyle = 'outlined',
    iconScale = 1,
    iconColor = '#FFFFFF'
  }: MaterialSymbolsViewOptions) {
    super({});
    this.icon = icon;
    this.iconWeight = iconWeight;
    this.iconStyle = iconStyle;
    this.iconScale = iconScale;
    this.iconColor = iconColor;
  }

  async init() {
    if (this.group == null) {
      await this.updateIcon();
    }
  }

  /**
   * Updates the icon displayed by loading the appropriate SVG from the Material
   * Symbols library based on the current `icon`, `iconWeight`, and `iconStyle`
   * properties.
   * @returns Promise<void>
   */
  async updateIcon() {
    if (!this.icon || !this.iconWeight || !this.iconStyle) {
      return;
    }
    const svgPath = SVG_BASE_PATH.replace('{{style}}', this.iconStyle)
                        .replace('{{icon}}', this.icon)
                        .replace('{{weight}}', String(this.iconWeight));
    if (svgPath == this.loadedSvgPath || svgPath == this.loadingSvgPath) {
      return;
    }
    this.loadingSvgPath = svgPath;
    const svgData = await new Promise<SVGResult>((resolve, reject) => {
      const loader = new SVGLoader();
      loader.load(svgPath, resolve, undefined, reject);
    });
    this.loadingSvgPath = undefined;
    this.loadedSvgPath = svgPath;
    const [viewMinX, viewMinY, viewWidth, viewHeight] =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (svgData.xml as any).attributes.viewBox.value.split(' ');
    const paths = svgData.paths;
    const group = new THREE.Group();

    const scale = 1 / Math.max(viewWidth, viewHeight);
    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];

      const material = new THREE.MeshBasicMaterial({
        color: this.iconColor,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false
      });

      const shapes = SVGLoader.createShapes(path);

      for (let j = 0; j < shapes.length; j++) {
        const shape = shapes[j];
        const geometry = new THREE.ShapeGeometry(shape);
        const mesh = new THREE.Mesh(geometry, material);
        // Flip the icon over y.
        mesh.scale.set(scale, -scale, scale);
        // Center the icon
        mesh.position.x = -0.5 - viewMinX * scale;
        mesh.position.y = 0.5 + viewMinY * scale;
        group.add(mesh);
      }
    }
    if (this.group) {
      this.remove(this.group);
      this.group?.traverse?.((child) => {
        if ('dispose' in child && typeof child.dispose === 'function') {
          child.dispose?.();
        }
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose?.();
          child.material?.dispose?.();
        }
      });
    }
    this.group = group;
    group.scale.setScalar(this.iconScale);
    this.add(group);
  }
}
