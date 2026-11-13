import {describe, expect, it, vi} from 'vitest';
import {ScreenWakeLock} from './ScreenWakeLock';

function sentinel() {
  const lock = new EventTarget();
  return Object.assign(lock, {
    release: vi.fn(async () => {
      lock.dispatchEvent(new Event('release'));
    }),
    released: false,
    type: 'screen' as const,
    onrelease: null,
  }) as WakeLockSentinel;
}

describe('Phone screen wake lock', () => {
  it('holds only while paired and foregrounded, and releases on disposal', async () => {
    const first = sentinel();
    const second = sentinel();
    const request = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const lock = new ScreenWakeLock({request});
    lock.setActive(false);
    expect(request).not.toHaveBeenCalled();
    lock.setActive(true);
    await Promise.resolve();
    lock.setActive(true);
    expect(request).toHaveBeenCalledExactlyOnceWith('screen');
    lock.setActive(false);
    expect(first.release).toHaveBeenCalledOnce();
    lock.setActive(true);
    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(2);
    lock.dispose();
    lock.dispose();
    expect(second.release).toHaveBeenCalledOnce();
    lock.setActive(true);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('releases a grant that arrives after backgrounding or disposal', async () => {
    for (const dispose of [false, true]) {
      const granted = sentinel();
      let resolve!: (lock: WakeLockSentinel) => void;
      const lock = new ScreenWakeLock({
        request: () =>
          new Promise((done) => {
            resolve = done;
          }),
      });
      lock.setActive(true);
      if (dispose) lock.dispose();
      else lock.setActive(false);
      resolve(granted);
      await Promise.resolve();
      expect(granted.release).toHaveBeenCalledOnce();
      lock.dispose();
    }
  });
});
