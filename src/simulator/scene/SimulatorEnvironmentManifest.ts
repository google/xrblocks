import * as THREE from 'three';

export type SimulatorVector3Tuple = [number, number, number];
export type SimulatorQuaternionTuple = [number, number, number, number];
export type SimulatorPhysicsMode = false | 'fixed' | 'dynamic';

export interface SimulatorObjectDefinition {
  id?: string;
  assetPath?: string;
  object?: THREE.Object3D;
  position?: SimulatorVector3Tuple;
  quaternion?: SimulatorQuaternionTuple;
  scale?: SimulatorVector3Tuple;
  visible?: boolean;
  detectObject?: boolean;
  label?: string;
  data?: unknown;
  physics?: SimulatorPhysicsMode;
}

export interface SimulatorSceneManifest {
  name?: string;
  scenePath?: string;
  videoPath?: string;
  scenePlanesPath?: string;
  navMeshPath?: string;
  position?: SimulatorVector3Tuple;
  quaternion?: SimulatorQuaternionTuple;
  scale?: SimulatorVector3Tuple;
  objects?: SimulatorObjectDefinition[];
}

export interface ResolvedSimulatorSceneManifest
  extends Omit<
    SimulatorSceneManifest,
    'scenePath' | 'videoPath' | 'scenePlanesPath' | 'navMeshPath' | 'objects'
  > {
  scenePath?: string;
  videoPath?: string;
  scenePlanesPath?: string;
  navMeshPath?: string;
  objects: SimulatorObjectDefinition[];
  manifestUrl: string;
}

const MANIFEST_KEYS = new Set([
  'name',
  'scenePath',
  'videoPath',
  'scenePlanesPath',
  'navMeshPath',
  'position',
  'quaternion',
  'scale',
  'objects',
]);
const OBJECT_KEYS = new Set([
  'id',
  'assetPath',
  'position',
  'quaternion',
  'scale',
  'visible',
  'detectObject',
  'label',
  'data',
  'physics',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertKnownKeys(
  value: Record<string, unknown>,
  keys: Set<string>,
  location: string
) {
  for (const key of Object.keys(value)) {
    if (!keys.has(key)) {
      throw new Error(`${location}: unknown field '${key}'.`);
    }
  }
}

function parseString(value: unknown, location: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${location}: expected a non-empty string.`);
  }
  return value;
}

function parseTuple<T extends number[]>(
  value: unknown,
  length: number,
  location: string
): T | undefined {
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.length !== length ||
    value.some((item) => typeof item !== 'number' || !Number.isFinite(item))
  ) {
    throw new Error(
      `${location}: expected an array of ${length} finite numbers.`
    );
  }
  return value as T;
}

function parseBoolean(value: unknown, location: string) {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') {
    throw new Error(`${location}: expected a boolean.`);
  }
  return value;
}

function parsePhysics(value: unknown, location: string): SimulatorPhysicsMode {
  if (value === undefined || value === false) return false;
  if (value !== 'fixed' && value !== 'dynamic') {
    throw new Error(`${location}: expected false, 'fixed', or 'dynamic'.`);
  }
  return value;
}

function parseObject(
  value: unknown,
  index: number,
  seenIds: Set<string>
): SimulatorObjectDefinition {
  const location = `objects[${index}]`;
  if (!isRecord(value)) {
    throw new Error(`${location}: expected an object.`);
  }
  assertKnownKeys(value, OBJECT_KEYS, location);
  const id = parseString(value.id, `${location}.id`);
  if (id && seenIds.has(id)) {
    throw new Error(`${location}: duplicate id '${id}'.`);
  }
  if (id) seenIds.add(id);
  const assetPath = parseString(value.assetPath, `${location}.assetPath`);
  if (!assetPath) {
    throw new Error(`${location}: assetPath is required.`);
  }
  const detectObject = parseBoolean(
    value.detectObject,
    `${location}.detectObject`
  );
  const label = parseString(value.label, `${location}.label`);
  if (detectObject && !label) {
    throw new Error(`${location}: detectObject requires label.`);
  }
  const quaternion = parseTuple<SimulatorQuaternionTuple>(
    value.quaternion,
    4,
    `${location}.quaternion`
  );
  if (quaternion && quaternion.every((component) => component === 0)) {
    throw new Error(`${location}.quaternion: expected a non-zero quaternion.`);
  }
  const scale = parseTuple<SimulatorVector3Tuple>(
    value.scale,
    3,
    `${location}.scale`
  );
  if (scale?.some((component) => component === 0)) {
    throw new Error(`${location}.scale: components must be non-zero.`);
  }
  return {
    id,
    assetPath,
    position: parseTuple<SimulatorVector3Tuple>(
      value.position,
      3,
      `${location}.position`
    ),
    quaternion,
    scale,
    visible: parseBoolean(value.visible, `${location}.visible`),
    detectObject,
    label,
    data: value.data,
    physics: parsePhysics(value.physics, `${location}.physics`),
  };
}

function resolveOptionalUrl(path: string | undefined, baseUrl: string) {
  return path ? new URL(path, baseUrl).href : undefined;
}

export function parseSimulatorSceneManifest(
  value: unknown,
  manifestUrl: string
): ResolvedSimulatorSceneManifest {
  if (!isRecord(value)) {
    throw new Error(
      `Invalid simulator manifest at ${manifestUrl}: expected an object.`
    );
  }
  try {
    assertKnownKeys(value, MANIFEST_KEYS, 'manifest');
    const scenePath = parseString(value.scenePath, 'manifest.scenePath');
    const videoPath = parseString(value.videoPath, 'manifest.videoPath');
    if (scenePath && videoPath) {
      throw new Error(
        'manifest: scenePath and videoPath are mutually exclusive.'
      );
    }
    const objectValues = value.objects;
    if (objectValues !== undefined && !Array.isArray(objectValues)) {
      throw new Error('manifest.objects: expected an array.');
    }
    const seenIds = new Set<string>();
    const objects = (objectValues ?? []).map((object, index) =>
      parseObject(object, index, seenIds)
    );
    const quaternion = parseTuple<SimulatorQuaternionTuple>(
      value.quaternion,
      4,
      'manifest.quaternion'
    );
    if (quaternion && quaternion.every((component) => component === 0)) {
      throw new Error('manifest.quaternion: expected a non-zero quaternion.');
    }
    const scale = parseTuple<SimulatorVector3Tuple>(
      value.scale,
      3,
      'manifest.scale'
    );
    if (scale?.some((component) => component === 0)) {
      throw new Error('manifest.scale: components must be non-zero.');
    }
    return {
      name: parseString(value.name, 'manifest.name'),
      scenePath: resolveOptionalUrl(scenePath, manifestUrl),
      videoPath: resolveOptionalUrl(videoPath, manifestUrl),
      scenePlanesPath: resolveOptionalUrl(
        parseString(value.scenePlanesPath, 'manifest.scenePlanesPath'),
        manifestUrl
      ),
      navMeshPath: resolveOptionalUrl(
        parseString(value.navMeshPath, 'manifest.navMeshPath'),
        manifestUrl
      ),
      position: parseTuple<SimulatorVector3Tuple>(
        value.position,
        3,
        'manifest.position'
      ),
      quaternion,
      scale,
      objects: objects.map((object) => ({
        ...object,
        assetPath: resolveOptionalUrl(object.assetPath, manifestUrl),
      })),
      manifestUrl,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid simulator manifest at ${manifestUrl}: ${message}`);
  }
}

export async function loadSimulatorSceneManifest(
  manifestPath: string,
  baseUrl = document.baseURI
) {
  const manifestUrl = new URL(manifestPath, baseUrl).href;
  // Manifests are small, mutable environment descriptors. Always refresh them
  // while allowing the larger assets they reference to use normal HTTP caching.
  const response = await fetch(manifestUrl, {cache: 'no-store'});
  if (!response.ok) {
    throw new Error(
      `Failed to load simulator manifest at ${manifestUrl}: ${response.status} ${response.statusText}`
    );
  }
  return parseSimulatorSceneManifest(await response.json(), manifestUrl);
}
