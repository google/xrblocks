import type * as THREE from 'three';

import {
  WebXRSessionEventType,
  WebXRSessionManager,
} from '../../core/components/WebXRSessionManager';
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
  static readonly optionalDependencies = {
    sessionManager: WebXRSessionManager,
  };

  override name = 'UIExitButton';
  private sessionManager?: WebXRSessionManager;
  private readonly _onExit?: () => void | Promise<void>;
  private readonly onSessionStart = (): void => {
    this.syncVisibility();
  };
  private readonly onSessionEnd = (): void => {
    this.syncVisibility();
  };

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
      visible: false,
    });

    this._onExit = onExit;
    if (sessionManager) this.setSessionManager(sessionManager);
  }

  init(dependencies: {sessionManager?: WebXRSessionManager} = {}): void {
    if (dependencies.sessionManager) {
      this.setSessionManager(dependencies.sessionManager);
    }
  }

  override dispose(): void {
    this.sessionManager?.removeEventListener(
      WebXRSessionEventType.SESSION_START,
      this.onSessionStart
    );
    this.sessionManager?.removeEventListener(
      WebXRSessionEventType.SESSION_END,
      this.onSessionEnd
    );
    super.dispose();
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
    if (this.sessionManager?.currentSession) {
      try {
        await this.sessionManager.endSession();
      } catch (error) {
        if (
          !(error instanceof Error && error.message === 'No session to end')
        ) {
          console.error('Failed to end XR session', error);
        }
      }
    }
  }

  private setSessionManager(sessionManager: WebXRSessionManager): void {
    this.sessionManager?.removeEventListener(
      WebXRSessionEventType.SESSION_START,
      this.onSessionStart
    );
    this.sessionManager?.removeEventListener(
      WebXRSessionEventType.SESSION_END,
      this.onSessionEnd
    );
    this.sessionManager = sessionManager;
    sessionManager.addEventListener(
      WebXRSessionEventType.SESSION_START,
      this.onSessionStart
    );
    sessionManager.addEventListener(
      WebXRSessionEventType.SESSION_END,
      this.onSessionEnd
    );
    this.syncVisibility();
  }

  private syncVisibility(): void {
    this.visible = !!this.sessionManager?.currentSession;
  }
}
