import * as THREE from 'three';
import {Options} from '../core/Options';
import {SimulatorPlane} from '../world/planes/SimulatorPlane';
import {World} from '../world/World';

// World sensing for the simulator.
// Currently just injects planes.
export class SimulatorWorld {
  private options!: Options;
  private world!: World;

  async init(options: Options, world: World) {
    this.options = options;
    this.world = world;
    if (options.world.planes.enabled && options.simulator.scenePlanesPath) {
      await this.loadPlanes(options.simulator.scenePlanesPath);
    }
  }

  private async loadPlanes(path: string) {
    const offsetPosition = new THREE.Vector3().copy(
      this.options.simulator.initialScenePosition
    );
    try {
      const planesData = (await fetch(path).then((response) =>
        response.json()
      )) as {
        planes: {
          type: string;
          area: number;
          position: {
            x: number;
            y: number;
            z: number;
          };
          quaternion: number[];
          polygon: {
            x: number;
            y: number;
          }[];
        }[];
      };
      const planes = planesData.planes.map((plane) => {
        return {
          type: plane.type,
          area: plane.area,
          position: new THREE.Vector3(
            plane.position.x,
            plane.position.y,
            plane.position.z
          ).add(offsetPosition),
          quaternion: new THREE.Quaternion(
            plane.quaternion[0],
            plane.quaternion[1],
            plane.quaternion[2],
            plane.quaternion[3]
          ),
          polygon: plane.polygon,
        } as unknown as SimulatorPlane;
      });
      this.world.planes!.setSimulatorPlanes(planes);
    } catch (error) {
      console.error('Failed to load planes:', error);
    }
  }
}
