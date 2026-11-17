import * as THREE from 'three';
import {afterEach, expect, it, vi} from 'vitest';
import {Depth} from '../../depth/Depth';
import {SimulatorDepth} from './SimulatorDepth';
import {SimulatorScene} from './SimulatorScene';

// Native XR transforms and GPU readback are unavailable in jsdom.
function installTransform() {
  vi.stubGlobal(
    'XRRigidTransform',
    class {
      position: {x: number; y: number; z: number; w: number};
      orientation: {x: number; y: number; z: number; w: number};
      inverse: {matrix: number[]};
      constructor(position: THREE.Vector3, orientation: THREE.Quaternion) {
        this.position = {x: position.x, y: position.y, z: position.z, w: 1};
        this.orientation = {
          x: orientation.x,
          y: orientation.y,
          z: orientation.z,
          w: orientation.w,
        };
        this.inverse = {
          matrix: new THREE.Matrix4()
            .compose(position, orientation, new THREE.Vector3(1, 1, 1))
            .invert()
            .toArray(),
        };
      }
    }
  );
}

async function setup(backend = 'WebGL') {
  installTransform();
  let finish: (() => void) | undefined;
  let reads = 0;
  let target: THREE.RenderTarget | null = null;
  const color = new THREE.Color(0x335577);
  let alpha = 0.7;
  const renderer = {
    isWebGPURenderer: backend !== 'WebGL',
    backend: {
      isWebGLBackend: backend === 'WebGL fallback',
      isWebGPUBackend: backend === 'WebGPU',
    },
    render() {},
    clear() {},
    getRenderTarget: () => target,
    setRenderTarget(value: THREE.RenderTarget | null) {
      target = value;
    },
    getClearColor: (out: THREE.Color) => out.copy(color),
    getClearAlpha: () => alpha,
    setClearColor(value: THREE.ColorRepresentation, opacity: number) {
      color.set(value);
      alpha = opacity;
    },
    getContext: () => ({PIXEL_PACK_BUFFER: 0x88eb, bindBuffer() {}}),
    readRenderTargetPixelsAsync(
      _target: THREE.RenderTarget,
      _x: number,
      _y: number,
      width: number,
      height: number,
      output?: Float32Array
    ) {
      reads++;
      return new Promise<Float32Array>((resolve) => {
        finish = () => {
          const stride = backend === 'WebGPU' ? 64 : width;
          const pixels =
            output ?? new Float32Array((height - 1) * stride + width);
          pixels.fill(-99);
          pixels.set([1, 2, 3]);
          pixels.set([4, 5, 6], stride);
          resolve(pixels);
        };
      });
    },
  };
  const camera = new THREE.PerspectiveCamera(70, 1.5);
  const scene = new SimulatorScene();
  const moving = new THREE.Object3D();
  scene.add(moving);
  scene.updateMatrixWorld(true);
  const depth = new Depth();
  const simulator = new SimulatorDepth(scene);
  simulator.depthWidth = 3;
  simulator.depthHeight = 2;
  await simulator.init(renderer as never, camera, depth);
  return {
    simulator,
    depth,
    scene,
    moving,
    camera,
    renderer,
    reads: () => reads,
    async settle() {
      const resolve = finish;
      finish = undefined;
      resolve?.();
      await Promise.resolve();
      await Promise.resolve();
    },
    pending: () => Boolean(finish),
    color,
    alpha: () => alpha,
  };
}

afterEach(() => {
  Depth.instance?.dispose();
  Depth.instance = undefined;
  vi.unstubAllGlobals();
});

it.each(['WebGL', 'WebGPU', 'WebGL fallback'])(
  'publishes top-down depth in meters from %s readback',
  async (backend) => {
    const f = await setup(backend);
    try {
      f.simulator.update();
      await f.settle();
      expect(Array.from(f.depth.depthArray[0])).toEqual(
        backend === 'WebGPU' ? [1, 2, 3, 4, 5, 6] : [4, 5, 6, 1, 2, 3]
      );
      expect(f.depth.width).toBe(3);
      expect(f.depth.height).toBe(2);
      expect(f.depth.rawValueToMeters).toBe(1);
      expect(f.color.getHex()).toBe(0x335577);
      expect(f.alpha()).toBe(0.7);
      expect(f.renderer.getRenderTarget()).toBeNull();
    } finally {
      f.simulator.dispose();
    }
  }
);

it('allows one pending readback and refreshes changed or expired depth', async () => {
  const f = await setup();
  try {
    f.simulator.maxDepthAgeMs = Infinity;
    f.simulator.update();
    f.camera.position.x = 2;
    f.simulator.update();
    expect(f.pending()).toBe(true);
    expect(f.reads()).toBe(1);
    await f.settle();
    expect(f.depth.depthCameraPositions[0].x).toBe(0);
    f.simulator.update();
    await f.settle();
    expect(f.depth.depthCameraPositions[0].x).toBe(2);
    f.simulator.update();
    expect(f.reads()).toBe(2);
    f.moving.position.z = -2;
    f.scene.updateMatrixWorld(true);
    f.simulator.update();
    await f.settle();
    expect(f.reads()).toBe(3);
    f.simulator.maxDepthAgeMs = 0;
    f.simulator.update();
    await f.settle();
    expect(f.reads()).toBe(4);
  } finally {
    await f.settle();
    f.simulator.dispose();
  }
});

it('discards pending output and releases GPU resources after disposal', async () => {
  const f = await setup();
  const released = vi.fn();
  f.simulator.depthRenderTarget.addEventListener('dispose', released);
  try {
    f.simulator.update();
    f.simulator.dispose();
    expect(released).not.toHaveBeenCalled();
    await f.settle();
    expect(f.depth.depthArray).toEqual([]);
    expect(released).toHaveBeenCalledOnce();
    f.simulator.update();
    expect(f.pending()).toBe(false);
    f.simulator.dispose();
    expect(released).toHaveBeenCalledOnce();
  } finally {
    await f.settle();
    f.simulator.dispose();
  }
});
