import { DeepPartial } from '../../utils/Types';
/**
 * Configuration options for the ObjectDetector.
 */
export declare class ObjectsOptions {
    debugging: boolean;
    enabled: boolean;
    showDebugVisualizations: boolean;
    /**
     * Margin to add when cropping the object image, as a percentage of image
     * size.
     */
    objectImageMargin: number;
    /**
     * Configuration for the detection backends.
     */
    backendConfig: {
        /** The active backend to use for detection. */
        activeBackend: "gemini" | "mediapipe";
        gemini: {
            systemInstruction: string;
            responseSchema: {
                type: string;
                items: {
                    type: string;
                    required: string[];
                    properties: {
                        objectName: {
                            type: string;
                        };
                        ymin: {
                            type: string;
                        };
                        xmin: {
                            type: string;
                        };
                        ymax: {
                            type: string;
                        };
                        xmax: {
                            type: string;
                        };
                    };
                };
            };
        };
        /** Placeholder for a future MediaPipe backend configuration. */
        mediapipe: {};
    };
    constructor(options?: DeepPartial<ObjectsOptions>);
    /**
     * Enables the object detector.
     */
    enable(): this;
}
