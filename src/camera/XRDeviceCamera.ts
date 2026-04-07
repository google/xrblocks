import * as THREE from 'three';

import {SimulatorCamera} from '../simulator/SimulatorCamera';
import {SimulatorMediaDeviceInfo} from '../simulator/SimulatorMediaDeviceInfo';
import {
  StreamState,
  VideoStream,
  VideoStreamDetails,
} from '../video/VideoStream';

import {
  DEFAULT_RGB_TO_DEPTH_PARAMS,
  DeviceCameraOptions,
  RgbToDepthParams,
} from './CameraOptions';

export type MediaOrSimulatorMediaDeviceInfo =
  | MediaDeviceInfo
  | SimulatorMediaDeviceInfo;

type XRDeviceCameraDetails = VideoStreamDetails & {
  width?: number;
  height?: number;
  aspectRatio?: number;
  device?: MediaOrSimulatorMediaDeviceInfo;
};

/**
 * Handles video capture from a device camera, manages the device list,
 * and reports its state using VideoStream's event model.
 */
export class XRDeviceCamera extends VideoStream<XRDeviceCameraDetails> {
  private static readonly XR_CAMERA_ACCESS_TIMEOUT_MS = 5000;

  simulatorCamera?: SimulatorCamera;
  rgbToDepthParams: RgbToDepthParams;
  protected videoConstraints_: MediaTrackConstraints;
  private isInitializing_ = false;
  private availableDevices_: MediaOrSimulatorMediaDeviceInfo[] = [];
  private currentDeviceIndex_ = -1;
  private currentTrackSettings_?: MediaTrackSettings;
  private renderer_?: THREE.WebGLRenderer;
  private useXRCameraAccess_ = false;
  private xrCameraTexture_?: THREE.ExternalTexture;
  private xrCameraAccessTimeout_: ReturnType<typeof setTimeout> | null = null;

  /**
   * @param options - The configuration options.
   */
  constructor(private options: DeviceCameraOptions) {
    super({willCaptureFrequently: options.willCaptureFrequently ?? false});
    this.videoConstraints_ = options.videoConstraints ?? {
      facingMode: 'environment',
    };
    this.rgbToDepthParams =
      options.rgbToDepthParams ?? DEFAULT_RGB_TO_DEPTH_PARAMS;
  }

  /**
   * Retrieves the list of available video input devices.
   * @returns A promise that resolves with an
   * array of video devices.
   */
  async getAvailableVideoDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) {
      console.warn(
        'navigator.mediaDevices.enumerateDevices() is not supported.'
      );
      return [];
    }
    const devices: MediaOrSimulatorMediaDeviceInfo[] = [
      ...(await navigator.mediaDevices.enumerateDevices()),
    ];
    if (this.simulatorCamera) {
      const simulatorDevices = await this.simulatorCamera.enumerateDevices();
      devices.push(...simulatorDevices);
    }
    return devices.filter((device) => device.kind === 'videoinput');
  }

  /**
   * Sets the renderer reference, needed for WebXR camera access fallback.
   */
  setRenderer(renderer: THREE.WebGLRenderer) {
    this.renderer_ = renderer;
  }

  /**
   * Initializes the camera based on the initial constraints.
   */
  async init() {
    this.useXRCameraAccess_ = false;
    this.clearXRCameraAccessTimeout_();
    this.setState_(StreamState.INITIALIZING);
    try {
      this.availableDevices_ = await this.getAvailableVideoDevices();

      if (this.availableDevices_.length > 0) {
        await this.initStream_();
      } else if (this.renderer_) {
        this.startXRCameraAccessFallback_('No video devices found.');
        return;
      } else {
        this.setState_(StreamState.NO_DEVICES_FOUND);
        console.warn('No video devices found.');
      }
    } catch (error) {
      if (this.renderer_) {
        this.startXRCameraAccessFallback_(
          'Camera initialization failed.',
          error
        );
        return;
      }
      this.setState_(StreamState.ERROR, {error: error as Error});
      console.error('Error initializing XRDeviceCamera:', error);
      throw error;
    }
  }

  protected getDeviceIdFromLabel(label: string): string | null {
    return (
      this.availableDevices_.find((x) => x.label == label)?.deviceId ?? null
    );
  }

  /**
   * Initializes the media stream from the user's camera. After the stream
   * starts, it updates the current device index based on the stream's active
   * track.
   */
  protected async initStream_() {
    if (this.isInitializing_) return;
    this.isInitializing_ = true;
    this.setState_(StreamState.INITIALIZING);

    // Reset state for the new stream.
    this.currentTrackSettings_ = undefined;
    this.currentDeviceIndex_ = -1;
    try {
      console.debug(
        'Requesting media stream with constraints:',
        this.videoConstraints_
      );
      let stream = null;

      const deviceIdConstraint = this.videoConstraints_.deviceId;
      const targetDeviceId =
        typeof deviceIdConstraint === 'string'
          ? deviceIdConstraint
          : Array.isArray(deviceIdConstraint)
            ? deviceIdConstraint[0]
            : deviceIdConstraint?.exact;

      const useSimulatorCamera =
        !!this.simulatorCamera &&
        ((targetDeviceId &&
          this.availableDevices_.find((d) => d.deviceId === targetDeviceId)
            ?.groupId === 'simulator') ||
          (!targetDeviceId &&
            this.videoConstraints_.facingMode === 'environment'));

      const targetDeviceIdFromLabel = this.options.cameraLabel
        ? this.getDeviceIdFromLabel(this.options.cameraLabel)
        : null;
      if (!this.videoConstraints_.deviceId && targetDeviceIdFromLabel) {
        this.videoConstraints_ = {
          deviceId: targetDeviceIdFromLabel,
          ...this.videoConstraints_,
        };
      }

      if (useSimulatorCamera) {
        stream = this.simulatorCamera!.getMedia(this.videoConstraints_);
        if (!stream) {
          throw new Error('Simulator camera failed to provide a media stream.');
        }
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          video: this.videoConstraints_,
        });
      }

      const videoTracks = stream?.getVideoTracks() || [];

      if (!videoTracks.length) {
        throw new Error('MediaStream has no video tracks.');
      }

      const activeTrack = videoTracks[0];
      this.currentTrackSettings_ = activeTrack.getSettings();
      console.debug('Active track settings:', this.currentTrackSettings_);

      if (this.currentTrackSettings_.deviceId) {
        this.currentDeviceIndex_ = this.availableDevices_.findIndex(
          (device) => device.deviceId === this.currentTrackSettings_!.deviceId
        );
      } else {
        console.warn('Stream started without deviceId as it was unavailable');
      }

      // Clear handlers before resetting the element.
      this.video_.onerror = null;
      this.video_.onloadedmetadata = null;
      this.stop_(); // Stop any previous stream before starting new one.
      this.stream_ = stream;
      this.video_.srcObject = stream;

      await new Promise<void>((resolve, reject) => {
        this.video_.onloadedmetadata = () => {
          this.handleVideoStreamLoadedMetadata(resolve, reject, true);
        };
        // Autoplay policy can still reject play() here.
        this.video_.play().catch((playError) => {
          console.warn(
            'video.play() rejected (may still autoplay):',
            playError
          );
        });
      });

      const details = {
        width: this.width,
        height: this.height,
        aspectRatio: this.aspectRatio,
        device: this.getCurrentDevice(),
        facingMode: this.currentTrackSettings_.facingMode,
        trackSettings: this.currentTrackSettings_,
      };
      this.setState_(StreamState.STREAMING, details);
    } finally {
      this.isInitializing_ = false;
    }
  }

  /**
   * Sets the active camera by its device ID. Removes potentially conflicting
   * constraints such as facingMode.
   * @param deviceId - Device ID
   */
  async setDeviceId(deviceId: string) {
    const newIndex = this.availableDevices_.findIndex(
      (device) => device.deviceId === deviceId
    );
    if (newIndex === -1) {
      throw new Error(`Device with ID ${deviceId} not found.`);
    }
    if (newIndex === this.currentDeviceIndex_) {
      console.log(`Device ${deviceId} is already active.`);
      return;
    }
    delete this.videoConstraints_.facingMode;
    this.videoConstraints_.deviceId = {exact: deviceId};
    await this.initStream_();
  }

  /**
   * Sets the active camera by its facing mode ('user' or 'environment').
   * @param facingMode - facing mode
   */
  async setFacingMode(facingMode: VideoFacingModeEnum) {
    delete this.videoConstraints_.deviceId;
    this.videoConstraints_.facingMode = facingMode;
    this.currentDeviceIndex_ = -1;
    await this.initStream_();
  }

  /**
   * Gets the list of enumerated video devices.
   */
  getAvailableDevices() {
    return this.availableDevices_;
  }

  /**
   * Gets the currently active device info, if available.
   */
  getCurrentDevice() {
    if (this.currentDeviceIndex_ === -1 || !this.availableDevices_.length) {
      return undefined;
    }
    return this.availableDevices_[this.currentDeviceIndex_];
  }

  /**
   * Gets the settings of the currently active video track.
   */
  getCurrentTrackSettings() {
    return this.currentTrackSettings_;
  }

  /**
   * Gets the index of the currently active device.
   */
  getCurrentDeviceIndex() {
    return this.currentDeviceIndex_;
  }

  /**
   * Whether the camera is using the WebXR Raw Camera Access API fallback.
   */
  get isUsingXRCameraAccess() {
    return this.useXRCameraAccess_;
  }

  /**
   * Updates the camera texture from the WebXR Raw Camera Access API.
   * Must be called each frame from the render loop when in XR camera mode.
   */
  updateXRCamera(frame: XRFrame) {
    if (!this.useXRCameraAccess_ || !this.renderer_ || !frame) return;

    const binding = this.renderer_.xr.getBinding();
    const refSpace = this.renderer_.xr.getReferenceSpace();
    if (!binding || !refSpace) return;

    const pose = frame.getViewerPose(refSpace);
    if (!pose) return;

    for (const view of pose.views) {
      const xrCamera = (view as XRView & {camera?: XRCamera}).camera;
      if (!xrCamera) continue;

      const glTexture = (
        binding as XRWebGLBinding & {
          getCameraImage?: (camera: XRCamera) => WebGLTexture | null;
        }
      ).getCameraImage?.(xrCamera);
      if (!glTexture) continue;

      if (!this.xrCameraTexture_) {
        this.xrCameraTexture_ = new THREE.ExternalTexture(glTexture);
        this.xrCameraTexture_.minFilter = THREE.LinearFilter;
        this.xrCameraTexture_.magFilter = THREE.LinearFilter;
        this.xrCameraTexture_.colorSpace = THREE.SRGBColorSpace;
        this.xrCameraTexture_.generateMipmaps = false;
      } else {
        this.xrCameraTexture_.sourceTexture = glTexture;
      }

      this.width = xrCamera.width;
      this.height = xrCamera.height;
      this.aspectRatio = this.width / this.height;

      const texProperties = this.renderer_!.properties.get(
        this.xrCameraTexture_
      ) as {
        __webglTexture: WebGLTexture;
        __version: number;
      };
      texProperties.__webglTexture = glTexture;
      texProperties.__version = 1;

      this.texture = this.xrCameraTexture_;

      if (!this.loaded) {
        this.clearXRCameraAccessTimeout_();
        this.loaded = true;
        this.setState_(StreamState.STREAMING, {
          force: true,
          width: this.width,
          height: this.height,
          aspectRatio: this.aspectRatio,
        });
      }

      break;
    }
  }

  registerSimulatorCamera(simulatorCamera: SimulatorCamera) {
    this.simulatorCamera = simulatorCamera;
  }

  private startXRCameraAccessFallback_(reason: string, error?: unknown) {
    if (!this.isXRCameraAccessGranted_()) {
      this.useXRCameraAccess_ = false;
      this.loaded = false;
      this.setState_(StreamState.NO_DEVICES_FOUND, {force: true});
      console.warn(
        `${reason} WebXR Raw Camera Access API is not available in this session.`,
        error
      );
      return;
    }

    console.warn(
      `${reason} Falling back to WebXR Raw Camera Access API.`,
      error
    );
    this.useXRCameraAccess_ = true;
    this.loaded = false;
    this.setState_(StreamState.INITIALIZING, {force: true});
    this.clearXRCameraAccessTimeout_();
    this.xrCameraAccessTimeout_ = setTimeout(() => {
      if (!this.useXRCameraAccess_ || this.loaded) return;
      this.useXRCameraAccess_ = false;
      this.setState_(StreamState.NO_DEVICES_FOUND, {force: true});
      console.warn(
        'WebXR Raw Camera Access API did not provide frames in time.'
      );
    }, XRDeviceCamera.XR_CAMERA_ACCESS_TIMEOUT_MS);
  }

  private isXRCameraAccessGranted_() {
    const session = this.renderer_?.xr.getSession() as
      | (XRSession & {enabledFeatures?: string[]})
      | undefined;

    if (!session) {
      return true;
    }

    if (!('enabledFeatures' in session) || !session.enabledFeatures) {
      return true;
    }

    return session.enabledFeatures.includes('camera-access');
  }

  private clearXRCameraAccessTimeout_() {
    if (!this.xrCameraAccessTimeout_) return;
    clearTimeout(this.xrCameraAccessTimeout_);
    this.xrCameraAccessTimeout_ = null;
  }
}
