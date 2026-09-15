import {describe, it, expect} from 'vitest';

import {anchorCapability} from './AnchorCapability';

/**
 * The WebXR anchor APIs are optional in three independent places, so these
 * fakes vary each one rather than modelling a whole session.
 */
function frameWith(createAnchor?: unknown) {
  return {createAnchor} as unknown as XRFrame;
}

function sessionWith(restore?: unknown, persistentAnchors?: unknown) {
  return {
    restorePersistentAnchor: restore,
    persistentAnchors,
  } as unknown as XRSession;
}

const createAnchorFn = () => Promise.resolve({});
const restoreFn = () => Promise.resolve({});

describe('anchorCapability', () => {
  it('is unsupported when the frame cannot create anchors', () => {
    expect(anchorCapability(sessionWith(restoreFn), frameWith(undefined))).toBe(
      'unsupported'
    );
  });

  it('is unsupported when there is no session', () => {
    expect(anchorCapability(null, frameWith(createAnchorFn))).toBe(
      'unsupported'
    );
  });

  it('is unsupported when there is no frame', () => {
    expect(anchorCapability(sessionWith(restoreFn), null)).toBe('unsupported');
  });

  it('is session-only when anchors exist but cannot be restored', () => {
    expect(
      anchorCapability(sessionWith(undefined), frameWith(createAnchorFn))
    ).toBe('session-only');
  });

  it('is persistent when the frame can create and the session can restore', () => {
    expect(
      anchorCapability(sessionWith(restoreFn), frameWith(createAnchorFn))
    ).toBe('persistent');
  });

  it('does not throw on undefined inputs', () => {
    expect(() => anchorCapability(undefined, undefined)).not.toThrow();
    expect(anchorCapability(undefined, undefined)).toBe('unsupported');
  });

  it('treats a non-function restore property as unusable', () => {
    expect(
      anchorCapability(sessionWith('not-a-function'), frameWith(createAnchorFn))
    ).toBe('session-only');
  });

  it('treats a non-function createAnchor property as unusable', () => {
    expect(anchorCapability(sessionWith(restoreFn), frameWith(42))).toBe(
      'unsupported'
    );
  });
});
