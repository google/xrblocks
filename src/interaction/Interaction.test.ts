import * as THREE from 'three';
import {describe, expect, it, vi} from 'vitest';

import type {Controller} from '../input/Controller';
import {Interaction} from './Interaction';
import type {
  InteractionCallbackDispatch,
  InteractionFrameInput,
  RaySourceInput,
  SelectEndEvent,
  SelectEvent,
} from './InteractionTypes';

class RecordingTarget extends THREE.Object3D {
  readonly starts: SelectEvent[] = [];
  readonly ends: SelectEndEvent[] = [];

  onObjectSelectStart(event: SelectEvent): true {
    this.starts.push(event);
    return true;
  }

  onObjectSelectEnd(event: SelectEndEvent): true {
    this.ends.push(event);
    return true;
  }
}

function callbackAdapter(): InteractionCallbackDispatch {
  return {
    isScript: (object) => object instanceof RecordingTarget,
    hasTargetHandler: (object) => object instanceof RecordingTarget,
    hasTargetHook: (object, hook) =>
      typeof Reflect.get(object, hook) === 'function',
    invokeTarget: (object, hook, argument) => {
      const handler = Reflect.get(object, hook);
      return typeof handler === 'function'
        ? Reflect.apply(handler, object, [argument])
        : undefined;
    },
    invokeSemantic: (_object, callback) => callback(),
    invokeGlobal: vi.fn(),
    invokeManipulation: () => false,
  };
}

describe('Interaction', () => {
  it('captures and completes one registered target through its callback seam', () => {
    const interaction = new Interaction({callbacks: callbackAdapter()});
    const physical = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
    const target = new RecordingTarget();
    interaction.registerHitSurface(physical, target);
    const source = controller(0);

    update(interaction, ray(source, false, physical));
    update(interaction, ray(source, true, physical));
    update(interaction, ray(source, false, physical));

    expect(target.starts).toHaveLength(1);
    expect(target.ends).toHaveLength(1);
    expect(target.ends[0]).toMatchObject({
      completed: true,
      reason: 'released',
    });
  });

  it('cancels capture when its source disappears', () => {
    const interaction = new Interaction({callbacks: callbackAdapter()});
    const physical = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
    const target = new RecordingTarget();
    interaction.registerHitSurface(physical, target);
    const source = controller(0);

    update(interaction, ray(source, true, physical));
    interaction.update({raySources: [], directTouches: []});

    expect(target.ends.at(-1)).toMatchObject({
      completed: false,
      reason: 'source-lost',
    });
  });

  it('owns select-only raycast policy', () => {
    const scene = new THREE.Scene();
    const surface = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
    surface.position.z = -1;
    scene.add(surface);
    scene.updateMatrixWorld(true);
    const interaction = new Interaction({
      callbacks: callbackAdapter(),
      scene,
      raycastMode: 'select',
    });
    const source = controller(0);

    update(interaction, ray(source, false));
    expect(interaction.getResolvedRay(source)).toBeUndefined();

    update(interaction, ray(source, true));
    expect(interaction.getResolvedRay(source)?.surface).toBe(surface);
  });
});

function controller(id: number): Controller {
  const value = new THREE.Object3D() as Controller;
  value.userData = {id, connected: true, selected: false};
  return value;
}

function ray(
  source: Controller,
  selected: boolean,
  hitObject?: THREE.Object3D
): RaySourceInput {
  source.userData.selected = selected;
  return {
    controller: source,
    sourceType: 'controller-ray',
    selected,
    ray: new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, 0, -1)),
    intersections: hitObject
      ? [
          {
            distance: 1,
            object: hitObject,
            point: new THREE.Vector3(0, 0, -1),
          },
        ]
      : undefined,
    position: new THREE.Vector3(),
    orientation: new THREE.Quaternion(),
  };
}

function update(interaction: Interaction, source: RaySourceInput): void {
  const frame: InteractionFrameInput = {
    raySources: [source],
    directTouches: [],
  };
  interaction.update(frame);
}
