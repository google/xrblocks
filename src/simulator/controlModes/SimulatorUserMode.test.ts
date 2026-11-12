import {expect, it} from 'vitest';
import {controlFixture} from '../SimulatorControls.test-fixture';
import {SimulatorUserMode} from './SimulatorUserMode';

it('selects along the clicked ray without a preceding pointer move', () => {
  const f = controlFixture();
  const mode = new SimulatorUserMode(
    f.state,
    new Set(),
    f.hands,
    f.navMesh,
    () => {},
    () => {}
  );
  mode.init(f);
  mode.onModeActivated();
  try {
    const mouse = f.input.mouseController;
    let directionAtPress: number | undefined;
    mouse.addEventListener('selectstart', () => {
      directionAtPress = mouse.raycaster.ray.direction.x;
    });
    mode.onPointerDown(
      new MouseEvent('pointerdown', {
        buttons: 1,
        clientX: window.innerWidth * 0.75,
        clientY: window.innerHeight / 2,
      })
    );
    expect(directionAtPress).toBeGreaterThan(0);
    expect(mouse.userData.selected).toBe(true);
    expect(mouse.position).toEqual(f.camera.position);
    mode.onPointerUp();
    expect(mouse.userData.selected).toBe(false);
  } finally {
    mode.onModeDeactivated();
    f.dispose();
  }
});
