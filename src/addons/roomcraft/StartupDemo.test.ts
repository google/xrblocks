import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

async function startup() {
  // @ts-expect-error The executable browser launcher is a JavaScript consumer.
  return import('../../../demos/roomcraft/Startup.js');
}

function status() {
  return document.getElementById('status')!;
}

beforeEach(() => {
  vi.resetModules();
  document.body.innerHTML =
    '<p id="status">Loading the starter scene.</p><p id="error" hidden></p>';
  vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Roomcraft startup launcher', () => {
  it.each(['interactive', 'complete'] as const)(
    'starts when the DOM is already %s',
    async (readyState) => {
      vi.spyOn(document, 'readyState', 'get').mockReturnValue(readyState);
      const start = vi.fn(async () => {});
      const {startRoomcraftPage} = await startup();
      expect(
        await startRoomcraftPage(async () => ({startRoomcraftDemo: start}))
      ).toBe(true);
      expect(start).toHaveBeenCalledOnce();
      expect(status().dataset.startup).toBe('ready');
    }
  );

  it('waits for a still-loading DOM and starts only once', async () => {
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
    const load = vi.fn(async () => ({startRoomcraftDemo: vi.fn()}));
    const {startRoomcraftPage} = await startup();
    const first = startRoomcraftPage(load);
    expect(startRoomcraftPage(load)).toBe(first);
    expect(load).not.toHaveBeenCalled();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    document.dispatchEvent(new Event('DOMContentLoaded'));
    expect(await first).toBe(true);
    expect(load).toHaveBeenCalledOnce();
  });

  it('starts after a delayed module evaluation without another DOM event', async () => {
    let finish!: (value: object) => void;
    const load = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const start = vi.fn(async (progress) => {
      progress('initializing-sdk', 'Starting XR Blocks...');
      progress('loading-scene', 'Loading the starter scene...');
    });
    const {startRoomcraftPage} = await startup();
    const pending = startRoomcraftPage(load);
    expect(status().dataset.startup).toBe('loading-modules');
    finish({startRoomcraftDemo: start});
    expect(await pending).toBe(true);
    expect(start).toHaveBeenCalledOnce();
  });

  it.each(['module', 'SDK'])(
    'shows a %s failure instead of leaving the static loading text',
    async (stage) => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const fail = async () => {
        throw new Error(`${stage} unavailable`);
      };
      const load =
        stage === 'module' ? fail : async () => ({startRoomcraftDemo: fail});
      const {startRoomcraftPage} = await startup();
      expect(await startRoomcraftPage(load)).toBe(false);
      expect(status().dataset.startup).toBe('failed');
      expect(status().textContent).toBe('Roomcraft could not start.');
      expect(document.getElementById('error')!.hidden).toBe(false);
      expect(document.getElementById('error')!.textContent).toContain(
        `${stage} unavailable`
      );
    }
  );

  it('reports a slow import without pretending it failed or stopping later startup', async () => {
    vi.useFakeTimers();
    let finish!: (value: object) => void;
    const {startRoomcraftPage} = await startup();
    const pending = startRoomcraftPage(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    await vi.advanceTimersByTimeAsync(20_000);
    expect(status().textContent).toContain('still loading');
    expect(status().dataset.startup).toBe('loading-modules');
    finish({startRoomcraftDemo: async () => {}});
    expect(await pending).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
