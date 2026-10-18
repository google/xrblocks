import type RAPIER from '@dimforge/rapier3d';
import {Object3D} from 'three';
import {
  Options,
  type DepthMesh,
  type DetectedMesh,
  type Physics,
  type SpeechRecognizer,
  type World,
} from 'xrblocks';

declare const rapier: typeof RAPIER;
declare const physics: Physics;
declare const depthMesh: DepthMesh;
declare const detectedMesh: DetectedMesh;
declare const world: World;
declare const speech: SpeechRecognizer;

const options = new Options();
options.physics.RAPIER = rapier;
const physicsWorld: RAPIER.World = physics.blendedWorld;
depthMesh.initRapierPhysics(rapier, physicsWorld);
detectedMesh.initRapierPhysics(rapier, physicsWorld);
const collider: RAPIER.Collider | undefined =
  depthMesh.getColliderFromHandle(0);
void collider;

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
