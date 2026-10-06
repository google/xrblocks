import * as THREE from "three";
import { Intersection, Object3D as Object3D$1, Sphere } from "three";
import { Pass } from "three/addons/postprocessing/Pass.js";
import { GLTF, GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { WebGPURenderer } from "three/webgpu";
import { effect } from "@preact/signals-core";
import * as GoogleGenAITypes from "@google/genai";
import RAPIER from "rapier3d";
import OpenAIType from "openai";
import { SparkRenderer } from "@sparkjsdev/spark";
//#region node_modules/@pmndrs/uikit/dist/events.d.ts
declare module 'three' {
  interface Object3DEventMap {
    childadded: {
      child: Object3D;
    };
    childremoved: {
      child: Object3D;
    };
    click: ThreeMouseEvent;
    contextmenu: ThreeMouseEvent;
    dblclick: ThreeMouseEvent;
    wheel: ThreeMouseEvent;
    pointerup: ThreePointerEvent;
    pointerdown: ThreePointerEvent;
    pointerover: ThreePointerEvent;
    pointerout: ThreePointerEvent;
    pointerenter: ThreePointerEvent;
    pointerleave: ThreePointerEvent;
    pointermove: ThreePointerEvent;
    pointercancel: ThreePointerEvent;
  }
}
type ThreeMouseEvent = Intersection & {
  nativeEvent?: unknown;
  stopPropagation?: () => void;
  stopImmediatePropagation?: () => void;
};
type ThreePointerEvent = ThreeMouseEvent & {
  pointerId?: number;
};
//#endregion
//#region node_modules/@pmndrs/uikit/dist/panel/interaction-panel-mesh.d.ts
type AllowedPointerEventsType = 'all' | ((poinerId: number, pointerType: string, pointerState: unknown) => boolean) | {
  allow: string | Array<string>;
} | {
  deny: string | Array<string>;
};
declare module 'three' {
  interface Object3D extends PointerEventsProperties {
    spherecast?(sphere: Sphere, intersects: Array<Intersection>): void;
    intersectChildren?: boolean;
    interactableDescendants?: Array<Object3D$1>;
    ancestorsHaveListeners?: boolean;
    defaultPointerEvents?: PointerEventsProperties['pointerEvents'];
  }
}
type PointerEventsProperties = {
  pointerEvents?: 'none' | 'auto' | 'listener';
  pointerEventsType?: AllowedPointerEventsType;
  pointerEventsOrder?: number;
};
//#endregion
//#region src/ai/AIOptions.d.ts
export declare const GEMINI_DEFAULT_FLASH_MODEL = "gemini-3.8-flash";
export declare const GEMINI_DEFAULT_LIVE_MODEL = "gemini-3.1-flash-live-preview";
export declare const GEMINI_DEFAULT_IMAGE_MODEL = "gemini-3.1-flash-image";
/**
 * Non-live configuration for the Gemini Interactions API
 * (`client.interactions.create`). `model` and `input` come from each query
 * and interactions always run statelessly (`store` is forced off), so
 * history/state parameters are not accepted here.
 */
export type GeminiInteractionConfig = Omit<GoogleGenAITypes.Interactions.CreateModelInteractionParamsNonStreaming, 'model' | 'input' | 'stream' | 'store' | 'previous_interaction_id'>;
export declare class GeminiOptions {
  apiKey: string;
  urlParam: string;
  keyValid: boolean;
  enabled: boolean;
  model: string;
  liveModel: string;
  config: GeminiInteractionConfig;
}
export declare class OpenAIOptions {
  apiKey: string;
  urlParam: string;
  model: string;
  enabled: boolean;
}
export type AIModel = 'gemini' | 'openai';
export declare class AIOptions {
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
//#endregion
//#region src/utils/Types.d.ts
/**
 * Misc collection of types not specific to any XR Blocks module.
 */
export type Constructor<T = object> = new (...args: any[]) => T;
export type ShaderUniforms = {
  [uniform: string]: THREE.IUniform;
};
/**
 * Defines the structure for a shader object compatible with PanelMesh,
 * requiring uniforms, a vertex shader, and a fragment shader.
 */
export interface Shader {
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
export type DeepReadonly<T> = T extends ((...args: any[]) => any) ? T : T extends object ? { readonly [P in keyof T]: DeepReadonly<T[P]>; } : T;
/**
 * A recursive partial type.
 */
export type DeepPartial<T> = T extends ((...args: any[]) => any) ? T : T extends object ? { [P in keyof T]?: DeepPartial<T[P]>; } : T;
//#endregion
//#region src/camera/CameraOptions.d.ts
/**
 * Parameters for RGB to depth UV mapping given different aspect ratios.
 * These parameters define the distortion model and affine transformations
 * required to align the RGB camera feed with the depth map.
 */
export interface RgbToDepthParams {
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
export declare const DEFAULT_RGB_TO_DEPTH_PARAMS: RgbToDepthParams;
/**
 * Configuration options for the device camera.
 */
export declare class DeviceCameraOptions {
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
export declare const xrDeviceCameraEnvironmentOptions: {
  readonly enabled: boolean;
  readonly videoConstraints?: {
    readonly aspectRatio?: number | {
      readonly exact?: number;
      readonly ideal?: number;
      readonly max?: number;
      readonly min?: number;
    } | undefined;
    readonly autoGainControl?: boolean | {
      readonly exact?: boolean;
      readonly ideal?: boolean;
    } | undefined;
    readonly backgroundBlur?: boolean | {
      readonly exact?: boolean;
      readonly ideal?: boolean;
    } | undefined;
    readonly channelCount?: number | {
      readonly exact?: number;
      readonly ideal?: number;
      readonly max?: number;
      readonly min?: number;
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
      readonly exact?: boolean | string;
      readonly ideal?: boolean | string;
    } | undefined;
    readonly facingMode?: string | readonly string[] | {
      readonly exact?: string | readonly string[] | undefined;
      readonly ideal?: string | readonly string[] | undefined;
    } | undefined;
    readonly frameRate?: number | {
      readonly exact?: number;
      readonly ideal?: number;
      readonly max?: number;
      readonly min?: number;
    } | undefined;
    readonly groupId?: string | readonly string[] | {
      readonly exact?: string | readonly string[] | undefined;
      readonly ideal?: string | readonly string[] | undefined;
    } | undefined;
    readonly height?: number | {
      readonly exact?: number;
      readonly ideal?: number;
      readonly max?: number;
      readonly min?: number;
    } | undefined;
    readonly noiseSuppression?: boolean | {
      readonly exact?: boolean;
      readonly ideal?: boolean;
    } | undefined;
    readonly sampleRate?: number | {
      readonly exact?: number;
      readonly ideal?: number;
      readonly max?: number;
      readonly min?: number;
    } | undefined;
    readonly sampleSize?: number | {
      readonly exact?: number;
      readonly ideal?: number;
      readonly max?: number;
      readonly min?: number;
    } | undefined;
    readonly width?: number | {
      readonly exact?: number;
      readonly ideal?: number;
      readonly max?: number;
      readonly min?: number;
    } | undefined;
    readonly advanced?: readonly {
      readonly aspectRatio?: number | {
        readonly exact?: number;
        readonly ideal?: number;
        readonly max?: number;
        readonly min?: number;
      } | undefined;
      readonly autoGainControl?: boolean | {
        readonly exact?: boolean;
        readonly ideal?: boolean;
      } | undefined;
      readonly backgroundBlur?: boolean | {
        readonly exact?: boolean;
        readonly ideal?: boolean;
      } | undefined;
      readonly channelCount?: number | {
        readonly exact?: number;
        readonly ideal?: number;
        readonly max?: number;
        readonly min?: number;
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
        readonly exact?: boolean | string;
        readonly ideal?: boolean | string;
      } | undefined;
      readonly facingMode?: string | readonly string[] | {
        readonly exact?: string | readonly string[] | undefined;
        readonly ideal?: string | readonly string[] | undefined;
      } | undefined;
      readonly frameRate?: number | {
        readonly exact?: number;
        readonly ideal?: number;
        readonly max?: number;
        readonly min?: number;
      } | undefined;
      readonly groupId?: string | readonly string[] | {
        readonly exact?: string | readonly string[] | undefined;
        readonly ideal?: string | readonly string[] | undefined;
      } | undefined;
      readonly height?: number | {
        readonly exact?: number;
        readonly ideal?: number;
        readonly max?: number;
        readonly min?: number;
      } | undefined;
      readonly noiseSuppression?: boolean | {
        readonly exact?: boolean;
        readonly ideal?: boolean;
      } | undefined;
      readonly sampleRate?: number | {
        readonly exact?: number;
        readonly ideal?: number;
        readonly max?: number;
        readonly min?: number;
      } | undefined;
      readonly sampleSize?: number | {
        readonly exact?: number;
        readonly ideal?: number;
        readonly max?: number;
        readonly min?: number;
      } | undefined;
      readonly width?: number | {
        readonly exact?: number;
        readonly ideal?: number;
        readonly max?: number;
        readonly min?: number;
      } | undefined;
    }[] | undefined;
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
  readonly cameraLabel?: string;
};
export declare const xrDeviceCameraUserOptions: {
  readonly enabled: boolean;
  readonly videoConstraints?: {
    readonly aspectRatio?: number | {
      readonly exact?: number;
      readonly ideal?: number;
      readonly max?: number;
      readonly min?: number;
    } | undefined;
    readonly autoGainControl?: boolean | {
      readonly exact?: boolean;
      readonly ideal?: boolean;
    } | undefined;
    readonly backgroundBlur?: boolean | {
      readonly exact?: boolean;
      readonly ideal?: boolean;
    } | undefined;
    readonly channelCount?: number | {
      readonly exact?: number;
      readonly ideal?: number;
      readonly max?: number;
      readonly min?: number;
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
      readonly exact?: boolean | string;
      readonly ideal?: boolean | string;
    } | undefined;
    readonly facingMode?: string | readonly string[] | {
      readonly exact?: string | readonly string[] | undefined;
      readonly ideal?: string | readonly string[] | undefined;
    } | undefined;
    readonly frameRate?: number | {
      readonly exact?: number;
      readonly ideal?: number;
      readonly max?: number;
      readonly min?: number;
    } | undefined;
    readonly groupId?: string | readonly string[] | {
      readonly exact?: string | readonly string[] | undefined;
      readonly ideal?: string | readonly string[] | undefined;
    } | undefined;
    readonly height?: number | {
      readonly exact?: number;
      readonly ideal?: number;
      readonly max?: number;
      readonly min?: number;
    } | undefined;
    readonly noiseSuppression?: boolean | {
      readonly exact?: boolean;
      readonly ideal?: boolean;
    } | undefined;
    readonly sampleRate?: number | {
      readonly exact?: number;
      readonly ideal?: number;
      readonly max?: number;
      readonly min?: number;
    } | undefined;
    readonly sampleSize?: number | {
      readonly exact?: number;
      readonly ideal?: number;
      readonly max?: number;
      readonly min?: number;
    } | undefined;
    readonly width?: number | {
      readonly exact?: number;
      readonly ideal?: number;
      readonly max?: number;
      readonly min?: number;
    } | undefined;
    readonly advanced?: readonly {
      readonly aspectRatio?: number | {
        readonly exact?: number;
        readonly ideal?: number;
        readonly max?: number;
        readonly min?: number;
      } | undefined;
      readonly autoGainControl?: boolean | {
        readonly exact?: boolean;
        readonly ideal?: boolean;
      } | undefined;
      readonly backgroundBlur?: boolean | {
        readonly exact?: boolean;
        readonly ideal?: boolean;
      } | undefined;
      readonly channelCount?: number | {
        readonly exact?: number;
        readonly ideal?: number;
        readonly max?: number;
        readonly min?: number;
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
        readonly exact?: boolean | string;
        readonly ideal?: boolean | string;
      } | undefined;
      readonly facingMode?: string | readonly string[] | {
        readonly exact?: string | readonly string[] | undefined;
        readonly ideal?: string | readonly string[] | undefined;
      } | undefined;
      readonly frameRate?: number | {
        readonly exact?: number;
        readonly ideal?: number;
        readonly max?: number;
        readonly min?: number;
      } | undefined;
      readonly groupId?: string | readonly string[] | {
        readonly exact?: string | readonly string[] | undefined;
        readonly ideal?: string | readonly string[] | undefined;
      } | undefined;
      readonly height?: number | {
        readonly exact?: number;
        readonly ideal?: number;
        readonly max?: number;
        readonly min?: number;
      } | undefined;
      readonly noiseSuppression?: boolean | {
        readonly exact?: boolean;
        readonly ideal?: boolean;
      } | undefined;
      readonly sampleRate?: number | {
        readonly exact?: number;
        readonly ideal?: number;
        readonly max?: number;
        readonly min?: number;
      } | undefined;
      readonly sampleSize?: number | {
        readonly exact?: number;
        readonly ideal?: number;
        readonly max?: number;
        readonly min?: number;
      } | undefined;
      readonly width?: number | {
        readonly exact?: number;
        readonly ideal?: number;
        readonly max?: number;
        readonly min?: number;
      } | undefined;
    }[] | undefined;
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
  readonly cameraLabel?: string;
};
export declare const xrDeviceCameraEnvironmentContinuousOptions: {
  readonly enabled: boolean;
  readonly videoConstraints?: {
    readonly aspectRatio?: number | {
      readonly exact?: number;
      readonly ideal?: number;
      readonly max?: number;
      readonly min?: number;
    } | undefined;
    readonly autoGainControl?: boolean | {
      readonly exact?: boolean;
      readonly ideal?: boolean;
    } | undefined;
    readonly backgroundBlur?: boolean | {
      readonly exact?: boolean;
      readonly ideal?: boolean;
    } | undefined;
    readonly channelCount?: number | {
      readonly exact?: number;
      readonly ideal?: number;
      readonly max?: number;
      readonly min?: number;
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
      readonly exact?: boolean | string;
      readonly ideal?: boolean | string;
    } | undefined;
    readonly facingMode?: string | readonly string[] | {
      readonly exact?: string | readonly string[] | undefined;
      readonly ideal?: string | readonly string[] | undefined;
    } | undefined;
    readonly frameRate?: number | {
      readonly exact?: number;
      readonly ideal?: number;
      readonly max?: number;
      readonly min?: number;
    } | undefined;
    readonly groupId?: string | readonly string[] | {
      readonly exact?: string | readonly string[] | undefined;
      readonly ideal?: string | readonly string[] | undefined;
    } | undefined;
    readonly height?: number | {
      readonly exact?: number;
      readonly ideal?: number;
      readonly max?: number;
      readonly min?: number;
    } | undefined;
    readonly noiseSuppression?: boolean | {
      readonly exact?: boolean;
      readonly ideal?: boolean;
    } | undefined;
    readonly sampleRate?: number | {
      readonly exact?: number;
      readonly ideal?: number;
      readonly max?: number;
      readonly min?: number;
    } | undefined;
    readonly sampleSize?: number | {
      readonly exact?: number;
      readonly ideal?: number;
      readonly max?: number;
      readonly min?: number;
    } | undefined;
    readonly width?: number | {
      readonly exact?: number;
      readonly ideal?: number;
      readonly max?: number;
      readonly min?: number;
    } | undefined;
    readonly advanced?: readonly {
      readonly aspectRatio?: number | {
        readonly exact?: number;
        readonly ideal?: number;
        readonly max?: number;
        readonly min?: number;
      } | undefined;
      readonly autoGainControl?: boolean | {
        readonly exact?: boolean;
        readonly ideal?: boolean;
      } | undefined;
      readonly backgroundBlur?: boolean | {
        readonly exact?: boolean;
        readonly ideal?: boolean;
      } | undefined;
      readonly channelCount?: number | {
        readonly exact?: number;
        readonly ideal?: number;
        readonly max?: number;
        readonly min?: number;
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
        readonly exact?: boolean | string;
        readonly ideal?: boolean | string;
      } | undefined;
      readonly facingMode?: string | readonly string[] | {
        readonly exact?: string | readonly string[] | undefined;
        readonly ideal?: string | readonly string[] | undefined;
      } | undefined;
      readonly frameRate?: number | {
        readonly exact?: number;
        readonly ideal?: number;
        readonly max?: number;
        readonly min?: number;
      } | undefined;
      readonly groupId?: string | readonly string[] | {
        readonly exact?: string | readonly string[] | undefined;
        readonly ideal?: string | readonly string[] | undefined;
      } | undefined;
      readonly height?: number | {
        readonly exact?: number;
        readonly ideal?: number;
        readonly max?: number;
        readonly min?: number;
      } | undefined;
      readonly noiseSuppression?: boolean | {
        readonly exact?: boolean;
        readonly ideal?: boolean;
      } | undefined;
      readonly sampleRate?: number | {
        readonly exact?: number;
        readonly ideal?: number;
        readonly max?: number;
        readonly min?: number;
      } | undefined;
      readonly sampleSize?: number | {
        readonly exact?: number;
        readonly ideal?: number;
        readonly max?: number;
        readonly min?: number;
      } | undefined;
      readonly width?: number | {
        readonly exact?: number;
        readonly ideal?: number;
        readonly max?: number;
        readonly min?: number;
      } | undefined;
    }[] | undefined;
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
  readonly cameraLabel?: string;
};
export declare const xrDeviceCameraUserContinuousOptions: {
  readonly enabled: boolean;
  readonly videoConstraints?: {
    readonly aspectRatio?: number | {
      readonly exact?: number;
      readonly ideal?: number;
      readonly max?: number;
      readonly min?: number;
    } | undefined;
    readonly autoGainControl?: boolean | {
      readonly exact?: boolean;
      readonly ideal?: boolean;
    } | undefined;
    readonly backgroundBlur?: boolean | {
      readonly exact?: boolean;
      readonly ideal?: boolean;
    } | undefined;
    readonly channelCount?: number | {
      readonly exact?: number;
      readonly ideal?: number;
      readonly max?: number;
      readonly min?: number;
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
      readonly exact?: boolean | string;
      readonly ideal?: boolean | string;
    } | undefined;
    readonly facingMode?: string | readonly string[] | {
      readonly exact?: string | readonly string[] | undefined;
      readonly ideal?: string | readonly string[] | undefined;
    } | undefined;
    readonly frameRate?: number | {
      readonly exact?: number;
      readonly ideal?: number;
      readonly max?: number;
      readonly min?: number;
    } | undefined;
    readonly groupId?: string | readonly string[] | {
      readonly exact?: string | readonly string[] | undefined;
      readonly ideal?: string | readonly string[] | undefined;
    } | undefined;
    readonly height?: number | {
      readonly exact?: number;
      readonly ideal?: number;
      readonly max?: number;
      readonly min?: number;
    } | undefined;
    readonly noiseSuppression?: boolean | {
      readonly exact?: boolean;
      readonly ideal?: boolean;
    } | undefined;
    readonly sampleRate?: number | {
      readonly exact?: number;
      readonly ideal?: number;
      readonly max?: number;
      readonly min?: number;
    } | undefined;
    readonly sampleSize?: number | {
      readonly exact?: number;
      readonly ideal?: number;
      readonly max?: number;
      readonly min?: number;
    } | undefined;
    readonly width?: number | {
      readonly exact?: number;
      readonly ideal?: number;
      readonly max?: number;
      readonly min?: number;
    } | undefined;
    readonly advanced?: readonly {
      readonly aspectRatio?: number | {
        readonly exact?: number;
        readonly ideal?: number;
        readonly max?: number;
        readonly min?: number;
      } | undefined;
      readonly autoGainControl?: boolean | {
        readonly exact?: boolean;
        readonly ideal?: boolean;
      } | undefined;
      readonly backgroundBlur?: boolean | {
        readonly exact?: boolean;
        readonly ideal?: boolean;
      } | undefined;
      readonly channelCount?: number | {
        readonly exact?: number;
        readonly ideal?: number;
        readonly max?: number;
        readonly min?: number;
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
        readonly exact?: boolean | string;
        readonly ideal?: boolean | string;
      } | undefined;
      readonly facingMode?: string | readonly string[] | {
        readonly exact?: string | readonly string[] | undefined;
        readonly ideal?: string | readonly string[] | undefined;
      } | undefined;
      readonly frameRate?: number | {
        readonly exact?: number;
        readonly ideal?: number;
        readonly max?: number;
        readonly min?: number;
      } | undefined;
      readonly groupId?: string | readonly string[] | {
        readonly exact?: string | readonly string[] | undefined;
        readonly ideal?: string | readonly string[] | undefined;
      } | undefined;
      readonly height?: number | {
        readonly exact?: number;
        readonly ideal?: number;
        readonly max?: number;
        readonly min?: number;
      } | undefined;
      readonly noiseSuppression?: boolean | {
        readonly exact?: boolean;
        readonly ideal?: boolean;
      } | undefined;
      readonly sampleRate?: number | {
        readonly exact?: number;
        readonly ideal?: number;
        readonly max?: number;
        readonly min?: number;
      } | undefined;
      readonly sampleSize?: number | {
        readonly exact?: number;
        readonly ideal?: number;
        readonly max?: number;
        readonly min?: number;
      } | undefined;
      readonly width?: number | {
        readonly exact?: number;
        readonly ideal?: number;
        readonly max?: number;
        readonly min?: number;
      } | undefined;
    }[] | undefined;
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
  readonly cameraLabel?: string;
};
//#endregion
//#region src/context/scene/SceneOptions.d.ts
declare class SceneDerivedContextOptions {
  enabled: boolean;
  constructor(options?: DeepPartial<SceneDerivedContextOptions>);
  enable(): this;
}
export declare class SceneVisibilityOptions extends SceneDerivedContextOptions {
  /**
   * Raycast hits on materials with effective opacity less than or equal to this
   * threshold are ignored for line-of-sight occlusion.
   */
  occlusionOpacityThreshold: number;
}
export declare class SceneSetOfMarkOptions extends SceneDerivedContextOptions {}
export declare class SceneOptions {
  enabled: boolean;
  pollingIntervalMs: number;
  visibleObjects: SceneVisibilityOptions;
  som: SceneSetOfMarkOptions;
  constructor(options?: DeepPartial<SceneOptions>);
  enable(): this;
  enableVisibleObjects(): this;
  enableSetOfMark(): this;
}
//#endregion
//#region src/context/ContextOptions.d.ts
export declare class ContextOptions {
  debugging: boolean;
  enabled: boolean;
  scene: SceneOptions;
  constructor(options?: DeepPartial<ContextOptions>);
  enable(): this;
  enableScene(): this;
  enableVisibleObjects(): this;
  enableSetOfMark(): this;
}
//#endregion
//#region src/depth/DepthOptions.d.ts
export declare class DepthMeshOptions {
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
export declare class DepthOptions {
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
export declare const xrDepthMeshOptions: {
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
    enabled: boolean;
    constantKernel: boolean;
    applyGaussianBlur: boolean;
    applyKawaseBlur: boolean;
  };
  readonly occlusion: {
    enabled: boolean;
  };
  readonly usagePreference: readonly XRDepthUsage[];
  readonly dataFormatPreference: readonly XRDepthDataFormat[];
  readonly depthTypeRequest: readonly XRDepthType[];
  readonly matchDepthView: boolean;
};
export declare const xrDepthMeshVisualizationOptions: {
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
    enabled: boolean;
    constantKernel: boolean;
    applyGaussianBlur: boolean;
    applyKawaseBlur: boolean;
  };
  readonly occlusion: {
    enabled: boolean;
  };
  readonly usagePreference: readonly XRDepthUsage[];
  readonly dataFormatPreference: readonly XRDepthDataFormat[];
  readonly depthTypeRequest: readonly XRDepthType[];
  readonly matchDepthView: boolean;
};
export declare const xrDepthMeshPhysicsOptions: {
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
    enabled: boolean;
    constantKernel: boolean;
    applyGaussianBlur: boolean;
    applyKawaseBlur: boolean;
  };
  readonly occlusion: {
    enabled: boolean;
  };
  readonly usagePreference: readonly XRDepthUsage[];
  readonly dataFormatPreference: readonly XRDepthDataFormat[];
  readonly depthTypeRequest: readonly XRDepthType[];
  readonly matchDepthView: boolean;
};
//#endregion
//#region src/input/HandsOptions.d.ts
export declare class HandsOptions {
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
//#endregion
//#region src/layers/LayersOptions.d.ts
/**
 * Options for WebXR composition layers.
 *
 * Off by default. Layers are an optional session feature and the layer types
 * an app would want are newer than the SDK's baseline browser, so asking for
 * them unconditionally would mean every app pays for a capability most do not
 * use.
 */
export declare class LayersOptions {
  /** Whether to request the `layers` session feature. */
  enabled: boolean;
  /**
   * Whether a video shown through {@link VideoView} should be presented as a
   * composition layer when the platform allows it.
   *
   * Falls back to rendering into the scene as a texture when it cannot, so an
   * app can leave this on and still work everywhere.
   */
  video: boolean;
}
//#endregion
//#region src/input/components/HandJointNames.d.ts
export declare const HAND_JOINT_NAMES: readonly ['wrist', 'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip', 'index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip', 'middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip', 'ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip', 'pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip'];
//#endregion
//#region src/input/Hands.d.ts
export type JointName = (typeof HAND_JOINT_NAMES)[number];
/**
 * Utility class for managing WebXR hand tracking data based on
 * reported Handedness.
 */
/**
 * Enum for handedness, using WebXR standard strings.
 */
export declare enum Handedness {
  NONE = -1 // Represents unknown or unspecified handedness
  ,
  LEFT = 0,
  RIGHT = 1
}
/**
 * Represents and provides access to WebXR hand tracking data.
 * Uses the 'handedness' property of input hands for identification.
 */
export declare class Hands {
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
//#endregion
//#region src/interaction/reticle/Reticle.d.ts
interface ReticleUniforms {
  [uniform: string]: THREE.IUniform;
  uColor: THREE.IUniform<THREE.Color>;
  uPressed: THREE.IUniform<number>;
}
/**
 * A 3D visual marker used to indicate a user's aim or interaction
 * point in an XR scene. It orients itself to surfaces it intersects with and
 * provides visual feedback for states like "pressed".
 */
declare class Reticle extends THREE.Mesh<THREE.BufferGeometry, THREE.Material> {
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
  /** The uniforms driving this reticle's material. */
  readonly uniforms: ReticleUniforms;
  /** Whether depth test was requested for this reticle. */
  readonly depthTestEnabled: boolean;
  private syncUniforms?;
  /** Ring shown when the reticle is over an interactable object. */
  private readonly hoverRing;
  private readonly originalNormal;
  private readonly newRotation;
  private readonly objectRotation;
  private readonly normalVector;
  /**
   * Creates an instance of Reticle.
   * @param innerRadius - Inner radius of the reticle ring geometry.
   * @param outerRadius - Outer radius of the reticle ring geometry.
   * @param depthTest - Determines if the reticle should be occluded by other
   * objects. Defaults to `false` to ensure it is always visible.
   */
  constructor(innerRadius?: number, outerRadius?: number, depthTest?: boolean);
  /**
   * Replaces the reticle's primary material (e.g. with a WebGPU NodeMaterial)
   * and registers a callback to synchronize uniform changes.
   */
  setCustomMaterial(material: THREE.Material, syncUniforms?: () => void): void;
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
//#endregion
//#region src/input/Controller.d.ts
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
//#endregion
//#region src/core/RendererTypes.d.ts
/**
 * Union type representing either a THREE.WebGLRenderer or a THREE.WebGPURenderer.
 */
type WebGLOrWebGPURenderer = THREE.WebGLRenderer | WebGPURenderer;
/**
 * Type guard to determine if a renderer instance is a THREE.WebGPURenderer.
 *
 * @param renderer - The renderer instance to test.
 * @returns True if the renderer is a WebGPURenderer, false otherwise.
 */
export declare function isWebGPURenderer(renderer?: unknown): renderer is WebGPURenderer;
/**
 * Asserts that the provided renderer is a THREE.WebGLRenderer.
 *
 * @param renderer - The renderer instance to check.
 * @param consumerName - The name of the subsystem or feature requiring WebGLRenderer.
 * @throws Error if the renderer is a WebGPURenderer.
 */
export declare function assertWebGLRenderer(renderer: WebGLOrWebGPURenderer | undefined, consumerName: string): asserts renderer is THREE.WebGLRenderer;
/**
 * Dependency injection holder for the active Three.js renderer (`WebGLRenderer`
 * or `WebGPURenderer`), allowing scripts to request the renderer via `Registry`
 * in O(1) time without statically importing `three/webgpu`.
 */
declare class RendererHolder {
  readonly renderer: WebGLOrWebGPURenderer;
  constructor(renderer: WebGLOrWebGPURenderer);
}
//#endregion
//#region src/input/GamepadBindings.d.ts
export type GamepadAction = 'select' | 'cycleHandPoseLeft' | 'cycleHandPoseRight' | 'cycleSimulatorMode' | 'toggleUI' | 'toggleHand' | 'moveDown' | 'moveUp' | 'openSettings';
/**
 * Manages gamepad button-to-action mappings with localStorage persistence.
 * One button per action — assigning a button removes it from any previous action.
 */
export declare class GamepadBindings {
  private bindings;
  constructor();
  getBinding(action: GamepadAction): number;
  getAllBindings(): Record<GamepadAction, number>;
  setBinding(action: GamepadAction, buttonIndex: number): void;
  resetDefaults(): void;
  private load;
  private save;
}
//#endregion
//#region src/input/GamepadController.d.ts
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
export declare class GamepadController extends Script<GamepadControllerEventMap> implements Controller {
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
//#endregion
//#region src/input/GazeController.d.ts
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
export declare class GazeController extends Script<GazeControllerEventMap> implements Controller {
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
//#endregion
//#region src/input/headGestures/HeadGestureEvents.d.ts
export type HeadGestureEventDetail = {
  name: string;
  confidence: number;
  data?: Record<string, unknown>;
};
export type HeadGestureEvent = THREE.Event & {
  type: 'gesture';
  target: HeadGestureRecognition;
  detail: HeadGestureEventDetail;
};
export interface HeadGestureEventMap extends THREE.Object3DEventMap {
  gesture: HeadGestureEvent;
}
//#endregion
//#region src/input/headGestures/HeadGestureTypes.d.ts
export type HeadGestureConfiguration = {
  enabled: boolean;
  /** Detector-specific sensitivity. Built-in heuristics interpret this as radians. */
  threshold?: number;
};
export type HeadPoseSample = {
  timestamp: number;
  position: THREE.Vector3;
  orientation: THREE.Quaternion;
};
export interface HeadGestureContext {
  readonly samples: readonly HeadPoseSample[];
}
export type HeadGestureDetectionResult = {
  confidence: number;
  data?: Record<string, unknown>;
};
export type HeadGestureScoreMap = Record<string, HeadGestureDetectionResult | undefined>;
export type HeuristicHeadGestureDetector = (context: HeadGestureContext, config: HeadGestureConfiguration) => HeadGestureDetectionResult | undefined;
export interface HeadGestureRecognizer {
  init?(): Promise<void>;
  recognize(context: HeadGestureContext): HeadGestureScoreMap | Promise<HeadGestureScoreMap>;
  getGestureConfigurations?(): Record<string, HeadGestureConfiguration>;
  setGestureConfig?(name: string, config: HeadGestureConfiguration): void;
  dispose?(): void;
}
//#endregion
//#region src/input/headGestures/HeadGestureRecognitionOptions.d.ts
export declare class HeadGestureRecognitionOptions {
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
//#endregion
//#region src/input/headGestures/HeadGestureRecognition.d.ts
export declare class HeadGestureRecognition extends Script<HeadGestureEventMap> {
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
  init({ camera, options }: {
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
//#endregion
//#region src/input/MouseController.d.ts
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
export declare class MouseController extends Script<MouseControllerEventMap> implements Controller {
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
//#endregion
//#region src/core/components/XRSystems.d.ts
/**
 * A node to hold all XR Blocks Systems.
 */
declare class XRSystems extends THREE.Group {
  type: string;
  name: string;
}
//#endregion
//#region src/input/Input.d.ts
export declare class ActiveControllers extends THREE.Group {
  type: string;
  name: string;
}
export declare class Reticles extends THREE.Group {
  type: string;
  name: string;
}
/**
 * Holds physical input sources and samples their current state each frame.
 */
export declare class Input {
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
  private reticleConfigurer?;
  private readonly raySourceInputs;
  private readonly raySourceSlots;
  private readonly directTouchInputs;
  private readonly directTouchSlots;
  private readonly interactionFrame;
  /**
   * Initializes physical input sources. Only called by Core.
   */
  init({ systemsGroup, options, renderer }: {
    systemsGroup: XRSystems;
    options: Options;
    renderer: WebGLOrWebGPURenderer;
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
   * Sets a configuration callback for reticles (such as upgrading to WebGPU materials)
   * and immediately applies it to all existing reticles.
   */
  setReticleConfigurer(configurer: (reticle: Reticle) => void): void;
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
//#endregion
//#region src/interaction/HitRegistry.d.ts
interface HitSurfaceOptions {
  /** Additional clipping or containment policy, evaluated in world space. */
  containsPoint?: (point: THREE.Vector3, padding?: number) => boolean;
  /**
   * Direct touch only. Returns an object that should receive a touch at the
   * world-space `point` instead of this surface, such as a resize corner of a
   * card edge, or undefined to keep this surface. The returned object must be
   * registered with its own hit surface, which supplies its logical target
   * and manipulation handle; an unregistered object resolves as itself.
   */
  touchTarget?: (point: THREE.Vector3) => THREE.Object3D | undefined;
}
//#endregion
//#region src/interaction/Interaction.d.ts
/** Owns all logical target, hover, capture, completion, and cancellation state. */
export declare class Interaction {
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
  private readonly wheelIntents;
  private focusHandler?;
  private raycastMode;
  private frameSources;
  private nextFrameSources;
  constructor(dependencies: InteractionDependencies);
  setLongSelectDuration(seconds: number): void;
  setRaycastMode(mode: RaycastMode): void;
  /** Replaces all sampled physical interaction state for one engine frame. */
  update(frame: InteractionFrameInput, deltaSeconds?: number): void;
  clear(): void;
  registerHitSurface(physical: THREE.Object3D, logical: THREE.Object3D, options?: HitSurfaceOptions): () => void;
  /** Installs the UI runtime's focus policy without owning a second input path. */
  setSelectionFocusHandler(handler?: (target?: THREE.Object3D) => void): void;
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
  /** Routes a normalized wheel delta using the next frame's resolved target. */
  queueWheelIntent(controller: Controller, delta: number): boolean;
  private applyWheelIntent;
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
  private createScrollCapture;
  private activateScrollCapture;
  private updateScrollCapture;
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
//#endregion
//#region src/core/User.d.ts
/**
 * User is an embodied instance to manage hands, controllers, speech, and
 * avatars. It extends Script to update human-world interaction.
 *
 * In the long run, User is to manages avatars, hands, and everything of Human
 * I/O. In third-person view simulation, it should come with an low-poly avatar.
 * To support multi-user social XR planned for future iterations.
 */
export declare class User extends Script {
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
//#endregion
//#region src/input/gestures/GestureTypes.d.ts
export type HandLabel = 'left' | 'right';
export declare const HAND_INDEX_TO_LABEL: Partial<Record<Handedness, HandLabel>>;
export type JointPositions = Map<JointName, THREE.Vector3>;
export interface HandContext {
  handedness: Handedness;
  handLabel: HandLabel;
  joints: JointPositions;
  getJoint(jointName: JointName): THREE.Vector3 | undefined;
}
export type GestureDetectionResult = {
  confidence: number;
  data?: Record<string, unknown>;
};
export type GestureScoreMap = Record<string, GestureDetectionResult | undefined>;
export type HeuristicGestureDetector = (context: HandContext, config: GestureConfiguration) => GestureDetectionResult | undefined;
export interface GestureRecognizer {
  init?(): Promise<void>;
  recognize(context: HandContext): GestureScoreMap | Promise<GestureScoreMap>;
  getGestureConfigurations?(): Record<string, GestureConfiguration>;
  dispose?(): void;
}
export interface PoseEstimator {
  init?(dependencies?: {
    user?: User;
  }): Promise<void>;
  getHandContext(handedness: Handedness): HandContext | null;
  getHandContexts(): Partial<Record<HandLabel, HandContext>>;
  dispose?(): void;
}
//#endregion
//#region src/input/gestures/GestureRecognitionOptions.d.ts
export type GestureConfiguration = {
  enabled: boolean;
  threshold?: number;
};
export declare class GestureRecognitionOptions {
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
//#endregion
//#region src/input/strokes/StrokeRecognitionOptions.d.ts
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
//#endregion
//#region src/lighting/LightingOptions.d.ts
/**
 * Default options for controlling Lighting module features.
 */
export declare class LightingOptions {
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
//#endregion
//#region src/physics/PhysicsOptions.d.ts
export type RAPIERCompat = typeof RAPIER & {
  init?: () => Promise<void>;
};
export declare class PhysicsOptions {
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
//#endregion
//#region src/utils/Keycodes.d.ts
/**
 * A frozen object containing standardized string values for `event.code`.
 * Used for desktop simulation.
 */
export declare enum Keycodes {
  W_CODE = "KeyW",
  A_CODE = "KeyA",
  S_CODE = "KeyS",
  D_CODE = "KeyD",
  UP = "ArrowUp",
  DOWN = "ArrowDown",
  LEFT = "ArrowLeft",
  RIGHT = "ArrowRight",
  Q_CODE = "KeyQ" // Often used for 'down' or 'strafe left'
  ,
  E_CODE = "KeyE" // Often used for 'up' or 'strafe right'
  ,
  PAGE_UP = "PageUp",
  PAGE_DOWN = "PageDown",
  SPACE_CODE = "Space",
  ENTER_CODE = "Enter",
  T_CODE = "KeyT" // General purpose 'toggle' or 'tool' key
  ,
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
//#endregion
//#region src/simulator/SimulatorOptions.d.ts
export declare enum SimulatorMode {
  USER = "User",
  POSE = "Navigation",
  CONTROLLER = "Hands",
  POINTER_LOCK = "PointerLock",
  EDITOR = "Editor"
}
export interface SimulatorCustomInstruction {
  header: string;
  videoSrc?: string;
  description: string;
}
export interface SimulatorEnvironment {
  /** Optional display name; otherwise the manifest name is used. */
  name?: string;
  manifestPath: string;
}
export interface SimulatorHandPhysicsOptions {
  enabled: boolean;
  radius: number;
  mass: number;
  contactOffset: number;
  friction: number;
  restitution: number;
}
export declare class SimulatorOptions {
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
//#endregion
//#region src/sound/SoundOptions.d.ts
export declare class SpeechSynthesizerOptions {
  enabled: boolean;
  /** If true, a new call to speak() will interrupt any ongoing speech. */
  allowInterruptions: boolean;
}
export declare class SpeechRecognizerOptions {
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
export declare class SoundOptions {
  speechSynthesizer: SpeechSynthesizerOptions;
  speechRecognizer: SpeechRecognizerOptions;
}
//#endregion
//#region src/world/mesh/MeshDetectionOptions.d.ts
export declare class MeshDetectionOptions {
  showDebugVisualizations: boolean;
  enabled: boolean;
  constructor(options?: DeepPartial<MeshDetectionOptions>);
  /**
   * Enables the mesh detector.
   */
  enable(): this;
}
//#endregion
//#region src/world/objects/ObjectsOptions.d.ts
/**
 * Configuration options for the ObjectDetector.
 */
export declare class ObjectsOptions {
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
    activeBackend: 'gemini' | 'mediapipe';
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
//#endregion
//#region src/world/planes/PlanesOptions.d.ts
export declare class PlanesOptions {
  debugging: boolean;
  enabled: boolean;
  showDebugVisualizations: boolean;
  constructor(options?: DeepPartial<PlanesOptions>);
  enable(): this;
}
//#endregion
//#region src/world/sounds/SoundsOptions.d.ts
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
//#endregion
//#region src/world/humans/HumansOptions.d.ts
/**
 * Configuration options for the Human Pose Detection system.
 */
export declare class HumansOptions {
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
//#endregion
//#region src/world/faces/FacesOptions.d.ts
/**
 * Configuration options for the Face Landmark Detection system.
 */
export declare class FacesOptions {
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
//#endregion
//#region src/world/segmentation/SegmentationOptions.d.ts
/**
 * Configuration options for the semantic segmentation system. Mirrors the
 * other `world/*` perception options (humans, faces, objects).
 */
export declare class SegmentationOptions {
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
//#endregion
//#region src/world/anchors/AnchorsOptions.d.ts
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
export declare function defaultAnchorStorageKey(pathname?: string): string;
/**
 * Configuration for the spatial anchor subsystem.
 *
 * Anchors pin content to a real place so the platform keeps it there as its
 * understanding of the room improves. With {@link AnchorsOptions.persistent}
 * enabled, anchor handles are saved so the same content can be restored in a
 * later session.
 */
export declare class AnchorsOptions {
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
//#endregion
//#region src/world/WorldOptions.d.ts
export declare class WorldOptions {
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
//#endregion
//#region src/core/Options.d.ts
/**
 * Default options for XR controllers, which encompass hands by default in
 * Android XR, mouse input on desktop, tracked controllers, and gamepads.
 */
export declare class InputOptions {
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
export declare class ReticleOptions {
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
export type RaycastMode = 'continuous' | 'select';
export declare class InteractionOptions {
  /** When to sample ray intersections for interaction. */
  raycastMode: RaycastMode;
  /** Seconds a stable object selection must be held before long-select. */
  longSelectDuration: number;
}
/**
 * Options for the XR transition effect.
 */
export declare class XRTransitionOptions {
  /** Whether the transition effect is enabled. */
  enabled: boolean;
  /** The duration of the transition in seconds. */
  transitionTime: number;
  /** The default background color for VR transitions. */
  defaultBackgroundColor: number;
}
declare const FORM_FACTORS: readonly ['auto', 'xr', 'hud', 'vr', 'desktop', 'mobile'];
export type FormFactor = (typeof FORM_FACTORS)[number];
export declare const RENDERER_BACKENDS: readonly ['webgl', 'webgpu'];
export type RendererBackend = (typeof RENDERER_BACKENDS)[number];
export type FramebufferScaleFactor = number | 'native';
export interface WebGPURendererOptions {
  forceWebGL?: boolean;
}
export type AutomationModeOptions = {
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
export declare class Options {
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
   * The rendering backend to use.
   */
  rendererBackend: RendererBackend;
  /**
   * Optional configuration for WebGPU renderer.
   */
  webgpuOptions?: WebGPURendererOptions;
  /**
   * Optional WebXR framebuffer scale factor. Set to a number (e.g., `1.5`) or
   * `'native'` to query `XRWebGLLayer.getNativeFramebufferScaleFactor(session)`
   * before the XR session starts.
   */
  framebufferScaleFactor?: FramebufferScaleFactor;
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
  layers: LayersOptions;
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
   * Configures Core to use THREE.WebGPURenderer instead of THREE.WebGLRenderer.
   * @param options - Optional WebGPU renderer settings such as `forceWebGL`.
   */
  enableWebGPU(options?: WebGPURendererOptions): this;
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
   * Enables WebXR composition layers.
   *
   * Content presented as a layer is composited once at its own resolution
   * rather than being drawn into the eye buffer and resampled again, so video
   * and text come out sharper, and the compositor keeps reprojecting it to the
   * latest head pose even when the app's own frame rate dips.
   *
   * Requested optionally, and each layer falls back to ordinary in-scene
   * rendering where the platform cannot present one.
   *
   * @returns The instance for chaining.
   */
  enableLayers(): this;
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
  /**
   * Sets the WebXR framebuffer scale factor (a numeric multiplier or `'native'`
   * to use `XRWebGLLayer.getNativeFramebufferScaleFactor(session)`).
   * @param scaleFactor - Numeric scale factor or `'native'`.
   * @returns The instance for chaining.
   */
  setFramebufferScaleFactor(scaleFactor: FramebufferScaleFactor): this;
}
//#endregion
//#region src/utils/FaceCameraMath.d.ts
type FaceCameraMode = 'capsule' | 'cylindrical' | 'spherical';
//#endregion
//#region src/interaction/manipulation/ManipulationTypes.d.ts
export declare const ManipulationAction: {
  readonly Translate: 'translate';
  readonly Rotate: 'rotate';
  readonly Scale: 'scale';
  readonly Resize: 'resize';
  readonly None: 'none';
};
export type ManipulationAction = (typeof ManipulationAction)[keyof typeof ManipulationAction];
export interface TranslateOptions {
  faceCamera?: boolean;
  /** Camera-facing rotation mode used while translating. */
  mode?: FaceCameraMode;
  /** Half-height of the upright region used by capsule mode, in meters. */
  capsuleHalfHeight?: number;
  /** Camera-facing rotation smoothing, matching `FaceCamera`. */
  smoothing?: number;
  /**
   * Scales the owner with its distance from the camera while translating,
   * matching Android XR panels: apparent size stays constant up to 1.75 meters,
   * then scale grows at 0.5 meters per meter so farther owners look smaller.
   * Clamped by the Scale action limits.
   */
  scaleWithDistance?: boolean;
  /**
   * Pushes the owner away or pulls it closer along a controller ray with the
   * thumbstick while translating: forward pushes, back pulls.
   */
  pushPull?: boolean | PushPullOptions;
  /** Closest the owner can be moved to the viewer, in meters. */
  minDistance?: number;
  /** Farthest the owner can be moved from the viewer, in meters. */
  maxDistance?: number;
}
export interface PushPullOptions {
  /**
   * Exponential distance change rate at full deflection: the distance is
   * multiplied by e^speed per second. Defaults to 1.5.
   */
  speed?: number;
}
export interface RotateOptions {
  axis?: 'x' | 'y' | 'z' | THREE.Vector3Like;
  space?: 'local' | 'world';
  sensitivity?: number;
}
export interface ScaleOptions {
  minScale?: number | THREE.Vector3Like;
  maxScale?: number | THREE.Vector3Like;
}
export interface ResizeSize {
  width?: number;
  height?: number;
}
/** Options for resizing a `UICard` by dragging one of its corners. */
export interface ResizeOptions {
  /**
   * Point kept fixed while a corner is dragged. `center` grows the card around
   * its center, matching Android XR and Quest panels. `opposite` keeps the
   * corner opposite the dragged one in place. Defaults to `center`.
   */
  anchor?: 'center' | 'opposite';
  /**
   * Minimum card size in meters. Defaults to 0.1 meters per axis. Without an
   * explicit `width`, the card never gets narrower than its content allows,
   * and without an explicit `height` it never gets shorter than its content
   * needs at the current width. Set `height` when the card scrolls its own
   * content.
   */
  minSize?: ResizeSize;
  /** Maximum card size in meters. Unbounded by default. */
  maxSize?: ResizeSize;
  /** Keeps the card's width-to-height ratio while resizing. Defaults to false. */
  preserveAspectRatio?: boolean;
}
export interface ManipulationHandleOptions {
  action?: typeof ManipulationAction.Translate | typeof ManipulationAction.Rotate | typeof ManipulationAction.Scale | typeof ManipulationAction.Resize | typeof ManipulationAction.None;
}
export interface ManipulationOptions {
  actions?: {
    translate?: boolean | TranslateOptions;
    rotate?: boolean | RotateOptions;
    scale?: boolean | ScaleOptions;
    /** Corner resize. Applies only to `UICard` owners. */
    resize?: boolean | ResizeOptions;
  };
  handle?: ManipulationHandleOptions;
}
export type ManipulationPhase = 'start' | 'update' | 'end' | 'cancel';
export interface BaseManipulationEvent {
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
export interface TranslateManipulationEvent extends BaseManipulationEvent {
  readonly action: typeof ManipulationAction.Translate;
  readonly point: THREE.Vector3;
  readonly delta: THREE.Vector3;
  readonly position: THREE.Vector3;
  readonly worldPosition: THREE.Vector3;
  /** Proposed local scale, changed only by `scaleWithDistance`. */
  readonly scale: THREE.Vector3;
}
export interface RotateManipulationEvent extends BaseManipulationEvent {
  readonly action: typeof ManipulationAction.Rotate;
  readonly angle: number;
  readonly quaternion: THREE.Quaternion;
}
export interface ScaleManipulationEvent extends BaseManipulationEvent {
  readonly action: typeof ManipulationAction.Scale;
  readonly factor: number;
  readonly center: THREE.Vector3;
  readonly scale: THREE.Vector3;
}
export interface ResizeManipulationEvent extends BaseManipulationEvent {
  readonly action: typeof ManipulationAction.Resize;
  /**
   * Proposed card size in meters. An automatic height stays `'auto'` until the
   * resize actually changes the card's size, then becomes fixed. Before the
   * card's first layout, only the width can change.
   */
  readonly width: number;
  readonly height: number | 'auto';
  /** Proposed local position that keeps the resize anchor in place. */
  readonly position: THREE.Vector3;
}
export type ManipulationEvent = TranslateManipulationEvent | RotateManipulationEvent | ScaleManipulationEvent | ResizeManipulationEvent;
//#endregion
//#region src/interaction/InteractionTypes.d.ts
type PointerEvents = 'auto' | 'none';
type ReticleMode = 'auto' | 'surface' | 'hidden';
interface XBObjectOptions {
  /** Whether this object and its descendants participate in pointer hits. */
  pointerEvents?: PointerEvents;
  interactionEnabled?: boolean;
  reticleMode?: ReticleMode;
  /** Keeps an active text field focused while interacting with an accessory. */
  preserveTextFocus?: boolean;
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
//#endregion
//#region src/physics/Physics.d.ts
/**
 * Integrates the RAPIER physics engine into the XRCore lifecycle.
 * It sets up the physics in a blended world that combines virtual and physical
 * objects, steps the simulation forward in sync with the application's
 * framerate, and manages the lifecycle of physics-related objects.
 */
export declare class Physics {
  initialized: boolean;
  options?: PhysicsOptions;
  RAPIER: RAPIERCompat;
  fps: number;
  blendedWorld: RAPIER.World;
  eventQueue: RAPIER.EventQueue;
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
//#endregion
//#region src/core/Script.d.ts
export interface SelectEvent {
  readonly source: InteractionSource;
  readonly target?: THREE.Object3D;
  readonly currentTarget?: Script;
  /** Public hit surface. Private renderer meshes are normalized to their owner. */
  readonly surface?: THREE.Object3D;
  /** Current ray intersection on `surface`, when the source still hits it. */
  readonly intersection?: THREE.Intersection;
  stopPropagation(): void;
}
export type SelectionEndReason = 'released' | 'released-outside' | 'source-lost' | 'pointer-cancel' | 'removed' | 'hidden' | 'disabled';
export interface SelectEndEvent extends SelectEvent {
  readonly completed: boolean;
  readonly reason: SelectionEndReason;
}
/** Event sent after a captured selection is held past the long-select delay. */
export interface LongSelectEvent extends SelectEvent {
  /** How long the selection has been held, in seconds. */
  duration: number;
}
export interface ObjectTouchEvent {
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
export interface ObjectTouchStartEvent extends ObjectTouchEvent {
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}
export interface ObjectGrabEvent {
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
export interface HoverEvent extends SelectEvent {
  readonly intersection?: THREE.Intersection;
}
export interface KeyEvent {
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
export declare function ScriptMixin<TBase extends Constructor<THREE.Object3D>>(base: TBase): {
  new (...args: any[]): {
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
    addEventListener<T extends Extract<keyof THREE.Object3DEventMap, string>>(type: T, listener: THREE.EventListener<THREE.Object3DEventMap[T], T, /*elided*/ any>): void;
    hasEventListener<T extends Extract<keyof THREE.Object3DEventMap, string>>(type: T, listener: THREE.EventListener<THREE.Object3DEventMap[T], T, /*elided*/ any>): boolean;
    removeEventListener<T extends Extract<keyof THREE.Object3DEventMap, string>>(type: T, listener: THREE.EventListener<THREE.Object3DEventMap[T], T, /*elided*/ any>): void;
    dispatchEvent<T extends Extract<keyof THREE.Object3DEventMap, string>>(event: THREE.BaseEvent<T> & THREE.Object3DEventMap[T]): void;
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
    intersectsFrustum(frustum: THREE.Frustum | THREE.FrustumArray): boolean | undefined;
    traverse(callback: (object: THREE.Object3D) => any): void;
    traverseVisible(callback: (object: THREE.Object3D) => any): void;
    traverseAncestors(callback: (object: THREE.Object3D) => any): void;
    updateMatrix(): void;
    updateMatrixWorld(force?: boolean): void;
    updateWorldMatrix(updateParents: boolean, updateChildren: boolean, force?: boolean): void;
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
    defaultPointerEvents?: PointerEventsProperties['pointerEvents'];
    pointerEvents?: 'none' | 'auto' | 'listener';
    pointerEventsType?: AllowedPointerEventsType;
    pointerEventsOrder?: number;
  };
} & TBase;
/**
 * Script manages app logic or interaction between user and objects.
 */
declare const ScriptMixinObject3D: {
  new (...args: any[]): {
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
    addEventListener<T extends Extract<keyof THREE.Object3DEventMap, string>>(type: T, listener: THREE.EventListener<THREE.Object3DEventMap[T], T, /*elided*/ any>): void;
    hasEventListener<T extends Extract<keyof THREE.Object3DEventMap, string>>(type: T, listener: THREE.EventListener<THREE.Object3DEventMap[T], T, /*elided*/ any>): boolean;
    removeEventListener<T extends Extract<keyof THREE.Object3DEventMap, string>>(type: T, listener: THREE.EventListener<THREE.Object3DEventMap[T], T, /*elided*/ any>): void;
    dispatchEvent<T extends Extract<keyof THREE.Object3DEventMap, string>>(event: THREE.BaseEvent<T> & THREE.Object3DEventMap[T]): void;
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
    intersectsFrustum(frustum: THREE.Frustum | THREE.FrustumArray): boolean | undefined;
    traverse(callback: (object: THREE.Object3D) => any): void;
    traverseVisible(callback: (object: THREE.Object3D) => any): void;
    traverseAncestors(callback: (object: THREE.Object3D) => any): void;
    updateMatrix(): void;
    updateMatrixWorld(force?: boolean): void;
    updateWorldMatrix(updateParents: boolean, updateChildren: boolean, force?: boolean): void;
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
    defaultPointerEvents?: PointerEventsProperties['pointerEvents'];
    pointerEvents?: 'none' | 'auto' | 'listener';
    pointerEventsType?: AllowedPointerEventsType;
    pointerEventsOrder?: number;
  };
} & typeof THREE.Object3D;
export declare class Script<TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap> extends ScriptMixinObject3D<TEventMap> {}
/**
 * MeshScript can be constructed with geometry and materials, with
 * `super(geometry, material)`; for direct access to its geometry.
 * MeshScripts hold geometry and materials while using the Script lifecycle.
 */
declare const ScriptMixinMeshScript: {
  new (...args: any[]): {
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
    addEventListener<T extends Extract<keyof THREE.Object3DEventMap, string>>(type: T, listener: THREE.EventListener<THREE.Object3DEventMap[T], T, /*elided*/ any>): void;
    hasEventListener<T extends Extract<keyof THREE.Object3DEventMap, string>>(type: T, listener: THREE.EventListener<THREE.Object3DEventMap[T], T, /*elided*/ any>): boolean;
    removeEventListener<T extends Extract<keyof THREE.Object3DEventMap, string>>(type: T, listener: THREE.EventListener<THREE.Object3DEventMap[T], T, /*elided*/ any>): void;
    dispatchEvent<T extends Extract<keyof THREE.Object3DEventMap, string>>(event: THREE.BaseEvent<T> & THREE.Object3DEventMap[T]): void;
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
    intersectsFrustum(frustum: THREE.Frustum | THREE.FrustumArray): boolean | undefined;
    traverse(callback: (object: THREE.Object3D) => any): void;
    traverseVisible(callback: (object: THREE.Object3D) => any): void;
    traverseAncestors(callback: (object: THREE.Object3D) => any): void;
    updateMatrix(): void;
    updateMatrixWorld(force?: boolean): void;
    updateWorldMatrix(updateParents: boolean, updateChildren: boolean, force?: boolean): void;
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
    defaultPointerEvents?: PointerEventsProperties['pointerEvents'];
    pointerEvents?: 'none' | 'auto' | 'listener';
    pointerEventsType?: AllowedPointerEventsType;
    pointerEventsOrder?: number;
  };
} & typeof THREE.Mesh;
export declare class MeshScript<TGeometry extends THREE.BufferGeometry = THREE.BufferGeometry, TMaterial extends THREE.Material | THREE.Material[] = THREE.Material | THREE.Material[], TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap> extends ScriptMixinMeshScript<TGeometry, TMaterial, TEventMap> {
  /**
   * {@inheritDoc}
   */
  constructor(geometry?: TGeometry, material?: TMaterial);
}
//#endregion
//#region src/agent/Tool.d.ts
export interface ToolCall {
  name: string;
  args: unknown;
}
/**
 * Standardized result type for tool execution.
 * @typeParam T - The type of data returned on success.
 */
export interface ToolResult<T = unknown> {
  /** Whether the tool execution succeeded */
  success: boolean;
  /** The result data if successful */
  data?: T;
  /** Error message if execution failed */
  error?: string;
  /** Additional metadata about the execution */
  metadata?: Record<string, unknown>;
}
export type ToolSchema = Omit<GoogleGenAITypes.Schema, 'type' | 'properties' | 'items'> & {
  properties?: Record<string, ToolSchema>;
  items?: ToolSchema;
  type?: keyof typeof GoogleGenAITypes.Type;
};
export type ToolOptions = {
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
export declare class Tool {
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
  /**
   * Returns the function tool shape for the non-live Interactions API (a
   * `tools` entry on a query). `behavior` is a Live API concept and has no
   * Interactions equivalent.
   * @returns A valid Interactions function tool.
   */
  toInteractions(): GoogleGenAITypes.Interactions.Function;
}
//#endregion
//#region src/ai/AITypes.d.ts
interface GeminiResponse {
  toolCall?: ToolCall;
  text?: string | null;
}
//#endregion
//#region src/ai/BaseAIModel.d.ts
declare abstract class BaseAIModel {
  constructor();
  abstract init(): Promise<void>;
  abstract isAvailable(): boolean;
  abstract query(_input: object, _tools: []): Promise<GeminiResponse | string | null>;
  hasApiKey(): Promise<boolean>;
}
//#endregion
//#region src/ai/Gemini.d.ts
export interface GeminiQueryInput {
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
export declare class Gemini extends BaseAIModel {
  protected options: GeminiOptions;
  inited: boolean;
  liveSession?: GoogleGenAITypes.Session;
  isLiveMode: boolean;
  liveCallbacks: Partial<GoogleGenAITypes.LiveCallbacks>;
  ai?: GoogleGenAITypes.GoogleGenAI;
  private liveSessionPromise?;
  private liveSessionGeneration;
  private liveSessionStopped;
  constructor(options: GeminiOptions);
  init(): Promise<void>;
  isAvailable(): boolean;
  isLiveAvailable(): false | typeof GoogleGenAITypes.Modality | undefined;
  /**
   * Shares a pending connection between concurrent starts. Stopping or disposing
   * invalidates that start; any session returned later is closed and the start
   * rejects with AbortError. The provider cannot be aborted before it returns.
   */
  startLiveSession(params?: GoogleGenAITypes.LiveConnectConfig, model?: string): Promise<GoogleGenAITypes.Session>;
  stopLiveSession(): Promise<void>;
  /** Invalidates live work synchronously without creating a teardown promise. */
  dispose(): void;
  private closeLiveSession;
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
//#endregion
//#region src/ai/OpenAI.d.ts
export declare class OpenAI extends BaseAIModel {
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
//#endregion
//#region src/ai/AI.d.ts
export type ModelClass = Gemini | OpenAI;
export type ModelOptions = GeminiOptions | OpenAIOptions;
export type KeysJson = {
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
export declare class AI extends Script {
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
  isValidApiKey(key: string): "" | boolean;
  isAvailable(): boolean | undefined;
  query(input: GeminiQueryInput | {
    prompt: string;
  }, tools?: never[]): Promise<GeminiResponse | string | null>;
  /**
   * Concurrent starts share a connection. A start invalidated by stop or dispose
   * rejects with AbortError when the provider returns, closing that late session.
   */
  startLiveSession(config?: GoogleGenAITypes.LiveConnectConfig, model?: string): Promise<GoogleGenAITypes.Session>;
  /**
   * Invalidates pending live work and closes any established session. This does
   * not wait for an in-flight provider connection to finish.
   */
  stopLiveSession(): Promise<void>;
  /** Closes live resources synchronously for the Script disposal contract. */
  dispose(): void;
  setLiveCallbacks(callbacks: GoogleGenAITypes.LiveCallbacks): Promise<void>;
  sendToolResponse(response: GoogleGenAITypes.LiveSendToolResponseParameters): void;
  sendRealtimeInput(input: GoogleGenAITypes.LiveSendRealtimeInputParameters): void | false;
  getLiveSessionStatus(): {
    isActive: boolean;
    hasSession: boolean;
    isAvailable: boolean | typeof GoogleGenAITypes.Modality | undefined;
  };
  isLiveAvailable(): false | typeof GoogleGenAITypes.Modality | undefined;
  generate(prompt: string | string[], type?: 'image', systemInstruction?: string, model?: string): Promise<string | undefined>;
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
  hasApiKey(): Promise<"" | boolean | null>;
}
//#endregion
//#region src/agent/Memory.d.ts
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
//#endregion
//#region src/agent/Context.d.ts
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
//#endregion
//#region src/agent/Agent.d.ts
/**
 * Lifecycle callbacks for agent events.
 */
export interface AgentLifecycleCallbacks {
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
export declare class Agent {
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
//#endregion
//#region src/core/components/Registry.d.ts
export declare class Registry {
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
//#endregion
//#region src/sound/AudioListener.d.ts
export interface AudioListenerOptions {
  sampleRate?: number;
  channelCount?: number;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
}
export declare class AudioListener extends Script {
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
//#endregion
//#region src/sound/CategoryVolumes.d.ts
export declare enum VolumeCategory {
  music = "music",
  sfx = "sfx",
  speech = "speech",
  ui = "ui"
}
export declare class CategoryVolumes {
  isMuted: boolean;
  masterVolume: number;
  volumes: Record<VolumeCategory, number>;
  getCategoryVolume(category: string): number;
  getEffectiveVolume(category: string, specificVolume?: number): number;
}
//#endregion
//#region src/sound/AudioPlayer.d.ts
export interface AudioPlayerOptions {
  sampleRate?: number;
  channelCount?: number;
  category?: string;
}
export declare class AudioPlayer extends Script {
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
//#endregion
//#region src/sound/BackgroundMusic.d.ts
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
//#endregion
//#region src/sound/SoundSynthesizer.d.ts
/**
 * Defines common UI sound presets with their default parameters.
 * Each preset specifies frequency, duration, and waveform type.
 */
export declare const SOUND_PRESETS: {
  readonly BEEP: {
    readonly frequency: 1000;
    readonly duration: 0.07;
    readonly waveformType: 'sine';
  };
  readonly CLICK: readonly [{
    readonly frequency: 1500;
    readonly duration: 0.02;
    readonly waveformType: 'triangle';
    readonly delay: 0;
  }];
  readonly ACTIVATE: readonly [{
    readonly frequency: 800;
    readonly duration: 0.05;
    readonly waveformType: 'sine';
    readonly delay: 0;
  }, {
    readonly frequency: 1200;
    readonly duration: 0.07;
    readonly waveformType: 'sine';
    readonly delay: 50;
  }];
  readonly DEACTIVATE: readonly [{
    readonly frequency: 1200;
    readonly duration: 0.05;
    readonly waveformType: 'sine';
    readonly delay: 0;
  }, {
    readonly frequency: 800;
    readonly duration: 0.07;
    readonly waveformType: 'sine';
    readonly delay: 50;
  }];
};
export declare class SoundSynthesizer extends Script {
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
//#endregion
//#region src/sound/SpatialAudio.d.ts
declare const spatialSoundLibrary: {
  readonly ambient: 'musicLibrary/AmbientLoop.opus';
  readonly buttonHover: 'musicLibrary/ButtonHover.opus';
  readonly paintOneShot1: 'musicLibrary/PaintOneShot1.opus';
};
export interface PlaySoundOptions {
  loop?: boolean;
  volume?: number;
  refDistance?: number;
  rolloffFactor?: number;
  onEnded?: () => void;
}
export declare class SpatialAudio extends Script {
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
//#endregion
//#region src/sound/SpeechRecognizer.d.ts
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
export declare class SpeechRecognizer extends Script<SpeechRecognizerEventMap> {
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
//#endregion
//#region src/sound/SpeechSynthesizer.d.ts
export declare class SpeechSynthesizer extends Script {
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
//#endregion
//#region src/sound/CoreSound.d.ts
export declare class CoreSound extends Script {
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
  init({ camera, soundOptions }: {
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
//#endregion
//#region src/agent/SkyboxAgent.d.ts
/**
 * State information for a live session.
 */
export interface LiveSessionState {
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
export declare class SkyboxAgent extends Agent {
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
//#endregion
//#region src/agent/tools/GetWeatherTool.d.ts
export interface GetWeatherArgs {
  latitude: number;
  longitude: number;
}
export interface WeatherData {
  temperature: number;
  weathercode: number;
}
/**
 * A tool that gets the current weather for a specific location.
 */
export declare class GetWeatherTool extends Tool {
  constructor();
  /**
   * Executes the tool's action.
   * @param args - The arguments for the tool.
   * @returns A promise that resolves with a ToolResult containing weather information.
   */
  execute(args: GetWeatherArgs): Promise<ToolResult<WeatherData>>;
}
//#endregion
//#region src/agent/tools/GenerateSkyboxTool.d.ts
/**
 * A tool that generates a 360-degree equirectangular skybox image
 * based on a given prompt using an AI service.
 */
export declare class GenerateSkyboxTool extends Tool {
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
//#endregion
//#region src/video/VideoStream.d.ts
/**
 * Enum for video stream states.
 */
export declare enum StreamState {
  IDLE = "idle",
  INITIALIZING = "initializing",
  STREAMING = "streaming",
  ERROR = "error",
  NO_DEVICES_FOUND = "no_devices_found"
}
export type VideoStreamDetails = {
  force?: boolean;
  error?: Error;
};
export interface VideoStreamEventMap<T> extends THREE.Object3DEventMap {
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
export type VideoStreamGetSnapshotImageDataOptions = VideoStreamGetSnapshotImageDataOptionsBase & {
  outputFormat: 'imageData';
};
export type VideoStreamGetSnapshotBase64Options = VideoStreamGetSnapshotImageDataOptionsBase & {
  outputFormat: 'base64';
  mimeType?: string;
  quality?: number;
};
export type VideoStreamGetSnapshotBlobOptions = VideoStreamGetSnapshotImageDataOptionsBase & {
  outputFormat: 'blob';
  mimeType?: string;
  quality?: number;
};
export type VideoStreamGetSnapshotTextureOptions = VideoStreamGetSnapshotImageDataOptionsBase & {
  outputFormat?: 'texture';
};
export type VideoStreamGetSnapshotOptions = VideoStreamGetSnapshotImageDataOptions | VideoStreamGetSnapshotBase64Options | VideoStreamGetSnapshotTextureOptions | VideoStreamGetSnapshotBlobOptions;
export type VideoStreamOptions = {
  /** Hint for performance optimization for frequent captures. */
  willCaptureFrequently?: boolean;
};
/**
 * Subset of the WICG `VideoFrameCallbackMetadata` fields we rely on. For
 * camera-backed streams Chrome reports `captureTime` (when the frame left the
 * camera pipeline) in the `performance.now()` timebase.
 */
export type VideoFrameMetadata = {
  presentationTime: number;
  expectedDisplayTime: number;
  mediaTime: number;
  presentedFrames: number;
  captureTime?: number;
  receiveTime?: number;
};
/**
 * The base class for handling video streams (from camera or file), managing
 * the underlying <video> element, streaming state, and snapshot logic.
 */
export declare class VideoStream<T extends VideoStreamDetails = VideoStreamDetails> extends Script<VideoStreamEventMap<T>> {
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
   * Waits for the next new video frame before returning, so a subsequent
   * {@link getSnapshot} reads fresh pixels instead of whatever (possibly
   * stale) frame the `<video>` element currently holds. Hidden or
   * non-composited video elements — the normal situation inside an immersive
   * XR session — can be throttled by the browser, in which case the held
   * frame may be arbitrarily old.
   *
   * Resolves with the frame's metadata (whose `captureTime`, when present,
   * dates the pixels in the `performance.now()` timebase), or `null` when the
   * signal is unavailable (`requestVideoFrameCallback` unsupported, no active
   * media stream) or no frame arrived within `timeoutMs`.
   */
  waitForFreshFrame(timeoutMs?: number): Promise<VideoFrameMetadata | null>;
  /**
   * Whether the current snapshot source has pixels available.
   * Subclasses may override this to provide non-video sources while preserving
   * {@link getSnapshot}'s format handling.
   */
  protected snapshotSourceAvailable_(): boolean;
  /**
   * Draws the current snapshot source into `context` at the requested size.
   * Subclasses may override this to provide pixels from another source.
   */
  protected drawSnapshotSource_(context: CanvasRenderingContext2D, width: number, height: number): void;
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
//#endregion
//#region src/camera/SimulatorCameraSource.d.ts
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
//#endregion
//#region src/camera/XRDeviceCamera.d.ts
export type MediaOrSimulatorMediaDeviceInfo = MediaDeviceInfo | CameraDeviceInfo;
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
  private readonly mediaTexture_;
  private useXRCameraAccess_;
  private xrCameraTexture_?;
  private xrCameraRenderTarget_?;
  private xrCameraCopyScene_?;
  private xrCameraCopyCamera_?;
  private xrCameraCopyMaterial_?;
  private xrCameraSnapshotImageData_;
  private xrCameraSnapshotCanvas_;
  private xrCameraSnapshotContext_;
  private pendingXRCameraCaptures_;
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
  setRenderer(renderer: WebGLOrWebGPURenderer): void;
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
   * Captures a snapshot from the active camera source.
   *
   * In the normal video path this resolves from {@link getSnapshot}
   * immediately. In the WebXR Raw Camera Access fallback, the browser camera
   * image is only valid during the XR frame that produced it, so this queues a
   * one-shot GPU readback for the next {@link updateXRCamera} call and then
   * resolves through {@link getSnapshot}. Concurrent camera-access calls share
   * that next XR-frame readback, but each resolves with its own requested
   * format. If no XR camera frame arrives within about one second, or the raw
   * camera path is stopped, the promise resolves to `null`. Synchronous
   * {@link getSnapshot} on that fallback path returns the most recently
   * captured one-shot frame, or `null` when no capture has completed yet.
   */
  captureSnapshot(): Promise<THREE.Texture | null>;
  captureSnapshot(options: VideoStreamGetSnapshotImageDataOptions): Promise<ImageData | null>;
  captureSnapshot(options: VideoStreamGetSnapshotBase64Options): Promise<string | null>;
  captureSnapshot(options: VideoStreamGetSnapshotTextureOptions): Promise<THREE.Texture | null>;
  captureSnapshot(options: VideoStreamGetSnapshotBlobOptions): Promise<Blob | null>;
  captureSnapshot(options: VideoStreamGetSnapshotOptions): Promise<ImageData | string | THREE.Texture | Blob | null>;
  protected snapshotSourceAvailable_(): boolean;
  protected drawSnapshotSource_(context: CanvasRenderingContext2D, width: number, height: number): void;
  /**
   * Updates the camera texture from the WebXR Raw Camera Access API.
   * Must be called each frame from the render loop when in XR camera mode.
   */
  updateXRCamera(frame: XRFrame): void;
  registerSimulatorCamera(simulatorCamera?: SimulatorCameraSource): void;
  dispose(): void;
  private processPendingXRCameraCapture_;
  private captureXRCameraSnapshot_;
  private ensureXRCameraRenderTarget_;
  private ensureXRCameraCopyObjects_;
  private snapshotCanvasForImageData_;
  private resolvePendingXRCameraCaptures_;
  private disposeXRCameraAccessResources_;
  onXRSessionEnded(): void;
  private startXRCameraAccessFallback_;
  private isXRCameraAccessGranted_;
  private clearXRCameraAccessTimeout_;
}
//#endregion
//#region src/camera/CameraUtils.d.ts
export type DeviceCameraParameters = {
  projectionMatrix: THREE.Matrix4;
  getCameraPose: (camera: THREE.Camera, xrCameras: THREE.WebXRArrayCamera, target: THREE.Matrix4) => void;
};
export declare const DEVICE_CAMERA_PARAMETERS: {
  [key: string]: DeviceCameraParameters;
};
/**
 * The {@link DEVICE_CAMERA_PARAMETERS} profile for the running browser:
 * `'quest3'` in the Meta Quest browser, `'galaxyxr'` otherwise. The two
 * profiles share intrinsics but not the camera-to-eye extrinsics (the Quest
 * camera is pitched ~15° down), so every consumer of the device-camera pose
 * must resolve the same profile.
 * @param userAgent - Defaults to `navigator.userAgent` when available.
 */
export declare function detectDeviceCameraTarget(userAgent?: string): string;
export declare function getDeviceCameraClipFromView(renderCamera: THREE.PerspectiveCamera, deviceCamera: XRDeviceCamera, targetDevice: string): THREE.Matrix4;
export declare function getDeviceCameraWorldFromView(renderCamera: THREE.PerspectiveCamera, xrCameras: THREE.WebXRArrayCamera | null, deviceCamera: XRDeviceCamera, targetDevice: string): THREE.Matrix4;
export declare function getDeviceCameraWorldFromClip(renderCamera: THREE.PerspectiveCamera, xrCameras: THREE.WebXRArrayCamera | null, deviceCamera: XRDeviceCamera, targetDevice: string): THREE.Matrix4;
export type CameraParametersSnapshot = {
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
export declare function isDeviceCameraPoseAvailable(deviceCamera: XRDeviceCamera | undefined, xrCameras: THREE.WebXRArrayCamera | null): boolean;
/**
 * Builds a snapshot of the device camera's view/projection matrices, or returns
 * `null` while no camera pose is available yet (see
 * {@link isDeviceCameraPoseAvailable}). Returning `null` lets per-frame callers
 * skip cleanly during startup instead of throwing on every frame until a
 * camera appears.
 */
export declare function getCameraParametersSnapshot(camera: THREE.PerspectiveCamera, xrCameras: THREE.WebXRArrayCamera | null, deviceCamera: XRDeviceCamera, targetDevice: string): CameraParametersSnapshot | null;
/**
 * Raycasts to the depth mesh to find the world position and normal at a given UV coordinate.
 * @param rgbUv - The UV coordinate to raycast from.
 * @param depthMeshSnapshot - The depth mesh to raycast against.
 * @param cameraParametersSnapshot - Parameters of the device camera relative to the render camera's world.
 * @returns The world position, normal, and depth at the given UV coordinate.
 */
export declare function transformRgbUvToWorld(rgbUv: THREE.Vector2, depthMeshSnapshot: THREE.Mesh, cameraParametersSnapshot: {
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
export declare function cropImage(imageSource: string | ImageData, boundingBox: THREE.Box2): Promise<string>;
//#endregion
//#region src/camera/CameraParameterUtils.d.ts
export declare function intrinsicsToProjectionMatrix(K: number[], width: number, height: number, near: number, far: number, target: THREE.Matrix4): THREE.Matrix4;
//#endregion
//#region src/constants.d.ts
/**
 * The number of hands tracked in a typical XR session (left and right).
 */
export declare const NUM_HANDS = 2;
/**
 * The number of joints per hand tracked in a typical XR session.
 */
export declare const HAND_JOINT_COUNT = 25;
/**
 * The pairs of joints as an adjcent list.
 */
export declare const HAND_JOINT_IDX_CONNECTION_MAP: number[][];
/**
 * The pairs of bones' ids per angle as an adjcent list.
 */
export declare const HAND_BONE_IDX_CONNECTION_MAP: number[][];
/**
 * A small depth offset (in meters) applied between layered UI elements to
 * prevent Z-fighting, which is a visual artifact where surfaces at similar
 * depths appear to flicker.
 */
export declare const VIEW_DEPTH_GAP = 0.002;
/**
 * The THREE.js rendering layer used exclusively for objects that should only be
 * visible to the left eye's camera in stereoscopic rendering.
 */
export declare const LEFT_VIEW_ONLY_LAYER = 1;
/**
 * The THREE.js rendering layer used exclusively for objects that should only be
 * visible to the right eye's camera in stereoscopic rendering.
 */
export declare const RIGHT_VIEW_ONLY_LAYER = 2;
/**
 * The THREE.js rendering layer for virtual objects that should be realistically
 * occluded by real-world objects when depth sensing is active.
 */
export declare const OCCLUDABLE_ITEMS_LAYER = 3;
/**
 * The default ideal width in pixels for requesting the device camera stream.
 * Corresponds to a 720p resolution.
 */
export declare const DEFAULT_DEVICE_CAMERA_WIDTH = 1280;
/**
 * The default ideal height in pixels for requesting the device camera stream.
 * Corresponds to a 720p resolution.
 */
export declare const DEFAULT_DEVICE_CAMERA_HEIGHT = 720;
export declare const XR_BLOCKS_ASSETS_PATH = "https://cdn.jsdelivr.net/gh/xrblocks/assets@5582bd1b2d1a4e19f7ee7093b63a5ee328e974ac/";
//#endregion
//#region src/core/components/ScreenshotSynthesizer.d.ts
export declare class ScreenshotSynthesizer {
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
  onAfterRender(renderer: THREE.WebGLRenderer, renderSceneFn: () => void, deviceCamera?: XRDeviceCamera): void;
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
//#endregion
//#region src/core/components/SimulationTimer.d.ts
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
//#endregion
//#region src/context/shared/SemanticTypes.d.ts
export type Vec2Tuple = [number, number];
export type Vec3Tuple = [number, number, number];
export type QuatTuple = [number, number, number, number];
export type SemanticSource = 'xrblocks' | 'three' | 'app';
export interface SemanticBounds {
  center: Vec3Tuple;
  size: Vec3Tuple;
}
export interface SemanticScrollInfo {
  offset: number;
  viewportHeight: number;
  maximum?: number;
  contentHeight?: number;
}
export interface SemanticViewData {
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
export interface SemanticNode {
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
  focused?: boolean;
  readOnly?: boolean;
  multiline?: boolean;
  scroll?: SemanticScrollInfo;
  value?: number;
  min?: number;
  max?: number;
  bounds?: SemanticBounds;
  view?: SemanticViewData;
}
export interface SemanticTree {
  snapshotId: string;
  /** Elapsed simulation time in milliseconds when the snapshot was captured. */
  capturedAt: number;
  rootIds: string[];
  nodes: Record<string, SemanticNode>;
}
export type VisibleObjectsContext = SemanticTree;
export interface SetOfMark {
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
export interface SetOfMarkContext {
  snapshotId: string;
  /** Elapsed simulation time in milliseconds when the snapshot was captured. */
  capturedAt: number;
  image: string;
  marks: SetOfMark[];
}
export type SemanticMetadata = {
  role?: string;
  name?: string;
  text?: string;
  traits?: string[];
  hidden?: boolean;
  disabled?: boolean;
  source?: SemanticSource;
};
//#endregion
//#region src/context/scene/SceneDetector.d.ts
export type SceneContextDetectionOptions = {
  semanticTree?: boolean;
  visibleObjects?: boolean;
  setOfMark?: boolean;
};
export type SceneContextDetectionResult = {
  semanticTree?: SemanticTree;
  visibleObjects?: VisibleObjectsContext;
  setOfMark?: SetOfMarkContext;
};
export declare class SceneDetector extends Script {
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
  init({ options, scene, camera, screenshotSynthesizer, simulationTimer, interaction, deviceCamera }: {
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
//#endregion
//#region src/context/Context.d.ts
export declare class Context extends Script {
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
  init({ options, deviceCamera }: {
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
//#endregion
//#region src/core/components/ScriptsManager.d.ts
export declare enum ScriptsManagerEventType {
  EXCEPTION = "exception"
}
export type ScriptsManagerEventMap = THREE.Object3DEventMap & {
  [ScriptsManagerEventType.EXCEPTION]: {
    scriptName: string;
    context: string;
    error: Error;
    timestamp: number;
  };
};
export declare class ScriptsManager extends THREE.EventDispatcher<ScriptsManagerEventMap> implements InteractionCallbackDispatch {
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
//#endregion
//#region src/core/components/WaitFrame.d.ts
export declare class WaitFrame {
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
//#endregion
//#region src/core/components/WebXRSessionManager.d.ts
export declare enum WebXRSessionEventType {
  UNSUPPORTED = "unsupported",
  READY = "ready",
  BEFORE_SESSION_START = "beforesessionstart",
  SESSION_START = "sessionstart",
  SESSION_END = "sessionend",
  SESSION_ERROR = "sessionerror"
}
export type WebXRSessionManagerEventMap = THREE.Object3DEventMap & {
  [WebXRSessionEventType.UNSUPPORTED]: object;
  [WebXRSessionEventType.READY]: {
    sessionOptions: XRSessionInit;
  };
  [WebXRSessionEventType.BEFORE_SESSION_START]: {
    session: XRSession;
  };
  [WebXRSessionEventType.SESSION_START]: {
    session: XRSession;
  };
  [WebXRSessionEventType.SESSION_END]: object;
  [WebXRSessionEventType.SESSION_ERROR]: {
    error: unknown;
  };
};
/**
 * Manages the WebXR session lifecycle by extending THREE.EventDispatcher
 * to broadcast its state to any listener.
 */
export declare class WebXRSessionManager extends THREE.EventDispatcher<WebXRSessionManagerEventMap> {
  private renderer;
  private sessionInit;
  private mode;
  currentSession?: XRSession;
  private sessionOptions?;
  private xrModeSupported?;
  private waitingForXRSession;
  private disposed;
  private disposalPromise?;
  constructor(renderer: WebGLOrWebGPURenderer, sessionInit: XRSessionInit, mode: XRSessionMode);
  /**
   * Checks for WebXR support and availability of the requested session mode.
   * This should be called to initialize the manager and trigger the first
   * events.
   */
  initialize(): Promise<void>;
  /**
   * Requests and initializes a WebXR session.
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
//#endregion
//#region src/core/components/PermissionsManager.d.ts
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
  checkAndRequestPermissions({ geolocation, camera, microphone }: {
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
//#endregion
//#region src/core/components/XRButton.d.ts
export declare class XRButton {
  private sessionManager;
  private permissionsManager;
  private appTitle;
  private appDescription;
  private startText;
  private endText;
  private invalidText;
  private startSimulatorText;
  startSimulator: () => void | Promise<unknown>;
  private permissions;
  domElement: HTMLDivElement;
  simulatorButtonElement: HTMLButtonElement;
  xrButtonElement: HTMLButtonElement;
  private errorElement;
  private disposed;
  private startingSimulator;
  constructor(sessionManager: WebXRSessionManager, permissionsManager: PermissionsManager, appTitle?: string, appDescription?: string, startText?: string, endText?: string, invalidText?: string, startSimulatorText?: string, showEnterSimulatorButton?: boolean, startSimulator?: () => void | Promise<unknown>, permissions?: {
    geolocation: boolean;
    camera: boolean;
    microphone: boolean;
  });
  private onUnsupported;
  private onReady;
  private onSessionStart;
  private onSessionEnd;
  private onSessionError;
  private createErrorElement;
  private showError;
  private createSimulatorButton;
  private createXRAppTitle;
  private createXRAppDescription;
  private createXRButtonElement;
  private onSessionReady;
  private showXRNotSupported;
  private onSessionStarted;
  private onSessionEnded;
  setSimulatorStarting(starting: boolean): void;
  dispose(): void;
}
//#endregion
//#region src/core/components/XREffects.d.ts
export declare class XRPass extends Pass {
  render(_renderer: WebGLOrWebGPURenderer, _writeBuffer: THREE.RenderTarget, _readBuffer: THREE.RenderTarget, _deltaTime: number, _maskActive: boolean, _viewId?: number): void;
}
/**
 * XREffects manages the XR rendering pipeline.
 * Use core.effects
 * It handles multiple passes and render targets for applying effects to XR
 * scenes.
 */
export declare class XREffects {
  private renderer;
  private scene;
  private timer;
  passes: XRPass[];
  renderTargets: THREE.RenderTarget[];
  dimensions: THREE.Vector2;
  constructor(renderer: WebGLOrWebGPURenderer, scene: THREE.Scene, timer: THREE.Timer);
  private setRenderTarget;
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
//#endregion
//#region src/core/components/XRReferenceSpaceCache.d.ts
/**
 * Manages and caches WebXR reference spaces for the active XR session.
 */
export declare class XRReferenceSpaceCache {
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
//#endregion
//#region src/simulator/scene/SimulatorEnvironmentManifest.d.ts
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
interface SimulatorDayNightLightingDefinition {
  kind: 'dayNight';
  nightScenePath: string;
  pairing: 'bake-crossfade-v1';
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
  lighting?: SimulatorDayNightLightingDefinition;
}
interface ResolvedSimulatorSceneManifest extends Omit<SimulatorSceneManifest, 'scenePath' | 'videoPath' | 'scenePlanesPath' | 'navMeshPath' | 'objects' | 'lighting'> {
  scenePath?: string;
  videoPath?: string;
  scenePlanesPath?: string;
  navMeshPath?: string;
  objects: SimulatorObjectDefinition[];
  lighting?: SimulatorDayNightLightingDefinition;
  manifestUrl: string;
}
//#endregion
//#region src/depth/DepthTextures.d.ts
export declare class DepthTextures {
  private options;
  private float32Arrays;
  private uint8Arrays;
  private dataTextures;
  private nativeTextures;
  private renderer?;
  depthData: XRCPUDepthInformation[];
  constructor(options: DepthOptions);
  private createDataDepthTextures;
  updateData(depthData: XRCPUDepthInformation, viewId: number, depthDataFormat: XRDepthDataFormat): void;
  updateNativeTexture(depthData: XRWebGLDepthInformation, renderer: WebGLOrWebGPURenderer, viewId: number): void;
  get(viewId: number): THREE.DataTexture | THREE.ExternalTexture;
  dispose(): void;
}
//#endregion
//#region src/depth/DepthMesh.d.ts
export declare class DepthMesh extends MeshScript {
  private depthOptions;
  private depthTextures?;
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
  private projectionMatrixInverse;
  private lastColliderUpdateTime;
  private options;
  private depthTextureMaterialUniforms?;
  private customMaterialUpdateCallback?;
  private RAPIER?;
  private blendedWorld?;
  private rigidBody?;
  private colliderId;
  private disposed;
  private readonly gridResolution;
  private readonly geometryUpdater;
  constructor(depthOptions: DepthOptions, width: number, height: number, depthTextures?: DepthTextures | undefined);
  get depthTextureUniforms(): {
    uDepthTexture: {
      value: THREE.Texture | null;
    };
    uDepthTextureArray: {
      value: THREE.Texture | null;
    };
    uIsTextureArray: {
      value: number;
    };
    uColor: {
      value: THREE.Color;
    };
    uResolution: {
      value: THREE.Vector2;
    };
    uRawValueToMeters: {
      value: number;
    };
    uMinDepth: {
      value: number;
    };
    uMaxDepth: {
      value: number;
    };
    uOpacity: {
      value: number;
    };
    uDebug: {
      value: number;
    };
    uLightDirection: {
      value: THREE.Vector3;
    };
    uUsingFloatDepth: {
      value: boolean;
    };
    uUseDerivativeNormals: {
      value: boolean;
    };
    uNormDepthBufferFromNormView: {
      value: THREE.Matrix4;
    };
  } | undefined;
  /**
   * Sets a custom material (such as a WebGPU NodeMaterial) and registers a
   * callback to synchronize uniforms on depth updates.
   *
   * @param material - The material to apply to the depth mesh.
   * @param onUpdate - Optional callback invoked whenever depth uniforms change.
   */
  setCustomMaterial(material: THREE.Material, onUpdate?: () => void): void;
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
  initRapierPhysics(RAPIER: typeof RAPIER, blendedWorld: RAPIER.World): void;
  /**
   * Customizes raycasting to compute normals for intersections.
   * @param raycaster - The raycaster object.
   * @param intersects - Array to store intersections.
   * @returns - True if intersections are found.
   */
  raycast(raycaster: THREE.Raycaster, intersects: THREE.Intersection[]): boolean;
  getColliderFromHandle(handle: RAPIER.ColliderHandle): RAPIER.Collider | undefined;
  /** Called by Depth at terminal teardown, not on Script disconnection. */
  disposeResources(): void;
}
//#endregion
//#region src/depth/Depth.d.ts
export type DepthArray = Float32Array | Uint16Array;
export declare class Depth {
  static instance?: Depth;
  private camera;
  private renderer;
  private gpuDepthConverter?;
  private registry?;
  private disposed;
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
  init(camera: THREE.PerspectiveCamera, options: DepthOptions, renderer: WebGLOrWebGPURenderer, registry: Registry, scene: THREE.Scene): void | Promise<void>;
  /**
   * Converts bottom-origin view UVs into normalized depth buffer coordinates.
   *
   * {@link https://immersive-web.github.io/depth-sensing/#obtain-depth-at-coordinates | The WebXR algorithm}
   * takes top-origin normalized view coordinates, applies
   * `normDepthBufferFromNormView`, then scales the result straight into the
   * buffer. Flipping V after the transform instead samples a different pixel
   * for any transform that does not commute with that flip, and disagrees
   * with {@link DepthMesh}, which flips first.
   * @param u - Normalized horizontal coordinate, origin at bottom left.
   * @param v - Normalized vertical coordinate, origin at bottom left.
   * @param target - Vector that receives the result.
   * @returns The normalized depth buffer coordinates.
   */
  private normDepthBufferCoords;
  /**
   * Retrieves the depth at normalized coordinates (u, v).
   * Note: The UV coordinates are with respect to the user's view, not the depth camera view.
   * @param u - Normalized horizontal coordinate, origin at the bottom left of
   * the view, growing right.
   * @param v - Normalized vertical coordinate, origin at the bottom left of
   * the view, growing up.
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
   * @param u - Normalized horizontal coordinate, origin at the bottom left of
   * the view, growing right.
   * @param v - Normalized vertical coordinate, origin at the bottom left of
   * the view, growing up.
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
  getTexture(viewId: number): THREE.DataTexture | THREE.ExternalTexture | undefined;
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
  /** Releases depth resources at terminal Core teardown, not on XR exit. */
  dispose(): void;
}
//#endregion
//#region src/simulator/SimulatorMediaDeviceInfo.d.ts
declare class SimulatorMediaDeviceInfo {
  deviceId: string;
  groupId: string;
  kind: MediaDeviceKind;
  label: string;
  constructor(deviceId?: string, groupId?: string, kind?: MediaDeviceKind, label?: string);
}
//#endregion
//#region src/simulator/SimulatorCamera.d.ts
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
  constructor(renderer: WebGLOrWebGPURenderer);
  init(): void;
  createSimulatorCamera(): void;
  enumerateDevices(): Promise<SimulatorMediaDeviceInfo[]>;
  onBeforeSimulatorSceneRender(camera: THREE.Camera, renderScene: (_: THREE.Camera) => void): void;
  onSimulatorSceneRendered(): void;
  private captureFromRendererCanvas;
  restartVideoTrack(): void;
  getMedia(constraints?: MediaTrackConstraints): MediaStream | null | undefined;
  dispose(): void;
}
//#endregion
//#region src/simulator/SimulatorConstants.d.ts
declare enum SimulatorRenderMode {
  DEFAULT = "default",
  STEREO_LEFT = "left",
  STEREO_RIGHT = "right"
}
//#endregion
//#region src/simulator/SimulatorControllerState.d.ts
declare class SimulatorControllerState {
  localControllerPositions: THREE.Vector3[];
  localControllerOrientations: THREE.Quaternion[];
  currentControllerIndex: number;
}
//#endregion
//#region src/simulator/handPoses/HandPoseJoints.d.ts
export type SimulatorHandPoseJoints = {
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
export type SimulatorHandJointRotationArray = [number, number, number];
export type SimulatorHandPoseRotations = Partial<Record<JointName, SimulatorHandJointRotationArray>>;
export type SimulatorHandPoseRotationRangeDegrees = readonly [minDegrees: number, maxDegrees: number];
export type SimulatorHandPoseRotationConstraintsDegrees = Partial<Record<JointName, readonly [x: SimulatorHandPoseRotationRangeDegrees, y: SimulatorHandPoseRotationRangeDegrees, z: SimulatorHandPoseRotationRangeDegrees]>>;
export declare const SIMULATOR_HAND_COMMON_BIOMECHANICAL_CONSTRAINTS_DEGREES: {
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
export declare function parseSimulatorHandPoseRotations(json: unknown): SimulatorHandPoseRotations;
//#endregion
//#region src/simulator/handPoses/HandPoses.d.ts
export declare enum SimulatorHandPose {
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
export declare const SIMULATOR_HAND_POSE_NAMES: Readonly<Record<SimulatorHandPose, string>>;
//#endregion
//#region src/simulator/scene/SimulatorPhysics.d.ts
/** Physics world isolated to the simulated physical environment. */
declare class SimulatorPhysics {
  private handOptions;
  readonly RAPIER: RAPIERCompat;
  readonly world: RAPIER.World;
  private hands;
  constructor(physics: Physics, handOptions: SimulatorHandPhysicsOptions);
  constrainHand(index: number, position: THREE.Vector3, enabled: boolean, handOrigin?: THREE.Vector3): void;
  private createHand;
  private clampHandToOrigin;
  private validateHandOptions;
  step(): void;
  dispose(): void;
}
//#endregion
//#region src/simulator/SimulatorHands.d.ts
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
  leftHandCurrentRotations: Partial<Record<"index-finger-metacarpal" | "index-finger-phalanx-distal" | "index-finger-phalanx-intermediate" | "index-finger-phalanx-proximal" | "index-finger-tip" | "middle-finger-metacarpal" | "middle-finger-phalanx-distal" | "middle-finger-phalanx-intermediate" | "middle-finger-phalanx-proximal" | "middle-finger-tip" | "pinky-finger-metacarpal" | "pinky-finger-phalanx-distal" | "pinky-finger-phalanx-intermediate" | "pinky-finger-phalanx-proximal" | "pinky-finger-tip" | "ring-finger-metacarpal" | "ring-finger-phalanx-distal" | "ring-finger-phalanx-intermediate" | "ring-finger-phalanx-proximal" | "ring-finger-tip" | "thumb-metacarpal" | "thumb-phalanx-distal" | "thumb-phalanx-proximal" | "thumb-tip" | "wrist", SimulatorHandJointRotationArray>>;
  rightHandCurrentRotations: Partial<Record<"index-finger-metacarpal" | "index-finger-phalanx-distal" | "index-finger-phalanx-intermediate" | "index-finger-phalanx-proximal" | "index-finger-tip" | "middle-finger-metacarpal" | "middle-finger-phalanx-distal" | "middle-finger-phalanx-intermediate" | "middle-finger-phalanx-proximal" | "middle-finger-tip" | "pinky-finger-metacarpal" | "pinky-finger-phalanx-distal" | "pinky-finger-phalanx-intermediate" | "pinky-finger-phalanx-proximal" | "pinky-finger-tip" | "ring-finger-metacarpal" | "ring-finger-phalanx-distal" | "ring-finger-phalanx-intermediate" | "ring-finger-phalanx-proximal" | "ring-finger-tip" | "thumb-metacarpal" | "thumb-phalanx-distal" | "thumb-phalanx-proximal" | "thumb-tip" | "wrist", SimulatorHandJointRotationArray>>;
  leftHandTargetRotations: Partial<Record<"index-finger-metacarpal" | "index-finger-phalanx-distal" | "index-finger-phalanx-intermediate" | "index-finger-phalanx-proximal" | "index-finger-tip" | "middle-finger-metacarpal" | "middle-finger-phalanx-distal" | "middle-finger-phalanx-intermediate" | "middle-finger-phalanx-proximal" | "middle-finger-tip" | "pinky-finger-metacarpal" | "pinky-finger-phalanx-distal" | "pinky-finger-phalanx-intermediate" | "pinky-finger-phalanx-proximal" | "pinky-finger-tip" | "ring-finger-metacarpal" | "ring-finger-phalanx-distal" | "ring-finger-phalanx-intermediate" | "ring-finger-phalanx-proximal" | "ring-finger-tip" | "thumb-metacarpal" | "thumb-phalanx-distal" | "thumb-phalanx-proximal" | "thumb-tip" | "wrist", SimulatorHandJointRotationArray>>;
  rightHandTargetRotations: Partial<Record<"index-finger-metacarpal" | "index-finger-phalanx-distal" | "index-finger-phalanx-intermediate" | "index-finger-phalanx-proximal" | "index-finger-tip" | "middle-finger-metacarpal" | "middle-finger-phalanx-distal" | "middle-finger-phalanx-intermediate" | "middle-finger-phalanx-proximal" | "middle-finger-tip" | "pinky-finger-metacarpal" | "pinky-finger-phalanx-distal" | "pinky-finger-phalanx-intermediate" | "pinky-finger-phalanx-proximal" | "pinky-finger-tip" | "ring-finger-metacarpal" | "ring-finger-phalanx-distal" | "ring-finger-phalanx-intermediate" | "ring-finger-phalanx-proximal" | "ring-finger-tip" | "thumb-metacarpal" | "thumb-phalanx-distal" | "thumb-phalanx-proximal" | "thumb-tip" | "wrist", SimulatorHandJointRotationArray>>;
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
  init({ input, physics, camera, simulatorOptions }: {
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
//#endregion
//#region src/simulator/internal/navmesh/SimulatorNavMesh.d.ts
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
//#endregion
//#region src/simulator/controlModes/SimulatorControlMode.d.ts
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
  init({ camera, input, interaction, timer, domElement, simulatorOptions }: {
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
//#endregion
//#region src/simulator/SimulatorInterface.d.ts
/**
 * Callbacks that gate the lazily-loaded day/night lighting behind the
 * simulator settings UI: nothing loads until the user enables it.
 */
interface SimulatorLightingBinding {
  isAvailable: () => boolean;
  isEnabled: () => boolean;
  getTimeOfDay: () => number;
  setEnabled: (enabled: boolean) => Promise<void> | void;
  setTimeOfDay: (timeOfDay: number) => void;
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
  private settingsElement?;
  private lighting?;
  constructor(simulatorElementsLoader?: SimulatorElementsLoader);
  /**
   * Initialize the simulator interface.
   */
  init(simulatorOptions: SimulatorOptions, simulatorControls: SimulatorControls, simulatorHands: SimulatorHands, input?: Input, setEnvironment?: (environment: SimulatorEnvironment) => Promise<void>, handPhysicsAvailable?: boolean, lighting?: SimulatorLightingBinding): Promise<void>;
  private ensureElementsAvailable;
  createSimulatorSettingsPanel(simulatorOptions: SimulatorOptions, simulatorControls: SimulatorControls, setEnvironment: (environment: SimulatorEnvironment) => Promise<void>, handPhysicsAvailable: boolean, lighting?: SimulatorLightingBinding): void;
  /**
   * Re-reads the day/night lighting binding into the settings panel. Called
   * after environment switches (the environment may declare lighting or not),
   * after enable/disable, and after API-driven changes so the slider can
   * never show a time of day the simulator is not actually at.
   */
  syncLightingState(): void;
  showInstructions(simulatorOptions: SimulatorOptions, simulatorMode?: SimulatorMode): void;
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
//#endregion
//#region src/simulator/interfaces/ISimulatorSettingsPanelElement.d.ts
interface ISimulatorSettingsPanelElement extends HTMLElement {
  environments: SimulatorEnvironment[];
  activeEnvironmentIndex: number;
  simulatorMode: SimulatorMode;
  instructionsEnabled?: boolean;
  handPhysicsAvailable: boolean;
  handPhysicsEnabled: boolean;
  dayNightAvailable: boolean;
  dayNightEnabled: boolean;
  timeOfDay: number;
}
//#endregion
//#region src/simulator/SimulatorControls.d.ts
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
  renderer?: WebGLOrWebGPURenderer;
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
  init({ camera, input, interaction, timer, renderer, simulatorOptions }: {
    camera: THREE.Camera;
    input: Input;
    interaction: Interaction;
    timer: THREE.Timer;
    renderer: WebGLOrWebGPURenderer;
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
  private onFocusIn;
  setSimulatorMode(mode: SimulatorMode): void;
  setSimulatorSettingsPanelElement(element: ISimulatorSettingsPanelElement): void;
  private onSetSimulatorMode;
  dispose(): void;
  setEnabled(value: boolean): void;
  private cancelPointerInteraction;
  private endPointerInteraction;
  private releasePointerCapture;
}
//#endregion
//#region src/simulator/scene/SimulatorScene.d.ts
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
//#endregion
//#region src/simulator/scene/SimulatorDepth.d.ts
declare class SimulatorDepth {
  private simulatorScene;
  private renderer;
  private depthRenderer;
  private camera;
  private depth;
  depthWidth: number;
  depthHeight: number;
  depthRenderTarget: THREE.WebGLRenderTarget;
  depthBuffer: Float32Array;
  private readonly tempClearColor;
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
  get depthMaterial(): THREE.Material;
  /**
   * Initialize Simulator Depth.
   */
  init(renderer: WebGLOrWebGPURenderer, camera: THREE.Camera, depth: Depth): Promise<void>;
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
//#endregion
//#region src/utils/DependencyInjection.d.ts
export type InjectableConstructor = Function & {
  dependencies?: Record<string, Constructor>;
};
export interface Injectable {
  init(...args: unknown[]): Promise<void> | void;
  constructor: InjectableConstructor;
}
/**
 * Call init on a script or subsystem with dependency injection.
 */
export declare function callInitWithDependencyInjection(script: Injectable, registry: Registry, fallback: unknown): Promise<void>;
//#endregion
//#region src/simulator/userActions/SimulatorUserAction.d.ts
declare class SimulatorUserAction implements Injectable {
  static dependencies: {};
  init(_options?: object): Promise<void>;
  play(_options?: object): Promise<void>;
}
//#endregion
//#region src/simulator/SimulatorUser.d.ts
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
//#endregion
//#region src/world/mesh/SimulatorMesh.d.ts
/**
 * A mesh injected into the {@link MeshDetector} by the desktop simulator.
 *
 * The real WebXR Mesh Detection API only produces meshes from
 * `frame.detectedMeshes`, which the simulator never provides. This is the
 * mesh-detection analog of {@link SimulatorPlane}: the simulator extracts the
 * ground-truth geometry of the loaded environment and feeds it to the
 * `MeshDetector` via `setSimulatorMeshes()`.
 */
export interface SimulatorMesh {
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
//#endregion
//#region src/world/mesh/DetectedMesh.d.ts
export declare class DetectedMesh extends THREE.Mesh {
  private RAPIER?;
  private rigidBody?;
  private collider?;
  private blendedWorld?;
  private lastChangedTime;
  semanticLabel?: string;
  get getRigidBody(): RAPIER.RigidBody | undefined;
  constructor(mesh: XRMesh | SimulatorMesh, material: THREE.Material);
  initRapierPhysics(RAPIER: typeof RAPIER, blendedWorld: RAPIER.World): void;
  updateVertices(mesh: XRMesh): void;
  dispose(): void;
}
//#endregion
//#region src/simulator/scene/SimulatorObjects.d.ts
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
  rigidBody?: RAPIER.RigidBody;
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
  init(renderer: WebGLOrWebGPURenderer, physics?: SimulatorPhysics): void;
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
//#endregion
//#region src/world/planes/SimulatorPlane.d.ts
export type SimulatorPlaneType = 'horizontal' | 'vertical';
export interface SimulatorPlane {
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
//#endregion
//#region src/world/objects/DetectedObject.d.ts
/**
 * Represents a single detected object in the XR environment and holds metadata
 * about the object's properties. Note: 3D object position is stored in the
 * position property of `Three.Object3D`.
 */
export declare class DetectedObject<T> extends THREE.Object3D {
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
//#endregion
//#region src/world/objects/ObjectDetector.d.ts
/**
 * Represents a detected object in a normalized format, independent of the specific detector backend used.
 * Coordinates are normalized typically in the range [0, 1].
 *
 * T - The type of additional data associated with the detected object.
 */
export interface NormalizedDetectedObject<T> {
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
export interface CameraSnapshot {
  base64?: string;
  imageData?: ImageData;
}
/** Inputs for one object detection run, without changing shared options. */
export interface ObjectDetectionOptions {
  /** Uses this backend for this run only; otherwise uses the configured backend. */
  backend?: WorldOptions['objects']['backendConfig']['activeBackend'];
  /**
   * Uses this frame instead of capturing another one. Gemini requires
   * `base64`; MediaPipe requires `imageData`. Both may be supplied for the
   * same frame. Capture and submit in the same frame so the camera pose and
   * depth mesh match, and do not modify the pixels until the run completes.
   */
  snapshot?: CameraSnapshot;
}
export interface SimulatorDetectedObjectInput<T = unknown> {
  label: string;
  position: THREE.Vector3;
  boundingBox: THREE.Box2;
  data?: T;
}
export interface SimulatorObjectDetectionSource {
  detect(): SimulatorDetectedObjectInput[];
}
/**
 * Detects objects in the user's environment using a specified backend.
 * It queries an AI model with the device camera feed and returns located
 * objects with 2D and 3D positioning data.
 */
export declare class ObjectDetector extends Script {
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
  private pendingDetectionPromise;
  private lastContinuousDetectionStartedAtMs;
  private initialized;
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
  init({ options, ai, aiOptions, deviceCamera, depth, camera, renderer }: {
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
   * Detection starts on the next update after initialization.
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
   * - Supplying a snapshot or backend queues a separate one-off run after
   *   pending detections, without changing the continuous detector's options.
   *   Supplied snapshots retain the camera pose and depth at submission time.
   *   Simulator ground truth, when installed, still takes precedence.
   *
   * @param options - Optional inputs for this run only.
   * @returns A promise that resolves with an
   * array of detected `DetectedObject` instances.
   * @throws If an explicit backend or snapshot is invalid, or the detector
   * is disposed before a queued request starts.
   */
  runDetection<T = null>(options?: ObjectDetectionOptions): Promise<DetectedObject<T>[]>;
  private runDetectionWithOverrides;
  private runOneOffDetection;
  /** Installs or removes the desktop simulator's ground-truth detector. */
  setSimulatorSource(source?: SimulatorObjectDetectionSource): this;
  private runDetectionInternal;
  private captureDetectionFrame;
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
//#endregion
//#region src/world/planes/DetectedPlane.d.ts
/**
 * Represents a single detected plane in the XR environment. It's a THREE.Mesh
 * that also holds metadata about the plane's properties.
 * Note: This requires chrome://flags/#openxr-spatial-entities to be enabled.
 */
export declare class DetectedPlane extends THREE.Mesh {
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
//#endregion
//#region src/world/planes/PlaneDetector.d.ts
/**
 * Detects and manages real-world planes provided by the WebXR Plane Detection
 * API. It creates, updates, and removes `Plane` mesh objects in the scene.
 */
export declare class PlaneDetector extends Script {
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
  init({ options, renderer }: {
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
//#endregion
//#region src/world/anchors/SimulatorAnchor.d.ts
/** A pose expressed as plain arrays, so it can be stored as JSON. */
export interface StorablePose {
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
export declare class SimulatorAnchor {
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
//#endregion
//#region src/world/anchors/AnchorTypes.d.ts
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
export type AnchorCapability =
/** No anchor support at all; anchor calls are no-ops. */
'unsupported' |
/** Anchors can be created, but not carried into a later session. */
'session-only' |
/** Anchors can be created and restored in later sessions. */
'persistent' |
/**
 * No platform anchors; the subsystem is holding poses itself so an app can
 * be developed on desktop. Nothing here is really pinned to the room.
 */
'simulated';
/** A saved anchor, as written to storage. */
export interface AnchorRecord {
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
export type AnchorRestoreStatus =
/** The anchor came back and is usable. */
'restored' |
/** The platform could not resolve this handle here. */
'not-found' |
/** The platform cannot restore anchors at all. */
'unsupported';
/** Outcome of restoring a single saved anchor. */
export interface AnchorRestoreResult {
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
export interface TrackedAnchorLike {
  /** Stable id within the session. */
  id: string;
  /** Caller-supplied label. */
  label: string;
  /** Persistent handle, when one has been requested. */
  uuid?: string;
}
//#endregion
//#region src/world/anchors/AnchorStore.d.ts
/**
 * Storage for persistent anchor handles.
 *
 * Behind an interface so the persistence rules can be unit tested without a
 * browser, and so an app can swap in its own backing store.
 */
export interface AnchorStore {
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
//#endregion
//#region src/world/anchors/AnchorManager.d.ts
/** An anchor currently held by the manager. */
export interface TrackedAnchor {
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
export declare class AnchorManager extends Script {
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
  init({ options, renderer, xrReferenceSpaceCache }: {
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
//#endregion
//#region src/world/mesh/MeshDetector.d.ts
export declare class MeshDetector extends Script {
  static readonly dependencies: {
    options: typeof MeshDetectionOptions;
    renderer: typeof THREE.WebGLRenderer;
  };
  private debugMaterials;
  private fallbackDebugMaterial;
  xrMeshToThreeMesh: Map<SimulatorMesh | XRMesh, DetectedMesh>;
  threeMeshToXrMesh: Map<DetectedMesh, SimulatorMesh | XRMesh>;
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
  init({ options, renderer }: {
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
//#endregion
//#region src/world/sounds/DetectedSounds.d.ts
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
//#endregion
//#region src/world/sounds/SoundDetector.d.ts
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
//#endregion
//#region src/world/humans/DetectedBodyPose.d.ts
/**
 * Names of key human body joints and anatomical landmarks.
 * Includes standard MediaPipe pose landmarks and composite landmarks for
 * skeletal animation compatibility (e.g., Hips, Spine, Chest, Neck, Head).
 */
export declare enum PoseJointName {
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
export interface PoseLandmark {
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
export declare class DetectedBodyPose extends THREE.Object3D {
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
//#endregion
//#region src/world/humans/HumanRecognizer.d.ts
/**
 * A detector script that orchestrates human body pose estimation.
 * Manages the backend pose detector lifecycle (e.g., MediaPipe) and exposes the detected
 * poses, including 3D joint landmarks, in the world coordinate space.
 */
export declare class HumanRecognizer extends Script {
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
  init({ options, deviceCamera, depth, camera, renderer }: {
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
//#endregion
//#region src/world/faces/DetectedFace.d.ts
/**
 * A single facial landmark point. MediaPipe's FaceLandmarker emits 478
 * of these per face (468 from the canonical face mesh + 10 iris points).
 */
export interface FaceLandmark {
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
export interface FaceBlendshape {
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
export declare enum FaceLandmarkName {
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
export declare class DetectedFace extends THREE.Object3D {
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
//#endregion
//#region src/world/faces/FaceRecognizer.d.ts
/**
 * A detector script that orchestrates face landmark estimation. Manages
 * the backend face detector lifecycle (e.g. MediaPipe) and exposes the
 * detected faces, including 3D landmark positions, blendshape weights,
 * and rigid head transforms, in the world coordinate space.
 */
export declare class FaceRecognizer extends Script {
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
  init({ options, deviceCamera, depth, camera, renderer }: {
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
//#endregion
//#region src/world/segmentation/SegmentationMask.d.ts
/**
 * Per-pixel semantic categories emitted by the selfie multiclass segmentation
 * model. Index `0` is the background; every other index is part of a person,
 * so anything `>= 1` can be treated as foreground.
 */
export declare enum SegmentCategory {
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
export interface SegmentationMask {
  /** Row-major per-pixel category indices, length `width * height`. */
  data: Uint8Array;
  /** Mask width in pixels. */
  width: number;
  /** Mask height in pixels. */
  height: number;
}
//#endregion
//#region src/world/segmentation/Segmenter.d.ts
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
export declare class Segmenter extends Script {
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
  init({ options, deviceCamera }: {
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
//#endregion
//#region src/world/World.d.ts
/**
 * Manages all interactions with the real-world environment perceived by the XR
 * device. This class abstracts the complexity of various perception APIs
 * (Depth, Planes, Meshes, etc.) and provides a simple, event-driven interface
 * for developers to use `this.world.planes` and `this.world.meshes`.
 */
export declare class World extends Script {
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
  init({ options, camera, waitFrame, timer }: {
    options: WorldOptions;
    camera: THREE.Camera;
    waitFrame: WaitFrame;
    timer: THREE.Timer;
  }): Promise<void>;
  /**
   * Unimplemented placeholder. Does not place or anchor the object.
   *
   * @throws Always throws an error because this method is not implemented.
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
   * See /templates/03_spatial_placement/ for a complete placement example.
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
//#endregion
//#region src/simulator/scene/SimulatorWorld.d.ts
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
declare namespace Simulator_d_exports {
  export { Simulator, SimulatorUserPath };
}
interface SimulatorUserPath {
  target: THREE.Vector3;
  path: THREE.Vector3[];
}
declare class Simulator extends Script {
  private renderMainScene;
  renderer?: WebGLOrWebGPURenderer | undefined;
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
  simulatorCamera?: SimulatorCamera;
  options: SimulatorOptions;
  mainCamera: THREE.Camera;
  mainScene: THREE.Scene;
  private initialized;
  private compositor?;
  private readonly backgroundVideo;
  private currentVideoTexture?;
  private registry?;
  private world?;
  private objectDetectionSource?;
  private deviceCamera?;
  private useSimulatorObjectDetection;
  constructor(renderMainScene: (cameraOverride?: THREE.Camera) => void, renderer?: WebGLOrWebGPURenderer | undefined);
  get userMovementConstrained(): boolean;
  moveUser(desiredCameraPosition: THREE.Vector3): void;
  findRandomUserPath(): SimulatorUserPath | null;
  init({ simulatorOptions, input, interaction, timer, camera, scene, registry, options, depth, world }: {
    simulatorOptions: SimulatorOptions;
    input: Input;
    interaction: Interaction;
    timer: THREE.Timer;
    camera: THREE.Camera;
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
  /**
   * Sets the time of day for the active environment's day/night lighting
   * (0 = day endpoint, 1 = night endpoint). Initializes the lighting lazily
   * on first use. No-op when the active environment declares no day/night
   * lighting.
   */
  setTimeOfDay(t: number): Promise<void>;
  /**
   * Fetches the active environment's night bake ahead of first use so the
   * day/night lighting can start without a visible delay. No-op when the
   * active environment declares no day/night lighting.
   */
  preloadDayNight(): Promise<void>;
  /**
   * Enables or disables day/night lighting for the active environment. The
   * DayNightCycle chunk and the night bake are only fetched on first enable,
   * never at environment load. No-op when the active environment declares no
   * day/night lighting.
   */
  setDayNightEnabled(enabled: boolean): Promise<void>;
  /** True when day/night lighting is enabled for the active environment. */
  get dayNightEnabled(): boolean;
  physicsStep(): void;
  onXRSessionStarted(): void;
  onXRSessionEnded(): void;
  dispose(): void;
  simulatorUpdate(): void;
  setStereoRenderMode(mode: SimulatorRenderMode): void;
  setupStereoCameras(camera: THREE.Camera): void;
  getRenderCamera(): THREE.Camera;
  /**
   * Renders one complete simulator frame (physical environment + virtual scene)
   * to the default framebuffer. Called by Core when the simulator is running.
   */
  renderFrame(): void;
  private setVideoPath;
}
//#endregion
//#region src/input/gestures/GestureEvents.d.ts
export type GestureEventType = 'gesturestart' | 'gestureupdate' | 'gestureend';
export type GestureHandedness = 'left' | 'right';
export interface GestureEventDetail {
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
export interface GestureEvent {
  type: GestureEventType;
  detail: GestureEventDetail;
}
//#endregion
//#region src/input/gestures/GestureRecognition.d.ts
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
export declare class GestureRecognition extends Script<GestureRecognitionEventMap> {
  static dependencies: {
    user: typeof User;
    options: typeof GestureRecognitionOptions;
  };
  private options;
  private activeGestures;
  private latestScores;
  private pendingRecognition;
  private lastEvaluation;
  init({ options, user }: {
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
//#endregion
//#region src/lighting/Lighting.d.ts
/**
 * Lighting provides XR lighting capabilities within the XR Blocks framework.
 * It uses webXR to propvide estimated lighting that matches the environment
 * and supports casting shadows from the estimated light.
 */
export declare class Lighting {
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
//#endregion
//#region src/core/components/XRTransition.d.ts
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
    pointerEvents: 'none';
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
  init({ renderer, camera, timer, scene, options }: {
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
//#endregion
//#region src/core/Core.d.ts
export type CoreLifecycleState = 'new' | 'initializing' | 'running' | 'disposing' | 'disposed';
type SimulatorModule = typeof Simulator_d_exports;
type SimulatorLoader = () => Promise<SimulatorModule>;
/**
 * Core is the central engine of the XR Blocks framework, acting as a
 * singleton manager for all XR subsystems. Its primary goal is to abstract
 * low-level WebXR and THREE.js details, providing a simplified and powerful API
 * for developers and AI agents to build interactive XR applications.
 */
export declare class Core {
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
  private onBeforeWebXRSessionStart;
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
  get currentFrame(): XRFrame | null | undefined;
  scriptsManager: ScriptsManager;
  renderSceneOverride?: (renderer: WebGLOrWebGPURenderer, scene: THREE.Scene, camera: THREE.Camera) => void;
  webXRSessionManager?: WebXRSessionManager;
  permissionsManager: PermissionsManager;
  /**
   * The WebGL or WebGPU renderer, created during {@link Core.init}. Reading it
   * before `init()` has run returns `undefined` and logs a one-time warning.
   */
  get renderer(): WebGLOrWebGPURenderer;
  set renderer(renderer: WebGLOrWebGPURenderer);
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
//#endregion
//#region src/VisemeWeights.d.ts
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
export interface VisemeWeights {
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
export declare const ZERO_VISEME: Readonly<VisemeWeights>;
//#endregion
//#region src/StylizedFace.d.ts
export interface StylizedFaceOptions {
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
export interface LipMetrics {
  /** Horizontal mouth width, normalised. Wider for /ee/, narrower for /oo/. */
  width: number;
  /** Vertical mouth opening, 0 (closed line) to ~1 (fully agape). */
  openHeight: number;
}
export declare class StylizedFace extends Script {
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
//#endregion
//#region src/depth/DepthDebugUtils.d.ts
/**
 * Generates a visual representation of the current depth buffer on a
 * {@link Depth} instance and triggers a download for debugging.
 * @param depth - The depth subsystem instance.
 * @param viewIndex - The depth view index to visualize.
 */
export declare function visualizeDepth(depth: Depth, viewIndex?: number): void;
/**
 * Generates a visual representation of a depth map, normalized to 0-1 range,
 * and triggers a download for debugging.
 * @param depthArray - The raw depth data array.
 * @param width - The depth map width in pixels.
 * @param height - The depth map height in pixels.
 */
export declare function visualizeDepthMap(depthArray: DepthArray, width: number, height: number): void;
//#endregion
//#region src/depth/occlusion/OcclusionPass.d.ts
export interface OcclusionPassBackend {
  setDepthTexture(depthTexture: THREE.Texture, rawValueToMeters: number, viewId: number, depthNear?: number, depthViewMatrix?: THREE.Matrix4, depthProjectionMatrix?: THREE.Matrix4): void;
  render(renderer: WebGLOrWebGPURenderer, writeBuffer?: THREE.RenderTarget, readBuffer?: THREE.RenderTarget, viewId?: number): void;
  updateOcclusionMapUniforms(uniforms: ShaderUniforms, renderer: WebGLOrWebGPURenderer): void;
  dispose(): void;
}
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
export declare class OcclusionPass extends Pass implements OcclusionPassBackend {
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
  private disposed;
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
  render(renderer: WebGLOrWebGPURenderer, writeBuffer?: THREE.WebGLRenderTarget, readBuffer?: THREE.WebGLRenderTarget, viewId?: number): void;
  renderOcclusionMapFromScene(renderer: THREE.WebGLRenderer, dimensions: THREE.Vector2, viewId: number): void;
  renderOcclusionMapFromReadBuffer(renderer: THREE.WebGLRenderer, readBuffer: THREE.RenderTarget, dimensions: THREE.Vector2, viewId: number): void;
  blurOcclusionMap(renderer: THREE.WebGLRenderer, dimensions: THREE.Vector2): void;
  private resizeOcclusionMap;
  private resizeKawaseBlur;
  applyOcclusionMapToRenderedImage(renderer: THREE.WebGLRenderer, readBuffer?: THREE.WebGLRenderTarget, writeBuffer?: THREE.WebGLRenderTarget): void;
  dispose(): void;
  updateOcclusionMapUniforms(uniforms: ShaderUniforms, renderer: WebGLOrWebGPURenderer): void;
}
//#endregion
//#region src/depth/occlusion/OcclusionUtils.d.ts
export declare class OcclusionUtils {
  private static webgpuMaterialHandler?;
  private static pendingMaterials;
  /**
   * Registers or clears the WebGPU TSL material occlusion handler.
   * Called internally by `Depth.init()` when `WebGPURenderer` is active.
   */
  static setWebGPUMaterialHandler(handler: ((material: THREE.Material) => Shader) | undefined): void;
  /**
   * Configures a material for depth occlusion across both `WebGLRenderer` and
   * `WebGPURenderer`, invoking `onShaderReady` with the uniform handle to
   * register in `Depth.occludableShaders`.
   */
  static addOcclusionToMaterial(material: THREE.Material, onShaderReady?: (shader: Shader) => void): void;
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
//#endregion
//#region src/generative/BackgroundKeyer.d.ts
/** A raw RGBA image: `data` is width*height*4 bytes, row-major. */
export interface RgbaImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}
/** Options for {@link keyOutBackground}. */
export interface BackgroundKeyOptions {
  /**
   * Maximum Euclidean RGB distance (0-441) from the sampled background color
   * for a pixel to be treated as background and made transparent.
   */
  tolerance?: number;
}
/**
 * Estimates the background color of an image by averaging its four corner
 * pixels. Generated images that place the subject on a plain, uniform
 * background (the generative_object demo instructs the model to do so) have
 * corners that are a reliable sample.
 * @param image - The source RGBA image.
 * @returns The estimated `[r, g, b]` background color (0-255).
 */
export declare function estimateBackgroundColor(image: RgbaImage): [number, number, number];
/**
 * Makes background-colored pixels transparent, turning a subject-on-a-plain-
 * background image into a clean cutout. Operates on a copy; the input is not
 * mutated.
 * @param image - The source RGBA image.
 * @param options - Keying options.
 * @returns A new {@link RgbaImage} with background pixels set to alpha 0.
 */
export declare function keyOutBackground(image: RgbaImage, options?: BackgroundKeyOptions): RgbaImage;
/**
 * Builds a grayscale displacement map from a keyed image: background pixels
 * (alpha 0) become black (no displacement) and subject pixels become their
 * luminance. Masking by alpha keeps the transparent background from displacing
 * into stray geometry. The result is opaque RGBA.
 * @param image - A keyed RGBA image (background already at alpha 0).
 * @returns A new opaque {@link RgbaImage} usable as a displacement/bump map.
 */
export declare function buildDisplacementMap(image: RgbaImage): RgbaImage;
//#endregion
//#region src/generative/GenerativeObjectUtils.d.ts
/**
 * Computes an aspect-ratio-preserving plane size whose largest side equals
 * `maxSize`. Used to scale a generated image so it reads at a comfortable size
 * regardless of the model's output resolution.
 * @param imageWidth - Source image width in pixels.
 * @param imageHeight - Source image height in pixels.
 * @param maxSize - Largest dimension of the resulting plane, in meters.
 * @param target - Optional output vector to write into.
 * @returns `target` set to the plane's [width, height] in meters.
 */
export declare function computeBillboardScale(imageWidth: number, imageHeight: number, maxSize: number, target?: THREE.Vector2): THREE.Vector2;
/**
 * Computes a world-space pose `distance` meters in front of the camera,
 * oriented so its front face (+Z) points back toward the user. Copy the result
 * straight onto a direct child of the scene; for an object under a transformed
 * parent, convert it into the parent's space first.
 * @param camera - The user's camera.
 * @param distance - Distance in front of the camera, in meters.
 * @param position - Optional output world position.
 * @param quaternion - Optional output world orientation.
 * @returns The world position and orientation.
 */
export declare function poseInFrontOfCamera(camera: THREE.Camera, distance: number, position?: THREE.Vector3, quaternion?: THREE.Quaternion): {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
};
/**
 * Computes a world-space orientation that turns a plane's front face (+Z)
 * toward the camera while keeping the object upright (yaw only). Used to
 * billboard a generated cutout so it faces the user like a standee, without
 * tilting. Apply it directly to a child of the scene; under a transformed
 * parent, convert it into the parent's space first.
 * @param objectPosition - World position of the object.
 * @param cameraPosition - World position of the camera.
 * @param target - Optional output world orientation.
 * @returns `target` oriented so +Z points toward the camera, staying upright.
 */
export declare function quaternionFacingCamera(objectPosition: THREE.Vector3, cameraPosition: THREE.Vector3, target?: THREE.Quaternion): THREE.Quaternion;
//#endregion
//#region src/layers/LayerCapability.d.ts
/**
 * Detects what the running platform can do with WebXR composition layers.
 *
 * Layers are optional in two independent places: the session may not have been
 * granted the `layers` feature, and the binding may not offer the layer type
 * wanted. A session existing says nothing about either, so both get probed.
 *
 * `XRMediaBinding` is called out separately because it is the cheap path for
 * video, the compositor drives the video element and the app never draws a
 * frame for it, but it is far less widely implemented than the WebGL path.
 * Chrome ships quad layers via `XRWebGLBinding` and does not ship
 * `XRMediaBinding` at all, so a video layer has to work both ways.
 */
export type LayerCapability = 'media' | 'webgl' | 'unsupported';
/**
 * Works out how this platform can back a quad layer.
 *
 * @param session - The active XR session, if any.
 * @param binding - The WebGL binding, if one exists.
 * @param preferWebGL - Take the WebGL path even where a media binding exists.
 *   Quest ships both, so without this the WebGL path has no hardware to run
 *   on: every device that can take it would take the media path instead.
 * @returns Which layer path is available.
 */
export declare function layerCapability(session: XRSession | null | undefined, binding: XRWebGLBinding | null | undefined, preferWebGL?: boolean): LayerCapability;
/**
 * Whether a capability can actually present a layer.
 *
 * @param capability - Result of {@link layerCapability}.
 * @returns True when a quad layer can be created.
 */
export declare function isLayerCapable(capability: LayerCapability): boolean;
//#endregion
//#region src/layers/LayerManager.d.ts
/**
 * Owns the composition layers an app adds on top of the scene.
 *
 * three.js sets `layers: [projectionLayer]` once when the session starts and
 * never touches that array again, so anything extra has to be composed back in
 * together with its layer. Dropping the projection layer would blank the scene,
 * which is why {@link setBaseLayer} is required before anything is added.
 *
 * Ordering follows the layers spec: earlier entries are composited behind later
 * ones, so the projection layer goes first and app layers sit in front of it.
 */
export declare class LayerManager {
  private session;
  private binding;
  private gl;
  private baseLayer;
  private readonly layers;
  private capability;
  private preferWebGL;
  /**
   * Forces the WebGL path on platforms that also offer a media binding.
   *
   * Quest has both and would otherwise always take the media path, so without
   * this the WebGL path cannot be exercised on the hardware most likely to be
   * to hand.
   *
   * @param prefer - Whether to take WebGL over media.
   */
  setPreferWebGL(prefer: boolean): void;
  /**
   * Binds the manager to a session.
   *
   * @param session - The active session, or null when one ends.
   * @param binding - The WebGL binding, if one exists.
   * @param gl - The context the binding was made against. Needed to upload
   *   frames into a layer's texture on the WebGL path.
   */
  setSession(session: XRSession | null, binding?: XRWebGLBinding | null, gl?: WebGL2RenderingContext | null): void;
  /** @returns The WebGL binding, if the session has one. */
  getBinding(): XRWebGLBinding | null;
  /** @returns The context layer textures are uploaded through. */
  getContext(): WebGL2RenderingContext | null;
  /**
   * Records the layer three.js renders the scene into.
   *
   * @param layer - The projection or WebGL layer backing the scene.
   */
  setBaseLayer(layer: XRLayer | null): void;
  /** @returns Which layer path this platform supports. */
  getCapability(): LayerCapability;
  /** @returns True when a layer can actually be presented. */
  isSupported(): boolean;
  /** @returns The layers currently composited in front of the scene. */
  getLayers(): readonly XRLayer[];
  /**
   * Adds a layer in front of the scene.
   *
   * @param layer - Layer to present.
   * @returns True when it was added and submitted.
   */
  add(layer: XRLayer): boolean;
  /**
   * Removes a layer.
   *
   * @param layer - Layer to stop presenting.
   * @returns True when it was present and removed.
   */
  remove(layer: XRLayer): boolean;
  /**
   * Pushes the current layer stack to the compositor.
   *
   * Always includes the base layer, since replacing the array without it would
   * leave the scene itself unrendered.
   */
  private submit;
}
//#endregion
//#region src/layers/VideoLayer.d.ts
/**
 * How a video should sit in the world.
 *
 * A quad layer is positioned by the compositor rather than by the scene graph,
 * so it needs its pose given explicitly rather than inherited from a parent.
 */
export type VideoLayerPlacement = {
  /** Where the centre of the quad sits, in the reference space. */
  position?: THREE.Vector3;
  /** How the quad is oriented. */
  quaternion?: THREE.Quaternion;
  /** Width in metres. */
  width?: number;
  /** Height in metres. Derived from the video's aspect when omitted. */
  height?: number;
};
/** What backing a video ended up with. */
export type VideoLayerState = 'layer' | 'fallback';
/** Which binding produced the layer. */
export type VideoLayerPath = 'media' | 'webgl' | 'none';
/**
 * Presents a video as a composition layer where the platform allows it.
 *
 * The point is resampling. Drawn into the scene, a video goes into the eye
 * buffer and is then warped again by the compositor, so it is sampled twice and
 * the first of those is into a buffer that is already lower resolution than the
 * panel. As a layer it is sampled once, at its own resolution.
 *
 * Reports {@link VideoLayerState} rather than throwing when it cannot, so an
 * app can ask for a layer everywhere and draw the video into the scene on the
 * platforms that have no layers.
 */
export declare class VideoLayer {
  private readonly manager;
  private layer;
  private state;
  private path;
  private video;
  private sourceWidth;
  private sourceHeight;
  private uploads;
  private lastFrameTime;
  /**
   * @param manager - Owns the layer stack this layer joins.
   */
  constructor(manager: LayerManager);
  /** @returns Whether the video is being presented as a layer. */
  getState(): VideoLayerState;
  /** @returns Which binding is presenting the video. */
  getPath(): VideoLayerPath;
  /** @returns The underlying layer, if one was created. */
  getLayer(): XRQuadLayer | null;
  /**
   * Tries to present a video element as a quad layer.
   *
   * @param video - The element to present. Must already have metadata loaded
   *   for its aspect ratio to be known.
   * @param session - The active XR session.
   * @param space - Reference space the placement is expressed in.
   * @param placement - Where to put the quad.
   * @returns Whether a layer was created.
   */
  attach(video: HTMLVideoElement, session: XRSession, space: XRReferenceSpace, placement?: VideoLayerPlacement): boolean;
  /**
   * Draws the current video frame into the layer.
   *
   * Only the WebGL path needs this: on the media path the compositor pulls
   * frames from the element itself and the app never draws one. Safe to call
   * every frame regardless.
   *
   * @param frame - The frame being rendered.
   */
  update(frame: XRFrame): void;
  /**
   * How many frames have actually been uploaded.
   *
   * On the WebGL path the app draws every frame itself, so a count that stays
   * at zero is the difference between a layer that is presenting and one that
   * was created and then quietly did nothing.
   *
   * @returns Number of successful uploads since attaching.
   */
  getUploadCount(): number;
  /** Stops presenting the layer and returns the video to the scene. */
  detach(): void;
}
/**
 * Aspect ratio of a video, falling back to 16:9 before metadata arrives.
 *
 * @param video - The element to measure.
 * @returns Width divided by height.
 */
export declare function aspectRatioOf(video: HTMLVideoElement): number;
//#endregion
//#region src/input/strokes/StrokeRecognizerBackend.d.ts
/**
 * The result of a stroke recognition attempt.
 */
interface StrokeRecognitionResult {
  /** The name of the recognized shape. */
  recognizedShape: string;
  /** The confidence score of the recognition, typically between 0 and 1. */
  confidence: number;
}
//#endregion
//#region src/input/strokes/StrokeRecognition.d.ts
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
export interface StrokeEventMap extends THREE.Object3DEventMap {
  unistrokestart: UnistrokeEvent;
  unistrokeupdate: UnistrokeEvent;
  unistrokeend: UnistrokeEvent;
}
/**
 * StrokeRecognizer is a framework Script that handles recording hand stroke gestures
 * and recognizing them as geometric shapes using a configured provider.
 * It listens to gesture events and tracks specified hand joints to record the path.
 */
export declare class StrokeRecognizer extends Script<StrokeEventMap> {
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
  init({ scene, camera, user, options }: {
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
   * Deactivates the stroke recognizer, cancels recording without an end event,
   * and clears any captured points. The next stroke starts with a fresh delay
   * and hand selection after reactivation.
   * Callers should clear any in-progress stroke UI when deactivating.
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
//#endregion
//#region src/input/gestures/HandPoseMetrics.d.ts
export type FingerName = 'index' | 'middle' | 'ring' | 'pinky';
export type DigitName = 'thumb' | FingerName;
export type PalmPose = {
  center: THREE.Vector3;
  width: number;
  normal: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
};
export declare const FINGER_ORDER: FingerName[];
export declare function getFingerJoint(context: HandContext, finger: FingerName, suffix: string): THREE.Vector3 | undefined;
export declare function estimateHandScale(context: HandContext): number;
export declare function getPalmWidth(context: HandContext): number | null;
export declare function getPalmNormal(context: HandContext): THREE.Vector3 | null;
export declare function getPalmRight(context: HandContext): THREE.Vector3 | null;
export declare function getPalmUp(context: HandContext): THREE.Vector3 | null;
export declare function getPalmPose(context: HandContext): PalmPose | null;
export declare function getFingerBendAngles(context: HandContext, finger: FingerName): number[];
export declare function getFingerStraightness(context: HandContext, finger: FingerName): number;
export declare function getFingerCurl(context: HandContext, finger: FingerName): number;
export declare function getFingerDirection(context: HandContext, finger: FingerName): THREE.Vector3 | null;
export declare function getFingerPalmAlignment(context: HandContext, finger: FingerName): number;
export declare function getFingerSpread(context: HandContext, fingerA: FingerName, fingerB: FingerName): number;
export declare function getAdjacentFingerSpreads(context: HandContext): {
  indexMiddle: number;
  middleRing: number;
  ringPinky: number;
};
export declare function getThumbBendAngles(context: HandContext): number[];
export declare function getThumbStraightness(context: HandContext): number;
export declare function getThumbCurl(context: HandContext): number;
export declare function getThumbDirection(context: HandContext): THREE.Vector3 | null;
export declare function getThumbOpposition(context: HandContext, finger?: FingerName): number;
export declare function getThumbVerticalDirection(context: HandContext): number;
export declare function getFingertipDistance(context: HandContext, digitA: DigitName, digitB: DigitName): number | null;
export declare function getFingertipPalmDistance(context: HandContext, digit: DigitName): number | null;
export declare function getBoneVectors(context: HandContext): THREE.Vector3[];
export declare function getRelativeBoneAngles(context: HandContext): Float32Array<ArrayBuffer>;
export declare function average(values: number[]): number;
export declare function clamp01(value: number): number;
//#endregion
//#region src/input/gestures/poseEstimators/WebXRHandPoseEstimator.d.ts
export type WebXRJointRotations = Map<JointName, THREE.Quaternion>;
export declare class WebXRHandContext implements HandContext {
  handedness: Handedness;
  handLabel: HandLabel;
  joints: JointPositions;
  jointRotations: WebXRJointRotations;
  constructor(handedness: Handedness, handLabel: HandLabel, joints: JointPositions, jointRotations: WebXRJointRotations);
  getJoint(jointName: JointName): THREE.Vector3 | undefined;
}
export declare class WebXRHandPoseEstimator implements PoseEstimator {
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
//#endregion
//#region src/input/gestures/poseEstimators/MediaPipeHandPoseEstimator.d.ts
export type MediaPipeHandLandmark = {
  x: number;
  y: number;
  z?: number;
};
export declare class MediaPipeHandContext implements HandContext {
  handedness: Handedness;
  handLabel: HandLabel;
  joints: JointPositions;
  constructor(handedness: Handedness, handLabel: HandLabel, landmarks: MediaPipeHandLandmark[]);
  getJoint(jointName: JointName): THREE.Vector3 | undefined;
}
export declare class MediaPipeHandPoseEstimator implements PoseEstimator {
  init(): Promise<void>;
  getHandContext(_handedness: Handedness): HandContext | null;
  getHandContexts(): Partial<Record<'left' | 'right', HandContext>>;
}
//#endregion
//#region src/input/gestures/poseEstimators/TensorFlowHandPoseEstimator.d.ts
export declare class TensorFlowHandPoseEstimator implements PoseEstimator {
  init(): Promise<void>;
  getHandContext(_handedness: Handedness): HandContext | null;
  getHandContexts(): Partial<Record<'left' | 'right', HandContext>>;
}
//#endregion
//#region src/input/gestures/gestureRecognizers/HeuristicGestureRecognizer.d.ts
export declare class HeuristicGestureRecognizer implements GestureRecognizer {
  private gestures;
  constructor(initBuiltInGestures?: boolean);
  registerGesture(name: string, detector: HeuristicGestureDetector, config?: DeepReadonly<Partial<GestureConfiguration>>): this;
  unregisterGesture(name: string): this;
  getGestureConfigurations(): Record<string, GestureConfiguration>;
  recognize(context: HandContext): GestureScoreMap;
  private registerBuiltInGestures;
}
//#endregion
//#region src/input/headGestures/gestureRecognizers/BuiltInHeuristicHeadGestures.d.ts
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
//#endregion
//#region src/input/headGestures/gestureRecognizers/HeuristicHeadGestureRecognizer.d.ts
export declare class HeuristicHeadGestureRecognizer implements HeadGestureRecognizer {
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
//#endregion
//#region src/simulator/events/SimulatorEnvironmentEvents.d.ts
export declare class SetSimulatorEnvironmentEvent extends Event {
  environmentIndex: number;
  static type: string;
  constructor(environmentIndex: number);
}
//#endregion
//#region src/simulator/events/SimulatorHandEvents.d.ts
export declare class SimulatorHandPoseChangeRequestEvent extends Event {
  pose: SimulatorHandPose;
  static type: string;
  constructor(pose: SimulatorHandPose);
}
//#endregion
//#region src/simulator/events/SimulatorModeEvents.d.ts
export declare class SetSimulatorModeEvent extends Event {
  simulatorMode: SimulatorMode;
  static type: string;
  constructor(simulatorMode: SimulatorMode);
}
//#endregion
//#region src/simulator/events/SimulatorInstructionsEvents.d.ts
export declare class ShowSimulatorInstructionsEvent extends Event {
  simulatorMode?: SimulatorMode | undefined;
  static type: string;
  constructor(simulatorMode?: SimulatorMode | undefined);
}
//#endregion
//#region src/simulator/events/SimulatorPhysicsEvents.d.ts
export declare class SetSimulatorHandPhysicsEvent extends Event {
  enabled: boolean;
  static type: string;
  constructor(enabled: boolean);
}
//#endregion
//#region src/simulator/handPoses/HandPoseFK.d.ts
export declare function applySimulatorHandPoseRotationConstraints(rotations: SimulatorHandPoseRotations): SimulatorHandPoseRotations;
export declare function resolveSimulatorHandPoseRotations(handedness: Handedness, rotations: SimulatorHandPoseRotations, applyConstraints?: boolean): SimulatorHandPoseJoints;
export declare function resolveSimulatorRotationsFromKeypoints(handedness: Handedness, joints: DeepReadonly<SimulatorHandPoseJoints>, applyConstraints?: boolean): SimulatorHandPoseRotations;
//#endregion
//#region src/simulator/handPoses/HandPoseRotations.d.ts
export declare const SIMULATOR_HAND_POSE_ROTATIONS: Readonly<Record<SimulatorHandPose, SimulatorHandPoseRotations>>;
//#endregion
//#region src/simulator/scene/SimulatorDepthMaterial.d.ts
declare class SimulatorDepthMaterial extends THREE.MeshBasicMaterial {
  onBeforeCompile(shader: {
    vertexShader: string;
    fragmentShader: string;
    uniforms: object;
  }): void;
}
//#endregion
//#region src/simulator/SimulatorPointerLockController.d.ts
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
//#endregion
//#region src/ui/types/ShaderTypes.d.ts
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
//#endregion
//#region src/ui/UIElement.d.ts
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
  ':focus'?: UIStateStyle;
}
interface UIElementOptions {
  style?: UIStyle;
  children?: THREE.Object3D[];
  visible?: boolean;
  pointerEvents?: PointerEvents;
  interactionEnabled?: boolean;
  reticleMode?: ReticleMode;
}
type UIElementKind = 'card' | 'overlay' | 'panel' | 'text' | 'button' | 'slider' | 'scroll' | 'input' | 'image' | 'icon';
export declare abstract class UIElement<TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap> extends Script<TEventMap> {
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
/** Returns the rendered object that owns an element's calculated layout. */
export declare function getUIPresentationObject(element: THREE.Object3D): THREE.Object3D | undefined;
//#endregion
//#region src/ui/UITheme.d.ts
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
//#endregion
//#region src/ui/UIValidation.d.ts
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
//#endregion
//#region src/ui/UI.d.ts
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
export declare const ui: UI;
//#endregion
//#region src/singletons.d.ts
/**
 * The global singleton instance of Core, serving as the main entry point
 * for the entire XR system. This binding is stable for the module lifetime;
 * disposing Core is terminal.
 */
export declare const core: Core;
/**
 * A direct alias to the main `THREE.Scene` instance managed by the core.
 * Use this to add or remove objects from your XR experience.
 * @example
 * ```
 * const myObject = new THREE.Mesh();
 * scene.add(myObject);
 * ```
 */
declare const scene$1: THREE.Scene<THREE.Object3DEventMap>;
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
declare const user$1: User;
/**
 * A direct alias to the `World` instance, which manages real-world
 * understanding features like plane detection and object detection.
 */
declare const world$1: World;
/**
 * A direct alias to the `Context` instance, which provides agent-facing
 * observations such as semantic trees, visible objects, and Set-of-Mark views.
 */
export declare const context: Context;
/**
 * A direct alias to the `AI` instance for integrating generative AI features,
 * including multi-modal understanding, image generation, and live conversation.
 */
declare const ai$1: AI;
/**
 * A direct alias to the `Depth` instance, which manages depth sensing features.
 */
declare const depth$1: Depth;
/**
 * A direct alias to the `Timer` instance, which manages time deltas.
 */
declare const timer$1: THREE.Timer;
/**
 * A direct alias to the `CoreSound` instance, which manages audio.
 */
export declare const sound: CoreSound;
/**
 * A direct alias to the `Input` instance, which manages inputs like controllers and hands.
 */
declare const input$1: Input;
/**
 * A direct alias to the `THREE.PerspectiveCamera` instance.
 */
declare const camera$1: THREE.PerspectiveCamera;
/**
 * A shortcut for `core.scene.add()`. Adds one or more objects to the scene.
 * @param object - The object(s) to add.
 * @see {@link three#Object3D.add}
 */
export declare function add(...object: THREE.Object3D[]): THREE.Scene<THREE.Object3DEventMap>;
/**
 * A shortcut for `core.init()`. Initializes the XR Blocks system and starts
 * the render loop. This is the main entry point for any application.
 * @param options - Configuration options for the session.
 * @see {@link Core.init}
 */
export declare function init(options?: Options): Promise<void>;
/**
 * Manually initializes a Script and resolves after its dependencies and
 * lifecycle initialization are complete.
 */
export declare function initScript(script: Script): Promise<void>;
/**
 * A shortcut for `core.timer.getDelta()`. Gets the time in seconds since
 * the last frame, useful for animations.
 * @returns The delta time in seconds.
 * @see {@link THREE.Timer.getDelta}
 */
export declare function getDeltaTime(): number;
/**
 * Gets elapsed time in seconds from the simulation or render clock.
 * Simulation time excludes pauses and is the default.
 * @param clock - Clock used to measure elapsed time.
 * @returns The elapsed time in seconds.
 */
export declare function getElapsedTime(clock?: 'simulation' | 'render'): number;
/**
 * Retrieves the left camera from the stereoscopic XR camera rig.
 * @returns The left eye's camera.
 */
export declare function getXrCameraLeft(): THREE.PerspectiveCamera;
/**
 * Retrieves the right camera from the stereoscopic XR camera rig.
 * @returns The right eye's camera.
 */
export declare function getXrCameraRight(): THREE.PerspectiveCamera;
//#endregion
//#region src/stereo/utils.d.ts
/**
 * Sets the given object and all its children to only be visible in the left
 * eye.
 * @param obj - Object to show only in the left eye.
 * @returns The original object.
 */
export declare function showOnlyInLeftEye<T extends THREE.Object3D>(obj: T): T;
/**
 * Sets the given object and all its children to only be visible in the right
 * eye.
 * @param obj - Object to show only in the right eye.
 * @returns The original object.
 */
export declare function showOnlyInRightEye<T extends THREE.Object3D>(obj: T): T;
/**
 * Loads a stereo image from a URL and returns two THREE.Texture objects, one
 * for the left eye and one for the right eye.
 * @param url - The URL of the stereo image.
 * @returns A promise that resolves to an array containing the left and right
 *     eye textures.
 */
export declare function loadStereoImageAsTextures(url: string): Promise<THREE.Texture<unknown, THREE.TextureEventMap>[]>;
//#endregion
//#region src/placement/TransformScript.d.ts
/** Base class for built-in scripts that continuously change their parent. */
export declare class TransformScript extends Script {
  private suspended;
  /** Stops transform updates while the parent is manipulated. */
  suspend(): void;
  /** Rebases the script on the parent's current pose and resumes updates. */
  resume(): void;
  protected get canUpdate(): boolean;
  /** Captures a new baseline from the parent transform. */
  protected rebase(): void;
}
//#endregion
//#region src/placement/FaceCamera.d.ts
export interface FaceCameraOptions {
  mode?: FaceCameraMode;
  /** Half-height of the upright region used by capsule mode, in meters. */
  capsuleHalfHeight?: number;
  smoothing?: number;
}
/** Rotates its parent to face the active camera. */
export declare class FaceCamera extends TransformScript {
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
//#endregion
//#region src/placement/FollowHead.d.ts
export interface FollowHeadOptions {
  offset: THREE.Vector3;
  smoothing?: number;
}
/** Moves its parent toward an offset in camera space. */
export declare class FollowHead extends TransformScript {
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
//#endregion
//#region src/placement/FollowObject.d.ts
export type FollowObjectMode = 'position' | 'rotation' | 'pose';
export interface FollowObjectOptions {
  target: THREE.Object3D;
  mode?: FollowObjectMode;
  positionOffset?: THREE.Vector3;
  rotationOffset?: THREE.Quaternion;
}
/** Copies position, rotation, or both from another object to its parent. */
export declare class FollowObject extends TransformScript {
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
//#endregion
//#region src/placement/Orbit.d.ts
export type OrbitPath = 'circular' | 'elliptical';
export type OrbitFrame = 'world' | 'target' | 'view';
export type OrbitDirection = 'clockwise' | 'counterclockwise';
export interface OrbitOptions {
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
export declare class Orbit extends TransformScript {
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
//#endregion
//#region src/placement/VisibilityTransition.d.ts
export interface VisibilityTransitionOptions {
  duration?: number;
}
/** Animates its parent's visibility with a scale transition. */
export declare class VisibilityTransition extends TransformScript {
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
//#endregion
//#region src/ui/UIAppearance.d.ts
type UIAppearance = 'surface' | 'none';
//#endregion
//#region src/ui/components/UICard.d.ts
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
export declare class UICard<TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap> extends UIElement<TEventMap> {
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
//#endregion
//#region src/ui/components/UIOverlay.d.ts
interface UIOverlayOptions extends UIElementOptions {
  appearance?: UIAppearance;
}
/** A view-space UI root. World transforms have no rendering effect. */
export declare class UIOverlay<TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap> extends UIElement<TEventMap> {
  name: string;
  readonly appearance: UIAppearance;
  constructor({ appearance, ...options }?: UIOverlayOptions);
}
//#endregion
//#region src/ui/components/UIButton.d.ts
interface UIButtonOptions extends UIElementOptions {
  label?: string;
  icon?: string;
  ariaLabel?: string;
  disabled?: boolean;
  onClick?: () => void;
}
/** A semantic button that activates after a valid captured press and release. */
export declare class UIButton<TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap> extends UIElement<TEventMap> {
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
//#endregion
//#region src/ui/components/UIIcon.d.ts
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
export declare class UIIcon<TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap> extends UIElement<TEventMap> {
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
//#endregion
//#region src/ui/components/UIImage.d.ts
interface UIImageOptions extends UIElementOptions {
  src: string | THREE.Texture;
  ariaLabel?: string;
}
/** URL-backed or caller-texture-backed image content. */
export declare class UIImage<TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap> extends UIElement<TEventMap> {
  name: string;
  readonly ariaLabel?: string;
  private _src;
  constructor({ src, ariaLabel, ...options }: UIImageOptions);
  get src(): string | THREE.Texture;
  set src(value: string | THREE.Texture);
}
//#endregion
//#region src/ui/components/UIPanel.d.ts
type UIPanelOptions = UIElementOptions;
/** A passive flex-layout and visual grouping element. */
export declare class UIPanel<TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap> extends UIElement<TEventMap> {
  name: string;
  constructor(options?: UIPanelOptions);
}
//#endregion
//#region src/ui/components/UIText.d.ts
interface UITextOptions extends UIElementOptions {
  text: string;
}
/** Text content in a card or overlay layout. */
export declare class UIText<TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap> extends UIElement<TEventMap> {
  name: string;
  private _text;
  constructor({ text, ...options }: UITextOptions);
  get text(): string;
  set text(value: string);
}
//#endregion
//#region src/ui/components/UITextInput.d.ts
type UITextInputSelectionDirection = 'forward' | 'backward' | 'none';
interface UITextInputSelection {
  readonly start: number;
  readonly end: number;
  readonly direction: UITextInputSelectionDirection;
}
interface UITextInputKeyModifiers {
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}
interface UITextInputOptions extends UIElementOptions {
  ariaLabel: string;
  value?: string;
  placeholder?: string;
  /** Fixed at construction because the native editing element cannot change. */
  multiline?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  maxLength?: number;
  onInput?: (value: string) => void;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}
/** A single-line or multiline text field backed by native browser editing. */
export declare class UITextInput<TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap> extends UIElement<TEventMap> {
  name: string;
  readonly ariaLabel: string;
  readonly multiline: boolean;
  onInput?: (value: string) => void;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  private _value;
  private _placeholder;
  private _disabled;
  private _readOnly;
  private _maxLength?;
  constructor({ ariaLabel, value, placeholder, multiline, disabled, readOnly, maxLength, onInput, onChange, onSubmit, onFocus, onBlur, style, ...options }: UITextInputOptions);
  /** Whether a mounted backend can currently accept editing operations. */
  get ready(): boolean;
  /** A module or text-rendering failure reported by the mounted backend. */
  get error(): Error | undefined;
  get focused(): boolean;
  /** Whether a custom keyboard currently owns software-keyboard suppression. */
  get nativeKeyboardSuppressed(): boolean;
  /**
   * Requests that the browser's software keyboard stay hidden while a custom
   * keyboard is active. Call the returned function to release this request.
   * Native text editing remains enabled; support depends on the browser.
   */
  suppressNativeKeyboard(): () => void;
  get value(): string;
  /** Programmatic assignment never emits onInput and rebases onChange. */
  set value(value: string);
  get placeholder(): string;
  set placeholder(value: string);
  get disabled(): boolean;
  set disabled(value: boolean);
  get readOnly(): boolean;
  set readOnly(value: boolean);
  get maxLength(): number | undefined;
  set maxLength(value: number | undefined);
  get selectionStart(): number | undefined;
  get selectionEnd(): number | undefined;
  get selectionDirection(): UITextInputSelectionDirection | undefined;
  /** UTF-16 code unit offsets, matching browser text field indexing. */
  get selection(): UITextInputSelection | undefined;
  setSelectionRange(start: number, end: number, direction?: UITextInputSelectionDirection): void;
  focus(): void;
  blur(): void;
  /** Replaces the current selection, honoring maxLength like typed input. */
  insertText(text: string): void;
  /**
   * Applies one KeyboardEvent.key name from a virtual keyboard or automation.
   *
   * Returns whether the key was applied. Physical keyboards and IME go through
   * the native element instead of this narrow path.
   */
  pressKey(key: string, modifiers?: UITextInputKeyModifiers): boolean;
  private get binding();
  private handleNativeInput;
  private handleNativeFocus;
  private handleNativeBlur;
  private requireBinding;
}
//#endregion
//#region src/ui/components/UISlider.d.ts
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
export declare class UISlider<TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap> extends UIElement<TEventMap> {
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
//#endregion
//#region src/ui/components/UIScrollView.d.ts
interface UIScrollViewOptions extends UIElementOptions {
  ariaLabel?: string;
  scrollTop?: number;
  onScroll?: (offset: number) => void;
}
/** A vertical viewport for ordinary retained UI children. Offsets use UI units. */
export declare class UIScrollView<TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap> extends UIElement<TEventMap> {
  name: string;
  readonly ariaLabel: string;
  onScroll?: (offset: number) => void;
  private _scrollTop;
  private _clientHeight;
  private _scrollHeight;
  private measured;
  constructor({ ariaLabel, scrollTop, onScroll, style, ...options }?: UIScrollViewOptions);
  get ready(): boolean;
  get scrollTop(): number;
  set scrollTop(offset: number);
  get clientHeight(): number;
  get scrollHeight(): number;
  get maxScrollTop(): number;
  /** Sets a clamped offset. Before layout, retains the requested initial offset. */
  scrollTo(offset: number): void;
  /** Returns whether a measured viewport actually moved. */
  scrollBy(delta: number): boolean;
  /** Minimally reveals a descendant after its mounted layout is ready. */
  reveal(child: UIElement): void;
}
//#endregion
//#region src/ui/model/ModelViewer.d.ts
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
export declare class ModelViewer extends Script {
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
  constructor({ origin, manipulation, platformMargin, autoplay, occlusion, castShadow, receiveShadow }?: ModelViewerOptions);
  get manipulation(): boolean | ManipulationOptions | undefined;
  set manipulation(value: boolean | ManipulationOptions | undefined);
  init({ depth, interaction, scene, rendererHolder, registry, timer }: {
    depth: Depth;
    interaction: Interaction;
    scene: THREE.Scene;
    rendererHolder: RendererHolder;
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
//#endregion
//#region src/utils/BVHRaycast.d.ts
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
export declare function isBVHReady(): boolean;
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
export declare function enableAcceleratedRaycast(): Promise<boolean>;
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
export declare function applyBVH(root: THREE.Object3D, { recursive }?: {
  recursive?: boolean;
}): Promise<void>;
/**
 * Walk the given object3D (recursively) and dispose any bounds trees
 * previously built by `applyBVH`. Sync; no-op if three-mesh-bvh
 * wasn't loaded.
 */
export declare function disposeBVH(root: THREE.Object3D, { recursive }?: {
  recursive?: boolean;
}): void;
export declare function _getBvhImportStatus(): {
  status: BvhImportStatus;
  error?: Error;
};
//#endregion
//#region src/utils/HelperConstants.d.ts
export declare const DOWN: Readonly<THREE.Vector3>;
export declare const UP: Readonly<THREE.Vector3>;
export declare const FORWARD: Readonly<THREE.Vector3>;
export declare const BACK: Readonly<THREE.Vector3>;
export declare const LEFT: Readonly<THREE.Vector3>;
export declare const RIGHT: Readonly<THREE.Vector3>;
export declare const ZERO_VECTOR3: Readonly<THREE.Vector3>;
//#endregion
//#region src/utils/LoadingSpinnerManager.d.ts
/**
 * Manages the global THREE.DefaultLoadingManager instance for
 * XRBlocks and handles communication of loading progress to the parent iframe.
 * This module controls the visibility of a loading spinner
 * in the DOM based on loading events.
 *
 * Import the single instance
 * `loadingSpinnerManager` to use it throughout the application.
 */
export declare class LoadingSpinnerManager {
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
export declare const loadingSpinnerManager: LoadingSpinnerManager;
//#endregion
//#region src/utils/ModelLoader.d.ts
export type ModelLoaderLoadGLTFOptions = {
  /** The base path for the model files. */
  path?: string;
  /** The URL of the model file. */
  url: string;
  /** The renderer. */
  renderer?: WebGLOrWebGPURenderer;
};
export type ModelLoaderLoadOptions = ModelLoaderLoadGLTFOptions & {
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
export declare class ModelLoader {
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
  load({ path, url, renderer, onProgress }: ModelLoaderLoadOptions): Promise<GLTF | (import("@sparkjsdev/spark").SplatMesh & {
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
  }): Promise<import("@sparkjsdev/spark").SplatMesh & {
    boundingBox: THREE.Box3;
  }>;
  /**
   * Loads a GLTF or GLB model.
   * @param options - The loading options.
   * @returns A promise that resolves with the loaded glTF object.
   */
  loadGLTF({ path, url, renderer }: ModelLoaderLoadGLTFOptions): Promise<GLTF>;
}
//#endregion
//#region src/utils/ObjectPlacement.d.ts
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
export declare function placeObjectAtIntersectionFacingTarget(obj: THREE.Object3D, intersection: THREE.Intersection, target: THREE.Object3D): THREE.Object3D<THREE.Object3DEventMap>;
//#endregion
//#region src/utils/RotationUtils.d.ts
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
export declare function extractYaw(rotation: Readonly<THREE.Quaternion>, target?: THREE.Quaternion): THREE.Quaternion;
/**
 * Creates a rotation such that forward (0, 0, -1) points towards the forward
 * vector and the up direction is the normalized projection of the provided up
 * vector onto the plane orthogonal to the target.
 * @param forward - Forward vector
 * @param up - Up vector
 * @param target - Output
 * @returns
 */
export declare function lookAtRotation(forward: Readonly<THREE.Vector3>, up?: Readonly<THREE.Vector3>, target?: THREE.Quaternion): THREE.Quaternion;
/**
 * Clamps the provided rotation's angle.
 * The rotation is modified in place.
 * @param rotation - The quaternion to clamp.
 * @param angle - The maximum allowed angle in radians.
 */
export declare function clampRotationToAngle(rotation: THREE.Quaternion, angle: number): void;
//#endregion
//#region src/utils/SceneGraphUtils.d.ts
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
export declare function objectIsDescendantOf(child?: Readonly<THREE.Object3D> | null, parent?: Readonly<THREE.Object3D> | null): boolean;
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
export declare function traverseUtil(node: THREE.Object3D, callback: (node: THREE.Object3D) => boolean): boolean;
/**
 * Gets a world-space point on an object's rendered geometry near a reference
 * position. Falls back to the object's world position when it has no mesh
 * triangles. `closest` measures from `from`; `center` measures from the
 * object's world bounding-box center.
 * UI elements use the center of their rendered bounds.
 */
export declare function getObjectTargetPoint(object: THREE.Object3D, from: THREE.Vector3, out: THREE.Vector3, mode?: 'closest' | 'center'): THREE.Vector3;
//#endregion
//#region src/utils/SparkRendererHolder.d.ts
export declare class SparkRendererHolder {
  renderer: SparkRenderer;
  constructor(renderer: SparkRenderer);
}
//#endregion
//#region src/utils/ThreeDisposal.d.ts
export declare function disposeMaterial(material: THREE.Material | THREE.Material[] | undefined, except?: Set<THREE.Material<THREE.MaterialEventMap>>): void;
export declare function disposeMeshResources(mesh: THREE.Mesh): void;
export declare function disposeRenderableResources(object: THREE.Object3D): void;
export declare function disposeObjectTree(object: THREE.Object3D): void;
export declare function disposeObjectChildren(object: THREE.Object3D): void;
//#endregion
//#region src/utils/utils.d.ts
/**
 * Clamps a value between a minimum and maximum value.
 */
export declare function clamp(value: number, min: number, max: number): number;
/**
 * Linearly interpolates between two numbers `x` and `y` by a given amount `t`.
 */
export declare function lerp(x: number, y: number, t: number): number;
/**
 * Python-style print function for debugging.
 */
export declare function print(...args: unknown[]): void;
export declare const urlParams: URLSearchParams;
/**
 * Function to get the value of a URL parameter.
 * @param name - The name of the URL parameter.
 * @returns The value of the URL parameter or null if not found.
 */
export declare function getUrlParameter(name: string): string | null;
/**
 * Retrieves a boolean URL parameter. Returns true for 'true' or '1', false for
 * 'false' or '0'. If the parameter is not found, returns the specified default
 * boolean value.
 * @param name - The name of the URL parameter.
 * @param defaultBool - The default boolean value if the
 *     parameter is not present.
 * @returns The boolean value of the URL parameter.
 */
export declare function getUrlParamBool(name: string, defaultBool?: boolean): boolean;
/**
 * Retrieves an integer URL parameter. If the parameter is not found or is not a
 * valid number, returns the specified default integer value.
 * @param name - The name of the URL parameter.
 * @param defaultNumber - The default integer value if the
 *     parameter is not present.
 * @returns The integer value of the URL parameter.
 */
export declare function getUrlParamInt(name: string, defaultNumber?: number): number;
/**
 * Retrieves a float URL parameter. If the parameter is not found or is not a
 * valid number, returns the specified default float value.
 * @param name - The name of the URL parameter.
 * @param defaultNumber - The default float value if the parameter
 *     is not present.
 * @returns The float value of the URL parameter.
 */
export declare function getUrlParamFloat(name: string, defaultNumber?: number): number;
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
export declare function getVec4ByColorString(colorString: string): THREE.Vector4;
export declare function getColorHex(fontColor: string | number): number;
/**
 * Parses a data URL (e.g., "data:image/png;base64,...") into its
 * stripped base64 string and MIME type.
 * This function handles common image MIME types.
 * @param dataURL - The data URL string.
 * @returns An object containing the stripped base64 string and the extracted
 *     MIME type.
 */
export declare function parseBase64DataURL(dataURL: string): {
  strippedBase64: string;
  mimeType: string;
} | {
  strippedBase64: string;
  mimeType: null;
};
//#endregion
//#region src/video/VideoFileStream.d.ts
type VideoFileStreamDetails = VideoStreamDetails & {
  width?: number;
  height?: number;
  aspectRatio?: number;
  videoFile?: string | File;
};
export type VideoFileStreamOptions = VideoStreamOptions & {
  /** The video file path, URL, or File object. */
  videoFile?: string | File;
};
/**
 * VideoFileStream handles video playback from a file source.
 */
export declare class VideoFileStream extends VideoStream<VideoFileStreamDetails> {
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
//#endregion
//#region src/world/anchors/AnchorCapability.d.ts
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
export declare function anchorCapability(session: XRSession | null | undefined, frame: XRFrame | null | undefined): AnchorCapability;
//#endregion
//#region src/world/anchors/AnchoredObjects.d.ts
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
export type AnchoredObjectFactory = (label: string, record: AnchorRecord) => THREE.Object3D | null;
/**
 * Keeps `THREE.Object3D`s attached to spatial anchors.
 *
 * {@link AnchorManager} deals in anchors and poses; every app on top of it
 * otherwise repeats the same work of holding a map from anchor to object and
 * copying poses across each frame. This owns that, so an app anchors an object
 * and then forgets about it.
 */
export declare class AnchoredObjects {
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
//#endregion
//#region src/world/anchors/LocalStorageAnchorStore.d.ts
/** The subset of the `Storage` API this store depends on. */
export interface AnchorStorageLike {
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
export declare class LocalStorageAnchorStore implements AnchorStore {
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
declare namespace xrblocks_d_exports {
  export { AI, AIModel, AIOptions, ActiveControllers, Agent, AgentLifecycleCallbacks, AnchorCapability, AnchorManager, AnchorRecord, AnchorRestoreResult, AnchorRestoreStatus, AnchorStorageLike, AnchorStore, AnchoredObjectFactory, AnchoredObjects, AnchorsOptions, AudioListener, AudioListenerOptions, AudioPlayer, AudioPlayerOptions, AutomationModeOptions, BACK, BackgroundKeyOptions, BackgroundMusic, BaseManipulationEvent, CameraParametersSnapshot, CameraSnapshot, CategoryVolumes, ColorStop, Constructor, Context, ContextOptions, Core, CoreLifecycleState, CoreSound, DEFAULT_DEVICE_CAMERA_HEIGHT, DEFAULT_DEVICE_CAMERA_WIDTH, DEFAULT_RGB_TO_DEPTH_PARAMS, DEVICE_CAMERA_PARAMETERS, DOWN, DeepPartial, DeepReadonly, Depth, DepthArray, DepthMesh, DepthMeshOptions, DepthOptions, DepthTextures, DetectedBodyPose, DetectedFace, DetectedMesh, DetectedObject, DetectedPlane, DeviceCameraOptions, DeviceCameraParameters, DigitName, FINGER_ORDER, FORWARD, FaceBlendshape, FaceCamera, FaceCameraMode, FaceCameraOptions, FaceLandmark, FaceLandmarkName, FaceRecognizer, FacesOptions, FingerName, FollowHead, FollowHeadOptions, FollowObject, FollowObjectMode, FollowObjectOptions, FormFactor, FramebufferScaleFactor, GEMINI_DEFAULT_FLASH_MODEL, GEMINI_DEFAULT_IMAGE_MODEL, GEMINI_DEFAULT_LIVE_MODEL, GamepadAction, GamepadBindings, GamepadController, GazeController, Gemini, GeminiInteractionConfig, GeminiOptions, GeminiQueryInput, GenerateSkyboxTool, GestureConfiguration, GestureDetectionResult, GestureEvent, GestureEventDetail, GestureEventType, GestureHandedness, GestureRecognition, GestureRecognitionOptions, GestureRecognizer, GestureScoreMap, GetWeatherArgs, GetWeatherTool, GradientPaint, GradientType, HAND_BONE_IDX_CONNECTION_MAP, HAND_INDEX_TO_LABEL, HAND_JOINT_COUNT, HAND_JOINT_IDX_CONNECTION_MAP, HAND_JOINT_NAMES, HandContext, HandLabel, Handedness, Hands, HandsOptions, HeadGestureConfiguration, HeadGestureContext, HeadGestureDetectionResult, HeadGestureEvent, HeadGestureEventDetail, HeadGestureEventMap, HeadGestureRecognition, HeadGestureRecognitionOptions, HeadGestureRecognizer, HeadGestureScoreMap, HeadPoseSample, HeuristicGestureDetector, HeuristicGestureRecognizer, HeuristicHeadGestureDetector, HeuristicHeadGestureRecognizer, HeuristicHeadGestureRecognizerOptions, HitSurfaceOptions, HoverEvent, HumanRecognizer, HumansOptions, Injectable, InjectableConstructor, Input, InputOptions, Interaction, InteractionOptions, InteractionSource, InteractionSourceType, JointName, JointPositions, KeyEvent, Keycodes, KeysJson, LEFT, LEFT_VIEW_ONLY_LAYER, LayerCapability, LayerManager, LayersOptions, Lighting, LightingOptions, LipMetrics, LiveSessionState, LoadingSpinnerManager, LocalStorageAnchorStore, LongSelectEvent, ManipulationAction, ManipulationEvent, ManipulationHandleOptions, ManipulationOptions, ManipulationPhase, MediaOrSimulatorMediaDeviceInfo, MediaPipeHandContext, MediaPipeHandLandmark, MediaPipeHandPoseEstimator, MeshDetectionOptions, MeshDetector, MeshScript, ModelClass, ModelLoader, ModelLoaderLoadGLTFOptions, ModelLoaderLoadOptions, ModelOptions, ModelSource, ModelViewer, ModelViewerOptions, ModelViewerOrigin, MouseController, NUM_HANDS, NormalizedDetectedObject, OCCLUDABLE_ITEMS_LAYER, ObjectDetectionOptions, ObjectDetector, ObjectGrabEvent, ObjectTouchEvent, ObjectTouchStartEvent, ObjectsOptions, OcclusionPass, OcclusionPassBackend, OcclusionUtils, OpenAI, OpenAIOptions, Options, Orbit, OrbitDirection, OrbitFrame, OrbitOptions, OrbitPath, Paint, PalmPose, Physics, PhysicsOptions, PlaneDetector, PlanesOptions, PlayModelAnimationOptions, PlaySoundOptions, PointerEvents, PoseEstimator, PoseJointName, PoseLandmark, PushPullOptions, QuatTuple, RAPIERCompat, RENDERER_BACKENDS, RIGHT, RIGHT_VIEW_ONLY_LAYER, RaycastMode, Registry, RendererBackend, ResizeManipulationEvent, ResizeOptions, ResizeSize, ResolvedSimulatorSceneManifest, ReticleMode, ReticleOptions, Reticles, RgbToDepthParams, RgbaImage, RotateManipulationEvent, RotateOptions, SIMULATOR_HAND_COMMON_BIOMECHANICAL_CONSTRAINTS_DEGREES, SIMULATOR_HAND_POSE_NAMES, SIMULATOR_HAND_POSE_ROTATIONS, SOUND_PRESETS, ScaleManipulationEvent, ScaleOptions, SceneContextDetectionOptions, SceneContextDetectionResult, SceneDetector, SceneOptions, SceneSetOfMarkOptions, SceneVisibilityOptions, ScreenshotSynthesizer, Script, ScriptMixin, ScriptsManager, ScriptsManagerEventMap, ScriptsManagerEventType, SegmentCategory, SegmentationMask, SegmentationOptions, Segmenter, SelectEndEvent, SelectEvent, SelectionEndReason, SemanticBounds, SemanticMetadata, SemanticNode, SemanticScrollInfo, SemanticSource, SemanticTree, SemanticViewData, SetOfMark, SetOfMarkContext, SetSimulatorEnvironmentEvent, SetSimulatorHandPhysicsEvent, SetSimulatorModeEvent, Shader, ShaderUniforms, ShowSimulatorInstructionsEvent, Simulator, SimulatorAnchor, SimulatorCamera, SimulatorControlMode, SimulatorControllerState, SimulatorControls, SimulatorCustomInstruction, SimulatorDayNightLightingDefinition, SimulatorDepth, SimulatorDepthMaterial, SimulatorDetectedObjectInput, SimulatorEnvironment, SimulatorHandJointRotationArray, SimulatorHandPhysicsOptions, SimulatorHandPose, SimulatorHandPoseChangeRequestEvent, SimulatorHandPoseJoints, SimulatorHandPoseRotationConstraintsDegrees, SimulatorHandPoseRotationRangeDegrees, SimulatorHandPoseRotations, SimulatorHands, SimulatorLocationDefinition, SimulatorLocations, SimulatorMediaDeviceInfo, SimulatorMesh, SimulatorMode, SimulatorObject, SimulatorObjectDefinition, SimulatorObjectDetectionSource, SimulatorObjectUpdate, SimulatorObjects, SimulatorOptions, SimulatorPhysicsMode, SimulatorPlane, SimulatorPlaneType, SimulatorPointerLockController, SimulatorQuaternionTuple, SimulatorScene, SimulatorSceneManifest, SimulatorUser, SimulatorUserPath, SimulatorVector3Tuple, SkyboxAgent, SolidPaint, SoundOptions, SoundSynthesizer, SparkRendererHolder, SpatialAudio, SpeechRecognizer, SpeechRecognizerOptions, SpeechSynthesizer, SpeechSynthesizerOptions, StorablePose, StreamState, StrokeEventMap, StrokeRecognizer, StylizedFace, StylizedFaceOptions, TensorFlowHandPoseEstimator, Tool, ToolCall, ToolOptions, ToolResult, ToolSchema, TrackedAnchor, TrackedAnchorLike, TransformScript, TranslateManipulationEvent, TranslateOptions, UIAppearance, UIButton, UIButtonOptions, UICard, UICardAnchorX, UICardAnchorY, UICardEdgeOptions, UICardOptions, UIColor, UIElement, UIElementOptions, UIIcon, UIIconOptions, UIIconVariant, UIIconWeight, UIImage, UIImageOptions, UILineHeight, UIOverlay, UIOverlayOptions, UIPanel, UIPanelOptions, UIPosition, UIResolvedSize, UIScrollView, UIScrollViewOptions, UISize, UISlider, UISliderOptions, UIStateStyle, UIStyle, UIText, UITextInput, UITextInputKeyModifiers, UITextInputOptions, UITextInputSelection, UITextInputSelectionDirection, UITextOptions, UITheme, UIThemeColors, UIThemePresetName, UIThemeStyleRole, UIThemeStyles, UIThemeUpdate, UITransform, UIUnit, UIValidationBounds, UIValidationCode, UIValidationIssue, UIValidationReport, UIVector2, UP, User, VIEW_DEPTH_GAP, Vec2Tuple, Vec3Tuple, VideoFileStream, VideoFileStreamOptions, VideoFrameMetadata, VideoLayer, VideoLayerPath, VideoLayerPlacement, VideoLayerState, VideoStream, VideoStreamDetails, VideoStreamEventMap, VideoStreamGetSnapshotBase64Options, VideoStreamGetSnapshotBlobOptions, VideoStreamGetSnapshotImageDataOptions, VideoStreamGetSnapshotOptions, VideoStreamGetSnapshotTextureOptions, VideoStreamOptions, VisemeWeights, VisibilityTransition, VisibilityTransitionOptions, VisibleObjectsContext, VolumeCategory, WaitFrame, WeatherData, WebGLOrWebGPURenderer, WebGPURendererOptions, WebXRHandContext, WebXRHandPoseEstimator, WebXRJointRotations, WebXRSessionEventType, WebXRSessionManager, WebXRSessionManagerEventMap, World, WorldOptions, XBObjectOptions, XRButton, XRDeviceCamera, XREffects, XRPass, XRReferenceSpaceCache, XRTransitionOptions, XR_BLOCKS_ASSETS_PATH, ZERO_VECTOR3, ZERO_VISEME, _getBvhImportStatus, add, ai$1 as ai, anchorCapability, applyBVH, applySimulatorHandPoseRotationConstraints, aspectRatioOf, assertWebGLRenderer, average, buildDisplacementMap, callInitWithDependencyInjection, camera$1 as camera, clamp, clamp01, clampRotationToAngle, computeBillboardScale, context, core, cropImage, defaultAnchorStorageKey, depth$1 as depth, detectDeviceCameraTarget, disposeBVH, disposeMaterial, disposeMeshResources, disposeObjectChildren, disposeObjectTree, disposeRenderableResources, enableAcceleratedRaycast, estimateBackgroundColor, estimateHandScale, extractYaw, getAdjacentFingerSpreads, getBoneVectors, getCameraParametersSnapshot, getColorHex, getDeltaTime, getDeviceCameraClipFromView, getDeviceCameraWorldFromClip, getDeviceCameraWorldFromView, getElapsedTime, getFingerBendAngles, getFingerCurl, getFingerDirection, getFingerJoint, getFingerPalmAlignment, getFingerSpread, getFingerStraightness, getFingertipDistance, getFingertipPalmDistance, getObjectTargetPoint, getPalmNormal, getPalmPose, getPalmRight, getPalmUp, getPalmWidth, getRelativeBoneAngles, getThumbBendAngles, getThumbCurl, getThumbDirection, getThumbOpposition, getThumbStraightness, getThumbVerticalDirection, getUIPresentationObject, getUrlParamBool, getUrlParamFloat, getUrlParamInt, getUrlParameter, getVec4ByColorString, getXrCameraLeft, getXrCameraRight, init, initScript, input$1 as input, intrinsicsToProjectionMatrix, isBVHReady, isDeviceCameraPoseAvailable, isLayerCapable, isWebGPURenderer, keyOutBackground, layerCapability, lerp, loadStereoImageAsTextures, loadingSpinnerManager, lookAtRotation, objectIsDescendantOf, parseBase64DataURL, parseSimulatorHandPoseRotations, placeObjectAtIntersectionFacingTarget, poseInFrontOfCamera, print, quaternionFacingCamera, resolveSimulatorHandPoseRotations, resolveSimulatorRotationsFromKeypoints, scene$1 as scene, showOnlyInLeftEye, showOnlyInRightEye, sound, timer$1 as timer, transformRgbUvToWorld, traverseUtil, ui, urlParams, user$1 as user, visualizeDepth, visualizeDepthMap, world$1 as world, xrDepthMeshOptions, xrDepthMeshPhysicsOptions, xrDepthMeshVisualizationOptions, xrDeviceCameraEnvironmentContinuousOptions, xrDeviceCameraEnvironmentOptions, xrDeviceCameraUserContinuousOptions, xrDeviceCameraUserOptions };
}
//#endregion
//#region src/entry.d.ts
declare global {
  interface Window {
    xb?: typeof xrblocks_d_exports;
    xbReady?: Promise<void>;
  }
}
//#endregion
export { BackgroundMusic, type ColorStop, type FaceCameraMode, type GradientPaint, type GradientType, type HeuristicHeadGestureRecognizerOptions, type HitSurfaceOptions, type InteractionSource, type InteractionSourceType, type ModelSource, type ModelViewerOptions, type ModelViewerOrigin, type Paint, type PlayModelAnimationOptions, type PointerEvents, type ResolvedSimulatorSceneManifest, type ReticleMode, type Simulator, type SimulatorCamera, type SimulatorControlMode, type SimulatorControllerState, type SimulatorControls, type SimulatorDayNightLightingDefinition, type SimulatorDepth, type SimulatorDepthMaterial, type SimulatorHands, type SimulatorLocationDefinition, type SimulatorLocations, type SimulatorMediaDeviceInfo, type SimulatorObject, type SimulatorObjectDefinition, type SimulatorObjectUpdate, type SimulatorObjects, type SimulatorPhysicsMode, type SimulatorPointerLockController, type SimulatorQuaternionTuple, type SimulatorScene, type SimulatorSceneManifest, type SimulatorUser, type SimulatorUserPath, type SimulatorVector3Tuple, type SolidPaint, type UIAppearance, type UIButtonOptions, type UICardAnchorX, type UICardAnchorY, type UICardEdgeOptions, type UICardOptions, type UIColor, type UIElementOptions, type UIIconOptions, type UIIconVariant, type UIIconWeight, type UIImageOptions, type UILineHeight, type UIOverlayOptions, type UIPanelOptions, type UIPosition, type UIResolvedSize, type UIScrollViewOptions, type UISize, type UISliderOptions, type UIStateStyle, type UIStyle, type UITextInputKeyModifiers, type UITextInputOptions, type UITextInputSelection, type UITextInputSelectionDirection, type UITextOptions, type UITheme, type UIThemeColors, type UIThemePresetName, type UIThemeStyleRole, type UIThemeStyles, type UIThemeUpdate, type UITransform, type UIUnit, type UIValidationBounds, type UIValidationCode, type UIValidationIssue, type UIValidationReport, type UIVector2, type WebGLOrWebGPURenderer, type XBObjectOptions, ai$1 as ai, camera$1 as camera, depth$1 as depth, input$1 as input, scene$1 as scene, timer$1 as timer, user$1 as user, world$1 as world };
//# sourceMappingURL=xrblocks.d.ts.map