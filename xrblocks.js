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
 * @commitid b241108
 * @builddate 2026-08-10T19:45:07.973Z
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
export { J as AI, L as AIOptions, N as ActiveControllers, Q as Agent, V as AudioListener, Y as AudioPlayer, Z as BACK, _ as BackgroundMusic, $ as CategoryVolumes, a0 as Context, a1 as ContextOptions, a2 as Core, a3 as CoreSound, a4 as DEFAULT_DEVICE_CAMERA_HEIGHT, a5 as DEFAULT_DEVICE_CAMERA_WIDTH, a6 as DEFAULT_RGB_TO_DEPTH_PARAMS, a7 as DEVICE_CAMERA_PARAMETERS, a8 as DOWN, D as Depth, a9 as DepthMesh, aa as DepthMeshOptions, ab as DepthOptions, ac as DepthTextures, ad as DetectedBodyPose, ae as DetectedFace, af as DetectedMesh, ag as DetectedObject, ah as DetectedPlane, ai as DeviceCameraOptions, aj as FINGER_ORDER, ak as FORWARD, al as FaceCamera, am as FaceLandmarkName, an as FaceRecognizer, ao as FacesOptions, ap as FollowHead, aq as FollowObject, ar as GEMINI_DEFAULT_FLASH_MODEL, as as GEMINI_DEFAULT_IMAGE_MODEL, at as GEMINI_DEFAULT_LIVE_MODEL, au as GamepadBindings, av as GamepadController, aw as GazeController, ax as Gemini, ay as GeminiOptions, az as GenerateSkyboxTool, aA as GestureRecognition, aB as GestureRecognitionOptions, aC as GetWeatherTool, aD as HAND_BONE_IDX_CONNECTION_MAP, aE as HAND_INDEX_TO_LABEL, aF as HAND_JOINT_COUNT, aG as HAND_JOINT_IDX_CONNECTION_MAP, f as HAND_JOINT_NAMES, H as Handedness, aH as Hands, aI as HandsOptions, aJ as HeadGestureRecognition, aK as HeadGestureRecognitionOptions, aL as HeuristicGestureRecognizer, aM as HeuristicHeadGestureRecognizer, aN as HumanRecognizer, aO as HumansOptions, p as Input, aP as InputOptions, I as Interaction, aQ as InteractionOptions, K as Keycodes, aR as LEFT, aS as LEFT_VIEW_ONLY_LAYER, aT as Lighting, aU as LightingOptions, aV as LoadingSpinnerManager, v as ManipulationAction, aW as MediaPipeHandContext, aX as MediaPipeHandPoseEstimator, aY as MeshDetectionOptions, aZ as MeshDetector, a_ as MeshScript, M as ModelLoader, a$ as ModelViewer, b0 as MouseController, b1 as NUM_HANDS, b2 as OCCLUDABLE_ITEMS_LAYER, b3 as ObjectDetector, b4 as ObjectsOptions, b5 as OcclusionPass, b6 as OcclusionUtils, b7 as OpenAI, b8 as OpenAIOptions, O as Options, b9 as Orbit, P as Physics, ba as PhysicsOptions, bb as PlaneDetector, bc as PlanesOptions, bd as PoseJointName, be as RIGHT, bf as RIGHT_VIEW_ONLY_LAYER, l as Registry, bg as ReticleOptions, bh as Reticles, bi as SIMULATOR_HAND_COMMON_BIOMECHANICAL_CONSTRAINTS_DEGREES, G as SIMULATOR_HAND_POSE_NAMES, d as SIMULATOR_HAND_POSE_ROTATIONS, bj as SOUND_PRESETS, bk as SceneDetector, bl as SceneOptions, bm as SceneSetOfMarkOptions, bn as SceneVisibilityOptions, bo as ScreenshotSynthesizer, a as Script, bp as ScriptMixin, bq as ScriptsManager, br as ScriptsManagerEventType, bs as SegmentCategory, bt as SegmentationOptions, bu as Segmenter, i as SetSimulatorEnvironmentEvent, k as SetSimulatorHandPhysicsEvent, c as SetSimulatorModeEvent, j as ShowSimulatorInstructionsEvent, S as SimulatorHandPose, e as SimulatorHandPoseChangeRequestEvent, b as SimulatorMode, q as SimulatorOptions, bv as SkyboxAgent, bw as SoundOptions, bx as SoundSynthesizer, s as SparkRendererHolder, by as SpatialAudio, bz as SpeechRecognizer, bA as SpeechRecognizerOptions, bB as SpeechSynthesizer, bC as SpeechSynthesizerOptions, bD as StreamState, bE as StrokeRecognizer, bF as StylizedFace, bG as TensorFlowHandPoseEstimator, bH as Tool, T as TransformScript, bI as UIButton, C as UICard, bJ as UIIcon, bK as UIImage, E as UIOverlay, bL as UIPanel, bM as UISlider, U as UIText, bN as UP, bO as User, bP as VIEW_DEPTH_GAP, bQ as VideoFileStream, bR as VideoStream, bS as VisibilityTransition, bT as VolumeCategory, W as WaitFrame, bU as WebXRHandContext, bV as WebXRHandPoseEstimator, o as World, bW as WorldOptions, bX as XRButton, X as XRDeviceCamera, bY as XREffects, bZ as XRPass, b_ as XRTransitionOptions, F as XR_BLOCKS_ASSETS_PATH, b$ as ZERO_VECTOR3, c0 as ZERO_VISEME, c1 as _getBvhImportStatus, c2 as add, c3 as ai, c4 as applyBVH, g as applySimulatorHandPoseRotationConstraints, c5 as average, m as callInitWithDependencyInjection, c6 as camera, c7 as clamp, c8 as clamp01, c9 as clampRotationToAngle, ca as context, cb as core, cc as cropImage, cd as depth, ce as disposeBVH, cf as enableAcceleratedRaycast, cg as estimateHandScale, ch as extractYaw, ci as getAdjacentFingerSpreads, cj as getBoneVectors, ck as getCameraParametersSnapshot, cl as getColorHex, cm as getDeltaTime, cn as getDeviceCameraClipFromView, co as getDeviceCameraWorldFromClip, cp as getDeviceCameraWorldFromView, cq as getElapsedTime, cr as getFingerBendAngles, cs as getFingerCurl, ct as getFingerDirection, cu as getFingerJoint, cv as getFingerPalmAlignment, cw as getFingerSpread, cx as getFingerStraightness, cy as getFingertipDistance, cz as getFingertipPalmDistance, cA as getPalmNormal, cB as getPalmPose, cC as getPalmRight, cD as getPalmUp, cE as getPalmWidth, cF as getRelativeBoneAngles, cG as getThumbBendAngles, cH as getThumbCurl, cI as getThumbDirection, cJ as getThumbOpposition, cK as getThumbStraightness, cL as getThumbVerticalDirection, cM as getUrlParamBool, cN as getUrlParamFloat, cO as getUrlParamInt, cP as getUrlParameter, cQ as getVec4ByColorString, cR as getXrCameraLeft, cS as getXrCameraRight, cT as init, cU as initScript, cV as input, cW as intrinsicsToProjectionMatrix, cX as isBVHReady, cY as isDeviceCameraPoseAvailable, cZ as lerp, c_ as loadStereoImageAsTextures, c$ as loadingSpinnerManager, d0 as lookAtRotation, d1 as objectIsDescendantOf, d2 as parseBase64DataURL, d3 as parseSimulatorHandPoseRotations, d4 as placeObjectAtIntersectionFacingTarget, d5 as print, r as resolveSimulatorHandPoseRotations, d6 as resolveSimulatorRotationsFromKeypoints, d7 as scene, d8 as showOnlyInLeftEye, d9 as showOnlyInRightEye, da as sound, db as timer, dc as transformRgbUvToWorld, dd as traverseUtil, de as ui, df as urlParams, dg as user, dh as visualizeDepth, di as visualizeDepthMap, dj as world, dk as xrDepthMeshOptions, dl as xrDepthMeshPhysicsOptions, dm as xrDepthMeshVisualizationOptions, dn as xrDeviceCameraEnvironmentContinuousOptions, dp as xrDeviceCameraEnvironmentOptions, dq as xrDeviceCameraUserContinuousOptions, dr as xrDeviceCameraUserOptions } from './internal/entry.js';
import 'three';
import 'three/addons/postprocessing/Pass.js';
import 'three/addons/webxr/XRControllerModelFactory.js';
import 'three/addons/webxr/XRHandModelFactory.js';
import 'three/addons/webxr/XREstimatedLight.js';
import 'three/addons/loaders/DRACOLoader.js';
import 'three/addons/loaders/GLTFLoader.js';
import 'three/addons/loaders/KTX2Loader.js';
//# sourceMappingURL=xrblocks.js.map
