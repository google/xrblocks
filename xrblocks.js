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
 * @commitid 7cbc644
 * @builddate 2026-09-03T16:10:50.389Z
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
export { N as AI, Q as AIOptions, V as ActiveControllers, Y as Agent, Z as AnchorManager, _ as AnchoredObjects, $ as AnchorsOptions, a0 as AudioListener, a1 as AudioPlayer, a2 as BACK, a3 as BackgroundMusic, a4 as CategoryVolumes, a5 as Context, a6 as ContextOptions, a7 as Core, a8 as CoreSound, a9 as DEFAULT_DEVICE_CAMERA_HEIGHT, aa as DEFAULT_DEVICE_CAMERA_WIDTH, ab as DEFAULT_RGB_TO_DEPTH_PARAMS, ac as DEVICE_CAMERA_PARAMETERS, ad as DOWN, D as Depth, ae as DepthMesh, af as DepthMeshOptions, ag as DepthOptions, ah as DepthTextures, ai as DetectedBodyPose, aj as DetectedFace, ak as DetectedMesh, al as DetectedObject, am as DetectedPlane, an as DeviceCameraOptions, ao as FINGER_ORDER, ap as FORWARD, aq as FaceCamera, ar as FaceLandmarkName, as as FaceRecognizer, at as FacesOptions, au as FollowHead, av as FollowObject, aw as GEMINI_DEFAULT_FLASH_MODEL, ax as GEMINI_DEFAULT_IMAGE_MODEL, ay as GEMINI_DEFAULT_LIVE_MODEL, az as GamepadBindings, aA as GamepadController, aB as GazeController, aC as Gemini, aD as GeminiOptions, aE as GenerateSkyboxTool, aF as GestureRecognition, aG as GestureRecognitionOptions, aH as GetWeatherTool, aI as HAND_BONE_IDX_CONNECTION_MAP, aJ as HAND_INDEX_TO_LABEL, aK as HAND_JOINT_COUNT, aL as HAND_JOINT_IDX_CONNECTION_MAP, f as HAND_JOINT_NAMES, H as Handedness, aM as Hands, aN as HandsOptions, aO as HeadGestureRecognition, aP as HeadGestureRecognitionOptions, aQ as HeuristicGestureRecognizer, aR as HeuristicHeadGestureRecognizer, aS as HumanRecognizer, aT as HumansOptions, p as Input, aU as InputOptions, I as Interaction, aV as InteractionOptions, K as Keycodes, aW as LEFT, aX as LEFT_VIEW_ONLY_LAYER, aY as Lighting, aZ as LightingOptions, a_ as LoadingSpinnerManager, a$ as LocalStorageAnchorStore, v as ManipulationAction, b0 as MediaPipeHandContext, b1 as MediaPipeHandPoseEstimator, b2 as MeshDetectionOptions, b3 as MeshDetector, b4 as MeshScript, M as ModelLoader, b5 as ModelViewer, b6 as MouseController, b7 as NUM_HANDS, b8 as OCCLUDABLE_ITEMS_LAYER, b9 as ObjectDetector, ba as ObjectsOptions, bb as OcclusionPass, bc as OcclusionUtils, bd as OpenAI, be as OpenAIOptions, O as Options, bf as Orbit, P as Physics, bg as PhysicsOptions, bh as PlaneDetector, bi as PlanesOptions, bj as PoseJointName, bk as RIGHT, bl as RIGHT_VIEW_ONLY_LAYER, l as Registry, bm as ReticleOptions, bn as Reticles, bo as SIMULATOR_HAND_COMMON_BIOMECHANICAL_CONSTRAINTS_DEGREES, L as SIMULATOR_HAND_POSE_NAMES, d as SIMULATOR_HAND_POSE_ROTATIONS, bp as SOUND_PRESETS, bq as SceneDetector, br as SceneOptions, bs as SceneSetOfMarkOptions, bt as SceneVisibilityOptions, bu as ScreenshotSynthesizer, a as Script, bv as ScriptMixin, bw as ScriptsManager, bx as ScriptsManagerEventType, by as SegmentCategory, bz as SegmentationOptions, bA as Segmenter, i as SetSimulatorEnvironmentEvent, k as SetSimulatorHandPhysicsEvent, c as SetSimulatorModeEvent, j as ShowSimulatorInstructionsEvent, bB as SimulatorAnchor, S as SimulatorHandPose, e as SimulatorHandPoseChangeRequestEvent, b as SimulatorMode, q as SimulatorOptions, bC as SkyboxAgent, bD as SoundOptions, bE as SoundSynthesizer, s as SparkRendererHolder, bF as SpatialAudio, bG as SpeechRecognizer, bH as SpeechRecognizerOptions, bI as SpeechSynthesizer, bJ as SpeechSynthesizerOptions, bK as StreamState, bL as StrokeRecognizer, bM as StylizedFace, bN as TensorFlowHandPoseEstimator, bO as Tool, T as TransformScript, bP as UIButton, U as UICard, bQ as UIElement, bR as UIIcon, bS as UIImage, G as UIOverlay, bT as UIPanel, bU as UISlider, z as UIText, bV as UP, bW as User, bX as VIEW_DEPTH_GAP, bY as VideoFileStream, bZ as VideoStream, b_ as VisibilityTransition, b$ as VolumeCategory, W as WaitFrame, c0 as WebXRHandContext, c1 as WebXRHandPoseEstimator, o as World, c2 as WorldOptions, c3 as XRButton, X as XRDeviceCamera, c4 as XREffects, c5 as XRPass, c6 as XRReferenceSpaceCache, c7 as XRTransitionOptions, J as XR_BLOCKS_ASSETS_PATH, c8 as ZERO_VECTOR3, c9 as ZERO_VISEME, ca as _getBvhImportStatus, cb as add, cc as ai, cd as anchorCapability, ce as applyBVH, g as applySimulatorHandPoseRotationConstraints, cf as average, m as callInitWithDependencyInjection, cg as camera, ch as clamp, ci as clamp01, cj as clampRotationToAngle, ck as context, cl as core, cm as cropImage, cn as defaultAnchorStorageKey, co as depth, cp as disposeBVH, cq as disposeMaterial, cr as disposeMeshResources, h as disposeObjectChildren, n as disposeObjectTree, cs as disposeRenderableResources, ct as enableAcceleratedRaycast, cu as estimateHandScale, cv as extractYaw, cw as getAdjacentFingerSpreads, cx as getBoneVectors, cy as getCameraParametersSnapshot, cz as getColorHex, cA as getDeltaTime, cB as getDeviceCameraClipFromView, cC as getDeviceCameraWorldFromClip, cD as getDeviceCameraWorldFromView, cE as getElapsedTime, cF as getFingerBendAngles, cG as getFingerCurl, cH as getFingerDirection, cI as getFingerJoint, cJ as getFingerPalmAlignment, cK as getFingerSpread, cL as getFingerStraightness, cM as getFingertipDistance, cN as getFingertipPalmDistance, cO as getObjectTargetPoint, cP as getPalmNormal, cQ as getPalmPose, cR as getPalmRight, cS as getPalmUp, cT as getPalmWidth, cU as getRelativeBoneAngles, cV as getThumbBendAngles, cW as getThumbCurl, cX as getThumbDirection, cY as getThumbOpposition, cZ as getThumbStraightness, c_ as getThumbVerticalDirection, c$ as getUrlParamBool, d0 as getUrlParamFloat, d1 as getUrlParamInt, d2 as getUrlParameter, d3 as getVec4ByColorString, d4 as getXrCameraLeft, d5 as getXrCameraRight, d6 as init, d7 as initScript, d8 as input, d9 as intrinsicsToProjectionMatrix, da as isBVHReady, db as isDeviceCameraPoseAvailable, dc as lerp, dd as loadStereoImageAsTextures, de as loadingSpinnerManager, df as lookAtRotation, dg as objectIsDescendantOf, dh as parseBase64DataURL, di as parseSimulatorHandPoseRotations, dj as placeObjectAtIntersectionFacingTarget, dk as print, r as resolveSimulatorHandPoseRotations, dl as resolveSimulatorRotationsFromKeypoints, dm as scene, dn as showOnlyInLeftEye, dp as showOnlyInRightEye, dq as sound, dr as timer, ds as transformRgbUvToWorld, dt as traverseUtil, du as ui, dv as urlParams, dw as user, dx as visualizeDepth, dy as visualizeDepthMap, dz as world, dA as xrDepthMeshOptions, dB as xrDepthMeshPhysicsOptions, dC as xrDepthMeshVisualizationOptions, dD as xrDeviceCameraEnvironmentContinuousOptions, dE as xrDeviceCameraEnvironmentOptions, dF as xrDeviceCameraUserContinuousOptions, dG as xrDeviceCameraUserOptions } from './internal/entry.js';
import 'three';
import 'three/addons/postprocessing/Pass.js';
import 'three/addons/webxr/XRControllerModelFactory.js';
import 'three/addons/webxr/XRHandModelFactory.js';
import 'three/addons/webxr/XREstimatedLight.js';
import 'three/addons/loaders/FontLoader.js';
import 'three/addons/geometries/TextGeometry.js';
import 'three/addons/loaders/DRACOLoader.js';
import 'three/addons/loaders/GLTFLoader.js';
import 'three/addons/loaders/KTX2Loader.js';
//# sourceMappingURL=xrblocks.js.map
