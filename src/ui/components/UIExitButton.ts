import type * as THREE from 'three';

import {WebXRSessionManager} from '../../core/components/WebXRSessionManager';
import type {UIStyle} from '../UIElement';
import {UIButton, type UIButtonOptions} from './UIButton';

export interface UIExitButtonOptions
  extends Omit<UIButtonOptions, 'label' | 'ariaLabel'> {
  label?: string;
  ariaLabel?: string;
  /** Custom exit handler. If omitted, ends the active WebXR session via the injected WebXRSessionManager. */
  onExit?: () => void | Promise<void>;
  /** Optional explicit session manager instance (useful for testing or manual injection). */
  sessionManager?: WebXRSessionManager;
}

export const DEFAULT_EXIT_BUTTON_STYLE: UIStyle = Object.freeze({
  position: 'absolute',
  top: -48,
  left: 0,
  width: 36,
  height: 36,
  borderRadius: 18,
  backgroundColor: 'rgba(30, 30, 36, 0.92)',
  borderColor: 'rgba(255, 255, 255, 0.25)',
  borderWidth: 1.5,
  color: '#ffffff',
  fontSize: 16,
  fontWeight: 'bold',
  justifyContent: 'center',
  alignItems: 'center',
});

/**
 * A standard circular exit button for XR overlays and cards.
 * Uses dependency injection to resolve the active `WebXRSessionManager`
 * and cleanly end the session when clicked.
 */
export class UIExitButton<
  TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap,
> extends UIButton<TEventMap> {
  static readonly dependencies = {
    sessionManager: WebXRSessionManager,
  };

  override name = 'UIExitButton';
  private sessionManager?: WebXRSessionManager;
  private readonly _onExit?: () => void | Promise<void>;

  constructor({
    label = 'X',
    ariaLabel = 'Exit XR',
    pointerEvents = 'auto',
    style,
    onClick,
    onExit,
    sessionManager,
    ...rest
  }: UIExitButtonOptions = {}) {
    const mergedStyle: UIStyle = {...DEFAULT_EXIT_BUTTON_STYLE, ...style};

    super({
      label,
      ariaLabel,
      pointerEvents,
      style: mergedStyle,
      onClick: () => {
        void this.handleExit(onClick);
      },
      ...rest,
    });

    this.sessionManager = sessionManager;
    this._onExit = onExit;
  }

  init(dependencies: {sessionManager?: WebXRSessionManager} = {}): void {
    if (dependencies.sessionManager) {
      this.sessionManager = dependencies.sessionManager;
    }
  }

  async handleExit(customOnClick?: () => void): Promise<void> {
    if (this._onExit) {
      await this._onExit();
      return;
    }
    if (customOnClick) {
      customOnClick();
      return;
    }
    if (this.sessionManager) {
      try {
        await this.sessionManager.endSession();
      } catch {
        // Ignore session ending error if no session is active.
      }
    }
  }
}
