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
 * @commitid dec4110
 * @builddate 2026-09-23T21:51:08.809Z
 * @description XR Blocks SDK, built from source with the above commit ID.
 * @agent When using with Gemini to create XR apps, use **Gemini Canvas** mode,
 * and follow rules below:
 * 1. Include the following importmap for maximum compatibility:
    "three": "https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/",
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
export { a4 as AI, a5 as AIOptions, a6 as ActiveControllers, a7 as Agent, a8 as AnchorManager, a9 as AnchoredObjects, aa as AnchorsOptions, ab as AudioListener, ac as AudioPlayer, ad as BACK, ae as BackgroundMusic, af as CategoryVolumes, ag as Context, ah as ContextOptions, ai as Core, aj as CoreSound, ak as DEFAULT_DEVICE_CAMERA_HEIGHT, al as DEFAULT_DEVICE_CAMERA_WIDTH, am as DEFAULT_RGB_TO_DEPTH_PARAMS, an as DEVICE_CAMERA_PARAMETERS, ao as DOWN, D as Depth, ap as DepthMesh, aq as DepthMeshOptions, ar as DepthOptions, as as DepthTextures, at as DetectedBodyPose, au as DetectedFace, av as DetectedMesh, aw as DetectedObject, ax as DetectedPlane, ay as DeviceCameraOptions, az as FINGER_ORDER, aA as FORWARD, aB as FaceCamera, aC as FaceLandmarkName, aD as FaceRecognizer, aE as FacesOptions, aF as FollowHead, aG as FollowObject, aH as GEMINI_DEFAULT_FLASH_MODEL, aI as GEMINI_DEFAULT_IMAGE_MODEL, aJ as GEMINI_DEFAULT_LIVE_MODEL, aK as GamepadBindings, aL as GamepadController, aM as GazeController, aN as Gemini, aO as GeminiOptions, aP as GenerateSkyboxTool, aQ as GestureRecognition, aR as GestureRecognitionOptions, aS as GetWeatherTool, aT as HAND_BONE_IDX_CONNECTION_MAP, aU as HAND_INDEX_TO_LABEL, aV as HAND_JOINT_COUNT, aW as HAND_JOINT_IDX_CONNECTION_MAP, g as HAND_JOINT_NAMES, H as Handedness, aX as Hands, aY as HandsOptions, aZ as HeadGestureRecognition, a_ as HeadGestureRecognitionOptions, a$ as HeuristicGestureRecognizer, b0 as HeuristicHeadGestureRecognizer, b1 as HumanRecognizer, b2 as HumansOptions, s as Input, b3 as InputOptions, I as Interaction, b4 as InteractionOptions, K as Keycodes, b5 as LEFT, b6 as LEFT_VIEW_ONLY_LAYER, b7 as LayerManager, b8 as LayersOptions, b9 as Lighting, ba as LightingOptions, bb as LoadingSpinnerManager, bc as LocalStorageAnchorStore, x as ManipulationAction, bd as MediaPipeHandContext, be as MediaPipeHandPoseEstimator, bf as MeshDetectionOptions, bg as MeshDetector, bh as MeshScript, M as ModelLoader, bi as ModelViewer, bj as MouseController, bk as NUM_HANDS, u as OCCLUDABLE_ITEMS_LAYER, bl as ObjectDetector, bm as ObjectsOptions, bn as OcclusionPass, bo as OcclusionUtils, bp as OpenAI, bq as OpenAIOptions, O as Options, br as Orbit, P as Physics, bs as PhysicsOptions, bt as PlaneDetector, bu as PlanesOptions, bv as PoseJointName, bw as RENDERER_BACKENDS, bx as RIGHT, by as RIGHT_VIEW_ONLY_LAYER, n as Registry, bz as ReticleOptions, bA as Reticles, bB as SIMULATOR_HAND_COMMON_BIOMECHANICAL_CONSTRAINTS_DEGREES, a3 as SIMULATOR_HAND_POSE_NAMES, e as SIMULATOR_HAND_POSE_ROTATIONS, bC as SOUND_PRESETS, bD as SceneDetector, bE as SceneOptions, bF as SceneSetOfMarkOptions, bG as SceneVisibilityOptions, bH as ScreenshotSynthesizer, b as Script, bI as ScriptMixin, bJ as ScriptsManager, bK as ScriptsManagerEventType, bL as SegmentCategory, bM as SegmentationOptions, bN as Segmenter, k as SetSimulatorEnvironmentEvent, m as SetSimulatorHandPhysicsEvent, d as SetSimulatorModeEvent, l as ShowSimulatorInstructionsEvent, bO as SimulatorAnchor, a as SimulatorHandPose, f as SimulatorHandPoseChangeRequestEvent, c as SimulatorMode, t as SimulatorOptions, bP as SkyboxAgent, bQ as SoundOptions, bR as SoundSynthesizer, S as SparkRendererHolder, bS as SpatialAudio, bT as SpeechRecognizer, bU as SpeechRecognizerOptions, bV as SpeechSynthesizer, bW as SpeechSynthesizerOptions, bX as StreamState, bY as StrokeRecognizer, bZ as StylizedFace, b_ as TensorFlowHandPoseEstimator, b$ as Tool, T as TransformScript, c0 as UIButton, J as UICard, c1 as UIElement, c2 as UIIcon, c3 as UIImage, a1 as UIOverlay, c4 as UIPanel, U as UIScrollView, c5 as UISlider, Q as UIText, V as UITextInput, c6 as UP, c7 as User, c8 as VIEW_DEPTH_GAP, c9 as VideoFileStream, ca as VideoLayer, cb as VideoStream, cc as VisibilityTransition, cd as VolumeCategory, W as WaitFrame, ce as WebXRHandContext, cf as WebXRHandPoseEstimator, q as World, cg as WorldOptions, ch as XRButton, X as XRDeviceCamera, ci as XREffects, cj as XRPass, ck as XRReferenceSpaceCache, cl as XRTransitionOptions, a2 as XR_BLOCKS_ASSETS_PATH, cm as ZERO_VECTOR3, cn as ZERO_VISEME, co as _getBvhImportStatus, cp as add, cq as ai, cr as anchorCapability, cs as applyBVH, h as applySimulatorHandPoseRotationConstraints, ct as aspectRatioOf, cu as assertWebGLRenderer, cv as average, o as callInitWithDependencyInjection, cw as camera, cx as clamp, cy as clamp01, cz as clampRotationToAngle, cA as context, cB as core, cC as cropImage, cD as defaultAnchorStorageKey, cE as depth, cF as disposeBVH, cG as disposeMaterial, cH as disposeMeshResources, j as disposeObjectChildren, p as disposeObjectTree, cI as disposeRenderableResources, cJ as enableAcceleratedRaycast, cK as estimateHandScale, cL as extractYaw, cM as getAdjacentFingerSpreads, cN as getBoneVectors, cO as getCameraParametersSnapshot, cP as getColorHex, cQ as getDeltaTime, cR as getDeviceCameraClipFromView, cS as getDeviceCameraWorldFromClip, cT as getDeviceCameraWorldFromView, cU as getElapsedTime, cV as getFingerBendAngles, cW as getFingerCurl, cX as getFingerDirection, cY as getFingerJoint, cZ as getFingerPalmAlignment, c_ as getFingerSpread, c$ as getFingerStraightness, d0 as getFingertipDistance, d1 as getFingertipPalmDistance, d2 as getObjectTargetPoint, d3 as getPalmNormal, d4 as getPalmPose, d5 as getPalmRight, d6 as getPalmUp, d7 as getPalmWidth, d8 as getRelativeBoneAngles, d9 as getThumbBendAngles, da as getThumbCurl, db as getThumbDirection, dc as getThumbOpposition, dd as getThumbStraightness, de as getThumbVerticalDirection, df as getUrlParamBool, dg as getUrlParamFloat, dh as getUrlParamInt, di as getUrlParameter, dj as getVec4ByColorString, dk as getXrCameraLeft, dl as getXrCameraRight, dm as init, dn as initScript, dp as input, dq as intrinsicsToProjectionMatrix, dr as isBVHReady, ds as isDeviceCameraPoseAvailable, dt as isLayerCapable, i as isWebGPURenderer, du as layerCapability, dv as lerp, dw as loadStereoImageAsTextures, dx as loadingSpinnerManager, dy as lookAtRotation, dz as objectIsDescendantOf, dA as parseBase64DataURL, dB as parseSimulatorHandPoseRotations, dC as placeObjectAtIntersectionFacingTarget, dD as print, r as resolveSimulatorHandPoseRotations, dE as resolveSimulatorRotationsFromKeypoints, dF as scene, dG as showOnlyInLeftEye, dH as showOnlyInRightEye, dI as sound, dJ as timer, dK as transformRgbUvToWorld, dL as traverseUtil, dM as ui, dN as urlParams, dO as user, dP as visualizeDepth, dQ as visualizeDepthMap, dR as world, dS as xrDepthMeshOptions, dT as xrDepthMeshPhysicsOptions, dU as xrDepthMeshVisualizationOptions, dV as xrDeviceCameraEnvironmentContinuousOptions, dW as xrDeviceCameraEnvironmentOptions, dX as xrDeviceCameraUserContinuousOptions, dY as xrDeviceCameraUserOptions } from './internal/entry.js';
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
