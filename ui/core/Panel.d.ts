import * as THREE from 'three';
import { User } from '../../core/User';
import { Draggable, DragMode, HasDraggingMode } from '../../ux/DragManager';
import { Grid } from '../layouts/Grid';
import { PanelMesh } from './PanelMesh';
import { PanelOptions } from './PanelOptions';
import { View } from './View.js';
export type PanelFadeState = 'idle' | 'fading-in' | 'fading-out';
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
export declare class Panel extends View implements Draggable, Partial<HasDraggingMode> {
    static dependencies: {
        user: typeof User;
        timer: typeof THREE.Timer;
    };
    keepFacingCamera: boolean;
    /** Text description of the view */
    name: string;
    /** Type identifier for easy checking with `instanceof`. */
    isPanel: boolean;
    /** The underlying mesh that renders the panel's background. */
    mesh: PanelMesh;
    /** Determines if the panel can be dragged by the user. */
    draggable: boolean;
    /** Dragging mode, defaults to true if draggable else undefined. */
    draggingMode?: DragMode;
    /** Determines if the panel can be touched by the user's hands. */
    touchable: boolean;
    /**
     * If true, a root panel will automatically spawn in front of the user.
     */
    useDefaultPosition: boolean;
    /**
     * Panel by default uses borderless shader.
     * This flag indicates whether to use borderless shader for Spatial Panels.
     */
    useBorderlessShader: boolean;
    /**
     * Whether to show highlights for the spatial panel.
     */
    showHighlights: boolean;
    /** The background color of the panel, expressed as a CSS color string. */
    backgroundColor: string;
    /**
     * The current state of the fading animation.
     */
    private _fadeState;
    /**
     * Default duration for fade animations in seconds.
     */
    private _fadeDuration;
    /**
     * Timer for the current fade animation, driven by the core clock.
     */
    private _fadeTimer;
    /**
     * The current opacity value, used during animations.
     */
    private _currentOpacity;
    /**
     * The start opacity value for the current animation.
     */
    private _startOpacity;
    /**
     * The target opacity value for the current animation.
     */
    private _targetOpacity;
    /**
     * An optional callback function to execute when a fade animation completes.
     */
    onFadeComplete?: () => void;
    private timer;
    constructor(options?: PanelOptions);
    /**
     * Initializes the panel, setting its default position if applicable.
     */
    init({ user, timer }: {
        user: User;
        timer: THREE.Timer;
    }): void;
    /**
     * Starts fading the panel and its children in.
     * @param duration - Optional fade duration in seconds.
     * @param onComplete - Optional callback when fade completes.
     */
    fadeIn(duration?: number, onComplete?: () => void): void;
    /**
     * Starts fading the panel and its children out.
     * @param duration - Optional fade duration in seconds.
     * @param onComplete - Optional callback when fade completes.
     */
    fadeOut(duration?: number, onComplete?: () => void): void;
    /**
     * Initiates a fade animation.
     */
    private _startFade;
    /**
     * Ensures all child materials are configured for transparency.
     */
    private _prepareMaterialsForFade;
    /**
     * Applies the given opacity to all materials in the hierarchy.
     */
    private _applyOpacity;
    /**
     * Finalizes the fade animation, sets final visibility, and triggers callback.
     */
    private _completeFade;
    /**
     * Updates the fade animation progress each frame.
     */
    update(): void;
    /**
     * Adds a Grid layout as a direct child of this panel.
     * @returns The newly created Grid instance.
     */
    addGrid(): Grid;
    /**
     * Updates the panel's visual dimensions based on its layout properties.
     */
    updateLayout(): void;
    /**
     * Gets the panel's width in meters.
     * @returns The width in meters.
     */
    getWidth(): number;
    /**
     * Gets the panel's height in meters.
     * @returns The height in meters.
     */
    getHeight(): number;
}
