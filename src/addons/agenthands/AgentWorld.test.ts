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

function meshHitting(point: THREE.Vector3) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(8, 8));
  mesh.position.copy(point);
  mesh.updateMatrixWorld(true);
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
    const hit = new THREE.Vector3(0, 0, -3);
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

  it('persists grounded objects and restores them on load', async () => {
    const hit = new THREE.Vector3(0, 0, -3);
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
});
