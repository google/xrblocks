import {SimulatorCamera} from '../simulator/SimulatorCamera';
import {SimulatorMediaDeviceInfo} from '../simulator/SimulatorMediaDeviceInfo';
import {StreamState, VideoStream, VideoStreamDetails} from '../video/VideoStream';

import {DeviceCameraOptions} from './CameraOptions';

export type MediaOrSimulatorMediaDeviceInfo =
    MediaDeviceInfo|SimulatorMediaDeviceInfo;

type XRDeviceCameraDetails = VideoStreamDetails&{
  width?: number;
  height?: number;
  aspectRatio?: number;
  device?: MediaOrSimulatorMediaDeviceInfo;
}

/**
 * Handles video capture from a device camera, manages the device list,
 * and reports its state using VideoStream's event model.
 */
export class XRDeviceCamera extends VideoStream<XRDeviceCameraDetails> {
  simulatorCamera?: SimulatorCamera;
  protected videoConstraints_: MediaTrackConstraints;
  private isInitializing_ = false;
  private availableDevices_: MediaOrSimulatorMediaDeviceInfo[] = [];
  private currentDeviceIndex_ = -1;
  private currentTrackSettings_?: MediaTrackSettings;

  /**
   * @param options - The configuration options.
   */
  constructor({
    videoConstraints = {facingMode: 'environment'},
    willCaptureFrequently = false
  }: Partial<DeviceCameraOptions> = {}) {
    super({willCaptureFrequently});
    this.videoConstraints_ = {...videoConstraints};
  }

  /**
   * Retrieves the list of available video input devices.
   * @returns A promise that resolves with an
   * array of video devices.
   */
  async getAvailableVideoDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) {
      console.warn(
          'navigator.mediaDevices.enumerateDevices() is not supported.');
      return [];
    }
    const devices: MediaOrSimulatorMediaDeviceInfo[] =
        [...await navigator.mediaDevices.enumerateDevices()];
    if (this.simulatorCamera) {
      const simulatorDevices = await this.simulatorCamera.enumerateDevices();
      devices.push(...simulatorDevices);
    }
    return devices.filter(device => device.kind === 'videoinput');
  }

  /**
   * Initializes the camera based on the initial constraints.
   */
  async init() {
    this.setState_(StreamState.INITIALIZING);
    try {
      this.availableDevices_ = await this.getAvailableVideoDevices();

      if (this.availableDevices_.length > 0) {
        await this.initStream_();
      } else {
        this.setState_(StreamState.NO_DEVICES_FOUND);
        console.warn('No video devices found.');
      }
    } catch (error) {
      this.setState_(StreamState.ERROR, {error: error as Error});
      console.error('Error initializing XRDeviceCamera:', error);
      throw error;
    }
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

    // Reset state for the new stream
    this.currentTrackSettings_ = undefined;
    this.currentDeviceIndex_ = -1;
    try {
      console.debug(
          'Requesting media stream with constraints:', this.videoConstraints_);
      let stream = null;

      const deviceIdConstraint = this.videoConstraints_.deviceId;
      const targetDeviceId = typeof deviceIdConstraint === 'string' ?
          deviceIdConstraint :
          Array.isArray(deviceIdConstraint) ? deviceIdConstraint[0] :
                                              deviceIdConstraint?.exact;

      const useSimulatorCamera = !!this.simulatorCamera &&
          ((targetDeviceId &&
            this.availableDevices_.find(d => d.deviceId === targetDeviceId)
                    ?.groupId === 'simulator') ||
           (!targetDeviceId &&
            this.videoConstraints_.facingMode === 'environment'));

      if (useSimulatorCamera) {
        stream = this.simulatorCamera!.getMedia(this.videoConstraints_);
        if (!stream) {
          throw new Error('Simulator camera failed to provide a media stream.');
        }
      } else {
        // Otherwise, request the stream from the browser.
        stream = await navigator.mediaDevices.getUserMedia(
            {video: this.videoConstraints_});
      }

      const videoTracks = stream?.getVideoTracks() || [];

      if (!videoTracks.length) {
        throw new Error('MediaStream has no video tracks.');
      }

      // After the stream is active, we can get the ID of the track
      const activeTrack = videoTracks[0];
      this.currentTrackSettings_ = activeTrack.getSettings();
      console.debug('Active track settings:', this.currentTrackSettings_);

      if (this.currentTrackSettings_.deviceId) {
        this.currentDeviceIndex_ = this.availableDevices_.findIndex(
            device => device.deviceId === this.currentTrackSettings_!.deviceId);
      } else {
        console.warn('Stream started without deviceId as it was unavailable');
      }

      this.stop_();  // Stop any previous stream before starting new one
      this.stream_ = stream;
      this.video_.srcObject = stream;
      this.video_.src = '';  // Required for some browsers to reset the src

      await new Promise<void>((resolve, reject) => {
        this.video_.onloadedmetadata = () => {
          this.handleVideoStreamLoadedMetadata(resolve, reject, true);
        };
        this.video_.onerror = () => {
          const error = new Error('Error playing camera stream.');
          this.setState_(StreamState.ERROR, {error});
          reject(error);
        };
        this.video_.play();
      });

      // Once the stream is loaded and dimensions are known, set the final state
      const details = {
        width: this.width,
        height: this.height,
        aspectRatio: this.aspectRatio,
        device: this.getCurrentDevice(),
        facingMode: this.currentTrackSettings_.facingMode,
        trackSettings: this.currentTrackSettings_,
      };
      this.setState_(StreamState.STREAMING, details);
    } catch (error) {
      this.setState_(StreamState.ERROR, {error: error as Error});
      throw error;
    } finally {
      this.isInitializing_ = false;
    }
  }

  /**
   * Sets the active camera by its device ID. Removes potentially conflicting
   * constraints such as facingMode.
   * @param deviceId - Device id.
   */
  async setDeviceId(deviceId: string) {
    const newIndex = this.availableDevices_.findIndex(
        device => device.deviceId === deviceId);
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

  registerSimulatorCamera(simulatorCamera: SimulatorCamera) {
    this.simulatorCamera = simulatorCamera;
    this.init();
  }
}
