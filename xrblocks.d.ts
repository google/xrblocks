/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @file xrblocks.js
 * @version v0.21.1
 * @commitid d9a0fd9
 * @builddate 2026-09-03T19:34:06.953Z
 * @description XR Blocks SDK, built from source with the above commit ID.
 * @agent When using with Gemini to create XR apps, use **Gemini Canvas** mode,
 * and follow rules below:
 * 1. Include the following importmap for maximum compatibility:
    "three": "https://cdn.jsdelivr.net/npm/three@0.184.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/",
    "@pmndrs/uikit": "https://cdn.jsdelivr.net/npm/@pmndrs/uikit@1.0.64/dist/index.min.js",
    "@pmndrs/uikit-pub-sub": "https://cdn.jsdelivr.net/npm/@pmndrs/uikit-pub-sub@1.0.64/dist/index.min.js",
    "@pmndrs/msdfonts": "https://cdn.jsdelivr.net/npm/@pmndrs/msdfonts@1.0.64/dist/index.min.js",
    "@preact/signals-core": "https://cdn.jsdelivr.net/npm/@preact/signals-core@1.14.0/dist/signals-core.mjs",
    "yoga-layout/load": "https://cdn.jsdelivr.net/npm/yoga-layout@3.2.1/dist/src/load.js",
    "lit": "https://esm.sh/lit@3.3.1",
    "lit/": "https://esm.sh/lit@3.3.1/",
    "three-pathfinding": "https://cdn.jsdelivr.net/npm/three-pathfinding@1.3.0/dist/three-pathfinding.module.js",
    2. If the app focus on standalone objects, spawn it in front of the user in
    WebXR and rescale to reasonable physical size. Wrap them with xb.ModelViewer
    and make sure users can drag the platform to move it around in XR.
    3. When rendering a large scene, remember users may navigate the scene in a
    physical world space, also add locomotion methods like pinch to teleport.
    4. Do not halluciate mode files --- use either public high-quality assets,
    or generate from primitive shapes of use vox formats for voxels or
    lego-styles.
 */
import * as GoogleGenAITypes from '@google/genai';
import * as _pmndrs_uikit_dist_panel from '@pmndrs/uikit/dist/panel';
import * as THREE from 'three';
import RAPIER_NS from 'rapier3d';
import OpenAIType from 'openai';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { GLTFLoader, GLTF } from 'three/addons/loaders/GLTFLoader.js';
import * as _sparkjsdev_spark from '@sparkjsdev/spark';
import { SparkRenderer } from '@sparkjsdev/spark';

declare const GEMINI_DEFAULT_FLASH_MODEL = "gemini-3.8-flash";
declare const GEMINI_DEFAULT_LIVE_MODEL = "gemini-3.1-flash-live-preview";
declare const GEMINI_DEFAULT_IMAGE_MODEL = "gemini-3.1-flash-image";
declare class GeminiOptions {
    apiKey: string;
    urlParam: string;
    keyValid: boolean;
    enabled: boolean;
    model: string;
    liveModel: string;
    config: GoogleGenAITypes.GenerateContentConfig;
}
declare class OpenAIOptions {
    apiKey: string;
    urlParam: string;
    model: string;
    enabled: boolean;
}
type AIModel = 'gemini' | 'openai';
declare class AIOptions {
    enabled: boolean;
    model: AIModel;
    /**
     * Show a browser dialog before AI starts so a prototype user can provide,
     * replace, or remove an API key kept only for the current page. Disabled by
     * default. The dialog is skipped when the page URL or keys.json already
     * provides a key.
     */
    promptForApiKey: boolean;
    gemini: GeminiOptions;
    openai: OpenAIOptions;
    globalUrlParams: {
        key: string;
    };
}

/**
 * Misc collection of types not specific to any XR Blocks module.
 */
type Constructor<T = object> = new (...args: any[]) => T;
type ShaderUniforms = {
    [uniform: string]: THREE.IUniform;
};
/**
 * Defines the structure for a shader object compatible with PanelMesh,
 * requiring uniforms, a vertex shader, and a fragment shader.
 */
interface Shader {
    uniforms: ShaderUniforms;
    vertexShader: string;
    fragmentShader: string;
    defines?: {
        [key: string]: unknown;
    };
}
/**
 * A recursive readonly type.
 */
type DeepReadonly<T> = T extends (...args: any[]) => any ? T : T extends object ? {
    readonly [P in keyof T]: DeepReadonly<T[P]>;
} : T;
/**
 * A recursive partial type.
 */
type DeepPartial<T> = T extends (...args: any[]) => any ? T : T extends object ? {
    [P in keyof T]?: DeepPartial<T[P]>;
} : T;

/**
 * Parameters for RGB to depth UV mapping given different aspect ratios.
 * These parameters define the distortion model and affine transformations
 * required to align the RGB camera feed with the depth map.
 */
interface RgbToDepthParams {
    scale: number;
    scaleX: number;
    scaleY: number;
    translateU: number;
    translateV: number;
    k1: number;
    k2: number;
    k3: number;
    p1: number;
    p2: number;
    xc: number;
    yc: number;
}
/**
 * Default parameters for rgb to depth projection.
 * For RGB and depth, 4:3 and 1:1, respectively.
 */
declare const DEFAULT_RGB_TO_DEPTH_PARAMS: RgbToDepthParams;
/**
 * Configuration options for the device camera.
 */
declare class DeviceCameraOptions {
    enabled: boolean;
    /**
     * Constraints for `getUserMedia`. This will guide the initial camera
     * selection.
     */
    videoConstraints?: MediaTrackConstraints;
    /**
     * Hint for performance optimization on frequent captures.
     */
    willCaptureFrequently: boolean;
    /**
     * Parameters for RGB to depth UV mapping given different aspect ratios.
     */
    rgbToDepthParams: RgbToDepthParams;
    cameraLabel?: string;
    constructor(options?: DeepReadonly<DeepPartial<DeviceCameraOptions>>);
}
declare const xrDeviceCameraEnvironmentOptions: {
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
            readonly echoCancellation?: string | boolean | {
                readonly exact?: boolean | string | undefined;
                readonly ideal?: boolean | string | undefined;
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
        readonly echoCancellation?: string | boolean | {
            readonly exact?: boolean | string | undefined;
            readonly ideal?: boolean | string | undefined;
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
    readonly rgbToDepthParams: {
        readonly scale: number;
        readonly scaleX: number;
        readonly scaleY: number;
        readonly translateU: number;
        readonly translateV: number;
        readonly k1: number;
        readonly k2: number;
        readonly k3: number;
        readonly p1: number;
        readonly p2: number;
        readonly xc: number;
        readonly yc: number;
    };
    readonly cameraLabel?: string | undefined;
};
declare const xrDeviceCameraUserOptions: {
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
            readonly echoCancellation?: string | boolean | {
                readonly exact?: boolean | string | undefined;
                readonly ideal?: boolean | string | undefined;
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
        readonly echoCancellation?: string | boolean | {
            readonly exact?: boolean | string | undefined;
            readonly ideal?: boolean | string | undefined;
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
    readonly rgbToDepthParams: {
        readonly scale: number;
        readonly scaleX: number;
        readonly scaleY: number;
        readonly translateU: number;
        readonly translateV: number;
        readonly k1: number;
        readonly k2: number;
        readonly k3: number;
        readonly p1: number;
        readonly p2: number;
        readonly xc: number;
        readonly yc: number;
    };
    readonly cameraLabel?: string | undefined;
};
declare const xrDeviceCameraEnvironmentContinuousOptions: {
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
            readonly echoCancellation?: string | boolean | {
                readonly exact?: boolean | string | undefined;
                readonly ideal?: boolean | string | undefined;
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
        readonly echoCancellation?: string | boolean | {
            readonly exact?: boolean | string | undefined;
            readonly ideal?: boolean | string | undefined;
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
    readonly rgbToDepthParams: {
        readonly scale: number;
        readonly scaleX: number;
        readonly scaleY: number;
        readonly translateU: number;
        readonly translateV: number;
        readonly k1: number;
        readonly k2: number;
        readonly k3: number;
        readonly p1: number;
        readonly p2: number;
        readonly xc: number;
        readonly yc: number;
    };
    readonly cameraLabel?: string | undefined;
};
declare const xrDeviceCameraUserContinuousOptions: {
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
            readonly echoCancellation?: string | boolean | {
                readonly exact?: boolean | string | undefined;
                readonly ideal?: boolean | string | undefined;
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
        readonly echoCancellation?: string | boolean | {
            readonly exact?: boolean | string | undefined;
            readonly ideal?: boolean | string | undefined;
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
    readonly rgbToDepthParams: {
        readonly scale: number;
        readonly scaleX: number;
        readonly scaleY: number;
        readonly translateU: number;
        readonly translateV: number;
        readonly k1: number;
        readonly k2: number;
        readonly k3: number;
        readonly p1: number;
        readonly p2: number;
        readonly xc: number;
        readonly yc: number;
    };
    readonly cameraLabel?: string | undefined;
};

declare class SceneDerivedContextOptions {
    enabled: boolean;
    constructor(options?: DeepPartial<SceneDerivedContextOptions>);
    enable(): this;
}
declare class SceneVisibilityOptions extends SceneDerivedContextOptions {
    /**
     * Raycast hits on materials with effective opacity less than or equal to this
     * threshold are ignored for line-of-sight occlusion.
     */
    occlusionOpacityThreshold: number;
}
declare class SceneSetOfMarkOptions extends SceneDerivedContextOptions {
}
declare class SceneOptions {
    enabled: boolean;
    pollingIntervalMs: number;
    visibleObjects: SceneVisibilityOptions;
    som: SceneSetOfMarkOptions;
    constructor(options?: DeepPartial<SceneOptions>);
    enable(): this;
    enableVisibleObjects(): this;
    enableSetOfMark(): this;
}

declare class ContextOptions {
    debugging: boolean;
    enabled: boolean;
    scene: SceneOptions;
    constructor(options?: DeepPartial<ContextOptions>);
    enable(): this;
    enableScene(): this;
    enableVisibleObjects(): this;
    enableSetOfMark(): this;
}

declare class DepthMeshOptions {
    enabled: boolean;
    updateVertexNormals: boolean;
    showDebugTexture: boolean;
    useDepthTexture: boolean;
    renderShadow: boolean;
    shadowOpacity: number;
    patchHoles: boolean;
    patchHolesUpper: boolean;
    opacity: number;
    useDualCollider: boolean;
    useDownsampledGeometry: boolean;
    updateFullResolutionGeometry: boolean;
    colliderUpdateFps: number;
    /** FPS cap for depth mesh geometry updates. 0 = update every frame. */
    depthMeshUpdateFps: number;
    depthFullResolution: number;
    ignoreEdgePixels: number;
}
declare class DepthOptions {
    debugging: boolean;
    enabled: boolean;
    depthMesh: DepthMeshOptions;
    depthTexture: {
        enabled: boolean;
        constantKernel: boolean;
        applyGaussianBlur: boolean;
        applyKawaseBlur: boolean;
    };
    occlusion: {
        enabled: boolean;
    };
    usagePreference: XRDepthUsage[];
    dataFormatPreference: XRDepthDataFormat[];
    depthTypeRequest: XRDepthType[];
    matchDepthView: boolean;
    constructor(options?: DeepReadonly<DeepPartial<DepthOptions>>);
}
declare const xrDepthMeshOptions: {
    readonly debugging: boolean;
    readonly enabled: boolean;
    readonly depthMesh: {
        readonly enabled: boolean;
        readonly updateVertexNormals: boolean;
        readonly showDebugTexture: boolean;
        readonly useDepthTexture: boolean;
        readonly renderShadow: boolean;
        readonly shadowOpacity: number;
        readonly patchHoles: boolean;
        readonly patchHolesUpper: boolean;
        readonly opacity: number;
        readonly useDualCollider: boolean;
        readonly useDownsampledGeometry: boolean;
        readonly updateFullResolutionGeometry: boolean;
        readonly colliderUpdateFps: number;
        readonly depthMeshUpdateFps: number;
        readonly depthFullResolution: number;
        readonly ignoreEdgePixels: number;
    };
    readonly depthTexture: {
        readonly enabled: boolean;
        readonly constantKernel: boolean;
        readonly applyGaussianBlur: boolean;
        readonly applyKawaseBlur: boolean;
    };
    readonly occlusion: {
        readonly enabled: boolean;
    };
    readonly usagePreference: readonly XRDepthUsage[];
    readonly dataFormatPreference: readonly XRDepthDataFormat[];
    readonly depthTypeRequest: readonly XRDepthType[];
    readonly matchDepthView: boolean;
};
declare const xrDepthMeshVisualizationOptions: {
    readonly debugging: boolean;
    readonly enabled: boolean;
    readonly depthMesh: {
        readonly enabled: boolean;
        readonly updateVertexNormals: boolean;
        readonly showDebugTexture: boolean;
        readonly useDepthTexture: boolean;
        readonly renderShadow: boolean;
        readonly shadowOpacity: number;
        readonly patchHoles: boolean;
        readonly patchHolesUpper: boolean;
        readonly opacity: number;
        readonly useDualCollider: boolean;
        readonly useDownsampledGeometry: boolean;
        readonly updateFullResolutionGeometry: boolean;
        readonly colliderUpdateFps: number;
        readonly depthMeshUpdateFps: number;
        readonly depthFullResolution: number;
        readonly ignoreEdgePixels: number;
    };
    readonly depthTexture: {
        readonly enabled: boolean;
        readonly constantKernel: boolean;
        readonly applyGaussianBlur: boolean;
        readonly applyKawaseBlur: boolean;
    };
    readonly occlusion: {
        readonly enabled: boolean;
    };
    readonly usagePreference: readonly XRDepthUsage[];
    readonly dataFormatPreference: readonly XRDepthDataFormat[];
    readonly depthTypeRequest: readonly XRDepthType[];
    readonly matchDepthView: boolean;
};
declare const xrDepthMeshPhysicsOptions: {
    readonly debugging: boolean;
    readonly enabled: boolean;
    readonly depthMesh: {
        readonly enabled: boolean;
        readonly updateVertexNormals: boolean;
        readonly showDebugTexture: boolean;
        readonly useDepthTexture: boolean;
        readonly renderShadow: boolean;
        readonly shadowOpacity: number;
        readonly patchHoles: boolean;
        readonly patchHolesUpper: boolean;
        readonly opacity: number;
        readonly useDualCollider: boolean;
        readonly useDownsampledGeometry: boolean;
        readonly updateFullResolutionGeometry: boolean;
        readonly colliderUpdateFps: number;
        readonly depthMeshUpdateFps: number;
        readonly depthFullResolution: number;
        readonly ignoreEdgePixels: number;
    };
    readonly depthTexture: {
        readonly enabled: boolean;
        readonly constantKernel: boolean;
        readonly applyGaussianBlur: boolean;
        readonly applyKawaseBlur: boolean;
    };
    readonly occlusion: {
        readonly enabled: boolean;
    };
    readonly usagePreference: readonly XRDepthUsage[];
    readonly dataFormatPreference: readonly XRDepthDataFormat[];
    readonly depthTypeRequest: readonly XRDepthType[];
    readonly matchDepthView: boolean;
};

declare class HandsOptions {
    /** Whether hand tracking is enabled. */
    enabled: boolean;
    /** Whether to show any hand visualization. */
    visualization: boolean;
    /** Whether to show the tracked hand joints. */
    visualizeJoints: boolean;
    /** Whether to show the virtual hand meshes. */
    visualizeMeshes: boolean;
    debugging: boolean;
    constructor(options?: DeepReadonly<DeepPartial<HandsOptions>>);
    /**
     * Enables hands tracking.
     * @returns The instance for chaining.
     */
    enableHands(): this;
    enableHandsVisualization(): this;
}

declare const HAND_JOINT_NAMES: readonly ["wrist", "thumb-metacarpal", "thumb-phalanx-proximal", "thumb-phalanx-distal", "thumb-tip", "index-finger-metacarpal", "index-finger-phalanx-proximal", "index-finger-phalanx-intermediate", "index-finger-phalanx-distal", "index-finger-tip", "middle-finger-metacarpal", "middle-finger-phalanx-proximal", "middle-finger-phalanx-intermediate", "middle-finger-phalanx-distal", "middle-finger-tip", "ring-finger-metacarpal", "ring-finger-phalanx-proximal", "ring-finger-phalanx-intermediate", "ring-finger-phalanx-distal", "ring-finger-tip", "pinky-finger-metacarpal", "pinky-finger-phalanx-proximal", "pinky-finger-phalanx-intermediate", "pinky-finger-phalanx-distal", "pinky-finger-tip"];

type JointName = (typeof HAND_JOINT_NAMES)[number];
/**
 * Utility class for managing WebXR hand tracking data based on
 * reported Handedness.
 */
/**
 * Enum for handedness, using WebXR standard strings.
 */
declare enum Handedness {
    NONE = -1,// Represents unknown or unspecified handedness
    LEFT = 0,
    RIGHT = 1
}
/**
 * Represents and provides access to WebXR hand tracking data.
 * Uses the 'handedness' property of input hands for identification.
 */
declare class Hands {
    hands: THREE.XRHandSpace[];
    dominant: Handedness;
    /**
     * @param hands - An array containing XRHandSpace objects from Three.js.
     */
    constructor(hands: THREE.XRHandSpace[]);
    /**
     * Retrieves a specific joint object for a given hand.
     * @param jointName - The name of the joint to retrieve (e.g.,
     *     'index-finger-tip').
     * @param targetHandednessEnum - The hand enum value
     *     (Handedness.LEFT or Handedness.RIGHT)
     *        to retrieve the joint from. If Handedness.NONE, uses the dominant
     * hand.
     * @returns The requested joint object, or null if not
     *     found or invalid input.
     */
    getJoint(jointName: JointName, targetHandednessEnum: Handedness): THREE.XRJointSpace | undefined;
    /**
     * Gets the index finger tip joint.
     * @param handedness - Optional handedness
     *     ('left'/'right'),
     * defaults to NONE (uses dominant hand).
     * @returns The joint object or null.
     */
    getIndexTip(handedness?: Handedness): THREE.XRJointSpace | undefined;
    /**
     * Gets the thumb tip joint.
     * @param handedness - Optional handedness
     *     ('left'/'right'),
     * defaults to NONE (uses dominant hand).
     * @returns The joint object or null.
     */
    getThumbTip(handedness?: Handedness): THREE.XRJointSpace | undefined;
    /**
     * Gets the middle finger tip joint.
     * @param handedness - Optional handedness
     *     ('left'/'right'),
     * defaults to NONE (uses dominant hand).
     * @returns The joint object or null.
     */
    getMiddleTip(handedness?: Handedness): THREE.XRJointSpace | undefined;
    /**
     * Gets the ring finger tip joint.
     * @param handedness - Optional handedness
     *     ('left'/'right'),
     * defaults to NONE (uses dominant hand).
     * @returns The joint object or null.
     */
    getRingTip(handedness?: Handedness): THREE.XRJointSpace | undefined;
    /**
     * Gets the pinky finger tip joint.
     * @param handedness - Optional handedness
     *     ('left'/'right'),
     * defaults to NONE (uses dominant hand).
     * @returns The joint object or null.
     */
    getPinkyTip(handedness?: Handedness): THREE.XRJointSpace | undefined;
    /**
     * Gets the wrist joint.
     * @param handedness - Optional handedness enum value
     *     (LEFT/RIGHT/NONE),
     * defaults to NONE (uses dominant hand).
     * @returns The joint object or null.
     */
    getWrist(handedness?: Handedness): THREE.XRJointSpace | undefined;
    /**
     * Generates a string representation of the hand joint data for both hands.
     * Always lists LEFT hand data first, then RIGHT hand data, if available.
     * @returns A string containing position data for all available
     * joints.
     */
    toString(): string;
    /**
     * Converts the pose data (position and quaternion) of all joints for both
     * hands into a single flat array. Each joint is represented by 7 numbers
     * (3 for position, 4 for quaternion). Missing joints or hands are represented
     * by zeros. Ensures a consistent output order: all left hand joints first,
     * then all right hand joints.
     * @returns A flat array containing position (x, y, z) and
     * quaternion (x, y, z, w) data for all joints, ordered [left...,
     * right...]. Size is always 2 * HAND_JOINT_NAMES.length * 7.
     */
    toPositionQuaternionArray(): number[];
    /**
     * Checks for the availability of hand data.
     * If an integer (0 for LEFT, 1 for RIGHT) is provided, it checks for that
     * specific hand. If no integer is provided, it checks that data for *both*
     * hands is available.
     * @param handIndex - Optional. The index of the hand to validate
     *     (0 or 1).
     * @returns `true` if the specified hand(s) have data, `false`
     *     otherwise.
     */
    isValid(handIndex?: number): boolean;
}

/**
 * A 3D visual marker used to indicate a user's aim or interaction
 * point in an XR scene. It orients itself to surfaces it intersects with and
 * provides visual feedback for states like "pressed".
 */
declare class Reticle extends THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> {
    /** Text description of the PanelMesh */
    name: string;
    editorIcon: string;
    /** The world-space direction vector of the ray that hit the target. */
    direction: THREE.Vector3;
    /** Ensures the reticle is drawn on top of other transparent objects. */
    renderOrder: number;
    /** The smoothing factor for rotational slerp interpolation. */
    rotationSmoothing: number;
    /** The z-offset to prevent visual artifacts (z-fighting). */
    offset: number;
    /** The most recent intersection data that positioned this reticle. */
    intersection?: THREE.Intersection;
    /** Object on which the reticle is hovering. */
    targetObject?: THREE.Object3D;
    /** Ring shown when the reticle is over an interactable object. */
    private readonly hoverRing;
    private readonly originalNormal;
    private readonly newRotation;
    private readonly objectRotation;
    private readonly normalVector;
    /**
     * Creates an instance of Reticle.
     * @param rotationSmoothing - A factor between 0.0 (no smoothing) and
     * 1.0 (no movement) to smoothly animate orientation changes.
     * @param offset - A small z-axis offset to prevent z-fighting.
     * @param size - The radius of the reticle's circle geometry.
     * @param depthTest - Determines if the reticle should be occluded by other
     * objects. Defaults to `false` to ensure it is always visible.
     */
    constructor(rotationSmoothing?: number, offset?: number, size?: number, depthTest?: boolean);
    /**
     * Orients the reticle to be flush with a surface, based on the surface
     * normal. It smoothly interpolates the rotation for a polished visual effect.
     * @param normal - The world-space normal of the surface.
     */
    setRotationFromNormalVector(normal: THREE.Vector3): void;
    /**
     * Updates the reticle's complete pose (position and rotation) from a
     * raycaster intersection object.
     * @param intersection - The intersection data from a raycast.
     */
    setPoseFromIntersection(intersection: THREE.Intersection): void;
    /**
     * Sets the color of the reticle via its shader uniform.
     * @param color - The color to apply.
     */
    setColor(color: THREE.Color | number | string): void;
    /**
     * Gets the current color of the reticle.
     * @returns The current color from the shader uniform.
     */
    getColor(): THREE.Color;
    /**
     * Sets the visual state of the reticle to "pressed" or "unpressed".
     * This provides visual feedback to the user during interaction.
     * @param pressed - True to show the pressed state, false otherwise.
     */
    setPressed(pressed: boolean): void;
    /**
     * Sets the pressed state as a continuous value for smooth animations.
     * @param pressedAmount - A value from 0.0 (unpressed) to 1.0 (fully
     * pressed).
     */
    setPressedAmount(pressedAmount: number): void;
    /**
     * Shows a ring around the reticle while it hovers over an interactable
     * object.
     */
    setHovering(hovering: boolean): void;
    /** Releases the GPU resources owned by this Reticle. */
    dispose(): void;
    /**
     * Overrides the default raycast method to make the reticle ignored by
     * raycasters.
     */
    raycast(): void;
}

interface ControllerEventMap extends THREE.Object3DEventMap {
    connected: {
        target: Controller;
        data?: XRInputSource;
    };
    disconnected: {
        target: Controller;
        data?: XRInputSource;
    };
    select: {
        target: Controller;
        data?: XRInputSource;
    };
    selectstart: {
        target: Controller;
        data?: XRInputSource;
    };
    selectend: {
        target: Controller;
        data?: XRInputSource;
    };
    squeeze: {
        target: Controller;
        data?: XRInputSource;
    };
    squeezestart: {
        target: Controller;
        data?: XRInputSource;
    };
    squeezeend: {
        target: Controller;
        data?: XRInputSource;
    };
}
interface Controller extends THREE.Object3D<ControllerEventMap> {
    reticle?: Reticle;
    gamepad?: Gamepad;
    inputSource?: Partial<XRInputSource>;
    updatePose?(): void;
}
interface ControllerEvent {
    type: keyof ControllerEventMap;
    target: Controller;
    data?: Partial<XRInputSource>;
}

type GamepadAction = 'select' | 'cycleHandPoseLeft' | 'cycleHandPoseRight' | 'cycleSimulatorMode' | 'toggleUI' | 'toggleHand' | 'moveDown' | 'moveUp' | 'openSettings';
/**
 * Manages gamepad button-to-action mappings with localStorage persistence.
 * One button per action — assigning a button removes it from any previous action.
 */
declare class GamepadBindings {
    private bindings;
    constructor();
    getBinding(action: GamepadAction): number;
    getAllBindings(): Record<GamepadAction, number>;
    setBinding(action: GamepadAction, buttonIndex: number): void;
    resetDefaults(): void;
    private load;
    private save;
}

/** Defines the event map for the GamepadController's custom events. */
interface GamepadControllerEventMap extends THREE.Object3DEventMap {
    connected: {
        target: GamepadController;
    };
    disconnected: {
        target: GamepadController;
    };
    selectstart: {
        target: GamepadController;
    };
    selectend: {
        target: GamepadController;
    };
}
/**
 * Simulates an XR controller using a connected gamepad (Xbox/PS).
 * The controller ray always points forward from the camera center,
 * similar to GazeController but with button-driven selection.
 */
declare class GamepadController extends Script<GamepadControllerEventMap> implements Controller {
    static dependencies: {
        camera: typeof THREE.Camera;
    };
    type: string;
    name: string;
    userData: {
        id: number;
        connected: boolean;
        selected: boolean;
    };
    camera?: THREE.Camera;
    bindings: GamepadBindings;
    /** The browser Gamepad object, refreshed each frame. */
    activeGamepad?: Gamepad | null;
    gamepad?: Gamepad;
    /** True if the toast has been shown this session. */
    hasShownToast: boolean;
    /** Callback set by SimulatorInterface for opening settings. */
    onOpenSettings?: () => void;
    /** When true, normal gamepad UI/select actions are suppressed (modal menu). */
    menuActive: boolean;
    private _prevButtons;
    private _risingEdges;
    private _captureCallback;
    constructor();
    init({ camera }: {
        camera: THREE.Camera;
    }): void;
    /**
     * Enters capture mode — the next button press will invoke the callback
     * instead of triggering normal actions, then exit capture mode.
     */
    captureNextButtonPress(callback: (buttonIndex: number) => void): void;
    cancelCapture(): void;
    get captureActive(): boolean;
    updatePose(): void;
    update(): void;
    callSelectStart(): void;
    callSelectEnd(): void;
    connect(): void;
    disconnect(): void;
    /**
     * Returns the axes of the active gamepad with deadzone applied.
     * [leftX, leftY, rightX, rightY]
     */
    getAxes(): [number, number, number, number];
    static applyDeadzone(value: number): number;
    /**
     * Returns the analog value (0..1) of the given button index, or 0 if
     * unbound or no gamepad. Useful for triggers (which expose .value).
     */
    getButtonValue(index: number): number;
    /**
     * Returns the analog values of the left and right triggers (LT, RT) on a
     * standard-mapped gamepad, in [0, 1]. Returns [0, 0] when no gamepad.
     */
    getTriggers(): [number, number];
    /**
     * Returns true if the given button index had a rising edge this frame.
     * Safe to call from any update order — uses pre-computed edges.
     */
    isButtonJustPressed(buttonIndex: number): boolean;
    private _updatePrevButtons;
    private _pollGamepad;
    private _onDisconnect;
}

interface GazeControllerEventMap extends THREE.Object3DEventMap {
    connected: {
        target: GazeController;
    };
    disconnected: {
        target: GazeController;
    };
}
/**
 * Supplies a camera-aligned gaze ray for XR interactions. Interaction owns
 * target resolution and dwell selection.
 * WebXR Eye Tracking is not yet available. This API simulates a reticle
 * at the center of the field of view for simulating gaze-based interaction.
 */
declare class GazeController extends Script<GazeControllerEventMap> implements Controller {
    static dependencies: {
        camera: typeof THREE.Camera;
    };
    /**
     * User data for the controller, including its connection status, unique ID,
     * and selection state.
     */
    userData: {
        connected: boolean;
        id: number;
        selected: boolean;
    };
    /**
     * The visual indicator for where the user is looking.
     */
    reticle: Reticle | undefined;
    camera: THREE.Camera;
    init({ camera }: {
        camera: THREE.Camera;
    }): void;
    /**
     * Syncs the controller with the camera before Input samples its ray.
     */
    updatePose(): void;
    /**
     * Connects the gaze controller to the input system.
     */
    connect(): void;
    /**
     * Disconnects the gaze controller from the input system.
     */
    disconnect(): void;
}

type HeadGestureEventDetail = {
    name: string;
    confidence: number;
    data?: Record<string, unknown>;
};
type HeadGestureEvent = THREE.Event & {
    type: 'gesture';
    target: HeadGestureRecognition;
    detail: HeadGestureEventDetail;
};
interface HeadGestureEventMap extends THREE.Object3DEventMap {
    gesture: HeadGestureEvent;
}

type HeadGestureConfiguration = {
    enabled: boolean;
    /** Detector-specific sensitivity. Built-in heuristics interpret this as radians. */
    threshold?: number;
};
type HeadPoseSample = {
    timestamp: number;
    position: THREE.Vector3;
    orientation: THREE.Quaternion;
};
interface HeadGestureContext {
    readonly samples: readonly HeadPoseSample[];
}
type HeadGestureDetectionResult = {
    confidence: number;
    data?: Record<string, unknown>;
};
type HeadGestureScoreMap = Record<string, HeadGestureDetectionResult | undefined>;
type HeuristicHeadGestureDetector = (context: HeadGestureContext, config: HeadGestureConfiguration) => HeadGestureDetectionResult | undefined;
interface HeadGestureRecognizer {
    init?(): Promise<void>;
    recognize(context: HeadGestureContext): HeadGestureScoreMap | Promise<HeadGestureScoreMap>;
    getGestureConfigurations?(): Record<string, HeadGestureConfiguration>;
    setGestureConfig?(name: string, config: HeadGestureConfiguration): void;
    dispose?(): void;
}

declare class HeadGestureRecognitionOptions {
    enabled: boolean;
    minimumConfidence: number;
    releaseConfidence: number;
    updateIntervalMs: number;
    historyDurationMs: number;
    warmupDurationMs: number;
    maximumSampleGapMs: number;
    maximumSampleAngleRadians: number;
    gestureRecognizer: HeadGestureRecognizer;
    gestures: Record<string, HeadGestureConfiguration>;
    constructor(options?: DeepReadonly<DeepPartial<HeadGestureRecognitionOptions>>);
    enable(): this;
    setGestureEnabled(name: string, enabled: boolean): this;
    setGestureRecognizer(gestureRecognizer: HeadGestureRecognizer): this;
    setGestureConfig(name: string, config: Partial<HeadGestureConfiguration>): this;
    private applyGestureRecognizerConfigurations;
}

declare class HeadGestureRecognition extends Script<HeadGestureEventMap> {
    static dependencies: {
        camera: typeof THREE.Camera;
        options: typeof HeadGestureRecognitionOptions;
    };
    private camera;
    private options;
    private samples;
    private latchedGestures;
    private lastEvaluation;
    private latestTimestamp;
    private pendingRecognition;
    private generation;
    init({ camera, options, }: {
        camera: THREE.Camera;
        options: HeadGestureRecognitionOptions;
    }): Promise<void>;
    update(time?: number): void;
    private captureSample;
    private isDiscontinuity;
    private pruneSamples;
    private evaluate;
    private emitFromScores;
    private emitGesture;
    private resetRecognitionState;
    dispose(): void;
}

/** Defines the event map for the MouseController's custom events. */
interface MouseControllerEventMap extends THREE.Object3DEventMap {
    connected: {
        target: MouseController;
    };
    disconnected: {
        target: MouseController;
    };
    selectstart: {
        target: MouseController;
    };
    selectend: {
        target: MouseController;
    };
}
/**
 * Simulates an XR controller using the mouse for desktop
 * environments. This class translates 2D mouse movements on the screen into a
 * 3D ray in the scene, allowing for point-and-click interactions in a
 * non-immersive context. It functions as a virtual controller that is always
 * aligned with the user's pointer.
 */
declare class MouseController extends Script<MouseControllerEventMap> implements Controller {
    static dependencies: {
        camera: typeof THREE.Camera;
    };
    type: string;
    name: string;
    editorIcon: string;
    /**
     * User data for the controller, including its connection status, unique ID,
     * and selection state (mouse button pressed).
     */
    userData: {
        id: number;
        connected: boolean;
        selected: boolean;
    };
    /** A THREE.Raycaster used to determine the 3D direction of the mouse. */
    raycaster: THREE.Raycaster;
    /** A normalized vector representing the default forward direction. */
    forwardVector: THREE.Vector3;
    /** A reference to the main scene camera. */
    camera?: THREE.Camera;
    private lastNormalizedMouse;
    constructor();
    /**
     * Initialize the MouseController
     */
    init({ camera }: {
        camera: THREE.Camera;
    }): void;
    /** Updates the mouse position/rotation using camera state. */
    updatePose(): void;
    /**
     * The main update loop, called every frame.
     * If connected, it syncs the controller's origin point with the camera's
     * position.
     */
    update(): void;
    /**
     * Updates the controller's transform based on the mouse's position on the
     * screen. This method sets both the position and rotation, ensuring the
     * object has a valid world matrix for raycasting.
     * @param event - The mouse event containing clientX and clientY coordinates.
     */
    updateMousePositionFromEvent(event: MouseEvent): void;
    /**
     * Dispatches a 'selectstart' event, simulating the start of a controller
     * press (e.g., mouse down).
     */
    callSelectStart(): void;
    /**
     * Dispatches a 'selectend' event, simulating the end of a controller press
     * (e.g., mouse up).
     */
    callSelectEnd(): void;
    /**
     * "Connects" the virtual controller, notifying the input system that it is
     * active.
     */
    connect(): void;
    /**
     * "Disconnects" the virtual controller.
     */
    disconnect(): void;
}

/**
 * A node to hold all XR Blocks Systems.
 */
declare class XRSystems extends THREE.Group {
    type: string;
    name: string;
}

declare class ActiveControllers extends THREE.Group {
    type: string;
    name: string;
}
declare class Reticles extends THREE.Group {
    type: string;
    name: string;
}
/**
 * Holds physical input sources and samples their current state each frame.
 */
declare class Input {
    options: Options;
    controllers: Controller[];
    controllerGrips: THREE.Group[];
    hands: THREE.XRHandSpace[];
    /** Completed head gestures, when enabled before initialization. */
    headGestures?: HeadGestureRecognition;
    pivotsEnabled: boolean;
    gazeController: GazeController;
    mouseController: MouseController;
    gamepadController: GamepadController;
    controllersEnabled: boolean;
    listeners: Map<any, any>;
    private dispatchControllerEvent;
    private pinchFilter;
    private releasedControllers;
    private keyDownListeners;
    private keyUpListeners;
    activeControllers: ActiveControllers;
    leftController?: Controller;
    rightController?: Controller;
    reticles: Reticles;
    private ownedReticles;
    private readonly raySourceInputs;
    private readonly raySourceSlots;
    private readonly directTouchInputs;
    private readonly directTouchSlots;
    private readonly interactionFrame;
    /**
     * Initializes physical input sources. Only called by Core.
     */
    init({ systemsGroup, options, renderer, }: {
        systemsGroup: XRSystems;
        options: Options;
        renderer: THREE.WebGLRenderer;
    }): void;
    /**
     * Retrieves the controller object by its ID.
     * @param id - The ID of the controller.
     * @returns The controller with the specified ID.
     */
    get(id: number): THREE.Object3D;
    /**
     * Adds an object to both controllers by creating a new group and cloning it.
     * @param obj - The object to add to each controller.
     */
    addObject(obj: THREE.Object3D): void;
    /**
     * Creates a pivot point for each hand, primarily used as a reference
     * point.
     */
    enablePivots(): void;
    /**
     * Adds reticles to the controllers and scene, with initial visibility set to
     * false.
     */
    addReticles(): void;
    /**
     * Default action to handle the start of a selection, setting the selecting
     * state to true.
     */
    defaultOnSelectStart(event: ControllerEvent): void;
    /**
     * Default action to handle the end of a selection, setting the selecting
     * state to false.
     */
    defaultOnSelectEnd(event: ControllerEvent): void;
    defaultOnSqueezeStart(event: ControllerEvent): void;
    defaultOnSqueezeEnd(event: ControllerEvent): void;
    defaultOnConnected(event: ControllerEvent): void;
    defaultOnDisconnected(event: ControllerEvent): void;
    /**
     * Binds a listener to both controllers.
     * @param listenerName - Event name
     * @param listener - Function to call
     */
    bindListener(listenerName: keyof ControllerEventMap, listener: (event: ControllerEvent) => void): void;
    unbindListener(listenerName: keyof ControllerEventMap, listener: (event: ControllerEvent) => void): void;
    dispatchEvent(event: ControllerEvent): void;
    /**
     * Binds an event listener to handle 'selectstart' events for both
     * controllers.
     * @param event - The event listener function.
     */
    bindSelectStart(event: (event: ControllerEvent) => void): void;
    /**
     * Binds an event listener to handle 'selectend' events for both controllers.
     * @param event - The event listener function.
     */
    bindSelectEnd(event: (event: ControllerEvent) => void): void;
    /**
     * Binds an event listener to handle 'select' events for both controllers.
     * @param event - The event listener function.
     */
    bindSelect(event: (event: ControllerEvent) => void): void;
    /**
     * Binds an event listener to handle 'squeezestart' events for both
     * controllers.
     * @param event - The event listener function.
     */
    bindSqueezeStart(event: (event: ControllerEvent) => void): void;
    /**
     * Binds an event listener to handle 'squeezeend' events for both controllers.
     * @param event - The event listener function.
     */
    bindSqueezeEnd(event: (event: ControllerEvent) => void): void;
    bindSqueeze(event: (event: ControllerEvent) => void): void;
    bindKeyDown(event: (event: KeyEvent) => void): void;
    bindKeyUp(event: (event: KeyEvent) => void): void;
    unbindKeyDown(event: (event: KeyEvent) => void): void;
    unbindKeyUp(event: (event: KeyEvent) => void): void;
    /** Samples current controller, button, and direct-touch state. */
    sampleSources(): void;
    /** Returns the complete physical source state sampled this frame. */
    getFrame(): InteractionFrameInput;
    private getRaySourceType;
    private updateDirectTouchInputs;
    enableGazeController(): void;
    disableGazeController(): void;
    private registerController;
    enableController(controller: Controller): void;
    disableController(controller: Controller): void;
    disableControllers(): void;
    enableControllers(): void;
    dispose(): void;
}

/** Owns all logical target, hover, capture, completion, and cancellation state. */
declare class Interaction {
    private readonly callbacks;
    private readonly manipulation;
    private readonly reticle;
    private readonly reticleOptions;
    private readonly scene?;
    private readonly registry;
    private readonly resolver;
    private readonly directTouch;
    private longSelectDuration;
    private readonly gazeDwell;
    private readonly sourceStates;
    private readonly frameSnapshots;
    private readonly rawIntersections;
    private readonly resolvedRays;
    private readonly hoverPaths;
    private readonly captures;
    private readonly exclusiveControls;
    private readonly touches;
    private readonly suppressedUntilRelease;
    private readonly scaleIntents;
    private raycastMode;
    private frameSources;
    private nextFrameSources;
    constructor(dependencies: InteractionDependencies);
    setLongSelectDuration(seconds: number): void;
    setRaycastMode(mode: RaycastMode): void;
    /** Replaces all sampled physical interaction state for one engine frame. */
    update(frame: InteractionFrameInput, deltaSeconds?: number): void;
    clear(): void;
    registerHitSurface(physical: THREE.Object3D, logical: THREE.Object3D): () => void;
    /** Refreshes bounded direct-touch candidates found by the lifecycle pass. */
    syncTouchCandidates(candidates: Iterable<THREE.Object3D>): void;
    /** Cancels captures that belong to an object before its Script is disposed. */
    cancelObject(object: THREE.Object3D, reason?: SelectionEndReason): void;
    removeSource(controller: Controller, reason?: SelectionEndReason): void;
    getSourceSnapshot(controller: Controller): InteractionSourceState | undefined;
    getResolvedRay(controller: Controller): ResolvedRay | undefined;
    isPointingAt(object: THREE.Object3D): boolean;
    isSelectingAt(object: THREE.Object3D): boolean;
    isHovered(object: THREE.Object3D): boolean;
    getIntersectionAt(object: THREE.Object3D, controller?: Controller): THREE.Intersection | null;
    /** Writes up to two internal cursor points in controller order. */
    writeCursorPointsAt(object: THREE.Object3D, first: THREE.Vector3, second: THREE.Vector3): 0 | 1 | 2;
    isManipulating(object: THREE.Object3D): boolean;
    queueScaleIntent(controller: Controller, factor: number): boolean;
    private applyScaleIntent;
    private updateRay;
    private collectIntersections;
    private beginSelection;
    private startTargetCapture;
    private endSelection;
    private cancelCapture;
    private processTouchContact;
    private updateTouch;
    private finishTouch;
    private dispatchTouchStart;
    private dispatchTouch;
    private createTouchEvent;
    private updateGrab;
    private startGrabManipulation;
    private finishGrab;
    private createGrabEvent;
    private updateSemantic;
    private updateLongSelect;
    private setResolvedRay;
    private clearResolvedRay;
    private updateHoverPath;
    private updateRaySnapshot;
    private updateTouchSnapshot;
    private getSourceState;
    private createSelection;
    private createSelectEvent;
    private hasDeliberateInput;
    private installCapture;
    private detachCapture;
    private runCaptureTransition;
    private cancelFailedCapture;
    private cancelFailedManipulations;
    private runManipulationTransition;
    private invokeSemantic;
}

/**
 * User is an embodied instance to manage hands, controllers, speech, and
 * avatars. It extends Script to update human-world interaction.
 *
 * In the long run, User is to manages avatars, hands, and everything of Human
 * I/O. In third-person view simulation, it should come with an low-poly avatar.
 * To support multi-user social XR planned for future iterations.
 */
declare class User extends Script {
    private static readonly dependencies;
    /**
     * Whether to represent a local user, or another user in a multi-user session.
     */
    local: boolean;
    /**
     * The number of hands associated with the XR user.
     */
    numHands: number;
    /**
     * The height of the user in meters.
     */
    height: number;
    /**
     * The default distance of a UI panel from the user in meters.
     */
    panelDistance: number;
    /**
     * The handedness (primary hand) of the user (0 for left, 1 for right, 2 for
     * both).
     */
    handedness: number;
    /**
     * The radius of the safe space around the user in meters.
     */
    safeSpaceRadius: number;
    /**
     * The distance of a newly spawned object from the user in meters.
     */
    objectDistance: number;
    /**
     * The angle of a newly spawned object from the user in radians.
     */
    objectAngle: number;
    /**
     * An array of pivot objects. Pivot are sphere at the **starting** tip of
     * user's hand / controller / mouse rays for debugging / drawing applications.
     */
    pivots: THREE.Object3D[];
    /**
     * Public data for user interactions, typically holding references to XRHand.
     */
    hands?: Hands;
    input: Input;
    private interaction;
    controllers: Controller[];
    /**
     * Initializes the User.
     */
    init({ input, interaction }: {
        input: Input;
        interaction: Interaction;
    }): void;
    /**
     * Sets the user's height on the first frame.
     * @param camera -
     */
    setHeight(camera: THREE.Camera): void;
    /**
     * Adds pivots at the starting tip of user's hand / controller / mouse rays.
     */
    enablePivots(): void;
    /**
     * Gets the pivot object for a given controller id.
     * @param id - The controller id.
     * @returns The pivot object.
     */
    getPivot(id: number): THREE.Object3D<THREE.Object3DEventMap> | undefined;
    /**
     * Gets the world position of the pivot for a given controller id.
     * @param id - The controller id.
     * @returns The world position of the pivot.
     */
    getPivotPosition(id: number): THREE.Vector3 | undefined;
    getRay(controllerId: number, target?: THREE.Ray): THREE.Ray;
    getRayIntersection(controllerId: number): THREE.Intersection<THREE.Object3D<THREE.Object3DEventMap>> | null;
    /**
     * Checks if any controller is pointing at the given object or its children.
     * @param obj - The object to check against.
     * @returns True if a controller is pointing at the object.
     */
    isPointingAt(obj: THREE.Object3D): boolean;
    /**
     * Checks if any controller is selecting the given object or its children.
     * @param obj - The object to check against.
     * @returns True if a controller is selecting the object.
     */
    isSelectingAt(obj: THREE.Object3D): boolean;
    isManipulating(obj: THREE.Object3D): boolean;
    /**
     * Gets the intersection point on a specific object.
     * @param obj - The object to check for intersection.
     * @param id - The controller ID, or -1 for any controller.
     * @returns The intersection details, or null if no intersection.
     */
    getIntersectionAt(obj: THREE.Object3D, id?: number): THREE.Intersection<THREE.Object3D<THREE.Object3DEventMap>> | null;
    /**
     * Gets the world position of a controller.
     * @param id - The controller id.
     * @param target - The target vector to
     * store the result.
     * @returns The world position of the controller.
     */
    getControllerPosition(id: number, target?: THREE.Vector3): THREE.Vector3;
    /**
     * Calculates the distance between a controller and an object.
     * @param id - The controller id.
     * @param object - The object to measure the distance to.
     * @returns The distance between the controller and the object.
     */
    getControllerObjectDistance(id: number, object: THREE.Object3D): number;
    /**
     * Checks if either controller is selecting.
     * @param id - The controller id. If -1, check both controllers.
     * @returns True if selecting, false otherwise.
     */
    isSelecting(id?: number): any;
    /**
     * Checks if either controller is squeezing.
     * @param id - The controller id. If -1, check both controllers.
     * @returns True if squeezing, false otherwise.
     */
    isSqueezing(id?: number): any;
}

type HandLabel = 'left' | 'right';
declare const HAND_INDEX_TO_LABEL: Partial<Record<Handedness, HandLabel>>;
type JointPositions = Map<JointName, THREE.Vector3>;
interface HandContext {
    handedness: Handedness;
    handLabel: HandLabel;
    joints: JointPositions;
    getJoint(jointName: JointName): THREE.Vector3 | undefined;
}
type GestureDetectionResult = {
    confidence: number;
    data?: Record<string, unknown>;
};
type GestureScoreMap = Record<string, GestureDetectionResult | undefined>;
type HeuristicGestureDetector = (context: HandContext, config: GestureConfiguration) => GestureDetectionResult | undefined;
interface GestureRecognizer {
    init?(): Promise<void>;
    recognize(context: HandContext): GestureScoreMap | Promise<GestureScoreMap>;
    getGestureConfigurations?(): Record<string, GestureConfiguration>;
    dispose?(): void;
}
interface PoseEstimator {
    init?(dependencies?: {
        user?: User;
    }): Promise<void>;
    getHandContext(handedness: Handedness): HandContext | null;
    getHandContexts(): Partial<Record<HandLabel, HandContext>>;
    dispose?(): void;
}

type GestureConfiguration = {
    enabled: boolean;
    threshold?: number;
};
declare class GestureRecognitionOptions {
    enabled: boolean;
    minimumConfidence: number;
    updateIntervalMs: number;
    poseEstimator: PoseEstimator;
    gestureRecognizer: GestureRecognizer;
    gestures: Record<string, GestureConfiguration>;
    constructor(options?: DeepReadonly<DeepPartial<GestureRecognitionOptions>>);
    enable(): this;
    setGestureEnabled(name: string, enabled: boolean): this;
    setPoseEstimator(poseEstimator: PoseEstimator): this;
    setGestureRecognizer(gestureRecognizer: GestureRecognizer): this;
    setGestureConfig(name: string, config: Partial<GestureConfiguration>): this;
    private applyGestureRecognizerConfigurations;
}

type StrokeProvider = 'onedollar';
declare class StrokeRecognitionOptions {
    /** Master switch for the stroke recognition block. */
    enabled: boolean;
    /**
     * Configuration for the stroke recognition provider.
     */
    providerConfig: {
        /**
         * Backing provider that recognizes strokes.
         *  - 'onedollar': $1 Unistroke recognizer.
         */
        provider: StrokeProvider;
        /**
         * Options specific to the 'onedollar' provider.
         */
        onedollar: {
            supportedShapes: string[];
        };
    };
    /**
     * Delay in seconds after gesture start before recording points.
     */
    startDelay: number;
    /**
     * Delay in seconds to ignore points before gesture end.
     */
    endDelay: number;
    /**
     * The hand joint to track for stroke recognition.
     */
    joint: JointName;
    /**
     * Maximum number of points to capture in a single stroke.
     */
    maxPoints: number;
    constructor(options?: DeepReadonly<DeepPartial<StrokeRecognitionOptions>>);
    enable(): this;
}

/**
 * Default options for controlling Lighting module features.
 */
declare class LightingOptions {
    /** Enables debugging renders and logs. */
    debugging: boolean;
    /** Enables XR lighting. */
    enabled: boolean;
    /** Add ambient spherical harmonics to lighting. */
    useAmbientSH: boolean;
    /** Add main diredtional light to lighting. */
    useDirectionalLight: boolean;
    /** Cast shadows using diretional light. */
    castDirectionalLightShadow: boolean;
    /**
     * Adjust hardness of shadows according to relative brightness of main light.
     */
    useDynamicSoftShadow: boolean;
    constructor(options?: DeepReadonly<DeepPartial<LightingOptions>>);
}

type RAPIERCompat = typeof RAPIER_NS & {
    init?: () => Promise<void>;
};
declare class PhysicsOptions {
    /**
     * The target frames per second for the physics simulation loop.
     */
    fps: number;
    /**
     * The global gravity vector applied to the physics world.
     */
    gravity: {
        x: number;
        y: number;
        z: number;
    };
    /**
     * If true, the `Physics` manager will automatically call `world.step()`
     * on its fixed interval. Set to false if you want to control the
     * simulation step manually.
     */
    worldStep: boolean;
    /**
     * If true, an event queue will be created and passed to `world.step()`,
     * enabling the handling of collision and contact events.
     */
    useEventQueue: boolean;
    /**
     * Instance of RAPIER.
     */
    RAPIER?: RAPIERCompat;
}

/**
 * A frozen object containing standardized string values for `event.code`.
 * Used for desktop simulation.
 */
declare enum Keycodes {
    W_CODE = "KeyW",
    A_CODE = "KeyA",
    S_CODE = "KeyS",
    D_CODE = "KeyD",
    UP = "ArrowUp",
    DOWN = "ArrowDown",
    LEFT = "ArrowLeft",
    RIGHT = "ArrowRight",
    Q_CODE = "KeyQ",// Often used for 'down' or 'strafe left'
    E_CODE = "KeyE",// Often used for 'up' or 'strafe right'
    PAGE_UP = "PageUp",
    PAGE_DOWN = "PageDown",
    SPACE_CODE = "Space",
    ENTER_CODE = "Enter",
    T_CODE = "KeyT",// General purpose 'toggle' or 'tool' key
    LEFT_SHIFT_CODE = "ShiftLeft",
    RIGHT_SHIFT_CODE = "ShiftRight",
    LEFT_CTRL_CODE = "ControlLeft",
    RIGHT_CTRL_CODE = "ControlRight",
    LEFT_ALT_CODE = "AltLeft",
    RIGHT_ALT_CODE = "AltRight",
    CAPS_LOCK_CODE = "CapsLock",
    ESCAPE_CODE = "Escape",
    TAB_CODE = "Tab",
    B_CODE = "KeyB",
    C_CODE = "KeyC",
    F_CODE = "KeyF",
    G_CODE = "KeyG",
    H_CODE = "KeyH",
    I_CODE = "KeyI",
    J_CODE = "KeyJ",
    K_CODE = "KeyK",
    L_CODE = "KeyL",
    M_CODE = "KeyM",
    N_CODE = "KeyN",
    O_CODE = "KeyO",
    P_CODE = "KeyP",
    R_CODE = "KeyR",
    U_CODE = "KeyU",
    V_CODE = "KeyV",
    X_CODE = "KeyX",
    Y_CODE = "KeyY",
    Z_CODE = "KeyZ",
    DIGIT_0 = "Digit0",
    DIGIT_1 = "Digit1",
    DIGIT_2 = "Digit2",
    DIGIT_3 = "Digit3",
    DIGIT_4 = "Digit4",
    DIGIT_5 = "Digit5",
    DIGIT_6 = "Digit6",
    DIGIT_7 = "Digit7",
    DIGIT_8 = "Digit8",
    DIGIT_9 = "Digit9",
    BACKQUOTE = "Backquote"
}

declare enum SimulatorMode {
    USER = "User",
    POSE = "Navigation",
    CONTROLLER = "Hands",
    POINTER_LOCK = "PointerLock",
    EDITOR = "Editor"
}
interface SimulatorCustomInstruction {
    header: string;
    videoSrc?: string;
    description: string;
}
interface SimulatorEnvironment {
    /** Optional display name; otherwise the manifest name is used. */
    name?: string;
    manifestPath: string;
}
interface SimulatorHandPhysicsOptions {
    enabled: boolean;
    radius: number;
    mass: number;
    contactOffset: number;
    friction: number;
    restitution: number;
}
declare class SimulatorOptions {
    initialCameraPosition: {
        x: number;
        y: number;
        z: number;
    };
    environments: {
        /** Optional display name; otherwise the manifest name is used. */
        name?: string;
        manifestPath: string;
    }[];
    activeEnvironmentIndex: number;
    defaultMode: SimulatorMode;
    defaultHand: Handedness;
    modeToggle: {
        enabled: boolean;
        toggleKey: Keycodes | null;
        toggleOrder: {
            User: SimulatorMode;
            Navigation: SimulatorMode;
            Hands: SimulatorMode;
            PointerLock: SimulatorMode;
            Editor: SimulatorMode;
        };
    };
    simulatorSettingsPanel: {
        enabled: boolean;
        element: string;
    };
    instructions: {
        enabled: boolean;
        showAutomatically: boolean;
        element: string;
        customInstructions: SimulatorCustomInstruction[];
    };
    handPosePanel: {
        enabled: boolean;
        element: string;
    };
    geminiLivePanel: {
        enabled: boolean;
        element: string;
    };
    stereo: {
        enabled: boolean;
    };
    navMesh: {
        enabled: boolean;
        showDebugVisualizations: boolean;
        eyeHeight: number;
    };
    /** Controls the isolated physics world used by the desktop simulator. */
    physics: {
        enabled: boolean;
    };
    deviceCamera: {
        enabled: boolean;
    };
    renderToRenderTexture: boolean;
    blendingMode: 'normal' | 'screen';
    /** Shoulder/chest origin of the left hand in local camera space. */
    leftHandOrigin: {
        x: number;
        y: number;
        z: number;
    };
    /** Shoulder/chest origin of the right hand in local camera space. */
    rightHandOrigin: {
        x: number;
        y: number;
        z: number;
    };
    /** Optional physical constraints for simulated hands. Requires Rapier. */
    handPhysics: SimulatorHandPhysicsOptions;
    /** Limits how far each hand controller can travel from the user's shoulder origin. */
    reachDistance: {
        enabled: boolean;
        /** The maximum distance in meters a controller can move from its origin point. */
        radius: number;
    };
    /** Limits the angular cone in front of the user within which controllers can move. */
    reachAngle: {
        enabled: boolean;
        /** The maximum full cone angle in radians around the camera's forward direction (default is Math.PI, a front hemisphere). */
        angle: number;
    };
    constructor(options?: DeepReadonly<DeepPartial<SimulatorOptions>>);
}

declare class SpeechSynthesizerOptions {
    enabled: boolean;
    /** If true, a new call to speak() will interrupt any ongoing speech. */
    allowInterruptions: boolean;
}
declare class SpeechRecognizerOptions {
    enabled: boolean;
    /** Recognition language (e.g., 'en-US'). */
    lang: string;
    /** If true, recognition continues after a pause. */
    continuous: boolean;
    /** Keywords to detect as commands. */
    commands: string[];
    /** If true, provides interim results. */
    interimResults: boolean;
    /** Minimum confidence (0-1) for a command. */
    commandConfidenceThreshold: number;
    /** If true, play activation sounds in simulator. */
    playSimulatorActivationSounds: boolean;
}
declare class SoundOptions {
    speechSynthesizer: SpeechSynthesizerOptions;
    speechRecognizer: SpeechRecognizerOptions;
}

declare class MeshDetectionOptions {
    showDebugVisualizations: boolean;
    enabled: boolean;
    constructor(options?: DeepPartial<MeshDetectionOptions>);
    /**
     * Enables the mesh detector.
     */
    enable(): this;
}

/**
 * Configuration options for the ObjectDetector.
 */
declare class ObjectsOptions {
    debugging: boolean;
    enabled: boolean;
    showDebugVisualizations: boolean;
    /** Use simulator ground truth instead of a camera detector on desktop. */
    simulatorOverride: boolean;
    /**
     * Minimum delay in milliseconds between continuous object detection runs.
     * A value of 0 runs again as soon as the previous detection finishes.
     */
    pollingIntervalMs: number;
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
            /**
             * Extra Gemini generation config merged into the per-call config (over
             * the SDK defaults). Use to pin sampling parameters such as
             * `temperature: 0` for deterministic detections.
             */
            generationConfig: Record<string, unknown>;
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
        /** Configuration for MediaPipe backend. */
        mediapipe: {
            wasmFilesUrl: string;
            modelAssetPath: string;
            scoreThreshold: number;
        };
    };
    constructor(options?: DeepPartial<ObjectsOptions>);
    /**
     * Enables the object detector.
     */
    enable(): this;
}

declare class PlanesOptions {
    debugging: boolean;
    enabled: boolean;
    showDebugVisualizations: boolean;
    constructor(options?: DeepPartial<PlanesOptions>);
    enable(): this;
}

declare class SoundsOptions {
    enabled: boolean;
    showDebugInfo: boolean;
    backendConfig: {
        activeBackend: string;
        mediapipe: {
            wasmFilesUrl: string;
            modelAssetPath: string;
            chunkSamples: number;
        };
    };
    constructor(options?: DeepPartial<SoundsOptions>);
    /**
     * Enables sound detection.
     */
    enable(): this;
}

/**
 * Configuration options for the Human Pose Detection system.
 */
declare class HumansOptions {
    enabled: boolean;
    /**
     * Minimum delay in milliseconds between continuous pose detection runs.
     * A value of 0 runs again as soon as the previous detection finishes.
     */
    pollingIntervalMs: number;
    /**
     * Project each landmark onto the depth mesh to find its world position.
     *
     * This is what you want when the people being detected are physically in
     * front of you, since the ray lands on their actual body. Turn it off when
     * the camera is showing someone who is not part of the depth scene, such as a
     * webcam feed on the desktop simulator: every ray would then hit the
     * surrounding geometry instead and the skeleton would be smeared across it.
     * With projection off, landmarks are placed along the view ray at a fixed
     * distance, which keeps the body correctly proportioned.
     */
    useDepthProjection: boolean;
    /**
     * Configuration options for the active pose detection backend.
     */
    backendConfig: {
        activeBackend: string;
        mediapipe: {
            wasmFilesUrl: string;
            modelAssetPath: string;
            /**
             * Run inference in a web worker so a detection pass does not stall the
             * render loop. The worker is limited to the CPU delegate because
             * MediaPipe only creates a GPU surface for a real DOM canvas, so set
             * this to false to trade a blocked main thread for GPU inference.
             * Falls back to the main thread automatically when workers are
             * unavailable.
             */
            useWorker: boolean;
            /**
             * The maximum number of simultaneous human poses/bodies to track.
             */
            numPoses: number;
            /**
             * The minimum confidence score [0.0, 1.0] required for a pose to be detected.
             */
            minPoseDetectionConfidence: number;
            /**
             * The minimum confidence score [0.0, 1.0] required to confirm a pose is still present.
             */
            minPosePresenceConfidence: number;
            /**
             * The minimum confidence score [0.0, 1.0] required for tracking landmarks between frames.
             */
            minTrackingConfidence: number;
        };
    };
    constructor(options?: DeepPartial<HumansOptions>);
    enable(): this;
}

/**
 * Configuration options for the Face Landmark Detection system.
 */
declare class FacesOptions {
    enabled: boolean;
    /**
     * Minimum delay in milliseconds between continuous face detection runs.
     * A value of 0 runs again as soon as the previous detection finishes.
     */
    pollingIntervalMs: number;
    /**
     * Configuration options for the active face detection backend.
     */
    backendConfig: {
        activeBackend: string;
        mediapipe: {
            wasmFilesUrl: string;
            modelAssetPath: string;
            /**
             * The maximum number of simultaneous faces to track.
             */
            numFaces: number;
            /**
             * The minimum confidence score [0.0, 1.0] required for a face to be
             * detected.
             */
            minFaceDetectionConfidence: number;
            /**
             * The minimum confidence score [0.0, 1.0] required to confirm a face is
             * still present.
             */
            minFacePresenceConfidence: number;
            /**
             * The minimum confidence score [0.0, 1.0] required for tracking
             * landmarks between frames.
             */
            minTrackingConfidence: number;
            /**
             * Whether to compute and emit per-face blendshape weights (52
             * ARKit-compatible categories). Required for facial expression
             * mirroring, lipsync feeds, and avatar animation.
             */
            outputFaceBlendshapes: boolean;
            /**
             * Whether to compute and emit the 4x4 facial transformation matrix
             * for each face. Provides a stable rigid head pose for parenting
             * objects to the head (glasses, masks, hats).
             */
            outputFacialTransformationMatrixes: boolean;
        };
    };
    constructor(options?: DeepPartial<FacesOptions>);
    enable(): this;
}

/**
 * Configuration options for the semantic segmentation system. Mirrors the
 * other `world/*` perception options (humans, faces, objects).
 */
declare class SegmentationOptions {
    enabled: boolean;
    /**
     * Minimum delay in milliseconds between continuous segmentation runs.
     * A value of 0 runs again as soon as the previous inference finishes.
     * Defaults to 66 (~15 fps), the rate the magic_window grab loop used before
     * segmentation moved onto its own polling loop.
     */
    pollingIntervalMs: number;
    /**
     * Configuration options for the active segmentation backend.
     */
    backendConfig: {
        activeBackend: string;
        mediapipe: {
            wasmFilesUrl: string;
            modelAssetPath: string;
            /**
             * Output the per-pixel category mask. Required to produce a
             * {@link SegmentationMask}.
             */
            outputCategoryMask: boolean;
        };
    };
    constructor(options?: DeepPartial<SegmentationOptions>);
    enable(): this;
}

/**
 * Builds the default storage key for a page.
 *
 * Scoped to the path because anchors are stored per origin: two apps served
 * from one host would otherwise restore each other's anchors, which reads as
 * mysterious content appearing on first run rather than as a shared store.
 *
 * @param pathname - Page path; omit when there is no document.
 * @returns The storage key to default to.
 */
declare function defaultAnchorStorageKey(pathname?: string): string;
/**
 * Configuration for the spatial anchor subsystem.
 *
 * Anchors pin content to a real place so the platform keeps it there as its
 * understanding of the room improves. With {@link AnchorsOptions.persistent}
 * enabled, anchor handles are saved so the same content can be restored in a
 * later session.
 */
declare class AnchorsOptions {
    /** Logs anchor lifecycle transitions. */
    debugging: boolean;
    /** Whether the anchor subsystem is created at all. */
    enabled: boolean;
    /**
     * Whether anchor handles are saved so they can be restored in a later
     * session. Requires platform support for persistent handles; when the
     * platform only offers session-scoped anchors this degrades to in-session
     * behaviour rather than failing.
     */
    persistent: boolean;
    /**
     * Whether to hold poses locally when the platform has no anchor support.
     *
     * Off by default: on a real headset a silent stand-in would look like
     * working anchors while nothing is actually pinned. Demos and desktop
     * development opt in deliberately.
     */
    simulatorFallback: boolean;
    /**
     * Storage key used when persistence is enabled.
     *
     * Defaults to a page-scoped key. Set it explicitly to share anchors between
     * pages, or to keep a stable key if the app might move path.
     */
    storageKey: string;
    /**
     * Upper bound on saved handles. Persistent handles accumulate across
     * sessions and would otherwise grow without limit; the oldest are evicted
     * first once the cap is reached.
     */
    maxStoredAnchors: number;
    constructor(options?: DeepPartial<AnchorsOptions>);
    /**
     * Enables anchors.
     * @returns This options object, for chaining.
     */
    enable(): this;
    /**
     * Enables anchors and saves handles for restoration in later sessions.
     * @returns This options object, for chaining.
     */
    enablePersistence(): this;
}

declare class WorldOptions {
    debugging: boolean;
    enabled: boolean;
    initiateRoomCapture: boolean;
    planes: PlanesOptions;
    objects: ObjectsOptions;
    meshes: MeshDetectionOptions;
    sounds: SoundsOptions;
    humans: HumansOptions;
    faces: FacesOptions;
    segmentation: SegmentationOptions;
    anchors: AnchorsOptions;
    constructor(options?: DeepPartial<WorldOptions>);
    /**
     * Enables plane detection.
     */
    enablePlaneDetection(): this;
    /**
     * Enables object detection.
     */
    enableObjectDetection(): this;
    /**
     * Enables mesh detection.
     */
    enableMeshDetection(): this;
    /**
     * Enables spatial anchors.
     */
    enableAnchors(): this;
    /**
     * Enables spatial anchors and saves their handles so anchored content can be
     * restored in a later session.
     */
    enableAnchorPersistence(): this;
    /**
     * Enables sound detection.
     */
    enableSoundDetection(): this;
    /**
     * Enables human detection.
     */
    enableHumanDetection(): this;
    /**
     * Enables face landmark detection.
     */
    enableFaceDetection(): this;
    /**
     * Enables semantic segmentation (person / background category masks).
     */
    enableSegmentation(): this;
}

/**
 * Default options for XR controllers, which encompass hands by default in
 * Android XR, mouse input on desktop, tracked controllers, and gamepads.
 */
declare class InputOptions {
    /** Whether controller input is enabled. */
    enabled: boolean;
    /** Whether mouse input should act as a controller on desktop. */
    enabledMouse: boolean;
    /** Whether to enable debugging features for controllers. */
    debug: boolean;
    /** Whether to show controller models. */
    visualization: boolean;
    /** Whether to show the ray lines extending from the controllers. */
    visualizeRays: boolean;
}
/**
 * Default options for the reticle (pointing cursor).
 */
declare class ReticleOptions {
    enabled: boolean;
    /** Whether reticles use the real-world depth mesh as a surface. */
    projectOnDepthMesh: boolean;
    /**
     * Maximum reticle drawing distance in meters. It does not limit targeting.
     */
    maxDistance?: number;
    /**
     * Distance in meters at which to render the reticle when no valid hit is
     * found. Set to 0 to hide the reticle on a miss.
     */
    defaultRenderDistance: number;
}
type RaycastMode = 'continuous' | 'select';
declare class InteractionOptions {
    /** When to sample ray intersections for interaction. */
    raycastMode: RaycastMode;
    /** Seconds a stable object selection must be held before long-select. */
    longSelectDuration: number;
}
/**
 * Options for the XR transition effect.
 */
declare class XRTransitionOptions {
    /** Whether the transition effect is enabled. */
    enabled: boolean;
    /** The duration of the transition in seconds. */
    transitionTime: number;
    /** The default background color for VR transitions. */
    defaultBackgroundColor: number;
}
declare const FORM_FACTORS: readonly ["auto", "xr", "hud", "vr", "desktop", "mobile"];
type FormFactor = (typeof FORM_FACTORS)[number];
type AutomationModeOptions = {
    hideSimulatorUi?: boolean;
    defaultHand?: Handedness;
    defaultMode?: SimulatorMode;
    enableHands?: boolean;
    enableCamera?: boolean;
};
/**
 * A central configuration class for the entire XR Blocks system. It aggregates
 * all settings and provides chainable methods for enabling common features.
 */
declare class Options {
    /**
     * Whether to use antialiasing.
     */
    antialias: boolean;
    /**
     * Whether to use a logarithmic depth buffer. Useful for depth-aware
     * occlusions.
     */
    logarithmicDepthBuffer: boolean;
    /**
     * Global flag for enabling various debugging features.
     */
    debugging: boolean;
    /**
     * Whether to request a stencil buffer.
     */
    stencil: boolean;
    /**
     * Canvas element to use for rendering.
     * If not defined, a new element will be added to document body.
     */
    canvas?: HTMLCanvasElement;
    /**
     * Any additional required features when initializing webxr.
     */
    webxrRequiredFeatures: string[];
    /**
     * Any additional optional features when initializing webxr.
     */
    webxrOptionalFeatures: string[];
    referenceSpaceType: XRReferenceSpaceType;
    controllers: InputOptions;
    depth: DepthOptions;
    lighting: LightingOptions;
    deviceCamera: DeviceCameraOptions;
    hands: HandsOptions;
    gestures: GestureRecognitionOptions;
    headGestures: HeadGestureRecognitionOptions;
    strokes: StrokeRecognitionOptions;
    reticles: ReticleOptions;
    interaction: InteractionOptions;
    sound: SoundOptions;
    ai: AIOptions;
    simulator: SimulatorOptions;
    world: WorldOptions;
    context: ContextOptions;
    physics: PhysicsOptions;
    transition: XRTransitionOptions;
    camera: {
        near: number;
        far: number;
    };
    /**
     * Whether to use post-processing effects.
     */
    usePostprocessing: boolean;
    enableSimulator: boolean;
    /**
     * Whether to catch all exceptions thrown by developer scripts in the main update loop
     * and physics step, and log them using console.error instead of crashing the application.
     * When enabled, exceptions in one script will not prevent other scripts or subsystems from updating.
     */
    catchScriptExceptions: boolean;
    /**
     * Configuration for the XR session button.
     */
    xrButton: {
        appTitle: string;
        appDescription: string;
        enabled: boolean;
        startText: string;
        endText: string;
        invalidText: string;
        startSimulatorText: string;
        showEnterSimulatorButton: boolean;
        alwaysAutostartSimulator: boolean;
    };
    /**
     * Which permissions to request before entering the XR session.
     */
    permissions: {
        geolocation: boolean;
        camera: boolean;
        microphone: boolean;
    };
    xrSessionMode: XRSessionMode;
    private _formFactor;
    get formFactor(): FormFactor;
    /**
     * Form factor is a preset that configures the experience for a specific
     * device type. Currently it only controls whether the simulator is enabled
     * and should always be autostarted.
     */
    set formFactor(formFactor: FormFactor);
    /**
     * Constructs the Options object by merging default values with provided
     * custom options.
     * @param options - A custom options object to override the defaults.
     */
    constructor(options?: DeepReadonly<DeepPartial<Options>>);
    protected parseUrlParams(): void;
    /**
     * Sets the session mode to VR and disables the simulator passthrough scene.
     */
    enableVR(): this;
    /**
     * Enables a standard simulator-driven setup for automation and external test
     * harnesses.
     * @returns The instance for chaining.
     */
    enableAutomationMode(config?: AutomationModeOptions): this;
    /**
     * Enables reticles for visualizing targets of hand rays in WebXR.
     * @returns The instance for chaining.
     */
    enableReticles(): this;
    /**
     * Enables depth sensing in WebXR with default options.
     * @returns The instance for chaining.
     */
    enableDepth(): this;
    /**
     * Enables plane detection.
     * @returns The instance for chaining.
     */
    enablePlaneDetection(): this;
    /**
     * Enables object detection.
     * @returns The instance for chaining.
     */
    enableObjectDetection(): this;
    /**
     * Enables human pose detection.
     * @returns The instance for chaining.
     */
    enableHumanDetection(): this;
    /**
     * Enables face landmark detection. Provides 478 per-face landmarks in
     * world space, optional 52 ARKit-style blendshape weights, and an
     * optional rigid 4x4 facial transformation matrix per detected face.
     * @returns The instance for chaining.
     */
    enableFaceDetection(): this;
    /**
     * Enables semantic segmentation. Produces per-pixel person / background
     * category masks from the device camera (MediaPipe, on-device). Unlike face
     * and human detection it does not require depth.
     * @returns The instance for chaining.
     */
    enableSegmentation(): this;
    /**
     * Enables device camera (passthrough) with a specific facing mode.
     * @param facingMode - The desired camera facing mode, either 'environment' or
     *     'user'.
     * @returns The instance for chaining.
     */
    enableCamera(facingMode?: 'environment' | 'user'): this;
    /**
     * Enables hand tracking.
     * @returns The instance for chaining.
     */
    enableHands(): this;
    /**
     * Enables the gesture recognition block and ensures hands are available.
     * @returns The instance for chaining.
     */
    enableGestures(): this;
    /**
     * Enables completed nod and shake recognition from the user's head pose.
     * @returns The instance for chaining.
     */
    enableHeadGestures(): this;
    /**
     * Enables the stroke recognition block and ensures gestures are available.
     * @returns The instance for chaining.
     */
    enableStrokes(): this;
    /**
     * Enables the visualization of rays for hand tracking.
     * @returns The instance for chaining.
     */
    enableHandRays(): this;
    /**
     * Enables a standard set of AI features, including Gemini Live.
     * @returns The instance for chaining.
     */
    enableAI(): this;
    /**
     * Enables agent-facing context detectors such as semantic trees,
     * view visibility, and Set-of-Mark observations.
     * @returns The instance for chaining.
     */
    enableContext(): this;
    /**
     * Enables agent-facing scene context.
     * @returns The instance for chaining.
     */
    enableSceneContext(): this;
    /**
     * Enables agent-facing visible objects context.
     * @returns The instance for chaining.
     */
    enableVisibleObjectsContext(): this;
    /**
     * Enables agent-facing Set-of-Mark context.
     * @returns The instance for chaining.
     */
    enableSetOfMarkContext(): this;
    /**
     * Enables the XR transition component for toggling VR.
     * @returns The instance for chaining.
     */
    enableXRTransitions(): this;
    /**
     * Enables input from hands and controllers.
     * Note that this is enabled by default and can also be changed at runtime with
     * xb.core.input.enableControllers() and xb.core.input.disableControllers().
     * @returns The instance for chaining.
     */
    enableControllers(): this;
    /**
     * Sets the title of the app to be displayed above the XR button.
     * @param title - The title of the app.
     * @returns The instance for chaining.
     */
    setAppTitle(title: string): this;
    /**
     * Sets the description of the app to be displayed above the XR button.
     * @param description - The description of the app.
     * @returns The instance for chaining.
     */
    setAppDescription(description: string): this;
}

type FaceCameraMode = 'capsule' | 'cylindrical' | 'spherical';

declare const ManipulationAction: {
    readonly Translate: "translate";
    readonly Rotate: "rotate";
    readonly Scale: "scale";
    readonly None: "none";
};
type ManipulationAction = (typeof ManipulationAction)[keyof typeof ManipulationAction];
interface TranslateOptions {
    faceCamera?: boolean;
    /** Camera-facing rotation mode used while translating. */
    mode?: FaceCameraMode;
    /** Half-height of the upright region used by capsule mode, in meters. */
    capsuleHalfHeight?: number;
    /** Camera-facing rotation smoothing, matching `FaceCamera`. */
    smoothing?: number;
}
interface RotateOptions {
    axis?: 'x' | 'y' | 'z' | THREE.Vector3Like;
    space?: 'local' | 'world';
    sensitivity?: number;
}
interface ScaleOptions {
    minScale?: number | THREE.Vector3Like;
    maxScale?: number | THREE.Vector3Like;
}
interface ManipulationHandleOptions {
    action?: typeof ManipulationAction.Translate | typeof ManipulationAction.Rotate | typeof ManipulationAction.Scale | typeof ManipulationAction.None;
}
interface ManipulationOptions {
    actions?: {
        translate?: boolean | TranslateOptions;
        rotate?: boolean | RotateOptions;
        scale?: boolean | ScaleOptions;
    };
    handle?: ManipulationHandleOptions;
}
type ManipulationPhase = 'start' | 'update' | 'end' | 'cancel';
interface BaseManipulationEvent {
    readonly phase: ManipulationPhase;
    readonly action: ManipulationAction;
    readonly source: InteractionSource;
    readonly sources: readonly InteractionSource[];
    readonly target: THREE.Object3D;
    readonly surface: THREE.Object3D;
    readonly owner: THREE.Object3D;
    readonly currentTarget: Script;
    readonly defaultPrevented: boolean;
    preventDefault(): void;
    stopPropagation(): void;
}
interface TranslateManipulationEvent extends BaseManipulationEvent {
    readonly action: typeof ManipulationAction.Translate;
    readonly point: THREE.Vector3;
    readonly delta: THREE.Vector3;
    readonly position: THREE.Vector3;
    readonly worldPosition: THREE.Vector3;
}
interface RotateManipulationEvent extends BaseManipulationEvent {
    readonly action: typeof ManipulationAction.Rotate;
    readonly angle: number;
    readonly quaternion: THREE.Quaternion;
}
interface ScaleManipulationEvent extends BaseManipulationEvent {
    readonly action: typeof ManipulationAction.Scale;
    readonly factor: number;
    readonly center: THREE.Vector3;
    readonly scale: THREE.Vector3;
}
type ManipulationEvent = TranslateManipulationEvent | RotateManipulationEvent | ScaleManipulationEvent;

type PointerEvents = 'auto' | 'none';
type ReticleMode = 'auto' | 'surface' | 'hidden';
interface XBObjectOptions {
    /** Whether this object and its descendants participate in pointer hits. */
    pointerEvents?: PointerEvents;
    interactionEnabled?: boolean;
    reticleMode?: ReticleMode;
    manipulation?: boolean | ManipulationOptions;
    manipulationHandle?: ManipulationHandleOptions | 'none';
}
declare module 'three' {
    interface Object3D {
        xb?: XBObjectOptions;
    }
}
type InteractionSourceType = 'mouse' | 'controller-ray' | 'hand-ray' | 'direct-touch' | 'gaze' | 'simulator';
type RaySourceType = Exclude<InteractionSourceType, 'direct-touch'>;
interface InteractionSource {
    readonly type: InteractionSourceType;
    readonly handedness: 'left' | 'right' | 'none';
    readonly controller: Controller;
}
interface RaySourceInput {
    controller: Controller;
    sourceType: RaySourceType;
    ray: THREE.Ray;
    /** Optional raw hits supplied by an isolated Interaction adapter. */
    intersections?: readonly THREE.Intersection[];
    selected: boolean;
    released?: boolean;
    position?: THREE.Vector3;
    orientation?: THREE.Quaternion;
}
interface DirectTouchInput {
    controller: Controller;
    handIndex: number;
    hand?: THREE.Object3D;
    point: THREE.Vector3;
    selected: boolean;
    orientation?: THREE.Quaternion;
}
/** All physical interaction input sampled for one engine frame. */
interface InteractionFrameInput {
    readonly raySources: readonly RaySourceInput[];
    readonly directTouches: readonly DirectTouchInput[];
}
/** Mutable internal storage for one controller's current logical source. */
declare class InteractionSourceState {
    readonly controller: Controller;
    source: InteractionSource;
    sourceType: InteractionSourceType;
    readonly position: THREE.Vector3;
    readonly orientation: THREE.Quaternion;
    private readonly rayValue;
    ray?: THREE.Ray;
    selected: boolean;
    selectionProgress?: number;
    constructor(controller: Controller);
    updateRay(input: RaySourceInput): this;
    updateTouch(point: THREE.Vector3, orientation?: THREE.Quaternion): this;
    copyFrom(source: InteractionSourceState): this;
}
interface ResolvedRay {
    readonly intersection: THREE.Intersection;
    /** Physical object that supplied the hit geometry. */
    readonly hitObject: THREE.Object3D;
    /** Public object that owns the hit. */
    readonly surface: THREE.Object3D;
    readonly target?: THREE.Object3D;
    readonly scriptPath: readonly Script[];
    readonly objectPath: readonly THREE.Object3D[];
    readonly reticleMode: ReticleMode;
    readonly semanticControl?: THREE.Object3D;
    readonly manipulation?: ManipulationResolution;
}
type ResolvedManipulationAction = Exclude<ManipulationAction, 'none'>;
interface ManipulationResolution {
    readonly owner: THREE.Object3D;
    readonly action?: ResolvedManipulationAction;
    readonly handle?: THREE.Object3D;
}
type TargetedInteractionHook = 'onObjectSelectStart' | 'onObjectSelectEnd' | 'onObjectLongSelect' | 'onObjectTouchStart' | 'onObjectTouching' | 'onObjectTouchEnd' | 'onObjectGrabStart' | 'onObjectGrabbing' | 'onObjectGrabEnd' | 'onHoverEnter' | 'onHovering' | 'onHoverExit';
type GlobalInteractionHook = 'onSelectStart' | 'onSelecting' | 'onSelect' | 'onSelectEnd' | 'onLongSelect';
type GlobalInteractionEvent<Hook extends GlobalInteractionHook> = Hook extends 'onSelectEnd' ? SelectEndEvent : Hook extends 'onLongSelect' ? LongSelectEvent : SelectEvent;
/**
 * The only Script-facing seam. The implementation applies the existing Script
 * exception policy to each invocation.
 */
interface InteractionCallbackDispatch {
    isScript(object: THREE.Object3D): boolean;
    hasTargetHandler(object: THREE.Object3D, sourceType: InteractionSourceType): boolean;
    hasTargetHook(object: THREE.Object3D, hook: TargetedInteractionHook): boolean;
    invokeTarget(script: THREE.Object3D, hook: TargetedInteractionHook, argument: unknown): void;
    invokeSemantic(object: THREE.Object3D, callback: () => void): void;
    invokeGlobal<Hook extends GlobalInteractionHook>(hook: Hook, event: GlobalInteractionEvent<Hook>): void;
    invokeManipulation(script: Script, event: ManipulationEvent): void;
}
interface ReticlePresentationObserver {
    present(snapshot: InteractionSourceState, resolved: ResolvedRay | undefined): void;
    clear(controller: Controller): void;
}
interface InteractionDependencies {
    callbacks: InteractionCallbackDispatch;
    scene?: THREE.Scene;
    raycastMode?: RaycastMode;
    camera?: THREE.Camera;
    timer?: THREE.Timer;
    reticle?: ReticlePresentationObserver;
    reticleOptions?: ReticleOptions;
    longSelectDuration?: number;
}

/**
 * Integrates the RAPIER physics engine into the XRCore lifecycle.
 * It sets up the physics in a blended world that combines virtual and physical
 * objects, steps the simulation forward in sync with the application's
 * framerate, and manages the lifecycle of physics-related objects.
 */
declare class Physics {
    initialized: boolean;
    options?: PhysicsOptions;
    RAPIER: RAPIERCompat;
    fps: number;
    blendedWorld: RAPIER_NS.World;
    eventQueue: RAPIER_NS.EventQueue;
    get timestep(): number;
    /**
     * Asynchronously initializes the RAPIER physics engine and creates the
     * blendedWorld. This is called in Core before the physics simulation starts.
     */
    init({ physicsOptions }: {
        physicsOptions: PhysicsOptions;
    }): Promise<void>;
    /**
     * Advances the physics simulation by one step.
     */
    physicsStep(): void;
    /**
     * Frees the memory allocated by the RAPIER physics blendedWorld and event
     * queue. This is crucial for preventing memory leaks when the XR session
     * ends.
     */
    dispose(): void;
}

interface SelectEvent {
    readonly source: InteractionSource;
    readonly target?: THREE.Object3D;
    readonly currentTarget?: Script;
    /** Public hit surface. Private renderer meshes are normalized to their owner. */
    readonly surface?: THREE.Object3D;
    /** Current ray intersection on `surface`, when the source still hits it. */
    readonly intersection?: THREE.Intersection;
    stopPropagation(): void;
}
type SelectionEndReason = 'released' | 'released-outside' | 'source-lost' | 'pointer-cancel' | 'removed' | 'hidden' | 'disabled';
interface SelectEndEvent extends SelectEvent {
    readonly completed: boolean;
    readonly reason: SelectionEndReason;
}
/** Event sent after a captured selection is held past the long-select delay. */
interface LongSelectEvent extends SelectEvent {
    /** How long the selection has been held, in seconds. */
    duration: number;
}
interface ObjectTouchEvent {
    readonly source: InteractionSource;
    readonly target: THREE.Object3D;
    readonly currentTarget?: Script;
    /** Public contact surface. Private renderer meshes are normalized to it. */
    readonly surface: THREE.Object3D;
    readonly handIndex: number;
    readonly hand?: THREE.Object3D;
    readonly touchPosition: THREE.Vector3;
    stopPropagation(): void;
}
interface ObjectTouchStartEvent extends ObjectTouchEvent {
    readonly defaultPrevented: boolean;
    preventDefault(): void;
}
interface ObjectGrabEvent {
    readonly source: InteractionSource;
    readonly target: THREE.Object3D;
    readonly currentTarget?: Script;
    /** Public contact surface. Private renderer meshes are normalized to it. */
    readonly surface: THREE.Object3D;
    readonly handIndex: number;
    readonly hand: THREE.Object3D;
    readonly touchPosition: THREE.Vector3;
    stopPropagation(): void;
}
interface HoverEvent extends SelectEvent {
    readonly intersection?: THREE.Intersection;
}
interface KeyEvent {
    code: string;
}
/**
 * The Script class facilities development by providing useful life cycle
 * functions similar to MonoBehaviors in Unity.
 *
 * Each Script object is an independent THREE.Object3D entity within the
 * scene graph.
 *
 * See /docs/manual/Scripts.md for the full documentation.
 *
 * It manages user, objects, and interaction between user and objects.
 * See `/templates/00_basic/` for an example to start with.
 * # Supported interaction functions to extend:
 *
 * onSelectStart(event)
 * onSelectEnd(event)
 *
 */
declare function ScriptMixin<TBase extends Constructor<THREE.Object3D>>(base: TBase): {
    new (...args: any[]): {
        isXRScript: boolean;
        /**
         * Initializes an instance with XR controllers, grips, hands, and default
         * options. We allow all scripts to quickly access its user (e.g.,
         * user.isSelecting(), user.hands), world (e.g., physical depth mesh,
         * lighting estimation, and recognized objects), and scene (the root of
         * three.js's scene graph). If this returns a promise, we will wait for it.
         */
        init(_?: object): void | Promise<void>;
        /**
         * Runs per frame.
         */
        update(_time?: number, _frame?: XRFrame): void;
        /**
         * Enables depth-aware interactions with physics. See /samples/advanced/ballpit
         */
        initPhysics(_physics: Physics): void | Promise<void>;
        physicsStep(): void;
        onXRSessionStarted(_session?: XRSession): void;
        onXRSessionEnded(): void;
        onSimulatorStarted(): void;
        /**
         * Called whenever pinch / mouse click starts, globally.
         * @param _event - The interaction source and optional captured target.
         */
        onSelectStart(_event: SelectEvent): void;
        /**
         * Called whenever pinch / mouse click discontinues, globally.
         * @param _event - The completed state and end reason.
         */
        onSelectEnd(_event: SelectEndEvent): void;
        /**
         * Called whenever pinch / mouse click successfully completes, globally.
         * @param _event - The interaction source and completed target.
         */
        onSelect(_event: SelectEvent): void;
        /**
         * Called whenever pinch / mouse click is happening, globally.
         */
        onSelecting(_event: SelectEvent): void;
        /** Called when an object selection reaches the long-select delay. */
        onLongSelect(_event: LongSelectEvent): void;
        /**
         * Called on keyboard keypress.
         * @param _event - Event containing `.code` to read the keyboard key.
         */
        onKeyDown(_event: KeyEvent): void;
        onKeyUp(_event: KeyEvent): void;
        /**
         * Called whenever gamepad trigger starts, globally.
         * @param _event - `event.source.controller` identifies the controller.
         */
        onSqueezeStart(_event: SelectEvent): void;
        /**
         * Called whenever gamepad trigger stops, globally.
         * @param _event - `event.source.controller` identifies the controller.
         */
        onSqueezeEnd(_event: SelectEvent): void;
        /**
         * Called whenever gamepad is being triggered, globally.
         */
        onSqueezing(_event: SelectEvent): void;
        /**
         * Called whenever gamepad trigger successfully completes, globally.
         * @param _event - `event.source.controller` identifies the controller.
         */
        onSqueeze(_event: SelectEvent): void;
        /**
         * Called when a source starts selecting the object this Script represents.
         * @param _event - `event.target` is the logical object and
         * `event.source.controller` identifies the controller.
         * Call `event.stopPropagation()` to stop bubbling to ancestor Scripts.
         */
        onObjectSelectStart(_event: SelectEvent): void;
        /**
         * Called when a source stops selecting the object this Script represents.
         * @param _event - The completed state and end reason.
         * Call `event.stopPropagation()` to stop bubbling to ancestor Scripts.
         */
        onObjectSelectEnd(_event: SelectEndEvent): void;
        /**
         * Called once when a captured selection is held for the long-select delay.
         * Manipulation captures do not emit this callback.
         * @param _event - The controller and completed hold duration.
         * Call `event.stopPropagation()` to stop bubbling to ancestor Scripts.
         */
        onObjectLongSelect(_event: LongSelectEvent): void;
        /**
         * Called for each phase of an automatic object manipulation. Call
         * `event.stopPropagation()` to stop bubbling. Calling `preventDefault()`
         * on a start event suppresses the automatic action.
         */
        onObjectManipulate(_event: ManipulationEvent): void;
        /**
         * Called when a source starts hovering over this object.
         * @param _event - The hover source, target, surface, and intersection.
         * Call `event.stopPropagation()` to stop bubbling to ancestor Scripts.
         */
        onHoverEnter(_event: HoverEvent): void;
        /**
         * Called when a source stops hovering over this object.
         * @param _event - The hover source, target, surface, and intersection.
         * Call `event.stopPropagation()` to stop bubbling to ancestor Scripts.
         */
        onHoverExit(_event: HoverEvent): void;
        /**
         * Called while a source hovers over this object.
         * @param _event - The hover source, target, surface, and intersection.
         * Call `event.stopPropagation()` to stop bubbling to ancestor Scripts.
         */
        onHovering(_event: HoverEvent): void;
        /**
         * Called when a hand's index finger starts touching this object.
         * Direct touch starts the object's selection lifecycle by default. Call
         * `event.preventDefault()` to handle contact without selecting.
         */
        onObjectTouchStart(_event: ObjectTouchStartEvent): void;
        /**
         * Called every frame that a hand's index finger is touching this object.
         * The object remains selected during these frames unless touch selection
         * was prevented when contact started.
         */
        onObjectTouching(_event: ObjectTouchEvent): void;
        /**
         * Called when a hand's index finger stops touching this object.
         * This ends the default selection lifecycle after the touch callback.
         */
        onObjectTouchEnd(_event: ObjectTouchEvent): void;
        /**
         * Called when a hand starts grabbing this object (touching + pinching).
         * A grab starts built-in direct-touch manipulation when enabled.
         */
        onObjectGrabStart(_event: ObjectGrabEvent): void;
        /**
         * Called every frame a hand is grabbing this object.
         */
        onObjectGrabbing(_event: ObjectGrabEvent): void;
        /**
         * Called when a hand stops grabbing this object.
         * This ends built-in direct-touch manipulation without ending contact.
         */
        onObjectGrabEnd(_event: ObjectGrabEvent): void;
        /**
         * Called when the script is removed from the scene. Opposite of init.
         */
        dispose(): void;
        readonly isObject3D: true;
        readonly id: number;
        uuid: string;
        name: string;
        readonly type: string;
        parent: THREE.Object3D | null;
        children: THREE.Object3D[];
        up: THREE.Vector3;
        readonly position: THREE.Vector3;
        readonly rotation: THREE.Euler;
        readonly quaternion: THREE.Quaternion;
        readonly scale: THREE.Vector3;
        readonly modelViewMatrix: THREE.Matrix4;
        readonly normalMatrix: THREE.Matrix3;
        matrix: THREE.Matrix4;
        matrixWorld: THREE.Matrix4;
        matrixAutoUpdate: boolean;
        matrixWorldAutoUpdate: boolean;
        matrixWorldNeedsUpdate: boolean;
        layers: THREE.Layers;
        visible: boolean;
        castShadow: boolean;
        receiveShadow: boolean;
        frustumCulled: boolean;
        renderOrder: number;
        animations: THREE.AnimationClip[];
        customDepthMaterial?: THREE.Material | undefined;
        customDistanceMaterial?: THREE.Material | undefined;
        static: boolean;
        userData: Record<string, any>;
        pivot: THREE.Vector3 | null;
        onBeforeShadow(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, shadowCamera: THREE.Camera, geometry: THREE.BufferGeometry, depthMaterial: THREE.Material, group: THREE.Group): void;
        onAfterShadow(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, shadowCamera: THREE.Camera, geometry: THREE.BufferGeometry, depthMaterial: THREE.Material, group: THREE.Group): void;
        onBeforeRender(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, geometry: THREE.BufferGeometry, material: THREE.Material, group: THREE.Group): void;
        onAfterRender(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, geometry: THREE.BufferGeometry, material: THREE.Material, group: THREE.Group): void;
        applyMatrix4(matrix: THREE.Matrix4): void;
        applyQuaternion(quaternion: THREE.Quaternion): /*elided*/ any;
        setRotationFromAxisAngle(axis: THREE.Vector3, angle: number): void;
        setRotationFromEuler(euler: THREE.Euler): void;
        setRotationFromMatrix(m: THREE.Matrix4): void;
        setRotationFromQuaternion(q: THREE.Quaternion): void;
        rotateOnAxis(axis: THREE.Vector3, angle: number): /*elided*/ any;
        rotateOnWorldAxis(axis: THREE.Vector3, angle: number): /*elided*/ any;
        rotateX(angle: number): /*elided*/ any;
        rotateY(angle: number): /*elided*/ any;
        rotateZ(angle: number): /*elided*/ any;
        translateOnAxis(axis: THREE.Vector3, distance: number): /*elided*/ any;
        translateX(distance: number): /*elided*/ any;
        translateY(distance: number): /*elided*/ any;
        translateZ(distance: number): /*elided*/ any;
        localToWorld(vector: THREE.Vector3): THREE.Vector3;
        worldToLocal(vector: THREE.Vector3): THREE.Vector3;
        lookAt(vector: THREE.Vector3): void;
        lookAt(x: number, y: number, z: number): void;
        add(...object: THREE.Object3D[]): /*elided*/ any;
        remove(...object: THREE.Object3D[]): /*elided*/ any;
        removeFromParent(): /*elided*/ any;
        clear(): /*elided*/ any;
        attach(object: THREE.Object3D): /*elided*/ any;
        getObjectById(id: number): THREE.Object3D | undefined;
        getObjectByName(name: string): THREE.Object3D | undefined;
        getObjectByProperty(name: string, value: any): THREE.Object3D | undefined;
        getObjectsByProperty(name: string, value: any, optionalTarget?: THREE.Object3D[]): THREE.Object3D[];
        getWorldPosition(target: THREE.Vector3): THREE.Vector3;
        getWorldQuaternion(target: THREE.Quaternion): THREE.Quaternion;
        getWorldScale(target: THREE.Vector3): THREE.Vector3;
        getWorldDirection(target: THREE.Vector3): THREE.Vector3;
        raycast(raycaster: THREE.Raycaster, intersects: THREE.Intersection[]): void;
        traverse(callback: (object: THREE.Object3D) => any): void;
        traverseVisible(callback: (object: THREE.Object3D) => any): void;
        traverseAncestors(callback: (object: THREE.Object3D) => any): void;
        updateMatrix(): void;
        updateMatrixWorld(force?: boolean): void;
        updateWorldMatrix(updateParents: boolean, updateChildren: boolean): void;
        toJSON(meta?: THREE.JSONMeta): THREE.Object3DJSON;
        clone(recursive?: boolean): /*elided*/ any;
        copy(object: THREE.Object3D, recursive?: boolean): /*elided*/ any;
        count?: number | undefined;
        occlusionTest?: boolean | undefined;
        xb?: XBObjectOptions;
        spherecast?(sphere: THREE.Sphere, intersects: Array<THREE.Intersection>): void;
        intersectChildren?: boolean;
        interactableDescendants?: Array<THREE.Object3D>;
        ancestorsHaveListeners?: boolean;
        defaultPointerEvents?: _pmndrs_uikit_dist_panel.PointerEventsProperties["pointerEvents"];
        addEventListener<T extends keyof THREE.Object3DEventMap>(type: T, listener: THREE.EventListener<THREE.Object3DEventMap[T], T, /*elided*/ any>): void;
        hasEventListener<T extends keyof THREE.Object3DEventMap>(type: T, listener: THREE.EventListener<THREE.Object3DEventMap[T], T, /*elided*/ any>): boolean;
        removeEventListener<T extends keyof THREE.Object3DEventMap>(type: T, listener: THREE.EventListener<THREE.Object3DEventMap[T], T, /*elided*/ any>): void;
        dispatchEvent<T extends keyof THREE.Object3DEventMap>(event: THREE.BaseEvent<T> & THREE.Object3DEventMap[T]): void;
        pointerEvents?: "none" | "auto" | "listener";
        pointerEventsType?: _pmndrs_uikit_dist_panel.AllowedPointerEventsType;
        pointerEventsOrder?: number;
    };
} & TBase;
/**
 * Script manages app logic or interaction between user and objects.
 */
declare const ScriptMixinObject3D: {
    new (...args: any[]): {
        isXRScript: boolean;
        /**
         * Initializes an instance with XR controllers, grips, hands, and default
         * options. We allow all scripts to quickly access its user (e.g.,
         * user.isSelecting(), user.hands), world (e.g., physical depth mesh,
         * lighting estimation, and recognized objects), and scene (the root of
         * three.js's scene graph). If this returns a promise, we will wait for it.
         */
        init(_?: object): void | Promise<void>;
        /**
         * Runs per frame.
         */
        update(_time?: number, _frame?: XRFrame): void;
        /**
         * Enables depth-aware interactions with physics. See /samples/advanced/ballpit
         */
        initPhysics(_physics: Physics): void | Promise<void>;
        physicsStep(): void;
        onXRSessionStarted(_session?: XRSession): void;
        onXRSessionEnded(): void;
        onSimulatorStarted(): void;
        /**
         * Called whenever pinch / mouse click starts, globally.
         * @param _event - The interaction source and optional captured target.
         */
        onSelectStart(_event: SelectEvent): void;
        /**
         * Called whenever pinch / mouse click discontinues, globally.
         * @param _event - The completed state and end reason.
         */
        onSelectEnd(_event: SelectEndEvent): void;
        /**
         * Called whenever pinch / mouse click successfully completes, globally.
         * @param _event - The interaction source and completed target.
         */
        onSelect(_event: SelectEvent): void;
        /**
         * Called whenever pinch / mouse click is happening, globally.
         */
        onSelecting(_event: SelectEvent): void;
        /** Called when an object selection reaches the long-select delay. */
        onLongSelect(_event: LongSelectEvent): void;
        /**
         * Called on keyboard keypress.
         * @param _event - Event containing `.code` to read the keyboard key.
         */
        onKeyDown(_event: KeyEvent): void;
        onKeyUp(_event: KeyEvent): void;
        /**
         * Called whenever gamepad trigger starts, globally.
         * @param _event - `event.source.controller` identifies the controller.
         */
        onSqueezeStart(_event: SelectEvent): void;
        /**
         * Called whenever gamepad trigger stops, globally.
         * @param _event - `event.source.controller` identifies the controller.
         */
        onSqueezeEnd(_event: SelectEvent): void;
        /**
         * Called whenever gamepad is being triggered, globally.
         */
        onSqueezing(_event: SelectEvent): void;
        /**
         * Called whenever gamepad trigger successfully completes, globally.
         * @param _event - `event.source.controller` identifies the controller.
         */
        onSqueeze(_event: SelectEvent): void;
        /**
         * Called when a source starts selecting the object this Script represents.
         * @param _event - `event.target` is the logical object and
         * `event.source.controller` identifies the controller.
         * Call `event.stopPropagation()` to stop bubbling to ancestor Scripts.
         */
        onObjectSelectStart(_event: SelectEvent): void;
        /**
         * Called when a source stops selecting the object this Script represents.
         * @param _event - The completed state and end reason.
         * Call `event.stopPropagation()` to stop bubbling to ancestor Scripts.
         */
        onObjectSelectEnd(_event: SelectEndEvent): void;
        /**
         * Called once when a captured selection is held for the long-select delay.
         * Manipulation captures do not emit this callback.
         * @param _event - The controller and completed hold duration.
         * Call `event.stopPropagation()` to stop bubbling to ancestor Scripts.
         */
        onObjectLongSelect(_event: LongSelectEvent): void;
        /**
         * Called for each phase of an automatic object manipulation. Call
         * `event.stopPropagation()` to stop bubbling. Calling `preventDefault()`
         * on a start event suppresses the automatic action.
         */
        onObjectManipulate(_event: ManipulationEvent): void;
        /**
         * Called when a source starts hovering over this object.
         * @param _event - The hover source, target, surface, and intersection.
         * Call `event.stopPropagation()` to stop bubbling to ancestor Scripts.
         */
        onHoverEnter(_event: HoverEvent): void;
        /**
         * Called when a source stops hovering over this object.
         * @param _event - The hover source, target, surface, and intersection.
         * Call `event.stopPropagation()` to stop bubbling to ancestor Scripts.
         */
        onHoverExit(_event: HoverEvent): void;
        /**
         * Called while a source hovers over this object.
         * @param _event - The hover source, target, surface, and intersection.
         * Call `event.stopPropagation()` to stop bubbling to ancestor Scripts.
         */
        onHovering(_event: HoverEvent): void;
        /**
         * Called when a hand's index finger starts touching this object.
         * Direct touch starts the object's selection lifecycle by default. Call
         * `event.preventDefault()` to handle contact without selecting.
         */
        onObjectTouchStart(_event: ObjectTouchStartEvent): void;
        /**
         * Called every frame that a hand's index finger is touching this object.
         * The object remains selected during these frames unless touch selection
         * was prevented when contact started.
         */
        onObjectTouching(_event: ObjectTouchEvent): void;
        /**
         * Called when a hand's index finger stops touching this object.
         * This ends the default selection lifecycle after the touch callback.
         */
        onObjectTouchEnd(_event: ObjectTouchEvent): void;
        /**
         * Called when a hand starts grabbing this object (touching + pinching).
         * A grab starts built-in direct-touch manipulation when enabled.
         */
        onObjectGrabStart(_event: ObjectGrabEvent): void;
        /**
         * Called every frame a hand is grabbing this object.
         */
        onObjectGrabbing(_event: ObjectGrabEvent): void;
        /**
         * Called when a hand stops grabbing this object.
         * This ends built-in direct-touch manipulation without ending contact.
         */
        onObjectGrabEnd(_event: ObjectGrabEvent): void;
        /**
         * Called when the script is removed from the scene. Opposite of init.
         */
        dispose(): void;
        readonly isObject3D: true;
        readonly id: number;
        uuid: string;
        name: string;
        readonly type: string;
        parent: THREE.Object3D | null;
        children: THREE.Object3D[];
        up: THREE.Vector3;
        readonly position: THREE.Vector3;
        readonly rotation: THREE.Euler;
        readonly quaternion: THREE.Quaternion;
        readonly scale: THREE.Vector3;
        readonly modelViewMatrix: THREE.Matrix4;
        readonly normalMatrix: THREE.Matrix3;
        matrix: THREE.Matrix4;
        matrixWorld: THREE.Matrix4;
        matrixAutoUpdate: boolean;
        matrixWorldAutoUpdate: boolean;
        matrixWorldNeedsUpdate: boolean;
        layers: THREE.Layers;
        visible: boolean;
        castShadow: boolean;
        receiveShadow: boolean;
        frustumCulled: boolean;
        renderOrder: number;
        animations: THREE.AnimationClip[];
        customDepthMaterial?: THREE.Material | undefined;
        customDistanceMaterial?: THREE.Material | undefined;
        static: boolean;
        userData: Record<string, any>;
        pivot: THREE.Vector3 | null;
        onBeforeShadow(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, shadowCamera: THREE.Camera, geometry: THREE.BufferGeometry, depthMaterial: THREE.Material, group: THREE.Group): void;
        onAfterShadow(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, shadowCamera: THREE.Camera, geometry: THREE.BufferGeometry, depthMaterial: THREE.Material, group: THREE.Group): void;
        onBeforeRender(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, geometry: THREE.BufferGeometry, material: THREE.Material, group: THREE.Group): void;
        onAfterRender(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, geometry: THREE.BufferGeometry, material: THREE.Material, group: THREE.Group): void;
        applyMatrix4(matrix: THREE.Matrix4): void;
        applyQuaternion(quaternion: THREE.Quaternion): /*elided*/ any;
        setRotationFromAxisAngle(axis: THREE.Vector3, angle: number): void;
        setRotationFromEuler(euler: THREE.Euler): void;
        setRotationFromMatrix(m: THREE.Matrix4): void;
        setRotationFromQuaternion(q: THREE.Quaternion): void;
        rotateOnAxis(axis: THREE.Vector3, angle: number): /*elided*/ any;
        rotateOnWorldAxis(axis: THREE.Vector3, angle: number): /*elided*/ any;
        rotateX(angle: number): /*elided*/ any;
        rotateY(angle: number): /*elided*/ any;
        rotateZ(angle: number): /*elided*/ any;
        translateOnAxis(axis: THREE.Vector3, distance: number): /*elided*/ any;
        translateX(distance: number): /*elided*/ any;
        translateY(distance: number): /*elided*/ any;
        translateZ(distance: number): /*elided*/ any;
        localToWorld(vector: THREE.Vector3): THREE.Vector3;
        worldToLocal(vector: THREE.Vector3): THREE.Vector3;
        lookAt(vector: THREE.Vector3): void;
        lookAt(x: number, y: number, z: number): void;
        add(...object: THREE.Object3D[]): /*elided*/ any;
        remove(...object: THREE.Object3D[]): /*elided*/ any;
        removeFromParent(): /*elided*/ any;
        clear(): /*elided*/ any;
        attach(object: THREE.Object3D): /*elided*/ any;
        getObjectById(id: number): THREE.Object3D | undefined;
        getObjectByName(name: string): THREE.Object3D | undefined;
        getObjectByProperty(name: string, value: any): THREE.Object3D | undefined;
        getObjectsByProperty(name: string, value: any, optionalTarget?: THREE.Object3D[]): THREE.Object3D[];
        getWorldPosition(target: THREE.Vector3): THREE.Vector3;
        getWorldQuaternion(target: THREE.Quaternion): THREE.Quaternion;
        getWorldScale(target: THREE.Vector3): THREE.Vector3;
        getWorldDirection(target: THREE.Vector3): THREE.Vector3;
        raycast(raycaster: THREE.Raycaster, intersects: THREE.Intersection[]): void;
        traverse(callback: (object: THREE.Object3D) => any): void;
        traverseVisible(callback: (object: THREE.Object3D) => any): void;
        traverseAncestors(callback: (object: THREE.Object3D) => any): void;
        updateMatrix(): void;
        updateMatrixWorld(force?: boolean): void;
        updateWorldMatrix(updateParents: boolean, updateChildren: boolean): void;
        toJSON(meta?: THREE.JSONMeta): THREE.Object3DJSON;
        clone(recursive?: boolean): /*elided*/ any;
        copy(object: THREE.Object3D, recursive?: boolean): /*elided*/ any;
        count?: number | undefined;
        occlusionTest?: boolean | undefined;
        xb?: XBObjectOptions;
        spherecast?(sphere: THREE.Sphere, intersects: Array<THREE.Intersection>): void;
        intersectChildren?: boolean;
        interactableDescendants?: Array<THREE.Object3D>;
        ancestorsHaveListeners?: boolean;
        defaultPointerEvents?: _pmndrs_uikit_dist_panel.PointerEventsProperties["pointerEvents"];
        addEventListener<T extends keyof THREE.Object3DEventMap>(type: T, listener: THREE.EventListener<THREE.Object3DEventMap[T], T, /*elided*/ any>): void;
        hasEventListener<T extends keyof THREE.Object3DEventMap>(type: T, listener: THREE.EventListener<THREE.Object3DEventMap[T], T, /*elided*/ any>): boolean;
        removeEventListener<T extends keyof THREE.Object3DEventMap>(type: T, listener: THREE.EventListener<THREE.Object3DEventMap[T], T, /*elided*/ any>): void;
        dispatchEvent<T extends keyof THREE.Object3DEventMap>(event: THREE.BaseEvent<T> & THREE.Object3DEventMap[T]): void;
        pointerEvents?: "none" | "auto" | "listener";
        pointerEventsType?: _pmndrs_uikit_dist_panel.AllowedPointerEventsType;
        pointerEventsOrder?: number;
    };
} & typeof THREE.Object3D;
declare class Script<TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap> extends ScriptMixinObject3D<TEventMap> {
}
/**
 * MeshScript can be constructed with geometry and materials, with
 * `super(geometry, material)`; for direct access to its geometry.
 * MeshScripts hold geometry and materials while using the Script lifecycle.
 */
declare const ScriptMixinMeshScript: {
    new (...args: any[]): {
        isXRScript: boolean;
        /**
         * Initializes an instance with XR controllers, grips, hands, and default
         * options. We allow all scripts to quickly access its user (e.g.,
         * user.isSelecting(), user.hands), world (e.g., physical depth mesh,
         * lighting estimation, and recognized objects), and scene (the root of
         * three.js's scene graph). If this returns a promise, we will wait for it.
         */
        init(_?: object): void | Promise<void>;
        /**
         * Runs per frame.
         */
        update(_time?: number, _frame?: XRFrame): void;
        /**
         * Enables depth-aware interactions with physics. See /samples/advanced/ballpit
         */
        initPhysics(_physics: Physics): void | Promise<void>;
        physicsStep(): void;
        onXRSessionStarted(_session?: XRSession): void;
        onXRSessionEnded(): void;
        onSimulatorStarted(): void;
        /**
         * Called whenever pinch / mouse click starts, globally.
         * @param _event - The interaction source and optional captured target.
         */
        onSelectStart(_event: SelectEvent): void;
        /**
         * Called whenever pinch / mouse click discontinues, globally.
         * @param _event - The completed state and end reason.
         */
        onSelectEnd(_event: SelectEndEvent): void;
        /**
         * Called whenever pinch / mouse click successfully completes, globally.
         * @param _event - The interaction source and completed target.
         */
        onSelect(_event: SelectEvent): void;
        /**
         * Called whenever pinch / mouse click is happening, globally.
         */
        onSelecting(_event: SelectEvent): void;
        /** Called when an object selection reaches the long-select delay. */
        onLongSelect(_event: LongSelectEvent): void;
        /**
         * Called on keyboard keypress.
         * @param _event - Event containing `.code` to read the keyboard key.
         */
        onKeyDown(_event: KeyEvent): void;
        onKeyUp(_event: KeyEvent): void;
        /**
         * Called whenever gamepad trigger starts, globally.
         * @param _event - `event.source.controller` identifies the controller.
         */
        onSqueezeStart(_event: SelectEvent): void;
        /**
         * Called whenever gamepad trigger stops, globally.
         * @param _event - `event.source.controller` identifies the controller.
         */
        onSqueezeEnd(_event: SelectEvent): void;
        /**
         * Called whenever gamepad is being triggered, globally.
         */
        onSqueezing(_event: SelectEvent): void;
        /**
         * Called whenever gamepad trigger successfully completes, globally.
         * @param _event - `event.source.controller` identifies the controller.
         */
        onSqueeze(_event: SelectEvent): void;
        /**
         * Called when a source starts selecting the object this Script represents.
         * @param _event - `event.target` is the logical object and
         * `event.source.controller` identifies the controller.
         * Call `event.stopPropagation()` to stop bubbling to ancestor Scripts.
         */
        onObjectSelectStart(_event: SelectEvent): void;
        /**
         * Called when a source stops selecting the object this Script represents.
         * @param _event - The completed state and end reason.
         * Call `event.stopPropagation()` to stop bubbling to ancestor Scripts.
         */
        onObjectSelectEnd(_event: SelectEndEvent): void;
        /**
         * Called once when a captured selection is held for the long-select delay.
         * Manipulation captures do not emit this callback.
         * @param _event - The controller and completed hold duration.
         * Call `event.stopPropagation()` to stop bubbling to ancestor Scripts.
         */
        onObjectLongSelect(_event: LongSelectEvent): void;
        /**
         * Called for each phase of an automatic object manipulation. Call
         * `event.stopPropagation()` to stop bubbling. Calling `preventDefault()`
         * on a start event suppresses the automatic action.
         */
        onObjectManipulate(_event: ManipulationEvent): void;
        /**
         * Called when a source starts hovering over this object.
         * @param _event - The hover source, target, surface, and intersection.
         * Call `event.stopPropagation()` to stop bubbling to ancestor Scripts.
         */
        onHoverEnter(_event: HoverEvent): void;
        /**
         * Called when a source stops hovering over this object.
         * @param _event - The hover source, target, surface, and intersection.
         * Call `event.stopPropagation()` to stop bubbling to ancestor Scripts.
         */
        onHoverExit(_event: HoverEvent): void;
        /**
         * Called while a source hovers over this object.
         * @param _event - The hover source, target, surface, and intersection.
         * Call `event.stopPropagation()` to stop bubbling to ancestor Scripts.
         */
        onHovering(_event: HoverEvent): void;
        /**
         * Called when a hand's index finger starts touching this object.
         * Direct touch starts the object's selection lifecycle by default. Call
         * `event.preventDefault()` to handle contact without selecting.
         */
        onObjectTouchStart(_event: ObjectTouchStartEvent): void;
        /**
         * Called every frame that a hand's index finger is touching this object.
         * The object remains selected during these frames unless touch selection
         * was prevented when contact started.
         */
        onObjectTouching(_event: ObjectTouchEvent): void;
        /**
         * Called when a hand's index finger stops touching this object.
         * This ends the default selection lifecycle after the touch callback.
         */
        onObjectTouchEnd(_event: ObjectTouchEvent): void;
        /**
         * Called when a hand starts grabbing this object (touching + pinching).
         * A grab starts built-in direct-touch manipulation when enabled.
         */
        onObjectGrabStart(_event: ObjectGrabEvent): void;
        /**
         * Called every frame a hand is grabbing this object.
         */
        onObjectGrabbing(_event: ObjectGrabEvent): void;
        /**
         * Called when a hand stops grabbing this object.
         * This ends built-in direct-touch manipulation without ending contact.
         */
        onObjectGrabEnd(_event: ObjectGrabEvent): void;
        /**
         * Called when the script is removed from the scene. Opposite of init.
         */
        dispose(): void;
        readonly isObject3D: true;
        readonly id: number;
        uuid: string;
        name: string;
        readonly type: string;
        parent: THREE.Object3D | null;
        children: THREE.Object3D[];
        up: THREE.Vector3;
        readonly position: THREE.Vector3;
        readonly rotation: THREE.Euler;
        readonly quaternion: THREE.Quaternion;
        readonly scale: THREE.Vector3;
        readonly modelViewMatrix: THREE.Matrix4;
        readonly normalMatrix: THREE.Matrix3;
        matrix: THREE.Matrix4;
        matrixWorld: THREE.Matrix4;
        matrixAutoUpdate: boolean;
        matrixWorldAutoUpdate: boolean;
        matrixWorldNeedsUpdate: boolean;
        layers: THREE.Layers;
        visible: boolean;
        castShadow: boolean;
        receiveShadow: boolean;
        frustumCulled: boolean;
        renderOrder: number;
        animations: THREE.AnimationClip[];
        customDepthMaterial?: THREE.Material | undefined;
        customDistanceMaterial?: THREE.Material | undefined;
        static: boolean;
        userData: Record<string, any>;
        pivot: THREE.Vector3 | null;
        onBeforeShadow(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, shadowCamera: THREE.Camera, geometry: THREE.BufferGeometry, depthMaterial: THREE.Material, group: THREE.Group): void;
        onAfterShadow(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, shadowCamera: THREE.Camera, geometry: THREE.BufferGeometry, depthMaterial: THREE.Material, group: THREE.Group): void;
        onBeforeRender(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, geometry: THREE.BufferGeometry, material: THREE.Material, group: THREE.Group): void;
        onAfterRender(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, geometry: THREE.BufferGeometry, material: THREE.Material, group: THREE.Group): void;
        applyMatrix4(matrix: THREE.Matrix4): void;
        applyQuaternion(quaternion: THREE.Quaternion): /*elided*/ any;
        setRotationFromAxisAngle(axis: THREE.Vector3, angle: number): void;
        setRotationFromEuler(euler: THREE.Euler): void;
        setRotationFromMatrix(m: THREE.Matrix4): void;
        setRotationFromQuaternion(q: THREE.Quaternion): void;
        rotateOnAxis(axis: THREE.Vector3, angle: number): /*elided*/ any;
        rotateOnWorldAxis(axis: THREE.Vector3, angle: number): /*elided*/ any;
        rotateX(angle: number): /*elided*/ any;
        rotateY(angle: number): /*elided*/ any;
        rotateZ(angle: number): /*elided*/ any;
        translateOnAxis(axis: THREE.Vector3, distance: number): /*elided*/ any;
        translateX(distance: number): /*elided*/ any;
        translateY(distance: number): /*elided*/ any;
        translateZ(distance: number): /*elided*/ any;
        localToWorld(vector: THREE.Vector3): THREE.Vector3;
        worldToLocal(vector: THREE.Vector3): THREE.Vector3;
        lookAt(vector: THREE.Vector3): void;
        lookAt(x: number, y: number, z: number): void;
        add(...object: THREE.Object3D[]): /*elided*/ any;
        remove(...object: THREE.Object3D[]): /*elided*/ any;
        removeFromParent(): /*elided*/ any;
        clear(): /*elided*/ any;
        attach(object: THREE.Object3D): /*elided*/ any;
        getObjectById(id: number): THREE.Object3D | undefined;
        getObjectByName(name: string): THREE.Object3D | undefined;
        getObjectByProperty(name: string, value: any): THREE.Object3D | undefined;
        getObjectsByProperty(name: string, value: any, optionalTarget?: THREE.Object3D[]): THREE.Object3D[];
        getWorldPosition(target: THREE.Vector3): THREE.Vector3;
        getWorldQuaternion(target: THREE.Quaternion): THREE.Quaternion;
        getWorldScale(target: THREE.Vector3): THREE.Vector3;
        getWorldDirection(target: THREE.Vector3): THREE.Vector3;
        raycast(raycaster: THREE.Raycaster, intersects: THREE.Intersection[]): void;
        traverse(callback: (object: THREE.Object3D) => any): void;
        traverseVisible(callback: (object: THREE.Object3D) => any): void;
        traverseAncestors(callback: (object: THREE.Object3D) => any): void;
        updateMatrix(): void;
        updateMatrixWorld(force?: boolean): void;
        updateWorldMatrix(updateParents: boolean, updateChildren: boolean): void;
        toJSON(meta?: THREE.JSONMeta): THREE.Object3DJSON;
        clone(recursive?: boolean): /*elided*/ any;
        copy(object: THREE.Object3D, recursive?: boolean): /*elided*/ any;
        count?: number | undefined;
        occlusionTest?: boolean | undefined;
        xb?: XBObjectOptions;
        spherecast?(sphere: THREE.Sphere, intersects: Array<THREE.Intersection>): void;
        intersectChildren?: boolean;
        interactableDescendants?: Array<THREE.Object3D>;
        ancestorsHaveListeners?: boolean;
        defaultPointerEvents?: _pmndrs_uikit_dist_panel.PointerEventsProperties["pointerEvents"];
        addEventListener<T extends keyof THREE.Object3DEventMap>(type: T, listener: THREE.EventListener<THREE.Object3DEventMap[T], T, /*elided*/ any>): void;
        hasEventListener<T extends keyof THREE.Object3DEventMap>(type: T, listener: THREE.EventListener<THREE.Object3DEventMap[T], T, /*elided*/ any>): boolean;
        removeEventListener<T extends keyof THREE.Object3DEventMap>(type: T, listener: THREE.EventListener<THREE.Object3DEventMap[T], T, /*elided*/ any>): void;
        dispatchEvent<T extends keyof THREE.Object3DEventMap>(event: THREE.BaseEvent<T> & THREE.Object3DEventMap[T]): void;
        pointerEvents?: "none" | "auto" | "listener";
        pointerEventsType?: _pmndrs_uikit_dist_panel.AllowedPointerEventsType;
        pointerEventsOrder?: number;
    };
} & typeof THREE.Mesh;
declare class MeshScript<TGeometry extends THREE.BufferGeometry = THREE.BufferGeometry, TMaterial extends THREE.Material | THREE.Material[] = THREE.Material | THREE.Material[], TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap> extends ScriptMixinMeshScript<TGeometry, TMaterial, TEventMap> {
    /**
     * {@inheritDoc}
     */
    constructor(geometry?: TGeometry, material?: TMaterial);
}

interface ToolCall {
    name: string;
    args: unknown;
}
/**
 * Standardized result type for tool execution.
 * @typeParam T - The type of data returned on success.
 */
interface ToolResult<T = unknown> {
    /** Whether the tool execution succeeded */
    success: boolean;
    /** The result data if successful */
    data?: T;
    /** Error message if execution failed */
    error?: string;
    /** Additional metadata about the execution */
    metadata?: Record<string, unknown>;
}
type ToolSchema = Omit<GoogleGenAITypes.Schema, 'type' | 'properties' | 'items'> & {
    properties?: Record<string, ToolSchema>;
    items?: ToolSchema;
    type?: keyof typeof GoogleGenAITypes.Type;
};
type ToolOptions = {
    /** The name of the tool. */
    name: string;
    /** A description of what the tool does. */
    description: string;
    /** The parameters of the tool */
    parameters?: ToolSchema;
    /** A callback to execute when the tool is triggered */
    onTriggered?: (args: unknown) => unknown | Promise<unknown>;
    behavior?: 'BLOCKING' | 'NON_BLOCKING' | GoogleGenAITypes.Behavior;
};
/**
 * A base class for tools that the agent can use.
 */
declare class Tool {
    name: string;
    description?: string;
    parameters?: ToolSchema;
    onTriggered?: (args: unknown) => unknown;
    behavior?: 'BLOCKING' | 'NON_BLOCKING';
    /**
     * @param options - The options for the tool.
     */
    constructor(options: ToolOptions);
    /**
     * Executes the tool's action with standardized error handling.
     * @param args - The arguments for the tool.
     * @returns A promise that resolves with a ToolResult containing success/error information.
     */
    execute(args: unknown): Promise<ToolResult>;
    /**
     * Returns a JSON representation of the tool.
     * @returns A valid FunctionDeclaration object.
     */
    toJSON(): GoogleGenAITypes.FunctionDeclaration;
}

interface GeminiResponse {
    toolCall?: ToolCall;
    text?: string | null;
}

declare abstract class BaseAIModel {
    constructor();
    abstract init(): Promise<void>;
    abstract isAvailable(): boolean;
    abstract query(_input: object, _tools: []): Promise<GeminiResponse | string | null>;
    hasApiKey(): Promise<boolean>;
}

interface GeminiQueryInput {
    type: 'live' | 'text' | 'uri' | 'base64' | 'multiPart';
    action?: 'start' | 'stop' | 'send';
    text?: string;
    uri?: string;
    base64?: string;
    mimeType?: string;
    parts?: GoogleGenAITypes.Part[];
    config?: GoogleGenAITypes.LiveConnectConfig;
    data?: GoogleGenAITypes.LiveSendRealtimeInputParameters;
    useExponentialBackoff?: boolean;
}
declare class Gemini extends BaseAIModel {
    protected options: GeminiOptions;
    inited: boolean;
    liveSession?: GoogleGenAITypes.Session;
    isLiveMode: boolean;
    liveCallbacks: Partial<GoogleGenAITypes.LiveCallbacks>;
    ai?: GoogleGenAITypes.GoogleGenAI;
    constructor(options: GeminiOptions);
    init(): Promise<void>;
    isAvailable(): boolean;
    isLiveAvailable(): false | typeof GoogleGenAITypes.Modality | undefined;
    startLiveSession(params?: GoogleGenAITypes.LiveConnectConfig, model?: string): Promise<GoogleGenAITypes.Session>;
    stopLiveSession(): Promise<void>;
    setLiveCallbacks(callbacks: GoogleGenAITypes.LiveCallbacks): void;
    sendToolResponse(response: GoogleGenAITypes.LiveSendToolResponseParameters): void;
    sendRealtimeInput(input: GoogleGenAITypes.LiveSendRealtimeInputParameters): void;
    getLiveSessionStatus(): {
        isActive: boolean;
        hasSession: boolean;
        isAvailable: boolean | typeof GoogleGenAITypes.Modality | undefined;
    };
    query(input: GeminiQueryInput | {
        prompt: string;
    }): Promise<GeminiResponse | null>;
    protected queryOnce(input: GeminiQueryInput | {
        prompt: string;
    }): Promise<GeminiResponse | null>;
    protected queryWithExponentialFalloff(input: GeminiQueryInput | {
        prompt: string;
    }): Promise<GeminiResponse | null>;
    generate(prompt: string | string[], type?: 'image', systemInstruction?: string, model?: string): Promise<string | undefined>;
    hasApiKey(): Promise<boolean>;
}

declare class OpenAI extends BaseAIModel {
    protected options: OpenAIOptions;
    openai?: OpenAIType;
    constructor(options: OpenAIOptions);
    init(): Promise<void>;
    isAvailable(): boolean;
    query(input: {
        prompt: string;
    }, _tools?: never[]): Promise<{
        text: string;
    } | null>;
    generate(): Promise<void>;
}

type ModelClass = Gemini | OpenAI;
type ModelOptions = GeminiOptions | OpenAIOptions;
type KeysJson = {
    gemini?: {
        apiKey?: string;
    };
    openai?: {
        apiKey?: string;
    };
};
/**
 * AI Interface to wrap different AI models (primarily Gemini)
 * Handles both traditional query-based AI interactions and real-time live
 * sessions
 *
 * Features:
 * - Text and multimodal queries
 * - Real-time audio/video AI sessions (Gemini Live)
 * - Advanced API key management with multiple sources
 * - Session locking to prevent concurrent operations
 *
 * The URL param and key.json shortcut is only for demonstration and prototyping
 * practice and we strongly suggest not using it for production or deployment
 * purposes. One should set up a proper server to converse with AI servers in
 * deployment.
 *
 * API Key Management Features:
 *
 * 1. Multiple Key Sources (Priority Order):
 *    - Model option
 *    - Generic and model-specific URL parameters
 *    - Current-page memory
 *    - keys.json file
 * 2. keys.json Support:
 *    - Structure: \{"gemini": \{"apiKey": "YOUR_KEY_HERE"\}\}
 *    - Automatically loads if present
 */
declare class AI extends Script {
    static dependencies: {
        aiOptions: typeof AIOptions;
    };
    editorIcon: string;
    model?: ModelClass;
    lock: boolean;
    options: AIOptions;
    keysCache?: KeysJson;
    /**
     * Load API keys from keys.json file if available
     * Parsed keys object or null if not found
     */
    loadKeysFromFile(): Promise<KeysJson | null>;
    init({ aiOptions }: {
        aiOptions: AIOptions;
    }): Promise<void>;
    initializeModel(ModelClass: typeof Gemini | typeof OpenAI, modelOptions: ModelOptions): Promise<void>;
    resolveApiKey(modelOptions: ModelOptions): Promise<string | null>;
    private resolveApiKeyWithSource;
    private getUrlApiKey;
    isValidApiKey(key: string): boolean | "";
    isAvailable(): boolean | undefined;
    query(input: GeminiQueryInput | {
        prompt: string;
    }, tools?: never[]): Promise<GeminiResponse | string | null>;
    startLiveSession(config?: GoogleGenAITypes.LiveConnectConfig, model?: string): Promise<GoogleGenAITypes.Session>;
    stopLiveSession(): Promise<void>;
    setLiveCallbacks(callbacks: GoogleGenAITypes.LiveCallbacks): Promise<void>;
    sendToolResponse(response: GoogleGenAITypes.LiveSendToolResponseParameters): void;
    sendRealtimeInput(input: GoogleGenAITypes.LiveSendRealtimeInputParameters): false | void;
    getLiveSessionStatus(): {
        isActive: boolean;
        hasSession: boolean;
        isAvailable: boolean | typeof GoogleGenAITypes.Modality | undefined;
    };
    isLiveAvailable(): false | typeof GoogleGenAITypes.Modality | undefined;
    generate(prompt: string | string[], type?: 'image', systemInstruction?: string, model?: undefined): Promise<string | undefined>;
    /**
     * Create a sample keys.json file structure for reference
     * @returns Sample keys.json structure
     */
    static createSampleKeysStructure(): {
        gemini: {
            apiKey: string;
        };
        openai: {
            apiKey: string;
        };
    };
    /**
     * Check if the current model has an API key available from any source
     * @returns True if API key is available
     */
    hasApiKey(): Promise<boolean | "" | null>;
}

interface MemoryEntry {
    role: 'user' | 'ai' | 'tool';
    content: string;
}
/**
 * Manages the agent's memory, including short-term, long-term, and working
 * memory.
 */
declare class Memory {
    private shortTermMemory;
    /**
     * Adds a new entry to the short-term memory.
     * @param entry - The memory entry to add.
     */
    addShortTerm(entry: MemoryEntry): void;
    /**
     * Retrieves the short-term memory.
     * @returns An array of all short-term memory entries.
     */
    getShortTerm(): MemoryEntry[];
    /**
     * Clears all memory components.
     */
    clear(): void;
}

/**
 * Builds the context to be sent to the AI for reasoning.
 */
declare class Context$1 {
    private instructions;
    constructor(instructions?: string);
    get instruction(): string;
    /**
     * Constructs a formatted prompt from memory and available tools.
     * @param memory - The agent's memory.
     * @param tools - The list of available tools.
     * @returns A string representing the full context for the AI.
     */
    build(memory: Memory, tools: Tool[]): string;
    private formatEntry;
}

/**
 * Lifecycle callbacks for agent events.
 */
interface AgentLifecycleCallbacks {
    /** Called when a session starts */
    onSessionStart?: () => void | Promise<void>;
    /** Called when a session ends */
    onSessionEnd?: () => void | Promise<void>;
    /** Called after a tool is executed */
    onToolExecuted?: (toolName: string, result: unknown) => void;
    /** Called when an error occurs */
    onError?: (error: Error) => void;
}
/**
 * An agent that can use an AI to reason and execute tools.
 */
declare class Agent {
    static dependencies: {};
    ai: AI;
    tools: Tool[];
    memory: Memory;
    contextBuilder: Context$1;
    lifecycleCallbacks?: AgentLifecycleCallbacks;
    isSessionActive: boolean;
    constructor(ai: AI, tools?: Tool[], instruction?: string, callbacks?: AgentLifecycleCallbacks);
    /**
     * Starts the agent's reasoning loop with an initial prompt.
     * @param prompt - The initial prompt from the user.
     * @returns The final text response from the agent.
     */
    start(prompt: string): Promise<string>;
    /**
     * The main reasoning and action loop of the agent for non-live mode.
     * It repeatedly builds context, queries the AI, and executes tools
     * until a final text response is generated.
     */
    private run;
    findTool(name: string): Tool | undefined;
    /**
     * Get the current session state.
     * @returns Object containing session information
     */
    getSessionState(): {
        isActive: boolean;
        toolCount: number;
        memorySize: number;
    };
}

declare class Registry {
    private instances;
    /**
     * Registers an new instanceof a given type.
     * If an existing instance of the same type is already registered, it will be
     * overwritten.
     * @param instance - The instance to register.
     * @param type - Type to register the instance as. Will default to
     * `instance.constructor` if not defined.
     */
    register<T extends object>(instance: T, type?: Constructor<T>): void;
    /**
     * Gets an existing instance of a registered type.
     * @param type - The constructor function of the type to retrieve.
     * @returns The instance of the requested type.
     */
    get<T extends object>(type: Constructor<T>): T | undefined;
    /**
     * Gets an existing instance of a registered type, or creates a new one if it
     * doesn't exist.
     * @param type - The constructor function of the type to retrieve.
     * @param factory - A function that creates a new instance of the type if it
     * doesn't already exist.
     * @returns The instance of the requested type.
     */
    getOrCreate<T extends object>(type: Constructor<T>, factory: () => T): T;
    /**
     * Unregisters an instance of a given type.
     * @param type - The type to unregister.
     */
    unregister(type: Constructor): void;
}

interface AudioListenerOptions {
    sampleRate?: number;
    channelCount?: number;
    echoCancellation?: boolean;
    noiseSuppression?: boolean;
    autoGainControl?: boolean;
}
declare class AudioListener extends Script {
    static dependencies: {
        registry: typeof Registry;
    };
    private options;
    private audioStream?;
    audioContext?: AudioContext;
    private sourceNode?;
    private processorNode?;
    private isCapturing;
    private latestAudioBuffer;
    private accumulatedChunks;
    private isAccumulating;
    private registry;
    aiService?: AI;
    private onAudioData?;
    private onError?;
    constructor(options?: AudioListenerOptions);
    /**
     * Init the AudioListener.
     */
    init({ registry }: {
        registry: Registry;
    }): void;
    startCapture(callbacks?: {
        onAudioData?: (audioBuffer: ArrayBuffer) => void;
        onError?: (error: Error) => void;
        accumulate?: boolean;
    }): Promise<void>;
    stopCapture(): void;
    setupAudioCapture(): Promise<void>;
    private setupAudioWorklet;
    streamToAI(audioBuffer: ArrayBuffer): void;
    setAIStreaming(enabled: boolean): void;
    cleanup(): void;
    static isSupported(): boolean;
    getIsCapturing(): boolean;
    getLatestAudioBuffer(): ArrayBuffer | null;
    clearLatestAudioBuffer(): void;
    /**
     * Gets all accumulated audio chunks as a single combined buffer
     */
    getAccumulatedBuffer(): ArrayBuffer | null;
    /**
     * Clears accumulated chunks
     */
    clearAccumulatedBuffer(): void;
    /**
     * Gets the number of accumulated chunks
     */
    getAccumulatedChunkCount(): number;
    dispose(): void;
}

declare enum VolumeCategory {
    music = "music",
    sfx = "sfx",
    speech = "speech",
    ui = "ui"
}
declare class CategoryVolumes {
    isMuted: boolean;
    masterVolume: number;
    volumes: Record<VolumeCategory, number>;
    getCategoryVolume(category: string): number;
    getEffectiveVolume(category: string, specificVolume?: number): number;
}

interface AudioPlayerOptions {
    sampleRate?: number;
    channelCount?: number;
    category?: string;
}
declare class AudioPlayer extends Script {
    private options;
    private audioContext?;
    private audioQueue;
    private nextStartTime;
    private gainNode?;
    private categoryVolumes?;
    private volume;
    private category;
    scheduleAheadTime: number;
    constructor(options?: AudioPlayerOptions);
    /**
     * Sets the CategoryVolumes instance for this player to respect
     * master/category volumes
     */
    setCategoryVolumes(categoryVolumes: CategoryVolumes): void;
    /**
     * Sets the specific volume for this player (0.0 to 1.0)
     */
    setVolume(level: number): void;
    /**
     * Updates the gain node volume based on category volumes
     * Public so CoreSound can update it when master volume changes
     */
    updateGainNodeVolume(): void;
    initializeAudioContext(): Promise<void>;
    playAudioChunk(base64AudioData: string): Promise<void>;
    private scheduleAudioBuffers;
    clearQueue(): void;
    getIsPlaying(): boolean;
    getQueueLength(): number;
    base64ToArrayBuffer(base64: string): ArrayBuffer;
    stop(): void;
    static isSupported(): boolean;
    dispose(): void;
}

declare const musicLibrary: {
    readonly ambient: string;
    readonly background: string;
    readonly buttonHover: string;
    readonly buttonPress: string;
    readonly menuDismiss: string;
};
declare class BackgroundMusic extends Script {
    private listener;
    private categoryVolumes;
    private audioLoader;
    private currentAudio;
    private isPlaying;
    private musicLibrary;
    private specificVolume;
    private musicCategory;
    constructor(listener: THREE.AudioListener, categoryVolumes: CategoryVolumes);
    setVolume(level: number): void;
    playMusic(musicKey: keyof typeof musicLibrary, category?: string): void;
    stopMusic(): void;
    destroy(): void;
}

/**
 * Defines common UI sound presets with their default parameters.
 * Each preset specifies frequency, duration, and waveform type.
 */
declare const SOUND_PRESETS: {
    readonly BEEP: {
        readonly frequency: 1000;
        readonly duration: 0.07;
        readonly waveformType: "sine";
    };
    readonly CLICK: readonly [{
        readonly frequency: 1500;
        readonly duration: 0.02;
        readonly waveformType: "triangle";
        readonly delay: 0;
    }];
    readonly ACTIVATE: readonly [{
        readonly frequency: 800;
        readonly duration: 0.05;
        readonly waveformType: "sine";
        readonly delay: 0;
    }, {
        readonly frequency: 1200;
        readonly duration: 0.07;
        readonly waveformType: "sine";
        readonly delay: 50;
    }];
    readonly DEACTIVATE: readonly [{
        readonly frequency: 1200;
        readonly duration: 0.05;
        readonly waveformType: "sine";
        readonly delay: 0;
    }, {
        readonly frequency: 800;
        readonly duration: 0.07;
        readonly waveformType: "sine";
        readonly delay: 50;
    }];
};
declare class SoundSynthesizer extends Script {
    audioContext?: AudioContext;
    isInitialized: boolean;
    debug: boolean;
    /**
     * Initializes the AudioContext.
     */
    private _initAudioContext;
    /**
     * Plays a single tone with specified parameters.
     * @param frequency - The frequency of the tone in Hz.
     * @param duration - The duration of the tone in seconds.
     * @param volume - The volume of the tone (0.0 to 1.0).
     * @param waveformType - The type of waveform ('sine', 'square', 'sawtooth',
     *     'triangle').
     */
    playTone(frequency: number, duration: number, volume: number, waveformType: OscillatorType): void;
    /**
     * Plays a predefined sound preset.
     * @param presetName - The name of the preset (e.g., 'BEEP', 'CLICK',
     *     'ACTIVATE', 'DEACTIVATE').
     * @param volume - The volume for the preset (overrides default
     *     if present, otherwise uses this).
     */
    playPresetTone(presetName: keyof typeof SOUND_PRESETS, volume?: number): void;
}

declare const spatialSoundLibrary: {
    readonly ambient: "musicLibrary/AmbientLoop.opus";
    readonly buttonHover: "musicLibrary/ButtonHover.opus";
    readonly paintOneShot1: "musicLibrary/PaintOneShot1.opus";
};
interface PlaySoundOptions {
    loop?: boolean;
    volume?: number;
    refDistance?: number;
    rolloffFactor?: number;
    onEnded?: () => void;
}
declare class SpatialAudio extends Script {
    private listener;
    private categoryVolumes;
    private audioLoader;
    private soundLibrary;
    private activeSounds;
    private specificVolume;
    private category;
    private defaultRefDistance;
    private defaultRolloffFactor;
    constructor(listener: THREE.AudioListener, categoryVolumes: CategoryVolumes);
    /**
     * Plays a sound attached to a specific 3D object.
     * @param soundKey - Key from the soundLibrary.
     * @param targetObject - The object the sound should emanate
     *     from.
     * @param options - Optional settings \{ loop: boolean, volume:
     *     number, refDistance: number, rolloffFactor: number, onEnded: function
     *     \}.
     * @returns A unique ID for the playing sound instance, or null
     *     if failed.
     */
    playSoundAtObject(soundKey: keyof typeof spatialSoundLibrary, targetObject: THREE.Object3D, options?: PlaySoundOptions): number | null;
    /**
     * Stops a specific sound instance by its ID.
     * @param soundId - The ID returned by playSoundAtObject.
     */
    stopSound(soundId: number): void;
    /**
     * Internal method to remove sound from object and map.
     * @param soundId - id
     */
    private _cleanupSound;
    /**
     * Sets the base specific volume for subsequently played spatial sounds.
     * Does NOT affect currently playing sounds (use updateAllVolumes for that).
     * @param level - Volume level (0.0 to 1.0).
     */
    setVolume(level: number): void;
    /**
     * Updates the volume of all currently playing spatial sounds managed by this
     * instance.
     */
    updateAllVolumes(): void;
    destroy(): void;
}

interface SpeechRecognizerEventMap extends THREE.Object3DEventMap {
    start: object;
    error: {
        error: string;
    };
    end: object;
    result: {
        originalEvent: SpeechRecognitionEvent;
        transcript: string;
        confidence: number;
        command?: string;
        isFinal: boolean;
    };
}
declare class SpeechRecognizer extends Script<SpeechRecognizerEventMap> {
    private soundSynthesizer;
    static dependencies: {
        soundOptions: typeof SoundOptions;
    };
    options: SpeechRecognizerOptions;
    recognition?: SpeechRecognition;
    isListening: boolean;
    lastTranscript: string;
    lastCommand?: string;
    lastConfidence: number;
    error?: string;
    playActivationSounds: boolean;
    constructor(soundSynthesizer: SoundSynthesizer);
    init({ soundOptions }: {
        soundOptions: SoundOptions;
    }): void;
    onSimulatorStarted(): void;
    start(): void;
    stop(): void;
    getLastTranscript(): string;
    getLastCommand(): string | undefined;
    getLastConfidence(): number;
    private _handleStart;
    private _handleResult;
    private _handleEnd;
    private _handleError;
    destroy(): void;
}

declare class SpeechSynthesizer extends Script {
    private categoryVolumes;
    private onStartCallback;
    private onEndCallback;
    private onErrorCallback;
    static dependencies: {
        soundOptions: typeof SoundOptions;
    };
    private synth;
    private voices;
    private selectedVoice?;
    private isSpeaking;
    private debug;
    private specificVolume;
    private speechCategory;
    private options;
    /**
     * Optional callback invoked on each word boundary while speaking, with the
     * character index into the spoken text. Lets callers sync visuals (e.g.
     * gestures) to the actual spoken words.
     */
    onBoundaryCallback?: (charIndex: number) => void;
    constructor(categoryVolumes: CategoryVolumes, onStartCallback?: () => void, onEndCallback?: () => void, onErrorCallback?: (_: Error) => void);
    init({ soundOptions }: {
        soundOptions: SoundOptions;
    }): void;
    loadVoices: () => void;
    setVolume(level: number): void;
    speak(text: string, lang?: string, pitch?: number, rate?: number): Promise<void>;
    tts(text: string, lang?: string, pitch?: number, rate?: number): void;
    cancel(): void;
    destroy(): void;
}

declare class CoreSound extends Script {
    static dependencies: {
        camera: typeof THREE.Camera;
        soundOptions: typeof SoundOptions;
    };
    type: string;
    name: string;
    categoryVolumes: CategoryVolumes;
    soundSynthesizer: SoundSynthesizer;
    listener: THREE.AudioListener;
    backgroundMusic: BackgroundMusic;
    spatialAudio: SpatialAudio;
    speechRecognizer?: SpeechRecognizer;
    speechSynthesizer?: SpeechSynthesizer;
    audioListener: AudioListener;
    audioPlayer: AudioPlayer;
    options: SoundOptions;
    init({ camera, soundOptions, }: {
        camera: THREE.Camera;
        soundOptions: SoundOptions;
    }): void;
    getAudioListener(): THREE.AudioListener;
    setMasterVolume(level: number): void;
    getMasterVolume(): number;
    setCategoryVolume(category: VolumeCategory, level: number): void;
    getCategoryVolume(category: VolumeCategory): number;
    enableAudio(options?: {
        streamToAI?: boolean;
        accumulate?: boolean;
    }): Promise<void>;
    disableAudio(): void;
    /**
     * Starts recording audio with chunk accumulation
     */
    startRecording(): Promise<void>;
    /**
     * Stops recording and returns the accumulated audio buffer
     */
    stopRecording(): ArrayBuffer | null;
    /**
     * Gets the accumulated recording buffer without stopping
     */
    getRecordedBuffer(): ArrayBuffer | null;
    /**
     * Clears the accumulated recording buffer
     */
    clearRecordedBuffer(): void;
    /**
     * Gets the sample rate being used for recording
     */
    getRecordingSampleRate(): number;
    setAIStreaming(enabled: boolean): void;
    isAIStreamingEnabled(): boolean;
    playAIAudio(base64AudioData: string): Promise<void>;
    stopAIAudio(): void;
    isAIAudioPlaying(): boolean;
    /**
     * Plays a raw audio buffer (Int16 PCM data) with proper sample rate
     */
    playRecordedAudio(audioBuffer: ArrayBuffer, sampleRate?: number): Promise<void>;
    isAudioEnabled(): boolean;
    getLatestAudioBuffer(): ArrayBuffer | null;
    clearLatestAudioBuffer(): void;
    getEffectiveVolume(category: VolumeCategory, specificVolume?: number): number;
    muteAll(): void;
    unmuteAll(): void;
    destroy(): void;
}

/**
 * State information for a live session.
 */
interface LiveSessionState {
    /** Whether the session is currently active */
    isActive: boolean;
    /** Timestamp when session started */
    startTime?: number;
    /** Timestamp when session ended */
    endTime?: number;
    /** Number of messages received */
    messageCount: number;
    /** Number of tool calls executed */
    toolCallCount: number;
    /** Last error message if any */
    lastError?: string;
}
/**
 * Skybox Agent for generating 360-degree equirectangular backgrounds through conversation.
 *
 * @example Basic usage
 * ```typescript
 * // 1. Enable audio (required for live sessions)
 * await xb.core.sound.enableAudio();
 *
 * // 2. Create agent
 * const agent = new xb.SkyboxAgent(xb.core.ai, xb.core.sound, xb.core.scene);
 *
 * // 3. Start session
 * await agent.startLiveSession({
 *   onopen: () => console.log('Session ready'),
 *   onmessage: (msg) => handleMessage(msg),
 *   onclose: () => console.log('Session closed')
 * });
 *
 * // 4. Clean up when done
 * await agent.stopLiveSession();
 * xb.core.sound.disableAudio();
 * ```
 *
 * @example With lifecycle callbacks
 * ```typescript
 * const agent = new xb.SkyboxAgent(
 *   xb.core.ai,
 *   xb.core.sound,
 *   xb.core.scene,
 *   {
 *     onSessionStart: () => updateUI('active'),
 *     onSessionEnd: () => updateUI('inactive'),
 *     onError: (error) => showError(error)
 *   }
 * );
 * ```
 *
 * @remarks
 * - Audio must be enabled BEFORE starting live session using `xb.core.sound.enableAudio()`
 * - Users are responsible for managing audio lifecycle
 * - Always call `stopLiveSession()` before disabling audio
 * - Session state can be checked using `getSessionState()` and `getLiveSessionState()`
 */
declare class SkyboxAgent extends Agent {
    private sound;
    private sessionState;
    constructor(ai: AI, sound: CoreSound, scene: THREE.Scene, callbacks?: AgentLifecycleCallbacks);
    /**
     * Starts a live AI session for real-time conversation.
     *
     * @param callbacks - Optional callbacks for session events. Can also be set using ai.setLiveCallbacks()
     * @throws If AI model is not initialized or live session is not available
     *
     * @remarks
     * Audio must be enabled separately using `xb.core.sound.enableAudio()` before starting the session.
     * This gives users control over when microphone permissions are requested.
     */
    startLiveSession(callbacks?: GoogleGenAITypes.LiveCallbacks): Promise<void>;
    /**
     * Stops the live AI session.
     *
     * @remarks
     * Audio must be disabled separately using `xb.core.sound.disableAudio()` after stopping the session.
     */
    stopLiveSession(): Promise<void>;
    /**
     * Wraps user callbacks to track session state and trigger lifecycle events.
     * @param callbacks - The callbacks to wrap.
     * @returns The wrapped callbacks.
     */
    private wrapCallbacks;
    /**
     * Sends tool execution results back to the AI.
     *
     * @param response - The tool response containing function results
     */
    sendToolResponse(response: GoogleGenAITypes.LiveSendToolResponseParameters): Promise<void>;
    /**
     * Validates that a tool response has the correct format.
     * @param response - The tool response to validate.
     * @returns True if the response is valid, false otherwise.
     */
    private validateToolResponse;
    /**
     * Helper to create a properly formatted tool response from a ToolResult.
     *
     * @param id - The function call ID
     * @param name - The function name
     * @param result - The ToolResult from tool execution
     * @returns A properly formatted FunctionResponse
     */
    static createToolResponse(id: string, name: string, result: ToolResult): GoogleGenAITypes.FunctionResponse;
    /**
     * Gets the current live session state.
     *
     * @returns Read-only session state information
     */
    getLiveSessionState(): Readonly<LiveSessionState>;
    /**
     * Gets the duration of the session in milliseconds.
     *
     * @returns Duration in ms, or null if session hasn't started
     */
    getSessionDuration(): number | null;
}

interface GetWeatherArgs {
    latitude: number;
    longitude: number;
}
interface WeatherData {
    temperature: number;
    weathercode: number;
}
/**
 * A tool that gets the current weather for a specific location.
 */
declare class GetWeatherTool extends Tool {
    constructor();
    /**
     * Executes the tool's action.
     * @param args - The arguments for the tool.
     * @returns A promise that resolves with a ToolResult containing weather information.
     */
    execute(args: GetWeatherArgs): Promise<ToolResult<WeatherData>>;
}

/**
 * A tool that generates a 360-degree equirectangular skybox image
 * based on a given prompt using an AI service.
 */
declare class GenerateSkyboxTool extends Tool {
    private ai;
    private scene;
    constructor(ai: AI, scene: THREE.Scene);
    /**
     * Executes the tool's action.
     * @param args - The prompt to use to generate the skybox.
     * @returns A promise that resolves with a ToolResult containing success/error information.
     */
    execute(args: {
        prompt: string;
    }): Promise<ToolResult<string>>;
}

/**
 * Enum for video stream states.
 */
declare enum StreamState {
    IDLE = "idle",
    INITIALIZING = "initializing",
    STREAMING = "streaming",
    ERROR = "error",
    NO_DEVICES_FOUND = "no_devices_found"
}
type VideoStreamDetails = {
    force?: boolean;
    error?: Error;
};
interface VideoStreamEventMap<T> extends THREE.Object3DEventMap {
    statechange: {
        state: StreamState;
        details?: T;
    };
}
type VideoStreamGetSnapshotImageDataOptionsBase = {
    /** The target width, defaults to the video width. */
    width?: number;
    /** The target height, defaults to the video height. */
    height?: number;
};
type VideoStreamGetSnapshotImageDataOptions = VideoStreamGetSnapshotImageDataOptionsBase & {
    outputFormat: 'imageData';
};
type VideoStreamGetSnapshotBase64Options = VideoStreamGetSnapshotImageDataOptionsBase & {
    outputFormat: 'base64';
    mimeType?: string;
    quality?: number;
};
type VideoStreamGetSnapshotBlobOptions = VideoStreamGetSnapshotImageDataOptionsBase & {
    outputFormat: 'blob';
    mimeType?: string;
    quality?: number;
};
type VideoStreamGetSnapshotTextureOptions = VideoStreamGetSnapshotImageDataOptionsBase & {
    outputFormat?: 'texture';
};
type VideoStreamGetSnapshotOptions = VideoStreamGetSnapshotImageDataOptions | VideoStreamGetSnapshotBase64Options | VideoStreamGetSnapshotTextureOptions | VideoStreamGetSnapshotBlobOptions;
type VideoStreamOptions = {
    /** Hint for performance optimization for frequent captures. */
    willCaptureFrequently?: boolean;
};
/**
 * The base class for handling video streams (from camera or file), managing
 * the underlying <video> element, streaming state, and snapshot logic.
 */
declare class VideoStream<T extends VideoStreamDetails = VideoStreamDetails> extends Script<VideoStreamEventMap<T>> {
    loaded: boolean;
    width?: number;
    height?: number;
    aspectRatio?: number;
    texture: THREE.Texture;
    state: StreamState;
    protected stream_: MediaStream | null;
    protected video_: HTMLVideoElement;
    get video(): HTMLVideoElement;
    private willCaptureFrequently_;
    private frozenTexture_;
    private canvas_;
    private context_;
    /**
     * @param options - The configuration options.
     */
    constructor({ willCaptureFrequently }?: VideoStreamOptions);
    /**
     * Sets the stream's state and dispatches a 'statechange' event.
     * @param state - The new state.
     * @param details - Additional data for the event payload.
     */
    protected setState_(state: StreamState, details?: VideoStreamDetails | T): void;
    /**
     * Processes video metadata, sets dimensions, and resolves a promise.
     * @param resolve - The resolve function of the wrapping Promise.
     * @param reject - The reject function of the wrapping Promise.
     * @param allowRetry - Whether to allow a retry attempt on failure.
     */
    protected handleVideoStreamLoadedMetadata(resolve: () => void, reject: (_: Error) => void, allowRetry?: boolean): void;
    /**
     * Captures the current video frame.
     * @param options - The options for the snapshot.
     * @returns The captured data.
     */
    getSnapshot(options: VideoStreamGetSnapshotImageDataOptions): ImageData;
    getSnapshot(options: VideoStreamGetSnapshotBase64Options): Promise<string | null>;
    getSnapshot(options: VideoStreamGetSnapshotTextureOptions): THREE.Texture;
    getSnapshot(options: VideoStreamGetSnapshotBlobOptions): Promise<Blob | null>;
    /**
     * Stops the current video stream tracks.
     */
    protected stop_(): void;
    /**
     * Disposes of all resources used by this stream.
     */
    dispose(): void;
}

interface CameraDeviceInfo {
    deviceId: string;
    groupId: string;
    kind: MediaDeviceKind;
    label: string;
}
/** Optional camera source installed by the desktop simulator at runtime. */
interface SimulatorCameraSource {
    enumerateDevices(): Promise<CameraDeviceInfo[]>;
    getMedia(constraints?: MediaTrackConstraints): MediaStream | null | undefined;
}

type MediaOrSimulatorMediaDeviceInfo = MediaDeviceInfo | CameraDeviceInfo;
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
declare class XRDeviceCamera extends VideoStream<XRDeviceCameraDetails> {
    private options;
    private static readonly XR_CAMERA_ACCESS_TIMEOUT_MS;
    simulatorCamera?: SimulatorCameraSource;
    rgbToDepthParams: RgbToDepthParams;
    protected videoConstraints_: MediaTrackConstraints;
    private isInitializing_;
    private availableDevices_;
    private currentDeviceIndex_;
    private currentTrackSettings_?;
    private renderer_?;
    private useXRCameraAccess_;
    private xrCameraTexture_?;
    private xrCameraAccessTimeout_;
    private disposed_;
    /**
     * @param options - The configuration options.
     */
    constructor(options: DeviceCameraOptions);
    /**
     * Retrieves the list of available video input devices.
     * @returns A promise that resolves with an
     * array of video devices.
     */
    getAvailableVideoDevices(): Promise<MediaOrSimulatorMediaDeviceInfo[]>;
    /**
     * Sets the renderer reference, needed for WebXR camera access fallback.
     */
    setRenderer(renderer: THREE.WebGLRenderer): void;
    /**
     * Initializes the camera based on the initial constraints.
     */
    init(): Promise<void>;
    protected getDeviceIdFromLabel(label: string): string | null;
    /**
     * Initializes the media stream from the user's camera. After the stream
     * starts, it updates the current device index based on the stream's active
     * track.
     */
    protected initStream_(): Promise<void>;
    /**
     * Sets the active camera by its device ID. Removes potentially conflicting
     * constraints such as facingMode.
     * @param deviceId - Device ID
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
    /**
     * Whether the camera is using the WebXR Raw Camera Access API fallback.
     */
    get isUsingXRCameraAccess(): boolean;
    /**
     * Updates the camera texture from the WebXR Raw Camera Access API.
     * Must be called each frame from the render loop when in XR camera mode.
     */
    updateXRCamera(frame: XRFrame): void;
    registerSimulatorCamera(simulatorCamera?: SimulatorCameraSource): void;
    dispose(): void;
    private startXRCameraAccessFallback_;
    private isXRCameraAccessGranted_;
    private clearXRCameraAccessTimeout_;
}

type DeviceCameraParameters = {
    projectionMatrix: THREE.Matrix4;
    getCameraPose: (camera: THREE.Camera, xrCameras: THREE.WebXRArrayCamera, target: THREE.Matrix4) => void;
};
declare const DEVICE_CAMERA_PARAMETERS: {
    [key: string]: DeviceCameraParameters;
};
declare function getDeviceCameraClipFromView(renderCamera: THREE.PerspectiveCamera, deviceCamera: XRDeviceCamera, targetDevice: string): THREE.Matrix4;
declare function getDeviceCameraWorldFromView(renderCamera: THREE.PerspectiveCamera, xrCameras: THREE.WebXRArrayCamera | null, deviceCamera: XRDeviceCamera, targetDevice: string): THREE.Matrix4;
declare function getDeviceCameraWorldFromClip(renderCamera: THREE.PerspectiveCamera, xrCameras: THREE.WebXRArrayCamera | null, deviceCamera: XRDeviceCamera, targetDevice: string): THREE.Matrix4;
type CameraParametersSnapshot = {
    clipFromView: THREE.Matrix4;
    viewFromClip: THREE.Matrix4;
    worldFromView: THREE.Matrix4;
    worldFromClip: THREE.Matrix4;
};
/**
 * Whether a device-camera pose can currently be resolved. This is false during
 * the brief startup window before either the simulator camera is registered or
 * the WebXR session exposes its cameras. While false, camera parameters are
 * genuinely unavailable, and camera-dependent work should be skipped rather
 * than run against a camera that does not exist yet.
 *
 * @param deviceCamera - The device camera, if configured.
 * @param xrCameras - The WebXR array camera, or null outside an XR session.
 * @returns True once a camera pose can be resolved.
 */
declare function isDeviceCameraPoseAvailable(deviceCamera: XRDeviceCamera | undefined, xrCameras: THREE.WebXRArrayCamera | null): boolean;
/**
 * Builds a snapshot of the device camera's view/projection matrices, or returns
 * `null` while no camera pose is available yet (see
 * {@link isDeviceCameraPoseAvailable}). Returning `null` lets per-frame callers
 * skip cleanly during startup instead of throwing on every frame until a
 * camera appears.
 */
declare function getCameraParametersSnapshot(camera: THREE.PerspectiveCamera, xrCameras: THREE.WebXRArrayCamera | null, deviceCamera: XRDeviceCamera, targetDevice: string): CameraParametersSnapshot | null;
/**
 * Raycasts to the depth mesh to find the world position and normal at a given UV coordinate.
 * @param rgbUv - The UV coordinate to raycast from.
 * @param depthMeshSnapshot - The depth mesh to raycast against.
 * @param cameraParametersSnapshot - Parameters of the device camera relative to the render camera's world.
 * @returns The world position, normal, and depth at the given UV coordinate.
 */
declare function transformRgbUvToWorld(rgbUv: THREE.Vector2, depthMeshSnapshot: THREE.Mesh, cameraParametersSnapshot: {
    worldFromView: THREE.Matrix4;
    worldFromClip: THREE.Matrix4;
}): {
    worldPosition: THREE.Vector3;
    worldNormal: THREE.Vector3;
    depthInMeters: number;
} | null;
/**
 * Asynchronously crops an image (provided as a base64 string or ImageData) using a THREE.Box2 bounding box.
 * This function draws a specified portion of the image to a canvas and returns the canvas content as a new base64 string.
 * @param imageSource - The source image as a base64 string or ImageData object.
 * @param boundingBox - The bounding box with relative coordinates (0-1) for cropping.
 * @returns A promise that resolves with the base64 string of the cropped image.
 */
declare function cropImage(imageSource: string | ImageData, boundingBox: THREE.Box2): Promise<string>;

declare function intrinsicsToProjectionMatrix(K: number[], width: number, height: number, near: number, far: number, target: THREE.Matrix4): THREE.Matrix4;

/**
 * The number of hands tracked in a typical XR session (left and right).
 */
declare const NUM_HANDS = 2;
/**
 * The number of joints per hand tracked in a typical XR session.
 */
declare const HAND_JOINT_COUNT = 25;
/**
 * The pairs of joints as an adjcent list.
 */
declare const HAND_JOINT_IDX_CONNECTION_MAP: number[][];
/**
 * The pairs of bones' ids per angle as an adjcent list.
 */
declare const HAND_BONE_IDX_CONNECTION_MAP: number[][];
/**
 * A small depth offset (in meters) applied between layered UI elements to
 * prevent Z-fighting, which is a visual artifact where surfaces at similar
 * depths appear to flicker.
 */
declare const VIEW_DEPTH_GAP = 0.002;
/**
 * The THREE.js rendering layer used exclusively for objects that should only be
 * visible to the left eye's camera in stereoscopic rendering.
 */
declare const LEFT_VIEW_ONLY_LAYER = 1;
/**
 * The THREE.js rendering layer used exclusively for objects that should only be
 * visible to the right eye's camera in stereoscopic rendering.
 */
declare const RIGHT_VIEW_ONLY_LAYER = 2;
/**
 * The THREE.js rendering layer for virtual objects that should be realistically
 * occluded by real-world objects when depth sensing is active.
 */
declare const OCCLUDABLE_ITEMS_LAYER = 3;
/**
 * The default ideal width in pixels for requesting the device camera stream.
 * Corresponds to a 720p resolution.
 */
declare const DEFAULT_DEVICE_CAMERA_WIDTH = 1280;
/**
 * The default ideal height in pixels for requesting the device camera stream.
 * Corresponds to a 720p resolution.
 */
declare const DEFAULT_DEVICE_CAMERA_HEIGHT = 720;
declare const XR_BLOCKS_ASSETS_PATH = "https://cdn.jsdelivr.net/gh/xrblocks/assets@5582bd1b2d1a4e19f7ee7093b63a5ee328e974ac/";

declare class ScreenshotSynthesizer {
    private pendingScreenshotRequests;
    private virtualCanvas?;
    private virtualBuffer;
    private virtualRenderTarget?;
    private virtualRealCanvas?;
    private virtualRealBuffer;
    private virtualRealRenderTarget?;
    private fullScreenQuad?;
    private renderTargetWidth;
    private virtualCaptureInFlight;
    private virtualRealCaptureInFlight;
    onAfterRender(renderer: THREE.WebGLRenderer, renderSceneFn: () => void, deviceCamera?: XRDeviceCamera): Promise<void>;
    private createVirtualImageDataURL;
    private resolveVirtualOnlyRequests;
    private rejectVirtualOnlyRequests;
    private createVirtualRealImageDataURL;
    private resolveVirtualRealRequests;
    private rejectVirtualRealRequests;
    private getFullScreenQuad;
    /**
     * Requests a screenshot from the scene as a DataURL.
     * @param overlayOnCamera - If true, overlays the image on a camera image
     *     without any projection or aspect ratio correction.
     * @returns Promise which returns the screenshot as a data uri.
     */
    getScreenshot(overlayOnCamera?: boolean): Promise<string>;
}

/**
 * Tracks elapsed simulation time independently from browser wall time.
 */
declare class SimulationTimer {
    private elapsedMs;
    private previousFrameTimeMs?;
    getElapsedMs(): number;
    update(frameTimeMs: number, timescale: number): void;
    step(dtMs: number, timescale: number): void;
    pause(): void;
}

type Vec2Tuple = [number, number];
type Vec3Tuple = [number, number, number];
type QuatTuple = [number, number, number, number];
type SemanticSource = 'xrblocks' | 'three' | 'app';
interface SemanticBounds {
    center: Vec3Tuple;
    size: Vec3Tuple;
}
interface SemanticViewData {
    rendered: boolean;
    inFrame: boolean;
    inLineOfSight: boolean;
    /**
     * Normalized horizontal screen coordinate: 0 at the left edge, 1 at the
     * right edge.
     */
    x?: number;
    /**
     * Normalized vertical screen coordinate: 0 at the top edge, 1 at the
     * bottom edge. This matches detector 2D bounding-box conventions.
     */
    y?: number;
}
interface SemanticNode {
    id: string;
    role: string;
    name: string;
    visible: boolean;
    /** Local pointer-hit policy. Ancestor policies remain visible in the tree. */
    pointerEvents: PointerEvents;
    /** Local interaction policy. */
    interactionEnabled: boolean;
    position: Vec3Tuple;
    children: string[];
    parentId?: string;
    objectId?: number;
    source?: SemanticSource;
    type?: string;
    text?: string;
    traits?: string[];
    disabled?: boolean;
    selected?: boolean;
    hovered?: boolean;
    value?: number;
    min?: number;
    max?: number;
    bounds?: SemanticBounds;
    view?: SemanticViewData;
}
interface SemanticTree {
    snapshotId: string;
    /** Elapsed simulation time in milliseconds when the snapshot was captured. */
    capturedAt: number;
    rootIds: string[];
    nodes: Record<string, SemanticNode>;
}
type VisibleObjectsContext = SemanticTree;
interface SetOfMark {
    label: string;
    nodeId: string;
    role: string;
    name: string;
    /**
     * Normalized horizontal screen coordinate: 0 at the left edge, 1 at the
     * right edge.
     */
    x: number;
    /**
     * Normalized vertical screen coordinate: 0 at the top edge, 1 at the
     * bottom edge. This matches detector 2D bounding-box conventions.
     */
    y: number;
}
interface SetOfMarkContext {
    snapshotId: string;
    /** Elapsed simulation time in milliseconds when the snapshot was captured. */
    capturedAt: number;
    image: string;
    marks: SetOfMark[];
}
type SemanticMetadata = {
    role?: string;
    name?: string;
    text?: string;
    traits?: string[];
    hidden?: boolean;
    disabled?: boolean;
    source?: SemanticSource;
};

type SceneContextDetectionOptions = {
    semanticTree?: boolean;
    visibleObjects?: boolean;
    setOfMark?: boolean;
};
type SceneContextDetectionResult = {
    semanticTree?: SemanticTree;
    visibleObjects?: VisibleObjectsContext;
    setOfMark?: SetOfMarkContext;
};
declare class SceneDetector extends Script {
    private static readonly dependencies;
    private options;
    private scene;
    private camera;
    private screenshotSynthesizer;
    private simulationTimer?;
    private interaction?;
    private deviceCamera?;
    private registry;
    private snapshot;
    private snapshotPromise;
    private activeClients;
    private currentDetectionPromise;
    private currentVisibleObjectsPromise;
    private currentSetOfMarkPromise;
    private currentContextPromise;
    private currentContextRequestKey;
    private lastContinuousDetectionStartedAtMs;
    private disposed;
    /**
     * The latest semantic tree produced by scene context detection.
     */
    tree: SemanticTree | null;
    /**
     * The latest semantic tree annotated with user-view visibility.
     */
    visibleObjects: VisibleObjectsContext | null;
    /**
     * The latest Set-of-Mark context image and label mapping.
     */
    setOfMark: SetOfMarkContext | null;
    init({ options, scene, camera, screenshotSynthesizer, simulationTimer, interaction, deviceCamera, }: {
        options: ContextOptions;
        scene: THREE.Scene;
        camera: THREE.Camera;
        screenshotSynthesizer: ScreenshotSynthesizer;
        simulationTimer?: SimulationTimer;
        interaction?: Interaction;
        deviceCamera?: XRDeviceCamera;
    }): void;
    setDeviceCamera(deviceCamera: XRDeviceCamera | undefined): void;
    resolveNodeObject(nodeId: string): THREE.Object3D | undefined;
    start(client: object): void;
    stop(client: object): void;
    update(): void;
    shouldRunContinuous(now?: number): true | undefined;
    runDetection(): Promise<SemanticTree>;
    runVisibleObjectsDetection(): Promise<VisibleObjectsContext>;
    runSetOfMarkDetection(): Promise<SetOfMarkContext>;
    runContextDetection(options?: SceneContextDetectionOptions, snapshotOptions?: {
        preserveVisibleObjects?: boolean;
    }): Promise<SceneContextDetectionResult>;
    private runContinuousDetection;
    private detectSceneContext;
    private beginSnapshot;
    private getSemanticTree;
    private getVisibleObjectsContext;
    private getSetOfMarkContext;
    private getSnapshot;
    dispose(): void;
    private getCaptureTimeMs;
}

declare class Context extends Script {
    static dependencies: {
        options: typeof ContextOptions;
        scene: typeof THREE.Scene;
        camera: typeof THREE.Camera;
        screenshotSynthesizer: typeof ScreenshotSynthesizer;
    };
    editorIcon: string;
    /**
     * Configuration options for all context-sensing features.
     */
    options: ContextOptions;
    /**
     * The scene context module instance. Null if not enabled.
     */
    scene?: SceneDetector;
    private deviceCamera?;
    init({ options, deviceCamera, }: {
        options: ContextOptions;
        scene: THREE.Scene;
        camera: THREE.Camera;
        screenshotSynthesizer: ScreenshotSynthesizer;
        deviceCamera?: XRDeviceCamera;
    }): void;
    setDeviceCamera(deviceCamera: XRDeviceCamera | undefined): void;
    dispose(): void;
    private removeDetectors;
}

declare enum ScriptsManagerEventType {
    EXCEPTION = "exception"
}
type ScriptsManagerEventMap = THREE.Object3DEventMap & {
    [ScriptsManagerEventType.EXCEPTION]: {
        scriptName: string;
        context: string;
        error: Error;
        timestamp: number;
    };
};
declare class ScriptsManager extends THREE.EventDispatcher<ScriptsManagerEventMap> implements InteractionCallbackDispatch {
    private readonly initScriptFunction;
    private readonly activeScripts;
    private readonly hookScripts;
    private readonly pendingInitializations;
    private readonly seenScripts;
    private readonly interactionCandidates;
    private readonly failedScripts;
    private readonly syncPromises;
    private readonly traversalStack;
    private disposed;
    private disposalPromise?;
    /** Whether to catch all exceptions thrown by developer scripts. */
    catchExceptions: boolean;
    beforeDispose?: (script: Script) => void;
    afterDispose?: (script: Script) => void;
    constructor(initScriptFunction: (script: Script) => Promise<void>);
    /** Objects found during the lifecycle traversal that direct touch can use. */
    get directTouchCandidates(): ReadonlySet<THREE.Object3D>;
    isScript: (object: THREE.Object3D) => boolean;
    hasTargetHandler: (object: THREE.Object3D, sourceType: InteractionSourceType) => boolean;
    hasTargetHook: (object: THREE.Object3D, hook: TargetedInteractionHook) => boolean;
    invokeTarget: (object: THREE.Object3D, hook: TargetedInteractionHook, argument: unknown) => void;
    invokeGlobal: <Hook extends GlobalInteractionHook>(hook: Hook, event: GlobalInteractionEvent<Hook>) => void;
    invokeManipulation: (script: Script, event: ManipulationEvent) => void;
    invokeSemantic: (object: THREE.Object3D, callback: () => void) => void;
    private handleException;
    private handleScriptError;
    /** Reports an asynchronous subsystem error against its owning Script. */
    reportError(error: unknown, script: Script, context: string): void;
    /**
     * Calls one targeted hook along a captured Script path. Developer errors use
     * the same exception policy as global Script callbacks.
     */
    callTargeted(path: Iterable<Script>, context: string, callback: (script: Script) => void): void;
    /**
     * Initializes a script and adds it to the set of scripts which will receive
     * callbacks. Concurrent calls share one initialization.
     * @param script - The script to initialize
     * @returns A promise which resolves when the script is initialized.
     */
    initScript(script: Script): Promise<void>;
    private finishInitialization;
    /**
     * Uninitializes a script calling dispose and removes it from the set of
     * scripts which will receive callbacks. A pending initialization is disposed
     * after it finishes and is never activated.
     * @param script - The script to uninitialize.
     */
    uninitScript(script: Script): void;
    /** Disposes every Script generation and prevents further initialization. */
    dispose(): Promise<void>;
    private finishDisposal;
    private disposeScript;
    /** Helper for scene traversal to avoid closure allocation. */
    private checkScript;
    private scanScene;
    /**
     * Finds all scripts in the scene and initializes them or uninitializes them.
     * Returns a promise which resolves when all new scripts finish initializing.
     * @param scene - The main scene which is used to find scripts.
     */
    syncScriptsWithScene(scene: THREE.Scene): Promise<PromiseSettledResult<void>[]>;
    callSelecting: (event: SelectEvent) => void;
    callSqueezing: (controller: Controller) => void;
    update: (time: number, frame: XRFrame) => void;
    physicsStep: () => void;
    callSelectStart: (event: SelectEvent) => void;
    callSelectEnd: (event: SelectEndEvent) => void;
    callSelect: (event: SelectEvent) => void;
    callLongSelect: (event: LongSelectEvent) => void;
    callSqueezeStart: (raw: ControllerEvent) => void;
    callSqueezeEnd: (raw: ControllerEvent) => void;
    callSqueeze: (raw: ControllerEvent) => void;
    callKeyDown: (event: KeyEvent) => void;
    callKeyUp: (event: KeyEvent) => void;
    onXRSessionStarted: (session: XRSession) => void;
    onXRSessionEnded: () => void;
    onSimulatorStarted: () => void;
    private callHook;
    private hasOverriddenHook;
    private hasIndexedHook;
    private getHookSet;
    private indexScript;
    private unindexScript;
}

declare class WaitFrame {
    private callbacks;
    /**
     * Executes all registered callbacks and clears the list.
     */
    onFrame(): void;
    /**
     * Wait for the next frame.
     */
    waitFrame(): Promise<void>;
}

/**
 * Interface representing the result of a permission request.
 */
interface PermissionResult {
    granted: boolean;
    status: PermissionState | 'unknown' | 'error';
    error?: string;
}
interface PermissionRequestOptions {
    allowVideoFallback?: boolean;
}
/**
 * A utility class to manage and request browser permissions for
 * Location, Camera, and Microphone.
 */
declare class PermissionsManager {
    /**
     * Requests permission to access the user's geolocation.
     * Note: This actually attempts to fetch the position to trigger the prompt.
     */
    requestLocationPermission(): Promise<PermissionResult>;
    /**
     * Requests permission to access the microphone.
     * Opens a stream to trigger the prompt, then immediately closes it.
     */
    requestMicrophonePermission(): Promise<PermissionResult>;
    /**
     * Requests permission to access the camera.
     * Opens a stream to trigger the prompt, then immediately closes it.
     */
    requestCameraPermission(options?: PermissionRequestOptions): Promise<PermissionResult>;
    /**
     * Requests permission for both camera and microphone simultaneously.
     */
    requestAVPermission(): Promise<PermissionResult>;
    /**
     * Internal helper to handle getUserMedia requests.
     * Crucially, this stops the tracks immediately after permission is granted
     * so the hardware doesn't remain active.
     */
    private requestMediaPermission;
    private shouldAllowVideoFallback;
    private isVideoOnlyRequest;
    /**
     * Requests multiple permissions sequentially.
     * Returns a single result: granted is true only if ALL requested permissions are granted.
     */
    checkAndRequestPermissions({ geolocation, camera, microphone, }: {
        geolocation?: boolean;
        camera?: boolean;
        microphone?: boolean;
    }, options?: PermissionRequestOptions): Promise<PermissionResult>;
    /**
     * Checks the current status of a permission without triggering a prompt.
     * Useful for UI state (e.g., disabling buttons if already denied).
     * * @param permissionName - 'geolocation', 'camera', or 'microphone'
     */
    checkPermissionStatus(permissionName: 'geolocation' | 'camera' | 'microphone'): Promise<PermissionState | 'unknown'>;
}

declare enum WebXRSessionEventType {
    UNSUPPORTED = "unsupported",
    READY = "ready",
    SESSION_START = "sessionstart",
    SESSION_END = "sessionend"
}
type WebXRSessionManagerEventMap = THREE.Object3DEventMap & {
    [WebXRSessionEventType.UNSUPPORTED]: object;
    [WebXRSessionEventType.READY]: {
        sessionOptions: XRSessionInit;
    };
    [WebXRSessionEventType.SESSION_START]: {
        session: XRSession;
    };
    [WebXRSessionEventType.SESSION_END]: object;
};
/**
 * Manages the WebXR session lifecycle by extending THREE.EventDispatcher
 * to broadcast its state to any listener.
 */
declare class WebXRSessionManager extends THREE.EventDispatcher<WebXRSessionManagerEventMap> {
    private renderer;
    private sessionInit;
    private mode;
    currentSession?: XRSession;
    private sessionOptions?;
    private xrModeSupported?;
    private waitingForXRSession;
    private disposed;
    private disposalPromise?;
    constructor(renderer: THREE.WebGLRenderer, sessionInit: XRSessionInit, mode: XRSessionMode);
    /**
     * Checks for WebXR support and availability of the requested session mode.
     * This should be called to initialize the manager and trigger the first
     * events.
     */
    initialize(): Promise<void>;
    /**
     * Ends the WebXR session.
     */
    startSession(): void;
    /**
     * Ends the WebXR session.
     */
    endSession(): Promise<void>;
    /**
     * Returns whether XR is supported. Will be undefined until initialize is
     * complete.
     */
    isXRSupported(): boolean | undefined;
    getSessionOptions(): XRSessionInit | undefined;
    /** Internal callback for when a session successfully starts. */
    private onSessionStartedInternal;
    /** Internal callback for when the session ends. */
    private onSessionEndedInternal;
    dispose(): Promise<void>;
}

declare class XRButton {
    private sessionManager;
    private permissionsManager;
    private appTitle;
    private appDescription;
    private startText;
    private endText;
    private invalidText;
    private startSimulatorText;
    startSimulator: () => void;
    private permissions;
    domElement: HTMLDivElement;
    simulatorButtonElement: HTMLButtonElement;
    xrButtonElement: HTMLButtonElement;
    private disposed;
    constructor(sessionManager: WebXRSessionManager, permissionsManager: PermissionsManager, appTitle?: string, appDescription?: string, startText?: string, endText?: string, invalidText?: string, startSimulatorText?: string, showEnterSimulatorButton?: boolean, startSimulator?: () => void, permissions?: {
        geolocation: boolean;
        camera: boolean;
        microphone: boolean;
    });
    private onUnsupported;
    private onReady;
    private onSessionStart;
    private onSessionEnd;
    private createSimulatorButton;
    private createXRAppTitle;
    private createXRAppDescription;
    private createXRButtonElement;
    private onSessionReady;
    private showXRNotSupported;
    private onSessionStarted;
    private onSessionEnded;
    dispose(): void;
}

declare class XRPass extends Pass {
    render(_renderer: THREE.WebGLRenderer, _writeBuffer: THREE.WebGLRenderTarget, _readBuffer: THREE.WebGLRenderTarget, _deltaTime: number, _maskActive: boolean, _viewId?: number): void;
}
/**
 * XREffects manages the XR rendering pipeline.
 * Use core.effects
 * It handles multiple passes and render targets for applying effects to XR
 * scenes.
 */
declare class XREffects {
    private renderer;
    private scene;
    private timer;
    passes: XRPass[];
    renderTargets: THREE.WebGLRenderTarget[];
    dimensions: THREE.Vector2;
    constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, timer: THREE.Timer);
    /**
     * Adds a pass to the effect pipeline.
     */
    addPass(pass: XRPass): void;
    /**
     * Sets up render targets for the effect pipeline.
     */
    setupRenderTargets(dimensions: THREE.Vector2): void;
    /**
     * Renders the XR effects.
     */
    render(camera: THREE.Camera): void;
    private renderXr;
    private renderSimulator;
    dispose(): void;
}

/**
 * Manages and caches WebXR reference spaces for the active XR session.
 */
declare class XRReferenceSpaceCache {
    private spaces;
    private session;
    /**
     * Called when an XR session starts to reset the cache and request all reference spaces.
     * @param session - The newly started WebXR session.
     */
    onXRSessionStart(session: XRSession): void;
    /**
     * Synchronously returns a reference space if it has already been cached.
     * @param type - The reference space type to check.
     */
    getCached(type: XRReferenceSpaceType): XRReferenceSpace | undefined;
    /**
     * Converts a pose from a source reference space to a target reference space using the active XRFrame.
     * @param pose - The pose in the source reference space.
     * @param from - The source reference space type or XRSpace instance.
     * @param to - The target reference space type or XRSpace instance.
     * @param frame - The active XR frame.
     * @returns The converted pose in the target reference space, or null if reference spaces or relative pose cannot be resolved.
     */
    convertPose(pose: XRRigidTransform, from: XRReferenceSpaceType | XRSpace, to: XRReferenceSpaceType | XRSpace, frame: XRFrame): XRRigidTransform | null;
}

type SimulatorVector3Tuple = [number, number, number];
type SimulatorQuaternionTuple = [number, number, number, number];
type SimulatorPhysicsMode = false | 'fixed' | 'dynamic';
interface SimulatorLocationDefinition {
    /** Short agent-facing description of the location's intended use. */
    description: string;
    /** World-space coordinates accepted directly by simulator controls. */
    position: SimulatorVector3Tuple;
}
type SimulatorLocations = Record<string, SimulatorLocationDefinition>;
interface SimulatorObjectDefinition {
    id?: string;
    assetPath?: string;
    object?: THREE.Object3D;
    position?: SimulatorVector3Tuple;
    quaternion?: SimulatorQuaternionTuple;
    scale?: SimulatorVector3Tuple;
    visible?: boolean;
    detectObject?: boolean;
    label?: string;
    data?: unknown;
    physics?: SimulatorPhysicsMode;
}
interface SimulatorSceneManifest {
    name?: string;
    scenePath?: string;
    videoPath?: string;
    scenePlanesPath?: string;
    navMeshPath?: string;
    position?: SimulatorVector3Tuple;
    quaternion?: SimulatorQuaternionTuple;
    scale?: SimulatorVector3Tuple;
    locations?: SimulatorLocations;
    objects?: SimulatorObjectDefinition[];
}
interface ResolvedSimulatorSceneManifest extends Omit<SimulatorSceneManifest, 'scenePath' | 'videoPath' | 'scenePlanesPath' | 'navMeshPath' | 'objects'> {
    scenePath?: string;
    videoPath?: string;
    scenePlanesPath?: string;
    navMeshPath?: string;
    objects: SimulatorObjectDefinition[];
    manifestUrl: string;
}

declare class DepthTextures {
    private options;
    private float32Arrays;
    private uint8Arrays;
    private dataTextures;
    private nativeTextures;
    depthData: XRCPUDepthInformation[];
    constructor(options: DepthOptions);
    private createDataDepthTextures;
    updateData(depthData: XRCPUDepthInformation, viewId: number, depthDataFormat: XRDepthDataFormat): void;
    updateNativeTexture(depthData: XRWebGLDepthInformation, renderer: THREE.WebGLRenderer, viewId: number): void;
    get(viewId: number): THREE.ExternalTexture | THREE.DataTexture;
}

declare class DepthMesh extends MeshScript {
    private depthOptions;
    private depthTextures?;
    static dependencies: {
        renderer: typeof THREE.WebGLRenderer;
    };
    static isDepthMesh: boolean;
    private worldPosition;
    private worldQuaternion;
    private updateVertexNormals;
    private minDepth;
    private maxDepth;
    private minDepthPrev;
    private maxDepthPrev;
    downsampledGeometry?: THREE.BufferGeometry;
    downsampledMesh?: THREE.Mesh;
    private collider?;
    private colliders;
    private colliderUpdateFps;
    private renderer;
    private projectionMatrixInverse;
    private lastColliderUpdateTime;
    private options;
    private depthTextureMaterialUniforms?;
    private RAPIER?;
    private blendedWorld?;
    private rigidBody?;
    private colliderId;
    constructor(depthOptions: DepthOptions, width: number, height: number, depthTextures?: DepthTextures | undefined);
    /**
     * Initialize the depth mesh.
     */
    init({ renderer }: {
        renderer: THREE.WebGLRenderer;
    }): void;
    /**
     * Updates the depth data and geometry positions based on the provided camera
     * and depth data.
     */
    updateDepth(depthData: Readonly<XRCPUDepthInformation>, projectionMatrixInverse: Readonly<THREE.Matrix4>, depthDataFormat: XRDepthDataFormat): void;
    updatePose(translation: THREE.Vector3, quaternion: THREE.Quaternion): void;
    /**
     * Method to manually update the full resolution geometry.
     * Only needed if options.updateFullResolutionGeometry is false.
     */
    updateFullResolutionGeometry(depthData: XRCPUDepthInformation, depthDataFormat: XRDepthDataFormat): void;
    /**
     * Internal method to update the geometry of the depth mesh.
     */
    private updateGeometry;
    /**
     * Optimizes collider updates to run periodically based on the specified FPS.
     */
    private updateColliderIfNeeded;
    initRapierPhysics(RAPIER: typeof RAPIER_NS, blendedWorld: RAPIER_NS.World): void;
    /**
     * Customizes raycasting to compute normals for intersections.
     * @param raycaster - The raycaster object.
     * @param intersects - Array to store intersections.
     * @returns - True if intersections are found.
     */
    raycast(raycaster: THREE.Raycaster, intersects: THREE.Intersection[]): boolean;
    getColliderFromHandle(handle: RAPIER_NS.ColliderHandle): RAPIER_NS.Collider | undefined;
}

type DepthArray = Float32Array | Uint16Array;
declare class Depth {
    static instance?: Depth;
    private camera;
    private renderer;
    private gpuDepthConverter?;
    enabled: boolean;
    view: XRView[];
    cpuDepthData: XRCPUDepthInformation[];
    gpuDepthData: XRWebGLDepthInformation[];
    depthArray: DepthArray[];
    depthDataFormat?: XRDepthDataFormat;
    depthMesh?: DepthMesh;
    private depthTextures?;
    options: DepthOptions;
    width: number;
    height: number;
    get rawValueToMeters(): number;
    occludableShaders: Set<Shader>;
    private occlusionPass?;
    private depthClientsInitialized;
    private depthClients;
    depthProjectionMatrices: THREE.Matrix4[];
    depthProjectionInverseMatrices: THREE.Matrix4[];
    depthViewMatrices: THREE.Matrix4[];
    depthViewProjectionMatrices: THREE.Matrix4[];
    depthCameraPositions: THREE.Vector3[];
    depthCameraRotations: THREE.Quaternion[];
    /**
     * Transforms from normalized view coordinates to normalized depth buffer
     * coordinates. Identity when matchDepthView is true.
     */
    normDepthBufferFromNormViewMatrices: THREE.Matrix4[];
    /** Timestamp of the last depth mesh geometry update. */
    private lastDepthMeshUpdateTime;
    /**
     * Depth is a lightweight manager based on three.js to simply prototyping
     * with Depth in WebXR.
     */
    constructor();
    /**
     * Initialize Depth manager.
     */
    init(camera: THREE.PerspectiveCamera, options: DepthOptions, renderer: THREE.WebGLRenderer, registry: Registry, scene: THREE.Scene): void;
    /**
     * Retrieves the depth at normalized coordinates (u, v).
     * Note: The UV coordinates are with respect to the user's view, not the depth camera view.
     * @param u - Normalized horizontal coordinate.
     * @param v - Normalized vertical coordinate.
     * @returns Depth value at the specified coordinates.
     */
    getDepth(u: number, v: number): number;
    /**
     * Projects the given world position to depth camera's clip space and then
     * to the depth camera's view space using the depth.
     * @param position - The world position to project.
     * @returns The depth camera view space position.
     */
    getProjectedDepthViewPositionFromWorldPosition(position: THREE.Vector3, target?: THREE.Vector3): THREE.Vector3;
    /**
     * Retrieves the depth at normalized coordinates (u, v).
     * Note: The UV coordinates are with respect to the user's view, not the depth camera view.
     * @param u - Normalized horizontal coordinate.
     * @param v - Normalized vertical coordinate.
     * @returns Vertex at (u, v)
     */
    getVertex(u: number, v: number): THREE.Vector3 | null;
    private updateDepthMatrices;
    updateCPUDepthData(depthData: XRCPUDepthInformation, viewId: number, depthDataFormat: XRDepthDataFormat): void;
    updateGPUDepthData(depthData: XRWebGLDepthInformation, viewId: number): void;
    /**
     * Checks whether the depth mesh geometry should be updated this frame,
     * based on the configured depthMeshUpdateFps. The pose is always updated
     * every frame so the mesh tracks the depth camera smoothly, but the
     * expensive geometry rebuild can be throttled.
     */
    private shouldUpdateDepthMesh;
    getTexture(viewId: number): THREE.ExternalTexture | THREE.DataTexture | undefined;
    update(frame?: XRFrame): void;
    updateLocalDepth(frame: XRFrame): void;
    renderOcclusionPass(): void;
    debugLog(): void;
    resumeDepth(client: object): void;
    pauseDepth(client: object): void;
    /**
     * Manually updates the depth mesh geometry using the cached depth.
     */
    updateFullResolutionDepthMesh(): void;
}

declare class SimulatorMediaDeviceInfo {
    deviceId: string;
    groupId: string;
    kind: MediaDeviceKind;
    label: string;
    constructor(deviceId?: string, groupId?: string, kind?: MediaDeviceKind, label?: string);
}

declare class SimulatorCamera implements SimulatorCameraSource {
    private renderer;
    private cameraCreated;
    private cameraInfo?;
    private mediaStream?;
    private canvas?;
    private context?;
    private fps;
    matchRenderingCamera: boolean;
    width: number;
    height: number;
    camera: THREE.PerspectiveCamera;
    constructor(renderer: THREE.WebGLRenderer);
    init(): void;
    createSimulatorCamera(): void;
    enumerateDevices(): Promise<SimulatorMediaDeviceInfo[]>;
    onBeforeSimulatorSceneRender(camera: THREE.Camera, renderScene: (_: THREE.Camera) => void): void;
    onSimulatorSceneRendered(): void;
    restartVideoTrack(): void;
    getMedia(constraints?: MediaTrackConstraints): MediaStream | null | undefined;
    dispose(): void;
}

declare enum SimulatorRenderMode {
    DEFAULT = "default",
    STEREO_LEFT = "left",
    STEREO_RIGHT = "right"
}

declare class SimulatorControllerState {
    localControllerPositions: THREE.Vector3[];
    localControllerOrientations: THREE.Quaternion[];
    currentControllerIndex: number;
}

type SimulatorHandPoseJoints = {
    t: number[];
    r: number[];
    s?: number[];
}[];
/**
 * Semantic biomechanical hand angles in radians, ordered as [x, y, z].
 *
 * Long fingers:
 * - x: positive flexes toward the palm; negative extends away.
 * - y: positive abducts away from the middle-finger axis; negative adducts.
 * - z: positive axial roll toward the thumb; negative rolls away.
 *
 * Middle finger:
 * - y: positive radial deviation toward index/thumb; negative ulnar deviation.
 *
 * Thumb:
 * - x: positive flexes across the palm; negative extends/repositions.
 * - y: positive palmar abduction away from the palm; negative adducts back.
 * - z: positive opposition/internal roll into the hand; negative repositions away.
 */
type SimulatorHandJointRotationArray = [number, number, number];
type SimulatorHandPoseRotations = Partial<Record<JointName, SimulatorHandJointRotationArray>>;
type SimulatorHandPoseRotationRangeDegrees = readonly [
    minDegrees: number,
    maxDegrees: number
];
type SimulatorHandPoseRotationConstraintsDegrees = Partial<Record<JointName, readonly [
    x: SimulatorHandPoseRotationRangeDegrees,
    y: SimulatorHandPoseRotationRangeDegrees,
    z: SimulatorHandPoseRotationRangeDegrees
]>>;
declare const SIMULATOR_HAND_COMMON_BIOMECHANICAL_CONSTRAINTS_DEGREES: {
    readonly 'thumb-metacarpal': readonly [readonly [-10, 55], readonly [-15, 45], readonly [-20, 45]];
    readonly 'thumb-phalanx-proximal': readonly [readonly [-10, 70], readonly [-15, 15], readonly [0, 0]];
    readonly 'thumb-phalanx-distal': readonly [readonly [-15, 80], readonly [0, 0], readonly [0, 0]];
    readonly 'index-finger-metacarpal': readonly [readonly [0, 0], readonly [0, 0], readonly [0, 0]];
    readonly 'index-finger-phalanx-proximal': readonly [readonly [-30, 90], readonly [-20, 20], readonly [-10, 10]];
    readonly 'index-finger-phalanx-intermediate': readonly [readonly [0, 110], readonly [0, 0], readonly [0, 0]];
    readonly 'index-finger-phalanx-distal': readonly [readonly [0, 80], readonly [0, 0], readonly [0, 0]];
    readonly 'middle-finger-metacarpal': readonly [readonly [0, 0], readonly [0, 0], readonly [0, 0]];
    readonly 'middle-finger-phalanx-proximal': readonly [readonly [-30, 90], readonly [-10, 10], readonly [-10, 10]];
    readonly 'middle-finger-phalanx-intermediate': readonly [readonly [0, 110], readonly [0, 0], readonly [0, 0]];
    readonly 'middle-finger-phalanx-distal': readonly [readonly [0, 80], readonly [0, 0], readonly [0, 0]];
    readonly 'ring-finger-metacarpal': readonly [readonly [0, 0], readonly [0, 0], readonly [0, 0]];
    readonly 'ring-finger-phalanx-proximal': readonly [readonly [-30, 90], readonly [-15, 15], readonly [-10, 10]];
    readonly 'ring-finger-phalanx-intermediate': readonly [readonly [0, 110], readonly [0, 0], readonly [0, 0]];
    readonly 'ring-finger-phalanx-distal': readonly [readonly [0, 80], readonly [0, 0], readonly [0, 0]];
    readonly 'pinky-finger-metacarpal': readonly [readonly [0, 0], readonly [0, 0], readonly [0, 0]];
    readonly 'pinky-finger-phalanx-proximal': readonly [readonly [-30, 90], readonly [-20, 20], readonly [-10, 10]];
    readonly 'pinky-finger-phalanx-intermediate': readonly [readonly [0, 110], readonly [0, 0], readonly [0, 0]];
    readonly 'pinky-finger-phalanx-distal': readonly [readonly [0, 80], readonly [0, 0], readonly [0, 0]];
};
declare function parseSimulatorHandPoseRotations(json: unknown): SimulatorHandPoseRotations;

declare enum SimulatorHandPose {
    NEUTRAL = "neutral",
    RELAXED = "relaxed",
    PINCHING = "pinching",
    FIST = "fist",
    THUMBS_UP = "thumbs_up",
    POINTING = "pointing",
    ROCK = "rock",
    THUMBS_DOWN = "thumbs_down",
    VICTORY = "victory"
}
declare const SIMULATOR_HAND_POSE_NAMES: Readonly<Record<SimulatorHandPose, string>>;

/** Physics world isolated to the simulated physical environment. */
declare class SimulatorPhysics {
    private handOptions;
    readonly RAPIER: RAPIERCompat;
    readonly world: RAPIER_NS.World;
    private hands;
    constructor(physics: Physics, handOptions: SimulatorHandPhysicsOptions);
    constrainHand(index: number, position: THREE.Vector3, enabled: boolean, handOrigin?: THREE.Vector3): void;
    private createHand;
    private clampHandToOrigin;
    private validateHandOptions;
    step(): void;
    dispose(): void;
}

type SimulatorHandPoseHTMLElement = HTMLElement & {
    visible: boolean;
    handPose?: SimulatorHandPose;
};
declare class SimulatorHands {
    private simulatorControllerState;
    private simulatorScene;
    leftController: THREE.Object3D<THREE.Object3DEventMap>;
    rightController: THREE.Object3D<THREE.Object3DEventMap>;
    leftHand?: THREE.Group;
    rightHand?: THREE.Group;
    leftHandBones: Array<THREE.Object3D | undefined>;
    rightHandBones: Array<THREE.Object3D | undefined>;
    leftHandPose?: SimulatorHandPose | undefined;
    rightHandPose?: SimulatorHandPose | undefined;
    leftHandAtMaxRange: boolean;
    rightHandAtMaxRange: boolean;
    leftHandCurrentRotations: Partial<Record<"wrist" | "thumb-metacarpal" | "thumb-phalanx-proximal" | "thumb-phalanx-distal" | "thumb-tip" | "index-finger-metacarpal" | "index-finger-phalanx-proximal" | "index-finger-phalanx-intermediate" | "index-finger-phalanx-distal" | "index-finger-tip" | "middle-finger-metacarpal" | "middle-finger-phalanx-proximal" | "middle-finger-phalanx-intermediate" | "middle-finger-phalanx-distal" | "middle-finger-tip" | "ring-finger-metacarpal" | "ring-finger-phalanx-proximal" | "ring-finger-phalanx-intermediate" | "ring-finger-phalanx-distal" | "ring-finger-tip" | "pinky-finger-metacarpal" | "pinky-finger-phalanx-proximal" | "pinky-finger-phalanx-intermediate" | "pinky-finger-phalanx-distal" | "pinky-finger-tip", SimulatorHandJointRotationArray>>;
    rightHandCurrentRotations: Partial<Record<"wrist" | "thumb-metacarpal" | "thumb-phalanx-proximal" | "thumb-phalanx-distal" | "thumb-tip" | "index-finger-metacarpal" | "index-finger-phalanx-proximal" | "index-finger-phalanx-intermediate" | "index-finger-phalanx-distal" | "index-finger-tip" | "middle-finger-metacarpal" | "middle-finger-phalanx-proximal" | "middle-finger-phalanx-intermediate" | "middle-finger-phalanx-distal" | "middle-finger-tip" | "ring-finger-metacarpal" | "ring-finger-phalanx-proximal" | "ring-finger-phalanx-intermediate" | "ring-finger-phalanx-distal" | "ring-finger-tip" | "pinky-finger-metacarpal" | "pinky-finger-phalanx-proximal" | "pinky-finger-phalanx-intermediate" | "pinky-finger-phalanx-distal" | "pinky-finger-tip", SimulatorHandJointRotationArray>>;
    leftHandTargetRotations: Partial<Record<"wrist" | "thumb-metacarpal" | "thumb-phalanx-proximal" | "thumb-phalanx-distal" | "thumb-tip" | "index-finger-metacarpal" | "index-finger-phalanx-proximal" | "index-finger-phalanx-intermediate" | "index-finger-phalanx-distal" | "index-finger-tip" | "middle-finger-metacarpal" | "middle-finger-phalanx-proximal" | "middle-finger-phalanx-intermediate" | "middle-finger-phalanx-distal" | "middle-finger-tip" | "ring-finger-metacarpal" | "ring-finger-phalanx-proximal" | "ring-finger-phalanx-intermediate" | "ring-finger-phalanx-distal" | "ring-finger-tip" | "pinky-finger-metacarpal" | "pinky-finger-phalanx-proximal" | "pinky-finger-phalanx-intermediate" | "pinky-finger-phalanx-distal" | "pinky-finger-tip", SimulatorHandJointRotationArray>>;
    rightHandTargetRotations: Partial<Record<"wrist" | "thumb-metacarpal" | "thumb-phalanx-proximal" | "thumb-phalanx-distal" | "thumb-tip" | "index-finger-metacarpal" | "index-finger-phalanx-proximal" | "index-finger-phalanx-intermediate" | "index-finger-phalanx-distal" | "index-finger-tip" | "middle-finger-metacarpal" | "middle-finger-phalanx-proximal" | "middle-finger-phalanx-intermediate" | "middle-finger-phalanx-distal" | "middle-finger-tip" | "ring-finger-metacarpal" | "ring-finger-phalanx-proximal" | "ring-finger-phalanx-intermediate" | "ring-finger-phalanx-distal" | "ring-finger-tip" | "pinky-finger-metacarpal" | "pinky-finger-phalanx-proximal" | "pinky-finger-phalanx-intermediate" | "pinky-finger-phalanx-distal" | "pinky-finger-tip", SimulatorHandJointRotationArray>>;
    lerpSpeed: number;
    handPosePanelElement?: SimulatorHandPoseHTMLElement;
    input: Input;
    loader: GLTFLoader;
    private physics?;
    private camera?;
    private simulatorOptions?;
    private leftXRHand;
    private rightXRHand;
    private leftHandRawTargetJoints?;
    private rightHandRawTargetJoints?;
    constructor(simulatorControllerState: SimulatorControllerState, simulatorScene: THREE.Scene);
    /**
     * Initialize Simulator Hands.
     */
    init({ input, physics, camera, simulatorOptions, }: {
        input: Input;
        physics?: SimulatorPhysics;
        camera?: THREE.Camera;
        simulatorOptions?: SimulatorOptions;
    }): Promise<void>;
    loadMeshes(): Promise<[void, void]>;
    private loadHandMesh;
    setLeftHandLerpPose(pose: SimulatorHandPose): void;
    setRightHandLerpPose(pose: SimulatorHandPose): void;
    /** Applies semantic biomechanical rotations from SimulatorHandPoseRotations. */
    setLeftHandRotations(rotations: SimulatorHandPoseRotations, applyConstraints?: boolean): void;
    /** Applies semantic biomechanical rotations from SimulatorHandPoseRotations. */
    setRightHandRotations(rotations: SimulatorHandPoseRotations, applyConstraints?: boolean): void;
    setLeftHandJoints(joints: DeepReadonly<SimulatorHandPoseJoints>): void;
    setRightHandJoints(joints: DeepReadonly<SimulatorHandPoseJoints>): void;
    update(): void;
    private constrainHand;
    lerpLeftHandPose(): void;
    lerpRightHandPose(): void;
    syncHandJoints(): void;
    private syncXRHandJoints;
    setLeftHandPinching(pinching?: boolean): void;
    setRightHandPinching(pinching?: boolean): void;
    showHands(): void;
    hideHands(): void;
    updateHandPosePanel(): void;
    setHandPosePanelElement(element: HTMLElement): void;
    dispose(): void;
    onHandPoseChangeRequest: (event: Event) => void;
    toggleHandedness(): void;
    /** Optional callback fired after the active hand changes. */
    onHandednessChanged?: (handedness: 'left' | 'right') => void;
}

interface PathfindingNode {
    vertexIds: number[];
}
type PathfindingZone = {
    groups: PathfindingNode[][];
    vertices: THREE.Vector3[];
};
interface PathfindingInstance {
    setZoneData(zoneId: string, zone: PathfindingZone): void;
    getGroup(zoneId: string, position: THREE.Vector3): number | null;
    getClosestNode(position: THREE.Vector3, zoneId: string, groupId: number, checkPolygon?: boolean): PathfindingNode | null;
    clampStep(start: THREE.Vector3, end: THREE.Vector3, node: PathfindingNode, zoneId: string, groupId: number, endTarget: THREE.Vector3): PathfindingNode;
    findPath(start: THREE.Vector3, target: THREE.Vector3, zoneId: string, groupId: number): THREE.Vector3[] | null;
}
interface SimulatorNavMeshPath {
    target: THREE.Vector3;
    path: THREE.Vector3[];
}
interface PreparedSimulatorNavMesh {
    enabled: boolean;
    eyeHeight: number;
    pathfinding?: PathfindingInstance;
    zone?: PathfindingZone;
    debugGeometry?: THREE.BufferGeometry;
}
declare class SimulatorNavMesh {
    enabled: boolean;
    ready: boolean;
    readonly debugVisualization: THREE.Group<THREE.Object3DEventMap>;
    private Pathfinding?;
    private pathfinding?;
    private zone?;
    private zoneId;
    private groupId;
    private currentNode;
    private eyeHeight;
    private debugVisualizationVisible;
    constructor();
    get constrained(): boolean;
    get debugVisualizationsVisible(): boolean;
    showDebugVisualizations(visible?: boolean): void;
    prepareEnvironment(manifest: ResolvedSimulatorSceneManifest, options: SimulatorOptions): Promise<PreparedSimulatorNavMesh>;
    commitEnvironment(prepared: PreparedSimulatorNavMesh): void;
    dispose(): void;
    private setDebugGeometry;
    setGeometry(geometry: THREE.BufferGeometry): Promise<void>;
    applyUserMovement(camera: THREE.Camera, desiredCameraPosition: THREE.Vector3): void;
    findPathTo(startCameraPosition: THREE.Vector3, targetGroundPosition: THREE.Vector3): THREE.Vector3[] | null;
    findRandomPathFrom(startCameraPosition: THREE.Vector3): SimulatorNavMeshPath | null;
    isGroundPositionReachable(startCameraPosition: THREE.Vector3, targetGroundPosition: THREE.Vector3): boolean;
    isLocationReachable(startCameraPosition: THREE.Vector3, targetGroundPosition: THREE.Vector3): boolean;
    isObjectReachable(startCameraPosition: THREE.Vector3, object: THREE.Object3D): boolean;
    private getGroup;
    private getRandomPointInGroup;
    private getNodeArea;
    private sampleNode;
    private loadGeometry;
    private disposeGLTFResources;
    private disposeMaterial;
    private findFirstMesh;
    private loadPathfinding;
}

declare class SimulatorControlMode {
    protected simulatorControllerState: SimulatorControllerState;
    protected downKeys: Set<Keycodes>;
    protected hands: SimulatorHands;
    protected navMesh: SimulatorNavMesh;
    protected setStereoRenderMode: (_: SimulatorRenderMode) => void;
    protected toggleUserInterface: () => void;
    protected cycleSimulatorMode: () => void;
    camera: THREE.Camera;
    input: Input;
    interaction?: Interaction;
    timer: THREE.Timer;
    domElement?: HTMLCanvasElement;
    simulatorOptions?: SimulatorOptions;
    /**
     * Create a SimulatorControlMode
     */
    constructor(simulatorControllerState: SimulatorControllerState, downKeys: Set<Keycodes>, hands: SimulatorHands, navMesh: SimulatorNavMesh, setStereoRenderMode: (_: SimulatorRenderMode) => void, toggleUserInterface: () => void, cycleSimulatorMode?: () => void);
    /**
     * Initialize the simulator control mode.
     */
    init({ camera, input, interaction, timer, domElement, simulatorOptions, }: {
        camera: THREE.Camera;
        input: Input;
        interaction?: Interaction;
        timer: THREE.Timer;
        domElement?: HTMLCanvasElement;
        simulatorOptions?: SimulatorOptions;
    }): void;
    onPointerDown(_: MouseEvent): void;
    onPointerUp(_: MouseEvent): void;
    onPointerMove(_: MouseEvent): void;
    onWheel(_: WheelEvent): boolean;
    onKeyDown(event: KeyboardEvent): void;
    onModeActivated(): void;
    onModeDeactivated(): void;
    update(): void;
    /**
     * Poll the gamepad and handle button actions. Called from all modes.
     */
    updateGamepad(): void;
    updateCameraPosition(): void;
    protected applyYawRelativeMovement(localX: number, localY: number, localZ: number, deltaTime: number): void;
    /**
     * Handle gamepad buttons for simulator UI using configurable bindings.
     */
    updateGamepadUI(gp: GamepadController): void;
    cycleHandPose(direction: number): void;
    private getHandOrigin;
    limitMovementAtReachEdge(idx: number, localPos: THREE.Vector3, delta: THREE.Vector3): void;
    updateControllerPositions(): void;
    rotateOnPointerMove(event: MouseEvent, objectQuaternion: THREE.Quaternion, multiplier?: number): void;
    enableSimulatorHands(): void;
    disableSimulatorHands(): void;
}

type SimulatorElementsLoader = () => Promise<unknown>;
declare class SimulatorInterface {
    private readonly simulatorElementsLoader;
    private elements;
    private interfaceVisible;
    private _gamepadToast?;
    private _gamepadSettings?;
    private gamepadController?;
    private simulatorHands?;
    private elementsAvailable?;
    constructor(simulatorElementsLoader?: SimulatorElementsLoader);
    /**
     * Initialize the simulator interface.
     */
    init(simulatorOptions: SimulatorOptions, simulatorControls: SimulatorControls, simulatorHands: SimulatorHands, input?: Input, setEnvironment?: (environment: SimulatorEnvironment) => Promise<void>, handPhysicsAvailable?: boolean): Promise<void>;
    private ensureElementsAvailable;
    createSimulatorSettingsPanel(simulatorOptions: SimulatorOptions, simulatorControls: SimulatorControls, setEnvironment: (environment: SimulatorEnvironment) => Promise<void>, handPhysicsAvailable: boolean): void;
    showInstructions(simulatorOptions: SimulatorOptions): void;
    showGeminiLivePanel(simulatorOptions: SimulatorOptions): void;
    createHandPosePanel(simulatorOptions: SimulatorOptions, simulatorHands: SimulatorHands): void;
    hideUiElements(): void;
    showUiElements(): void;
    getInterfaceVisible(): boolean;
    toggleInterfaceVisible(): void;
    private _initGamepadUI;
    private onGamepadConnected;
    dispose(): void;
    private _ensureGamepadToast;
    showGamepadToast(gp: GamepadController): void;
    toggleGamepadSettings(gp: GamepadController): void;
}

interface ISimulatorSettingsPanelElement extends HTMLElement {
    environments: SimulatorEnvironment[];
    activeEnvironmentIndex: number;
    simulatorMode: SimulatorMode;
    instructionsEnabled?: boolean;
    handPhysicsAvailable: boolean;
    handPhysicsEnabled: boolean;
}

declare class SimulatorControls {
    #private;
    simulatorControllerState: SimulatorControllerState;
    hands: SimulatorHands;
    private readonly navMesh;
    private userInterface;
    pointerDown: boolean;
    downKeys: Set<Keycodes>;
    simulatorSettingsPanelElement?: ISimulatorSettingsPanelElement;
    simulatorMode: SimulatorMode;
    simulatorModeControls: SimulatorControlMode;
    simulatorModes: {
        [key: string]: SimulatorControlMode;
    };
    renderer?: THREE.WebGLRenderer;
    private simulatorOptions?;
    private activePointerId?;
    private connected;
    private initialized;
    get enabled(): boolean;
    set enabled(value: boolean);
    /**
     * Create the simulator controls.
     * @param hands - The simulator hands manager.
     * @param setStereoRenderMode - A function to set the stereo mode.
     * @param userInterface - The simulator user interface manager.
     */
    constructor(simulatorControllerState: SimulatorControllerState, hands: SimulatorHands, navMesh: SimulatorNavMesh, setStereoRenderMode: (_: SimulatorRenderMode) => void, userInterface: SimulatorInterface);
    /**
     * Initialize the simulator controls.
     */
    init({ camera, input, interaction, timer, renderer, simulatorOptions, }: {
        camera: THREE.Camera;
        input: Input;
        interaction: Interaction;
        timer: THREE.Timer;
        renderer: THREE.WebGLRenderer;
        simulatorOptions: SimulatorOptions;
    }): void;
    connect(): void;
    disconnect(): void;
    update(): void;
    onPointerMove: (event: MouseEvent) => void;
    onPointerDown: (event: PointerEvent) => void;
    onPointerUp: (event: PointerEvent) => void;
    onPointerCancel: (event: PointerEvent) => void;
    onLostPointerCapture: (event: PointerEvent) => void;
    onWheel: (event: WheelEvent) => void;
    onKeyDown: (event: KeyboardEvent) => void;
    onKeyUp: (event: KeyboardEvent) => void;
    onBlur: () => void;
    setSimulatorMode(mode: SimulatorMode): void;
    setSimulatorSettingsPanelElement(element: ISimulatorSettingsPanelElement): void;
    private onSetSimulatorMode;
    dispose(): void;
    setEnabled(value: boolean): void;
    private cancelPointerInteraction;
    private endPointerInteraction;
    private releasePointerCapture;
}

declare class SimulatorDepthMaterial extends THREE.MeshBasicMaterial {
    onBeforeCompile(shader: {
        vertexShader: string;
        fragmentShader: string;
        uniforms: object;
    }): void;
}

declare class SimulatorScene extends THREE.Scene {
    gltf?: GLTF;
    environmentRoot?: THREE.Group;
    constructor();
    createEnvironmentRoot(manifest: ResolvedSimulatorSceneManifest): {
        root: THREE.Group<THREE.Object3DEventMap>;
        objects: THREE.Group<THREE.Object3DEventMap>;
    };
    commitEnvironment(root: THREE.Group, gltf?: GLTF): THREE.Group<THREE.Object3DEventMap> | undefined;
    clearEnvironment(): void;
}

declare class SimulatorDepth {
    private simulatorScene;
    private renderer;
    private camera;
    private depth;
    depthWidth: number;
    depthHeight: number;
    depthBufferSlice: Float32Array<ArrayBuffer>;
    depthMaterial: SimulatorDepthMaterial;
    depthRenderTarget: THREE.WebGLRenderTarget;
    depthBuffer: Float32Array;
    depthCamera: THREE.Camera;
    /**
     * If true, copies the rendering camera's projection matrix each frame.
     */
    autoUpdateDepthCameraProjection: boolean;
    /**
     * If true, copies the rendering camera's transform each frame.
     */
    autoUpdateDepthCameraTransform: boolean;
    private projectionMatrixArray;
    private updateInFlight;
    private disposed;
    private resourcesDisposed;
    /**
     * Longest a depth buffer is allowed to go without being refreshed while
     * nothing detectable has changed, in milliseconds.
     *
     * This is not only a hedge against animation the skip cannot see, such as
     * skinning or vertex shaders. It is also what keeps the depth mesh's
     * position attribute version advancing while the scene sits still.
     * `FaceRecognizer`, `HumanRecognizer`, and `ObjectDetector` each cache a
     * cloned depth mesh, and its BVH, keyed on that version. If this were
     * removed, a stationary scene would freeze the version, those caches would
     * never invalidate, and per-landmark raycasts would keep hitting a stale
     * clone. That is the failure this repository already fixed once, where the
     * face wireframe only appeared while the camera was moving.
     *
     * Raising it trades depth freshness for fewer readbacks; setting it to
     * `Infinity` would reintroduce that bug.
     */
    maxDepthAgeMs: number;
    private lastDepthPosition;
    private lastDepthQuaternion;
    private lastSceneSignature;
    private lastDepthUpdateMs;
    private readonly hashFloat;
    private readonly hashInts;
    constructor(simulatorScene: SimulatorScene);
    /**
     * Initialize Simulator Depth.
     */
    init(renderer: THREE.WebGLRenderer, camera: THREE.Camera, depth: Depth): void;
    createRenderTarget(): void;
    update(): void;
    /**
     * Whether the depth buffer would differ from the one already captured.
     *
     * @returns True when the camera moved, the scene moved, or the buffer has
     * gone stale.
     */
    private depthNeedsUpdate;
    /**
     * Cheap hash over the world transforms of everything the depth pass draws.
     *
     * Anything that moves, rotates, scales, or is shown or hidden changes the
     * hash, so a still camera in front of a moving object still refreshes. This
     * is arithmetic over a few hundred nodes, which is orders of magnitude
     * cheaper than the GPU stall a readback costs.
     *
     * @returns A hash of the scene's current visible transforms.
     */
    private computeSceneSignature;
    private markDepthUpdated;
    private updateDepthCamera;
    private renderDepthScene;
    private updateDepth;
    dispose(): void;
    private disposeResources;
}

type InjectableConstructor = Function & {
    dependencies?: Record<string, Constructor>;
};
interface Injectable {
    init(...args: unknown[]): Promise<void> | void;
    constructor: InjectableConstructor;
}
/**
 * Call init on a script or subsystem with dependency injection.
 */
declare function callInitWithDependencyInjection(script: Injectable, registry: Registry, fallback: unknown): Promise<void>;

declare class SimulatorUserAction implements Injectable {
    static dependencies: {};
    init(_options?: object): Promise<void>;
    play(_options?: object): Promise<void>;
}

declare class SimulatorUser extends Script {
    static dependencies: {
        waitFrame: typeof WaitFrame;
        registry: typeof Registry;
    };
    name: string;
    journeyId: number;
    waitFrame: WaitFrame;
    registry: Registry;
    constructor();
    init({ waitFrame, registry }: {
        waitFrame: WaitFrame;
        registry: Registry;
    }): void;
    stopJourney(): void;
    isOnJourneyId(id: number): boolean;
    loadJourney(actions: SimulatorUserAction[]): Promise<void>;
}

/**
 * A mesh injected into the {@link MeshDetector} by the desktop simulator.
 *
 * The real WebXR Mesh Detection API only produces meshes from
 * `frame.detectedMeshes`, which the simulator never provides. This is the
 * mesh-detection analog of {@link SimulatorPlane}: the simulator extracts the
 * ground-truth geometry of the loaded environment and feeds it to the
 * `MeshDetector` via `setSimulatorMeshes()`.
 */
interface SimulatorMesh {
    /** Vertex positions as flat xyz triples, in world space. */
    vertices: Float32Array;
    /** Triangle indices into {@link vertices}. */
    indices: Uint32Array;
    /**
     * Timestamp of the last geometry change, analogous to `XRMesh.lastChangedTime`.
     * Simulator meshes are static, so this is typically 0.
     */
    lastChangedTime: number;
    /**
     * Optional semantic label (e.g. 'floor', 'ceiling', 'wall'). When it matches
     * one of the detector's debug materials it is colored accordingly; otherwise
     * the fallback debug material is used.
     */
    semanticLabel?: string;
    /**
     * Optional world-space origin. Defaults to the identity. When {@link vertices}
     * are already baked into world space this should be left undefined.
     */
    position?: THREE.Vector3;
    /** Optional world-space orientation. Defaults to the identity. */
    quaternion?: THREE.Quaternion;
    /** Internal simulator object id used to keep dynamic mesh poses synchronized. */
    simulatorObjectId?: string;
}

declare class DetectedMesh extends THREE.Mesh {
    private RAPIER?;
    private rigidBody?;
    private collider?;
    private blendedWorld?;
    private lastChangedTime;
    semanticLabel?: string;
    get getRigidBody(): RAPIER_NS.RigidBody | undefined;
    constructor(mesh: XRMesh | SimulatorMesh, material: THREE.Material);
    initRapierPhysics(RAPIER: typeof RAPIER_NS, blendedWorld: RAPIER_NS.World): void;
    updateVertices(mesh: XRMesh): void;
    dispose(): void;
}

interface SimulatorObject {
    id: string;
    object: THREE.Object3D;
    definition: SimulatorObjectDefinition;
}
/** Mutable fields on an existing simulator object. Asset ownership and IDs
 * remain stable; remove and re-add an object to change either of those. */
interface SimulatorObjectUpdate {
    id: string;
    position?: SimulatorVector3Tuple;
    quaternion?: SimulatorQuaternionTuple;
    scale?: SimulatorVector3Tuple;
    visible?: boolean;
    detectObject?: boolean;
    /** Use null to clear an existing semantic label. */
    label?: string | null;
    data?: unknown;
    physics?: SimulatorPhysicsMode;
}
/** @internal */
interface SimulatorObjectRecord extends SimulatorObject {
    rigidBody?: RAPIER_NS.RigidBody;
    detectedMesh?: DetectedMesh;
    physicsGeometry?: THREE.BufferGeometry;
    ownsObject: boolean;
    preserveWorldTransform: boolean;
}
/** @internal */
interface PreparedSimulatorObjects {
    records: SimulatorObjectRecord[];
    nextId: number;
}
interface SimulatorObjects {
    addObjects(definitions: SimulatorObjectDefinition[], options?: {
        baseUrl?: string;
    }): Promise<SimulatorObject[]>;
    get(ids?: string[]): SimulatorObject[];
    updateObjects(updates: SimulatorObjectUpdate[]): Promise<SimulatorObject[]>;
    removeObjects(ids: string[]): this;
    clear(): this;
}
/** @internal */
declare class SimulatorObjectsManager implements SimulatorObjects {
    onChanged?: () => void;
    private records;
    private nextId;
    private group?;
    private physics?;
    private renderer?;
    init(renderer: THREE.WebGLRenderer, physics?: SimulatorPhysics): void;
    prepareObjects(definitions: SimulatorObjectDefinition[], baseUrl?: string, { replaceExisting }?: {
        replaceExisting?: boolean;
    }): Promise<PreparedSimulatorObjects>;
    activatePrepared(prepared: PreparedSimulatorObjects, targetGroup: THREE.Group): SimulatorObject[];
    setEnvironmentGroup(group: THREE.Group): void;
    addObjects(definitions: SimulatorObjectDefinition[], { baseUrl }?: {
        baseUrl?: string;
    }): Promise<SimulatorObject[]>;
    get(ids?: string[]): SimulatorObject[];
    updateObjects(updates: SimulatorObjectUpdate[]): Promise<SimulatorObject[]>;
    private validateUpdate;
    private applyUpdate;
    getMeshRecords(): SimulatorObject[];
    setDetectedMeshes(meshes: Map<string, DetectedMesh>): void;
    removeObjects(ids: string[]): this;
    private removeRecords;
    clear(): this;
    reset(): void;
    physicsStep(): void;
    private createPhysics;
    private removePhysics;
    private createBodyDesc;
    private disposeRecord;
    dispose(): void;
}

type SimulatorPlaneType = 'horizontal' | 'vertical';
interface SimulatorPlane {
    /** 'horizontal' or 'vertical' */
    type: SimulatorPlaneType;
    /** Optional semantic label for the plane (e.g., 'table', 'floor') */
    label?: string;
    /** Total surface area in square meters */
    area: number;
    /** * The center point of the plane in World Space.
     * This corresponds to the origin of the plane's local coordinate system.
     */
    position: THREE.Vector3;
    /** * Rotation of the plane in World Space.
     * Applying this rotation to (0,1,0) yields the plane's normal.
     */
    quaternion: THREE.Quaternion;
    /** * The boundary points of the plane in Local Space (X, Z).
     * Since +Y is normal, these points lie on the flat surface.
     */
    polygon: THREE.Vector2[];
}

/**
 * Represents a single detected object in the XR environment and holds metadata
 * about the object's properties. Note: 3D object position is stored in the
 * position property of `Three.Object3D`.
 */
declare class DetectedObject<T> extends THREE.Object3D {
    label: string;
    image: string | null;
    detection2DBoundingBox: THREE.Box2;
    data: T;
    /**
     * @param label - The semantic label of the object.
     * @param image - The base64 encoded cropped image of the object.
     * @param detection2DBoundingBox - The 2D bounding box of the detected object in normalized screen
     * coordinates. Values are between 0 and 1. Centerpoint of this bounding is
     * used for backproject to obtain 3D object position (i.e., this.position).
     * @param data - Additional properties from the detector.
     * This includes any object proparties that is requested through the
     * schema but is not assigned a class property by default (e.g., color, size).
     */
    constructor(label: string, image: string | null, detection2DBoundingBox: THREE.Box2, data: T);
}

/**
 * Represents a detected object in a normalized format, independent of the specific detector backend used.
 * Coordinates are normalized typically in the range [0, 1].
 *
 * T - The type of additional data associated with the detected object.
 */
interface NormalizedDetectedObject<T> {
    ymin: number;
    xmin: number;
    ymax: number;
    xmax: number;
    objectName: string;
    additionalData?: T;
}
/**
 * Represents a snapshot taken from the device camera.
 * Can contain either a base64 encoded image string or raw ImageData.
 */
interface CameraSnapshot {
    base64?: string;
    imageData?: ImageData;
}
interface SimulatorDetectedObjectInput<T = unknown> {
    label: string;
    position: THREE.Vector3;
    boundingBox: THREE.Box2;
    data?: T;
}
interface SimulatorObjectDetectionSource {
    detect(): SimulatorDetectedObjectInput[];
}
/**
 * Detects objects in the user's environment using a specified backend.
 * It queries an AI model with the device camera feed and returns located
 * objects with 2D and 3D positioning data.
 */
declare class ObjectDetector extends Script {
    static dependencies: {
        options: typeof WorldOptions;
        ai: typeof AI;
        aiOptions: typeof AIOptions;
        deviceCamera: typeof XRDeviceCamera;
        depth: typeof Depth;
        camera: typeof THREE.Camera;
        renderer: typeof THREE.WebGLRenderer;
    };
    /**
     * A map from the object's UUID to our custom `DetectedObject` instance.
     */
    private _detectedObjects;
    private _detectorBackends;
    private activeClients;
    private currentDetectionPromise;
    private lastContinuousDetectionStartedAtMs;
    private disposed;
    private simulatorSource?;
    private _debugVisualsGroup?;
    /**
     * The latest detected objects.
     */
    detectedObjects: DetectedObject<unknown>[];
    private options;
    private ai;
    private aiOptions;
    private deviceCamera;
    private depth;
    private camera;
    private renderer;
    /**
     * Target device profile used to look up RGB camera intrinsics and pose
     * for converting detection bounding boxes into world space. Defaults to
     * `'galaxyxr'`; auto-overridden to `'quest3'` in {@link init} when the
     * Meta Quest browser is detected. Can be overridden manually before init.
     */
    targetDevice: string;
    /**
     * Initializes the ObjectDetector.
     * @override
     */
    init({ options, ai, aiOptions, deviceCamera, depth, camera, renderer, }: {
        options: WorldOptions;
        ai: AI;
        aiOptions: AIOptions;
        deviceCamera: XRDeviceCamera;
        depth: Depth;
        camera: THREE.PerspectiveCamera;
        renderer: THREE.WebGLRenderer;
    }): void;
    /**
     * Starts continuous object detection for the given client.
     * If this is the first client, starts the background detection loop.
     * @param client - The client object requesting object detection.
     */
    start(client: object): void;
    /**
     * Stops continuous object detection for the given client.
     * If this was the last client, stops the background detection loop.
     * @param client - The client object that no longer needs object detection.
     */
    stop(client: object): void;
    /**
     * Called per frame by the engine. If there are active clients,
     * ensures the continuous object detection is running.
     */
    update(): void;
    private runContinuousDetection;
    /**
     * Runs object detection or returns the ongoing detection promise.
     *
     * - If continuous detection is started (has active clients), returns the
     *   promise for the next detection result.
     * - If continuous detection is not started, performs a one-off detection and
     *   returns the result. If a one-off detection is already in progress, returns
     *   the promise for that ongoing detection.
     *
     * @returns A promise that resolves with an
     * array of detected `DetectedObject` instances.
     */
    runDetection<T = null>(): Promise<DetectedObject<T>[]>;
    /** Installs or removes the desktop simulator's ground-truth detector. */
    setSimulatorSource(source?: SimulatorObjectDetectionSource): this;
    private runDetectionInternal;
    private getDetectorContext;
    private getOrCreateDetectorBackend;
    private getDepthMeshSnapshot;
    /**
     * Retrieves a list of currently detected objects.
     *
     * @param label - The semantic label to filter by (e.g., 'chair'). If null,
     * all objects are returned.
     * @returns An array of `Object` instances.
     */
    get<T = null>(label?: null): DetectedObject<T>[];
    /**
     * Removes all currently detected objects from the scene and internal
     * tracking.
     */
    clear(): this;
    private clearDetectedObjects;
    private disposeDepthMeshSnapshot;
    /**
     * Toggles the visibility of all debug visualizations for detected objects.
     * @param visible - Whether the visualizations should be visible.
     */
    showDebugVisualizations(visible?: boolean): void;
    dispose(): void;
}

/**
 * Represents a single detected plane in the XR environment. It's a THREE.Mesh
 * that also holds metadata about the plane's properties.
 * Note: This requires chrome://flags/#openxr-spatial-entities to be enabled.
 */
declare class DetectedPlane extends THREE.Mesh {
    xrPlane: XRPlane | null;
    simulatorPlane?: SimulatorPlane | undefined;
    /**
     * A semantic label for the plane (e.g., 'floor', 'wall', 'ceiling', 'table').
     * Since xrPlane.semanticLabel is readonly, this allows user authoring.
     */
    label?: string;
    /**
     * The orientation of the plane ('Horizontal' or 'Vertical').
     */
    orientation?: XRPlaneOrientation;
    /**
     * @param xrPlane - The plane object from the WebXR API.
     * @param material - The material for the mesh.
     */
    constructor(xrPlane: XRPlane | null, material: THREE.Material, simulatorPlane?: SimulatorPlane | undefined);
}

/**
 * Detects and manages real-world planes provided by the WebXR Plane Detection
 * API. It creates, updates, and removes `Plane` mesh objects in the scene.
 */
declare class PlaneDetector extends Script {
    static dependencies: {
        options: typeof WorldOptions;
        renderer: typeof THREE.WebGLRenderer;
    };
    /**
     * A map from the WebXR `XRPlane` object to our custom `DetectedPlane` mesh.
     */
    private _detectedPlanes;
    /**
     * The material used for visualizing planes when debugging.
     */
    private _debugMaterial;
    /**
     * The reference space used for poses.
     */
    private _xrRefSpace?;
    private renderer;
    private usingSimulatorPlanes;
    /**
     * Initializes the PlaneDetector.
     */
    init({ options, renderer, }: {
        options: WorldOptions;
        renderer: THREE.WebGLRenderer;
    }): void;
    /**
     * Processes the XRFrame to update plane information.
     */
    update(_: number, frame: XRFrame): void;
    /**
     * Creates and adds a new `Plane` mesh to the scene.
     * @param frame - WebXR frame.
     * @param xrPlane - The new WebXR plane object.
     */
    private _addPlaneMesh;
    /**
     * Updates an existing `DetectedPlane` mesh's geometry and pose.
     * @param frame - WebXR frame.
     * @param planeMesh - The mesh to update.
     * @param xrPlane - The updated plane data.
     */
    private _updatePlaneMesh;
    /**
     * Removes a `Plane` mesh from the scene and disposes of its resources.
     * @param xrPlane - The WebXR plane object to remove.
     */
    private _removePlaneMesh;
    private disposePlaneMesh;
    /**
     * Updates the position and orientation of a `DetectedPlane` mesh from its XR
     * pose.
     * @param frame - The current XRFrame.
     * @param planeMesh - The mesh to update.
     * @param xrPlane - The plane data with the pose.
     */
    private _updatePlanePose;
    /**
     * Retrieves a list of detected planes, optionally filtered by a semantic
     * label.
     *
     * @param label - The semantic label to filter by (e.g.,
     *     'floor', 'wall').
     * If null or undefined, all detected planes are returned.
     * @returns An array of `DetectedPlane` objects
     *     matching the criteria.
     */
    get(label?: string): DetectedPlane[];
    /**
     * Toggles the visibility of the debug meshes for all planes.
     * Requires `showDebugVisualizations` to be true in the options.
     * @param visible - Whether to show or hide the planes.
     */
    showDebugVisualizations(visible?: boolean): void;
    private _addSimulatorPlaneMesh;
    setSimulatorPlanes(planes: SimulatorPlane[]): void;
    clearSimulatorPlanes(): void;
    dispose(): void;
}

/** A pose expressed as plain arrays, so it can be stored as JSON. */
interface StorablePose {
    /** Position as `[x, y, z]`. */
    position: [number, number, number];
    /** Orientation quaternion as `[x, y, z, w]`. */
    orientation: [number, number, number, number];
}
/**
 * A stand-in anchor for environments with no WebXR anchor support.
 *
 * The desktop simulator has no tracking system to anchor against, so this
 * holds the pose itself. It is deliberately a separate type rather than a
 * silent substitute: anchoring here proves the app's own wiring, not that the
 * platform can re-localise anything, and callers can tell the difference via
 * {@link SimulatorAnchor.isSimulatorAnchor}.
 */
declare class SimulatorAnchor {
    private readonly handle;
    /** Marks the instance so it can be recognised after type erasure. */
    readonly isSimulatorAnchor = true;
    /** Stands in for `XRAnchor.anchorSpace`; never a real tracked space. */
    readonly anchorSpace: XRSpace;
    /** The pose this anchor was created at. */
    readonly pose: {
        position: {
            x: number;
            y: number;
            z: number;
        };
        orientation: {
            x: number;
            y: number;
            z: number;
            w: number;
        };
    };
    /**
     * @param handle - Identifier used as this anchor's persistent handle.
     * @param pose - Pose to hold.
     */
    constructor(handle: string, pose: XRRigidTransform);
    /**
     * Returns this anchor's handle.
     * @returns The handle it was constructed with.
     */
    requestPersistentHandle: () => Promise<string>;
    /** Matches the `XRAnchor.delete` shape; nothing to release. */
    delete(): void;
    /**
     * The held pose in storable form.
     * @returns The pose as plain arrays.
     */
    toStorablePose(): StorablePose;
    /**
     * Rebuilds an anchor from a stored pose.
     * @param handle - Handle to restore under.
     * @param pose - Previously stored pose.
     * @returns The rebuilt anchor.
     */
    static fromStorablePose(handle: string, pose: StorablePose): SimulatorAnchor;
    /**
     * Whether an anchor is simulated rather than platform-provided.
     * @param anchor - Anchor to test.
     * @returns True when the anchor is a {@link SimulatorAnchor}.
     */
    static isSimulatorAnchor(anchor: unknown): anchor is SimulatorAnchor;
}

/**
 * Shared types for the spatial anchor subsystem.
 *
 * Kept free of WebXR and three.js imports so the storage and capability logic
 * can be unit tested without a device or a GPU.
 */
/**
 * What the current platform can do with anchors.
 *
 * The WebXR anchor APIs are all optional in the typings and genuinely absent on
 * many browsers, so capability is probed rather than inferred from the presence
 * of an XR session.
 */
type AnchorCapability = 
/** No anchor support at all; anchor calls are no-ops. */
'unsupported'
/** Anchors can be created, but not carried into a later session. */
 | 'session-only'
/** Anchors can be created and restored in later sessions. */
 | 'persistent'
/**
 * No platform anchors; the subsystem is holding poses itself so an app can
 * be developed on desktop. Nothing here is really pinned to the room.
 */
 | 'simulated';
/** A saved anchor, as written to storage. */
interface AnchorRecord {
    /** Platform-issued persistent handle, opaque to us. */
    uuid: string;
    /** Caller-supplied label, so restored anchors can be matched to content. */
    label: string;
    /** Epoch milliseconds when the handle was saved; used for eviction order. */
    createdAt: number;
    /**
     * Pose to rebuild from, present only for simulated anchors. Real anchors are
     * re-localised by the platform, so storing a pose for them would be wrong.
     */
    pose?: StorablePose;
}
/**
 * Why a restore attempt ended the way it did.
 *
 * Re-localisation is probabilistic: a handle can be perfectly valid and still
 * fail to resolve because the user is in a different room, or the space has
 * changed too much. That is an expected outcome, not an error.
 */
type AnchorRestoreStatus = 
/** The anchor came back and is usable. */
'restored'
/** The platform could not resolve this handle here. */
 | 'not-found'
/** The platform cannot restore anchors at all. */
 | 'unsupported';
/** Outcome of restoring a single saved anchor. */
interface AnchorRestoreResult {
    /** The record that was attempted. */
    record: AnchorRecord;
    /** How the attempt ended. */
    status: AnchorRestoreStatus;
    /**
     * The anchor now being tracked, when the attempt succeeded.
     *
     * Handed back so callers can attach content immediately instead of scanning
     * the tracked set and matching on uuid.
     */
    anchor?: TrackedAnchorLike;
}
/** The shape of a tracked anchor, as surfaced in restore results. */
interface TrackedAnchorLike {
    /** Stable id within the session. */
    id: string;
    /** Caller-supplied label. */
    label: string;
    /** Persistent handle, when one has been requested. */
    uuid?: string;
}

/**
 * Storage for persistent anchor handles.
 *
 * Behind an interface so the persistence rules can be unit tested without a
 * browser, and so an app can swap in its own backing store.
 */
interface AnchorStore {
    /**
     * Reads every saved record, oldest first.
     * @returns Saved records, or an empty array when nothing is stored.
     */
    load(): AnchorRecord[];
    /**
     * Saves a record, replacing any existing entry with the same uuid.
     * @param record - The record to save.
     * @returns Whether the record was actually committed. Callers must not tell
     *     a user their anchor was saved when storage quietly refused it.
     */
    save(record: AnchorRecord): boolean;
    /**
     * Removes a single record.
     * @param uuid - Handle of the record to remove.
     */
    remove(uuid: string): void;
    /** Removes every saved record. */
    clear(): void;
}

/** An anchor currently held by the manager. */
interface TrackedAnchor {
    /** Stable id for this anchor within the session. */
    id: string;
    /** Caller-supplied label, carried through persistence. */
    label: string;
    /** The underlying WebXR anchor. */
    anchor: XRAnchor;
    /** Persistent handle, once one has been requested successfully. */
    uuid?: string;
}
/**
 * Creates and tracks spatial anchors, and restores previously saved ones.
 *
 * Anchors let content stay attached to a real place as the platform refines
 * its understanding of the room. With persistence enabled, handles are saved
 * so the same content can be recovered in a later session.
 *
 * Every anchor API this uses is optional in WebXR, so the manager degrades
 * quietly: on a platform without anchors, creation returns `null` and nothing
 * throws.
 */
declare class AnchorManager extends Script {
    private readonly injectedStore?;
    static dependencies: {
        options: typeof WorldOptions;
        renderer: typeof THREE.WebGLRenderer;
        xrReferenceSpaceCache: typeof XRReferenceSpaceCache;
    };
    /** What the current platform supports; refreshed each frame. */
    capability: AnchorCapability;
    /**
     * The most recent failure, or null.
     *
     * Exposed rather than only logged so callers can surface anchor problems in
     * their own UI instead of leaving the user with silently missing content.
     */
    lastError: unknown;
    private readonly anchors;
    private store?;
    private options;
    private renderer?;
    private referenceSpaceCache?;
    private warnedUnsupported;
    private warnedSpaceDowngrade;
    private readonly pendingCreates;
    /**
     * @param store - Storage for persistent handles. Defaults to local storage,
     *     configured from options during {@link AnchorManager.init}.
     */
    constructor(injectedStore?: AnchorStore | undefined);
    /**
     * Initializes the manager.
     * @param dependencies - Resolved dependencies: the world options carrying
     *     the anchor settings, and the renderer supplying the reference space
     *     that anchor poses are expressed against.
     */
    init({ options, renderer, xrReferenceSpaceCache, }: {
        options: WorldOptions;
        renderer?: THREE.WebGLRenderer;
        xrReferenceSpaceCache?: XRReferenceSpaceCache;
    }): void;
    /**
     * Refreshes platform capability and drops anchors the platform has released.
     * @param _time - Frame timestamp, unused.
     * @param frame - The current XR frame.
     */
    update(_time?: number, frame?: XRFrame): void;
    /**
     * Releases everything belonging to a session that has ended.
     *
     * Anchors do not survive their session, so keeping them would leave dead
     * handles that later restores would treat as already restored. Saved records
     * are untouched, since restoring them is the entire point.
     */
    onSessionEnded(): void;
    /**
     * Creates an anchor at a pose.
     *
     * @param pose - Pose for the new anchor.
     * @param label - Label carried through persistence.
     * @param poseSpace - Space the pose is expressed in. Defaults to the frame's reference space.
     * @param anchorSpace - Space to anchor against. Defaults to 'bounded-floor'.
     * @returns The tracked anchor, or null when it could not be created.
     */
    create(pose: XRRigidTransform, label: string, poseSpace?: XRSpace | XRReferenceSpaceType | null, anchorSpace?: XRSpace | XRReferenceSpaceType): Promise<TrackedAnchor | null>;
    /**
     * Holds a creation request until a frame is live.
     *
     * @param pose - Pose for the new anchor.
     * @param label - Label carried through persistence.
     * @param poseSpace - Space the pose is expressed in.
     * @param anchorSpace - Space to anchor against.
     * @param retried - Whether this request has already been requeued once.
     * @returns The tracked anchor once a frame arrives, or null.
     */
    private queueCreate;
    /**
     * Resolves spaces against a live frame and creates the anchor.
     *
     * @param frame - A frame known to be active.
     * @param pose - Pose for the new anchor.
     * @param label - Label carried through persistence.
     * @param poseSpace - Space the pose is expressed in.
     * @param anchorSpace - Space to anchor against.
     * @param retried - Whether this request has already been requeued once.
     * @returns The tracked anchor, or null when it could not be created.
     */
    private createResolved;
    /**
     * Resolves a space request to a live XRSpace.
     *
     * @param request - A space, a reference space name, or null for the space
     *     the scene is currently drawn in.
     * @returns The space, or undefined when the platform has no such space.
     */
    private resolveSpace;
    /**
     * Says once per session that a requested anchor space was unavailable.
     *
     * @param requested - The space that could not be resolved.
     */
    private warnSpaceDowngrade;
    /**
     * Runs queued creations against a live frame.
     * @param frame - The frame currently being rendered.
     */
    private flushPendingCreates;
    /**
     * Creates an anchor on a frame known to be active.
     * @param frame - The frame currently being rendered.
     * @param pose - Pose for the new anchor.
     * @param label - Label carried through persistence.
     * @param space - Space the pose is expressed in.
     * @returns The tracked anchor, or null when it could not be created.
     */
    private createOnFrame;
    /**
     * Saves an anchor's handle so it can be restored in a later session.
     *
     * @param id - Id of a tracked anchor.
     * @returns Whether a handle was saved.
     */
    persist(id: string): Promise<boolean>;
    /**
     * Restores every saved anchor.
     *
     * Re-localisation is probabilistic, so a handle that cannot be resolved here
     * is reported as `not-found` rather than treated as an error, and one
     * failure never stops the rest of the batch.
     *
     * @returns One result per saved record, in stored order.
     */
    restoreAll(session?: XRSession | null): Promise<AnchorRestoreResult[]>;
    /**
     * Restores a single record.
     * @param record - The saved record to restore.
     * @param session - Session able to restore handles.
     * @returns The outcome for this record.
     */
    private restoreOne;
    /**
     * Reads an anchor's current pose.
     *
     * @param id - Id of a tracked anchor.
     * @param referenceSpace - Space to express the pose in. Not needed for
     *     simulated anchors, which hold their own pose.
     * @returns The pose, or null when the anchor is not currently tracked.
     */
    getPose(id: string, referenceSpace?: XRReferenceSpace): XRPose | null;
    /**
     * Stops tracking an anchor and forgets any saved handle for it.
     * @param id - Id of a tracked anchor.
     */
    delete(id: string): void;
    /**
     * Every anchor currently tracked.
     * @returns The tracked anchors.
     */
    getAll(): TrackedAnchor[];
    /**
     * Every persistent handle the platform is currently holding for this origin.
     *
     * Only the headset runtimes implement this; Chrome ships the anchors module
     * without persistence, where the attribute is absent rather than empty. An
     * empty result therefore means "nothing to report", not "the platform holds
     * none".
     *
     * Scoped to the origin, not to this store. Two pages on one origin see each
     * other's handles here, so a handle missing from your own records is not
     * evidence of a leak and must not be deleted on that basis.
     *
     * @returns The handles, or an empty array when unavailable.
     */
    platformHandles(): string[];
    /**
     * Releases every persistent handle the platform is holding for this origin.
     *
     * A recovery path, not routine cleanup. Platforms cap how many persistent
     * anchors may exist, and once local records are gone nothing names the
     * handles any more, so {@link AnchorManager.forgetAll} cannot reach them and
     * the cap stays full forever. This reads the platform's own list instead.
     *
     * Origin wide and destructive: another page on the same origin loses its
     * anchors too. Offer it as an explicit choice, never as automatic cleanup.
     *
     * The platform's list is not guaranteed to shrink as handles are released,
     * so do not read it back afterwards to judge whether this worked. The
     * returned count is what the platform actually accepted.
     *
     * @returns How many handles the platform accepted a release for.
     */
    releaseAllPlatformHandles(): Promise<number>;
    /** Forgets every saved handle, leaving live anchors alone. */
    forgetAll(): void;
    /**
     * The session to ask about anchors.
     *
     * Prefers the frame's own session, falling back to the renderer so calls
     * made outside the frame loop still reach the platform.
     *
     * @returns The session, or undefined.
     */
    private currentSession;
    /**
     * Releases handles the store dropped to stay under its cap.
     *
     * The store evicts silently, so without this the oldest handles stay
     * allocated on the platform with no record left able to name them.
     *
     * @param before - Records present immediately before the save.
     * @param saved - Handle just written, which is never evicted.
     */
    private releaseEvicted;
    /**
     * Asks the platform to drop a persistent handle.
     *
     * Platforms cap how many handles an origin may hold, so forgetting a record
     * on our side without this slowly fills that quota with anchors no app can
     * name any more.
     *
     * @param uuid - The persistent handle to release.
     */
    private releasePersistentHandle;
    /** Releases every tracked anchor. Saved handles are left in storage. */
    dispose(): void;
    /**
     * Drops anchors the platform no longer reports as tracked.
     * @param frame - The current XR frame.
     */
    private pruneUntracked;
    /**
     * Creates a locally held anchor for environments without platform support.
     * @param pose - Pose to hold.
     * @param label - Label carried through persistence.
     * @returns The tracked anchor.
     */
    private createSimulated;
    /**
     * Rebuilds a simulated anchor from its stored pose.
     * @param record - The saved record.
     * @returns The outcome for this record.
     */
    private restoreSimulated;
    /**
     * The reference space anchor poses are expressed against.
     * @returns The reference space, or undefined when none is available yet.
     */
    private referenceSpace;
    /**
     * Finds a tracked anchor by its persistent handle.
     * @param uuid - Persistent handle to look for.
     * @returns The tracked anchor, or undefined.
     */
    private findByUuid;
    /**
     * Logs when anchor debugging is enabled.
     * @param message - Message to log.
     */
    private debug;
}

declare class MeshDetector extends Script {
    static readonly dependencies: {
        options: typeof MeshDetectionOptions;
        renderer: typeof THREE.WebGLRenderer;
    };
    private debugMaterials;
    private fallbackDebugMaterial;
    xrMeshToThreeMesh: Map<XRMesh | SimulatorMesh, DetectedMesh>;
    threeMeshToXrMesh: Map<DetectedMesh, XRMesh | SimulatorMesh>;
    private renderer;
    private physics?;
    private usingSimulatorMeshes;
    private defaultMaterial;
    private meshTimedata;
    private readonly MESH_UPDATE_INTERVAL_MS;
    private lastMeshUpdateTime;
    private readonly MESH_STALE_TIME_MS;
    private readonly CLEANUP_INTERVAL_MS;
    private readonly kMaxViewDistance;
    private readonly kFOVCosThreshold;
    private lastCleanupTime;
    private frameCount;
    init({ options, renderer, }: {
        options: MeshDetectionOptions;
        renderer: THREE.WebGLRenderer;
    }): void;
    initPhysics(physics: Physics): void;
    updateMeshes(_timestamp: number, frame?: XRFrame): void;
    private removeMesh;
    private cleanupStaleMeshes;
    /**
     * Injects a set of meshes from the desktop simulator, bypassing the WebXR
     * `frame.detectedMeshes` path. Mirrors `PlaneDetector.setSimulatorPlanes`.
     */
    setSimulatorMeshes(meshes: SimulatorMesh[]): DetectedMesh[];
    clearSimulatorMeshes(): void;
    dispose(): void;
    private createMesh;
    private updateMeshPose;
    private getCameraInfo;
    private computeMeshBoundingBox;
    /** Six clip planes from the view-projection matrix (left, right, bottom, top, near, far). */
    private buildFrustumPlanes;
    private frustumIntersectsBox;
    private shouldShowMeshInViewWithFrustum;
    private shouldShowMeshInViewWithDistance;
}

/**
 * Represents a sound category with its associated confidence score.
 */
interface Category {
    /** The name of the detected category (e.g., "Speech", "Music"). */
    categoryName: string;
    /** The confidence score of the detection, typically between 0 and 1. */
    score: number;
    /** Optional human-readable name for the category. */
    displayName?: string;
}
/**
 * Contains a list of categories for a specific detection.
 */
interface Classification {
    /** Array of detected categories, typically sorted by score. */
    categories: Category[];
}
/**
 * A single result item from the audio classifier.
 */
interface AudioClassifierResultItem {
    /** List of classifications for this result item since there could
     * be multiple types of sounds overlapping in the same time interval. */
    classifications: Classification[];
}
/**
 * Debugging information about the audio processing.
 */
interface DebugData {
    /** Root Mean Square, representing the volume/energy of the audio. */
    rms: number;
    /** The size of the audio buffer processed. */
    bufferSize: number;
    /** The sample rate of the audio data. */
    sampleRate: number;
}
/**
 * The overall result returned by the audio classifier.
 */
interface AudioClassifierResult {
    /** List of result items containing classifications. */
    items: AudioClassifierResultItem[];
    /** Optional debug data. */
    debug?: DebugData;
}

interface SoundDetectorEventMap extends THREE.Object3DEventMap {
    soundDetected: {
        audioClassifierResult: AudioClassifierResult;
    };
}
/**
 * Detects and classifies sounds in the user's environment using a specified backend.
 * It queries an audio classifier model with the device mic input stream and returns
 * classifications over specific time intervals along with confidence scores.
 */
declare class SoundDetector extends Script<SoundDetectorEventMap> {
    static dependencies: {
        options: typeof WorldOptions;
    };
    private _detectorBackends;
    private audioListener?;
    private _isListening;
    get isListening(): boolean;
    private options?;
    /**
     * Initializes the SoundDetector.
     */
    init({ options }: {
        options: WorldOptions;
    }): Promise<void>;
    /**
     * Starts listening to the default mic input stream.
     */
    startListening(): Promise<void>;
    /**
     * Stops listening and releases resources.
     */
    stopListening(): void;
    update(_timestamp: number, _frame?: XRFrame): void;
    dispose(): void;
    private getOrCreateDetectorBackend;
}

/**
 * Names of key human body joints and anatomical landmarks.
 * Includes standard MediaPipe pose landmarks and composite landmarks for
 * skeletal animation compatibility (e.g., Hips, Spine, Chest, Neck, Head).
 */
declare enum PoseJointName {
    Nose = "nose",
    LeftEye = "leftEye",
    RightEye = "rightEye",
    LeftEar = "leftEar",
    RightEar = "rightEar",
    LeftShoulder = "leftShoulder",
    RightShoulder = "rightShoulder",
    LeftElbow = "leftElbow",
    RightElbow = "rightElbow",
    LeftWrist = "leftWrist",
    RightWrist = "rightWrist",
    LeftHip = "leftHip",
    RightHip = "rightHip",
    LeftKnee = "leftKnee",
    RightKnee = "rightKnee",
    LeftAnkle = "leftAnkle",
    RightAnkle = "rightAnkle",
    LeftFoot = "leftFoot",
    RightFoot = "rightFoot",
    Hips = "hips",
    Spine = "spine",
    Chest = "chest",
    Neck = "neck",
    Head = "head"
}
/**
 * Represents a single detected anatomical landmark/joint in a human body pose.
 */
interface PoseLandmark {
    /**
     * Normalized horizontal coordinate [0.0, 1.0] in screen space,
     * where 0.0 is the left edge and 1.0 is the right edge.
     */
    x: number;
    /**
     * Normalized vertical coordinate [0.0, 1.0] in screen space,
     * where 0.0 is the top edge and 1.0 is the bottom edge.
     */
    y: number;
    /**
     * Raw estimated depth value relative to the camera.
     */
    z: number;
    /**
     * The probability [0.0, 1.0] that the landmark is visible (not occluded).
     */
    visibility?: number;
    /**
     * Position in metres relative to the centre of the hips, straight from
     * MediaPipe's world landmarks, with x toward the person's right, y downward
     * and z toward the camera.
     *
     * Unlike {@link worldPosition} this is independent of where the person is in
     * the room and of the camera's intrinsics, so it can be used to render a
     * correctly proportioned skeleton anywhere. Undefined when the backend does
     * not provide metric landmarks.
     */
    metricPosition?: THREE.Vector3;
    /**
     * The back-projected 3D position in WebXR world space, measured in meters.
     * Null or undefined if depth projection was unsuccessful.
     */
    worldPosition?: THREE.Vector3;
}
/**
 * Represents a single human body pose detected in physical space.
 * Inherits from `THREE.Object3D` to fit naturally into the Three.js scene graph,
 * positioning itself at the estimated hips/center of the tracked human.
 */
declare class DetectedBodyPose extends THREE.Object3D {
    poseId: number;
    landmarks: PoseLandmark[];
    detection2DBoundingBox: THREE.Box2;
    /**
     * Creates an instance of DetectedBodyPose.
     *
     * @param poseId - A unique tracking identifier for this body pose.
     * @param landmarks - The list of raw and 3D-projected anatomical landmarks.
     * @param detection2DBoundingBox - The 2D bounding box of the person in normalized screen space.
     */
    constructor(poseId: number, landmarks: PoseLandmark[], detection2DBoundingBox: THREE.Box2);
    /**
     * Returns the 3D world space position of a specific joint/landmark in meters.
     * Exposes both standard MediaPipe landmark mappings and composite VRM/humanoid landmarks.
     *
     * The pose model always returns all landmarks, including ones it could not
     * actually see, so a body that is only half in frame still reports legs. Pass
     * `minVisibility` to drop those guesses instead of drawing them.
     *
     * @param name - The name of the joint (standard or composite).
     * @param options - Set `minVisibility` to reject landmarks the model is not
     *   confident about. Defaults to 0, which keeps every landmark.
     * @returns A clone of the 3D world space position vector, or `null` if the joint is undetected, unprojected, or below `minVisibility`.
     */
    getJointPosition(name: PoseJointName | string, { minVisibility }?: {
        minVisibility?: number;
    }): THREE.Vector3 | null;
}

/**
 * A detector script that orchestrates human body pose estimation.
 * Manages the backend pose detector lifecycle (e.g., MediaPipe) and exposes the detected
 * poses, including 3D joint landmarks, in the world coordinate space.
 */
declare class HumanRecognizer extends Script {
    static dependencies: {
        options: typeof WorldOptions;
        deviceCamera: typeof XRDeviceCamera;
        depth: typeof Depth;
        camera: typeof THREE.Camera;
        renderer: typeof THREE.WebGLRenderer;
    };
    private detectorBackends;
    private activeClients;
    private currentDetectionPromise;
    private lastContinuousDetectionStartedAtMs;
    private disposed;
    /**
     * The latest detected body poses.
     */
    poses: DetectedBodyPose[];
    private options;
    private deviceCamera;
    private depth;
    private camera;
    private renderer;
    targetDevice: string;
    init({ options, deviceCamera, depth, camera, renderer, }: {
        options: WorldOptions;
        deviceCamera: XRDeviceCamera;
        depth: Depth;
        camera: THREE.PerspectiveCamera;
        renderer: THREE.WebGLRenderer;
    }): void;
    /**
     * Starts continuous pose detection for the given client.
     * If this is the first client, starts the background detection loop.
     * @param client - The client object requesting pose detection.
     */
    start(client: object): void;
    /**
     * Stops continuous pose detection for the given client.
     * If this was the last client, stops the background detection loop.
     * @param client - The client object that no longer needs pose detection.
     */
    stop(client: object): void;
    /**
     * Called per frame by the engine. If there are active clients,
     * ensures the continuous pose detection is running.
     */
    update(): void;
    private runContinuousDetection;
    /**
     * Runs a pose detection or returns the ongoing detection promise.
     *
     * - If continuous detection is started (has active clients), returns the promise
     *   for the next detection result.
     * - If continuous detection is not started, performs a one-off detection and
     *   returns the result. If a one-off detection is already in progress, returns
     *   the promise for that ongoing detection.
     *
     * @returns A promise resolving to the next body pose detection result.
     */
    runDetection(): Promise<DetectedBodyPose[]>;
    private runDetectionInternal;
    private getBackendContext;
    private getOrCreateBackend;
    private getDepthMeshSnapshot;
    private disposeDepthMeshSnapshot;
    dispose(): void;
}

/**
 * A single facial landmark point. MediaPipe's FaceLandmarker emits 478
 * of these per face (468 from the canonical face mesh + 10 iris points).
 */
interface FaceLandmark {
    /**
     * Normalized horizontal coordinate [0.0, 1.0] in screen space,
     * where 0.0 is the left edge and 1.0 is the right edge.
     */
    x: number;
    /**
     * Normalized vertical coordinate [0.0, 1.0] in screen space,
     * where 0.0 is the top edge and 1.0 is the bottom edge.
     */
    y: number;
    /**
     * Raw estimated depth value relative to the camera. Smaller magnitude
     * means closer to the camera; the value is in the same arbitrary
     * normalized space as `x` and `y`.
     */
    z: number;
    /**
     * The back-projected 3D position in WebXR world space, measured in
     * meters. Null or undefined if depth projection was unsuccessful.
     */
    worldPosition?: THREE.Vector3;
}
/**
 * A single blendshape category and its activation weight. The category
 * names follow the ARKit blendshape vocabulary used by MediaPipe's
 * Face Landmarker (e.g. `jawOpen`, `mouthSmileLeft`, `eyeBlinkRight`).
 */
interface FaceBlendshape {
    /**
     * The category name (ARKit / FaceLandmarker convention).
     */
    categoryName: string;
    /**
     * Activation weight in `[0.0, 1.0]`. Zero means the blendshape is
     * fully off; one means fully on. MediaPipe applies internal
     * smoothing so consecutive frames don't jitter.
     */
    score: number;
}
/**
 * Common facial landmark anchor names. These map to specific indices
 * in the 478-point MediaPipe FaceLandmarker mesh and are exposed for
 * convenience so callers can read e.g. the nose tip without memorising
 * the index 1.
 */
declare enum FaceLandmarkName {
    NoseTip = "noseTip",
    Chin = "chin",
    LeftEyeOuterCorner = "leftEyeOuterCorner",
    LeftEyeInnerCorner = "leftEyeInnerCorner",
    RightEyeOuterCorner = "rightEyeOuterCorner",
    RightEyeInnerCorner = "rightEyeInnerCorner",
    LeftPupil = "leftPupil",
    RightPupil = "rightPupil",
    MouthLeftCorner = "mouthLeftCorner",
    MouthRightCorner = "mouthRightCorner",
    UpperLipCenter = "upperLipCenter",
    LowerLipCenter = "lowerLipCenter",
    ForeheadCenter = "foreheadCenter"
}
/**
 * Represents a single human face detected in physical space.
 * Inherits from `THREE.Object3D` to fit naturally into the Three.js
 * scene graph, positioning itself at the estimated nose tip of the
 * tracked face. When a facial transformation matrix is emitted by the
 * backend it is decomposed onto `position`, `quaternion`, and `scale`
 * so the Object3D directly represents the rigid head pose.
 */
declare class DetectedFace extends THREE.Object3D {
    faceId: number;
    landmarks: FaceLandmark[];
    detection2DBoundingBox: THREE.Box2;
    blendshapes: FaceBlendshape[];
    facialTransformationMatrix: THREE.Matrix4 | null;
    /**
     * Creates an instance of DetectedFace.
     *
     * @param faceId - A unique tracking identifier for this face.
     * @param landmarks - The 478 raw + 3D-projected facial landmarks.
     * @param detection2DBoundingBox - The 2D bounding box of the face in
     *     normalized screen space.
     * @param blendshapes - Optional 52 ARKit-style blendshape weights.
     *     Empty when the backend was configured with
     *     `outputFaceBlendshapes: false`.
     * @param facialTransformationMatrix - Optional 4x4 rigid head pose
     *     matrix in world space. Null when the backend was configured
     *     with `outputFacialTransformationMatrixes: false`.
     */
    constructor(faceId: number, landmarks: FaceLandmark[], detection2DBoundingBox: THREE.Box2, blendshapes?: FaceBlendshape[], facialTransformationMatrix?: THREE.Matrix4 | null);
    /**
     * Returns the 3D world-space position of a named facial landmark.
     *
     * @param name - The landmark name to look up.
     * @returns A clone of the landmark's world position, or `null` if the
     *     index is out of range or depth back-projection was unsuccessful.
     */
    getLandmarkPosition(name: FaceLandmarkName): THREE.Vector3 | null;
    /**
     * Returns the score for a blendshape category, or `0` if the category
     * isn't present in the current detection.
     *
     * @param categoryName - The ARKit category name, e.g. `jawOpen`.
     */
    getBlendshape(categoryName: string): number;
}

/**
 * A detector script that orchestrates face landmark estimation. Manages
 * the backend face detector lifecycle (e.g. MediaPipe) and exposes the
 * detected faces, including 3D landmark positions, blendshape weights,
 * and rigid head transforms, in the world coordinate space.
 */
declare class FaceRecognizer extends Script {
    static dependencies: {
        options: typeof WorldOptions;
        deviceCamera: typeof XRDeviceCamera;
        depth: typeof Depth;
        camera: typeof THREE.Camera;
        renderer: typeof THREE.WebGLRenderer;
    };
    private _detectorBackends;
    private activeClients;
    private currentDetectionPromise;
    private lastContinuousDetectionStartedAtMs;
    private disposed;
    /**
     * The latest detected faces from continuous detection.
     */
    detectedFaces: DetectedFace[];
    private options;
    private deviceCamera;
    depth: Depth;
    private camera;
    private renderer;
    targetDevice: string;
    init({ options, deviceCamera, depth, camera, renderer, }: {
        options: WorldOptions;
        deviceCamera: XRDeviceCamera;
        depth: Depth;
        camera: THREE.PerspectiveCamera;
        renderer: THREE.WebGLRenderer;
    }): void;
    /**
     * Starts continuous face detection for the given client.
     * If this is the first client, starts the background detection loop.
     * @param client - The client object requesting face detection.
     */
    start(client: object): void;
    /**
     * Stops continuous face detection for the given client.
     * If this was the last client, stops the background detection loop.
     * @param client - The client object that no longer needs face detection.
     */
    stop(client: object): void;
    /**
     * Called per frame by the engine. If there are active clients,
     * ensures the continuous face detection is running.
     */
    update(): void;
    private runContinuousDetection;
    /**
     * Runs face landmark detection or returns the ongoing detection promise.
     *
     * - If continuous detection is started (has active clients), returns the
     *   promise for the next detection result.
     * - If continuous detection is not started, performs a one-off detection and
     *   returns the result. If a one-off detection is already in progress, returns
     *   the promise for that ongoing detection.
     */
    runDetection(): Promise<DetectedFace[]>;
    private runDetectionInternal;
    private getBackendContext;
    private getOrCreateBackend;
    private cachedDepthMeshSnapshot;
    private cachedDepthMeshSource;
    private cachedDepthMeshVersion;
    private getDepthMeshSnapshot;
    private disposeCachedDepthMeshSnapshot;
    dispose(): void;
}

/**
 * Per-pixel semantic categories emitted by the selfie multiclass segmentation
 * model. Index `0` is the background; every other index is part of a person,
 * so anything `>= 1` can be treated as foreground.
 */
declare enum SegmentCategory {
    Background = 0,
    Hair = 1,
    BodySkin = 2,
    FaceSkin = 3,
    Clothes = 4,
    Others = 5
}
/**
 * A single-frame segmentation result: a tightly packed, row-major map of
 * per-pixel {@link SegmentCategory} indices at the given resolution.
 */
interface SegmentationMask {
    /** Row-major per-pixel category indices, length `width * height`. */
    data: Uint8Array;
    /** Mask width in pixels. */
    width: number;
    /** Mask height in pixels. */
    height: number;
}

/**
 * A Script that runs semantic segmentation on the device camera feed and
 * returns a per-pixel category mask ({@link SegmentationMask}).
 *
 * Mirrors `HumanRecognizer` / `ObjectDetector`, but without any depth or
 * world-space step, segmentation is a pure 2D camera-to-mask operation, so it
 * does not depend on the depth mesh or camera intrinsics.
 *
 * Multiple concurrent calls to {@link runSegmentation} within the same async
 * cycle are coalesced: only one MediaPipe inference is dispatched per cycle
 * and its result is shared with all callers. The latest completed mask is also
 * available synchronously via {@link latestMask}.
 */
declare class Segmenter extends Script {
    static dependencies: {
        options: typeof WorldOptions;
        deviceCamera: typeof XRDeviceCamera;
    };
    private _backends;
    /** The result of the most recently completed segmentation pass. */
    private _latestMask;
    /**
     * The inference currently in progress, shared among all concurrent callers
     * so MediaPipe is not invoked more than once per cycle.
     */
    private _inferenceInFlight;
    /**
     * Timestamp (ms) of the most recent inference kick-off. Initialised to
     * `Number.NEGATIVE_INFINITY` so the first `update()` tick fires immediately.
     */
    private _lastRunMs;
    private _disposed;
    private options;
    private deviceCamera;
    init({ options, deviceCamera, }: {
        options: WorldOptions;
        deviceCamera: XRDeviceCamera;
    }): void;
    /**
     * The latest cached segmentation mask from the most recently completed
     * inference pass. Returns `null` until the first inference finishes.
     */
    get latestMask(): SegmentationMask | null;
    /**
     * Continuous throttled loop driven by the engine frame tick.
     *
     * Called every frame by `ScriptsManager` (via `Core.update → scriptsManager.update`).
     * Kicks off a fresh inference pass at most once per
     * `options.segmentation.pollingIntervalMs` milliseconds. The in-flight guard
     * prevents stacking: if a previous inference is still running the tick is
     * silently skipped rather than launching a second one.
     *
     * After each completed inference {@link latestMask} is updated so all
     * consumers in the same frame read the same cached result without each
     * triggering their own MediaPipe run.
     *
     * @param time - Current timestamp in milliseconds, forwarded from the
     *   engine frame loop.
     */
    update(time: number): void;
    /**
     * Runs one segmentation pass over the current camera frame, or returns the
     * result of the in-flight pass when one is already running. Multiple callers
     * in the same async cycle share a single MediaPipe inference rather than
     * each triggering their own.
     *
     * Under normal usage consumers should poll {@link latestMask} (kept fresh
     * by the automatic loop) rather than calling this directly.
     *
     * @returns The mask, or `null` if the backend or camera frame is not ready.
     */
    runSegmentation(): Promise<SegmentationMask | null>;
    private _runInference;
    private getBackendContext;
    private getOrCreateBackend;
    dispose(): void;
}

/**
 * Manages all interactions with the real-world environment perceived by the XR
 * device. This class abstracts the complexity of various perception APIs
 * (Depth, Planes, Meshes, etc.) and provides a simple, event-driven interface
 * for developers to use `this.world.depth.mesh`, `this.world.planes`.
 */
declare class World extends Script {
    static dependencies: {
        options: typeof WorldOptions;
        camera: typeof THREE.Camera;
        waitFrame: typeof WaitFrame;
        timer: typeof THREE.Timer;
    };
    editorIcon: string;
    /**
     * Configuration options for all world-sensing features.
     */
    options: WorldOptions;
    /**
     * The depth module instance. Null if not enabled.
     */
    /**
     * The light estimation module instance. Null if not enabled.
     */
    /**
     * The plane detection module instance. Null if not enabled.
     * Not recommended for anchoring.
     */
    planes?: PlaneDetector;
    anchors?: AnchorManager;
    /**
     * The object recognition module instance. Null if not enabled.
     */
    objects?: ObjectDetector;
    /**
     * The mesh detection module instance. Null if not enabled.
     */
    meshes?: MeshDetector;
    /**
     * The sound detection module instance. Null if not enabled.
     */
    sounds?: SoundDetector;
    /**
     * The human recognition/pose module instance. Null if not enabled.
     */
    humans?: HumanRecognizer;
    /**
     * The face landmark detection module instance. Null if not enabled.
     */
    faces?: FaceRecognizer;
    /**
     * The semantic segmentation module instance. Null if not enabled.
     */
    segmentation?: Segmenter;
    /**
     * A Three.js Raycaster for performing intersection tests.
     */
    private raycaster;
    private camera;
    private waitFrame;
    private timer;
    private needsRoomCapture;
    private resolveInitialized;
    readonly initializedPromise: Promise<void>;
    /**
     * Initializes the world-sensing modules based on the provided configuration.
     * This method is called automatically by the XRCore.
     */
    init({ options, camera, waitFrame, timer, }: {
        options: WorldOptions;
        camera: THREE.Camera;
        waitFrame: WaitFrame;
        timer: THREE.Timer;
    }): Promise<void>;
    /**
     * Places an object at the reticle.
     */
    anchorObjectAtReticle(_object: THREE.Object3D, _reticle: THREE.Object3D): void;
    /**
     * Updates all active world-sensing modules with the latest XRFrame data.
     * This method is called automatically by the XRCore on each frame.
     * @param _timestamp - The timestamp for the current frame.
     * @param frame - The current XRFrame, containing environmental
     * data.
     * @override
     */
    update(_timestamp: number, frame?: XRFrame): void;
    /**
     * Performs a raycast from a controller against detected real-world surfaces
     * (currently planes) and places a 3D object at the intersection point,
     * oriented to face the user.
     *
     * See /templates/3_spatial_placement/ for a complete placement example.
     *
     * @param objectToPlace - The object to position in the
     * world.
     * @param controller - The controller to use for raycasting.
     * @returns True if the object was successfully placed, false
     * otherwise.
     */
    placeOnSurface(objectToPlace: THREE.Object3D, controller: THREE.Object3D): boolean;
    /**
     * Places an object onto a suitable horizontal plane in the environment.
     * It prioritizes planes in front of the user, prefers tables/elevated surfaces over floors,
     * and ensures the object does not intersect other existing objects or other planes in the scene.
     * If placement fails in the current frame, it continues retrying frame-by-frame until the timeout is reached.
     *
     * @param objectToPlace - The Three.js Object3D to place.
     * @param timeout - Optional timeout duration as a Temporal.Duration or Temporal.DurationLike object (defaults to 500ms).
     * @param gridSteps - Optional number of steps along each axis for grid sampling candidate positions (defaults to 5).
     * @returns A promise resolving to true if successfully placed, false otherwise.
     */
    placeOnHorizontalSurface(objectToPlace: THREE.Object3D, timeout?: Temporal.Duration | Temporal.DurationLike, gridSteps?: number): Promise<boolean>;
    /**
     * Toggles the visibility of all debug visualizations for world features.
     * @param visible - Whether the visualizations should be visible.
     */
    showDebugVisualizations(visible?: boolean): void;
    dispose(): void;
}

/** World-sensing adapters for the simulator environment. */
declare class SimulatorWorld {
    private options;
    private world;
    private simulatorPlanes?;
    init(options: Options, world: World): Promise<void>;
    preparePlanes(manifest: ResolvedSimulatorSceneManifest): Promise<SimulatorPlane[] | undefined>;
    commitPlanes(planes?: SimulatorPlane[]): void;
    suspendSimulatorSensing(): void;
    restoreSimulatorPlanes(): void;
    commitMeshes(room: THREE.Object3D | undefined, objects: SimulatorObjectsManager): void;
    /** Preserves the original simulator behavior of exposing each room submesh. */
    private createRoomMeshSources;
    private createMeshSource;
}

interface SimulatorUserPath {
    target: THREE.Vector3;
    path: THREE.Vector3[];
}
declare class Simulator extends Script {
    private renderMainScene;
    private static readonly dependencies;
    editorIcon: string;
    simulatorScene: SimulatorScene;
    simulatorWorld: SimulatorWorld;
    private readonly navMesh;
    private simulatorObjects;
    objects: SimulatorObjects;
    private environment?;
    private simulatorPhysics?;
    depth: SimulatorDepth;
    simulatorControllerState: SimulatorControllerState;
    hands: SimulatorHands;
    simulatorUser: SimulatorUser;
    userInterface: SimulatorInterface;
    controls: SimulatorControls;
    renderDepthPass: boolean;
    renderMode: SimulatorRenderMode;
    stereoCameras: THREE.Camera[];
    effects?: XREffects;
    virtualSceneRenderTarget?: THREE.WebGLRenderTarget;
    virtualSceneFullScreenQuad?: FullScreenQuad;
    backgroundVideoQuad?: FullScreenQuad;
    videoElement?: HTMLVideoElement;
    simulatorCamera?: SimulatorCamera;
    options: SimulatorOptions;
    renderer?: THREE.WebGLRenderer;
    mainCamera: THREE.Camera;
    mainScene: THREE.Scene;
    private initialized;
    private renderSimulatorSceneToCanvasBound;
    private sparkRenderer?;
    private registry?;
    private world?;
    private objectDetectionSource?;
    private deviceCamera?;
    private useSimulatorObjectDetection;
    constructor(renderMainScene: (cameraOverride?: THREE.Camera) => void);
    get userMovementConstrained(): boolean;
    moveUser(desiredCameraPosition: THREE.Vector3): void;
    findRandomUserPath(): SimulatorUserPath | null;
    init({ simulatorOptions, input, interaction, timer, camera, renderer, scene, registry, options, depth, world, }: {
        simulatorOptions: SimulatorOptions;
        input: Input;
        interaction: Interaction;
        timer: THREE.Timer;
        camera: THREE.Camera;
        renderer: THREE.WebGLRenderer;
        scene: THREE.Scene;
        registry: Registry;
        options: Options;
        depth: Depth;
        world: World;
    }): Promise<void>;
    /**
     * Loads and activates a simulator environment at runtime.
     */
    setEnvironment(manifestPath: string): Promise<void>;
    setEnvironment(name: string, manifestPath: string): Promise<void>;
    private activateEnvironment;
    get activeEnvironment(): SimulatorEnvironment | undefined;
    get activeEnvironmentManifest(): ResolvedSimulatorSceneManifest | undefined;
    /** Returns the named world-space locations for the active environment. */
    getLocations(): SimulatorLocations;
    physicsStep(): void;
    onXRSessionStarted(): void;
    onXRSessionEnded(): void;
    dispose(): void;
    simulatorUpdate(): void;
    setStereoRenderMode(mode: SimulatorRenderMode): void;
    setupStereoCameras(camera: THREE.Camera): void;
    onBeforeSimulatorSceneRender(): void;
    onSimulatorSceneRendered(): void;
    getRenderCamera(): THREE.Camera;
    renderScene(): void;
    renderSimulatorScene(): void;
    private renderSimulatorSceneToCanvas;
    private setVideoPath;
}

type ___simulator_Simulator_js_Simulator = Simulator;
declare const ___simulator_Simulator_js_Simulator: typeof Simulator;
type ___simulator_Simulator_js_SimulatorUserPath = SimulatorUserPath;
declare namespace ___simulator_Simulator_js {
  export { ___simulator_Simulator_js_Simulator as Simulator };
  export type { ___simulator_Simulator_js_SimulatorUserPath as SimulatorUserPath };
}

type GestureEventType = 'gesturestart' | 'gestureupdate' | 'gestureend';
type GestureHandedness = 'left' | 'right';
interface GestureEventDetail {
    /**
     * The canonical gesture identifier from the configured gesture recognizer.
     */
    name: string;
    /** Which hand triggered the gesture. */
    hand: GestureHandedness;
    /** Gesture recognizer confidence score, normalized to [0, 1]. */
    confidence: number;
    /**
     * Optional payload for recognizer specific values (e.g. pinch distance,
     * velocity vectors).
     */
    data?: Record<string, unknown>;
}
interface GestureEvent {
    type: GestureEventType;
    detail: GestureEventDetail;
}

type GestureScriptEvent = THREE.Event & {
    type: GestureEventType;
    target: GestureRecognition;
    detail: GestureEventDetail;
};
interface GestureRecognitionEventMap extends THREE.Object3DEventMap {
    gesturestart: GestureScriptEvent;
    gestureupdate: GestureScriptEvent;
    gestureend: GestureScriptEvent;
}
declare class GestureRecognition extends Script<GestureRecognitionEventMap> {
    static dependencies: {
        user: typeof User;
        options: typeof GestureRecognitionOptions;
    };
    private options;
    private activeGestures;
    private latestScores;
    private pendingRecognition;
    private lastEvaluation;
    init({ options, user, }: {
        options: GestureRecognitionOptions;
        user: User;
    }): Promise<void>;
    update(): void;
    private evaluateHand;
    private recognizeHand;
    private emitFromScores;
    private emitGesture;
    dispose(): void;
}

/**
 * Lighting provides XR lighting capabilities within the XR Blocks framework.
 * It uses webXR to propvide estimated lighting that matches the environment
 * and supports casting shadows from the estimated light.
 */
declare class Lighting {
    static instance?: Lighting;
    /** WebXR estimated lighting. */
    private xrLight?;
    /** Main Directional light. */
    dirLight: THREE.DirectionalLight;
    /** Ambient spherical harmonics light. */
    ambientProbe: THREE.LightProbe;
    /** Ambient RGB light. */
    ambientLight: THREE.Vector3;
    /** Opacity of cast shadow. */
    private shadowOpacity;
    /** Light group to attach to scene. */
    private lightGroup;
    /** Lighting options. Set during initialiation.*/
    private options;
    /** Depth manager. Used to get depth mesh on which to cast shadow. */
    private depth?;
    /** Flag to indicate if simulator is running. Controlled by Core. */
    simulatorRunning: boolean;
    /**
     * Lighting is a lightweight manager based on three.js to simply prototyping
     * with Lighting features within the XR Blocks framework.
     */
    constructor();
    /**
     * Initializes the lighting module with the given options. Sets up lights and
     * shadows and adds necessary components to the scene.
     * @param lightingOptions - Lighting options.
     * @param renderer - Main renderer.
     * @param scene - Main scene.
     * @param depth - Depth manager.
     */
    init(lightingOptions: LightingOptions, renderer: THREE.WebGLRenderer, scene: THREE.Scene, depth?: Depth): void;
    /**
     * Updates the lighting and shadow setup used to render. Called every frame
     * in the render loop.
     */
    update(): void;
    /**
     * Logs current estimate light parameters for debugging.
     */
    debugLog(): void;
}

/**
 * Defines the possible XR modes.
 */
type XRMode = 'AR' | 'VR';
type XRTransitionToVROptions = {
    /** The target opacity. */
    targetAlpha?: number;
    /** The target color. Defaults to `defaultBackgroundColor`. */
    color?: THREE.Color | number;
};
/**
 * Manages smooth transitions between AR (transparent) and VR (colored)
 * backgrounds within an active XR session.
 */
declare class XRTransition extends MeshScript<THREE.SphereGeometry, THREE.MeshBasicMaterial> {
    xb: {
        pointerEvents: "none";
    };
    static dependencies: {
        renderer: typeof THREE.WebGLRenderer;
        camera: typeof THREE.Camera;
        timer: typeof THREE.Timer;
        scene: typeof THREE.Scene;
        options: typeof Options;
    };
    /** Current XR mode, either 'AR' or 'VR'. Defaults to 'AR'. */
    currentMode: XRMode;
    /** The duration in seconds for the fade-in and fade-out transitions. */
    private transitionTime;
    private renderer;
    private scene;
    private sceneCamera;
    private timer;
    private targetAlpha;
    private defaultBackgroundColor;
    constructor();
    init({ renderer, camera, timer, scene, options, }: {
        renderer: THREE.WebGLRenderer;
        camera: THREE.Camera;
        timer: THREE.Timer;
        scene: THREE.Scene;
        options: Options;
    }): void;
    /**
     * Starts the transition to a VR background.
     * @param options - Optional parameters.
     */
    toVR({ targetAlpha, color }?: XRTransitionToVROptions): void;
    /**
     * Starts the transition to a transparent AR background.
     */
    toAR(): void;
    update(): void;
    dispose(): void;
}

type CoreLifecycleState = 'new' | 'initializing' | 'running' | 'disposing' | 'disposed';
type SimulatorModule = typeof ___simulator_Simulator_js;
type SimulatorLoader = () => Promise<SimulatorModule>;
/**
 * Core is the central engine of the XR Blocks framework, acting as a
 * singleton manager for all XR subsystems. Its primary goal is to abstract
 * low-level WebXR and THREE.js details, providing a simplified and powerful API
 * for developers and AI agents to build interactive XR applications.
 */
declare class Core {
    static instance?: Core;
    /**
     * Component responsible for capturing screenshots of the XR scene for AI.
     */
    screenshotSynthesizer: ScreenshotSynthesizer;
    /**
     * Component responsible for waiting for the next frame.
     */
    waitFrame: WaitFrame;
    /**
     * Caches WebXR reference spaces for the active session.
     */
    xrReferenceSpaceCache: XRReferenceSpaceCache;
    /**
     * Registry used for dependency injection on existing subsystems.
     */
    registry: Registry;
    /**
     * A timer for tracking time deltas. Call timer.getDelta() or getDeltaTime().
     */
    timer: THREE.Timer;
    private simulationTimer;
    /** Manages hand, mouse, gaze inputs. */
    input: Input;
    /** The main camera for rendering. */
    camera: THREE.PerspectiveCamera;
    /** The root scene graph for all objects. */
    scene: THREE.Scene<THREE.Object3DEventMap>;
    /** Represents the user in the XR scene. */
    user: User;
    /** Manages all (spatial) audio playback. */
    sound: CoreSound;
    /** A container to hold all the systems in the scene hierarchy. */
    xrSystemsGroup: XRSystems;
    private renderSceneCallback;
    /** The desktop XR simulator after its runtime chunk has loaded. */
    simulator?: Simulator;
    private simulatorLoader;
    /** Private interaction runtime. */
    private interaction;
    private reticleOptions;
    private reticlePresenter;
    private uiRenderer;
    private physicsInterval?;
    private manualPhysicsAccumulatorMs;
    private rendererContainer?;
    private lifecycleState;
    private initializationPromise?;
    private disposalPromise?;
    /** Manages real-world understanding: planes, meshes, objects, and sounds. */
    world: World;
    /** Manages agent-facing observations of the app/session. */
    context: Context;
    /** A shared texture loader. */
    textureLoader: THREE.TextureLoader;
    private webXRSettings;
    private shouldAutostartSimulator;
    /** Whether the XR simulator is currently active. */
    simulatorRunning: boolean;
    private startingSimulator?;
    private onWebXRSessionStarted;
    private onWebXRUnsupported;
    private _isPaused;
    private isSteppingFrame;
    private manualStepTime;
    private _renderer?;
    options: Options;
    deviceCamera?: XRDeviceCamera;
    depth: Depth;
    lighting?: Lighting;
    physics?: Physics;
    xrButton?: XRButton;
    effects?: XREffects;
    ai: AI;
    poseEstimation?: PoseEstimator;
    gestureRecognition?: GestureRecognition;
    transition?: XRTransition;
    get currentFrame(): XRFrame | undefined;
    scriptsManager: ScriptsManager;
    renderSceneOverride?: (renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) => void;
    webXRSessionManager?: WebXRSessionManager;
    permissionsManager: PermissionsManager;
    /**
     * The WebGL renderer, created during {@link Core.init}. Reading it before
     * `init()` has run returns `undefined` and logs a one-time warning.
     */
    get renderer(): THREE.WebGLRenderer;
    set renderer(renderer: THREE.WebGLRenderer);
    get isPaused(): boolean;
    get elapsedTime(): number;
    /** Current state of this terminal Core lifetime. */
    get lifecycle(): CoreLifecycleState;
    pause(): void;
    resume(): void;
    stepFrame(dtMs?: number): void;
    /**
     * Core is a singleton manager that manages all XR "blocks".
     * It initializes core components and abstractions like the scene, camera,
     * user, UI, AI, and input managers.
     */
    constructor(simulatorLoader?: SimulatorLoader);
    dispose(): Promise<void>;
    private finishDisposal;
    private disposeWebXRSessionManager;
    /**
     * Initializes the Core system with a given set of options. This includes
     * setting up the renderer, enabling features like controllers, depth
     * sensing, and physics, and starting the render loop.
     * @param options - Configuration options for the
     * session.
     */
    init(options?: Options): Promise<void>;
    private runInitialization;
    private initialize;
    /**
     * The main update loop, called every frame by the renderer. It orchestrates
     * all per-frame updates for subsystems and scripts.
     *
     * Order:
     * 1. Sample physical input.
     * 2. Run Script updates.
     * 3. Reconcile UI layout and world matrices.
     * 4. Raycast and resolve Interaction.
     * 5. Present Interaction state.
     * 6. Render the world and overlays.
     * @param time - The current time in milliseconds.
     * @param frame - The WebXR frame object, if in an XR session.
     */
    private update;
    /**
     * Advances the physics simulation by a fixed timestep and calls the
     * corresponding physics update on all active scripts.
     */
    private physicsStep;
    /**
     * Lifecycle callback executed when an XR session starts. Notifies all active
     * scripts.
     * @param session - The newly started WebXR session.
     */
    private onXRSessionStarted;
    startSimulator: () => Promise<Simulator>;
    /**
     * Lifecycle callback executed when an XR session ends. Notifies all active
     * scripts.
     */
    private onXRSessionEnded;
    private isLifecycleActive;
    private assertInitializing;
    private assertLifecycleActive;
    /**
     * Lifecycle callback executed when the desktop simulator starts. Notifies
     * all active scripts.
     */
    private onSimulatorStarted;
    /**
     * Handles browser window resize events to keep the camera and renderer
     * synchronized.
     */
    private onWindowResize;
    private renderSimulatorAndScene;
    private getFrameCamera;
    private renderScene;
}

/**
 * VisemeWeights: the small mouth-shape vocabulary {@link StylizedFace}
 * consumes. Anything that wants to drive a face — a lipsync addon, an
 * ARKit blendshape feed, a hand-authored animation — produces a value
 * of this shape and passes it to `face.setVisemes(...)`.
 *
 * Lives in core (not in any addon) so addons that produce visemes and
 * addons that consume them never have to depend on each other.
 *
 * Each field is a 0..1 weight; values outside that range are clamped
 * by the consumer. The set is deliberately small — it covers the four
 * cardinal vowel shapes plus a generic consonant/closed lip — so it
 * can be driven cheaply from formants, blendshapes, or simple
 * heuristics without needing the full 15-viseme ARKit set.
 */
interface VisemeWeights {
    /** Jaw drop, independent of lip rounding. */
    jawOpen: number;
    /** /aa/ as in "father". Wide and open. */
    aa: number;
    /** /oo/ as in "boot". Narrow and rounded. */
    oo: number;
    /** /oh/ as in "go". Mid-round. */
    oh: number;
    /** /ee/ as in "see". Wide and closed. */
    ee: number;
    /** Generic consonant / lips closed. */
    consonant: number;
}
/** Zero-weight viseme set; useful as a rest pose initialiser. */
declare const ZERO_VISEME: Readonly<VisemeWeights>;

/**
 * StylizedFace: a tiny face primitive that any avatar can adopt. Draws
 * a pair of static eyes and a parametric mouth onto a single canvas
 * texture mapped to a forward-facing plane. The mouth morphs from a
 * thin closed line into a wider oval as the speaker opens up; the eyes
 * occasionally blink so the host head reads as alive.
 *
 * Extends `Script` so the xrblocks scripts manager calls `update()`
 * every frame — that's how the blink loop keeps animating even when
 * nothing is driving the mouth (no incoming lipsync stream, no
 * `setVisemes()` calls). A face with neither audio nor blendshape feed
 * is still a face that blinks.
 *
 * The plane sits flush with the front of the host head sphere on the
 * local -Z side (WebXR head-forward convention) and never z-fights with
 * the head itself. Construct, parent to a head pivot, done. To remove
 * the face from the scene call `parent.remove(face)`; `dispose()`
 * releases the canvas texture and geometry.
 */

interface StylizedFaceOptions {
    /**
     * Approximate radius (metres) of the host head this face attaches to.
     * Used to scale the face quad and place it just outside the head
     * sphere. Defaults to 0.1, matching netblocks `RemoteUserAvatar`'s
     * head sphere; pass 0.18 (for example) if attaching to a bigger
     * custom head.
     */
    headRadius?: number;
    /** Square canvas dimension in pixels. Defaults to 256. */
    textureSize?: number;
    /**
     * Draw the pair of static eyes above the mouth on the same canvas.
     * Defaults to true. Set false when the host avatar already provides
     * its own eye geometry (e.g. a custom puppet head) to avoid
     * doubled-up eyes.
     */
    showEyes?: boolean;
}
interface LipMetrics {
    /** Horizontal mouth width, normalised. Wider for /ee/, narrower for /oo/. */
    width: number;
    /** Vertical mouth opening, 0 (closed line) to ~1 (fully agape). */
    openHeight: number;
}
declare class StylizedFace extends Script {
    readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    readonly texture: THREE.CanvasTexture;
    private readonly canvas;
    private readonly ctx;
    private readonly headRadius;
    private readonly showEyes;
    /** Last viseme weights applied; useful for testing and debugging. */
    visemes: VisemeWeights;
    /** Computed lip metrics from the most recent setVisemes call. */
    metrics: LipMetrics;
    private lastDrawnWidth;
    private lastDrawnOpenHeight;
    private lastDrawnBlinkScale;
    private nextBlinkAt;
    private blinkStartAt;
    private static readonly BLINK_MS;
    private _disposed;
    constructor(opts?: StylizedFaceOptions);
    /**
     * Drive the mouth drawing from a viseme weight set. Cheap enough to
     * call every frame; redraws and re-uploads the canvas texture only
     * when the lip shape or blink frame would actually change pixels.
     */
    setVisemes(v: VisemeWeights): void;
    /**
     * Frame hook — keeps the blink animation running independently of
     * any external `setVisemes` driver. A face that isn't being driven
     * (no lipsync stream, no blendshape feed) still blinks on its own.
     */
    update(): void;
    /** Free the texture, geometry, and material. Idempotent. */
    dispose(): void;
    private drawIfDirty;
    private drawFace;
    /**
     * Returns the vertical scale (0..1) for the eyes at the given wall
     * clock time. 1 = fully open; near 0 = mid-blink. Also advances the
     * blink schedule as a side effect (starts a new blink when due).
     */
    private currentBlinkScale;
}

/**
 * Generates a visual representation of the current depth buffer on a
 * {@link Depth} instance and triggers a download for debugging.
 * @param depth - The depth subsystem instance.
 * @param viewIndex - The depth view index to visualize.
 */
declare function visualizeDepth(depth: Depth, viewIndex?: number): void;
/**
 * Generates a visual representation of a depth map, normalized to 0-1 range,
 * and triggers a download for debugging.
 * @param depthArray - The raw depth data array.
 * @param width - The depth map width in pixels.
 * @param height - The depth map height in pixels.
 */
declare function visualizeDepthMap(depthArray: DepthArray, width: number, height: number): void;

/**
 * Occlusion postprocessing shader pass.
 * This is used to generate an occlusion map.
 * There are two modes:
 * Mode A: Generate an occlusion map for individual materials to use.
 * Mode B: Given a rendered frame, run as a postprocessing pass, occluding all
 * items in the frame. The steps are
 * 1. Compute an occlusion map between the real and virtual depth.
 * 2. Blur the occlusion map using Kawase blur.
 * 3. (Mode B only) Apply the occlusion map to the rendered frame.
 */
declare class OcclusionPass extends Pass {
    private scene;
    private camera;
    renderToScreen: boolean;
    private occludableItemsLayer;
    private depthTextures;
    private occlusionMeshMaterial;
    private occlusionMapUniforms;
    private occlusionMapQuad;
    private occlusionMapTexture;
    private kawaseBlurQuads;
    private kawaseBlurTargets;
    private occlusionUniforms;
    private occlusionQuad;
    private depthNear;
    private depthViewMatrices;
    private depthProjectionMatrices;
    private lastOcclusionMapSize;
    private lastKawaseBlurSize;
    private readonly renderDimensions;
    constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, useFloatDepth?: boolean, renderToScreen?: boolean, occludableItemsLayer?: number);
    private setupKawaseBlur;
    setDepthTexture(depthTexture: THREE.Texture, rawValueToMeters: number, viewId: number, depthNear?: number, depthViewMatrix?: THREE.Matrix4, depthProjectionMatrix?: THREE.Matrix4): void;
    /**
     * Render the occlusion map.
     * @param renderer - The three.js renderer.
     * @param writeBuffer - The buffer to write the final result.
     * @param readBuffer - The buffer for the current of virtual depth.
     * @param viewId - The view to render.
     */
    render(renderer: THREE.WebGLRenderer, writeBuffer?: THREE.WebGLRenderTarget, readBuffer?: THREE.WebGLRenderTarget, viewId?: number): void;
    renderOcclusionMapFromScene(renderer: THREE.WebGLRenderer, dimensions: THREE.Vector2, viewId: number): void;
    renderOcclusionMapFromReadBuffer(renderer: THREE.WebGLRenderer, readBuffer: THREE.RenderTarget, dimensions: THREE.Vector2, viewId: number): void;
    blurOcclusionMap(renderer: THREE.WebGLRenderer, dimensions: THREE.Vector2): void;
    private resizeOcclusionMap;
    private resizeKawaseBlur;
    applyOcclusionMapToRenderedImage(renderer: THREE.WebGLRenderer, readBuffer?: THREE.WebGLRenderTarget, writeBuffer?: THREE.WebGLRenderTarget): void;
    dispose(): void;
    updateOcclusionMapUniforms(uniforms: ShaderUniforms, renderer: THREE.WebGLRenderer): void;
}

declare class OcclusionUtils {
    /**
     * Creates a simple material used for rendering objects into the occlusion
     * map. This material is intended to be used with `renderer.overrideMaterial`.
     * @returns A new instance of THREE.MeshBasicMaterial.
     */
    static createOcclusionMapOverrideMaterial(): THREE.MeshBasicMaterial;
    /**
     * Modifies a material's shader in-place to incorporate distance-based
     * alpha occlusion. This is designed to be used with a material's
     * `onBeforeCompile` property. This only works with built-in three.js
     * materials.
     * @param shader - The shader object provided by onBeforeCompile.
     */
    static addOcclusionToShader(shader: Shader): void;
}

/**
 * The result of a stroke recognition attempt.
 */
interface StrokeRecognitionResult {
    /** The name of the recognized shape. */
    recognizedShape: string;
    /** The confidence score of the recognition, typically between 0 and 1. */
    confidence: number;
}

/**
 * Types of events emitted by the StrokeRecognizer.
 */
type UnistrokeEventType = 'unistrokestart' | 'unistrokeupdate' | 'unistrokeend';
/**
 * Detail payload for Unistroke events.
 */
interface UnistrokeEventDetail {
    /** The current world position of the tracked joint (for updates). */
    point?: THREE.Vector3;
    /** The result of the stroke recognition (for end event). */
    result?: StrokeRecognitionResult;
}
/**
 * Custom event for unistroke interactions.
 */
type UnistrokeEvent = THREE.Event & {
    type: UnistrokeEventType;
    target: StrokeRecognizer;
    detail: UnistrokeEventDetail;
};
/**
 * Event map for the StrokeRecognizer, defining the events it can dispatch.
 */
interface StrokeEventMap extends THREE.Object3DEventMap {
    unistrokestart: UnistrokeEvent;
    unistrokeupdate: UnistrokeEvent;
    unistrokeend: UnistrokeEvent;
}
/**
 * StrokeRecognizer is a framework Script that handles recording hand stroke gestures
 * and recognizing them as geometric shapes using a configured provider.
 * It listens to gesture events and tracks specified hand joints to record the path.
 */
declare class StrokeRecognizer extends Script<StrokeEventMap> {
    static dependencies: {
        scene: typeof THREE.Scene;
        camera: typeof THREE.Camera;
        user: typeof User;
        options: typeof StrokeRecognitionOptions;
    };
    private options;
    private recognizer;
    private capturedPoints;
    private isActive;
    private isRecording;
    private gestureStartTime;
    private gestureEndTime;
    private activeHand;
    private scene;
    private camera;
    private user;
    init({ scene, camera, user, options, }: {
        scene: THREE.Scene;
        camera: THREE.Camera;
        user: User;
        options: StrokeRecognitionOptions;
    }): void;
    dispose(): void;
    private configureProvider;
    /**
     * Activates the stroke recognizer, enabling gesture tracking and recording.
     */
    activate(): void;
    /**
     * Deactivates the stroke recognizer and clears any captured points.
     */
    deactivate(): void;
    /**
     * Clears the list of captured points.
     */
    clearPoints(): void;
    /**
     * Adds a point to the current stroke if the maximum point limit has not been reached.
     * @param pos - The world position of the point.
     * @param timestamp - The timestamp when the point was captured.
     */
    addPoint(pos: THREE.Vector3, timestamp: number): void;
    /**
     * Main update loop. Handles recording points during an active gesture
     * and triggers recognition when the gesture ends.
     */
    update(): void;
    /**
     * Calculates the best-fitting plane for a set of 3D points using a simple 3-point estimator.
     * Falls back to camera plane if points are collinear.
     */
    private calculateBestFittingPlane;
    /**
     * Filters captured points, projects them to a 2D plane, and calls the backend recognizer.
     * Uses best-fitting plane if possible, otherwise falls back to camera viewport plane.
     * @returns The recognition result or null if not enough points were captured.
     */
    private recognizeGesture;
}

type FingerName = 'index' | 'middle' | 'ring' | 'pinky';
type DigitName = 'thumb' | FingerName;
type PalmPose = {
    center: THREE.Vector3;
    width: number;
    normal: THREE.Vector3;
    right: THREE.Vector3;
    up: THREE.Vector3;
};
declare const FINGER_ORDER: FingerName[];
declare function getFingerJoint(context: HandContext, finger: FingerName, suffix: string): THREE.Vector3 | undefined;
declare function estimateHandScale(context: HandContext): number;
declare function getPalmWidth(context: HandContext): number | null;
declare function getPalmNormal(context: HandContext): THREE.Vector3 | null;
declare function getPalmRight(context: HandContext): THREE.Vector3 | null;
declare function getPalmUp(context: HandContext): THREE.Vector3 | null;
declare function getPalmPose(context: HandContext): PalmPose | null;
declare function getFingerBendAngles(context: HandContext, finger: FingerName): number[];
declare function getFingerStraightness(context: HandContext, finger: FingerName): number;
declare function getFingerCurl(context: HandContext, finger: FingerName): number;
declare function getFingerDirection(context: HandContext, finger: FingerName): THREE.Vector3 | null;
declare function getFingerPalmAlignment(context: HandContext, finger: FingerName): number;
declare function getFingerSpread(context: HandContext, fingerA: FingerName, fingerB: FingerName): number;
declare function getAdjacentFingerSpreads(context: HandContext): {
    indexMiddle: number;
    middleRing: number;
    ringPinky: number;
};
declare function getThumbBendAngles(context: HandContext): number[];
declare function getThumbStraightness(context: HandContext): number;
declare function getThumbCurl(context: HandContext): number;
declare function getThumbDirection(context: HandContext): THREE.Vector3 | null;
declare function getThumbOpposition(context: HandContext, finger?: FingerName): number;
declare function getThumbVerticalDirection(context: HandContext): number;
declare function getFingertipDistance(context: HandContext, digitA: DigitName, digitB: DigitName): number | null;
declare function getFingertipPalmDistance(context: HandContext, digit: DigitName): number | null;
declare function getBoneVectors(context: HandContext): THREE.Vector3[];
declare function getRelativeBoneAngles(context: HandContext): Float32Array<ArrayBuffer>;
declare function average(values: number[]): number;
declare function clamp01(value: number): number;

type WebXRJointRotations = Map<JointName, THREE.Quaternion>;
declare class WebXRHandContext implements HandContext {
    handedness: Handedness;
    handLabel: HandLabel;
    joints: JointPositions;
    jointRotations: WebXRJointRotations;
    constructor(handedness: Handedness, handLabel: HandLabel, joints: JointPositions, jointRotations: WebXRJointRotations);
    getJoint(jointName: JointName): THREE.Vector3 | undefined;
}
declare class WebXRHandPoseEstimator implements PoseEstimator {
    private user?;
    constructor(user?: User);
    init({ user }?: {
        user?: User;
    }): Promise<void>;
    getHandContext(handedness: Handedness): WebXRHandContext | null;
    getHandContexts(): {
        left: WebXRHandContext | undefined;
        right: WebXRHandContext | undefined;
    };
}

type MediaPipeHandLandmark = {
    x: number;
    y: number;
    z?: number;
};
declare class MediaPipeHandContext implements HandContext {
    handedness: Handedness;
    handLabel: HandLabel;
    joints: JointPositions;
    constructor(handedness: Handedness, handLabel: HandLabel, landmarks: MediaPipeHandLandmark[]);
    getJoint(jointName: JointName): THREE.Vector3 | undefined;
}
declare class MediaPipeHandPoseEstimator implements PoseEstimator {
    init(): Promise<void>;
    getHandContext(_handedness: Handedness): HandContext | null;
    getHandContexts(): Partial<Record<'left' | 'right', HandContext>>;
}

declare class TensorFlowHandPoseEstimator implements PoseEstimator {
    init(): Promise<void>;
    getHandContext(_handedness: Handedness): HandContext | null;
    getHandContexts(): Partial<Record<'left' | 'right', HandContext>>;
}

declare class HeuristicGestureRecognizer implements GestureRecognizer {
    private gestures;
    constructor(initBuiltInGestures?: boolean);
    registerGesture(name: string, detector: HeuristicGestureDetector, config?: DeepReadonly<Partial<GestureConfiguration>>): this;
    unregisterGesture(name: string): this;
    getGestureConfigurations(): Record<string, GestureConfiguration>;
    recognize(context: HandContext): GestureScoreMap;
    private registerBuiltInGestures;
}

type HeuristicHeadGestureRecognizerOptions = {
    minimumGestureDurationMs: number;
    maximumGestureDurationMs: number;
    maximumOffAxisRatio: number;
    quietPrefixDurationMs: number;
    detectionHoldMs: number;
    returnToleranceFactor: number;
    smoothingTimeConstantMs: number;
    minimumPathEfficiency: number;
    minimumPeakAngularSpeed: number;
};

declare class HeuristicHeadGestureRecognizer implements HeadGestureRecognizer {
    private gestures;
    readonly options: HeuristicHeadGestureRecognizerOptions;
    constructor(initBuiltInGestures?: boolean, options?: DeepReadonly<Partial<HeuristicHeadGestureRecognizerOptions>>);
    registerGesture(name: string, detector: HeuristicHeadGestureDetector, config?: DeepReadonly<Partial<HeadGestureConfiguration>>): this;
    unregisterGesture(name: string): this;
    getGestureConfigurations(): Record<string, HeadGestureConfiguration>;
    setGestureConfig(name: string, config: HeadGestureConfiguration): this;
    recognize(context: HeadGestureContext): HeadGestureScoreMap;
    private registerBuiltInGestures;
    private detectDirection;
}

declare class SetSimulatorEnvironmentEvent extends Event {
    environmentIndex: number;
    static type: string;
    constructor(environmentIndex: number);
}

declare class SimulatorHandPoseChangeRequestEvent extends Event {
    pose: SimulatorHandPose;
    static type: string;
    constructor(pose: SimulatorHandPose);
}

declare class SetSimulatorModeEvent extends Event {
    simulatorMode: SimulatorMode;
    static type: string;
    constructor(simulatorMode: SimulatorMode);
}

declare class ShowSimulatorInstructionsEvent extends Event {
    static type: string;
    constructor();
}

declare class SetSimulatorHandPhysicsEvent extends Event {
    enabled: boolean;
    static type: string;
    constructor(enabled: boolean);
}

declare function applySimulatorHandPoseRotationConstraints(rotations: SimulatorHandPoseRotations): SimulatorHandPoseRotations;
declare function resolveSimulatorHandPoseRotations(handedness: Handedness, rotations: SimulatorHandPoseRotations, applyConstraints?: boolean): SimulatorHandPoseJoints;
declare function resolveSimulatorRotationsFromKeypoints(handedness: Handedness, joints: DeepReadonly<SimulatorHandPoseJoints>, applyConstraints?: boolean): SimulatorHandPoseRotations;

declare const SIMULATOR_HAND_POSE_ROTATIONS: Readonly<Record<SimulatorHandPose, SimulatorHandPoseRotations>>;

interface SimulatorPointerLockControllerEventMap extends THREE.Object3DEventMap {
    connected: {
        target: SimulatorPointerLockController;
    };
    disconnected: {
        target: SimulatorPointerLockController;
    };
    selectstart: {
        target: SimulatorPointerLockController;
    };
    selectend: {
        target: SimulatorPointerLockController;
    };
}
declare class SimulatorPointerLockController extends Script<SimulatorPointerLockControllerEventMap> implements Controller {
    static dependencies: {
        camera: typeof THREE.Camera;
    };
    type: string;
    name: string;
    userData: {
        id: number;
        connected: boolean;
        selected: boolean;
    };
    reticle: Reticle;
    camera: THREE.Camera;
    init({ camera }: {
        camera: THREE.Camera;
    }): void;
    updatePose(): void;
    update(): void;
    callSelectStart(): void;
    callSelectEnd(): void;
    connect(): void;
    disconnect(): void;
}

/**
 * Supported gradient mapping types.
 */
type GradientType = 'linear' | 'radial' | 'angular' | 'diamond';
/**
 * A single keyed position structure for building color ramp gradients.
 */
interface ColorStop {
    /** Normalized position from 0.0 (start) to 1.0 (end) */
    position: number;
    /** Color representation (Hex, CSS string, or THREE.Color) */
    color: THREE.ColorRepresentation;
}
/**
 * Defines settings for linear or radial gradient fills.
 */
interface GradientPaint {
    /** The type of gradient layout structure */
    gradientType: GradientType;
    /** Array of boundary nodes containing position and color coordinates */
    stops: ColorStop[];
    /** Rotation angle in degrees (default 0) */
    rotation?: number;
    /** Origin coordinate anchor of the gradient scale mapping (default [0.5, 0.5]) */
    center?: THREE.Vector2 | [number, number];
    /** Scalar scaling offset mapping multipliers (default [1.0, 1.0]) */
    scale?: THREE.Vector2 | [number, number];
}
/**
 * Flat static color representation (CSS, Hex, or THREE.Color).
 */
type SolidPaint = THREE.ColorRepresentation;
/**
 * Union supported coloring style applied to paths or faces.
 */
type Paint = SolidPaint | GradientPaint;
/**
 * Defines bounding box calculation bias mappings during stroke drawing.
 */
type StrokeAlign = 'inside' | 'center' | 'outside';

type UIUnit = number | `${number}%` | 'auto';
type UIPosition = number | `${number}%`;
/** CSS-like line height: numbers are multipliers; px and % are explicit. */
type UILineHeight = number | `${number}px` | `${number}%`;
type UIColor = Paint;
type UIVector2 = THREE.Vector2 | [number, number];
interface UITransform {
    translateX?: UIPosition;
    translateY?: UIPosition;
}
interface UIStateStyle {
    backgroundColor?: UIColor;
    color?: THREE.ColorRepresentation;
    opacity?: number;
    borderColor?: Paint;
    borderWidth?: number;
    borderRadius?: number;
}
interface UIStyle extends UIStateStyle {
    width?: UIUnit;
    height?: UIUnit;
    minWidth?: number;
    minHeight?: number;
    maxWidth?: number;
    maxHeight?: number;
    flexDirection?: 'row' | 'column';
    justifyContent?: 'flex-start' | 'center' | 'flex-end' | 'space-between';
    alignItems?: 'flex-start' | 'center' | 'flex-end' | 'stretch';
    alignSelf?: 'auto' | 'flex-start' | 'center' | 'flex-end' | 'stretch';
    flexGrow?: number;
    flexShrink?: number;
    flexBasis?: number | 'auto';
    position?: 'relative' | 'absolute';
    top?: UIPosition;
    right?: UIPosition;
    bottom?: UIPosition;
    left?: UIPosition;
    transform?: UITransform;
    zIndex?: number;
    gap?: number;
    rowGap?: number;
    columnGap?: number;
    padding?: number;
    paddingTop?: number;
    paddingRight?: number;
    paddingBottom?: number;
    paddingLeft?: number;
    margin?: number;
    marginTop?: number;
    marginRight?: number;
    marginBottom?: number;
    marginLeft?: number;
    fontSize?: number;
    fontWeight?: number | 'normal' | 'medium' | 'bold';
    /** Like CSS: numbers multiply fontSize; use px or % strings for explicit units. */
    lineHeight?: UILineHeight;
    textAlign?: 'left' | 'center' | 'right';
    verticalAlign?: 'top' | 'middle' | 'bottom';
    innerShadowColor?: Paint;
    innerShadowBlur?: number;
    innerShadowPosition?: UIVector2;
    innerShadowSpread?: number;
    innerShadowFalloff?: number;
    dropShadowColor?: Paint;
    dropShadowBlur?: number;
    dropShadowPosition?: UIVector2;
    dropShadowSpread?: number;
    dropShadowFalloff?: number;
    borderAlign?: StrokeAlign;
    display?: 'flex' | 'none';
    overflow?: 'visible' | 'hidden';
    objectFit?: 'contain' | 'cover' | 'fill';
    whiteSpace?: 'normal' | 'nowrap' | 'pre-line';
    textOverflow?: 'clip' | 'ellipsis';
    ':hover'?: UIStateStyle;
    ':active'?: UIStateStyle;
    ':disabled'?: UIStateStyle;
}
interface UIElementOptions {
    style?: UIStyle;
    children?: THREE.Object3D[];
    visible?: boolean;
    pointerEvents?: PointerEvents;
    interactionEnabled?: boolean;
    reticleMode?: ReticleMode;
}
type UIElementKind = 'card' | 'overlay' | 'panel' | 'text' | 'button' | 'slider' | 'image' | 'icon';
declare abstract class UIElement<TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap> extends Script<TEventMap> {
    readonly isUI = true;
    private readonly styleTarget;
    private readonly styleProxy;
    protected constructor(kind: UIElementKind, options?: UIElementOptions);
    add(...objects: THREE.Object3D[]): this;
    attach(object: THREE.Object3D): this;
    getWorldPosition(target: THREE.Vector3): THREE.Vector3;
    get style(): UIStyle;
    set style(style: UIStyle);
    protected markUIDirty: () => void;
    /** Marks durable content for the next renderer commit. */
    protected markUIContentDirty: () => void;
    protected markUIStructureDirty: () => void;
    private markUIStyleDirty;
    private assertPlacement;
}

type UIThemeStyleRole = 'surface' | Exclude<UIElementKind, 'card' | 'overlay'>;
interface UIThemeColors {
    readonly surface: string;
    readonly raisedSurface: string;
    readonly primary: string;
    readonly primaryText: string;
    readonly text: string;
    readonly secondaryText: string;
    readonly outline: string;
    readonly disabledSurface: string;
    readonly disabledText: string;
}
/** UIKit-facing styles applied before an element's own style. */
type UIThemeStyles = Readonly<Partial<Record<UIThemeStyleRole, Readonly<UIStyle>>>>;
interface UITheme {
    readonly colors: UIThemeColors;
    readonly borderRadius: number;
    readonly styles?: UIThemeStyles;
}
interface UIThemeUpdate {
    readonly colors?: Partial<UIThemeColors>;
    readonly borderRadius?: number;
    readonly styles?: UIThemeStyles;
}
type UIThemePresetName = 'grayGlass' | 'colorful' | 'glimmer' | 'glimmerOpaque' | 'glimmerAmber' | 'glimmerGreen';

type UIValidationCode = 'not-ready' | 'not-mounted' | 'invalid-layout' | 'content-overflow' | 'text-clipped' | 'outside-viewport';
interface UIValidationBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}
interface UIValidationIssue {
    readonly code: UIValidationCode;
    readonly severity: 'warning' | 'error';
    readonly element?: UIElement;
    readonly message: string;
    readonly bounds?: UIValidationBounds;
    readonly containerBounds?: UIValidationBounds;
}
interface UIValidationReport {
    readonly ready: boolean;
    readonly ok: boolean;
    readonly issues: readonly UIValidationIssue[];
}

/** Lightweight global UI settings. It does not load the rendering backend. */
declare class UI {
    private themeSnapshot;
    private themeRevision;
    get theme(): UITheme;
    set theme(value: UIThemePresetName | UITheme);
    setTheme(update: UIThemeUpdate): void;
    /** Validates the latest completed layout for one UI root or all UI roots. */
    validate(root?: UIElement): UIValidationReport;
    /** Internal revision used by the private renderer. */
    get revision(): number;
}
declare const ui: UI;

/**
 * The global singleton instance of Core, serving as the main entry point
 * for the entire XR system. This binding is stable for the module lifetime;
 * disposing Core is terminal.
 */
declare const core: Core;
/**
 * A direct alias to the main `THREE.Scene` instance managed by the core.
 * Use this to add or remove objects from your XR experience.
 * @example
 * ```
 * const myObject = new THREE.Mesh();
 * scene.add(myObject);
 * ```
 */
declare const scene: THREE.Scene<THREE.Object3DEventMap>;
/**
 * A direct alias to the `User` instance, which represents the user in the XR
 * scene and manages inputs like controllers and hands.
 * @example
 * ```
 * if (user.isSelecting()) {
 *   console.log('User is pinching or clicking (globally)!');
 * }
 * ```
 */
declare const user: User;
/**
 * A direct alias to the `World` instance, which manages real-world
 * understanding features like plane detection and object detection.
 */
declare const world: World;
/**
 * A direct alias to the `Context` instance, which provides agent-facing
 * observations such as semantic trees, visible objects, and Set-of-Mark views.
 */
declare const context: Context;
/**
 * A direct alias to the `AI` instance for integrating generative AI features,
 * including multi-modal understanding, image generation, and live conversation.
 */
declare const ai: AI;
/**
 * A direct alias to the `Depth` instance, which manages depth sensing features.
 */
declare const depth: Depth;
/**
 * A direct alias to the `Timer` instance, which manages time deltas.
 */
declare const timer: THREE.Timer;
/**
 * A direct alias to the `CoreSound` instance, which manages audio.
 */
declare const sound: CoreSound;
/**
 * A direct alias to the `Input` instance, which manages inputs like controllers and hands.
 */
declare const input: Input;
/**
 * A direct alias to the `THREE.PerspectiveCamera` instance.
 */
declare const camera: THREE.PerspectiveCamera;

/**
 * A shortcut for `core.scene.add()`. Adds one or more objects to the scene.
 * @param object - The object(s) to add.
 * @see {@link three#Object3D.add}
 */
declare function add(...object: THREE.Object3D[]): THREE.Scene<THREE.Object3DEventMap>;
/**
 * A shortcut for `core.init()`. Initializes the XR Blocks system and starts
 * the render loop. This is the main entry point for any application.
 * @param options - Configuration options for the session.
 * @see {@link Core.init}
 */
declare function init(options?: Options): Promise<void>;
/**
 * Manually initializes a Script and resolves after its dependencies and
 * lifecycle initialization are complete.
 */
declare function initScript(script: Script): Promise<void>;
/**
 * A shortcut for `core.timer.getDelta()`. Gets the time in seconds since
 * the last frame, useful for animations.
 * @returns The delta time in seconds.
 * @see {@link THREE.Timer.getDelta}
 */
declare function getDeltaTime(): number;
/**
 * Gets elapsed time in seconds from the simulation or render clock.
 * Simulation time excludes pauses and is the default.
 * @param clock - Clock used to measure elapsed time.
 * @returns The elapsed time in seconds.
 */
declare function getElapsedTime(clock?: 'simulation' | 'render'): number;
/**
 * Retrieves the left camera from the stereoscopic XR camera rig.
 * @returns The left eye's camera.
 */
declare function getXrCameraLeft(): THREE.WebXRCamera;
/**
 * Retrieves the right camera from the stereoscopic XR camera rig.
 * @returns The right eye's camera.
 */
declare function getXrCameraRight(): THREE.WebXRCamera;

/**
 * Sets the given object and all its children to only be visible in the left
 * eye.
 * @param obj - Object to show only in the left eye.
 * @returns The original object.
 */
declare function showOnlyInLeftEye<T extends THREE.Object3D>(obj: T): T;
/**
 * Sets the given object and all its children to only be visible in the right
 * eye.
 * @param obj - Object to show only in the right eye.
 * @returns The original object.
 */
declare function showOnlyInRightEye<T extends THREE.Object3D>(obj: T): T;
/**
 * Loads a stereo image from a URL and returns two THREE.Texture objects, one
 * for the left eye and one for the right eye.
 * @param url - The URL of the stereo image.
 * @returns A promise that resolves to an array containing the left and right
 *     eye textures.
 */
declare function loadStereoImageAsTextures(url: string): Promise<THREE.Texture<unknown, THREE.TextureEventMap>[]>;

/** Base class for built-in scripts that continuously change their parent. */
declare class TransformScript extends Script {
    private suspended;
    /** Stops transform updates while the parent is manipulated. */
    suspend(): void;
    /** Rebases the script on the parent's current pose and resumes updates. */
    resume(): void;
    protected get canUpdate(): boolean;
    /** Captures a new baseline from the parent transform. */
    protected rebase(): void;
}

interface FaceCameraOptions {
    mode?: FaceCameraMode;
    /** Half-height of the upright region used by capsule mode, in meters. */
    capsuleHalfHeight?: number;
    smoothing?: number;
}
/** Rotates its parent to face the active camera. */
declare class FaceCamera extends TransformScript {
    static dependencies: {
        camera: typeof THREE.Camera;
        timer: typeof THREE.Timer;
    };
    private camera?;
    private timer?;
    private readonly mode;
    private readonly capsuleHalfHeight;
    private readonly smoothing;
    private readonly worldPosition;
    private readonly cameraPosition;
    private readonly parentWorldQuaternion;
    private readonly targetQuaternion;
    private readonly faceCameraScratch;
    constructor(options?: FaceCameraOptions);
    init({ camera, timer }: {
        camera: THREE.Camera;
        timer: THREE.Timer;
    }): void;
    update(): void;
}

interface FollowHeadOptions {
    offset: THREE.Vector3;
    smoothing?: number;
}
/** Moves its parent toward an offset in camera space. */
declare class FollowHead extends TransformScript {
    static dependencies: {
        camera: typeof THREE.Camera;
        timer: typeof THREE.Timer;
    };
    private camera?;
    private timer?;
    private readonly offset;
    private readonly target;
    private readonly cameraWorldPosition;
    private readonly cameraWorldQuaternion;
    private readonly objectWorldPosition;
    private readonly smoothing;
    constructor(options: FollowHeadOptions);
    init({ camera, timer }: {
        camera: THREE.Camera;
        timer: THREE.Timer;
    }): void;
    update(): void;
    protected rebase(): void;
}

type FollowObjectMode = 'position' | 'rotation' | 'pose';
interface FollowObjectOptions {
    target: THREE.Object3D;
    mode?: FollowObjectMode;
    positionOffset?: THREE.Vector3;
    rotationOffset?: THREE.Quaternion;
}
/** Copies position, rotation, or both from another object to its parent. */
declare class FollowObject extends TransformScript {
    private readonly target;
    private readonly mode;
    private readonly positionOffset;
    private readonly rotationOffset;
    private readonly targetWorldPosition;
    private readonly targetWorldQuaternion;
    private readonly objectWorldPosition;
    private readonly objectWorldQuaternion;
    private readonly parentWorldQuaternion;
    constructor(options: FollowObjectOptions);
    update(): void;
    protected rebase(): void;
}

type OrbitPath = 'circular' | 'elliptical';
type OrbitFrame = 'world' | 'target' | 'view';
type OrbitDirection = 'clockwise' | 'counterclockwise';
interface OrbitOptions {
    /** Object at the focus of the orbit. */
    target: THREE.Object3D;
    /** Semi-major radius in meters. Defaults to 0.5. */
    radius?: number;
    /** Seconds per orbit. Defaults to 20. */
    period?: number;
    /** Circular or Kepler-style elliptical motion. Defaults to circular. */
    path?: OrbitPath;
    /** Reference frame for the orbital plane. Defaults to world. */
    frame?: OrbitFrame;
    /** Ellipse eccentricity in [0, 1). Defaults to 0.2 for ellipses. */
    eccentricity?: number;
    /** Initial orbital-plane tilt in radians. Defaults to 0. */
    inclination?: number;
    /** Seconds per full rotation of the orbital plane. */
    precessionPeriod?: number;
    /** Direction viewed from the positive orbital normal. */
    direction?: OrbitDirection;
    /** Minimum gap between captured object bounds in meters. Defaults to 0. */
    clearance?: number;
}
/**
 * Moves its parent around a target focus.
 *
 * Bounds are captured during initialization and after `resume()`. Call
 * `resume()` after changing geometry or scale to refresh overlap avoidance.
 */
declare class Orbit extends TransformScript {
    static dependencies: {
        camera: typeof THREE.Camera;
        timer: typeof THREE.Timer;
    };
    private camera?;
    private timer?;
    private readonly target;
    private readonly configuredRadius;
    private readonly period;
    private readonly frame;
    private readonly eccentricity;
    private readonly minorAxisScale;
    private readonly precessionPeriod?;
    private readonly directionSign;
    private readonly clearance;
    private semiMajorRadius;
    private meanAnomaly;
    private precessionAngle;
    private readonly orientation;
    private readonly frameQuaternion;
    private readonly precessionQuaternion;
    private readonly orbitQuaternion;
    private readonly basisMatrix;
    private readonly targetPosition;
    private readonly ownerPosition;
    private readonly worldPosition;
    private readonly orbitOffset;
    private readonly normal;
    private readonly tangent;
    private readonly cameraPosition;
    private readonly cameraUp;
    private readonly worldQuaternion;
    constructor(options: OrbitOptions);
    init({ camera, timer }: {
        camera: THREE.Camera;
        timer: THREE.Timer;
    }): void;
    update(): void;
    /** Restarts the orbit from the parent's manipulated position. */
    protected rebase(): void;
    private updateOrbitOrientation;
    private updateFrame;
    private rebasePlane;
    private applyPosition;
    private applyClearance;
}

interface VisibilityTransitionOptions {
    duration?: number;
}
/** Animates its parent's visibility with a scale transition. */
declare class VisibilityTransition extends TransformScript {
    static dependencies: {
        timer: typeof THREE.Timer;
    };
    private timer?;
    private readonly duration;
    private readonly visibleScale;
    private progress;
    private targetVisible;
    private animating;
    constructor(options?: VisibilityTransitionOptions);
    init({ timer }: {
        timer: THREE.Timer;
    }): void;
    show(): void;
    hide(): void;
    toggle(): void;
    update(): void;
}

type UIAppearance = 'surface' | 'none';

interface UISize {
    width: number;
    height: number | 'auto';
}
interface UIResolvedSize {
    width: number;
    height: number;
}
interface UICardEdgeOptions {
    translateFromSurface?: boolean;
}
type UICardAnchorX = 'left' | 'center' | 'right';
type UICardAnchorY = 'bottom' | 'center' | 'top';
interface UICardOptions extends UIElementOptions {
    size: UISize;
    pixelSize?: number;
    anchorX?: UICardAnchorX;
    anchorY?: UICardAnchorY;
    appearance?: UIAppearance;
    manipulation?: boolean | ManipulationOptions;
    edge?: boolean | UICardEdgeOptions;
}
/** The only world-transform root in a spatial UI tree. */
declare class UICard<TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap> extends UIElement<TEventMap> {
    name: string;
    readonly pixelSize: number;
    readonly anchorX: UICardAnchorX;
    readonly anchorY: UICardAnchorY;
    readonly appearance: UIAppearance;
    private readonly sizeTarget;
    private readonly sizeProxy;
    private readonly edgeTarget;
    private readonly edgeProxy;
    private edgeEnabled;
    constructor({ size, pixelSize, anchorX, anchorY, appearance, manipulation, edge, ...options }: UICardOptions);
    get size(): UISize;
    set size(value: UISize);
    get manipulation(): boolean | ManipulationOptions | undefined;
    set manipulation(value: boolean | ManipulationOptions | undefined);
    get edge(): false | Required<UICardEdgeOptions>;
    set edge(value: boolean | UICardEdgeOptions);
    private validateEdge;
}

interface UIOverlayOptions extends UIElementOptions {
    appearance?: UIAppearance;
}
/** A view-space UI root. World transforms have no rendering effect. */
declare class UIOverlay<TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap> extends UIElement<TEventMap> {
    name: string;
    readonly appearance: UIAppearance;
    constructor({ appearance, ...options }?: UIOverlayOptions);
}

interface UIButtonOptions extends UIElementOptions {
    label?: string;
    icon?: string;
    ariaLabel?: string;
    disabled?: boolean;
    onClick?: () => void;
}
/** A semantic button that activates after a valid captured press and release. */
declare class UIButton<TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap> extends UIElement<TEventMap> {
    name: string;
    onClick?: () => void;
    private _label?;
    private _icon?;
    private _ariaLabel?;
    private _disabled;
    constructor({ label, icon, ariaLabel, disabled, onClick, children, ...options }?: UIButtonOptions);
    get label(): string | undefined;
    set label(value: string | undefined);
    get icon(): string | undefined;
    set icon(value: string | undefined);
    get ariaLabel(): string;
    set ariaLabel(value: string | undefined);
    get disabled(): boolean;
    set disabled(value: boolean);
    onObjectSelectStart(event: SelectEvent): void;
    onObjectSelectEnd(event: SelectEvent): void;
    add(...objects: THREE.Object3D[]): this;
    private assertConvenienceContent;
    private assertAccessibleName;
}

type UIIconVariant = 'outlined' | 'rounded' | 'sharp';
type UIIconWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700;
interface UIIconOptions extends UIElementOptions {
    icon: string;
    variant?: UIIconVariant;
    weight?: UIIconWeight;
    filled?: boolean;
    ariaLabel?: string;
}
/** One Material Symbol icon. */
declare class UIIcon<TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap> extends UIElement<TEventMap> {
    name: string;
    readonly ariaLabel?: string;
    private _icon;
    private _variant;
    private _weight;
    private _filled;
    constructor({ icon, variant, weight, filled, ariaLabel, ...options }: UIIconOptions);
    get icon(): string;
    set icon(value: string);
    get variant(): UIIconVariant;
    set variant(value: UIIconVariant);
    get weight(): UIIconWeight;
    set weight(value: UIIconWeight);
    get filled(): boolean;
    set filled(value: boolean);
}

interface UIImageOptions extends UIElementOptions {
    src: string | THREE.Texture;
    ariaLabel?: string;
}
/** URL-backed or caller-texture-backed image content. */
declare class UIImage<TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap> extends UIElement<TEventMap> {
    name: string;
    readonly ariaLabel?: string;
    private _src;
    constructor({ src, ariaLabel, ...options }: UIImageOptions);
    get src(): string | THREE.Texture;
    set src(value: string | THREE.Texture);
}

type UIPanelOptions = UIElementOptions;
/** A passive flex-layout and visual grouping element. */
declare class UIPanel<TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap> extends UIElement<TEventMap> {
    name: string;
    constructor(options?: UIPanelOptions);
}

interface UITextOptions extends UIElementOptions {
    text: string;
}
/** Text content in a card or overlay layout. */
declare class UIText<TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap> extends UIElement<TEventMap> {
    name: string;
    private _text;
    constructor({ text, ...options }: UITextOptions);
    get text(): string;
    set text(value: string);
}

interface UISliderOptions extends UIElementOptions {
    ariaLabel: string;
    min?: number;
    max?: number;
    step?: number;
    value?: number;
    disabled?: boolean;
    onInput?: (value: number) => void;
    onChange?: (value: number) => void;
}
/** A horizontal slider with one exclusive captured interaction. */
declare class UISlider<TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap> extends UIElement<TEventMap> {
    name: string;
    readonly ariaLabel: string;
    onInput?: (value: number) => void;
    onChange?: (value: number) => void;
    private _min;
    private _max;
    private _step;
    private _value;
    private _disabled;
    private interactionStart?;
    private interactionChanged;
    constructor({ ariaLabel, min, max, step, value, disabled, onInput, onChange, ...options }: UISliderOptions);
    get min(): number;
    set min(value: number);
    get max(): number;
    set max(value: number);
    get step(): number;
    set step(value: number);
    get value(): number;
    set value(value: number);
    get disabled(): boolean;
    set disabled(value: boolean);
    onObjectSelectStart(event: SelectEvent): void;
    onObjectSelectEnd(event: SelectEvent): void;
    private beginInput;
    private updateInput;
    private completeInput;
    private cancelInput;
    private setProgrammaticValue;
    private requantizeInteraction;
}

type ModelViewerOrigin = 'bottom-center' | 'center' | 'source';
interface ModelSource {
    url: string;
    /** Base path used by glTF files to resolve related resources. */
    path?: string;
    /** Asset normalization applied before origin alignment. */
    scale?: number | THREE.Vector3Like;
    /** Asset rotation in radians, matching THREE.Euler. */
    rotation?: THREE.Vector3Like;
}
interface ModelViewerOptions {
    origin?: ModelViewerOrigin;
    manipulation?: boolean | ManipulationOptions;
    /** Extra platform width and depth around the model bounds, in meters. */
    platformMargin?: number | THREE.Vector2Like;
    autoplay?: boolean;
    occlusion?: boolean;
    castShadow?: boolean;
    receiveShadow?: boolean;
}
interface PlayModelAnimationOptions {
    once?: boolean;
}
/** Loads and presents one interactive glTF or Gaussian Splat model. */
declare class ModelViewer extends Script {
    private static readonly dependencies;
    private readonly loader;
    /** Local bounds of the presented model. */
    readonly boundingBox: THREE.Box3;
    private readonly visualRoot;
    private readonly animationActions;
    private readonly occludableMaterials;
    private readonly occludableShaders;
    private readonly hoveringControllers;
    private readonly unregisterHitSurfaces;
    private readonly origin;
    private readonly platformMargin;
    private readonly autoplay;
    private readonly occlusionEnabled;
    private timer?;
    private animationMixer?;
    private gltf?;
    private splatMesh?;
    private contentRoot?;
    private depth?;
    private interaction?;
    private scene?;
    private renderer?;
    private registry?;
    private platform?;
    private rotationHitSurface?;
    private loadGeneration;
    private acceptingLoads;
    constructor({ origin, manipulation, platformMargin, autoplay, occlusion, castShadow, receiveShadow, }?: ModelViewerOptions);
    get manipulation(): boolean | ManipulationOptions | undefined;
    set manipulation(value: boolean | ManipulationOptions | undefined);
    init({ depth, interaction, scene, renderer, registry, timer, }: {
        depth: Depth;
        interaction: Interaction;
        scene: THREE.Scene;
        renderer: THREE.WebGLRenderer;
        registry: Registry;
        timer: THREE.Timer;
    }): Promise<void>;
    /** Replaces the current model. The file format is inferred from the URL. */
    load(source: string | ModelSource): Promise<void>;
    /**
     * Presents an existing Three.js object. The caller retains ownership of its
     * geometry, materials, and textures.
     */
    setContent(content: THREE.Object3D): void;
    /** Plays every animation in the loaded glTF. */
    playAnimation({ once }?: PlayModelAnimationOptions): void;
    update(): void;
    onHoverEnter(event: HoverEvent): void;
    onHoverExit(event: HoverEvent): void;
    dispose(): void;
    private loadGLTF;
    private loadSplat;
    private finishModelLoad;
    private setupAnimations;
    private syncInteractionSurfaces;
    private registerHitSurface;
    private clearHitRegistrations;
    private replaceRotationHitSurface;
    private replacePlatform;
    private applyShadows;
    private applyOcclusion;
    private makeMaterialOccludable;
    private registerOccludableShader;
    private unregisterOcclusionShaders;
    private createSparkRendererIfNeeded;
    private beginModelLoad;
    private isModelLoadCurrent;
    private assertModelLoadCurrent;
    private staleModelLoadError;
    private releaseLoadedModel;
}

declare enum BvhImportStatus {
    PENDING = 0,
    SUCCESS = 1,
    FAILED = 2
}
/**
 * Whether the BVH module has been loaded AND the THREE prototypes have
 * been patched. Sync check; returns false until `enableAcceleratedRaycast()`
 * (or `applyBVH()`) has resolved at least once.
 */
declare function isBVHReady(): boolean;
/**
 * Dynamically import three-mesh-bvh and install the prototype patches
 * that route `THREE.Mesh.raycast` through the accelerated path when
 * the target mesh has a computed bounds tree. Adds
 * `computeBoundsTree` / `disposeBoundsTree` helpers to
 * `THREE.BufferGeometry`.
 *
 * Async because the BVH module is loaded on demand. Resolves to `true`
 * if the module loaded and patches were applied, `false` if the module
 * isn't available — in which case meshes continue to use the stock raycaster.
 *
 * Safe to call multiple times. The first call kicks off the import,
 * subsequent calls share the same promise.
 */
declare function enableAcceleratedRaycast(): Promise<boolean>;
/**
 * Walk the given object3D (recursively) and build a bounds tree on
 * every standard `THREE.Mesh` whose geometry doesn't already have one.
 * Subsequent `raycaster.intersectObject(root, true)` calls then go
 * through the BVH-accelerated path.
 *
 * Use on dense, static environmental meshes only (loaded immersive
 * scenes, photogrammetry scans, baked levels). The tree has a one-time
 * build + memory cost and assumes static vertices, so it's a net loss
 * for low-poly / UI / dynamic meshes. Don't apply globally to
 * `xb.core.scene`.
 *
 * Skips `THREE.SkinnedMesh`: skinned meshes deform vertices on the GPU
 * each frame, so a bounds tree built on the bind-pose geometry is wrong
 * the moment the mesh animates. Three's `SkinnedMesh.raycast()` also
 * overrides the patched `Mesh.prototype.raycast` and does its own CPU
 * skinning, so the BVH would never be consulted anyway.
 *
 * Skips `THREE.BatchedMesh`: three-mesh-bvh ships a dedicated
 * `computeBatchedBoundsTree` / `disposeBatchedBoundsTree` pair that
 * builds per-draw-range BVHs on `this.boundsTrees` (plural), and
 * `acceleratedRaycast` has a separate `isBatchedMesh` branch that
 * consults those. The standard `computeBoundsTree` would index the
 * combined batched buffer and produce wrong hits. Conservative skip
 * until the batched helpers are wired up.
 *
 * `THREE.InstancedMesh` is NOT skipped: its `.raycast()` calls a
 * shared internal `Mesh` per instance, which does route through the
 * patched `Mesh.prototype.raycast`, so a BVH on the shared geometry
 * accelerates every per-instance test.
 *
 * Async because it awaits the dynamic import of three-mesh-bvh. If the
 * module isn't available, this is a no-op. Idempotent across calls.
 */
declare function applyBVH(root: THREE.Object3D, { recursive }?: {
    recursive?: boolean;
}): Promise<void>;
/**
 * Walk the given object3D (recursively) and dispose any bounds trees
 * previously built by `applyBVH`. Sync; no-op if three-mesh-bvh
 * wasn't loaded.
 */
declare function disposeBVH(root: THREE.Object3D, { recursive }?: {
    recursive?: boolean;
}): void;
declare function _getBvhImportStatus(): {
    status: BvhImportStatus;
    error?: Error;
};

declare const DOWN: Readonly<THREE.Vector3>;
declare const UP: Readonly<THREE.Vector3>;
declare const FORWARD: Readonly<THREE.Vector3>;
declare const BACK: Readonly<THREE.Vector3>;
declare const LEFT: Readonly<THREE.Vector3>;
declare const RIGHT: Readonly<THREE.Vector3>;
declare const ZERO_VECTOR3: Readonly<THREE.Vector3>;

/**
 * Manages the global THREE.DefaultLoadingManager instance for
 * XRBlocks and handles communication of loading progress to the parent iframe.
 * This module controls the visibility of a loading spinner
 * in the DOM based on loading events.
 *
 * Import the single instance
 * `loadingSpinnerManager` to use it throughout the application.
 */
declare class LoadingSpinnerManager {
    /**
     * DOM element of the loading spinner, created
     * when showSpinner() is called and removed on `onLoad` or `onError`.
     */
    private spinnerElement?;
    /**
     * Tracks if the manager is currently loading assets.
     */
    isLoading: boolean;
    constructor();
    showSpinner(): void;
    hideSpinner(): void;
    private setupCallbacks;
}
declare const loadingSpinnerManager: LoadingSpinnerManager;

type ModelLoaderLoadGLTFOptions = {
    /** The base path for the model files. */
    path?: string;
    /** The URL of the model file. */
    url: string;
    /** The renderer. */
    renderer?: THREE.WebGLRenderer;
};
type ModelLoaderLoadOptions = ModelLoaderLoadGLTFOptions & {
    /**
     * Optional callback for loading progress. Note: This will be ignored if a
     * LoadingManager is provided.
     */
    onProgress?: (event: ProgressEvent) => void;
};
/**
 * Manages the loading of 3D models, automatically handling dependencies
 * like DRACO and KTX2 loaders.
 */
declare class ModelLoader {
    private manager;
    private gltfLoader?;
    private ktx2Loader?;
    private ktxRenderer?;
    /**
     * Creates an instance of ModelLoader.
     * @param manager - The
     *     loading manager to use,
     * required for KTX2 texture support.
     */
    constructor(manager?: THREE.LoadingManager);
    private getGLTFLoader;
    /**
     * Loads a model based on its file extension. Supports .gltf, .glb,
     * .ply, .spz, .splat, and .ksplat.
     * @returns A promise that resolves with the loaded model data (e.g., a glTF
     *     scene or a SplatMesh).
     */
    load({ path, url, renderer, onProgress, }: ModelLoaderLoadOptions): Promise<GLTF | (_sparkjsdev_spark.SplatMesh & {
        boundingBox: THREE.Box3;
    }) | null>;
    /**
     * Loads a 3DGS model (.ply, .spz, .splat, .ksplat).
     * @param url - The URL of the model file.
     * @returns A promise that resolves with the loaded
     * SplatMesh object.
     */
    loadSplat({ url }: {
        url?: string | undefined;
    }): Promise<_sparkjsdev_spark.SplatMesh & {
        boundingBox: THREE.Box3;
    }>;
    /**
     * Loads a GLTF or GLB model.
     * @param options - The loading options.
     * @returns A promise that resolves with the loaded glTF object.
     */
    loadGLTF({ path, url, renderer, }: ModelLoaderLoadGLTFOptions): Promise<GLTF>;
}

/**
 * Utility functions for positioning and orienting objects in 3D
 * space.
 */

/**
 * Places and orients an object at a specific intersection point on another
 * object's surface. The placed object's 'up' direction will align with the
 * surface normal at the intersection, and its 'forward' direction will point
 * towards a specified target object (e.g., the camera), but constrained to the
 * surface plane.
 *
 * This is useful for placing objects on walls or floors so they sit flat
 * against the surface but still turn to face the user.
 *
 * @param obj - The object to be placed and oriented.
 * @param intersection - The intersection data from a
 *     raycast,
 * containing the point and normal of the surface. The normal is assumed to be
 * in local space.
 * @param target - The object that `obj` should face (e.g., the
 *     camera).
 * @returns The modified `obj`.
 */
declare function placeObjectAtIntersectionFacingTarget(obj: THREE.Object3D, intersection: THREE.Intersection, target: THREE.Object3D): THREE.Object3D<THREE.Object3DEventMap>;

/**
 * Extracts only the yaw (Y-axis rotation) from a quaternion.
 * This is useful for making an object face a certain direction horizontally
 * without tilting up or down.
 *
 * @param rotation - The source quaternion from which to
 *     extract the yaw.
 * @param target - The target
 *     quaternion to store the result.
 * If not provided, a new quaternion will be created.
 * @returns The resulting quaternion containing only the yaw
 *     rotation.
 */
declare function extractYaw(rotation: Readonly<THREE.Quaternion>, target?: THREE.Quaternion): THREE.Quaternion;
/**
 * Creates a rotation such that forward (0, 0, -1) points towards the forward
 * vector and the up direction is the normalized projection of the provided up
 * vector onto the plane orthogonal to the target.
 * @param forward - Forward vector
 * @param up - Up vector
 * @param target - Output
 * @returns
 */
declare function lookAtRotation(forward: Readonly<THREE.Vector3>, up?: Readonly<THREE.Vector3>, target?: THREE.Quaternion): THREE.Quaternion;
/**
 * Clamps the provided rotation's angle.
 * The rotation is modified in place.
 * @param rotation - The quaternion to clamp.
 * @param angle - The maximum allowed angle in radians.
 */
declare function clampRotationToAngle(rotation: THREE.Quaternion, angle: number): void;

/**
 * Checks if a given object is a descendant of another object in the scene
 * graph. This function is useful for determining if an interaction (like a
 * raycast hit) has occurred on a component that is part of a larger, complex
 * entity.
 *
 * It uses an iterative approach to traverse up the hierarchy from the child.
 *
 * @param child - The potential descendant object.
 * @param parent - The potential ancestor object.
 * @returns True if `child` is the same as `parent` or is a descendant of
 *     `parent`.
 */
declare function objectIsDescendantOf(child?: Readonly<THREE.Object3D> | null, parent?: Readonly<THREE.Object3D> | null): boolean;
/**
 * Traverses the scene graph from a given node, calling a callback function for
 * each node. The traversal stops if the callback returns true.
 *
 * This function is similar to THREE.Object3D.traverse, but allows for early
 * exit from the traversal based on the callback's return value.
 *
 * @param node - The starting node for the traversal.
 * @param callback - The function to call for each node. It receives the current
 *     node as an argument. If the callback returns `true`, the traversal will
 *     stop.
 * @returns Whether the callback returned true for any node.
 */
declare function traverseUtil(node: THREE.Object3D, callback: (node: THREE.Object3D) => boolean): boolean;
/**
 * Gets a world-space point on an object's rendered geometry near a reference
 * position. Falls back to the object's world position when it has no mesh
 * triangles. `closest` measures from `from`; `center` measures from the
 * object's world bounding-box center.
 */
declare function getObjectTargetPoint(object: THREE.Object3D, from: THREE.Vector3, out: THREE.Vector3, mode?: 'closest' | 'center'): THREE.Vector3;

declare class SparkRendererHolder {
    renderer: SparkRenderer;
    constructor(renderer: SparkRenderer);
}

declare function disposeMaterial(material: THREE.Material | THREE.Material[] | undefined, except?: Set<THREE.Material<THREE.MaterialEventMap>>): void;
declare function disposeMeshResources(mesh: THREE.Mesh): void;
declare function disposeRenderableResources(object: THREE.Object3D): void;
declare function disposeObjectTree(object: THREE.Object3D): void;
declare function disposeObjectChildren(object: THREE.Object3D): void;

/**
 * Clamps a value between a minimum and maximum value.
 */
declare function clamp(value: number, min: number, max: number): number;
/**
 * Linearly interpolates between two numbers `x` and `y` by a given amount `t`.
 */
declare function lerp(x: number, y: number, t: number): number;
/**
 * Python-style print function for debugging.
 */
declare function print(...args: unknown[]): void;
declare const urlParams: URLSearchParams;
/**
 * Function to get the value of a URL parameter.
 * @param name - The name of the URL parameter.
 * @returns The value of the URL parameter or null if not found.
 */
declare function getUrlParameter(name: string): string | null;
/**
 * Retrieves a boolean URL parameter. Returns true for 'true' or '1', false for
 * 'false' or '0'. If the parameter is not found, returns the specified default
 * boolean value.
 * @param name - The name of the URL parameter.
 * @param defaultBool - The default boolean value if the
 *     parameter is not present.
 * @returns The boolean value of the URL parameter.
 */
declare function getUrlParamBool(name: string, defaultBool?: boolean): boolean;
/**
 * Retrieves an integer URL parameter. If the parameter is not found or is not a
 * valid number, returns the specified default integer value.
 * @param name - The name of the URL parameter.
 * @param defaultNumber - The default integer value if the
 *     parameter is not present.
 * @returns The integer value of the URL parameter.
 */
declare function getUrlParamInt(name: string, defaultNumber?: number): number;
/**
 * Retrieves a float URL parameter. If the parameter is not found or is not a
 * valid number, returns the specified default float value.
 * @param name - The name of the URL parameter.
 * @param defaultNumber - The default float value if the parameter
 *     is not present.
 * @returns The float value of the URL parameter.
 */
declare function getUrlParamFloat(name: string, defaultNumber?: number): number;
/**
 * Parses a color string (hexadecimal with optional alpha) into a THREE.Vector4.
 * Supports:
 * - #rgb (shorthand, alpha defaults to 1)
 * - #rrggbb (alpha defaults to 1)
 * - #rgba (shorthand)
 * - #rrggbbaa
 *
 * @param colorString - The color string to parse (e.g., '#66ccff',
 *     '#6cf5', '#66ccff55', '#6cf').
 * @returns The parsed color as a THREE.Vector4 (r, g, b, a), with components in
 *     the 0-1 range.
 * @throws If the input is not a string or if the hex string is invalid.
 */
declare function getVec4ByColorString(colorString: string): THREE.Vector4;
declare function getColorHex(fontColor: string | number): number;
/**
 * Parses a data URL (e.g., "data:image/png;base64,...") into its
 * stripped base64 string and MIME type.
 * This function handles common image MIME types.
 * @param dataURL - The data URL string.
 * @returns An object containing the stripped base64 string and the extracted
 *     MIME type.
 */
declare function parseBase64DataURL(dataURL: string): {
    strippedBase64: string;
    mimeType: string;
} | {
    strippedBase64: string;
    mimeType: null;
};

type VideoFileStreamDetails = VideoStreamDetails & {
    width?: number;
    height?: number;
    aspectRatio?: number;
    videoFile?: string | File;
};
type VideoFileStreamOptions = VideoStreamOptions & {
    /** The video file path, URL, or File object. */
    videoFile?: string | File;
};
/**
 * VideoFileStream handles video playback from a file source.
 */
declare class VideoFileStream extends VideoStream<VideoFileStreamDetails> {
    private videoFile_?;
    /**
     * @param options - Configuration for the file stream.
     */
    constructor({ videoFile, willCaptureFrequently }?: {
        videoFile?: undefined;
        willCaptureFrequently?: boolean | undefined;
    });
    /**
     * Initializes the file stream based on the given video file.
     */
    init(): Promise<void>;
    /**
     * Initializes the video stream from the provided file.
     */
    protected initStream_(): Promise<void>;
    /**
     * Sets a new video file source and re-initializes the stream.
     * @param videoFile - The new video file to play.
     */
    setSource(videoFile: string | File): Promise<void>;
}

/**
 * Determines what the running platform can do with anchors.
 *
 * The anchor APIs are optional in three independent places: a frame may not be
 * able to create anchors, a session may not be able to restore them, and an
 * individual anchor may not be able to hand back a persistent handle. Presence
 * of an XR session says nothing about any of them, so each is probed directly
 * rather than inferred.
 *
 * `persistent` is therefore a statement about the session, not a promise about
 * any particular anchor: whether an anchor can hand back a handle is only
 * knowable once that anchor exists. {@link AnchorManager.persist} reports that
 * per anchor, so treat this as "saving is worth offering" rather than
 * "saving will work".
 *
 * @param session - The active XR session, if any.
 * @param frame - The current XR frame, if any.
 * @returns What the platform supports.
 */
declare function anchorCapability(session: XRSession | null | undefined, frame: XRFrame | null | undefined): AnchorCapability;

/**
 * Builds the object to represent a restored anchor.
 *
 * Returning null skips the record, which is how an app ignores anchors it no
 * longer has content for.
 *
 * @param label - The label the anchor was saved with.
 * @param record - The full saved record.
 * @returns The object to place, or null to skip.
 */
type AnchoredObjectFactory = (label: string, record: AnchorRecord) => THREE.Object3D | null;
/**
 * Keeps `THREE.Object3D`s attached to spatial anchors.
 *
 * {@link AnchorManager} deals in anchors and poses; every app on top of it
 * otherwise repeats the same work of holding a map from anchor to object and
 * copying poses across each frame. This owns that, so an app anchors an object
 * and then forgets about it.
 */
declare class AnchoredObjects {
    private readonly manager;
    private readonly parent;
    private readonly objects;
    /**
     * @param manager - The anchor subsystem to attach through.
     * @param parent - Object to add anchored content to, usually the scene.
     */
    constructor(manager: AnchorManager, parent: THREE.Object3D);
    /**
     * Anchors an object where it currently sits, and saves it.
     *
     * @param object - Object to pin. Added to the parent if not already in it.
     * @param label - Label to restore it by later.
     * @returns The tracked anchor, or null when anchoring is unavailable.
     */
    anchor(object: THREE.Object3D, label: string): Promise<TrackedAnchor | null>;
    /**
     * Rebuilds objects for every anchor saved in a previous session.
     *
     * @param factory - Builds the object for a restored anchor.
     * @returns How many objects were restored.
     */
    restore(factory: AnchoredObjectFactory): Promise<number>;
    /**
     * Moves every attached object onto its anchor's current pose.
     *
     * Call once per frame. Anchors drift as the platform refines its map of the
     * room, which is the whole point of anchoring rather than storing a position.
     *
     * @param referenceSpace - Space to read poses in. Not needed for simulated
     *     anchors, which hold their own pose.
     */
    update(referenceSpace?: XRReferenceSpace): void;
    /**
     * Detaches an anchored object and forgets its anchor.
     * @param id - Id of the anchor to remove.
     */
    remove(id: string): void;
    /**
     * The object attached to an anchor.
     * @param id - Id of the anchor.
     * @returns The object, or undefined.
     */
    get(id: string): THREE.Object3D | undefined;
    /**
     * Every attached object, keyed by anchor id.
     * @returns The attached objects.
     */
    getAll(): ReadonlyMap<string, THREE.Object3D>;
    /** Detaches everything and forgets every saved anchor. */
    clear(): void;
}

/** The subset of the `Storage` API this store depends on. */
interface AnchorStorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}
/**
 * Persists anchor handles in browser local storage.
 *
 * Every operation degrades to a no-op rather than throwing: a missing or full
 * store should cost the caller its persistence, not its session.
 */
declare class LocalStorageAnchorStore implements AnchorStore {
    private readonly key;
    private readonly maxRecords;
    private readonly storage?;
    /**
     * @param key - Storage key to read and write.
     * @param maxRecords - Cap on saved records; oldest are evicted first.
     * @param storage - Backing storage. Omit to use `localStorage`; pass `null`
     *     to disable persistence entirely. `null` is distinct from omission so
     *     callers can opt out explicitly instead of relying on a default.
     */
    constructor(key: string, maxRecords: number, storage?: AnchorStorageLike | null);
    /**
     * Reads every saved record.
     * @returns Saved records, oldest first, or an empty array.
     */
    load(): AnchorRecord[];
    /**
     * Saves a record, replacing any existing entry with the same uuid.
     * @param record - The record to save.
     * @returns Whether the record was committed.
     */
    save(record: AnchorRecord): boolean;
    /**
     * Removes a single record.
     * @param uuid - Handle of the record to remove.
     */
    remove(uuid: string): void;
    /** Removes every saved record. */
    clear(): void;
    private write;
}

type sdk_AI = AI;
declare const sdk_AI: typeof AI;
type sdk_AIModel = AIModel;
type sdk_AIOptions = AIOptions;
declare const sdk_AIOptions: typeof AIOptions;
type sdk_ActiveControllers = ActiveControllers;
declare const sdk_ActiveControllers: typeof ActiveControllers;
type sdk_Agent = Agent;
declare const sdk_Agent: typeof Agent;
type sdk_AgentLifecycleCallbacks = AgentLifecycleCallbacks;
type sdk_AnchorCapability = AnchorCapability;
type sdk_AnchorManager = AnchorManager;
declare const sdk_AnchorManager: typeof AnchorManager;
type sdk_AnchorRecord = AnchorRecord;
type sdk_AnchorRestoreResult = AnchorRestoreResult;
type sdk_AnchorRestoreStatus = AnchorRestoreStatus;
type sdk_AnchorStorageLike = AnchorStorageLike;
type sdk_AnchorStore = AnchorStore;
type sdk_AnchoredObjectFactory = AnchoredObjectFactory;
type sdk_AnchoredObjects = AnchoredObjects;
declare const sdk_AnchoredObjects: typeof AnchoredObjects;
type sdk_AnchorsOptions = AnchorsOptions;
declare const sdk_AnchorsOptions: typeof AnchorsOptions;
type sdk_AudioListener = AudioListener;
declare const sdk_AudioListener: typeof AudioListener;
type sdk_AudioListenerOptions = AudioListenerOptions;
type sdk_AudioPlayer = AudioPlayer;
declare const sdk_AudioPlayer: typeof AudioPlayer;
type sdk_AudioPlayerOptions = AudioPlayerOptions;
type sdk_AutomationModeOptions = AutomationModeOptions;
declare const sdk_BACK: typeof BACK;
type sdk_BackgroundMusic = BackgroundMusic;
declare const sdk_BackgroundMusic: typeof BackgroundMusic;
type sdk_BaseManipulationEvent = BaseManipulationEvent;
type sdk_CameraParametersSnapshot = CameraParametersSnapshot;
type sdk_CameraSnapshot = CameraSnapshot;
type sdk_CategoryVolumes = CategoryVolumes;
declare const sdk_CategoryVolumes: typeof CategoryVolumes;
type sdk_ColorStop = ColorStop;
type sdk_Constructor<T = object> = Constructor<T>;
type sdk_Context = Context;
declare const sdk_Context: typeof Context;
type sdk_ContextOptions = ContextOptions;
declare const sdk_ContextOptions: typeof ContextOptions;
type sdk_Core = Core;
declare const sdk_Core: typeof Core;
type sdk_CoreLifecycleState = CoreLifecycleState;
type sdk_CoreSound = CoreSound;
declare const sdk_CoreSound: typeof CoreSound;
declare const sdk_DEFAULT_DEVICE_CAMERA_HEIGHT: typeof DEFAULT_DEVICE_CAMERA_HEIGHT;
declare const sdk_DEFAULT_DEVICE_CAMERA_WIDTH: typeof DEFAULT_DEVICE_CAMERA_WIDTH;
declare const sdk_DEFAULT_RGB_TO_DEPTH_PARAMS: typeof DEFAULT_RGB_TO_DEPTH_PARAMS;
declare const sdk_DEVICE_CAMERA_PARAMETERS: typeof DEVICE_CAMERA_PARAMETERS;
declare const sdk_DOWN: typeof DOWN;
type sdk_DeepPartial<T> = DeepPartial<T>;
type sdk_DeepReadonly<T> = DeepReadonly<T>;
type sdk_Depth = Depth;
declare const sdk_Depth: typeof Depth;
type sdk_DepthArray = DepthArray;
type sdk_DepthMesh = DepthMesh;
declare const sdk_DepthMesh: typeof DepthMesh;
type sdk_DepthMeshOptions = DepthMeshOptions;
declare const sdk_DepthMeshOptions: typeof DepthMeshOptions;
type sdk_DepthOptions = DepthOptions;
declare const sdk_DepthOptions: typeof DepthOptions;
type sdk_DepthTextures = DepthTextures;
declare const sdk_DepthTextures: typeof DepthTextures;
type sdk_DetectedBodyPose = DetectedBodyPose;
declare const sdk_DetectedBodyPose: typeof DetectedBodyPose;
type sdk_DetectedFace = DetectedFace;
declare const sdk_DetectedFace: typeof DetectedFace;
type sdk_DetectedMesh = DetectedMesh;
declare const sdk_DetectedMesh: typeof DetectedMesh;
type sdk_DetectedObject<T> = DetectedObject<T>;
declare const sdk_DetectedObject: typeof DetectedObject;
type sdk_DetectedPlane = DetectedPlane;
declare const sdk_DetectedPlane: typeof DetectedPlane;
type sdk_DeviceCameraOptions = DeviceCameraOptions;
declare const sdk_DeviceCameraOptions: typeof DeviceCameraOptions;
type sdk_DeviceCameraParameters = DeviceCameraParameters;
type sdk_DigitName = DigitName;
declare const sdk_FINGER_ORDER: typeof FINGER_ORDER;
declare const sdk_FORWARD: typeof FORWARD;
type sdk_FaceBlendshape = FaceBlendshape;
type sdk_FaceCamera = FaceCamera;
declare const sdk_FaceCamera: typeof FaceCamera;
type sdk_FaceCameraMode = FaceCameraMode;
type sdk_FaceCameraOptions = FaceCameraOptions;
type sdk_FaceLandmark = FaceLandmark;
type sdk_FaceLandmarkName = FaceLandmarkName;
declare const sdk_FaceLandmarkName: typeof FaceLandmarkName;
type sdk_FaceRecognizer = FaceRecognizer;
declare const sdk_FaceRecognizer: typeof FaceRecognizer;
type sdk_FacesOptions = FacesOptions;
declare const sdk_FacesOptions: typeof FacesOptions;
type sdk_FingerName = FingerName;
type sdk_FollowHead = FollowHead;
declare const sdk_FollowHead: typeof FollowHead;
type sdk_FollowHeadOptions = FollowHeadOptions;
type sdk_FollowObject = FollowObject;
declare const sdk_FollowObject: typeof FollowObject;
type sdk_FollowObjectMode = FollowObjectMode;
type sdk_FollowObjectOptions = FollowObjectOptions;
type sdk_FormFactor = FormFactor;
declare const sdk_GEMINI_DEFAULT_FLASH_MODEL: typeof GEMINI_DEFAULT_FLASH_MODEL;
declare const sdk_GEMINI_DEFAULT_IMAGE_MODEL: typeof GEMINI_DEFAULT_IMAGE_MODEL;
declare const sdk_GEMINI_DEFAULT_LIVE_MODEL: typeof GEMINI_DEFAULT_LIVE_MODEL;
type sdk_GamepadAction = GamepadAction;
type sdk_GamepadBindings = GamepadBindings;
declare const sdk_GamepadBindings: typeof GamepadBindings;
type sdk_GamepadController = GamepadController;
declare const sdk_GamepadController: typeof GamepadController;
type sdk_GazeController = GazeController;
declare const sdk_GazeController: typeof GazeController;
type sdk_Gemini = Gemini;
declare const sdk_Gemini: typeof Gemini;
type sdk_GeminiOptions = GeminiOptions;
declare const sdk_GeminiOptions: typeof GeminiOptions;
type sdk_GeminiQueryInput = GeminiQueryInput;
type sdk_GenerateSkyboxTool = GenerateSkyboxTool;
declare const sdk_GenerateSkyboxTool: typeof GenerateSkyboxTool;
type sdk_GestureConfiguration = GestureConfiguration;
type sdk_GestureDetectionResult = GestureDetectionResult;
type sdk_GestureEvent = GestureEvent;
type sdk_GestureEventDetail = GestureEventDetail;
type sdk_GestureEventType = GestureEventType;
type sdk_GestureHandedness = GestureHandedness;
type sdk_GestureRecognition = GestureRecognition;
declare const sdk_GestureRecognition: typeof GestureRecognition;
type sdk_GestureRecognitionOptions = GestureRecognitionOptions;
declare const sdk_GestureRecognitionOptions: typeof GestureRecognitionOptions;
type sdk_GestureRecognizer = GestureRecognizer;
type sdk_GestureScoreMap = GestureScoreMap;
type sdk_GetWeatherArgs = GetWeatherArgs;
type sdk_GetWeatherTool = GetWeatherTool;
declare const sdk_GetWeatherTool: typeof GetWeatherTool;
type sdk_GradientPaint = GradientPaint;
type sdk_GradientType = GradientType;
declare const sdk_HAND_BONE_IDX_CONNECTION_MAP: typeof HAND_BONE_IDX_CONNECTION_MAP;
declare const sdk_HAND_INDEX_TO_LABEL: typeof HAND_INDEX_TO_LABEL;
declare const sdk_HAND_JOINT_COUNT: typeof HAND_JOINT_COUNT;
declare const sdk_HAND_JOINT_IDX_CONNECTION_MAP: typeof HAND_JOINT_IDX_CONNECTION_MAP;
declare const sdk_HAND_JOINT_NAMES: typeof HAND_JOINT_NAMES;
type sdk_HandContext = HandContext;
type sdk_HandLabel = HandLabel;
type sdk_Handedness = Handedness;
declare const sdk_Handedness: typeof Handedness;
type sdk_Hands = Hands;
declare const sdk_Hands: typeof Hands;
type sdk_HandsOptions = HandsOptions;
declare const sdk_HandsOptions: typeof HandsOptions;
type sdk_HeadGestureConfiguration = HeadGestureConfiguration;
type sdk_HeadGestureContext = HeadGestureContext;
type sdk_HeadGestureDetectionResult = HeadGestureDetectionResult;
type sdk_HeadGestureEvent = HeadGestureEvent;
type sdk_HeadGestureEventDetail = HeadGestureEventDetail;
type sdk_HeadGestureEventMap = HeadGestureEventMap;
type sdk_HeadGestureRecognition = HeadGestureRecognition;
declare const sdk_HeadGestureRecognition: typeof HeadGestureRecognition;
type sdk_HeadGestureRecognitionOptions = HeadGestureRecognitionOptions;
declare const sdk_HeadGestureRecognitionOptions: typeof HeadGestureRecognitionOptions;
type sdk_HeadGestureRecognizer = HeadGestureRecognizer;
type sdk_HeadGestureScoreMap = HeadGestureScoreMap;
type sdk_HeadPoseSample = HeadPoseSample;
type sdk_HeuristicGestureDetector = HeuristicGestureDetector;
type sdk_HeuristicGestureRecognizer = HeuristicGestureRecognizer;
declare const sdk_HeuristicGestureRecognizer: typeof HeuristicGestureRecognizer;
type sdk_HeuristicHeadGestureDetector = HeuristicHeadGestureDetector;
type sdk_HeuristicHeadGestureRecognizer = HeuristicHeadGestureRecognizer;
declare const sdk_HeuristicHeadGestureRecognizer: typeof HeuristicHeadGestureRecognizer;
type sdk_HeuristicHeadGestureRecognizerOptions = HeuristicHeadGestureRecognizerOptions;
type sdk_HoverEvent = HoverEvent;
type sdk_HumanRecognizer = HumanRecognizer;
declare const sdk_HumanRecognizer: typeof HumanRecognizer;
type sdk_HumansOptions = HumansOptions;
declare const sdk_HumansOptions: typeof HumansOptions;
type sdk_Injectable = Injectable;
type sdk_InjectableConstructor = InjectableConstructor;
type sdk_Input = Input;
declare const sdk_Input: typeof Input;
type sdk_InputOptions = InputOptions;
declare const sdk_InputOptions: typeof InputOptions;
type sdk_Interaction = Interaction;
declare const sdk_Interaction: typeof Interaction;
type sdk_InteractionOptions = InteractionOptions;
declare const sdk_InteractionOptions: typeof InteractionOptions;
type sdk_InteractionSource = InteractionSource;
type sdk_InteractionSourceType = InteractionSourceType;
type sdk_JointName = JointName;
type sdk_JointPositions = JointPositions;
type sdk_KeyEvent = KeyEvent;
type sdk_Keycodes = Keycodes;
declare const sdk_Keycodes: typeof Keycodes;
type sdk_KeysJson = KeysJson;
declare const sdk_LEFT: typeof LEFT;
declare const sdk_LEFT_VIEW_ONLY_LAYER: typeof LEFT_VIEW_ONLY_LAYER;
type sdk_Lighting = Lighting;
declare const sdk_Lighting: typeof Lighting;
type sdk_LightingOptions = LightingOptions;
declare const sdk_LightingOptions: typeof LightingOptions;
type sdk_LipMetrics = LipMetrics;
type sdk_LiveSessionState = LiveSessionState;
type sdk_LoadingSpinnerManager = LoadingSpinnerManager;
declare const sdk_LoadingSpinnerManager: typeof LoadingSpinnerManager;
type sdk_LocalStorageAnchorStore = LocalStorageAnchorStore;
declare const sdk_LocalStorageAnchorStore: typeof LocalStorageAnchorStore;
type sdk_LongSelectEvent = LongSelectEvent;
type sdk_ManipulationAction = ManipulationAction;
type sdk_ManipulationEvent = ManipulationEvent;
type sdk_ManipulationHandleOptions = ManipulationHandleOptions;
type sdk_ManipulationOptions = ManipulationOptions;
type sdk_ManipulationPhase = ManipulationPhase;
type sdk_MediaOrSimulatorMediaDeviceInfo = MediaOrSimulatorMediaDeviceInfo;
type sdk_MediaPipeHandContext = MediaPipeHandContext;
declare const sdk_MediaPipeHandContext: typeof MediaPipeHandContext;
type sdk_MediaPipeHandLandmark = MediaPipeHandLandmark;
type sdk_MediaPipeHandPoseEstimator = MediaPipeHandPoseEstimator;
declare const sdk_MediaPipeHandPoseEstimator: typeof MediaPipeHandPoseEstimator;
type sdk_MeshDetectionOptions = MeshDetectionOptions;
declare const sdk_MeshDetectionOptions: typeof MeshDetectionOptions;
type sdk_MeshDetector = MeshDetector;
declare const sdk_MeshDetector: typeof MeshDetector;
type sdk_MeshScript<TGeometry extends THREE.BufferGeometry = THREE.BufferGeometry, TMaterial extends THREE.Material | THREE.Material[] = THREE.Material | THREE.Material[], TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap> = MeshScript<TGeometry, TMaterial, TEventMap>;
declare const sdk_MeshScript: typeof MeshScript;
type sdk_ModelClass = ModelClass;
type sdk_ModelLoader = ModelLoader;
declare const sdk_ModelLoader: typeof ModelLoader;
type sdk_ModelLoaderLoadGLTFOptions = ModelLoaderLoadGLTFOptions;
type sdk_ModelLoaderLoadOptions = ModelLoaderLoadOptions;
type sdk_ModelOptions = ModelOptions;
type sdk_ModelSource = ModelSource;
type sdk_ModelViewer = ModelViewer;
declare const sdk_ModelViewer: typeof ModelViewer;
type sdk_ModelViewerOptions = ModelViewerOptions;
type sdk_ModelViewerOrigin = ModelViewerOrigin;
type sdk_MouseController = MouseController;
declare const sdk_MouseController: typeof MouseController;
declare const sdk_NUM_HANDS: typeof NUM_HANDS;
type sdk_NormalizedDetectedObject<T> = NormalizedDetectedObject<T>;
declare const sdk_OCCLUDABLE_ITEMS_LAYER: typeof OCCLUDABLE_ITEMS_LAYER;
type sdk_ObjectDetector = ObjectDetector;
declare const sdk_ObjectDetector: typeof ObjectDetector;
type sdk_ObjectGrabEvent = ObjectGrabEvent;
type sdk_ObjectTouchEvent = ObjectTouchEvent;
type sdk_ObjectTouchStartEvent = ObjectTouchStartEvent;
type sdk_ObjectsOptions = ObjectsOptions;
declare const sdk_ObjectsOptions: typeof ObjectsOptions;
type sdk_OcclusionPass = OcclusionPass;
declare const sdk_OcclusionPass: typeof OcclusionPass;
type sdk_OcclusionUtils = OcclusionUtils;
declare const sdk_OcclusionUtils: typeof OcclusionUtils;
type sdk_OpenAI = OpenAI;
declare const sdk_OpenAI: typeof OpenAI;
type sdk_OpenAIOptions = OpenAIOptions;
declare const sdk_OpenAIOptions: typeof OpenAIOptions;
type sdk_Options = Options;
declare const sdk_Options: typeof Options;
type sdk_Orbit = Orbit;
declare const sdk_Orbit: typeof Orbit;
type sdk_OrbitDirection = OrbitDirection;
type sdk_OrbitFrame = OrbitFrame;
type sdk_OrbitOptions = OrbitOptions;
type sdk_OrbitPath = OrbitPath;
type sdk_Paint = Paint;
type sdk_PalmPose = PalmPose;
type sdk_Physics = Physics;
declare const sdk_Physics: typeof Physics;
type sdk_PhysicsOptions = PhysicsOptions;
declare const sdk_PhysicsOptions: typeof PhysicsOptions;
type sdk_PlaneDetector = PlaneDetector;
declare const sdk_PlaneDetector: typeof PlaneDetector;
type sdk_PlanesOptions = PlanesOptions;
declare const sdk_PlanesOptions: typeof PlanesOptions;
type sdk_PlayModelAnimationOptions = PlayModelAnimationOptions;
type sdk_PlaySoundOptions = PlaySoundOptions;
type sdk_PointerEvents = PointerEvents;
type sdk_PoseEstimator = PoseEstimator;
type sdk_PoseJointName = PoseJointName;
declare const sdk_PoseJointName: typeof PoseJointName;
type sdk_PoseLandmark = PoseLandmark;
type sdk_QuatTuple = QuatTuple;
type sdk_RAPIERCompat = RAPIERCompat;
declare const sdk_RIGHT: typeof RIGHT;
declare const sdk_RIGHT_VIEW_ONLY_LAYER: typeof RIGHT_VIEW_ONLY_LAYER;
type sdk_RaycastMode = RaycastMode;
type sdk_Registry = Registry;
declare const sdk_Registry: typeof Registry;
type sdk_ResolvedSimulatorSceneManifest = ResolvedSimulatorSceneManifest;
type sdk_ReticleMode = ReticleMode;
type sdk_ReticleOptions = ReticleOptions;
declare const sdk_ReticleOptions: typeof ReticleOptions;
type sdk_Reticles = Reticles;
declare const sdk_Reticles: typeof Reticles;
type sdk_RgbToDepthParams = RgbToDepthParams;
type sdk_RotateManipulationEvent = RotateManipulationEvent;
type sdk_RotateOptions = RotateOptions;
declare const sdk_SIMULATOR_HAND_COMMON_BIOMECHANICAL_CONSTRAINTS_DEGREES: typeof SIMULATOR_HAND_COMMON_BIOMECHANICAL_CONSTRAINTS_DEGREES;
declare const sdk_SIMULATOR_HAND_POSE_NAMES: typeof SIMULATOR_HAND_POSE_NAMES;
declare const sdk_SIMULATOR_HAND_POSE_ROTATIONS: typeof SIMULATOR_HAND_POSE_ROTATIONS;
declare const sdk_SOUND_PRESETS: typeof SOUND_PRESETS;
type sdk_ScaleManipulationEvent = ScaleManipulationEvent;
type sdk_ScaleOptions = ScaleOptions;
type sdk_SceneContextDetectionOptions = SceneContextDetectionOptions;
type sdk_SceneContextDetectionResult = SceneContextDetectionResult;
type sdk_SceneDetector = SceneDetector;
declare const sdk_SceneDetector: typeof SceneDetector;
type sdk_SceneOptions = SceneOptions;
declare const sdk_SceneOptions: typeof SceneOptions;
type sdk_SceneSetOfMarkOptions = SceneSetOfMarkOptions;
declare const sdk_SceneSetOfMarkOptions: typeof SceneSetOfMarkOptions;
type sdk_SceneVisibilityOptions = SceneVisibilityOptions;
declare const sdk_SceneVisibilityOptions: typeof SceneVisibilityOptions;
type sdk_ScreenshotSynthesizer = ScreenshotSynthesizer;
declare const sdk_ScreenshotSynthesizer: typeof ScreenshotSynthesizer;
type sdk_Script<TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap> = Script<TEventMap>;
declare const sdk_Script: typeof Script;
declare const sdk_ScriptMixin: typeof ScriptMixin;
type sdk_ScriptsManager = ScriptsManager;
declare const sdk_ScriptsManager: typeof ScriptsManager;
type sdk_ScriptsManagerEventMap = ScriptsManagerEventMap;
type sdk_ScriptsManagerEventType = ScriptsManagerEventType;
declare const sdk_ScriptsManagerEventType: typeof ScriptsManagerEventType;
type sdk_SegmentCategory = SegmentCategory;
declare const sdk_SegmentCategory: typeof SegmentCategory;
type sdk_SegmentationMask = SegmentationMask;
type sdk_SegmentationOptions = SegmentationOptions;
declare const sdk_SegmentationOptions: typeof SegmentationOptions;
type sdk_Segmenter = Segmenter;
declare const sdk_Segmenter: typeof Segmenter;
type sdk_SelectEndEvent = SelectEndEvent;
type sdk_SelectEvent = SelectEvent;
type sdk_SelectionEndReason = SelectionEndReason;
type sdk_SemanticBounds = SemanticBounds;
type sdk_SemanticMetadata = SemanticMetadata;
type sdk_SemanticNode = SemanticNode;
type sdk_SemanticSource = SemanticSource;
type sdk_SemanticTree = SemanticTree;
type sdk_SemanticViewData = SemanticViewData;
type sdk_SetOfMark = SetOfMark;
type sdk_SetOfMarkContext = SetOfMarkContext;
type sdk_SetSimulatorEnvironmentEvent = SetSimulatorEnvironmentEvent;
declare const sdk_SetSimulatorEnvironmentEvent: typeof SetSimulatorEnvironmentEvent;
type sdk_SetSimulatorHandPhysicsEvent = SetSimulatorHandPhysicsEvent;
declare const sdk_SetSimulatorHandPhysicsEvent: typeof SetSimulatorHandPhysicsEvent;
type sdk_SetSimulatorModeEvent = SetSimulatorModeEvent;
declare const sdk_SetSimulatorModeEvent: typeof SetSimulatorModeEvent;
type sdk_Shader = Shader;
type sdk_ShaderUniforms = ShaderUniforms;
type sdk_ShowSimulatorInstructionsEvent = ShowSimulatorInstructionsEvent;
declare const sdk_ShowSimulatorInstructionsEvent: typeof ShowSimulatorInstructionsEvent;
type sdk_Simulator = Simulator;
declare const sdk_Simulator: typeof Simulator;
type sdk_SimulatorAnchor = SimulatorAnchor;
declare const sdk_SimulatorAnchor: typeof SimulatorAnchor;
type sdk_SimulatorCamera = SimulatorCamera;
declare const sdk_SimulatorCamera: typeof SimulatorCamera;
type sdk_SimulatorControlMode = SimulatorControlMode;
declare const sdk_SimulatorControlMode: typeof SimulatorControlMode;
type sdk_SimulatorControllerState = SimulatorControllerState;
declare const sdk_SimulatorControllerState: typeof SimulatorControllerState;
type sdk_SimulatorControls = SimulatorControls;
declare const sdk_SimulatorControls: typeof SimulatorControls;
type sdk_SimulatorCustomInstruction = SimulatorCustomInstruction;
type sdk_SimulatorDepth = SimulatorDepth;
declare const sdk_SimulatorDepth: typeof SimulatorDepth;
type sdk_SimulatorDepthMaterial = SimulatorDepthMaterial;
declare const sdk_SimulatorDepthMaterial: typeof SimulatorDepthMaterial;
type sdk_SimulatorDetectedObjectInput<T = unknown> = SimulatorDetectedObjectInput<T>;
type sdk_SimulatorEnvironment = SimulatorEnvironment;
type sdk_SimulatorHandJointRotationArray = SimulatorHandJointRotationArray;
type sdk_SimulatorHandPhysicsOptions = SimulatorHandPhysicsOptions;
type sdk_SimulatorHandPose = SimulatorHandPose;
declare const sdk_SimulatorHandPose: typeof SimulatorHandPose;
type sdk_SimulatorHandPoseChangeRequestEvent = SimulatorHandPoseChangeRequestEvent;
declare const sdk_SimulatorHandPoseChangeRequestEvent: typeof SimulatorHandPoseChangeRequestEvent;
type sdk_SimulatorHandPoseJoints = SimulatorHandPoseJoints;
type sdk_SimulatorHandPoseRotationConstraintsDegrees = SimulatorHandPoseRotationConstraintsDegrees;
type sdk_SimulatorHandPoseRotationRangeDegrees = SimulatorHandPoseRotationRangeDegrees;
type sdk_SimulatorHandPoseRotations = SimulatorHandPoseRotations;
type sdk_SimulatorHands = SimulatorHands;
declare const sdk_SimulatorHands: typeof SimulatorHands;
type sdk_SimulatorLocationDefinition = SimulatorLocationDefinition;
type sdk_SimulatorLocations = SimulatorLocations;
type sdk_SimulatorMediaDeviceInfo = SimulatorMediaDeviceInfo;
declare const sdk_SimulatorMediaDeviceInfo: typeof SimulatorMediaDeviceInfo;
type sdk_SimulatorMesh = SimulatorMesh;
type sdk_SimulatorMode = SimulatorMode;
declare const sdk_SimulatorMode: typeof SimulatorMode;
type sdk_SimulatorObject = SimulatorObject;
type sdk_SimulatorObjectDefinition = SimulatorObjectDefinition;
type sdk_SimulatorObjectDetectionSource = SimulatorObjectDetectionSource;
type sdk_SimulatorObjectUpdate = SimulatorObjectUpdate;
type sdk_SimulatorObjects = SimulatorObjects;
type sdk_SimulatorOptions = SimulatorOptions;
declare const sdk_SimulatorOptions: typeof SimulatorOptions;
type sdk_SimulatorPhysicsMode = SimulatorPhysicsMode;
type sdk_SimulatorPlane = SimulatorPlane;
type sdk_SimulatorPlaneType = SimulatorPlaneType;
type sdk_SimulatorPointerLockController = SimulatorPointerLockController;
declare const sdk_SimulatorPointerLockController: typeof SimulatorPointerLockController;
type sdk_SimulatorQuaternionTuple = SimulatorQuaternionTuple;
type sdk_SimulatorScene = SimulatorScene;
declare const sdk_SimulatorScene: typeof SimulatorScene;
type sdk_SimulatorSceneManifest = SimulatorSceneManifest;
type sdk_SimulatorUser = SimulatorUser;
declare const sdk_SimulatorUser: typeof SimulatorUser;
type sdk_SimulatorUserPath = SimulatorUserPath;
type sdk_SimulatorVector3Tuple = SimulatorVector3Tuple;
type sdk_SkyboxAgent = SkyboxAgent;
declare const sdk_SkyboxAgent: typeof SkyboxAgent;
type sdk_SolidPaint = SolidPaint;
type sdk_SoundOptions = SoundOptions;
declare const sdk_SoundOptions: typeof SoundOptions;
type sdk_SoundSynthesizer = SoundSynthesizer;
declare const sdk_SoundSynthesizer: typeof SoundSynthesizer;
type sdk_SparkRendererHolder = SparkRendererHolder;
declare const sdk_SparkRendererHolder: typeof SparkRendererHolder;
type sdk_SpatialAudio = SpatialAudio;
declare const sdk_SpatialAudio: typeof SpatialAudio;
type sdk_SpeechRecognizer = SpeechRecognizer;
declare const sdk_SpeechRecognizer: typeof SpeechRecognizer;
type sdk_SpeechRecognizerOptions = SpeechRecognizerOptions;
declare const sdk_SpeechRecognizerOptions: typeof SpeechRecognizerOptions;
type sdk_SpeechSynthesizer = SpeechSynthesizer;
declare const sdk_SpeechSynthesizer: typeof SpeechSynthesizer;
type sdk_SpeechSynthesizerOptions = SpeechSynthesizerOptions;
declare const sdk_SpeechSynthesizerOptions: typeof SpeechSynthesizerOptions;
type sdk_StorablePose = StorablePose;
type sdk_StreamState = StreamState;
declare const sdk_StreamState: typeof StreamState;
type sdk_StrokeEventMap = StrokeEventMap;
type sdk_StrokeRecognizer = StrokeRecognizer;
declare const sdk_StrokeRecognizer: typeof StrokeRecognizer;
type sdk_StylizedFace = StylizedFace;
declare const sdk_StylizedFace: typeof StylizedFace;
type sdk_StylizedFaceOptions = StylizedFaceOptions;
type sdk_TensorFlowHandPoseEstimator = TensorFlowHandPoseEstimator;
declare const sdk_TensorFlowHandPoseEstimator: typeof TensorFlowHandPoseEstimator;
type sdk_Tool = Tool;
declare const sdk_Tool: typeof Tool;
type sdk_ToolCall = ToolCall;
type sdk_ToolOptions = ToolOptions;
type sdk_ToolResult<T = unknown> = ToolResult<T>;
type sdk_ToolSchema = ToolSchema;
type sdk_TrackedAnchor = TrackedAnchor;
type sdk_TrackedAnchorLike = TrackedAnchorLike;
type sdk_TransformScript = TransformScript;
declare const sdk_TransformScript: typeof TransformScript;
type sdk_TranslateManipulationEvent = TranslateManipulationEvent;
type sdk_TranslateOptions = TranslateOptions;
type sdk_UIAppearance = UIAppearance;
type sdk_UIButton<TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap> = UIButton<TEventMap>;
declare const sdk_UIButton: typeof UIButton;
type sdk_UIButtonOptions = UIButtonOptions;
type sdk_UICard<TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap> = UICard<TEventMap>;
declare const sdk_UICard: typeof UICard;
type sdk_UICardAnchorX = UICardAnchorX;
type sdk_UICardAnchorY = UICardAnchorY;
type sdk_UICardEdgeOptions = UICardEdgeOptions;
type sdk_UICardOptions = UICardOptions;
type sdk_UIColor = UIColor;
type sdk_UIElement<TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap> = UIElement<TEventMap>;
declare const sdk_UIElement: typeof UIElement;
type sdk_UIElementOptions = UIElementOptions;
type sdk_UIIcon<TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap> = UIIcon<TEventMap>;
declare const sdk_UIIcon: typeof UIIcon;
type sdk_UIIconOptions = UIIconOptions;
type sdk_UIIconVariant = UIIconVariant;
type sdk_UIIconWeight = UIIconWeight;
type sdk_UIImage<TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap> = UIImage<TEventMap>;
declare const sdk_UIImage: typeof UIImage;
type sdk_UIImageOptions = UIImageOptions;
type sdk_UILineHeight = UILineHeight;
type sdk_UIOverlay<TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap> = UIOverlay<TEventMap>;
declare const sdk_UIOverlay: typeof UIOverlay;
type sdk_UIOverlayOptions = UIOverlayOptions;
type sdk_UIPanel<TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap> = UIPanel<TEventMap>;
declare const sdk_UIPanel: typeof UIPanel;
type sdk_UIPanelOptions = UIPanelOptions;
type sdk_UIPosition = UIPosition;
type sdk_UIResolvedSize = UIResolvedSize;
type sdk_UISize = UISize;
type sdk_UISlider<TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap> = UISlider<TEventMap>;
declare const sdk_UISlider: typeof UISlider;
type sdk_UISliderOptions = UISliderOptions;
type sdk_UIStateStyle = UIStateStyle;
type sdk_UIStyle = UIStyle;
type sdk_UIText<TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap> = UIText<TEventMap>;
declare const sdk_UIText: typeof UIText;
type sdk_UITextOptions = UITextOptions;
type sdk_UITheme = UITheme;
type sdk_UIThemeColors = UIThemeColors;
type sdk_UIThemePresetName = UIThemePresetName;
type sdk_UIThemeStyleRole = UIThemeStyleRole;
type sdk_UIThemeStyles = UIThemeStyles;
type sdk_UIThemeUpdate = UIThemeUpdate;
type sdk_UITransform = UITransform;
type sdk_UIUnit = UIUnit;
type sdk_UIValidationBounds = UIValidationBounds;
type sdk_UIValidationCode = UIValidationCode;
type sdk_UIValidationIssue = UIValidationIssue;
type sdk_UIValidationReport = UIValidationReport;
type sdk_UIVector2 = UIVector2;
declare const sdk_UP: typeof UP;
type sdk_User = User;
declare const sdk_User: typeof User;
declare const sdk_VIEW_DEPTH_GAP: typeof VIEW_DEPTH_GAP;
type sdk_Vec2Tuple = Vec2Tuple;
type sdk_Vec3Tuple = Vec3Tuple;
type sdk_VideoFileStream = VideoFileStream;
declare const sdk_VideoFileStream: typeof VideoFileStream;
type sdk_VideoFileStreamOptions = VideoFileStreamOptions;
type sdk_VideoStream<T extends VideoStreamDetails = VideoStreamDetails> = VideoStream<T>;
declare const sdk_VideoStream: typeof VideoStream;
type sdk_VideoStreamDetails = VideoStreamDetails;
type sdk_VideoStreamEventMap<T> = VideoStreamEventMap<T>;
type sdk_VideoStreamGetSnapshotBase64Options = VideoStreamGetSnapshotBase64Options;
type sdk_VideoStreamGetSnapshotBlobOptions = VideoStreamGetSnapshotBlobOptions;
type sdk_VideoStreamGetSnapshotImageDataOptions = VideoStreamGetSnapshotImageDataOptions;
type sdk_VideoStreamGetSnapshotOptions = VideoStreamGetSnapshotOptions;
type sdk_VideoStreamGetSnapshotTextureOptions = VideoStreamGetSnapshotTextureOptions;
type sdk_VideoStreamOptions = VideoStreamOptions;
type sdk_VisemeWeights = VisemeWeights;
type sdk_VisibilityTransition = VisibilityTransition;
declare const sdk_VisibilityTransition: typeof VisibilityTransition;
type sdk_VisibilityTransitionOptions = VisibilityTransitionOptions;
type sdk_VisibleObjectsContext = VisibleObjectsContext;
type sdk_VolumeCategory = VolumeCategory;
declare const sdk_VolumeCategory: typeof VolumeCategory;
type sdk_WaitFrame = WaitFrame;
declare const sdk_WaitFrame: typeof WaitFrame;
type sdk_WeatherData = WeatherData;
type sdk_WebXRHandContext = WebXRHandContext;
declare const sdk_WebXRHandContext: typeof WebXRHandContext;
type sdk_WebXRHandPoseEstimator = WebXRHandPoseEstimator;
declare const sdk_WebXRHandPoseEstimator: typeof WebXRHandPoseEstimator;
type sdk_WebXRJointRotations = WebXRJointRotations;
type sdk_World = World;
declare const sdk_World: typeof World;
type sdk_WorldOptions = WorldOptions;
declare const sdk_WorldOptions: typeof WorldOptions;
type sdk_XBObjectOptions = XBObjectOptions;
type sdk_XRButton = XRButton;
declare const sdk_XRButton: typeof XRButton;
type sdk_XRDeviceCamera = XRDeviceCamera;
declare const sdk_XRDeviceCamera: typeof XRDeviceCamera;
type sdk_XREffects = XREffects;
declare const sdk_XREffects: typeof XREffects;
type sdk_XRPass = XRPass;
declare const sdk_XRPass: typeof XRPass;
type sdk_XRReferenceSpaceCache = XRReferenceSpaceCache;
declare const sdk_XRReferenceSpaceCache: typeof XRReferenceSpaceCache;
type sdk_XRTransitionOptions = XRTransitionOptions;
declare const sdk_XRTransitionOptions: typeof XRTransitionOptions;
declare const sdk_XR_BLOCKS_ASSETS_PATH: typeof XR_BLOCKS_ASSETS_PATH;
declare const sdk_ZERO_VECTOR3: typeof ZERO_VECTOR3;
declare const sdk_ZERO_VISEME: typeof ZERO_VISEME;
declare const sdk__getBvhImportStatus: typeof _getBvhImportStatus;
declare const sdk_add: typeof add;
declare const sdk_ai: typeof ai;
declare const sdk_anchorCapability: typeof anchorCapability;
declare const sdk_applyBVH: typeof applyBVH;
declare const sdk_applySimulatorHandPoseRotationConstraints: typeof applySimulatorHandPoseRotationConstraints;
declare const sdk_average: typeof average;
declare const sdk_callInitWithDependencyInjection: typeof callInitWithDependencyInjection;
declare const sdk_camera: typeof camera;
declare const sdk_clamp: typeof clamp;
declare const sdk_clamp01: typeof clamp01;
declare const sdk_clampRotationToAngle: typeof clampRotationToAngle;
declare const sdk_context: typeof context;
declare const sdk_core: typeof core;
declare const sdk_cropImage: typeof cropImage;
declare const sdk_defaultAnchorStorageKey: typeof defaultAnchorStorageKey;
declare const sdk_depth: typeof depth;
declare const sdk_disposeBVH: typeof disposeBVH;
declare const sdk_disposeMaterial: typeof disposeMaterial;
declare const sdk_disposeMeshResources: typeof disposeMeshResources;
declare const sdk_disposeObjectChildren: typeof disposeObjectChildren;
declare const sdk_disposeObjectTree: typeof disposeObjectTree;
declare const sdk_disposeRenderableResources: typeof disposeRenderableResources;
declare const sdk_enableAcceleratedRaycast: typeof enableAcceleratedRaycast;
declare const sdk_estimateHandScale: typeof estimateHandScale;
declare const sdk_extractYaw: typeof extractYaw;
declare const sdk_getAdjacentFingerSpreads: typeof getAdjacentFingerSpreads;
declare const sdk_getBoneVectors: typeof getBoneVectors;
declare const sdk_getCameraParametersSnapshot: typeof getCameraParametersSnapshot;
declare const sdk_getColorHex: typeof getColorHex;
declare const sdk_getDeltaTime: typeof getDeltaTime;
declare const sdk_getDeviceCameraClipFromView: typeof getDeviceCameraClipFromView;
declare const sdk_getDeviceCameraWorldFromClip: typeof getDeviceCameraWorldFromClip;
declare const sdk_getDeviceCameraWorldFromView: typeof getDeviceCameraWorldFromView;
declare const sdk_getElapsedTime: typeof getElapsedTime;
declare const sdk_getFingerBendAngles: typeof getFingerBendAngles;
declare const sdk_getFingerCurl: typeof getFingerCurl;
declare const sdk_getFingerDirection: typeof getFingerDirection;
declare const sdk_getFingerJoint: typeof getFingerJoint;
declare const sdk_getFingerPalmAlignment: typeof getFingerPalmAlignment;
declare const sdk_getFingerSpread: typeof getFingerSpread;
declare const sdk_getFingerStraightness: typeof getFingerStraightness;
declare const sdk_getFingertipDistance: typeof getFingertipDistance;
declare const sdk_getFingertipPalmDistance: typeof getFingertipPalmDistance;
declare const sdk_getObjectTargetPoint: typeof getObjectTargetPoint;
declare const sdk_getPalmNormal: typeof getPalmNormal;
declare const sdk_getPalmPose: typeof getPalmPose;
declare const sdk_getPalmRight: typeof getPalmRight;
declare const sdk_getPalmUp: typeof getPalmUp;
declare const sdk_getPalmWidth: typeof getPalmWidth;
declare const sdk_getRelativeBoneAngles: typeof getRelativeBoneAngles;
declare const sdk_getThumbBendAngles: typeof getThumbBendAngles;
declare const sdk_getThumbCurl: typeof getThumbCurl;
declare const sdk_getThumbDirection: typeof getThumbDirection;
declare const sdk_getThumbOpposition: typeof getThumbOpposition;
declare const sdk_getThumbStraightness: typeof getThumbStraightness;
declare const sdk_getThumbVerticalDirection: typeof getThumbVerticalDirection;
declare const sdk_getUrlParamBool: typeof getUrlParamBool;
declare const sdk_getUrlParamFloat: typeof getUrlParamFloat;
declare const sdk_getUrlParamInt: typeof getUrlParamInt;
declare const sdk_getUrlParameter: typeof getUrlParameter;
declare const sdk_getVec4ByColorString: typeof getVec4ByColorString;
declare const sdk_getXrCameraLeft: typeof getXrCameraLeft;
declare const sdk_getXrCameraRight: typeof getXrCameraRight;
declare const sdk_init: typeof init;
declare const sdk_initScript: typeof initScript;
declare const sdk_input: typeof input;
declare const sdk_intrinsicsToProjectionMatrix: typeof intrinsicsToProjectionMatrix;
declare const sdk_isBVHReady: typeof isBVHReady;
declare const sdk_isDeviceCameraPoseAvailable: typeof isDeviceCameraPoseAvailable;
declare const sdk_lerp: typeof lerp;
declare const sdk_loadStereoImageAsTextures: typeof loadStereoImageAsTextures;
declare const sdk_loadingSpinnerManager: typeof loadingSpinnerManager;
declare const sdk_lookAtRotation: typeof lookAtRotation;
declare const sdk_objectIsDescendantOf: typeof objectIsDescendantOf;
declare const sdk_parseBase64DataURL: typeof parseBase64DataURL;
declare const sdk_parseSimulatorHandPoseRotations: typeof parseSimulatorHandPoseRotations;
declare const sdk_placeObjectAtIntersectionFacingTarget: typeof placeObjectAtIntersectionFacingTarget;
declare const sdk_print: typeof print;
declare const sdk_resolveSimulatorHandPoseRotations: typeof resolveSimulatorHandPoseRotations;
declare const sdk_resolveSimulatorRotationsFromKeypoints: typeof resolveSimulatorRotationsFromKeypoints;
declare const sdk_scene: typeof scene;
declare const sdk_showOnlyInLeftEye: typeof showOnlyInLeftEye;
declare const sdk_showOnlyInRightEye: typeof showOnlyInRightEye;
declare const sdk_sound: typeof sound;
declare const sdk_timer: typeof timer;
declare const sdk_transformRgbUvToWorld: typeof transformRgbUvToWorld;
declare const sdk_traverseUtil: typeof traverseUtil;
declare const sdk_ui: typeof ui;
declare const sdk_urlParams: typeof urlParams;
declare const sdk_user: typeof user;
declare const sdk_visualizeDepth: typeof visualizeDepth;
declare const sdk_visualizeDepthMap: typeof visualizeDepthMap;
declare const sdk_world: typeof world;
declare const sdk_xrDepthMeshOptions: typeof xrDepthMeshOptions;
declare const sdk_xrDepthMeshPhysicsOptions: typeof xrDepthMeshPhysicsOptions;
declare const sdk_xrDepthMeshVisualizationOptions: typeof xrDepthMeshVisualizationOptions;
declare const sdk_xrDeviceCameraEnvironmentContinuousOptions: typeof xrDeviceCameraEnvironmentContinuousOptions;
declare const sdk_xrDeviceCameraEnvironmentOptions: typeof xrDeviceCameraEnvironmentOptions;
declare const sdk_xrDeviceCameraUserContinuousOptions: typeof xrDeviceCameraUserContinuousOptions;
declare const sdk_xrDeviceCameraUserOptions: typeof xrDeviceCameraUserOptions;
declare namespace sdk {
  export { sdk_AI as AI, sdk_AIOptions as AIOptions, sdk_ActiveControllers as ActiveControllers, sdk_Agent as Agent, sdk_AnchorManager as AnchorManager, sdk_AnchoredObjects as AnchoredObjects, sdk_AnchorsOptions as AnchorsOptions, sdk_AudioListener as AudioListener, sdk_AudioPlayer as AudioPlayer, sdk_BACK as BACK, sdk_BackgroundMusic as BackgroundMusic, sdk_CategoryVolumes as CategoryVolumes, sdk_Context as Context, sdk_ContextOptions as ContextOptions, sdk_Core as Core, sdk_CoreSound as CoreSound, sdk_DEFAULT_DEVICE_CAMERA_HEIGHT as DEFAULT_DEVICE_CAMERA_HEIGHT, sdk_DEFAULT_DEVICE_CAMERA_WIDTH as DEFAULT_DEVICE_CAMERA_WIDTH, sdk_DEFAULT_RGB_TO_DEPTH_PARAMS as DEFAULT_RGB_TO_DEPTH_PARAMS, sdk_DEVICE_CAMERA_PARAMETERS as DEVICE_CAMERA_PARAMETERS, sdk_DOWN as DOWN, sdk_Depth as Depth, sdk_DepthMesh as DepthMesh, sdk_DepthMeshOptions as DepthMeshOptions, sdk_DepthOptions as DepthOptions, sdk_DepthTextures as DepthTextures, sdk_DetectedBodyPose as DetectedBodyPose, sdk_DetectedFace as DetectedFace, sdk_DetectedMesh as DetectedMesh, sdk_DetectedObject as DetectedObject, sdk_DetectedPlane as DetectedPlane, sdk_DeviceCameraOptions as DeviceCameraOptions, sdk_FINGER_ORDER as FINGER_ORDER, sdk_FORWARD as FORWARD, sdk_FaceCamera as FaceCamera, sdk_FaceLandmarkName as FaceLandmarkName, sdk_FaceRecognizer as FaceRecognizer, sdk_FacesOptions as FacesOptions, sdk_FollowHead as FollowHead, sdk_FollowObject as FollowObject, sdk_GEMINI_DEFAULT_FLASH_MODEL as GEMINI_DEFAULT_FLASH_MODEL, sdk_GEMINI_DEFAULT_IMAGE_MODEL as GEMINI_DEFAULT_IMAGE_MODEL, sdk_GEMINI_DEFAULT_LIVE_MODEL as GEMINI_DEFAULT_LIVE_MODEL, sdk_GamepadBindings as GamepadBindings, sdk_GamepadController as GamepadController, sdk_GazeController as GazeController, sdk_Gemini as Gemini, sdk_GeminiOptions as GeminiOptions, sdk_GenerateSkyboxTool as GenerateSkyboxTool, sdk_GestureRecognition as GestureRecognition, sdk_GestureRecognitionOptions as GestureRecognitionOptions, sdk_GetWeatherTool as GetWeatherTool, sdk_HAND_BONE_IDX_CONNECTION_MAP as HAND_BONE_IDX_CONNECTION_MAP, sdk_HAND_INDEX_TO_LABEL as HAND_INDEX_TO_LABEL, sdk_HAND_JOINT_COUNT as HAND_JOINT_COUNT, sdk_HAND_JOINT_IDX_CONNECTION_MAP as HAND_JOINT_IDX_CONNECTION_MAP, sdk_HAND_JOINT_NAMES as HAND_JOINT_NAMES, sdk_Handedness as Handedness, sdk_Hands as Hands, sdk_HandsOptions as HandsOptions, sdk_HeadGestureRecognition as HeadGestureRecognition, sdk_HeadGestureRecognitionOptions as HeadGestureRecognitionOptions, sdk_HeuristicGestureRecognizer as HeuristicGestureRecognizer, sdk_HeuristicHeadGestureRecognizer as HeuristicHeadGestureRecognizer, sdk_HumanRecognizer as HumanRecognizer, sdk_HumansOptions as HumansOptions, sdk_Input as Input, sdk_InputOptions as InputOptions, sdk_Interaction as Interaction, sdk_InteractionOptions as InteractionOptions, sdk_Keycodes as Keycodes, sdk_LEFT as LEFT, sdk_LEFT_VIEW_ONLY_LAYER as LEFT_VIEW_ONLY_LAYER, sdk_Lighting as Lighting, sdk_LightingOptions as LightingOptions, sdk_LoadingSpinnerManager as LoadingSpinnerManager, sdk_LocalStorageAnchorStore as LocalStorageAnchorStore, sdk_MediaPipeHandContext as MediaPipeHandContext, sdk_MediaPipeHandPoseEstimator as MediaPipeHandPoseEstimator, sdk_MeshDetectionOptions as MeshDetectionOptions, sdk_MeshDetector as MeshDetector, sdk_MeshScript as MeshScript, sdk_ModelLoader as ModelLoader, sdk_ModelViewer as ModelViewer, sdk_MouseController as MouseController, sdk_NUM_HANDS as NUM_HANDS, sdk_OCCLUDABLE_ITEMS_LAYER as OCCLUDABLE_ITEMS_LAYER, sdk_ObjectDetector as ObjectDetector, sdk_ObjectsOptions as ObjectsOptions, sdk_OcclusionPass as OcclusionPass, sdk_OcclusionUtils as OcclusionUtils, sdk_OpenAI as OpenAI, sdk_OpenAIOptions as OpenAIOptions, sdk_Options as Options, sdk_Orbit as Orbit, sdk_Physics as Physics, sdk_PhysicsOptions as PhysicsOptions, sdk_PlaneDetector as PlaneDetector, sdk_PlanesOptions as PlanesOptions, sdk_PoseJointName as PoseJointName, sdk_RIGHT as RIGHT, sdk_RIGHT_VIEW_ONLY_LAYER as RIGHT_VIEW_ONLY_LAYER, sdk_Registry as Registry, sdk_ReticleOptions as ReticleOptions, sdk_Reticles as Reticles, sdk_SIMULATOR_HAND_COMMON_BIOMECHANICAL_CONSTRAINTS_DEGREES as SIMULATOR_HAND_COMMON_BIOMECHANICAL_CONSTRAINTS_DEGREES, sdk_SIMULATOR_HAND_POSE_NAMES as SIMULATOR_HAND_POSE_NAMES, sdk_SIMULATOR_HAND_POSE_ROTATIONS as SIMULATOR_HAND_POSE_ROTATIONS, sdk_SOUND_PRESETS as SOUND_PRESETS, sdk_SceneDetector as SceneDetector, sdk_SceneOptions as SceneOptions, sdk_SceneSetOfMarkOptions as SceneSetOfMarkOptions, sdk_SceneVisibilityOptions as SceneVisibilityOptions, sdk_ScreenshotSynthesizer as ScreenshotSynthesizer, sdk_Script as Script, sdk_ScriptMixin as ScriptMixin, sdk_ScriptsManager as ScriptsManager, sdk_ScriptsManagerEventType as ScriptsManagerEventType, sdk_SegmentCategory as SegmentCategory, sdk_SegmentationOptions as SegmentationOptions, sdk_Segmenter as Segmenter, sdk_SetSimulatorEnvironmentEvent as SetSimulatorEnvironmentEvent, sdk_SetSimulatorHandPhysicsEvent as SetSimulatorHandPhysicsEvent, sdk_SetSimulatorModeEvent as SetSimulatorModeEvent, sdk_ShowSimulatorInstructionsEvent as ShowSimulatorInstructionsEvent, sdk_Simulator as Simulator, sdk_SimulatorAnchor as SimulatorAnchor, sdk_SimulatorCamera as SimulatorCamera, sdk_SimulatorControlMode as SimulatorControlMode, sdk_SimulatorControllerState as SimulatorControllerState, sdk_SimulatorControls as SimulatorControls, sdk_SimulatorDepth as SimulatorDepth, sdk_SimulatorDepthMaterial as SimulatorDepthMaterial, sdk_SimulatorHandPose as SimulatorHandPose, sdk_SimulatorHandPoseChangeRequestEvent as SimulatorHandPoseChangeRequestEvent, sdk_SimulatorHands as SimulatorHands, sdk_SimulatorMediaDeviceInfo as SimulatorMediaDeviceInfo, sdk_SimulatorMode as SimulatorMode, sdk_SimulatorOptions as SimulatorOptions, sdk_SimulatorPointerLockController as SimulatorPointerLockController, sdk_SimulatorScene as SimulatorScene, sdk_SimulatorUser as SimulatorUser, sdk_SkyboxAgent as SkyboxAgent, sdk_SoundOptions as SoundOptions, sdk_SoundSynthesizer as SoundSynthesizer, sdk_SparkRendererHolder as SparkRendererHolder, sdk_SpatialAudio as SpatialAudio, sdk_SpeechRecognizer as SpeechRecognizer, sdk_SpeechRecognizerOptions as SpeechRecognizerOptions, sdk_SpeechSynthesizer as SpeechSynthesizer, sdk_SpeechSynthesizerOptions as SpeechSynthesizerOptions, sdk_StreamState as StreamState, sdk_StrokeRecognizer as StrokeRecognizer, sdk_StylizedFace as StylizedFace, sdk_TensorFlowHandPoseEstimator as TensorFlowHandPoseEstimator, sdk_Tool as Tool, sdk_TransformScript as TransformScript, sdk_UIButton as UIButton, sdk_UICard as UICard, sdk_UIElement as UIElement, sdk_UIIcon as UIIcon, sdk_UIImage as UIImage, sdk_UIOverlay as UIOverlay, sdk_UIPanel as UIPanel, sdk_UISlider as UISlider, sdk_UIText as UIText, sdk_UP as UP, sdk_User as User, sdk_VIEW_DEPTH_GAP as VIEW_DEPTH_GAP, sdk_VideoFileStream as VideoFileStream, sdk_VideoStream as VideoStream, sdk_VisibilityTransition as VisibilityTransition, sdk_VolumeCategory as VolumeCategory, sdk_WaitFrame as WaitFrame, sdk_WebXRHandContext as WebXRHandContext, sdk_WebXRHandPoseEstimator as WebXRHandPoseEstimator, sdk_World as World, sdk_WorldOptions as WorldOptions, sdk_XRButton as XRButton, sdk_XRDeviceCamera as XRDeviceCamera, sdk_XREffects as XREffects, sdk_XRPass as XRPass, sdk_XRReferenceSpaceCache as XRReferenceSpaceCache, sdk_XRTransitionOptions as XRTransitionOptions, sdk_XR_BLOCKS_ASSETS_PATH as XR_BLOCKS_ASSETS_PATH, sdk_ZERO_VECTOR3 as ZERO_VECTOR3, sdk_ZERO_VISEME as ZERO_VISEME, sdk__getBvhImportStatus as _getBvhImportStatus, sdk_add as add, sdk_ai as ai, sdk_anchorCapability as anchorCapability, sdk_applyBVH as applyBVH, sdk_applySimulatorHandPoseRotationConstraints as applySimulatorHandPoseRotationConstraints, sdk_average as average, sdk_callInitWithDependencyInjection as callInitWithDependencyInjection, sdk_camera as camera, sdk_clamp as clamp, sdk_clamp01 as clamp01, sdk_clampRotationToAngle as clampRotationToAngle, sdk_context as context, sdk_core as core, sdk_cropImage as cropImage, sdk_defaultAnchorStorageKey as defaultAnchorStorageKey, sdk_depth as depth, sdk_disposeBVH as disposeBVH, sdk_disposeMaterial as disposeMaterial, sdk_disposeMeshResources as disposeMeshResources, sdk_disposeObjectChildren as disposeObjectChildren, sdk_disposeObjectTree as disposeObjectTree, sdk_disposeRenderableResources as disposeRenderableResources, sdk_enableAcceleratedRaycast as enableAcceleratedRaycast, sdk_estimateHandScale as estimateHandScale, sdk_extractYaw as extractYaw, sdk_getAdjacentFingerSpreads as getAdjacentFingerSpreads, sdk_getBoneVectors as getBoneVectors, sdk_getCameraParametersSnapshot as getCameraParametersSnapshot, sdk_getColorHex as getColorHex, sdk_getDeltaTime as getDeltaTime, sdk_getDeviceCameraClipFromView as getDeviceCameraClipFromView, sdk_getDeviceCameraWorldFromClip as getDeviceCameraWorldFromClip, sdk_getDeviceCameraWorldFromView as getDeviceCameraWorldFromView, sdk_getElapsedTime as getElapsedTime, sdk_getFingerBendAngles as getFingerBendAngles, sdk_getFingerCurl as getFingerCurl, sdk_getFingerDirection as getFingerDirection, sdk_getFingerJoint as getFingerJoint, sdk_getFingerPalmAlignment as getFingerPalmAlignment, sdk_getFingerSpread as getFingerSpread, sdk_getFingerStraightness as getFingerStraightness, sdk_getFingertipDistance as getFingertipDistance, sdk_getFingertipPalmDistance as getFingertipPalmDistance, sdk_getObjectTargetPoint as getObjectTargetPoint, sdk_getPalmNormal as getPalmNormal, sdk_getPalmPose as getPalmPose, sdk_getPalmRight as getPalmRight, sdk_getPalmUp as getPalmUp, sdk_getPalmWidth as getPalmWidth, sdk_getRelativeBoneAngles as getRelativeBoneAngles, sdk_getThumbBendAngles as getThumbBendAngles, sdk_getThumbCurl as getThumbCurl, sdk_getThumbDirection as getThumbDirection, sdk_getThumbOpposition as getThumbOpposition, sdk_getThumbStraightness as getThumbStraightness, sdk_getThumbVerticalDirection as getThumbVerticalDirection, sdk_getUrlParamBool as getUrlParamBool, sdk_getUrlParamFloat as getUrlParamFloat, sdk_getUrlParamInt as getUrlParamInt, sdk_getUrlParameter as getUrlParameter, sdk_getVec4ByColorString as getVec4ByColorString, sdk_getXrCameraLeft as getXrCameraLeft, sdk_getXrCameraRight as getXrCameraRight, sdk_init as init, sdk_initScript as initScript, sdk_input as input, sdk_intrinsicsToProjectionMatrix as intrinsicsToProjectionMatrix, sdk_isBVHReady as isBVHReady, sdk_isDeviceCameraPoseAvailable as isDeviceCameraPoseAvailable, sdk_lerp as lerp, sdk_loadStereoImageAsTextures as loadStereoImageAsTextures, sdk_loadingSpinnerManager as loadingSpinnerManager, sdk_lookAtRotation as lookAtRotation, sdk_objectIsDescendantOf as objectIsDescendantOf, sdk_parseBase64DataURL as parseBase64DataURL, sdk_parseSimulatorHandPoseRotations as parseSimulatorHandPoseRotations, sdk_placeObjectAtIntersectionFacingTarget as placeObjectAtIntersectionFacingTarget, sdk_print as print, sdk_resolveSimulatorHandPoseRotations as resolveSimulatorHandPoseRotations, sdk_resolveSimulatorRotationsFromKeypoints as resolveSimulatorRotationsFromKeypoints, sdk_scene as scene, sdk_showOnlyInLeftEye as showOnlyInLeftEye, sdk_showOnlyInRightEye as showOnlyInRightEye, sdk_sound as sound, sdk_timer as timer, sdk_transformRgbUvToWorld as transformRgbUvToWorld, sdk_traverseUtil as traverseUtil, sdk_ui as ui, sdk_urlParams as urlParams, sdk_user as user, sdk_visualizeDepth as visualizeDepth, sdk_visualizeDepthMap as visualizeDepthMap, sdk_world as world, sdk_xrDepthMeshOptions as xrDepthMeshOptions, sdk_xrDepthMeshPhysicsOptions as xrDepthMeshPhysicsOptions, sdk_xrDepthMeshVisualizationOptions as xrDepthMeshVisualizationOptions, sdk_xrDeviceCameraEnvironmentContinuousOptions as xrDeviceCameraEnvironmentContinuousOptions, sdk_xrDeviceCameraEnvironmentOptions as xrDeviceCameraEnvironmentOptions, sdk_xrDeviceCameraUserContinuousOptions as xrDeviceCameraUserContinuousOptions, sdk_xrDeviceCameraUserOptions as xrDeviceCameraUserOptions };
  export type { sdk_AIModel as AIModel, sdk_AgentLifecycleCallbacks as AgentLifecycleCallbacks, sdk_AnchorCapability as AnchorCapability, sdk_AnchorRecord as AnchorRecord, sdk_AnchorRestoreResult as AnchorRestoreResult, sdk_AnchorRestoreStatus as AnchorRestoreStatus, sdk_AnchorStorageLike as AnchorStorageLike, sdk_AnchorStore as AnchorStore, sdk_AnchoredObjectFactory as AnchoredObjectFactory, sdk_AudioListenerOptions as AudioListenerOptions, sdk_AudioPlayerOptions as AudioPlayerOptions, sdk_AutomationModeOptions as AutomationModeOptions, sdk_BaseManipulationEvent as BaseManipulationEvent, sdk_CameraParametersSnapshot as CameraParametersSnapshot, sdk_CameraSnapshot as CameraSnapshot, sdk_ColorStop as ColorStop, sdk_Constructor as Constructor, sdk_CoreLifecycleState as CoreLifecycleState, sdk_DeepPartial as DeepPartial, sdk_DeepReadonly as DeepReadonly, sdk_DepthArray as DepthArray, sdk_DeviceCameraParameters as DeviceCameraParameters, sdk_DigitName as DigitName, sdk_FaceBlendshape as FaceBlendshape, sdk_FaceCameraMode as FaceCameraMode, sdk_FaceCameraOptions as FaceCameraOptions, sdk_FaceLandmark as FaceLandmark, sdk_FingerName as FingerName, sdk_FollowHeadOptions as FollowHeadOptions, sdk_FollowObjectMode as FollowObjectMode, sdk_FollowObjectOptions as FollowObjectOptions, sdk_FormFactor as FormFactor, sdk_GamepadAction as GamepadAction, sdk_GeminiQueryInput as GeminiQueryInput, sdk_GestureConfiguration as GestureConfiguration, sdk_GestureDetectionResult as GestureDetectionResult, sdk_GestureEvent as GestureEvent, sdk_GestureEventDetail as GestureEventDetail, sdk_GestureEventType as GestureEventType, sdk_GestureHandedness as GestureHandedness, sdk_GestureRecognizer as GestureRecognizer, sdk_GestureScoreMap as GestureScoreMap, sdk_GetWeatherArgs as GetWeatherArgs, sdk_GradientPaint as GradientPaint, sdk_GradientType as GradientType, sdk_HandContext as HandContext, sdk_HandLabel as HandLabel, sdk_HeadGestureConfiguration as HeadGestureConfiguration, sdk_HeadGestureContext as HeadGestureContext, sdk_HeadGestureDetectionResult as HeadGestureDetectionResult, sdk_HeadGestureEvent as HeadGestureEvent, sdk_HeadGestureEventDetail as HeadGestureEventDetail, sdk_HeadGestureEventMap as HeadGestureEventMap, sdk_HeadGestureRecognizer as HeadGestureRecognizer, sdk_HeadGestureScoreMap as HeadGestureScoreMap, sdk_HeadPoseSample as HeadPoseSample, sdk_HeuristicGestureDetector as HeuristicGestureDetector, sdk_HeuristicHeadGestureDetector as HeuristicHeadGestureDetector, sdk_HeuristicHeadGestureRecognizerOptions as HeuristicHeadGestureRecognizerOptions, sdk_HoverEvent as HoverEvent, sdk_Injectable as Injectable, sdk_InjectableConstructor as InjectableConstructor, sdk_InteractionSource as InteractionSource, sdk_InteractionSourceType as InteractionSourceType, sdk_JointName as JointName, sdk_JointPositions as JointPositions, sdk_KeyEvent as KeyEvent, sdk_KeysJson as KeysJson, sdk_LipMetrics as LipMetrics, sdk_LiveSessionState as LiveSessionState, sdk_LongSelectEvent as LongSelectEvent, sdk_ManipulationAction as ManipulationAction, sdk_ManipulationEvent as ManipulationEvent, sdk_ManipulationHandleOptions as ManipulationHandleOptions, sdk_ManipulationOptions as ManipulationOptions, sdk_ManipulationPhase as ManipulationPhase, sdk_MediaOrSimulatorMediaDeviceInfo as MediaOrSimulatorMediaDeviceInfo, sdk_MediaPipeHandLandmark as MediaPipeHandLandmark, sdk_ModelClass as ModelClass, sdk_ModelLoaderLoadGLTFOptions as ModelLoaderLoadGLTFOptions, sdk_ModelLoaderLoadOptions as ModelLoaderLoadOptions, sdk_ModelOptions as ModelOptions, sdk_ModelSource as ModelSource, sdk_ModelViewerOptions as ModelViewerOptions, sdk_ModelViewerOrigin as ModelViewerOrigin, sdk_NormalizedDetectedObject as NormalizedDetectedObject, sdk_ObjectGrabEvent as ObjectGrabEvent, sdk_ObjectTouchEvent as ObjectTouchEvent, sdk_ObjectTouchStartEvent as ObjectTouchStartEvent, sdk_OrbitDirection as OrbitDirection, sdk_OrbitFrame as OrbitFrame, sdk_OrbitOptions as OrbitOptions, sdk_OrbitPath as OrbitPath, sdk_Paint as Paint, sdk_PalmPose as PalmPose, sdk_PlayModelAnimationOptions as PlayModelAnimationOptions, sdk_PlaySoundOptions as PlaySoundOptions, sdk_PointerEvents as PointerEvents, sdk_PoseEstimator as PoseEstimator, sdk_PoseLandmark as PoseLandmark, sdk_QuatTuple as QuatTuple, sdk_RAPIERCompat as RAPIERCompat, sdk_RaycastMode as RaycastMode, sdk_ResolvedSimulatorSceneManifest as ResolvedSimulatorSceneManifest, sdk_ReticleMode as ReticleMode, sdk_RgbToDepthParams as RgbToDepthParams, sdk_RotateManipulationEvent as RotateManipulationEvent, sdk_RotateOptions as RotateOptions, sdk_ScaleManipulationEvent as ScaleManipulationEvent, sdk_ScaleOptions as ScaleOptions, sdk_SceneContextDetectionOptions as SceneContextDetectionOptions, sdk_SceneContextDetectionResult as SceneContextDetectionResult, sdk_ScriptsManagerEventMap as ScriptsManagerEventMap, sdk_SegmentationMask as SegmentationMask, sdk_SelectEndEvent as SelectEndEvent, sdk_SelectEvent as SelectEvent, sdk_SelectionEndReason as SelectionEndReason, sdk_SemanticBounds as SemanticBounds, sdk_SemanticMetadata as SemanticMetadata, sdk_SemanticNode as SemanticNode, sdk_SemanticSource as SemanticSource, sdk_SemanticTree as SemanticTree, sdk_SemanticViewData as SemanticViewData, sdk_SetOfMark as SetOfMark, sdk_SetOfMarkContext as SetOfMarkContext, sdk_Shader as Shader, sdk_ShaderUniforms as ShaderUniforms, sdk_SimulatorCustomInstruction as SimulatorCustomInstruction, sdk_SimulatorDetectedObjectInput as SimulatorDetectedObjectInput, sdk_SimulatorEnvironment as SimulatorEnvironment, sdk_SimulatorHandJointRotationArray as SimulatorHandJointRotationArray, sdk_SimulatorHandPhysicsOptions as SimulatorHandPhysicsOptions, sdk_SimulatorHandPoseJoints as SimulatorHandPoseJoints, sdk_SimulatorHandPoseRotationConstraintsDegrees as SimulatorHandPoseRotationConstraintsDegrees, sdk_SimulatorHandPoseRotationRangeDegrees as SimulatorHandPoseRotationRangeDegrees, sdk_SimulatorHandPoseRotations as SimulatorHandPoseRotations, sdk_SimulatorLocationDefinition as SimulatorLocationDefinition, sdk_SimulatorLocations as SimulatorLocations, sdk_SimulatorMesh as SimulatorMesh, sdk_SimulatorObject as SimulatorObject, sdk_SimulatorObjectDefinition as SimulatorObjectDefinition, sdk_SimulatorObjectDetectionSource as SimulatorObjectDetectionSource, sdk_SimulatorObjectUpdate as SimulatorObjectUpdate, sdk_SimulatorObjects as SimulatorObjects, sdk_SimulatorPhysicsMode as SimulatorPhysicsMode, sdk_SimulatorPlane as SimulatorPlane, sdk_SimulatorPlaneType as SimulatorPlaneType, sdk_SimulatorQuaternionTuple as SimulatorQuaternionTuple, sdk_SimulatorSceneManifest as SimulatorSceneManifest, sdk_SimulatorUserPath as SimulatorUserPath, sdk_SimulatorVector3Tuple as SimulatorVector3Tuple, sdk_SolidPaint as SolidPaint, sdk_StorablePose as StorablePose, sdk_StrokeEventMap as StrokeEventMap, sdk_StylizedFaceOptions as StylizedFaceOptions, sdk_ToolCall as ToolCall, sdk_ToolOptions as ToolOptions, sdk_ToolResult as ToolResult, sdk_ToolSchema as ToolSchema, sdk_TrackedAnchor as TrackedAnchor, sdk_TrackedAnchorLike as TrackedAnchorLike, sdk_TranslateManipulationEvent as TranslateManipulationEvent, sdk_TranslateOptions as TranslateOptions, sdk_UIAppearance as UIAppearance, sdk_UIButtonOptions as UIButtonOptions, sdk_UICardAnchorX as UICardAnchorX, sdk_UICardAnchorY as UICardAnchorY, sdk_UICardEdgeOptions as UICardEdgeOptions, sdk_UICardOptions as UICardOptions, sdk_UIColor as UIColor, sdk_UIElementOptions as UIElementOptions, sdk_UIIconOptions as UIIconOptions, sdk_UIIconVariant as UIIconVariant, sdk_UIIconWeight as UIIconWeight, sdk_UIImageOptions as UIImageOptions, sdk_UILineHeight as UILineHeight, sdk_UIOverlayOptions as UIOverlayOptions, sdk_UIPanelOptions as UIPanelOptions, sdk_UIPosition as UIPosition, sdk_UIResolvedSize as UIResolvedSize, sdk_UISize as UISize, sdk_UISliderOptions as UISliderOptions, sdk_UIStateStyle as UIStateStyle, sdk_UIStyle as UIStyle, sdk_UITextOptions as UITextOptions, sdk_UITheme as UITheme, sdk_UIThemeColors as UIThemeColors, sdk_UIThemePresetName as UIThemePresetName, sdk_UIThemeStyleRole as UIThemeStyleRole, sdk_UIThemeStyles as UIThemeStyles, sdk_UIThemeUpdate as UIThemeUpdate, sdk_UITransform as UITransform, sdk_UIUnit as UIUnit, sdk_UIValidationBounds as UIValidationBounds, sdk_UIValidationCode as UIValidationCode, sdk_UIValidationIssue as UIValidationIssue, sdk_UIValidationReport as UIValidationReport, sdk_UIVector2 as UIVector2, sdk_Vec2Tuple as Vec2Tuple, sdk_Vec3Tuple as Vec3Tuple, sdk_VideoFileStreamOptions as VideoFileStreamOptions, sdk_VideoStreamDetails as VideoStreamDetails, sdk_VideoStreamEventMap as VideoStreamEventMap, sdk_VideoStreamGetSnapshotBase64Options as VideoStreamGetSnapshotBase64Options, sdk_VideoStreamGetSnapshotBlobOptions as VideoStreamGetSnapshotBlobOptions, sdk_VideoStreamGetSnapshotImageDataOptions as VideoStreamGetSnapshotImageDataOptions, sdk_VideoStreamGetSnapshotOptions as VideoStreamGetSnapshotOptions, sdk_VideoStreamGetSnapshotTextureOptions as VideoStreamGetSnapshotTextureOptions, sdk_VideoStreamOptions as VideoStreamOptions, sdk_VisemeWeights as VisemeWeights, sdk_VisibilityTransitionOptions as VisibilityTransitionOptions, sdk_VisibleObjectsContext as VisibleObjectsContext, sdk_WeatherData as WeatherData, sdk_WebXRJointRotations as WebXRJointRotations, sdk_XBObjectOptions as XBObjectOptions };
}

declare global {
    interface Window {
        xb?: typeof sdk;
        xbReady?: Promise<void>;
    }
}

export { AI, AIOptions, ActiveControllers, Agent, AnchorManager, AnchoredObjects, AnchorsOptions, AudioListener, AudioPlayer, BACK, BackgroundMusic, CategoryVolumes, Context, ContextOptions, Core, CoreSound, DEFAULT_DEVICE_CAMERA_HEIGHT, DEFAULT_DEVICE_CAMERA_WIDTH, DEFAULT_RGB_TO_DEPTH_PARAMS, DEVICE_CAMERA_PARAMETERS, DOWN, Depth, DepthMesh, DepthMeshOptions, DepthOptions, DepthTextures, DetectedBodyPose, DetectedFace, DetectedMesh, DetectedObject, DetectedPlane, DeviceCameraOptions, FINGER_ORDER, FORWARD, FaceCamera, FaceLandmarkName, FaceRecognizer, FacesOptions, FollowHead, FollowObject, GEMINI_DEFAULT_FLASH_MODEL, GEMINI_DEFAULT_IMAGE_MODEL, GEMINI_DEFAULT_LIVE_MODEL, GamepadBindings, GamepadController, GazeController, Gemini, GeminiOptions, GenerateSkyboxTool, GestureRecognition, GestureRecognitionOptions, GetWeatherTool, HAND_BONE_IDX_CONNECTION_MAP, HAND_INDEX_TO_LABEL, HAND_JOINT_COUNT, HAND_JOINT_IDX_CONNECTION_MAP, HAND_JOINT_NAMES, Handedness, Hands, HandsOptions, HeadGestureRecognition, HeadGestureRecognitionOptions, HeuristicGestureRecognizer, HeuristicHeadGestureRecognizer, HumanRecognizer, HumansOptions, Input, InputOptions, Interaction, InteractionOptions, Keycodes, LEFT, LEFT_VIEW_ONLY_LAYER, Lighting, LightingOptions, LoadingSpinnerManager, LocalStorageAnchorStore, ManipulationAction, MediaPipeHandContext, MediaPipeHandPoseEstimator, MeshDetectionOptions, MeshDetector, MeshScript, ModelLoader, ModelViewer, MouseController, NUM_HANDS, OCCLUDABLE_ITEMS_LAYER, ObjectDetector, ObjectsOptions, OcclusionPass, OcclusionUtils, OpenAI, OpenAIOptions, Options, Orbit, Physics, PhysicsOptions, PlaneDetector, PlanesOptions, PoseJointName, RIGHT, RIGHT_VIEW_ONLY_LAYER, Registry, ReticleOptions, Reticles, SIMULATOR_HAND_COMMON_BIOMECHANICAL_CONSTRAINTS_DEGREES, SIMULATOR_HAND_POSE_NAMES, SIMULATOR_HAND_POSE_ROTATIONS, SOUND_PRESETS, SceneDetector, SceneOptions, SceneSetOfMarkOptions, SceneVisibilityOptions, ScreenshotSynthesizer, Script, ScriptMixin, ScriptsManager, ScriptsManagerEventType, SegmentCategory, SegmentationOptions, Segmenter, SetSimulatorEnvironmentEvent, SetSimulatorHandPhysicsEvent, SetSimulatorModeEvent, ShowSimulatorInstructionsEvent, Simulator, SimulatorAnchor, SimulatorCamera, SimulatorControlMode, SimulatorControllerState, SimulatorControls, SimulatorDepth, SimulatorDepthMaterial, SimulatorHandPose, SimulatorHandPoseChangeRequestEvent, SimulatorHands, SimulatorMediaDeviceInfo, SimulatorMode, SimulatorOptions, SimulatorPointerLockController, SimulatorScene, SimulatorUser, SkyboxAgent, SoundOptions, SoundSynthesizer, SparkRendererHolder, SpatialAudio, SpeechRecognizer, SpeechRecognizerOptions, SpeechSynthesizer, SpeechSynthesizerOptions, StreamState, StrokeRecognizer, StylizedFace, TensorFlowHandPoseEstimator, Tool, TransformScript, UIButton, UICard, UIElement, UIIcon, UIImage, UIOverlay, UIPanel, UISlider, UIText, UP, User, VIEW_DEPTH_GAP, VideoFileStream, VideoStream, VisibilityTransition, VolumeCategory, WaitFrame, WebXRHandContext, WebXRHandPoseEstimator, World, WorldOptions, XRButton, XRDeviceCamera, XREffects, XRPass, XRReferenceSpaceCache, XRTransitionOptions, XR_BLOCKS_ASSETS_PATH, ZERO_VECTOR3, ZERO_VISEME, _getBvhImportStatus, add, ai, anchorCapability, applyBVH, applySimulatorHandPoseRotationConstraints, average, callInitWithDependencyInjection, camera, clamp, clamp01, clampRotationToAngle, context, core, cropImage, defaultAnchorStorageKey, depth, disposeBVH, disposeMaterial, disposeMeshResources, disposeObjectChildren, disposeObjectTree, disposeRenderableResources, enableAcceleratedRaycast, estimateHandScale, extractYaw, getAdjacentFingerSpreads, getBoneVectors, getCameraParametersSnapshot, getColorHex, getDeltaTime, getDeviceCameraClipFromView, getDeviceCameraWorldFromClip, getDeviceCameraWorldFromView, getElapsedTime, getFingerBendAngles, getFingerCurl, getFingerDirection, getFingerJoint, getFingerPalmAlignment, getFingerSpread, getFingerStraightness, getFingertipDistance, getFingertipPalmDistance, getObjectTargetPoint, getPalmNormal, getPalmPose, getPalmRight, getPalmUp, getPalmWidth, getRelativeBoneAngles, getThumbBendAngles, getThumbCurl, getThumbDirection, getThumbOpposition, getThumbStraightness, getThumbVerticalDirection, getUrlParamBool, getUrlParamFloat, getUrlParamInt, getUrlParameter, getVec4ByColorString, getXrCameraLeft, getXrCameraRight, init, initScript, input, intrinsicsToProjectionMatrix, isBVHReady, isDeviceCameraPoseAvailable, lerp, loadStereoImageAsTextures, loadingSpinnerManager, lookAtRotation, objectIsDescendantOf, parseBase64DataURL, parseSimulatorHandPoseRotations, placeObjectAtIntersectionFacingTarget, print, resolveSimulatorHandPoseRotations, resolveSimulatorRotationsFromKeypoints, scene, showOnlyInLeftEye, showOnlyInRightEye, sound, timer, transformRgbUvToWorld, traverseUtil, ui, urlParams, user, visualizeDepth, visualizeDepthMap, world, xrDepthMeshOptions, xrDepthMeshPhysicsOptions, xrDepthMeshVisualizationOptions, xrDeviceCameraEnvironmentContinuousOptions, xrDeviceCameraEnvironmentOptions, xrDeviceCameraUserContinuousOptions, xrDeviceCameraUserOptions };
export type { AIModel, AgentLifecycleCallbacks, AnchorCapability, AnchorRecord, AnchorRestoreResult, AnchorRestoreStatus, AnchorStorageLike, AnchorStore, AnchoredObjectFactory, AudioListenerOptions, AudioPlayerOptions, AutomationModeOptions, BaseManipulationEvent, CameraParametersSnapshot, CameraSnapshot, ColorStop, Constructor, CoreLifecycleState, DeepPartial, DeepReadonly, DepthArray, DeviceCameraParameters, DigitName, FaceBlendshape, FaceCameraMode, FaceCameraOptions, FaceLandmark, FingerName, FollowHeadOptions, FollowObjectMode, FollowObjectOptions, FormFactor, GamepadAction, GeminiQueryInput, GestureConfiguration, GestureDetectionResult, GestureEvent, GestureEventDetail, GestureEventType, GestureHandedness, GestureRecognizer, GestureScoreMap, GetWeatherArgs, GradientPaint, GradientType, HandContext, HandLabel, HeadGestureConfiguration, HeadGestureContext, HeadGestureDetectionResult, HeadGestureEvent, HeadGestureEventDetail, HeadGestureEventMap, HeadGestureRecognizer, HeadGestureScoreMap, HeadPoseSample, HeuristicGestureDetector, HeuristicHeadGestureDetector, HeuristicHeadGestureRecognizerOptions, HoverEvent, Injectable, InjectableConstructor, InteractionSource, InteractionSourceType, JointName, JointPositions, KeyEvent, KeysJson, LipMetrics, LiveSessionState, LongSelectEvent, ManipulationEvent, ManipulationHandleOptions, ManipulationOptions, ManipulationPhase, MediaOrSimulatorMediaDeviceInfo, MediaPipeHandLandmark, ModelClass, ModelLoaderLoadGLTFOptions, ModelLoaderLoadOptions, ModelOptions, ModelSource, ModelViewerOptions, ModelViewerOrigin, NormalizedDetectedObject, ObjectGrabEvent, ObjectTouchEvent, ObjectTouchStartEvent, OrbitDirection, OrbitFrame, OrbitOptions, OrbitPath, Paint, PalmPose, PlayModelAnimationOptions, PlaySoundOptions, PointerEvents, PoseEstimator, PoseLandmark, QuatTuple, RAPIERCompat, RaycastMode, ResolvedSimulatorSceneManifest, ReticleMode, RgbToDepthParams, RotateManipulationEvent, RotateOptions, ScaleManipulationEvent, ScaleOptions, SceneContextDetectionOptions, SceneContextDetectionResult, ScriptsManagerEventMap, SegmentationMask, SelectEndEvent, SelectEvent, SelectionEndReason, SemanticBounds, SemanticMetadata, SemanticNode, SemanticSource, SemanticTree, SemanticViewData, SetOfMark, SetOfMarkContext, Shader, ShaderUniforms, SimulatorCustomInstruction, SimulatorDetectedObjectInput, SimulatorEnvironment, SimulatorHandJointRotationArray, SimulatorHandPhysicsOptions, SimulatorHandPoseJoints, SimulatorHandPoseRotationConstraintsDegrees, SimulatorHandPoseRotationRangeDegrees, SimulatorHandPoseRotations, SimulatorLocationDefinition, SimulatorLocations, SimulatorMesh, SimulatorObject, SimulatorObjectDefinition, SimulatorObjectDetectionSource, SimulatorObjectUpdate, SimulatorObjects, SimulatorPhysicsMode, SimulatorPlane, SimulatorPlaneType, SimulatorQuaternionTuple, SimulatorSceneManifest, SimulatorUserPath, SimulatorVector3Tuple, SolidPaint, StorablePose, StrokeEventMap, StylizedFaceOptions, ToolCall, ToolOptions, ToolResult, ToolSchema, TrackedAnchor, TrackedAnchorLike, TranslateManipulationEvent, TranslateOptions, UIAppearance, UIButtonOptions, UICardAnchorX, UICardAnchorY, UICardEdgeOptions, UICardOptions, UIColor, UIElementOptions, UIIconOptions, UIIconVariant, UIIconWeight, UIImageOptions, UILineHeight, UIOverlayOptions, UIPanelOptions, UIPosition, UIResolvedSize, UISize, UISliderOptions, UIStateStyle, UIStyle, UITextOptions, UITheme, UIThemeColors, UIThemePresetName, UIThemeStyleRole, UIThemeStyles, UIThemeUpdate, UITransform, UIUnit, UIValidationBounds, UIValidationCode, UIValidationIssue, UIValidationReport, UIVector2, Vec2Tuple, Vec3Tuple, VideoFileStreamOptions, VideoStreamDetails, VideoStreamEventMap, VideoStreamGetSnapshotBase64Options, VideoStreamGetSnapshotBlobOptions, VideoStreamGetSnapshotImageDataOptions, VideoStreamGetSnapshotOptions, VideoStreamGetSnapshotTextureOptions, VideoStreamOptions, VisemeWeights, VisibilityTransitionOptions, VisibleObjectsContext, WeatherData, WebXRJointRotations, XBObjectOptions };
