import {describe, it, expect} from 'vitest';

import {AnchorsOptions, defaultAnchorStorageKey} from './AnchorsOptions';

describe('defaultAnchorStorageKey', () => {
  it('scopes the key to the page so demos on one origin do not collide', () => {
    expect(defaultAnchorStorageKey('/demos/anchors/')).toBe(
      'xrblocks.anchors:/demos/anchors/'
    );
    expect(defaultAnchorStorageKey('/demos/anchors_notes/')).not.toBe(
      defaultAnchorStorageKey('/demos/anchors/')
    );
  });

  it('falls back to an unscoped key when there is no page path', () => {
    expect(defaultAnchorStorageKey(undefined)).toBe('xrblocks.anchors');
  });
});

describe('AnchorsOptions', () => {
  it('defaults to a scoped storage key', () => {
    expect(new AnchorsOptions().storageKey).toContain('xrblocks.anchors');
  });

  it('keeps an explicitly supplied key', () => {
    const options = new AnchorsOptions({storageKey: 'my.app.anchors'});
    expect(options.storageKey).toBe('my.app.anchors');
  });

  it('enablePersistence turns on both flags', () => {
    const options = new AnchorsOptions().enablePersistence();
    expect(options.enabled).toBe(true);
    expect(options.persistent).toBe(true);
  });
});

describe('defaultAnchorStorageKey', () => {
  it('gives a directory and its index page the same key', () => {
    // Reaching a demo by its directory or by index.html is the same page, so
    // anchors saved through one route must be visible from the other.
    expect(defaultAnchorStorageKey('/demos/anchors/index.html')).toBe(
      defaultAnchorStorageKey('/demos/anchors/')
    );
  });

  it('still separates different pages', () => {
    expect(defaultAnchorStorageKey('/demos/anchors/')).not.toBe(
      defaultAnchorStorageKey('/demos/anchors_notes/')
    );
  });

  it('treats a missing trailing slash as the same directory', () => {
    expect(defaultAnchorStorageKey('/demos/anchors')).toBe(
      defaultAnchorStorageKey('/demos/anchors/')
    );
  });

  it('falls back when there is no pathname', () => {
    expect(defaultAnchorStorageKey()).toBe('xrblocks.anchors');
  });
});
