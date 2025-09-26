import * as THREE from 'three';
import type TroikaThreeText from 'troika-three-text';

import {getColorHex} from '../../utils/utils';
import {View} from '../core/View';
import {ViewOptions} from '../core/ViewOptions';

import {FONT_FAMILIES} from './utils/FontFamilies';


// --- Dynamic Import of Troika Three Text and its dependencies ---

/** Enum for the status of the Troika dynamic import. */
enum TroikaImportStatus {
  PENDING = 0,
  SUCCESS = 1,
  FAILED = 2,
}

// --- Troika Dependency Management ---
let Text: typeof TroikaThreeText.Text;
let troikaImportStatus = TroikaImportStatus.PENDING;
let troikaImportError: Error|undefined;

async function importTroika() {
  if (Text) return true;
  try {
    const troikaModule = await import('troika-three-text');
    Text = troikaModule.Text;
    troikaImportStatus = TroikaImportStatus.SUCCESS;
    return true;
  } catch (error: unknown) {
    if (error instanceof Error) {
      troikaImportError = error;
    }
    troikaImportStatus = TroikaImportStatus.FAILED;
    return false;
  }
};

interface TextViewEventMap extends THREE.Object3DEventMap {
  synccomplete: object;
}

export type TextViewOptions = ViewOptions&{
  useSDFText?: boolean;
  font?: string;
  fontSize?: number;
  /**
   * Font size in dp. This will be scale up so it's a consistent size in world
   * coordinates.
   */
  fontSizeDp?: number;
  fontColor?: string|number;
  maxWidth?: number;
  mode?: 'fitWidth'|'center';
  anchorX?: number|'left'|'center'|'right'|`${number}%`;
  anchorY?: number|'top'|'top-baseline'|'top-cap'|'top-ex'|'middle'|
      'bottom-baseline'|'bottom'|`${number}%`;
  textAlign?: 'left'|'center'|'right';
  imageOverlay?: string;
  imageOffsetX?: number;
  imageOffsetY?: number;
  text?: string;
};

/**
 * A view for displaying text in 3D. It features a dual-rendering
 * system:
 * 1.  **SDF Text (Default):** Uses `troika-three-text` to render crisp,
 * high-quality text using Signed Distance Fields. This is ideal for most
 * use cases. The library is loaded dynamically on demand.
 * 2.  **HTML Canvas Fallback:** If `troika-three-text` fails to load or is
 * disabled via `useSDFText: false`, it renders text to an HTML canvas and
 * applies it as a texture to a plane.
 */
export class TextView extends View<TextViewEventMap> {
  /** Determines which rendering backend to use. Defaults to SDF text. */
  useSDFText = true;
  /** TextView resides in a panel by default. */
  isRoot = false;
  /** Default description of this view in Three.js DevTools. */
  name = 'TextView';

  /** The underlying renderable object (either a Troika Text or a Plane. */
  textObj?: TroikaThreeText.Text|THREE.Mesh;
  /** The font file to use. Defaults to Roboto. */
  font = FONT_FAMILIES.Roboto;
  /** The size of the font in world units. */
  fontSize?: number;
  fontSizeDp?: number;
  /** The color of the font. */
  fontColor: string|number = 0xFFFFFF;
  /**
   * The maximum width the text can occupy before wrapping.
   * To fit a long TextView within a container, this value should be its
   * container's height / width to avoid it getting rendered outside.
   */
  maxWidth = 1.0;
  /** Layout mode. 'fitWidth' scales text to fit the view's width. */
  mode = 'fitWidth';
  /** Horizontal anchor point ('left', 'center', 'right'). */
  anchorX: number|'left'|'center'|'right'|`${number}%` = 'center';
  /** Vertical anchor point ('top', 'middle', 'bottom'). */
  anchorY: number|'top'|'top-baseline'|'top-cap'|'top-ex'|'middle'|
      'bottom-baseline'|'bottom'|`${number}%` = 'middle';
  /** Horizontal alignment ('left', 'center', 'right'). */
  textAlign = 'center';
  /** An optional image URL to use as an overlay texture on the text. */
  imageOverlay?: string;
  /** The horizontal offset for the `imageOverlay` texture. */
  imageOffsetX = 0;
  /** The vertical offset for the `imageOverlay` texture. */
  imageOffsetY = 0;

  /** Relative local offset in X. */
  x = 0;
  /** Relative local offset in Y. */
  y = 0;
  /** Relative local width. */
  width = 1;
  /** Relative local height. */
  height = 1;

  /** Fallback HTML canvas to render legacy text. */
  canvas?: HTMLCanvasElement;
  /** Fallback HTML canvas context to render legacy text. */
  ctx?: CanvasRenderingContext2D;
  /** The calculated height of a single line of text. */
  lineHeight = 0;
  /** The total number of lines after text wrapping. */
  lineCount = 0;

  private _initializeTextCalled = false;
  private _text = 'TextView';
  set text(text) {
    this._text = text;
    if (this.useSDFText && Text && this.textObj instanceof Text) {
      this.textObj.text = text;
      this.textObj.sync();
    } else {
      this.updateHTMLText();
    }
  }

  get text() {
    return this._text;
  }

  /**
   * TextView can render text using either Troika SDF text or HTML canvas.
   * @param options - Configuration options for the TextView.
   * @param geometry - Optional geometry for the view's background mesh.
   * @param material - Optional material for the view's background mesh.
   */
  constructor(
      options: TextViewOptions = {}, geometry?: THREE.BufferGeometry,
      material?: THREE.Material) {
    super(options, geometry, material);

    this.useSDFText = options.useSDFText ?? this.useSDFText;
    this.font = options.font ?? this.font;
    this.fontSize = options.fontSize ?? this.fontSize;
    this.fontSizeDp = options.fontSizeDp ?? this.fontSizeDp;
    this.fontColor = options.fontColor ?? this.fontColor;
    this.maxWidth = options.maxWidth ?? this.maxWidth;

    this.mode = options.mode ?? this.mode;
    this.anchorX = options.anchorX ?? this.anchorX;
    this.anchorY = options.anchorY ?? this.anchorY;
    this.textAlign = options.textAlign ?? this.textAlign;
    this.imageOverlay = options.imageOverlay ?? this.imageOverlay;
    this.imageOffsetX = options.imageOffsetX ?? this.imageOffsetX;
    this.imageOffsetY = options.imageOffsetY ?? this.imageOffsetY;
    this.text = options.text ?? this._text;
  }

  /**
   * Initializes the TextView. It waits for the Troika module to be imported
   * and then creates the text object, sets up aspect ratio, and loads overlays.
   */
  override async init(_?: object) {
    this.useSDFText = this.useSDFText && await importTroika();
    this._initializeText();
  }

  /**
   * Sets the text content of the view.
   * @param text - The text to be displayed.
   */
  setText(text: string) {
    this.text = text;
  }

  /**
   * Updates the layout of the text object, such as its render order.
   */
  override updateLayout() {
    super.updateLayout();
    if (this.textObj) {
      this.textObj.renderOrder = this.renderOrder;
      if (this.fontSizeDp === undefined) {
        switch (this.mode) {
          case 'fitWidth':
            this.textObj.scale.setScalar(this.rangeX);
            break;
        }
      }
    }
    if (this.fontSizeDp && this.textObj) {
      this.createTextSDF();
    }
  }

  /**
   * Creates the text object using Troika Three Text for SDF rendering.
   * This method should only be called from _initializeText() when `useSDFText`
   * is true and the `troika-three-text` module has been successfully imported.
   */
  protected createTextSDF() {
    const obj =
        Text && this.textObj instanceof Text ? this.textObj : new Text();
    obj.text = this.text;
    obj.color = getColorHex(this.fontColor);
    obj.font = this.font;
    obj.anchorX = this.anchorX;
    obj.anchorY = this.anchorY;
    if (this.fontSizeDp !== undefined) {
      obj.fontSize = this.dpToLocalUnits(this.fontSizeDp);
    } else if (this.fontSize !== undefined) {
      obj.fontSize = this.fontSize;
    } else {
      obj.fontSize = 0.06;
    }
    obj.maxWidth = this.maxWidth;
    obj.textAlign = this.textAlign;
    // Transparent objects should not write to depth.
    if (obj.material) {
      obj.material.depthWrite = !obj.material.transparent;
    }
    obj.sync();

    this.textObj = obj;
    this.textObj.layers.mask = this.layers.mask;
    this.add(this.textObj);
  }

  /**
   * Creates a text object using an HTML canvas as a texture on a THREE.Plane.
   * This serves as a fallback when Troika is not available or `useSDFText` is
   * false. This method should only be called from _initializeText().
   */
  private createTextHTML() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
    const planeGeometry = new THREE.PlaneGeometry(this.width, this.height);
    const texture = new THREE.CanvasTexture(this.canvas);
    const planeMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
    });

    this.textObj = new THREE.Mesh(planeGeometry, planeMaterial);
    this.updateHTMLText();
    this.add(this.textObj);
  }

  /**
   * Updates the content of the HTML canvas when not using SDF text.
   * It clears the canvas and redraws the text with the current properties.
   */
  private updateHTMLText() {
    if (!this.ctx) return;
    const {canvas, ctx} = this;
    // A higher resolution gives sharper text.
    const resolution = 256;
    canvas!.width = this.width * resolution;
    canvas!.height = this.height * resolution;

    ctx.clearRect(0, 0, canvas!.width, canvas!.height);
    const fontSize = this.fontSizeDp !== undefined ?
        this.dpToLocalUnits(this.fontSizeDp) :
        this.fontSize ?? 0.06;
    ctx.font = `${fontSize * resolution}px ${this.font}`;
    ctx.fillStyle =
        `#${getColorHex(this.fontColor).toString(16).padStart(6, '0')}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // TODO: add line-break for canvas-based text.
    ctx.fillText(this.text, canvas!.width / 2, canvas!.height / 2);

    if (this.textObj?.material.map) {
      this.textObj.material.map.needsUpdate = true;
    }
  }

  /**
   * Callback executed when Troika's text sync is complete.
   * It captures layout data like total height and line count.
   */
  onSyncComplete() {
    if (!this.useSDFText || !(this.textObj instanceof Text) ||
        !this.textObj.textRenderInfo) {
      return;
    }
    const caretPositions = this.textObj.textRenderInfo.caretPositions;
    const numberOfChars = caretPositions.length / 4;
    let lineCount = 0;
    const firstBottom = numberOfChars > 0 ? caretPositions[0] : 0;
    let lastBottom = 999999;
    for (let i = 0; i < numberOfChars; i++) {
      const bottom = caretPositions[i * 4 + 2];
      const top = caretPositions[i * 4 + 3];
      const lineHeight = top - bottom;
      if (bottom < lastBottom - lineHeight / 2) {
        lineCount++;
        lastBottom = bottom;
      }
    }
    this.lineHeight =
        numberOfChars > 0 ? (firstBottom - lastBottom) / lineCount : 0;
    this.lineCount = lineCount;
    this.dispatchEvent({type: 'synccomplete'});
  }

  /**
   * Private method to perform the actual initialization after the async
   * import has resolved.
   */
  protected _initializeText() {
    if (this._initializeTextCalled) return;
    this._initializeTextCalled = true;
    // Decide whether to use SDF text or fallback to HTML canvas.
    if (this.useSDFText && troikaImportStatus === TroikaImportStatus.SUCCESS) {
      this.createTextSDF();
    } else {
      // If the import failed, log a warning.
      if (troikaImportStatus === TroikaImportStatus.FAILED) {
        console.warn(
            'Failed to import `troika-three-text`. For 3D text rendering, please ensure `troika-three-text`, `troika-three-utils`, `troika-worker-utils`, `bidi-js`, and `webgl-sdf-generator` are included in your importmap or installed via npm. Refer to templates/1_ui for an example. Falling back to HTML-based text rendering.',
            'Error details:', troikaImportError?.message);
        // Clear the error so we don't log it repeatedly.
        troikaImportError = undefined;
      }
      this.createTextHTML();
    }

    // Applies settings that require the textObj to exist.
    if (this.useSDFText && Text && this.textObj instanceof Text) {
      this.textObj.addEventListener(
          // @ts-expect-error Missing type in Troika
          'synccomplete', this.onSyncComplete.bind(this));

      if (this.imageOverlay) {
        (new THREE.TextureLoader()).load(this.imageOverlay, (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.offset.x = this.imageOffsetX;
          const textObj = this.textObj as unknown as TroikaThreeText.Text;
          textObj.material.map = texture;
          textObj.material.needsUpdate = true;
          textObj.sync();
        });
      }
    }
    this.updateLayout();
  }

  protected syncTextObj() {
    if (Text && this.textObj instanceof Text) {
      this.textObj.sync();
    }
  }

  protected setTextColor(color: number) {
    if (Text && this.textObj instanceof Text) {
      this.textObj.color = color;
    }
  }

  /**
   * Disposes of resources used by the TextView, such as event listeners.
   */
  override dispose() {
    if (this.useSDFText && this.textObj && Text &&
        this.textObj instanceof Text) {
      this.textObj.removeEventListener(
          // @ts-expect-error Missing type in Troika
          'synccomplete', this.onSyncComplete.bind(this));
    }
    super.dispose();
  }
}
