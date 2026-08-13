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
 * @version v0.20.0
 * @commitid 1f45056
 * @builddate 2026-08-13T18:18:19.676Z
 * @description XR Blocks SDK, built from source with the above commit ID.
 * @agent When using with Gemini to create XR apps, use **Gemini Canvas** mode,
 * and follow rules below:
 * 1. Include the following importmap for maximum compatibility:
    "three": "https://cdn.jsdelivr.net/npm/three@0.184.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/",
    "troika-three-text": "https://cdn.jsdelivr.net/gh/protectwise/troika@028b81cf308f0f22e5aa8e78196be56ec1997af5/packages/troika-three-text/src/index.js",
    "troika-three-utils": "https://cdn.jsdelivr.net/gh/protectwise/troika@v0.52.4/packages/troika-three-utils/src/index.js",
    "troika-worker-utils": "https://cdn.jsdelivr.net/gh/protectwise/troika@v0.52.4/packages/troika-worker-utils/src/index.js",
    "bidi-js": "https://esm.sh/bidi-js@%5E1.0.2?target=es2022",
    "webgl-sdf-generator": "https://esm.sh/webgl-sdf-generator@1.1.1/es2022/webgl-sdf-generator.mjs",
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
export { J as AI, L as AIOptions, N as ActiveControllers, Q as Agent, V as AnchorManager, Y as AnchoredObjects, Z as AnchorsOptions, _ as AudioListener, $ as AudioPlayer, a0 as BACK, a1 as BackgroundMusic, a2 as CategoryVolumes, a3 as Context, a4 as ContextOptions, a5 as Core, a6 as CoreSound, a7 as DEFAULT_DEVICE_CAMERA_HEIGHT, a8 as DEFAULT_DEVICE_CAMERA_WIDTH, a9 as DEFAULT_RGB_TO_DEPTH_PARAMS, aa as DEVICE_CAMERA_PARAMETERS, ab as DOWN, D as Depth, ac as DepthMesh, ad as DepthMeshOptions, ae as DepthOptions, af as DepthTextures, ag as DetectedBodyPose, ah as DetectedFace, ai as DetectedMesh, aj as DetectedObject, ak as DetectedPlane, al as DeviceCameraOptions, am as FINGER_ORDER, an as FORWARD, ao as FaceCamera, ap as FaceLandmarkName, aq as FaceRecognizer, ar as FacesOptions, as as FollowHead, at as FollowObject, au as GEMINI_DEFAULT_FLASH_MODEL, av as GEMINI_DEFAULT_IMAGE_MODEL, aw as GEMINI_DEFAULT_LIVE_MODEL, ax as GamepadBindings, ay as GamepadController, az as GazeController, aA as Gemini, aB as GeminiOptions, aC as GenerateSkyboxTool, aD as GestureRecognition, aE as GestureRecognitionOptions, aF as GetWeatherTool, aG as HAND_BONE_IDX_CONNECTION_MAP, aH as HAND_INDEX_TO_LABEL, aI as HAND_JOINT_COUNT, aJ as HAND_JOINT_IDX_CONNECTION_MAP, f as HAND_JOINT_NAMES, H as Handedness, aK as Hands, aL as HandsOptions, aM as HeadGestureRecognition, aN as HeadGestureRecognitionOptions, aO as HeuristicGestureRecognizer, aP as HeuristicHeadGestureRecognizer, aQ as HumanRecognizer, aR as HumansOptions, p as Input, aS as InputOptions, I as Interaction, aT as InteractionOptions, K as Keycodes, aU as LEFT, aV as LEFT_VIEW_ONLY_LAYER, aW as Lighting, aX as LightingOptions, aY as LoadingSpinnerManager, aZ as LocalStorageAnchorStore, v as ManipulationAction, a_ as MediaPipeHandContext, a$ as MediaPipeHandPoseEstimator, b0 as MeshDetectionOptions, b1 as MeshDetector, b2 as MeshScript, M as ModelLoader, b3 as ModelViewer, b4 as MouseController, b5 as NUM_HANDS, b6 as OCCLUDABLE_ITEMS_LAYER, b7 as ObjectDetector, b8 as ObjectsOptions, b9 as OcclusionPass, ba as OcclusionUtils, bb as OpenAI, bc as OpenAIOptions, O as Options, bd as Orbit, P as Physics, be as PhysicsOptions, bf as PlaneDetector, bg as PlanesOptions, bh as PoseJointName, bi as RIGHT, bj as RIGHT_VIEW_ONLY_LAYER, l as Registry, bk as ReticleOptions, bl as Reticles, bm as SIMULATOR_HAND_COMMON_BIOMECHANICAL_CONSTRAINTS_DEGREES, G as SIMULATOR_HAND_POSE_NAMES, d as SIMULATOR_HAND_POSE_ROTATIONS, bn as SOUND_PRESETS, bo as SceneDetector, bp as SceneOptions, bq as SceneSetOfMarkOptions, br as SceneVisibilityOptions, bs as ScreenshotSynthesizer, a as Script, bt as ScriptMixin, bu as ScriptsManager, bv as ScriptsManagerEventType, bw as SegmentCategory, bx as SegmentationOptions, by as Segmenter, i as SetSimulatorEnvironmentEvent, k as SetSimulatorHandPhysicsEvent, c as SetSimulatorModeEvent, j as ShowSimulatorInstructionsEvent, bz as SimulatorAnchor, S as SimulatorHandPose, e as SimulatorHandPoseChangeRequestEvent, b as SimulatorMode, q as SimulatorOptions, bA as SkyboxAgent, bB as SoundOptions, bC as SoundSynthesizer, s as SparkRendererHolder, bD as SpatialAudio, bE as SpeechRecognizer, bF as SpeechRecognizerOptions, bG as SpeechSynthesizer, bH as SpeechSynthesizerOptions, bI as StreamState, bJ as StrokeRecognizer, bK as StylizedFace, bL as TensorFlowHandPoseEstimator, bM as Tool, T as TransformScript, bN as UIButton, C as UICard, bO as UIElement, bP as UIIcon, bQ as UIImage, E as UIOverlay, bR as UIPanel, bS as UISlider, U as UIText, bT as UP, bU as User, bV as VIEW_DEPTH_GAP, bW as VideoFileStream, bX as VideoStream, bY as VisibilityTransition, bZ as VolumeCategory, W as WaitFrame, b_ as WebXRHandContext, b$ as WebXRHandPoseEstimator, o as World, c0 as WorldOptions, c1 as XRButton, X as XRDeviceCamera, c2 as XREffects, c3 as XRPass, c4 as XRReferenceSpaceCache, c5 as XRTransitionOptions, F as XR_BLOCKS_ASSETS_PATH, c6 as ZERO_VECTOR3, c7 as ZERO_VISEME, c8 as _getBvhImportStatus, c9 as add, ca as ai, cb as anchorCapability, cc as applyBVH, g as applySimulatorHandPoseRotationConstraints, cd as average, m as callInitWithDependencyInjection, ce as camera, cf as clamp, cg as clamp01, ch as clampRotationToAngle, ci as context, cj as core, ck as cropImage, cl as defaultAnchorStorageKey, cm as depth, cn as disposeBVH, co as disposeMaterial, cp as disposeMeshResources, h as disposeObjectChildren, n as disposeObjectTree, cq as disposeRenderableResources, cr as enableAcceleratedRaycast, cs as estimateHandScale, ct as extractYaw, cu as getAdjacentFingerSpreads, cv as getBoneVectors, cw as getCameraParametersSnapshot, cx as getColorHex, cy as getDeltaTime, cz as getDeviceCameraClipFromView, cA as getDeviceCameraWorldFromClip, cB as getDeviceCameraWorldFromView, cC as getElapsedTime, cD as getFingerBendAngles, cE as getFingerCurl, cF as getFingerDirection, cG as getFingerJoint, cH as getFingerPalmAlignment, cI as getFingerSpread, cJ as getFingerStraightness, cK as getFingertipDistance, cL as getFingertipPalmDistance, cM as getPalmNormal, cN as getPalmPose, cO as getPalmRight, cP as getPalmUp, cQ as getPalmWidth, cR as getRelativeBoneAngles, cS as getThumbBendAngles, cT as getThumbCurl, cU as getThumbDirection, cV as getThumbOpposition, cW as getThumbStraightness, cX as getThumbVerticalDirection, cY as getUrlParamBool, cZ as getUrlParamFloat, c_ as getUrlParamInt, c$ as getUrlParameter, d0 as getVec4ByColorString, d1 as getXrCameraLeft, d2 as getXrCameraRight, d3 as init, d4 as initScript, d5 as input, d6 as intrinsicsToProjectionMatrix, d7 as isBVHReady, d8 as isDeviceCameraPoseAvailable, d9 as lerp, da as loadStereoImageAsTextures, db as loadingSpinnerManager, dc as lookAtRotation, dd as objectIsDescendantOf, de as parseBase64DataURL, df as parseSimulatorHandPoseRotations, dg as placeObjectAtIntersectionFacingTarget, dh as print, r as resolveSimulatorHandPoseRotations, di as resolveSimulatorRotationsFromKeypoints, dj as scene, dk as showOnlyInLeftEye, dl as showOnlyInRightEye, dm as sound, dn as timer, dp as transformRgbUvToWorld, dq as traverseUtil, dr as ui, ds as urlParams, dt as user, du as visualizeDepth, dv as visualizeDepthMap, dw as world, dx as xrDepthMeshOptions, dy as xrDepthMeshPhysicsOptions, dz as xrDepthMeshVisualizationOptions, dA as xrDeviceCameraEnvironmentContinuousOptions, dB as xrDeviceCameraEnvironmentOptions, dC as xrDeviceCameraUserContinuousOptions, dD as xrDeviceCameraUserOptions } from './internal/entry.js';
import 'three';
import 'three/addons/postprocessing/Pass.js';
import 'three/addons/webxr/XRControllerModelFactory.js';
import 'three/addons/webxr/XRHandModelFactory.js';
import 'three/addons/webxr/XREstimatedLight.js';
import 'three/addons/loaders/DRACOLoader.js';
import 'three/addons/loaders/GLTFLoader.js';
import 'three/addons/loaders/KTX2Loader.js';
//# sourceMappingURL=xrblocks.js.map
