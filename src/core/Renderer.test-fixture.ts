import * as THREE from 'three';
import type {SerializerRenderer} from './SerializerTypes';

/** Native output boundary only: no SDK lifecycle, input, or rendering logic. */
export function rendererBoundary() {
  const spaces = new Map<string, THREE.Group>();
  const space = (name: string) => {
    if (!spaces.has(name)) spaces.set(name, new THREE.Group());
    return spaces.get(name)!;
  };
  const camera = new THREE.ArrayCamera([
    new THREE.PerspectiveCamera(),
    new THREE.PerspectiveCamera(),
  ]);
  const state = {
    loop: null as ((time: number, frame?: XRFrame) => void) | null,
    disposed: false,
    frames: 0,
  };
  const xr = Object.assign(new THREE.EventDispatcher(), {
    enabled: false,
    isPresenting: false,
    getController: (index: number) =>
      space(`ray${index}`) as THREE.XRTargetRaySpace,
    getControllerGrip: (index: number) =>
      space(`grip${index}`) as THREE.XRGripSpace,
    getHand: (index: number) =>
      Object.assign(space(`hand${index}`), {joints: {}}),
    getCamera: () => camera,
    updateCamera: (_camera: THREE.Camera) => {},
    setReferenceSpaceType: () => {},
    setFramebufferScaleFactor: () => {},
    setSession: async () => {},
    getSession: () => null,
    getReferenceSpace: () => null,
  });
  const renderer = {
    isSplitEngineSerializer: true,
    xr,
    render: (_scene: THREE.Object3D, _camera: THREE.Camera) => {
      state.frames++;
    },
    setSize: () => {},
    getSize: () => ({width: 8, height: 4}),
    setPixelRatio: () => {},
    getPixelRatio: () => 1,
    setAnimationLoop: (loop: typeof state.loop) => {
      state.loop = loop;
    },
    dispose: () => {
      state.disposed = true;
      state.loop = null;
    },
  } as unknown as SerializerRenderer;
  return {renderer, xr, state, frame: (time: number) => state.loop?.(time)};
}

/** Supply the audio hardware calls Three.js needs while updating real objects. */
export function installAudioBoundary() {
  const param = {linearRampToValueAtTime() {}};
  THREE.AudioContext.setContext({
    createGain: () => ({connect() {}}),
    destination: {},
    listener: Object.fromEntries(
      [
        'positionX',
        'positionY',
        'positionZ',
        'forwardX',
        'forwardY',
        'forwardZ',
        'upX',
        'upY',
        'upZ',
      ].map((name) => [name, param])
    ),
  } as unknown as AudioContext);
}
