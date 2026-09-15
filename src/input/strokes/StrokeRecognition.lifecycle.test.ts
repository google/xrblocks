import * as THREE from 'three';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {User} from '../../core/User';
import {Handedness, Hands} from '../Hands';
import {StrokeRecognizer} from './StrokeRecognition';
import {StrokeRecognitionOptions} from './StrokeRecognitionOptions';

afterEach(() => {
  vi.restoreAllMocks();
});

function createRecorder() {
  const user = new User();
  user.hands = new Hands([]);
  const selecting = vi.spyOn(user, 'isSelecting');
  selecting.mockImplementation(
    (hand = -1) => hand === -1 || hand === Handedness.LEFT
  );
  const leftJoint = Object.assign(new THREE.Group(), {jointRadius: 0.01});
  const rightJoint = Object.assign(new THREE.Group(), {jointRadius: 0.01});
  leftJoint.position.set(-1, 1, -1);
  rightJoint.position.set(1, 1, -1);
  const getJoint = vi
    .spyOn(user.hands, 'getJoint')
    .mockImplementation((_, hand) =>
      hand === Handedness.LEFT ? leftJoint : rightJoint
    );
  const recorder = new StrokeRecognizer();
  recorder.init({
    user,
    scene: new THREE.Scene(),
    camera: new THREE.Camera(),
    options: new StrokeRecognitionOptions({startDelay: 0.2, endDelay: 0}),
  });
  const start = vi.fn();
  const update = vi.fn();
  const end = vi.fn();
  recorder.addEventListener('unistrokestart', start);
  recorder.addEventListener('unistrokeupdate', update);
  recorder.addEventListener('unistrokeend', end);
  const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
  recorder.activate();
  recorder.update();
  now.mockReturnValue(1300);
  recorder.update();
  expect(start).toHaveBeenCalledTimes(1);
  expect(update).toHaveBeenCalledTimes(1);
  expect(getJoint).toHaveBeenLastCalledWith(
    'index-finger-tip',
    Handedness.LEFT
  );
  return {recorder, selecting, getJoint, start, update, end, now};
}

describe('StrokeRecognizer recording lifecycle', () => {
  it.each([
    ['the other hand', Handedness.RIGHT],
    ['the same hand', Handedness.LEFT],
  ] as const)(
    'starts a fresh stroke with %s after deactivation',
    (_, nextHand) => {
      const {recorder, selecting, getJoint, start, update, end, now} =
        createRecorder();
      recorder.deactivate();
      recorder.deactivate();
      selecting.mockImplementation(
        (hand = -1) => hand === -1 || hand === nextHand
      );
      getJoint.mockClear();
      update.mockClear();
      now.mockReturnValue(2000);
      recorder.update();
      expect(start).toHaveBeenCalledTimes(1);
      expect(update).not.toHaveBeenCalled();
      expect(end).not.toHaveBeenCalled();

      recorder.activate();
      recorder.update();
      expect.soft(start).toHaveBeenCalledTimes(2);
      expect.soft(getJoint).not.toHaveBeenCalled();
      expect.soft(update).not.toHaveBeenCalled();

      now.mockReturnValue(2199);
      recorder.update();
      expect.soft(getJoint).not.toHaveBeenCalled();
      expect.soft(update).not.toHaveBeenCalled();

      now.mockReturnValue(2300);
      recorder.update();
      expect
        .soft(getJoint)
        .toHaveBeenLastCalledWith('index-finger-tip', nextHand);
      expect.soft(update).toHaveBeenCalledTimes(1);
      expect
        .soft(update.mock.lastCall?.[0].detail.point)
        .toEqual(
          new THREE.Vector3(nextHand === Handedness.LEFT ? -1 : 1, 1, -1)
        );
      expect(end).not.toHaveBeenCalled();

      selecting.mockReturnValue(false);
      recorder.update();
      expect(end).toHaveBeenCalledTimes(1);
      expect(end.mock.calls[0][0].detail).toEqual({});
    }
  );

  it('does not end a cancelled stroke when reactivated after release', () => {
    const {recorder, selecting, start, end, now} = createRecorder();
    recorder.deactivate();
    selecting.mockReturnValue(false);
    now.mockReturnValue(2000);
    recorder.activate();
    recorder.update();

    expect(start).toHaveBeenCalledTimes(1);
    expect(end).not.toHaveBeenCalled();
  });

  it('does not emit events when repeatedly deactivated without a recording', () => {
    const {recorder, selecting, start, update, end, now} = createRecorder();
    selecting.mockReturnValue(false);
    recorder.update();
    expect(end).toHaveBeenCalledTimes(1);
    start.mockClear();
    update.mockClear();
    end.mockClear();

    recorder.deactivate();
    recorder.deactivate();
    recorder.activate();
    now.mockReturnValue(2000);
    recorder.update();

    expect(start).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(end).not.toHaveBeenCalled();
  });
});
