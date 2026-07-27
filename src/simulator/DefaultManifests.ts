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
    objects: [],
  },
  {
    name: 'Office',
    scenePath: `${SIMULATOR_SCENES_PATH}XREmulatorsceneV5_office.glb`,
    scenePlanesPath: `${SIMULATOR_SCENES_PATH}XREmulatorsceneV5_office_planes.json`,
    navMeshPath: `${SIMULATOR_SCENES_PATH}XREmulatorsceneV5_office_navmesh.glb`,
    position: [3.6, 0.3, 2],
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
