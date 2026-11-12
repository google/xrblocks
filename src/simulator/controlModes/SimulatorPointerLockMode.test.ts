import {expect, it} from 'vitest';
import {controlFixture, drag} from '../SimulatorControls.test-fixture';
import {SimulatorPointerLockMode} from './SimulatorPointerLockMode';

it('owns selection and follows the camera while pointer lock is active', () => {
  const f = controlFixture();
  let locked: Element | null = null;
  const changeLock = (element: Element | null) => {
    locked = element;
    document.dispatchEvent(new Event('pointerlockchange'));
  };
  const descriptor = Object.getOwnPropertyDescriptor(
    document,
    'pointerLockElement'
  );
  Object.defineProperty(document, 'pointerLockElement', {
    configurable: true,
    get: () => locked,
  });
  f.canvas.requestPointerLock = async () => {
    changeLock(f.canvas);
  };
  const exitDescriptor = Object.getOwnPropertyDescriptor(
    document,
    'exitPointerLock'
  );
  document.exitPointerLock = () => {
    changeLock(null);
  };
  const mode = new SimulatorPointerLockMode(
    f.state,
    new Set(),
    f.hands,
    f.navMesh,
    () => {},
    () => {}
  );
  mode.init({...f, domElement: f.canvas});
  mode.onModeActivated();
  try {
    const controller = mode.pointerLockController;
    expect(controller.userData.connected).toBe(true);
    const unlockedRotation = f.camera.quaternion.clone();
    mode.onPointerMove(drag(0));
    expect(f.camera.quaternion.equals(unlockedRotation)).toBe(true);
    mode.onPointerDown(new MouseEvent('pointerdown', {buttons: 1}));
    expect(locked).toBe(f.canvas);
    expect(controller.userData.selected).toBe(false);
    mode.onPointerMove(drag(0));
    expect(f.camera.quaternion.equals(unlockedRotation)).toBe(false);
    controller.update();
    expect(controller.position).toEqual(f.camera.position);
    expect(controller.quaternion.equals(f.camera.quaternion)).toBe(true);
    const selections: string[] = [];
    controller.addEventListener('selectstart', () => {
      selections.push('start');
    });
    controller.addEventListener('selectend', () => {
      selections.push('end');
    });
    mode.onPointerDown(new MouseEvent('pointerdown', {buttons: 1}));
    expect(controller.userData.selected).toBe(true);
    mode.onPointerUp();
    expect(controller.userData.selected).toBe(false);
    expect(selections).toEqual(['start', 'end']);
    mode.onModeDeactivated();
    expect(locked).toBeNull();
    expect(controller.userData.connected).toBe(false);
    expect(f.input.activeControllers.children).not.toContain(controller);
  } finally {
    mode.onModeDeactivated();
    if (descriptor)
      Object.defineProperty(document, 'pointerLockElement', descriptor);
    else Reflect.deleteProperty(document, 'pointerLockElement');
    if (exitDescriptor)
      Object.defineProperty(document, 'exitPointerLock', exitDescriptor);
    else Reflect.deleteProperty(document, 'exitPointerLock');
    f.dispose();
  }
});
