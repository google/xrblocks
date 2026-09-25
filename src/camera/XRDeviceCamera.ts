import * as THREE from 'three';

import {
  assertWebGLRenderer,
  isWebGPURenderer,
  type WebGLOrWebGPURenderer,
} from '../core/RendererTypes';
import {
  StreamState,
  VideoStream,
  VideoStreamDetails,
  type VideoStreamGetSnapshotBase64Options,
  type VideoStreamGetSnapshotBlobOptions,
  type VideoStreamGetSnapshotImageDataOptions,
  type VideoStreamGetSnapshotOptions,
  type VideoStreamGetSnapshotTextureOptions,
} from '../video/VideoStream';

import {
  DEFAULT_RGB_TO_DEPTH_PARAMS,
  DeviceCameraOptions,
  RgbToDepthParams,
} from './CameraOptions';
import type {
  CameraDeviceInfo,
  SimulatorCameraSource,
} from './SimulatorCameraSource';
import {flipWebGLPixelRows} from './XRCameraSnapshot';

export type MediaOrSimulatorMediaDeviceInfo =
  | MediaDeviceInfo
  | CameraDeviceInfo;

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

  simulatorCamera?: SimulatorCameraSource;
  rgbToDepthParams: RgbToDepthParams;
  protected videoConstraints_: MediaTrackConstraints;
  private isInitializing_ = false;
  private availableDevices_: MediaOrSimulatorMediaDeviceInfo[] = [];
  private currentDeviceIndex_ = -1;
  private currentTrackSettings_?: MediaTrackSettings;
  private renderer_?: WebGLOrWebGPURenderer;
  private readonly mediaTexture_: THREE.Texture;
  private useXRCameraAccess_ = false;
  private xrCameraTexture_?: THREE.ExternalTexture;
  private xrCameraRenderTarget_?: THREE.WebGLRenderTarget;
  private xrCameraCopyScene_?: THREE.Scene;
  private xrCameraCopyCamera_?: THREE.OrthographicCamera;
  private xrCameraCopyMaterial_?: THREE.MeshBasicMaterial;
  private xrCameraSnapshotImageData_: ImageData | null = null;
  private xrCameraSnapshotCanvas_: HTMLCanvasElement | null = null;
  private xrCameraSnapshotContext_: CanvasRenderingContext2D | null = null;
  private pendingXRCameraCapture_?: {
    options: VideoStreamGetSnapshotOptions;
    resolve(value: unknown): void;
    timeout: ReturnType<typeof setTimeout>;
  };
  private xrCameraAccessTimeout_: ReturnType<typeof setTimeout> | null = null;
  private disposed_ = false;

  /**
   * @param options - The configuration options.
   */
  constructor(private options: DeviceCameraOptions) {
    super({willCaptureFrequently: options.willCaptureFrequently ?? false});
    this.mediaTexture_ = this.texture;
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
  setRenderer(renderer: WebGLOrWebGPURenderer) {
    this.renderer_ = renderer;
  }

  /**
   * Initializes the camera based on the initial constraints.
   */
  async init() {
    if (this.disposed_) return;
    this.useXRCameraAccess_ = false;
    this.disposeXRCameraAccessResources_();
    this.clearXRCameraAccessTimeout_();
    this.setState_(StreamState.INITIALIZING);
    try {
      this.availableDevices_ = await this.getAvailableVideoDevices();
      if (this.disposed_) return;

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
    if (this.isInitializing_ || this.disposed_) return;
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
      let targetDeviceId =
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
        targetDeviceId = targetDeviceIdFromLabel;
      }

      if (useSimulatorCamera) {
        stream = this.simulatorCamera!.getMedia(this.videoConstraints_);
        if (!stream) {
          throw new Error('Simulator camera failed to provide a media stream.');
        }
      } else {
        const constraints = {...this.videoConstraints_};
        if (targetDeviceId === '') {
          delete constraints.deviceId;
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: constraints,
        });
        if (this.disposed_) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        this.availableDevices_ = await this.getAvailableVideoDevices();
      }

      if (this.disposed_) {
        for (const track of stream?.getTracks() ?? []) track.stop();
        return;
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
        if (targetDeviceId === '') {
          this.videoConstraints_.deviceId = {
            exact: this.currentTrackSettings_.deviceId,
          };
        }
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
      if (this.disposed_) {
        this.stop_();
        return;
      }

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
   * Captures a snapshot from the active camera source.
   *
   * In the normal video path this resolves from {@link getSnapshot}
   * immediately. In the WebXR Raw Camera Access fallback, the browser camera
   * image is only valid during the XR frame that produced it, so this queues a
   * one-shot GPU readback for the next {@link updateXRCamera} call and then
   * resolves through {@link getSnapshot}. Synchronous {@link getSnapshot} on
   * that fallback path returns the most recently captured one-shot frame, or
   * `null` when no capture has completed yet.
   */
  captureSnapshot(
    options: VideoStreamGetSnapshotImageDataOptions
  ): Promise<ImageData | null>;
  captureSnapshot(
    options: VideoStreamGetSnapshotBase64Options
  ): Promise<string | null>;
  captureSnapshot(
    options: VideoStreamGetSnapshotTextureOptions
  ): Promise<THREE.Texture | null>;
  captureSnapshot(
    options: VideoStreamGetSnapshotBlobOptions
  ): Promise<Blob | null>;
  captureSnapshot(
    options: VideoStreamGetSnapshotOptions = {}
  ): Promise<ImageData | string | THREE.Texture | Blob | null> {
    if (!this.useXRCameraAccess_) {
      return Promise.resolve(
        (
          this.getSnapshot as (
            options: VideoStreamGetSnapshotOptions
          ) =>
            | ImageData
            | Promise<string | null>
            | THREE.Texture
            | Promise<Blob | null>
            | null
        )(options)
      );
    }

    if (!this.renderer_) return Promise.resolve(null);

    this.resolvePendingXRCameraCapture_(null);
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (this.pendingXRCameraCapture_?.resolve === resolve) {
          this.pendingXRCameraCapture_ = undefined;
          resolve(null);
        }
      }, 1000);
      this.pendingXRCameraCapture_ = {options, resolve, timeout};
    });
  }

  protected override snapshotSourceAvailable_(): boolean {
    if (this.useXRCameraAccess_)
      return this.xrCameraSnapshotImageData_ !== null;
    return super.snapshotSourceAvailable_();
  }

  protected override drawSnapshotSource_(
    context: CanvasRenderingContext2D,
    width: number,
    height: number
  ) {
    if (!this.useXRCameraAccess_) {
      super.drawSnapshotSource_(context, width, height);
      return;
    }
    const imageData = this.xrCameraSnapshotImageData_;
    if (!imageData) return;
    if (width === imageData.width && height === imageData.height) {
      context.putImageData(imageData, 0, 0);
      return;
    }
    const canvas = this.snapshotCanvasForImageData_(imageData);
    if (canvas) context.drawImage(canvas, 0, 0, width, height);
  }

  /**
   * Updates the camera texture from the WebXR Raw Camera Access API.
   * Must be called each frame from the render loop when in XR camera mode.
   */
  updateXRCamera(frame: XRFrame) {
    if (!this.useXRCameraAccess_ || !this.renderer_ || !frame) return;
    assertWebGLRenderer(this.renderer_, 'XRDeviceCamera.updateXRCamera');

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

      const texProperties = this.renderer_.properties.get(
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

      this.processPendingXRCameraCapture_();

      break;
    }
  }

  registerSimulatorCamera(simulatorCamera?: SimulatorCameraSource) {
    this.simulatorCamera = simulatorCamera;
  }

  override dispose() {
    this.disposed_ = true;
    this.clearXRCameraAccessTimeout_();
    this.disposeXRCameraAccessResources_();
    this.renderer_ = undefined;
    this.simulatorCamera = undefined;
    this.useXRCameraAccess_ = false;
    super.dispose();
  }

  private processPendingXRCameraCapture_() {
    const request = this.pendingXRCameraCapture_;
    if (!request) return;
    try {
      this.xrCameraSnapshotImageData_ = this.captureXRCameraSnapshot_();
      const result = (
        this.getSnapshot as (
          options: VideoStreamGetSnapshotOptions
        ) =>
          | ImageData
          | Promise<string | null>
          | THREE.Texture
          | Promise<Blob | null>
          | null
      )(request.options);
      this.resolvePendingXRCameraCapture_(result);
    } catch (error) {
      console.error('Error capturing WebXR camera snapshot:', error);
      this.resolvePendingXRCameraCapture_(null);
    }
  }

  private captureXRCameraSnapshot_() {
    if (
      !this.renderer_ ||
      !this.xrCameraTexture_ ||
      !this.width ||
      !this.height
    ) {
      return null;
    }
    assertWebGLRenderer(this.renderer_, 'XRDeviceCamera.captureSnapshot');

    this.ensureXRCameraCopyObjects_();
    this.ensureXRCameraRenderTarget_();
    if (!this.xrCameraRenderTarget_) return null;

    if (this.xrCameraCopyMaterial_!.map !== this.xrCameraTexture_) {
      this.xrCameraCopyMaterial_!.map = this.xrCameraTexture_;
      this.xrCameraCopyMaterial_!.needsUpdate = true;
    }

    const previousTarget = this.renderer_.getRenderTarget();
    const previousXrEnabled = this.renderer_.xr.enabled;
    this.renderer_.xr.enabled = false;
    try {
      this.renderer_.setRenderTarget(this.xrCameraRenderTarget_);
      this.renderer_.render(
        this.xrCameraCopyScene_!,
        this.xrCameraCopyCamera_!
      );
    } finally {
      this.renderer_.setRenderTarget(previousTarget);
      this.renderer_.xr.enabled = previousXrEnabled;
    }

    const width = this.xrCameraRenderTarget_.width;
    const height = this.xrCameraRenderTarget_.height;
    const pixels = new Uint8Array(width * height * 4);
    this.renderer_.readRenderTargetPixels(
      this.xrCameraRenderTarget_,
      0,
      0,
      width,
      height,
      pixels
    );
    return new ImageData(
      flipWebGLPixelRows(pixels, width, height),
      width,
      height
    );
  }

  private ensureXRCameraRenderTarget_() {
    if (
      this.xrCameraRenderTarget_ &&
      this.xrCameraRenderTarget_.width === this.width &&
      this.xrCameraRenderTarget_.height === this.height
    ) {
      return;
    }
    this.xrCameraRenderTarget_?.dispose();
    this.xrCameraRenderTarget_ = new THREE.WebGLRenderTarget(
      this.width!,
      this.height!,
      {
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        depthBuffer: false,
        stencilBuffer: false,
      }
    );
    this.xrCameraRenderTarget_.texture.colorSpace = THREE.SRGBColorSpace;
  }

  private ensureXRCameraCopyObjects_() {
    if (this.xrCameraCopyScene_) return;
    this.xrCameraCopyScene_ = new THREE.Scene();
    this.xrCameraCopyCamera_ = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.xrCameraCopyMaterial_ = new THREE.MeshBasicMaterial({
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      this.xrCameraCopyMaterial_
    );
    this.xrCameraCopyScene_.add(quad);
  }

  private snapshotCanvasForImageData_(imageData: ImageData) {
    if (
      !this.xrCameraSnapshotCanvas_ ||
      this.xrCameraSnapshotCanvas_.width !== imageData.width ||
      this.xrCameraSnapshotCanvas_.height !== imageData.height
    ) {
      this.xrCameraSnapshotCanvas_ = document.createElement('canvas');
      this.xrCameraSnapshotCanvas_.width = imageData.width;
      this.xrCameraSnapshotCanvas_.height = imageData.height;
      this.xrCameraSnapshotContext_ =
        this.xrCameraSnapshotCanvas_.getContext('2d');
    }
    if (!this.xrCameraSnapshotContext_) return null;
    this.xrCameraSnapshotContext_.putImageData(imageData, 0, 0);
    return this.xrCameraSnapshotCanvas_;
  }

  private resolvePendingXRCameraCapture_(value: unknown) {
    const request = this.pendingXRCameraCapture_;
    if (!request) return;
    this.pendingXRCameraCapture_ = undefined;
    clearTimeout(request.timeout);
    request.resolve(value);
  }

  private disposeXRCameraAccessResources_() {
    this.resolvePendingXRCameraCapture_(null);
    this.xrCameraSnapshotImageData_ = null;
    if (this.texture === this.xrCameraTexture_)
      this.texture = this.mediaTexture_;
    this.xrCameraTexture_?.dispose();
    this.xrCameraTexture_ = undefined;
    this.xrCameraRenderTarget_?.dispose();
    this.xrCameraRenderTarget_ = undefined;
    if (this.xrCameraCopyMaterial_) {
      this.xrCameraCopyMaterial_.map = null;
      this.xrCameraCopyMaterial_.dispose();
    }
    this.xrCameraCopyMaterial_ = undefined;
    this.xrCameraCopyScene_?.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
    this.xrCameraCopyScene_ = undefined;
    this.xrCameraCopyCamera_ = undefined;
    this.xrCameraSnapshotCanvas_ = null;
    this.xrCameraSnapshotContext_ = null;
  }

  override onXRSessionEnded() {
    this.useXRCameraAccess_ = false;
    this.loaded = false;
    this.disposeXRCameraAccessResources_();
  }

  private startXRCameraAccessFallback_(reason: string, error?: unknown) {
    if (this.disposed_) return;
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
      if (this.disposed_ || !this.useXRCameraAccess_ || this.loaded) return;
      this.useXRCameraAccess_ = false;
      this.setState_(StreamState.NO_DEVICES_FOUND, {force: true});
      console.warn(
        'WebXR Raw Camera Access API did not provide frames in time.'
      );
    }, XRDeviceCamera.XR_CAMERA_ACCESS_TIMEOUT_MS);
  }

  private isXRCameraAccessGranted_() {
    if (this.renderer_ && isWebGPURenderer(this.renderer_)) {
      return false;
    }

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
