import * as THREE from 'three';
import {afterEach, expect, it, vi} from 'vitest';
import {SimulatorCamera} from './SimulatorCamera';

afterEach(() => {
  vi.restoreAllMocks();
});

it('captures a centered crop, follows the source pose, and releases media', async () => {
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage,
  } as never);
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLCanvasElement.prototype,
    'captureStream'
  );
  const tracks: {
    readyState: string;
    stop(): void;
    getSettings(): {deviceId: string};
  }[] = [];
  Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', {
    configurable: true,
    value() {
      const track = {
        readyState: 'live',
        stop() {
          this.readyState = 'ended';
        },
        getSettings: () => ({deviceId: 'camera'}),
      };
      tracks.push(track);
      return {getVideoTracks: () => [track], getTracks: () => [track]};
    },
  });
  const source = document.createElement('canvas');
  source.width = 8;
  source.height = 6;
  const camera = new SimulatorCamera({domElement: source} as never);
  camera.width = 320;
  camera.height = 160;
  try {
    camera.init();
    const [device] = await camera.enumerateDevices();
    const stream = camera.getMedia({deviceId: {exact: device.deviceId}})!;
    expect(stream.getVideoTracks()[0].readyState).toBe('live');
    expect(camera.getMedia({deviceId: {exact: 'another-camera'}})).toBeNull();
    camera.onSimulatorSceneRendered();
    expect(drawImage).toHaveBeenLastCalledWith(
      source,
      0,
      1,
      8,
      4,
      0,
      0,
      320,
      160
    );
    camera.matchRenderingCamera = false;
    const pose = new THREE.PerspectiveCamera();
    pose.position.set(1, 2, 3);
    pose.rotation.set(0.1, 0.2, 0.3);
    let renderedPosition: THREE.Vector3 | undefined;
    let renderedRotation: THREE.Quaternion | undefined;
    camera.onBeforeSimulatorSceneRender(pose, (view) => {
      renderedPosition = view.position.clone();
      renderedRotation = view.quaternion.clone();
    });
    expect(renderedPosition).toEqual(pose.position);
    expect(renderedRotation?.equals(pose.quaternion)).toBe(true);
    camera.dispose();
    expect(tracks.every((track) => track.readyState === 'ended')).toBe(true);
    expect(await camera.enumerateDevices()).toEqual([]);
    expect(camera.getMedia()).toBeUndefined();
  } finally {
    camera.dispose();
    if (descriptor)
      Object.defineProperty(
        HTMLCanvasElement.prototype,
        'captureStream',
        descriptor
      );
    else Reflect.deleteProperty(HTMLCanvasElement.prototype, 'captureStream');
  }
});
