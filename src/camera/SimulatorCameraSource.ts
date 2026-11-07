import type * as THREE from 'three';

export interface CameraDeviceInfo {
  deviceId: string;
  groupId: string;
  kind: MediaDeviceKind;
  label: string;
}

export interface SimulatorCameraParameters {
  clipFromView: THREE.Matrix4;
  worldFromView: THREE.Matrix4;
  width: number;
  height: number;
}

/** Optional camera source installed by the desktop simulator at runtime. */
export interface SimulatorCameraSource {
  getCameraParameters(): SimulatorCameraParameters | undefined;
  enumerateDevices(): Promise<CameraDeviceInfo[]>;
  getMedia(constraints?: MediaTrackConstraints): MediaStream | null | undefined;
}
