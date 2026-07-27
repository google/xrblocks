import type {Core} from '../core/Core';

export type XRBlocksSDKNamespace = object & {
  readonly core: Core;
};

type DebugWindow = {
  xb?: XRBlocksSDKNamespace;
  xbReady?: Promise<void>;
};

type DebugLifecycle = {
  core: Core;
  resolve(): void;
  reject(error: unknown): void;
};

let lifecycle: DebugLifecycle | undefined;

export function registerDebugGlobals(sdk: XRBlocksSDKNamespace) {
  if (!debugRequestedByUrl() || typeof window === 'undefined') return;

  const debugWindow = window as unknown as DebugWindow;
  if ('xb' in debugWindow || 'xbReady' in debugWindow) {
    console.warn(
      'XR Blocks debug globals were not installed because window.xb or ' +
        'window.xbReady is already defined.'
    );
    return;
  }

  let resolveReady!: () => void;
  let rejectReady!: (error: unknown) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  // Keep initialization failures observable without creating an unhandled
  // rejection before a browser driver awaits the readiness promise.
  void ready.catch(() => undefined);

  debugWindow.xb = sdk;
  debugWindow.xbReady = ready;
  lifecycle = {
    core: sdk.core,
    resolve: resolveReady,
    reject: rejectReady,
  };
}

export function markDebugReady(core: Core) {
  if (lifecycle?.core === core) {
    lifecycle.resolve();
  }
}

export function markDebugFailed(core: Core, error: unknown) {
  if (lifecycle?.core === core) {
    lifecycle.reject(error);
  }
}

function debugRequestedByUrl() {
  if (typeof window === 'undefined') return false;
  const value = new URLSearchParams(window.location.search)
    .get('debug')
    ?.toLowerCase();
  return value === '1' || value === 'true';
}

/** @internal */
export function resetDebugGlobalsForTests() {
  lifecycle = undefined;
  if (typeof window !== 'undefined') {
    delete (window as unknown as DebugWindow).xb;
    delete (window as unknown as DebugWindow).xbReady;
  }
}
