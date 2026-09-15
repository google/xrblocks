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
 * @commitid adca533
 * @builddate 2026-09-15T01:37:01.134Z
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
export { a0 as AI, a1 as AIOptions, a2 as ActiveControllers, a3 as Agent, a4 as AnchorManager, a5 as AnchoredObjects, a6 as AnchorsOptions, a7 as AudioListener, a8 as AudioPlayer, a9 as BACK, aa as BackgroundMusic, ab as CategoryVolumes, ac as Context, ad as ContextOptions, ae as Core, af as CoreSound, ag as DEFAULT_DEVICE_CAMERA_HEIGHT, ah as DEFAULT_DEVICE_CAMERA_WIDTH, ai as DEFAULT_RGB_TO_DEPTH_PARAMS, aj as DEVICE_CAMERA_PARAMETERS, ak as DOWN, D as Depth, al as DepthMesh, am as DepthMeshOptions, an as DepthOptions, ao as DepthTextures, ap as DetectedBodyPose, aq as DetectedFace, ar as DetectedMesh, as as DetectedObject, at as DetectedPlane, au as DeviceCameraOptions, av as FINGER_ORDER, aw as FORWARD, ax as FaceCamera, ay as FaceLandmarkName, az as FaceRecognizer, aA as FacesOptions, aB as FollowHead, aC as FollowObject, aD as GEMINI_DEFAULT_FLASH_MODEL, aE as GEMINI_DEFAULT_IMAGE_MODEL, aF as GEMINI_DEFAULT_LIVE_MODEL, aG as GamepadBindings, aH as GamepadController, aI as GazeController, aJ as Gemini, aK as GeminiOptions, aL as GenerateSkyboxTool, aM as GestureRecognition, aN as GestureRecognitionOptions, aO as GetWeatherTool, aP as HAND_BONE_IDX_CONNECTION_MAP, aQ as HAND_INDEX_TO_LABEL, aR as HAND_JOINT_COUNT, aS as HAND_JOINT_IDX_CONNECTION_MAP, f as HAND_JOINT_NAMES, H as Handedness, aT as Hands, aU as HandsOptions, aV as HeadGestureRecognition, aW as HeadGestureRecognitionOptions, aX as HeuristicGestureRecognizer, aY as HeuristicHeadGestureRecognizer, aZ as HumanRecognizer, a_ as HumansOptions, p as Input, a$ as InputOptions, I as Interaction, b0 as InteractionOptions, K as Keycodes, b1 as LEFT, b2 as LEFT_VIEW_ONLY_LAYER, b3 as Lighting, b4 as LightingOptions, b5 as LoadingSpinnerManager, b6 as LocalStorageAnchorStore, v as ManipulationAction, b7 as MediaPipeHandContext, b8 as MediaPipeHandPoseEstimator, b9 as MeshDetectionOptions, ba as MeshDetector, bb as MeshScript, M as ModelLoader, bc as ModelViewer, bd as MouseController, be as NUM_HANDS, bf as OCCLUDABLE_ITEMS_LAYER, bg as ObjectDetector, bh as ObjectsOptions, bi as OcclusionPass, bj as OcclusionUtils, bk as OpenAI, bl as OpenAIOptions, O as Options, bm as Orbit, P as Physics, bn as PhysicsOptions, bo as PlaneDetector, bp as PlanesOptions, bq as PoseJointName, br as RIGHT, bs as RIGHT_VIEW_ONLY_LAYER, l as Registry, bt as ReticleOptions, bu as Reticles, bv as SIMULATOR_HAND_COMMON_BIOMECHANICAL_CONSTRAINTS_DEGREES, $ as SIMULATOR_HAND_POSE_NAMES, d as SIMULATOR_HAND_POSE_ROTATIONS, bw as SOUND_PRESETS, bx as SceneDetector, by as SceneOptions, bz as SceneSetOfMarkOptions, bA as SceneVisibilityOptions, bB as ScreenshotSynthesizer, a as Script, bC as ScriptMixin, bD as ScriptsManager, bE as ScriptsManagerEventType, bF as SegmentCategory, bG as SegmentationOptions, bH as Segmenter, i as SetSimulatorEnvironmentEvent, k as SetSimulatorHandPhysicsEvent, c as SetSimulatorModeEvent, j as ShowSimulatorInstructionsEvent, bI as SimulatorAnchor, S as SimulatorHandPose, e as SimulatorHandPoseChangeRequestEvent, b as SimulatorMode, q as SimulatorOptions, bJ as SkyboxAgent, bK as SoundOptions, bL as SoundSynthesizer, s as SparkRendererHolder, bM as SpatialAudio, bN as SpeechRecognizer, bO as SpeechRecognizerOptions, bP as SpeechSynthesizer, bQ as SpeechSynthesizerOptions, bR as StreamState, bS as StrokeRecognizer, bT as StylizedFace, bU as TensorFlowHandPoseEstimator, bV as Tool, T as TransformScript, bW as UIButton, F as UICard, bX as UIElement, bY as UIIcon, bZ as UIImage, Z as UIOverlay, b_ as UIPanel, U as UIScrollView, b$ as UISlider, J as UIText, L as UITextInput, c0 as UP, c1 as User, c2 as VIEW_DEPTH_GAP, c3 as VideoFileStream, c4 as VideoStream, c5 as VisibilityTransition, c6 as VolumeCategory, W as WaitFrame, c7 as WebXRHandContext, c8 as WebXRHandPoseEstimator, o as World, c9 as WorldOptions, ca as XRButton, X as XRDeviceCamera, cb as XREffects, cc as XRPass, cd as XRReferenceSpaceCache, ce as XRTransitionOptions, _ as XR_BLOCKS_ASSETS_PATH, cf as ZERO_VECTOR3, cg as ZERO_VISEME, ch as _getBvhImportStatus, ci as add, cj as ai, ck as anchorCapability, cl as applyBVH, g as applySimulatorHandPoseRotationConstraints, cm as average, m as callInitWithDependencyInjection, cn as camera, co as clamp, cp as clamp01, cq as clampRotationToAngle, cr as context, cs as core, ct as cropImage, cu as defaultAnchorStorageKey, cv as depth, cw as disposeBVH, cx as disposeMaterial, cy as disposeMeshResources, h as disposeObjectChildren, n as disposeObjectTree, cz as disposeRenderableResources, cA as enableAcceleratedRaycast, cB as estimateHandScale, cC as extractYaw, cD as getAdjacentFingerSpreads, cE as getBoneVectors, cF as getCameraParametersSnapshot, cG as getColorHex, cH as getDeltaTime, cI as getDeviceCameraClipFromView, cJ as getDeviceCameraWorldFromClip, cK as getDeviceCameraWorldFromView, cL as getElapsedTime, cM as getFingerBendAngles, cN as getFingerCurl, cO as getFingerDirection, cP as getFingerJoint, cQ as getFingerPalmAlignment, cR as getFingerSpread, cS as getFingerStraightness, cT as getFingertipDistance, cU as getFingertipPalmDistance, cV as getObjectTargetPoint, cW as getPalmNormal, cX as getPalmPose, cY as getPalmRight, cZ as getPalmUp, c_ as getPalmWidth, c$ as getRelativeBoneAngles, d0 as getThumbBendAngles, d1 as getThumbCurl, d2 as getThumbDirection, d3 as getThumbOpposition, d4 as getThumbStraightness, d5 as getThumbVerticalDirection, d6 as getUrlParamBool, d7 as getUrlParamFloat, d8 as getUrlParamInt, d9 as getUrlParameter, da as getVec4ByColorString, db as getXrCameraLeft, dc as getXrCameraRight, dd as init, de as initScript, df as input, dg as intrinsicsToProjectionMatrix, dh as isBVHReady, di as isDeviceCameraPoseAvailable, dj as lerp, dk as loadStereoImageAsTextures, dl as loadingSpinnerManager, dm as lookAtRotation, dn as objectIsDescendantOf, dp as parseBase64DataURL, dq as parseSimulatorHandPoseRotations, dr as placeObjectAtIntersectionFacingTarget, ds as print, r as resolveSimulatorHandPoseRotations, dt as resolveSimulatorRotationsFromKeypoints, du as scene, dv as showOnlyInLeftEye, dw as showOnlyInRightEye, dx as sound, dy as timer, dz as transformRgbUvToWorld, dA as traverseUtil, dB as ui, dC as urlParams, dD as user, dE as visualizeDepth, dF as visualizeDepthMap, dG as world, dH as xrDepthMeshOptions, dI as xrDepthMeshPhysicsOptions, dJ as xrDepthMeshVisualizationOptions, dK as xrDeviceCameraEnvironmentContinuousOptions, dL as xrDeviceCameraEnvironmentOptions, dM as xrDeviceCameraUserContinuousOptions, dN as xrDeviceCameraUserOptions } from './internal/entry.js';
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
