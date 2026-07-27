import {describe, it, expect, vi, beforeEach} from 'vitest';

import * as THREE from 'three';

import {AgentWorld} from './AgentWorld';
import type {DetectedObject} from './AgentWorld';

function bbox(cx = 0.5, cy = 0.5): THREE.Box2 {
  return new THREE.Box2(
    new THREE.Vector2(cx - 0.1, cy - 0.1),
    new THREE.Vector2(cx + 0.1, cy + 0.1)
  );
}

function detected(label: string, pos = new THREE.Vector3()): DetectedObject {
  const obj = {
    label,
    position: pos,
    detection2DBoundingBox: bbox(),
  };
  return obj as unknown as DetectedObject;
}

// A depth mesh whose raycast always reports a hit at `point`.
function meshHitting(point: THREE.Vector3) {
  const mesh = new THREE.Object3D() as THREE.Object3D & {
    __origRaycast?: THREE.Object3D['raycast'];
  };
  mesh.raycast = (_raycaster, intersects) => {
    intersects.push({distance: 1, point: point.clone(), object: mesh});
  };
  return mesh;
}

function camera() {
  const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  cam.updateMatrixWorld(true);
  return cam;
}

beforeEach(() => {
  localStorage.clear();
});

describe('AgentWorld', () => {
  it('grounds detected objects to the depth-mesh hit point', async () => {
    const hit = new THREE.Vector3(1, 2, -3);
    const detector = {
      runDetection: vi.fn().mockResolvedValue([detected('lamp')]),
    };
    const world = new AgentWorld({
      getDetector: () => detector,
      getCamera: camera,
      getDepthMesh: () => meshHitting(hit),
    });
    await world.scan();
    expect(world.objects).toHaveLength(1);
    expect(world.objects[0].label).toBe('lamp');
    expect(world.objects[0].point!.equals(hit)).toBe(true);
  });

  it('falls back to the object position when there is no depth mesh', async () => {
    const pos = new THREE.Vector3(4, 5, 6);
    const detector = {
      runDetection: vi.fn().mockResolvedValue([detected('cup', pos)]),
    };
    const world = new AgentWorld({
      getDetector: () => detector,
      getCamera: camera,
      getDepthMesh: () => null,
    });
    await world.scan();
    expect(world.objects[0].point!.equals(pos)).toBe(true);
    // Cloned, not the same reference as the detector's position.
    expect(world.objects[0].point).not.toBe(pos);
  });

  it('matches objects by exact, partial, and "the " prefix', () => {
    const world = new AgentWorld({
      getDetector: () => null,
      getCamera: camera,
      getDepthMesh: () => null,
    });
    world.objects = [
      {label: 'table lamp', point: new THREE.Vector3(1, 0, 0)},
      {label: 'window', point: new THREE.Vector3(2, 0, 0)},
    ];
    expect(world.findObject('table lamp')?.label).toBe('table lamp');
    expect(world.findObject('the lamp')?.label).toBe('table lamp');
    expect(world.findObject('door')).toBeNull();
  });

  it('pointFor returns the grounded point or null', () => {
    const world = new AgentWorld({
      getDetector: () => null,
      getCamera: camera,
      getDepthMesh: () => null,
    });
    const p = new THREE.Vector3(1, 2, 3);
    world.objects = [
      {label: 'lamp', point: p},
      {label: 'ghost', point: null},
    ];
    expect(world.pointFor('lamp')).toBe(p);
    expect(world.pointFor('ghost')).toBeNull();
    expect(world.pointFor('missing')).toBeNull();
  });

  it('persists grounded objects and restores them on load', async () => {
    const hit = new THREE.Vector3(1, 2, -3);
    const detector = {
      runDetection: vi.fn().mockResolvedValue([detected('lamp')]),
    };
    const opts = {
      getDetector: () => detector,
      getCamera: camera,
      getDepthMesh: () => meshHitting(hit),
      storageKey: 'agent_hands.test',
    };
    const world = new AgentWorld(opts);
    await world.scan();
    expect(localStorage.getItem('agent_hands.test')).toBeTruthy();

    const restored = new AgentWorld(opts);
    expect(restored.objects).toHaveLength(1);
    expect(restored.objects[0].label).toBe('lamp');
    expect(restored.objects[0].point!.equals(hit)).toBe(true);
  });

  it('marks scanned only after a scan completes, not on load', async () => {
    const hit = new THREE.Vector3(1, 2, -3);
    const detector = {
      runDetection: vi.fn().mockResolvedValue([detected('lamp')]),
    };
    const opts = {
      getDetector: () => detector,
      getCamera: camera,
      getDepthMesh: () => meshHitting(hit),
      storageKey: 'agent_hands.scanned',
    };
    const world = new AgentWorld(opts);
    expect(world.scanned).toBe(false);
    await world.scan();
    expect(world.scanned).toBe(true);

    // A world restored from persisted objects has not scanned this session.
    const restored = new AgentWorld(opts);
    expect(restored.objects).toHaveLength(1);
    expect(restored.scanned).toBe(false);
  });

  it('auto-scans after moving past the threshold, not while stationary', async () => {
    const hit = new THREE.Vector3(0, 0, -1);
    const detector = {
      runDetection: vi.fn().mockResolvedValue([detected('lamp')]),
    };
    const cam = camera();
    const world = new AgentWorld({
      getDetector: () => detector,
      getCamera: () => cam,
      getDepthMesh: () => meshHitting(hit),
      rescanCooldownMs: 0,
    });
    await world.scan();
    expect(detector.runDetection).toHaveBeenCalledTimes(1);

    // Stationary: no rescan.
    world.maybeAutoScan();
    await world.scanPromise;
    expect(detector.runDetection).toHaveBeenCalledTimes(1);

    // Moved past the threshold: rescan.
    cam.position.set(1, 0, 0);
    cam.updateMatrixWorld(true);
    world.maybeAutoScan();
    await world.scanPromise;
    expect(detector.runDetection).toHaveBeenCalledTimes(2);
  });
});
