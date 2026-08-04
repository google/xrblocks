import * as THREE from 'three';
import {describe, expect, it, vi} from 'vitest';

import {Script} from '../Script';
import {ScriptsManager, ScriptsManagerEventType} from './ScriptsManager';

describe('ScriptsManager lifecycle', () => {
  it('disposes active and pending script generations once', async () => {
    let finishPending: (() => void) | undefined;
    const active = new Script();
    const pending = new Script();
    const manager = new ScriptsManager((script) =>
      script === active
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            finishPending = resolve;
          })
    );
    const disposeActive = vi.spyOn(active, 'dispose');
    const disposePending = vi.spyOn(pending, 'dispose');

    await manager.initScript(active);
    const initialization = manager.initScript(pending);
    await vi.waitFor(() => expect(finishPending).toBeDefined());

    const disposal = manager.dispose();
    expect(manager.dispose()).toBe(disposal);
    await vi.waitFor(() => expect(disposeActive).toHaveBeenCalledOnce());
    expect(disposeActive).toHaveBeenCalledOnce();
    expect(disposePending).not.toHaveBeenCalled();

    finishPending?.();
    await Promise.all([initialization, disposal]);
    expect(disposePending).toHaveBeenCalledOnce();
    await expect(manager.initScript(new Script())).rejects.toThrow(
      'ScriptsManager has been disposed.'
    );
  });

  it('disposes a stale initialization before reconnecting', async () => {
    const resolvers: Array<() => void> = [];
    const initialize = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvers.push(resolve);
        })
    );
    const manager = new ScriptsManager(initialize);
    const scene = new THREE.Scene();
    const script = new Script();
    const dispose = vi.spyOn(script, 'dispose');
    const update = vi.spyOn(script, 'update');

    scene.add(script);
    const firstSync = manager.syncScriptsWithScene(scene);
    await vi.waitFor(() => expect(resolvers).toHaveLength(1));
    scene.remove(script);
    const removalSync = manager.syncScriptsWithScene(scene);
    scene.add(script);
    const reconnectSync = manager.syncScriptsWithScene(scene);

    resolvers[0]();
    await vi.waitFor(() => expect(initialize).toHaveBeenCalledTimes(2));
    expect(dispose).toHaveBeenCalledOnce();
    manager.update(0, {} as XRFrame);
    expect(update).not.toHaveBeenCalled();

    resolvers[1]();
    await Promise.all([firstSync, removalSync, reconnectSync]);
    manager.update(0, {} as XRFrame);
    expect(update).toHaveBeenCalledOnce();
  });

  it('isolates callback errors unless propagation is requested', () => {
    const manager = new ScriptsManager(async () => {});
    const reportError = vi.fn();
    manager.addEventListener(ScriptsManagerEventType.EXCEPTION, reportError);
    const first = new Script();
    const second = new Script();
    const visited: Script[] = [];
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(
      manager.callTargeted([first, second], 'update', (script) => {
        if (script === first) throw new Error('callback failed');
        visited.push(script);
      })
    ).toBe(false);
    expect(visited).toEqual([second]);
    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({context: 'update'})
    );

    manager.catchExceptions = false;
    expect(() =>
      manager.callTargeted([first], 'update', () => {
        throw new Error('callback failed again');
      })
    ).toThrow('callback failed again');
  });

  it('shares initialization and rejects initialization failures', async () => {
    let rejectInitialization: ((error: Error) => void) | undefined;
    const manager = new ScriptsManager(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectInitialization = reject;
        })
    );
    const script = new Script();

    const first = manager.initScript(script);
    const second = manager.initScript(script);
    expect(second).toBe(first);

    await vi.waitFor(() => expect(rejectInitialization).toBeDefined());
    rejectInitialization?.(new Error('initialization failed'));
    await expect(first).rejects.toThrow('initialization failed');
  });
});
