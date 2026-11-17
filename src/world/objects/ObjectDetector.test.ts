import * as THREE from 'three';
import {expect, it} from 'vitest';
import {DeviceCameraOptions} from '../../camera/CameraOptions';
import {XRDeviceCamera} from '../../camera/XRDeviceCamera';
import {RendererHolder} from '../../core/RendererTypes';
import {Depth} from '../../depth/Depth';
import {SimulatorObjectsManager} from '../../simulator/scene/SimulatorObjects';
import {SimulatorScene} from '../../simulator/scene/SimulatorScene';
import {WorldOptions} from '../WorldOptions';
import {ObjectDetector} from './ObjectDetector';
import {SimulatorObjectDetectionSource} from './SimulatorObjectDetectionSource';

it('returns visible scene detections at their measured surface and clears lost objects', async () => {
  const scene = new SimulatorScene(),
    root = new THREE.Group();
  scene.commitEnvironment(root);
  const objects = new SimulatorObjectsManager();
  objects.setEnvironmentGroup(root);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshBasicMaterial()
  );
  mesh.position.z = -2;
  await objects.addObjects([
    {id: 'chair', object: mesh, label: 'chair', detectObject: true},
  ]);
  const camera = new THREE.PerspectiveCamera(90, 1, 0.1, 10);
  const deviceCamera = new XRDeviceCamera(new DeviceCameraOptions()),
    depth = new Depth();
  const renderer = {
    xr: {getCamera: () => new THREE.ArrayCamera([])},
  } as unknown as THREE.WebGLRenderer;
  const detector = new ObjectDetector();
  detector.init({
    options: new WorldOptions(),
    camera,
    deviceCamera,
    depth,
    rendererHolder: new RendererHolder(renderer),
  });
  detector.setSimulatorSource(
    new SimulatorObjectDetectionSource(camera, scene, objects)
  );
  const client = {};
  try {
    detector.start(client);
    detector.update();
    const [detected] = await detector.runDetection();
    expect(detected.label).toBe('chair');
    expect(detected.position.toArray()).toEqual([0, 0, -1.5]);
    expect(detector.get()).toEqual([detected]);
    mesh.visible = false;
    detector.update();
    await detector.runDetection();
    expect(detector.detectedObjects).toEqual([]);
    expect(detector.children).toEqual([]);
    detector.dispose();
    await expect(detector.runDetection()).rejects.toThrow('disposed');
  } finally {
    detector.stop(client);
    detector.dispose();
    objects.dispose();
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
    deviceCamera.dispose();
    depth.dispose();
    Depth.instance = undefined;
  }
});
