import type RAPIER from '@dimforge/rapier3d';
import type RAPIERCompat from '@dimforge/rapier3d-compat';
import type RAPIERSimd from '@dimforge/rapier3d-simd-compat';
import {Object3D} from 'three';
import {
  Options,
  type DepthMesh,
  type DetectedMesh,
  type Physics,
  type RapierWorld,
  type RapierCollider,
  type SpeechRecognizer,
  type World,
} from 'xrblocks';

declare const rapier: typeof RAPIER;
declare const compat: typeof RAPIERCompat;
declare const simd: typeof RAPIERSimd;
declare const physics: Physics;
declare const depthMesh: DepthMesh;
declare const detectedMesh: DetectedMesh;
declare const world: World;
declare const speech: SpeechRecognizer;

const options = new Options();
options.physics.RAPIER = rapier;
options.physics.RAPIER = compat;
options.physics.RAPIER = simd;
const physicsWorld: RapierWorld = physics.blendedWorld;
depthMesh.initRapierPhysics(rapier, physicsWorld);
detectedMesh.initRapierPhysics(rapier, physicsWorld);
depthMesh.initRapierPhysics(compat, new compat.World({x: 0, y: -9.81, z: 0}));
detectedMesh.initRapierPhysics(simd, new simd.World({x: 0, y: -9.81, z: 0}));
const collider: RapierCollider | undefined = depthMesh.getColliderFromHandle(0);
void collider;

// Reject invalid modules instead of weakening the public option to any/unknown.
// @ts-expect-error A module without the physics constructors is not compatible.
options.physics.RAPIER = {};

void world.placeOnHorizontalSurface(new Object3D(), {milliseconds: 500});
speech.recognition?.start();
speech.recognition?.addEventListener('result', (event) => {
  const confidence: number = event.results[0][0].confidence;
  console.log(confidence);
});
speech.addEventListener('result', ({originalEvent}) => {
  const transcript: string = originalEvent.results[0][0].transcript;
  console.log(transcript);
});
