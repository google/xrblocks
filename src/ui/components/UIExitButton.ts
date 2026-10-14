import type * as THREE from 'three';

import type {UIStyle} from '../UIElement';
import {UIButton, type UIButtonOptions} from './UIButton';

export interface UIExitButtonOptions
  extends Omit<UIButtonOptions, 'label' | 'ariaLabel'> {
  label?: string;
  ariaLabel?: string;
  /** Custom exit handler. If omitted, attempts to call `closeApp()` or end the active XRSession. */
  onExit?: () => void | Promise<void>;
  /** Optional reference or getter for the active WebXR session. */
  session?: XRSession | null | (() => XRSession | null | undefined);
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
 * Clicking it calls `onExit`/`onClick`, invokes a parent `closeApp()`,
 * or automatically finds and ends the active WebXR session.
 */
export class UIExitButton<
  TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap,
> extends UIButton<TEventMap> {
  override name = 'UIExitButton';
  private readonly _sessionGetter?: () => XRSession | null | undefined;
  private readonly _onExit?: () => void | Promise<void>;

  constructor({
    label = 'X',
    ariaLabel = 'Exit XR',
    pointerEvents = 'auto',
    style,
    onClick,
    onExit,
    session,
    ...rest
  }: UIExitButtonOptions = {}) {
    const sessionGetter =
      typeof session === 'function'
        ? session
        : session !== undefined
          ? () => session
          : undefined;

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

    this._sessionGetter = sessionGetter;
    this._onExit = onExit;
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
    let curr: THREE.Object3D | null = this.parent;
    while (curr) {
      const candidate = curr as {
        closeApp?: () => void | Promise<void>;
      };
      if (typeof candidate.closeApp === 'function') {
        await candidate.closeApp();
        return;
      }
      curr = curr.parent;
    }
    const activeSession = this.resolveActiveSession();
    if (activeSession) {
      try {
        await activeSession.end();
      } catch {
        // Ignore session ending error.
      }
    }
  }

  resolveActiveSession(): XRSession | null | undefined {
    if (this._sessionGetter) {
      const s = this._sessionGetter();
      if (s) return s;
    }
    const globalCore = (
      globalThis as {
        xb?: {
          core?: {renderer?: {xr?: {getSession?: () => XRSession | null}}};
        };
      }
    ).xb?.core;
    if (globalCore?.renderer?.xr?.getSession) {
      const s = globalCore.renderer.xr.getSession();
      if (s) return s;
    }
    let curr: THREE.Object3D | null = this.parent;
    while (curr) {
      const candidate = curr as {
        xrSession?: XRSession | null;
        renderer?: {xr?: {getSession?: () => XRSession | null}};
        core?: {
          renderer?: {xr?: {getSession?: () => XRSession | null}};
          webXRSessionManager?: {endSession?: () => Promise<void>};
        };
      };
      if (candidate.xrSession) return candidate.xrSession;
      if (candidate.renderer?.xr?.getSession) {
        const s = candidate.renderer.xr.getSession();
        if (s) return s;
      }
      if (candidate.core?.renderer?.xr?.getSession) {
        const s = candidate.core.renderer.xr.getSession();
        if (s) return s;
      }
      curr = curr.parent;
    }
    return undefined;
  }
}
