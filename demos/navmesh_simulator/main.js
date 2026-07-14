import 'xrblocks/addons/simulator/SimulatorAddons.js';

import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import * as xb from 'xrblocks';

const EYE_HEIGHT = 1.5;
const START_FOOT_POSITION = {x: 0.49, y: 0.3, z: 2.31};
const PATH_Y_OFFSET = 0.04;
const NAVIGATION_SPEED_METERS_PER_SECOND = 1.2;
const WAYPOINT_THRESHOLD_METERS = 0.08;

const pathStart = new THREE.Vector3();
const currentFootPosition = new THREE.Vector3();
const desiredCameraPosition = new THREE.Vector3();
const waypointDelta = new THREE.Vector3();
const remainingPathStart = new THREE.Vector3();

class NavMeshWireframe extends xb.Script {
  pathLine = null;
  targetMarker = null;
  pathButton = null;
  routePoints = [];
  routeIndex = 0;

  async init() {
    this.add(new THREE.HemisphereLight(0xffffff, 0x666666, 3));

    const simulatorOptions = xb.core.options.simulator;
    const activeEnvironment =
      simulatorOptions.environments[simulatorOptions.activeEnvironmentIndex];
    const navMeshPath = activeEnvironment?.navMeshPath;
    if (!navMeshPath) {
      console.warn('No navmesh path configured for the active environment.');
      return;
    }

    const loader = new GLTFLoader();
    let gltf;
    try {
      gltf = await loader.loadAsync(navMeshPath);
    } catch (error) {
      console.warn(
        `Failed to load navmesh wireframe at ${navMeshPath}.`,
        error
      );
      return;
    }
    const group = new THREE.Group();

    gltf.scene.position.set(
      simulatorOptions.initialScenePosition.x,
      simulatorOptions.initialScenePosition.y,
      simulatorOptions.initialScenePosition.z
    );
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((object) => {
      if (!object.isMesh || !object.geometry) return;
      const geometry = object.geometry.clone();
      geometry.applyMatrix4(object.matrixWorld);
      const edges = new THREE.EdgesGeometry(geometry, 1);
      const wireframe = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({
          color: 0x00e5ff,
          transparent: true,
          opacity: 0.9,
          depthTest: false,
        })
      );
      wireframe.renderOrder = 1000;
      group.add(wireframe);
    });
    this.add(group);
    this.createPathButton();
  }

  update() {
    this.updateNavigation();
  }

  createPathButton() {
    this.pathButton = document.createElement('button');
    this.pathButton.textContent = 'Random Path';
    this.pathButton.style.position = 'fixed';
    this.pathButton.style.left = '12px';
    this.pathButton.style.bottom = '12px';
    this.pathButton.style.zIndex = '10000';
    this.pathButton.style.padding = '8px 12px';
    this.pathButton.style.border = '1px solid rgba(255, 255, 255, 0.35)';
    this.pathButton.style.borderRadius = '4px';
    this.pathButton.style.background = 'rgba(8, 12, 18, 0.82)';
    this.pathButton.style.color = '#ffffff';
    this.pathButton.style.font = '13px system-ui, sans-serif';
    this.pathButton.style.cursor = 'pointer';
    this.pathButton.addEventListener('click', () => {
      this.showRandomPath();
    });
    document.body.append(this.pathButton);
  }

  showRandomPath() {
    const result = xb.core.simulator.navMesh.findRandomPathFrom(
      xb.core.camera.position
    );
    if (!result) {
      this.pathButton.textContent = 'No Path';
      window.setTimeout(() => {
        this.pathButton.textContent = 'Random Path';
      }, 1200);
      return;
    }

    pathStart.copy(xb.core.camera.position);
    pathStart.y -= xb.core.options.simulator.navMesh.eyeHeight;
    this.routePoints =
      result.path.length > 0 ? [...result.path] : [result.target];
    this.routeIndex = 0;
    this.pathButton.textContent = 'Navigating...';
    this.drawPath([pathStart, ...this.routePoints]);
  }

  drawPath(points) {
    if (this.pathLine) {
      this.remove(this.pathLine);
      this.pathLine.geometry.dispose();
      this.pathLine.material.dispose();
    }
    if (this.targetMarker) {
      this.remove(this.targetMarker);
      this.targetMarker.geometry.dispose();
      this.targetMarker.material.dispose();
    }

    const liftedPoints = points.map((point) =>
      point.clone().add(new THREE.Vector3(0, PATH_Y_OFFSET, 0))
    );
    const geometry = new THREE.BufferGeometry().setFromPoints(liftedPoints);
    this.pathLine = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({
        color: 0xffd23f,
        depthTest: false,
      })
    );
    this.pathLine.renderOrder = 1001;
    this.add(this.pathLine);

    const targetPoint = liftedPoints[liftedPoints.length - 1];
    this.targetMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 16, 8),
      new THREE.MeshBasicMaterial({
        color: 0xff5c7a,
        depthTest: false,
      })
    );
    this.targetMarker.position.copy(targetPoint);
    this.targetMarker.renderOrder = 1002;
    this.add(this.targetMarker);
  }

  updateNavigation() {
    if (this.routeIndex >= this.routePoints.length) return;

    const eyeHeight = xb.core.options.simulator.navMesh.eyeHeight;
    const target = this.routePoints[this.routeIndex];
    currentFootPosition.copy(xb.core.camera.position);
    currentFootPosition.y -= eyeHeight;
    waypointDelta.subVectors(target, currentFootPosition);

    const distance = waypointDelta.length();
    if (distance <= WAYPOINT_THRESHOLD_METERS) {
      this.routeIndex++;
      if (this.routeIndex >= this.routePoints.length) {
        this.pathButton.textContent = 'Random Path';
      }
      return;
    }

    const step = Math.min(
      distance,
      NAVIGATION_SPEED_METERS_PER_SECOND * xb.getDeltaTime()
    );
    waypointDelta.multiplyScalar(step / distance);
    desiredCameraPosition.copy(xb.core.camera.position).add(waypointDelta);
    desiredCameraPosition.y =
      currentFootPosition.y + waypointDelta.y + eyeHeight;
    xb.core.simulator.navMesh.applyUserMovement(
      xb.core.camera,
      desiredCameraPosition
    );

    remainingPathStart.copy(xb.core.camera.position);
    remainingPathStart.y -= eyeHeight;
    this.drawPath([
      remainingPathStart,
      ...this.routePoints.slice(this.routeIndex),
    ]);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const options = new xb.Options();
  options.formFactor = 'desktop';
  options.setAppTitle('Simulator Navmesh');
  options.simulator.defaultMode = xb.SimulatorMode.POINTER_LOCK;
  options.simulator.navMesh.enabled = true;
  options.simulator.navMesh.eyeHeight = EYE_HEIGHT;
  options.simulator.initialCameraPosition = {
    x: START_FOOT_POSITION.x,
    y: START_FOOT_POSITION.y + EYE_HEIGHT,
    z: START_FOOT_POSITION.z,
  };

  xb.add(new NavMeshWireframe());
  xb.init(options);
});
