import {afterEach, expect, it} from 'vitest';
import {WorldOptions} from '../WorldOptions';
import {AnchorManager} from './AnchorManager';
import {simulated, store, transform} from './Anchors.test-fixture';

afterEach(() => {
  localStorage.removeItem('world.anchor-tests');
});
it('persists and restores desktop poses without native frames or tracked anchors', async () => {
  const first = simulated();
  const second = simulated();
  try {
    const tracked = (await first.create(transform(4, 5, 6), 'chair'))!;
    await first.persist(tracked.id);
    await first.persist(tracked.id);
    expect(store().load()).toHaveLength(1);
    const [result] = await second.restoreAll();
    expect(result.status).toBe('restored');
    const frame = {
      session: {},
      trackedAnchors: new Set(),
      getPose: () => null,
    } as unknown as XRFrame;
    second.update(1, frame);
    expect(second.getPose(result.anchor!.id)?.transform.position).toMatchObject(
      {x: 4, y: 5, z: 6}
    );
  } finally {
    first.dispose();
    second.dispose();
  }
});
it('does not create desktop anchors when the fallback is disabled', async () => {
  const manager = new AnchorManager(store());
  manager.init({options: new WorldOptions()});
  manager.update();
  try {
    await expect(manager.create(transform(), 'chair')).resolves.toBeNull();
  } finally {
    manager.dispose();
  }
});
