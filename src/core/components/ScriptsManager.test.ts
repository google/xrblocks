import * as THREE from 'three';
import {afterEach, expect, it, vi} from 'vitest';
import {Script} from '../Script';
import {ScriptsManager, ScriptsManagerEventType} from './ScriptsManager';

const managers: ScriptsManager[] = [];
const release: Array<() => void> = [];
function manager() {
  const result = new ScriptsManager(async (script) => {
    await script.init({});
  });
  managers.push(result);
  return result;
}
function gate() {
  const pending = Promise.withResolvers<void>();
  release.push(() => pending.resolve());
  return pending;
}
afterEach(async () => {
  for (const resolve of release.splice(0)) resolve();
  await Promise.allSettled(managers.splice(0).map((value) => value.dispose()));
  vi.restoreAllMocks();
});

it('waits for pending initialization and disposes each generation once', async () => {
  const ready = gate();
  const started = gate();
  let activeDisposed = 0;
  let pendingDisposed = 0;
  class Active extends Script {
    dispose() {
      activeDisposed++;
    }
  }
  class Pending extends Script {
    async init() {
      started.resolve();
      await ready.promise;
    }
    dispose() {
      pendingDisposed++;
    }
  }
  const scripts = manager();
  await scripts.initScript(new Active());
  const initialization = scripts.initScript(new Pending());
  await started.promise;
  const disposal = scripts.dispose();
  await vi.waitFor(() => expect(activeDisposed).toBe(1));
  expect(pendingDisposed).toBe(0);
  ready.resolve();
  await Promise.all([initialization, disposal]);
  await scripts.dispose();
  expect(activeDisposed).toBe(1);
  expect(pendingDisposed).toBe(1);
  await expect(scripts.initScript(new Script())).rejects.toThrow(/disposed/);
});

it('cannot update a stale initialization and starts a fresh generation after reconnect', async () => {
  const firstReady = gate();
  const secondReady = gate();
  let starts = 0;
  let disposals = 0;
  class App extends Script {
    async init() {
      starts++;
      await (starts === 1 ? firstReady.promise : secondReady.promise);
    }
    update() {
      this.position.x++;
    }
    dispose() {
      disposals++;
    }
  }
  const scripts = manager();
  const scene = new THREE.Scene();
  const app = new App();
  scene.add(app);
  const initial = scripts.syncScriptsWithScene(scene);
  await vi.waitFor(() => expect(starts).toBe(1));
  scene.remove(app);
  const removal = scripts.syncScriptsWithScene(scene);
  scene.add(app);
  const reconnect = scripts.syncScriptsWithScene(scene);
  firstReady.resolve();
  await vi.waitFor(() => expect(starts).toBe(2));
  scripts.update(0, {} as XRFrame);
  expect(app.position.x).toBe(0);
  expect(disposals).toBe(1);
  secondReady.resolve();
  await Promise.all([initial, removal, reconnect]);
  scripts.update(0, {} as XRFrame);
  expect(app.position.x).toBe(1);
});

it('shares initialization and isolates a failed app from healthy app updates', async () => {
  const ready = gate();
  let starts = 0;
  class Broken extends Script {
    async init() {
      starts++;
      await ready.promise;
      throw new Error('App startup failed');
    }
    update() {
      this.position.x++;
    }
  }
  class Healthy extends Script {
    update() {
      this.position.x++;
    }
  }
  const scripts = manager();
  const scene = new THREE.Scene();
  const broken = new Broken();
  const healthy = new Healthy();
  scene.add(broken, healthy);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const first = scripts.syncScriptsWithScene(scene);
  const second = scripts.initScript(broken);
  const rejection = expect(second).rejects.toThrow('App startup failed');
  await vi.waitFor(() => expect(starts).toBe(1));
  ready.resolve();
  await Promise.all([first, rejection]);
  scripts.update(0, {} as XRFrame);
  expect(broken.position.x).toBe(0);
  expect(healthy.position.x).toBe(1);
  await scripts.syncScriptsWithScene(scene);
  expect(starts).toBe(1);
});

it('isolates update failures while allowing explicit error propagation', async () => {
  class Broken extends Script {
    update() {
      throw new Error('App update failed');
    }
  }
  class Healthy extends Script {
    update() {
      this.position.x++;
    }
  }
  const scripts = manager();
  const reported: Array<{context: string; error: Error}> = [];
  scripts.addEventListener(ScriptsManagerEventType.EXCEPTION, (event) => {
    reported.push(event);
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const healthy = new Healthy();
  await Promise.all([
    scripts.initScript(new Broken()),
    scripts.initScript(healthy),
  ]);
  scripts.update(0, {} as XRFrame);
  expect(healthy.position.x).toBe(1);
  expect(reported[0].context).toBe('update');
  expect(reported[0].error.message).toBe('App update failed');
  scripts.catchExceptions = false;
  expect(() => scripts.update(0, {} as XRFrame)).toThrow('App update failed');
});

it('releases the script and its registrations even when a cancellation hook throws', async () => {
  let disposed = false;
  let released = false;
  class App extends Script {
    update() {
      this.position.x++;
    }
    dispose() {
      disposed = true;
    }
  }
  const scripts = manager();
  const app = new App();
  await scripts.initScript(app);
  scripts.catchExceptions = false;
  scripts.beforeDispose = () => {
    throw new Error('Cancellation failed');
  };
  scripts.afterDispose = () => {
    released = true;
  };
  expect(() => scripts.uninitScript(app)).toThrow('Cancellation failed');
  expect(disposed).toBe(true);
  expect(released).toBe(true);
  scripts.update(0, {} as XRFrame);
  expect(app.position.x).toBe(0);
  scripts.beforeDispose = undefined;
});
