import { DeepPartial, DeepReadonly } from '../utils/Types';
export declare class DeviceCameraOptions {
    enabled: boolean;
    /**
     * Constraints for `getUserMedia`. This will guide the initial camera
     * selection. *
     */
    videoConstraints?: MediaTrackConstraints;
    /**
     * Hint for performance optimization on frequent captures.
     */
    willCaptureFrequently: boolean;
    constructor(options?: DeepReadonly<DeepPartial<DeviceCameraOptions>>);
}
export declare const xrDeviceCameraEnvironmentOptions: {
    readonly enabled: boolean;
    readonly videoConstraints?: {
        readonly advanced?: readonly {
            readonly aspectRatio?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly autoGainControl?: boolean | {
                readonly exact?: boolean | undefined;
                readonly ideal?: boolean | undefined;
            } | undefined;
            readonly backgroundBlur?: boolean | {
                readonly exact?: boolean | undefined;
                readonly ideal?: boolean | undefined;
            } | undefined;
            readonly channelCount?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly deviceId?: string | readonly string[] | {
                readonly exact?: string | readonly string[] | undefined;
                readonly ideal?: string | readonly string[] | undefined;
            } | undefined;
            readonly displaySurface?: string | readonly string[] | {
                readonly exact?: string | readonly string[] | undefined;
                readonly ideal?: string | readonly string[] | undefined;
            } | undefined;
            readonly echoCancellation?: boolean | {
                readonly exact?: boolean | undefined;
                readonly ideal?: boolean | undefined;
            } | undefined;
            readonly facingMode?: string | readonly string[] | {
                readonly exact?: string | readonly string[] | undefined;
                readonly ideal?: string | readonly string[] | undefined;
            } | undefined;
            readonly frameRate?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly groupId?: string | readonly string[] | {
                readonly exact?: string | readonly string[] | undefined;
                readonly ideal?: string | readonly string[] | undefined;
            } | undefined;
            readonly height?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly noiseSuppression?: boolean | {
                readonly exact?: boolean | undefined;
                readonly ideal?: boolean | undefined;
            } | undefined;
            readonly sampleRate?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly sampleSize?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly width?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
        }[] | undefined;
        readonly aspectRatio?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly autoGainControl?: boolean | {
            readonly exact?: boolean | undefined;
            readonly ideal?: boolean | undefined;
        } | undefined;
        readonly backgroundBlur?: boolean | {
            readonly exact?: boolean | undefined;
            readonly ideal?: boolean | undefined;
        } | undefined;
        readonly channelCount?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly deviceId?: string | readonly string[] | {
            readonly exact?: string | readonly string[] | undefined;
            readonly ideal?: string | readonly string[] | undefined;
        } | undefined;
        readonly displaySurface?: string | readonly string[] | {
            readonly exact?: string | readonly string[] | undefined;
            readonly ideal?: string | readonly string[] | undefined;
        } | undefined;
        readonly echoCancellation?: boolean | {
            readonly exact?: boolean | undefined;
            readonly ideal?: boolean | undefined;
        } | undefined;
        readonly facingMode?: string | readonly string[] | {
            readonly exact?: string | readonly string[] | undefined;
            readonly ideal?: string | readonly string[] | undefined;
        } | undefined;
        readonly frameRate?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly groupId?: string | readonly string[] | {
            readonly exact?: string | readonly string[] | undefined;
            readonly ideal?: string | readonly string[] | undefined;
        } | undefined;
        readonly height?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly noiseSuppression?: boolean | {
            readonly exact?: boolean | undefined;
            readonly ideal?: boolean | undefined;
        } | undefined;
        readonly sampleRate?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly sampleSize?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly width?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
    } | undefined;
    readonly willCaptureFrequently: boolean;
};
export declare const xrDeviceCameraUserOptions: {
    readonly enabled: boolean;
    readonly videoConstraints?: {
        readonly advanced?: readonly {
            readonly aspectRatio?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly autoGainControl?: boolean | {
                readonly exact?: boolean | undefined;
                readonly ideal?: boolean | undefined;
            } | undefined;
            readonly backgroundBlur?: boolean | {
                readonly exact?: boolean | undefined;
                readonly ideal?: boolean | undefined;
            } | undefined;
            readonly channelCount?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly deviceId?: string | readonly string[] | {
                readonly exact?: string | readonly string[] | undefined;
                readonly ideal?: string | readonly string[] | undefined;
            } | undefined;
            readonly displaySurface?: string | readonly string[] | {
                readonly exact?: string | readonly string[] | undefined;
                readonly ideal?: string | readonly string[] | undefined;
            } | undefined;
            readonly echoCancellation?: boolean | {
                readonly exact?: boolean | undefined;
                readonly ideal?: boolean | undefined;
            } | undefined;
            readonly facingMode?: string | readonly string[] | {
                readonly exact?: string | readonly string[] | undefined;
                readonly ideal?: string | readonly string[] | undefined;
            } | undefined;
            readonly frameRate?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly groupId?: string | readonly string[] | {
                readonly exact?: string | readonly string[] | undefined;
                readonly ideal?: string | readonly string[] | undefined;
            } | undefined;
            readonly height?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly noiseSuppression?: boolean | {
                readonly exact?: boolean | undefined;
                readonly ideal?: boolean | undefined;
            } | undefined;
            readonly sampleRate?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly sampleSize?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly width?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
        }[] | undefined;
        readonly aspectRatio?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly autoGainControl?: boolean | {
            readonly exact?: boolean | undefined;
            readonly ideal?: boolean | undefined;
        } | undefined;
        readonly backgroundBlur?: boolean | {
            readonly exact?: boolean | undefined;
            readonly ideal?: boolean | undefined;
        } | undefined;
        readonly channelCount?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly deviceId?: string | readonly string[] | {
            readonly exact?: string | readonly string[] | undefined;
            readonly ideal?: string | readonly string[] | undefined;
        } | undefined;
        readonly displaySurface?: string | readonly string[] | {
            readonly exact?: string | readonly string[] | undefined;
            readonly ideal?: string | readonly string[] | undefined;
        } | undefined;
        readonly echoCancellation?: boolean | {
            readonly exact?: boolean | undefined;
            readonly ideal?: boolean | undefined;
        } | undefined;
        readonly facingMode?: string | readonly string[] | {
            readonly exact?: string | readonly string[] | undefined;
            readonly ideal?: string | readonly string[] | undefined;
        } | undefined;
        readonly frameRate?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly groupId?: string | readonly string[] | {
            readonly exact?: string | readonly string[] | undefined;
            readonly ideal?: string | readonly string[] | undefined;
        } | undefined;
        readonly height?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly noiseSuppression?: boolean | {
            readonly exact?: boolean | undefined;
            readonly ideal?: boolean | undefined;
        } | undefined;
        readonly sampleRate?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly sampleSize?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly width?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
    } | undefined;
    readonly willCaptureFrequently: boolean;
};
export declare const xrDeviceCameraEnvironmentContinuousOptions: {
    readonly enabled: boolean;
    readonly videoConstraints?: {
        readonly advanced?: readonly {
            readonly aspectRatio?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly autoGainControl?: boolean | {
                readonly exact?: boolean | undefined;
                readonly ideal?: boolean | undefined;
            } | undefined;
            readonly backgroundBlur?: boolean | {
                readonly exact?: boolean | undefined;
                readonly ideal?: boolean | undefined;
            } | undefined;
            readonly channelCount?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly deviceId?: string | readonly string[] | {
                readonly exact?: string | readonly string[] | undefined;
                readonly ideal?: string | readonly string[] | undefined;
            } | undefined;
            readonly displaySurface?: string | readonly string[] | {
                readonly exact?: string | readonly string[] | undefined;
                readonly ideal?: string | readonly string[] | undefined;
            } | undefined;
            readonly echoCancellation?: boolean | {
                readonly exact?: boolean | undefined;
                readonly ideal?: boolean | undefined;
            } | undefined;
            readonly facingMode?: string | readonly string[] | {
                readonly exact?: string | readonly string[] | undefined;
                readonly ideal?: string | readonly string[] | undefined;
            } | undefined;
            readonly frameRate?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly groupId?: string | readonly string[] | {
                readonly exact?: string | readonly string[] | undefined;
                readonly ideal?: string | readonly string[] | undefined;
            } | undefined;
            readonly height?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly noiseSuppression?: boolean | {
                readonly exact?: boolean | undefined;
                readonly ideal?: boolean | undefined;
            } | undefined;
            readonly sampleRate?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly sampleSize?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly width?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
        }[] | undefined;
        readonly aspectRatio?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly autoGainControl?: boolean | {
            readonly exact?: boolean | undefined;
            readonly ideal?: boolean | undefined;
        } | undefined;
        readonly backgroundBlur?: boolean | {
            readonly exact?: boolean | undefined;
            readonly ideal?: boolean | undefined;
        } | undefined;
        readonly channelCount?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly deviceId?: string | readonly string[] | {
            readonly exact?: string | readonly string[] | undefined;
            readonly ideal?: string | readonly string[] | undefined;
        } | undefined;
        readonly displaySurface?: string | readonly string[] | {
            readonly exact?: string | readonly string[] | undefined;
            readonly ideal?: string | readonly string[] | undefined;
        } | undefined;
        readonly echoCancellation?: boolean | {
            readonly exact?: boolean | undefined;
            readonly ideal?: boolean | undefined;
        } | undefined;
        readonly facingMode?: string | readonly string[] | {
            readonly exact?: string | readonly string[] | undefined;
            readonly ideal?: string | readonly string[] | undefined;
        } | undefined;
        readonly frameRate?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly groupId?: string | readonly string[] | {
            readonly exact?: string | readonly string[] | undefined;
            readonly ideal?: string | readonly string[] | undefined;
        } | undefined;
        readonly height?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly noiseSuppression?: boolean | {
            readonly exact?: boolean | undefined;
            readonly ideal?: boolean | undefined;
        } | undefined;
        readonly sampleRate?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly sampleSize?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly width?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
    } | undefined;
    readonly willCaptureFrequently: boolean;
};
export declare const xrDeviceCameraUserContinuousOptions: {
    readonly enabled: boolean;
    readonly videoConstraints?: {
        readonly advanced?: readonly {
            readonly aspectRatio?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly autoGainControl?: boolean | {
                readonly exact?: boolean | undefined;
                readonly ideal?: boolean | undefined;
            } | undefined;
            readonly backgroundBlur?: boolean | {
                readonly exact?: boolean | undefined;
                readonly ideal?: boolean | undefined;
            } | undefined;
            readonly channelCount?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly deviceId?: string | readonly string[] | {
                readonly exact?: string | readonly string[] | undefined;
                readonly ideal?: string | readonly string[] | undefined;
            } | undefined;
            readonly displaySurface?: string | readonly string[] | {
                readonly exact?: string | readonly string[] | undefined;
                readonly ideal?: string | readonly string[] | undefined;
            } | undefined;
            readonly echoCancellation?: boolean | {
                readonly exact?: boolean | undefined;
                readonly ideal?: boolean | undefined;
            } | undefined;
            readonly facingMode?: string | readonly string[] | {
                readonly exact?: string | readonly string[] | undefined;
                readonly ideal?: string | readonly string[] | undefined;
            } | undefined;
            readonly frameRate?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly groupId?: string | readonly string[] | {
                readonly exact?: string | readonly string[] | undefined;
                readonly ideal?: string | readonly string[] | undefined;
            } | undefined;
            readonly height?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly noiseSuppression?: boolean | {
                readonly exact?: boolean | undefined;
                readonly ideal?: boolean | undefined;
            } | undefined;
            readonly sampleRate?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly sampleSize?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
            readonly width?: number | {
                readonly exact?: number | undefined;
                readonly ideal?: number | undefined;
                readonly max?: number | undefined;
                readonly min?: number | undefined;
            } | undefined;
        }[] | undefined;
        readonly aspectRatio?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly autoGainControl?: boolean | {
            readonly exact?: boolean | undefined;
            readonly ideal?: boolean | undefined;
        } | undefined;
        readonly backgroundBlur?: boolean | {
            readonly exact?: boolean | undefined;
            readonly ideal?: boolean | undefined;
        } | undefined;
        readonly channelCount?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly deviceId?: string | readonly string[] | {
            readonly exact?: string | readonly string[] | undefined;
            readonly ideal?: string | readonly string[] | undefined;
        } | undefined;
        readonly displaySurface?: string | readonly string[] | {
            readonly exact?: string | readonly string[] | undefined;
            readonly ideal?: string | readonly string[] | undefined;
        } | undefined;
        readonly echoCancellation?: boolean | {
            readonly exact?: boolean | undefined;
            readonly ideal?: boolean | undefined;
        } | undefined;
        readonly facingMode?: string | readonly string[] | {
            readonly exact?: string | readonly string[] | undefined;
            readonly ideal?: string | readonly string[] | undefined;
        } | undefined;
        readonly frameRate?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly groupId?: string | readonly string[] | {
            readonly exact?: string | readonly string[] | undefined;
            readonly ideal?: string | readonly string[] | undefined;
        } | undefined;
        readonly height?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly noiseSuppression?: boolean | {
            readonly exact?: boolean | undefined;
            readonly ideal?: boolean | undefined;
        } | undefined;
        readonly sampleRate?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly sampleSize?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
        readonly width?: number | {
            readonly exact?: number | undefined;
            readonly ideal?: number | undefined;
            readonly max?: number | undefined;
            readonly min?: number | undefined;
        } | undefined;
    } | undefined;
    readonly willCaptureFrequently: boolean;
};
