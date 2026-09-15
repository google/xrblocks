export interface CameraDeviceInfo {
  deviceId: string;
  groupId: string;
  kind: MediaDeviceKind;
  label: string;
}

/** Optional camera source installed by the desktop simulator at runtime. */
export interface SimulatorCameraSource {
  enumerateDevices(): Promise<CameraDeviceInfo[]>;
  getMedia(constraints?: MediaTrackConstraints): MediaStream | null | undefined;
}
