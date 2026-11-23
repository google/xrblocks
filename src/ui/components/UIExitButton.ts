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
  /** Keeps this button visible and in-flow even outside an active WebXR session. */
  alwaysVisible?: boolean;
  /** Custom exit handler. If omitted, ends the active WebXR session via the injected WebXRSessionManager. */
  onExit?: () => void | Promise<void>;
  /** Optional explicit session manager instance (useful for testing or manual injection). */
  sessionManager?: WebXRSessionManager;
}

export const DEFAULT_EXIT_BUTTON_STYLE: UIStyle = Object.freeze({
  position: 'relative',
  width: '100%',
  height: 56,
  alignSelf: 'stretch',
  flexShrink: 0,
  flexDirection: 'row',
  justifyContent: 'center',
  alignItems: 'center',
  gap: 8,
  paddingTop: 0,
  paddingRight: 0,
  paddingBottom: 0,
  paddingLeft: 0,
  borderRadius: 36,
  borderWidth: 0,
  borderColor: 'transparent',
  borderAlign: 'outside',
  backgroundColor: 'rgba(255, 154, 154, 0.16)',
  color: '#e1e2e8',
  fontSize: 16,
  fontWeight: 'normal',
  lineHeight: '24px',
  whiteSpace: 'nowrap',
  ':hover': Object.freeze({
    backgroundColor: 'rgba(255, 154, 154, 0.24)',
    color: '#e1e2e8',
    borderWidth: 0,
    borderColor: 'transparent',
  }),
  ':active': Object.freeze({
    backgroundColor: 'rgba(255, 154, 154, 0.3)',
    color: '#e1e2e8',
    borderWidth: 0,
    borderColor: 'transparent',
  }),
  ':focus': Object.freeze({
    backgroundColor: 'rgba(255, 154, 154, 0.16)',
    color: '#e1e2e8',
    borderColor: '#e1e2e8',
    borderWidth: 2,
  }),
  ':disabled': Object.freeze({
    backgroundColor: 'rgba(225, 226, 232, 0.07)',
    color: '#a5a6ac',
    borderWidth: 0,
    borderColor: 'transparent',
  }),
});

function mergeExitButtonStyle(style?: UIStyle): UIStyle {
  if (!style) return {...DEFAULT_EXIT_BUTTON_STYLE};
  const paddingOverrides =
    style.padding !== undefined
      ? {
          paddingTop: style.paddingTop ?? style.padding,
          paddingRight: style.paddingRight ?? style.padding,
          paddingBottom: style.paddingBottom ?? style.padding,
          paddingLeft: style.paddingLeft ?? style.padding,
        }
      : undefined;
  return {
    ...DEFAULT_EXIT_BUTTON_STYLE,
    ...style,
    ...paddingOverrides,
    ':hover': {
      ...DEFAULT_EXIT_BUTTON_STYLE[':hover'],
      ...style[':hover'],
    },
    ':active': {
      ...DEFAULT_EXIT_BUTTON_STYLE[':active'],
      ...style[':active'],
    },
    ':focus': {
      ...DEFAULT_EXIT_BUTTON_STYLE[':focus'],
      ...style[':focus'],
    },
    ':disabled': {
      ...DEFAULT_EXIT_BUTTON_STYLE[':disabled'],
      ...style[':disabled'],
    },
  };
}

/**
 * An in-panel pill exit button placed at the bottom of XR cards and overlays.
 * Uses dependency injection to resolve the active `WebXRSessionManager`,
 * collapsing out of layout outside WebXR sessions unless `alwaysVisible` is set,
 * and cleanly ending the session when clicked.
 */
export class UIExitButton<
  TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap,
> extends UIButton<TEventMap> {
  static readonly optionalDependencies = {
    sessionManager: WebXRSessionManager,
  };

  private static readonly instances = new Set<
    WeakRef<{syncVisibility(): void}>
  >();
  private static _alwaysVisible = false;

  /**
   * Live global override that keeps all `UIExitButton` instances visible and
   * in-flow even outside an active WebXR session (for desktop simulator previews).
   */
  static get alwaysVisible(): boolean {
    return UIExitButton._alwaysVisible;
  }

  static set alwaysVisible(value: boolean) {
    UIExitButton._alwaysVisible = Boolean(value);
    UIExitButton.syncTrackedInstances();
  }

  private static syncTrackedInstances(): void {
    for (const ref of UIExitButton.instances) {
      const instance = ref.deref();
      if (!instance) {
        UIExitButton.instances.delete(ref);
      } else {
        instance.syncVisibility();
      }
    }
  }

  override name = 'UIExitButton';
  private sessionManager?: WebXRSessionManager;
  private readonly _onExit?: () => void | Promise<void>;
  private readonly instanceAlwaysVisible: boolean;
  private readonly explicitVisible?: boolean;
  private readonly activeDisplay: NonNullable<UIStyle['display']>;
  private readonly instanceRef: WeakRef<{syncVisibility(): void}>;
  private readonly onSessionStart = (): void => {
    this.syncVisibility();
  };
  private readonly onSessionEnd = (): void => {
    this.syncVisibility();
  };

  constructor({
    label,
    ariaLabel,
    alwaysVisible = false,
    pointerEvents = 'auto',
    style,
    visible,
    onClick,
    onExit,
    sessionManager,
    ...rest
  }: UIExitButtonOptions = {}) {
    const resolvedLabel =
      label === undefined && !rest.children?.length ? 'Exit app' : label;
    const resolvedAriaLabel = ariaLabel ?? (resolvedLabel || 'Exit app');
    const activeDisplay: NonNullable<UIStyle['display']> =
      style?.display && style.display !== 'none' ? style.display : 'flex';
    const shouldShow =
      UIExitButton._alwaysVisible ||
      alwaysVisible ||
      visible === true ||
      Boolean(sessionManager?.currentSession);
    const mergedStyle = mergeExitButtonStyle(style);
    mergedStyle.display = shouldShow ? activeDisplay : 'none';

    super({
      label: resolvedLabel,
      ariaLabel: resolvedAriaLabel,
      pointerEvents,
      style: mergedStyle,
      onClick: () => {
        void this.handleExit(onClick);
      },
      ...rest,
      visible: shouldShow,
    });

    this._onExit = onExit;
    this.instanceAlwaysVisible = alwaysVisible;
    this.explicitVisible = visible;
    this.activeDisplay = activeDisplay;
    this.instanceRef = new WeakRef(this);
    for (const ref of UIExitButton.instances) {
      if (!ref.deref()) UIExitButton.instances.delete(ref);
    }
    UIExitButton.instances.add(this.instanceRef);
    if (sessionManager) this.setSessionManager(sessionManager);
  }

  init(dependencies: {sessionManager?: WebXRSessionManager} = {}): void {
    if (dependencies.sessionManager) {
      this.setSessionManager(dependencies.sessionManager);
    }
  }

  override dispose(): void {
    UIExitButton.instances.delete(this.instanceRef);
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

  syncVisibility(): void {
    const shouldShow =
      UIExitButton._alwaysVisible ||
      this.instanceAlwaysVisible ||
      this.explicitVisible === true ||
      Boolean(this.sessionManager?.currentSession);
    this.visible = shouldShow;
    this.style.display = shouldShow ? this.activeDisplay : 'none';
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
}
