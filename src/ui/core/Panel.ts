import * as THREE from 'three';

import {User} from '../../core/User';
import {Draggable, DragMode, HasDraggingMode} from '../../ux/DragManager';
import {DP_TO_DMM} from '../constants';
import {Grid} from '../layouts/Grid';
import {SpatialPanelShader} from '../shaders/SpatialPanelShader';
import {SquircleShader} from '../shaders/SquircleShader';

import {PanelMesh} from './PanelMesh';
import {PanelOptions} from './PanelOptions';
import {View} from './View.js';

// Default panel width in density-independent pixels (DP).
const DEFAULT_WIDTH_DP = 1024;

// Default panel height in density-independent pixels (DP).
const DEFAULT_HEIGHT_DP = 720;

// Default panel width in meters, calculated from DP for root panels.
const DEFAULT_WIDTH_M = DEFAULT_WIDTH_DP * DP_TO_DMM * 0.001;

// Default panel height in meters, calculated from DP for root panels.
const DEFAULT_HEIGHT_M = DEFAULT_HEIGHT_DP * DP_TO_DMM * 0.001;

export type PanelFadeState = 'idle'|'fading-in'|'fading-out';

/**
 * A fundamental UI container that displays content on a 2D quad in
 * 3D space. It supports background colors, rounded corners (squircles), and can
 * be made interactive and draggable. It serves as a base for building complex
 * user interfaces.
 *
 * The panel intelligently selects a shader:
 * - `SpatialPanelShader`: For interactive, draggable panels with hover/select
 * highlights.
 * - `SquircleShader`: For static, non-interactive panels with a clean, rounded
 * look.
 */
export class Panel extends View implements Draggable, Partial<HasDraggingMode> {
  static dependencies = {user: User, timer: THREE.Timer};

  keepFacingCamera = true;

  /** Text description of the view */
  name = 'Panel';

  /** Type identifier for easy checking with `instanceof`. */
  isPanel = true;

  /** The underlying mesh that renders the panel's background. */
  mesh: PanelMesh;

  /** Determines if the panel can be dragged by the user. */
  draggable = false;

  /** Dragging mode, defaults to true if draggable else undefined. */
  draggingMode?: DragMode;

  /** Determines if the panel can be touched by the user's hands. */
  touchable = false;

  /**
   * If true, a root panel will automatically spawn in front of the user.
   */
  useDefaultPosition = true;

  /**
   * Panel by default uses borderless shader.
   * This flag indicates whether to use borderless shader for Spatial Panels.
   */
  useBorderlessShader = false;

  /**
   * Whether to show highlights for the spatial panel.
   */
  showHighlights = false;

  /** The background color of the panel, expressed as a CSS color string. */
  backgroundColor = '#c2c2c255';

  // --- Private Fading Animation Properties ---
  /**
   * The current state of the fading animation.
   */
  private _fadeState: PanelFadeState = 'idle';

  /**
   * Default duration for fade animations in seconds.
   */
  private _fadeDuration = 0.2;

  /**
   * Timer for the current fade animation, driven by the core clock.
   */
  private _fadeTimer = 0;

  /**
   * The current opacity value, used during animations.
   */
  private _currentOpacity = 1.0;

  /**
   * The start opacity value for the current animation.
   */
  private _startOpacity = 1.0;

  /**
   * The target opacity value for the current animation.
   */
  private _targetOpacity = 1.0;

  /**
   * An optional callback function to execute when a fade animation completes.
   */
  onFadeComplete?: () => void;

  private timer!: THREE.Timer;

  constructor(options: PanelOptions = {}) {
    super(options);

    const isDraggable = options.draggable ?? this.draggable;

    const useBorderlessShader = options.useBorderlessShader ?? (!isDraggable);
    // Draggable panels have a larger geometry for interaction padding.
    const panelScale = useBorderlessShader ? 1.0 : 1.3;
    // Use SpatialPanelShader for SpatialPanel, while developers can choose
    // useBorderlessShader=false to disable the interactive border.
    const shader = useBorderlessShader ? SquircleShader : SpatialPanelShader;
    options.useBorderlessShader = useBorderlessShader;
    this.showHighlights = !useBorderlessShader;

    // Applies user-provided options or default options.
    this.backgroundColor = options.backgroundColor ?? this.backgroundColor;
    this.draggable = isDraggable;
    this.draggingMode = options.draggingMode ?? this.draggable ?
        DragMode.TRANSLATING :
        DragMode.DO_NOT_DRAG;
    this.touchable = options.touchable ?? this.touchable;
    this.isRoot = options.isRoot ?? true;
    this.width = options.width ?? (this.isRoot ? DEFAULT_WIDTH_M : 1);
    this.height = options.height ?? (this.isRoot ? DEFAULT_HEIGHT_M : 1);
    this.showHighlights = options.showHighlights ?? this.showHighlights;
    this.useDefaultPosition =
        options.useDefaultPosition ?? this.useDefaultPosition;
    this.useBorderlessShader =
        options.useBorderlessShader ?? this.useBorderlessShader;

    this.mesh = new PanelMesh(shader, this.backgroundColor, panelScale);
    this.add(this.mesh);

    this.updateLayout();
  }

  /**
   * Initializes the panel, setting its default position if applicable.
   */
  init({user, timer}: {user: User; timer: THREE.Timer;}) {
    super.init();
    this.selectable = true;
    this.timer = timer;

    // A manual position set in .position.set() will override the
    // default position to create the SpatialPanel.
    if (this.position.x !== 0 || this.position.y !== 0 ||
        this.position.z !== 0) {
      this.useDefaultPosition = false;
    }

    if (this.isRoot && this.useDefaultPosition) {
      this.position.set(
          this.x, user.height + this.y, -user.panelDistance + this.z);
    } else {
      this.position.set(
          this.position.x + this.x, this.position.y + this.y,
          this.position.z + this.z);
    }
  }

  /**
   * Starts fading the panel and its children in.
   * @param duration - Optional fade duration in seconds.
   * @param onComplete - Optional callback when fade completes.
   */
  fadeIn(duration?: number, onComplete?: () => void) {
    if (this._fadeState === 'fading-in') return;
    this._startFade(1.0, duration, onComplete);
    this._fadeState = 'fading-in';
  }

  /**
   * Starts fading the panel and its children out.
   * @param duration - Optional fade duration in seconds.
   * @param onComplete - Optional callback when fade completes.
   */
  fadeOut(duration?: number, onComplete?: () => void) {
    if (this._fadeState === 'fading-out') return;
    this._startFade(0.0, duration, onComplete);
    this._fadeState = 'fading-out';
  }

  /**
   * Initiates a fade animation.
   */
  private _startFade(
      targetOpacity: number, duration?: number, onComplete?: () => void) {
    this._fadeDuration = duration ?? 0.2;
    this.onFadeComplete = onComplete;
    this._fadeTimer = 0;
    this._startOpacity = this._currentOpacity;
    this._targetOpacity = targetOpacity;

    if (this._fadeDuration <= 0) {
      this._completeFade();
    } else {
      this._prepareMaterialsForFade();
    }
  }

  /**
   * Ensures all child materials are configured for transparency.
   */
  private _prepareMaterialsForFade() {
    this.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const materials: THREE.Material[] =
            Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach(material => {
          material.transparent = true;
        });
      }
    });
  }

  /**
   * Applies the given opacity to all materials in the hierarchy.
   */
  private _applyOpacity(opacityValue: number) {
    this.traverse((child) => {
      if (child instanceof View) child.opacity = opacityValue;
      if (child instanceof THREE.Mesh && child.material) {
        const materials: THREE.Material[] =
            Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach(material => {
          if (material instanceof THREE.ShaderMaterial) {
            material.uniforms.uOpacity.value = opacityValue;
          } else {
            material.opacity = opacityValue;
          }
        });
      }
    });
  }

  /**
   * Finalizes the fade animation, sets final visibility, and triggers callback.
   */
  private _completeFade() {
    this._currentOpacity = this._targetOpacity;
    this._applyOpacity(this._currentOpacity);
    this._fadeState = 'idle';
    if (this._currentOpacity === 0)
      this.hide();
    else
      this.show();
    this.onFadeComplete?.();
  }

  /**
   * Updates the fade animation progress each frame.
   */
  update() {
    if (this._fadeState !== 'idle') {
      this._fadeTimer += this.timer.getDelta();
      const progress = Math.min(this._fadeTimer / this._fadeDuration, 1.0);
      this._currentOpacity = THREE.MathUtils.lerp(
          this._startOpacity, this._targetOpacity, progress);
      this._applyOpacity(this._currentOpacity);
      if (progress >= 1.0) {
        this._completeFade();
      }
    }
  }

  /**
   * Adds a Grid layout as a direct child of this panel.
   * @returns The newly created Grid instance.
   */
  addGrid() {
    const grid = new Grid();
    this.add(grid);
    return grid;
  }

  /**
   * Updates the panel's visual dimensions based on its layout properties.
   */
  updateLayout() {
    super.updateLayout();
    this.mesh.setAspectRatio(this.aspectRatio);
    const parentAspectRatio =
        this.isRoot || !this.parent ? 1.0 : (this.parent as View).aspectRatio;
    this.mesh.setWidthHeight(
        this.width * Math.max(parentAspectRatio, 1.0),
        this.height * Math.max(1.0 / parentAspectRatio, 1.0));
  }

  /**
   * Gets the panel's width in meters.
   * @returns The width in meters.
   */
  getWidth() {
    return this.width;
  }

  /**
   * Gets the panel's height in meters.
   * @returns The height in meters.
   */
  getHeight() {
    return this.height;
  }
}
