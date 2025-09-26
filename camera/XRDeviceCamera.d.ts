import { SimulatorCamera } from '../simulator/SimulatorCamera';
import { SimulatorMediaDeviceInfo } from '../simulator/SimulatorMediaDeviceInfo';
import { VideoStream, VideoStreamDetails } from '../video/VideoStream';
import { DeviceCameraOptions } from './CameraOptions';
export type MediaOrSimulatorMediaDeviceInfo = MediaDeviceInfo | SimulatorMediaDeviceInfo;
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
export declare class XRDeviceCamera extends VideoStream<XRDeviceCameraDetails> {
    simulatorCamera?: SimulatorCamera;
    protected videoConstraints_: MediaTrackConstraints;
    private isInitializing_;
    private availableDevices_;
    private currentDeviceIndex_;
    private currentTrackSettings_?;
    /**
     * @param options - The configuration options.
     */
    constructor({ videoConstraints, willCaptureFrequently }?: Partial<DeviceCameraOptions>);
    /**
     * Retrieves the list of available video input devices.
     * @returns A promise that resolves with an
     * array of video devices.
     */
    getAvailableVideoDevices(): Promise<MediaOrSimulatorMediaDeviceInfo[]>;
    /**
     * Initializes the camera based on the initial constraints.
     */
    init(): Promise<void>;
    /**
     * Initializes the media stream from the user's camera. After the stream
     * starts, it updates the current device index based on the stream's active
     * track.
     */
    protected initStream_(): Promise<void>;
    /**
     * Sets the active camera by its device ID. Removes potentially conflicting
     * constraints such as facingMode.
     * @param deviceId - Device id.
     */
    setDeviceId(deviceId: string): Promise<void>;
    /**
     * Sets the active camera by its facing mode ('user' or 'environment').
     * @param facingMode - facing mode
     */
    setFacingMode(facingMode: VideoFacingModeEnum): Promise<void>;
    /**
     * Gets the list of enumerated video devices.
     */
    getAvailableDevices(): MediaOrSimulatorMediaDeviceInfo[];
    /**
     * Gets the currently active device info, if available.
     */
    getCurrentDevice(): MediaOrSimulatorMediaDeviceInfo | undefined;
    /**
     * Gets the settings of the currently active video track.
     */
    getCurrentTrackSettings(): MediaTrackSettings | undefined;
    /**
     * Gets the index of the currently active device.
     */
    getCurrentDeviceIndex(): number;
    registerSimulatorCamera(simulatorCamera: SimulatorCamera): void;
}
export {};
