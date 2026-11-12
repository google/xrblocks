import {afterEach, describe, expect, it} from 'vitest';
import {Keycodes} from '../../utils/Keycodes';
import {controlFixture, drag} from '../SimulatorControls.test-fixture';
import {SimulatorControllerMode} from './SimulatorControllerMode';

describe('SimulatorControllerMode', () => {
  const fixtures: ReturnType<typeof controlFixture>[] = [];
  function setup() {
    const f = controlFixture();
    fixtures.push(f);
    f.state.currentControllerIndex = 0;
    const keys = new Set<Keycodes>();
    const mode = new SimulatorControllerMode(
      f.state,
      keys,
      f.hands,
      f.navMesh,
      () => {},
      () => {}
    );
    mode.init(f);
    return {...f, mode, keys};
  }
  afterEach(() => {
    for (const f of fixtures.splice(0)) f.dispose();
  });

  it('moves the active hand or camera according to input ownership', () => {
    const {mode, keys, state, camera, input, simulatorOptions} = setup();
    const hand = state.localControllerPositions[0];
    const otherHand = state.localControllerPositions[1].clone();
    const start = hand.clone();
    keys.add(Keycodes.W_CODE);
    mode.update();
    expect(hand.z).toBeLessThan(start.z);
    expect(state.localControllerPositions[1]).toEqual(otherHand);
    expect(camera.position.z).toBe(0);
    expect(input.controllers[0].position.z).toBeCloseTo(hand.z);
    keys.add(Keycodes.LEFT_SHIFT_CODE);
    const handBeforeCameraMove = hand.clone();
    mode.update();
    expect(camera.position.z).toBeLessThan(0);
    expect(hand).toEqual(handBeforeCameraMove);
    simulatorOptions.modeToggle.enabled = true;
    simulatorOptions.modeToggle.toggleKey = Keycodes.LEFT_SHIFT_CODE;
    const cameraBeforeToggle = camera.position.clone();
    mode.update();
    expect(camera.position).toEqual(cameraBeforeToggle);
    expect(hand.z).toBeLessThan(handBeforeCameraMove.z);
  });

  it('rotates the hand with left drag and the camera with right drag', () => {
    const {mode, state, camera} = setup();
    const cameraStart = camera.quaternion.clone();
    const handStart = state.localControllerOrientations[0].clone();
    mode.onPointerMove(drag(1));
    expect(camera.quaternion.equals(cameraStart)).toBe(true);
    const rotatedHand = state.localControllerOrientations[0].clone();
    expect(rotatedHand.equals(handStart)).toBe(false);
    mode.onPointerMove(drag(2));
    expect(camera.quaternion.equals(cameraStart)).toBe(false);
    expect(state.localControllerOrientations[0].equals(rotatedHand)).toBe(true);
  });
});
