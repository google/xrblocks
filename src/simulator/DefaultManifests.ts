import type {SimulatorSceneManifest} from './scene/SimulatorEnvironmentManifest';

import {XR_BLOCKS_ASSETS_PATH} from '../constants';
import type {SimulatorEnvironment} from './SimulatorOptions';

const SIMULATOR_SCENES_PATH = `${XR_BLOCKS_ASSETS_PATH}simulator/scenes/`;

const DEFAULT_MANIFESTS: SimulatorSceneManifest[] = [
  {
    name: 'Living Room',
    scenePath: `${SIMULATOR_SCENES_PATH}XREmulatorsceneV5_livingRoom.glb`,
    scenePlanesPath: `${SIMULATOR_SCENES_PATH}XREmulatorsceneV5_livingRoom_planes.json`,
    navMeshPath: `${SIMULATOR_SCENES_PATH}XREmulatorsceneV5_livingRoom_navmesh.glb`,
    position: [-1.6, 0.3, 0],
    locations: {
      start: {
        description: 'Open starting position on the navmesh.',
        position: [-0.51, 1.8, -0.79],
      },
      'wall-view': {
        description: 'Viewpoint with both named wall points visible.',
        position: [0.5, 1.8, 0.85],
      },
      'wall-primary': {
        description: 'Primary wall interaction point.',
        position: [-0.25, 1.47, 3.37],
      },
      'wall-secondary': {
        description: 'Secondary wall interaction point.',
        position: [-2.2, 1.51, 1.43],
      },
      'table-view': {
        description: 'Viewpoint within reach of both named table points.',
        position: [-0.76, 1.8, -0.76],
      },
      'table-primary': {
        description: 'Primary table interaction point.',
        position: [-0.16, 0.79, -0.93],
      },
      'table-secondary': {
        description: 'Secondary table interaction point.',
        position: [0.42, 0.79, -1.11],
      },
      'floor-primary': {
        description: 'Primary coordinate in a clear floor area.',
        position: [-1.38, 1.8, -2.98],
      },
      'floor-secondary': {
        description: 'Secondary coordinate in a clear floor area.',
        position: [0.88, 1.8, -2.33],
      },
      'floor-near-obstacle': {
        description: 'Floor coordinate near a fixed obstacle.',
        position: [-1.86, 0.3, -1.03],
      },
      'occlusion-target': {
        description:
          'Target hidden from the blocked view and visible from the clear view.',
        position: [0.17, 1.8, -3.79],
      },
      'occlusion-view-blocked': {
        description: 'Viewpoint where the occlusion target is blocked.',
        position: [0.32, 1.8, -2.06],
      },
      'occlusion-view-clear': {
        description: 'Viewpoint where the occlusion target is visible.',
        position: [-2.01, 1.8, -3.79],
      },
    },
    objects: [],
  },
  {
    name: 'Office',
    scenePath: `${SIMULATOR_SCENES_PATH}XREmulatorsceneV5_office.glb`,
    scenePlanesPath: `${SIMULATOR_SCENES_PATH}XREmulatorsceneV5_office_planes.json`,
    navMeshPath: `${SIMULATOR_SCENES_PATH}XREmulatorsceneV5_office_navmesh.glb`,
    position: [3, 0.3, -2],
    locations: {
      start: {
        description: 'Open starting position on the navmesh.',
        position: [-0.51, 1.8, -0.79],
      },
      'wall-view': {
        description: 'Viewpoint with both named wall points visible.',
        position: [1.23, 1.97, -0.53],
      },
      'wall-primary': {
        description: 'Primary wall interaction point.',
        position: [-1.25, 1.68, -1.13],
      },
      'wall-secondary': {
        description: 'Secondary wall interaction point.',
        position: [0.61, 1.63, -3.23],
      },
      'table-view': {
        description: 'Viewpoint within reach of both named table points.',
        position: [0.35, 1.97, -2.19],
      },
      'table-primary': {
        description: 'Primary table interaction point.',
        position: [0.46, 1.05, -2.7],
      },
      'table-secondary': {
        description: 'Secondary table interaction point.',
        position: [1.44, 1.05, -2.63],
      },
      'floor-primary': {
        description: 'Primary coordinate in a clear floor area.',
        position: [-0.88, 1.97, -1.57],
      },
      'floor-secondary': {
        description: 'Secondary coordinate in a clear floor area.',
        position: [-0.18, 1.97, 0.48],
      },
      'floor-near-obstacle': {
        description: 'Floor coordinate near a fixed obstacle.',
        position: [1.7, 1.97, 0.3],
      },
      'occlusion-target': {
        description:
          'Target hidden from the blocked view and visible from the clear view.',
        position: [-0.83, 0.35, -2.87],
      },
      'occlusion-view-blocked': {
        description: 'Viewpoint where the occlusion target is blocked.',
        position: [1.75, 1.97, -1.72],
      },
      'occlusion-view-clear': {
        description: 'Viewpoint where the occlusion target is visible.',
        position: [-1, 0.31, -1.12],
      },
    },
    objects: [],
  },
  {
    name: 'Emulator Scene V5',
    scenePath: `${SIMULATOR_SCENES_PATH}XREmulatorsceneV5.glb`,
    scenePlanesPath: `${SIMULATOR_SCENES_PATH}XREmulatorsceneV5_planes.json`,
    navMeshPath: `${SIMULATOR_SCENES_PATH}XREmulatorsceneV5_navmesh.glb`,
    position: [-1.6, 0.3, 0],
    objects: [],
  },
  {
    name: 'Emulator Scene Dark',
    scenePath: `${SIMULATOR_SCENES_PATH}XREmulatorscene_Dark.glb`,
    scenePlanesPath: `${SIMULATOR_SCENES_PATH}XREmulatorsceneV5_planes.json`,
    navMeshPath: `${SIMULATOR_SCENES_PATH}XREmulatorsceneV5_navmesh.glb`,
    position: [-1.6, 0.3, 0],
    objects: [],
  },
];

function toDataUrl(manifest: SimulatorSceneManifest) {
  return `data:application/json,${encodeURIComponent(JSON.stringify(manifest))}`;
}

export const DEFAULT_ENVIRONMENTS: SimulatorEnvironment[] =
  DEFAULT_MANIFESTS.map((manifest) => ({
    name: manifest.name,
    manifestPath: toDataUrl(manifest),
  }));
