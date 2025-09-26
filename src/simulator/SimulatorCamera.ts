import * as THREE from 'three';

import {SimulatorMediaDeviceInfo} from './SimulatorMediaDeviceInfo';
import {ConstrainDomStringMatch, evaluateConstrainDOMString} from './utils/CameraUtils';

export class SimulatorCamera {
  private cameraCreated = false;
  private cameraInfo?: SimulatorMediaDeviceInfo;
  private mediaStream?: MediaStream;
  private canvas?: HTMLCanvasElement;
  private context?: CanvasRenderingContext2D|null;
  private fps = 30;
  matchRenderingCamera = true;
  width = 512;
  height = 512;
  camera = new THREE.PerspectiveCamera();

  constructor(private renderer: THREE.WebGLRenderer) {}

  init() {
    this.createSimulatorCamera();
  }

  createSimulatorCamera() {
    if (this.cameraCreated) {
      return;
    }
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.context = this.canvas.getContext('2d');
    this.mediaStream = this.canvas.captureStream(this.fps);
    const videoTrack = this.mediaStream.getVideoTracks()[0];
    const id = this.mediaStream.getVideoTracks()[0].getSettings().deviceId;
    this.cameraInfo = new SimulatorMediaDeviceInfo(/*deviceId=*/ id);
    videoTrack.stop();
    this.cameraCreated = true;
  }

  async enumerateDevices() {
    if (this.cameraInfo) {
      return [this.cameraInfo];
    }
    return [];
  }

  onBeforeSimulatorSceneRender(
      camera: THREE.Camera, renderScene: (_: THREE.Camera) => void) {
    if (!this.cameraCreated) {
      return;
    }
    if (!this.matchRenderingCamera) {
      this.camera.position.copy(camera.position);
      this.camera.quaternion.copy(camera.quaternion);
      renderScene(this.camera);
      const sWidth = this.renderer.domElement.width;
      const sHeight = this.renderer.domElement.height;
      const aspectRatio = this.width / this.height;
      const croppedSourceWidth = Math.min(sWidth, sHeight * aspectRatio);
      const croppedSourceHeight = Math.min(sHeight, sWidth / aspectRatio);
      const sx = (sWidth - croppedSourceWidth) / 2;
      const sy = (sHeight - croppedSourceHeight) / 2;
      this.context!.drawImage(
          this.renderer.domElement, sx, sy, croppedSourceWidth,
          croppedSourceHeight, 0, 0, this.width, this.height);
    }
  }

  onSimulatorSceneRendered() {
    if (!this.cameraCreated) {
      return;
    }
    if (this.matchRenderingCamera) {
      const sWidth = this.renderer.domElement.width;
      const sHeight = this.renderer.domElement.height;
      const aspectRatio = this.width / this.height;
      const croppedSourceWidth = Math.min(sWidth, sHeight * aspectRatio);
      const croppedSourceHeight = Math.min(sHeight, sWidth / aspectRatio);
      const sx = (sWidth - croppedSourceWidth) / 2;
      const sy = (sHeight - croppedSourceHeight) / 2;
      this.context!.drawImage(
          this.renderer.domElement, sx, sy, croppedSourceWidth,
          croppedSourceHeight, 0, 0, this.width, this.height);
    }
  }

  restartVideoTrack() {
    if (!this.cameraCreated) {
      return;
    }
    this.mediaStream = this.canvas!.captureStream(this.fps);
    const id = this.mediaStream.getVideoTracks()[0].getSettings().deviceId;
    this.cameraInfo!.deviceId = id || '';
  }

  getMedia(constraints: MediaTrackConstraints = {}) {
    if (!this.cameraCreated) {
      return;
    }
    if (!constraints?.deviceId ||
        evaluateConstrainDOMString(
            constraints?.deviceId, this.cameraInfo!.deviceId) !=
            ConstrainDomStringMatch.UNACCEPTABLE) {
      const videoTrack = this.mediaStream!.getVideoTracks()[0];
      if (videoTrack.readyState == 'ended') {
        this.restartVideoTrack();
      }
      return this.mediaStream;
    }
    return null;
  }
}
