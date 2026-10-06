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
* @commitid adef18e
* @builddate 2026-10-06T18:02:50.040Z
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
import { t as __exportAll } from "./internal/rolldown-runtime.js";
import { C as getUIPresentationBounds, D as isUIElement, F as Script, I as ScriptMixin, L as isDefaultScriptMethod, P as MeshScript, S as getUIElementKind, b as cloneUIStyle, f as normalizeManipulationConfig, h as getSemanticControl, j as TransformScript, m as ManipulationAction, n as getResolvedUICardSize, t as UICard, v as registerSemanticControl, w as getUIPresentationObject, x as collectUIRoots, y as UIElement } from "./internal/UICard.js";
import { $n as AIOptions, $t as getFingerJoint, A as DetectedObject, An as VideoStream, At as SoundOptions, B as GazeController, Bn as getDeviceCameraWorldFromView, Bt as WebXRHandContext, C as AnchorManager, Cn as xrDepthMeshVisualizationOptions, Ct as defaultAnchorStorageKey, D as PlaneDetector, Dn as SceneVisibilityOptions, Dt as PlanesOptions, E as anchorCapability, En as SceneSetOfMarkOptions, Et as HumansOptions, F as ActiveControllers, Fn as cropImage, Ft as StrokeRecognitionOptions, G as OcclusionUtils, Gn as DeviceCameraOptions, Gt as average, H as GamepadBindings, Hn as transformRgbUvToWorld, Ht as HAND_INDEX_TO_LABEL, I as Input, In as detectDeviceCameraTarget, It as OneDollarUnistrokeRecognizer, J as XRReferenceSpaceCache, Jn as xrDeviceCameraUserContinuousOptions, Jt as getAdjacentFingerSpreads, K as OcclusionPass, Kn as xrDeviceCameraEnvironmentContinuousOptions, Kt as clamp01, L as Reticles, Ln as getCameraParametersSnapshot, Lt as HeadGestureRecognitionOptions, M as callInitWithDependencyInjection, Mn as assertWebGLRenderer, Mt as SpeechSynthesizerOptions, N as AudioListener, Nn as isWebGPURenderer, Nt as PhysicsOptions, O as DetectedPlane, On as XRDeviceCamera, Ot as ObjectsOptions, P as Physics, Pn as DEVICE_CAMERA_PARAMETERS, Pt as LightingOptions, Q as Interaction, Qn as Gemini, Qt as getFingerDirection, R as MouseController, Rn as getDeviceCameraClipFromView, Rt as HeuristicHeadGestureRecognizer, S as DetectedMesh, Sn as xrDepthMeshPhysicsOptions, St as AnchorsOptions, T as LocalStorageAnchorStore, Tn as SceneOptions, Tt as FacesOptions, Un as intrinsicsToProjectionMatrix, Ut as HeuristicGestureRecognizer, V as GamepadController, Vn as isDeviceCameraPoseAvailable, Vt as WebXRHandPoseEstimator, W as Depth, Wn as DEFAULT_RGB_TO_DEPTH_PARAMS, Wt as FINGER_ORDER, X as Registry, Xn as AI, Xt as getFingerBendAngles, Y as WaitFrame, Yn as xrDeviceCameraUserOptions, Yt as getBoneVectors, Z as DepthMesh, Zn as OpenAI, Zt as getFingerCurl, _ as isBVHReady, _n as LayersOptions, _t as Options, a as resolveSimulatorRotationsFromKeypoints, an as getPalmNormal, ar as clamp, at as FORWARD, b as PoseJointName, bn as DepthOptions, bt as XRTransitionOptions, c as World, cn as getPalmUp, cr as getUrlParamFloat, ct as UP, d as DetectedFace, dn as getThumbBendAngles, dr as getVec4ByColorString, dt as getInteractionSource, en as getFingerPalmAlignment, er as GEMINI_DEFAULT_FLASH_MODEL, f as FaceLandmarkName, fn as getThumbCurl, fr as lerp, ft as getObjectTargetPoint, g as enableAcceleratedRaycast, gn as getThumbVerticalDirection, gt as InteractionOptions, h as disposeBVH, hn as getThumbStraightness, hr as urlParams, ht as InputOptions, i as resolveSimulatorHandPoseRotations, in as getFingertipPalmDistance, ir as OpenAIOptions, it as DOWN, j as placeObjectAtIntersectionFacingTarget, jn as RendererHolder, jt as SpeechRecognizerOptions, k as ObjectDetector, kn as StreamState, kt as MeshDetectionOptions, l as Segmenter, ln as getPalmWidth, lr as getUrlParamInt, lt as ZERO_VECTOR3, m as applyBVH, mn as getThumbOpposition, mr as print, mt as traverseUtil, n as SIMULATOR_HAND_POSE_ROTATIONS, nn as getFingerStraightness, nr as GEMINI_DEFAULT_LIVE_MODEL, nt as faceCameraSlerpAlpha, o as SIMULATOR_HAND_COMMON_BIOMECHANICAL_CONSTRAINTS_DEGREES, on as getPalmPose, or as getColorHex, ot as LEFT, p as _getBvhImportStatus, pn as getThumbDirection, pr as parseBase64DataURL, pt as objectIsDescendantOf, q as DepthTextures, qn as xrDeviceCameraEnvironmentOptions, qt as estimateHandScale, r as applySimulatorHandPoseRotationConstraints, rn as getFingertipDistance, rr as GeminiOptions, rt as BACK, s as parseSimulatorHandPoseRotations, sn as getPalmRight, sr as getUrlParamBool, st as RIGHT, t as ModelLoader, tn as getFingerSpread, tr as GEMINI_DEFAULT_IMAGE_MODEL, tt as faceCameraQuaternion, u as FaceRecognizer, un as getRelativeBoneAngles, ur as getUrlParameter, ut as ReticlePresenter, v as HumanRecognizer, vn as HandsOptions, vt as RENDERER_BACKENDS, w as SimulatorAnchor, wn as ContextOptions, wt as SegmentationOptions, x as MeshDetector, xn as xrDepthMeshOptions, xt as WorldOptions, y as DetectedBodyPose, yn as DepthMeshOptions, yt as ReticleOptions, z as HeadGestureRecognition, zn as getDeviceCameraWorldFromClip, zt as GestureRecognitionOptions } from "./internal/ModelLoader.js";
import { a as HAND_JOINT_IDX_CONNECTION_MAP, c as OCCLUDABLE_ITEMS_LAYER, d as XR_BLOCKS_ASSETS_PATH, i as HAND_JOINT_COUNT, l as RIGHT_VIEW_ONLY_LAYER, n as DEFAULT_DEVICE_CAMERA_WIDTH, o as LEFT_VIEW_ONLY_LAYER, r as HAND_BONE_IDX_CONNECTION_MAP, s as NUM_HANDS, t as DEFAULT_DEVICE_CAMERA_HEIGHT, u as VIEW_DEPTH_GAP } from "./internal/constants.js";
import { a as SetSimulatorModeEvent, c as SimulatorMode, d as Handedness, f as Hands, i as ShowSimulatorInstructionsEvent, l as SimulatorOptions, n as SimulatorHandPose, o as SimulatorHandPoseChangeRequestEvent, p as HAND_JOINT_NAMES, r as SetSimulatorHandPhysicsEvent, s as SetSimulatorEnvironmentEvent, t as SIMULATOR_HAND_POSE_NAMES, u as Keycodes } from "./internal/HandPoses.js";
import { a as UIOverlay, i as UIText, o as UIScrollView, t as UITextInput } from "./internal/UITextInput.js";
import { a as disposeRenderableResources, i as disposeObjectTree, n as disposeMeshResources, r as disposeObjectChildren, t as disposeMaterial } from "./internal/ThreeDisposal.js";
import * as THREE from "three";
import { FullScreenQuad, Pass } from "three/addons/postprocessing/Pass.js";
import { XREstimatedLight } from "three/addons/webxr/XREstimatedLight.js";
//#region src/agent/Context.ts
/**
* Builds the context to be sent to the AI for reasoning.
*/
var Context$1 = class {
	constructor(instructions = "You are a helpful assistant.") {
		this.instructions = instructions;
	}
	get instruction() {
		return this.instructions;
	}
	/**
	* Constructs a formatted prompt from memory and available tools.
	* @param memory - The agent's memory.
	* @param tools - The list of available tools.
	* @returns A string representing the full context for the AI.
	*/
	build(memory, tools) {
		const formattedHistory = memory.getShortTerm().map((entry) => this.formatEntry(entry)).join("\n");
		const toolDescriptions = tools.map((tool) => `- ${tool.name}: ${tool.description}`).join("\n");
		return `${this.instructions} You have access to the following tools: ${toolDescriptions}
        Current Conversation history: ${formattedHistory}. You should reply to the user or call a tool as needed.`;
	}
	formatEntry(entry) {
		switch (entry.role) {
			case "user": return `User: ${entry.content}`;
			case "ai": return `AI: ${entry.content}`;
			case "tool": return `Tool Output: ${entry.content}`;
		}
	}
};
//#endregion
//#region src/agent/Memory.ts
/**
* Manages the agent's memory, including short-term, long-term, and working
* memory.
*/
var Memory = class {
	constructor() {
		this.shortTermMemory = [];
	}
	/**
	* Adds a new entry to the short-term memory.
	* @param entry - The memory entry to add.
	*/
	addShortTerm(entry) {
		this.shortTermMemory.push(entry);
	}
	/**
	* Retrieves the short-term memory.
	* @returns An array of all short-term memory entries.
	*/
	getShortTerm() {
		return [...this.shortTermMemory];
	}
	/**
	* Clears all memory components.
	*/
	clear() {
		this.shortTermMemory.length = 0;
	}
};
//#endregion
//#region src/agent/Agent.ts
/**
* An agent that can use an AI to reason and execute tools.
*/
var Agent = class {
	static {
		this.dependencies = {};
	}
	constructor(ai, tools = [], instruction = "", callbacks) {
		this.isSessionActive = false;
		this.ai = ai;
		this.tools = tools;
		this.memory = new Memory();
		this.contextBuilder = new Context$1(instruction);
		this.lifecycleCallbacks = callbacks;
	}
	/**
	* Starts the agent's reasoning loop with an initial prompt.
	* @param prompt - The initial prompt from the user.
	* @returns The final text response from the agent.
	*/
	async start(prompt) {
		this.memory.addShortTerm({
			role: "user",
			content: prompt
		});
		if (!this.ai.isAvailable()) await this.ai.init({ aiOptions: this.ai.options });
		return this.run();
	}
	/**
	* The main reasoning and action loop of the agent for non-live mode.
	* It repeatedly builds context, queries the AI, and executes tools
	* until a final text response is generated.
	*/
	async run() {
		while (true) {
			const context = this.contextBuilder.build(this.memory, this.tools);
			const response = await this.ai.model.query({
				type: "text",
				text: context
			});
			this.memory.addShortTerm({
				role: "ai",
				content: JSON.stringify(response)
			});
			if (response?.toolCall) {
				console.log(`Executing tool: ${response.toolCall.name}`);
				const tool = this.findTool(response.toolCall.name);
				if (tool) {
					const result = await tool.execute(response.toolCall.args);
					this.memory.addShortTerm({
						role: "tool",
						content: JSON.stringify(result)
					});
				} else {
					const errorMsg = `Error: Tool "${response.toolCall.name}" not found.`;
					console.error(errorMsg);
					this.memory.addShortTerm({
						role: "tool",
						content: errorMsg
					});
				}
			} else if (response?.text) {
				console.log(`Final Response: ${response.text}`);
				return response.text;
			} else {
				const finalResponse = "The AI did not provide a valid response.";
				console.error(finalResponse);
				return finalResponse;
			}
		}
	}
	findTool(name) {
		return this.tools.find((tool) => tool.name === name);
	}
	/**
	* Get the current session state.
	* @returns Object containing session information
	*/
	getSessionState() {
		return {
			isActive: this.isSessionActive,
			toolCount: this.tools.length,
			memorySize: this.memory.getShortTerm?.()?.length || 0
		};
	}
};
//#endregion
//#region src/agent/Tool.ts
/**
* A base class for tools that the agent can use.
*/
var Tool = class {
	/**
	* @param options - The options for the tool.
	*/
	constructor(options) {
		this.name = options.name;
		this.description = options.description;
		this.parameters = options.parameters || {};
		this.onTriggered = options.onTriggered;
		this.behavior = options.behavior;
	}
	/**
	* Executes the tool's action with standardized error handling.
	* @param args - The arguments for the tool.
	* @returns A promise that resolves with a ToolResult containing success/error information.
	*/
	async execute(args) {
		try {
			if (this.onTriggered) return {
				success: true,
				data: await Promise.resolve(this.onTriggered(args)),
				metadata: {
					executedAt: Date.now(),
					toolName: this.name
				}
			};
			throw new Error("The execute method must be implemented by a subclass or onTriggered must be provided.");
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
				metadata: {
					executedAt: Date.now(),
					toolName: this.name
				}
			};
		}
	}
	/**
	* Returns a JSON representation of the tool.
	* @returns A valid FunctionDeclaration object.
	*/
	toJSON() {
		const result = { name: this.name };
		if (this.description) result.description = this.description;
		if (this.parameters) result.parameters = this.parameters;
		if (this.behavior) result.behavior = this.behavior;
		return result;
	}
	/**
	* Returns the function tool shape for the non-live Interactions API (a
	* `tools` entry on a query). `behavior` is a Live API concept and has no
	* Interactions equivalent.
	* @returns A valid Interactions function tool.
	*/
	toInteractions() {
		const result = {
			type: "function",
			name: this.name
		};
		if (this.description) result.description = this.description;
		if (this.parameters) result.parameters = this.parameters;
		return result;
	}
};
//#endregion
//#region src/agent/tools/GenerateSkyboxTool.ts
/**
* A tool that generates a 360-degree equirectangular skybox image
* based on a given prompt using an AI service.
*/
var GenerateSkyboxTool = class extends Tool {
	constructor(ai, scene) {
		super({
			name: "generateSkybox",
			description: "Generate a 360 equirectangular skybox image for the given prompt.",
			parameters: {
				type: "OBJECT",
				properties: { prompt: {
					type: "STRING",
					description: "A description of the skybox to generate, e.g. \"a sunny beach with palm trees\""
				} },
				required: ["prompt"]
			}
		});
		this.ai = ai;
		this.scene = scene;
	}
	/**
	* Executes the tool's action.
	* @param args - The prompt to use to generate the skybox.
	* @returns A promise that resolves with a ToolResult containing success/error information.
	*/
	async execute(args) {
		try {
			const image = await this.ai.generate("Generate a 360 equirectangular skybox image for the prompt of:" + args.prompt, "image", "Generate a 360 equirectangular skybox image for the prompt");
			if (image) {
				console.log("Applying texture...");
				this.scene.background = new THREE.TextureLoader().load(image);
				this.scene.background.mapping = THREE.EquirectangularReflectionMapping;
				return {
					success: true,
					data: "Skybox generated successfully.",
					metadata: {
						prompt: args.prompt,
						timestamp: Date.now()
					}
				};
			} else return {
				success: false,
				error: "Failed to generate skybox image",
				metadata: {
					prompt: args.prompt,
					timestamp: Date.now()
				}
			};
		} catch (e) {
			console.error("error:", e);
			return {
				success: false,
				error: e instanceof Error ? e.message : "Unknown error while creating skybox",
				metadata: {
					prompt: args.prompt,
					timestamp: Date.now()
				}
			};
		}
	}
};
//#endregion
//#region src/agent/SkyboxAgent.ts
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
var SkyboxAgent = class extends Agent {
	constructor(ai, sound, scene, callbacks) {
		super(ai, [new GenerateSkyboxTool(ai, scene)], `You are a friendly and helpful skybox designer. The response should be short. Your only capability
         is to generate a 360-degree equirectangular skybox image based on
         a user's description. You will generate a default skybox if the user
         does not provide any description. You will use the tool 'generateSkybox'
         with the summarized description as the 'prompt' argument to create the skybox.`, callbacks);
		this.sound = sound;
		this.sessionState = {
			isActive: false,
			messageCount: 0,
			toolCallCount: 0
		};
	}
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
	async startLiveSession(callbacks) {
		const wrappedCallbacks = this.wrapCallbacks(callbacks);
		if (callbacks) this.ai.setLiveCallbacks(wrappedCallbacks);
		const functionDeclarations = this.tools.map((tool) => tool.toJSON());
		const systemInstruction = { parts: [{ text: this.contextBuilder.instruction }] };
		await this.ai.startLiveSession({
			tools: [{ functionDeclarations }],
			systemInstruction
		});
		this.sessionState.isActive = true;
		this.sessionState.startTime = Date.now();
		this.isSessionActive = true;
		await this.lifecycleCallbacks?.onSessionStart?.();
	}
	/**
	* Stops the live AI session.
	*
	* @remarks
	* Audio must be disabled separately using `xb.core.sound.disableAudio()` after stopping the session.
	*/
	async stopLiveSession() {
		await this.ai.stopLiveSession();
		this.sessionState.isActive = false;
		this.sessionState.endTime = Date.now();
		this.isSessionActive = false;
		await this.lifecycleCallbacks?.onSessionEnd?.();
	}
	/**
	* Wraps user callbacks to track session state and trigger lifecycle events.
	* @param callbacks - The callbacks to wrap.
	* @returns The wrapped callbacks.
	*/
	wrapCallbacks(callbacks) {
		return {
			onopen: () => {
				callbacks?.onopen?.();
			},
			onmessage: (message) => {
				this.sessionState.messageCount++;
				callbacks?.onmessage?.(message);
			},
			onerror: (error) => {
				this.sessionState.lastError = error.message;
				this.lifecycleCallbacks?.onError?.(new Error(error.message));
				callbacks?.onerror?.(error);
			},
			onclose: (event) => {
				this.sessionState.isActive = false;
				this.sessionState.endTime = Date.now();
				this.isSessionActive = false;
				callbacks?.onclose?.(event);
			}
		};
	}
	/**
	* Sends tool execution results back to the AI.
	*
	* @param response - The tool response containing function results
	*/
	async sendToolResponse(response) {
		if (!this.validateToolResponse(response)) {
			console.error("Invalid tool response format:", response);
			return;
		}
		const responses = Array.isArray(response.functionResponses) ? response.functionResponses : [response.functionResponses];
		this.sessionState.toolCallCount += responses.length;
		console.log("Sending tool response:", response);
		this.ai.sendToolResponse(response);
	}
	/**
	* Validates that a tool response has the correct format.
	* @param response - The tool response to validate.
	* @returns True if the response is valid, false otherwise.
	*/
	validateToolResponse(response) {
		if (!response.functionResponses) return false;
		return (Array.isArray(response.functionResponses) ? response.functionResponses : [response.functionResponses]).every((fr) => fr.id && fr.name && fr.response !== void 0);
	}
	/**
	* Helper to create a properly formatted tool response from a ToolResult.
	*
	* @param id - The function call ID
	* @param name - The function name
	* @param result - The ToolResult from tool execution
	* @returns A properly formatted FunctionResponse
	*/
	static createToolResponse(id, name, result) {
		return {
			id,
			name,
			response: result.success ? { result: result.data } : { error: result.error }
		};
	}
	/**
	* Gets the current live session state.
	*
	* @returns Read-only session state information
	*/
	getLiveSessionState() {
		return { ...this.sessionState };
	}
	/**
	* Gets the duration of the session in milliseconds.
	*
	* @returns Duration in ms, or null if session hasn't started
	*/
	getSessionDuration() {
		if (!this.sessionState.startTime) return null;
		return (this.sessionState.endTime || Date.now()) - this.sessionState.startTime;
	}
};
//#endregion
//#region src/agent/tools/GetWeatherTool.ts
/**
* A tool that gets the current weather for a specific location.
*/
var GetWeatherTool = class extends Tool {
	constructor() {
		super({
			name: "get_weather",
			description: "Gets the current weather for a specific location.",
			parameters: {
				type: "OBJECT",
				properties: {
					location: {
						type: "STRING",
						description: "The city and state, e.g. San Francisco, CA"
					},
					unit: {
						type: "STRING",
						enum: ["celsius", "fahrenheit"]
					}
				},
				required: ["location"]
			}
		});
	}
	/**
	* Executes the tool's action.
	* @param args - The arguments for the tool.
	* @returns A promise that resolves with a ToolResult containing weather information.
	*/
	async execute(args) {
		if (!args.latitude || !args.longitude) {
			args.latitude = 37.7749;
			args.longitude = -122.4194;
		}
		const url = `https://api.open-meteo.com/v1/forecast?latitude=${args.latitude}&longitude=${args.longitude}&current=weather_code,temperature_2m&temperature_unit=fahrenheit`;
		try {
			const response = await fetch(url);
			const data = await response.json();
			if (response.ok) return {
				success: true,
				data: {
					temperature: data.current.temperature_2m,
					weathercode: data.current.weather_code
				},
				metadata: {
					latitude: args.latitude,
					longitude: args.longitude,
					timestamp: Date.now()
				}
			};
			else return {
				success: false,
				error: "Could not retrieve weather for the specified location.",
				metadata: {
					latitude: args.latitude,
					longitude: args.longitude
				}
			};
		} catch (error) {
			console.error("Error fetching weather:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "There was an error fetching the weather.",
				metadata: {
					latitude: args.latitude,
					longitude: args.longitude
				}
			};
		}
	}
};
//#endregion
//#region src/core/components/ScreenshotSynthesizer.ts
const DEFAULT_CANVAS_WIDTH = 640;
function flipBufferVertically(buffer, width, height) {
	const bytesPerRow = width * 4;
	const tempRow = new Uint8Array(bytesPerRow);
	for (let y = 0; y < height / 2; y++) {
		const topRowY = y;
		const bottomRowY = height - 1 - y;
		const topRowOffset = topRowY * bytesPerRow;
		const bottomRowOffset = bottomRowY * bytesPerRow;
		tempRow.set(buffer.subarray(topRowOffset, topRowOffset + bytesPerRow));
		buffer.set(buffer.subarray(bottomRowOffset, bottomRowOffset + bytesPerRow), topRowOffset);
		buffer.set(tempRow, bottomRowOffset);
	}
}
var PendingScreenshotRequest = class {
	constructor(resolve, reject, overlayOnCamera) {
		this.resolve = resolve;
		this.reject = reject;
		this.overlayOnCamera = overlayOnCamera;
	}
};
var ScreenshotSynthesizer = class {
	constructor() {
		this.pendingScreenshotRequests = [];
		this.virtualBuffer = /* @__PURE__ */ new Uint8Array();
		this.virtualRealBuffer = /* @__PURE__ */ new Uint8Array();
		this.renderTargetWidth = DEFAULT_CANVAS_WIDTH;
		this.virtualCaptureInFlight = false;
		this.virtualRealCaptureInFlight = false;
	}
	onAfterRender(renderer, renderSceneFn, deviceCamera) {
		if (this.pendingScreenshotRequests.length == 0) return;
		if (this.pendingScreenshotRequests.every((request) => !request.overlayOnCamera) && !this.virtualCaptureInFlight) {
			this.virtualCaptureInFlight = true;
			this.createVirtualImageDataURL(renderer, renderSceneFn).then((virtualImageDataUrl) => {
				this.resolveVirtualOnlyRequests(virtualImageDataUrl);
			}).catch((error) => {
				this.rejectVirtualOnlyRequests(error);
			}).finally(() => {
				this.virtualCaptureInFlight = false;
			});
		}
		const haveVirtualAndRealReqeusts = this.pendingScreenshotRequests.some((request) => request.overlayOnCamera);
		if (haveVirtualAndRealReqeusts && deviceCamera && !this.virtualRealCaptureInFlight) {
			this.virtualRealCaptureInFlight = true;
			this.createVirtualRealImageDataURL(renderer, renderSceneFn, deviceCamera).then((virtualRealImageDataUrl) => {
				if (virtualRealImageDataUrl) this.resolveVirtualRealRequests(virtualRealImageDataUrl);
			}).catch((error) => {
				this.rejectVirtualRealRequests(error);
			}).finally(() => {
				this.virtualRealCaptureInFlight = false;
			});
		} else if (haveVirtualAndRealReqeusts && !deviceCamera) this.rejectVirtualRealRequests(/* @__PURE__ */ new Error("No device camera provided"));
	}
	async createVirtualImageDataURL(renderer, renderSceneFn) {
		const mainRenderTarget = renderer.getRenderTarget();
		const isRenderingStereo = renderer.xr.isPresenting && renderer.xr.getCamera().cameras.length == 2;
		const mainRenderTargetSize = new THREE.Vector2();
		if (mainRenderTarget) mainRenderTargetSize.set(mainRenderTarget.width, mainRenderTarget.height);
		else renderer.getSize(mainRenderTargetSize);
		const mainRenderTargetSingleViewWidth = isRenderingStereo ? mainRenderTargetSize.x / 2 : mainRenderTargetSize.x;
		const scaledHeight = Math.round(mainRenderTargetSize.y * (this.renderTargetWidth / mainRenderTargetSingleViewWidth));
		if (!this.virtualRenderTarget || this.virtualRenderTarget.width != this.renderTargetWidth) {
			this.virtualRenderTarget?.dispose();
			this.virtualRenderTarget = new THREE.WebGLRenderTarget(this.renderTargetWidth, scaledHeight, { colorSpace: THREE.SRGBColorSpace });
		}
		const xrIsPresenting = renderer.xr.isPresenting;
		renderer.xr.isPresenting = false;
		const virtualRenderTarget = this.virtualRenderTarget;
		renderer.setRenderTarget(virtualRenderTarget);
		renderer.clearColor();
		renderer.clearDepth();
		renderSceneFn();
		renderer.setRenderTarget(mainRenderTarget);
		renderer.xr.isPresenting = xrIsPresenting;
		const expectedBufferLength = virtualRenderTarget.width * virtualRenderTarget.height * 4;
		if (this.virtualBuffer.length != expectedBufferLength) this.virtualBuffer = new Uint8Array(expectedBufferLength);
		const buffer = this.virtualBuffer;
		await renderer.readRenderTargetPixelsAsync(virtualRenderTarget, 0, 0, virtualRenderTarget.width, virtualRenderTarget.height, buffer);
		flipBufferVertically(buffer, virtualRenderTarget.width, virtualRenderTarget.height);
		const canvas = this.virtualCanvas || (this.virtualCanvas = document.createElement("canvas"));
		canvas.width = virtualRenderTarget.width;
		canvas.height = virtualRenderTarget.height;
		const context = canvas.getContext("2d");
		if (!context) throw new Error("Failed to get 2D context");
		const imageData = new ImageData(new Uint8ClampedArray(buffer), virtualRenderTarget.width, virtualRenderTarget.height);
		context.putImageData(imageData, 0, 0);
		return canvas.toDataURL();
	}
	resolveVirtualOnlyRequests(virtualImageDataUrl) {
		let remainingRequests = 0;
		for (let i = 0; i < this.pendingScreenshotRequests.length; i++) {
			const request = this.pendingScreenshotRequests[i];
			if (!request.overlayOnCamera) request.resolve(virtualImageDataUrl);
			else this.pendingScreenshotRequests[remainingRequests++] = request;
		}
		this.pendingScreenshotRequests.length = remainingRequests;
	}
	rejectVirtualOnlyRequests(error) {
		let remainingRequests = 0;
		for (let i = 0; i < this.pendingScreenshotRequests.length; i++) {
			const request = this.pendingScreenshotRequests[i];
			if (!request.overlayOnCamera) request.reject(error);
			else this.pendingScreenshotRequests[remainingRequests++] = request;
		}
		this.pendingScreenshotRequests.length = remainingRequests;
	}
	async createVirtualRealImageDataURL(renderer, renderSceneFn, deviceCamera) {
		if (!deviceCamera.loaded) {
			console.debug("Waiting for device camera to be loaded");
			return null;
		}
		const mainRenderTarget = renderer.getRenderTarget();
		const isRenderingStereo = renderer.xr.isPresenting && renderer.xr.getCamera().cameras.length == 2;
		const mainRenderTargetSize = new THREE.Vector2();
		if (mainRenderTarget) mainRenderTargetSize.set(mainRenderTarget.width, mainRenderTarget.height);
		else renderer.getSize(mainRenderTargetSize);
		const mainRenderTargetSingleViewWidth = isRenderingStereo ? mainRenderTargetSize.x / 2 : mainRenderTargetSize.x;
		const scaledHeight = Math.round(mainRenderTargetSize.y * (this.renderTargetWidth / mainRenderTargetSingleViewWidth));
		if (!this.virtualRealRenderTarget || this.virtualRealRenderTarget.height != scaledHeight) {
			this.virtualRealRenderTarget?.dispose();
			this.virtualRealRenderTarget = new THREE.WebGLRenderTarget(this.renderTargetWidth, scaledHeight, { colorSpace: THREE.SRGBColorSpace });
		}
		const renderTarget = this.virtualRealRenderTarget;
		renderer.setRenderTarget(renderTarget);
		const xrIsPresenting = renderer.xr.isPresenting;
		renderer.xr.isPresenting = false;
		const quad = this.getFullScreenQuad();
		quad.material.map = deviceCamera.texture;
		quad.render(renderer);
		renderSceneFn();
		renderer.xr.isPresenting = xrIsPresenting;
		renderer.setRenderTarget(mainRenderTarget);
		if (this.virtualRealBuffer.length != renderTarget.width * renderTarget.height * 4) this.virtualRealBuffer = new Uint8Array(renderTarget.width * renderTarget.height * 4);
		const buffer = this.virtualRealBuffer;
		await renderer.readRenderTargetPixelsAsync(renderTarget, 0, 0, renderTarget.width, renderTarget.height, buffer);
		flipBufferVertically(buffer, renderTarget.width, renderTarget.height);
		const canvas = this.virtualRealCanvas || (this.virtualRealCanvas = document.createElement("canvas"));
		canvas.width = renderTarget.width;
		canvas.height = renderTarget.height;
		const context = canvas.getContext("2d");
		if (!context) throw new Error("Failed to get 2D context");
		const imageData = new ImageData(new Uint8ClampedArray(buffer), renderTarget.width, renderTarget.height);
		context.putImageData(imageData, 0, 0);
		return canvas.toDataURL();
	}
	resolveVirtualRealRequests(virtualRealImageDataUrl) {
		let remainingRequests = 0;
		for (let i = 0; i < this.pendingScreenshotRequests.length; i++) {
			const request = this.pendingScreenshotRequests[i];
			if (request.overlayOnCamera) request.resolve(virtualRealImageDataUrl);
			else this.pendingScreenshotRequests[remainingRequests++] = request;
		}
		this.pendingScreenshotRequests.length = remainingRequests;
	}
	rejectVirtualRealRequests(error) {
		let remainingRequests = 0;
		for (let i = 0; i < this.pendingScreenshotRequests.length; i++) {
			const request = this.pendingScreenshotRequests[i];
			if (request.overlayOnCamera) request.reject(error);
			else this.pendingScreenshotRequests[remainingRequests++] = request;
		}
		this.pendingScreenshotRequests.length = remainingRequests;
	}
	getFullScreenQuad() {
		if (!this.fullScreenQuad) this.fullScreenQuad = new FullScreenQuad(new THREE.MeshBasicMaterial({ transparent: true }));
		return this.fullScreenQuad;
	}
	/**
	* Requests a screenshot from the scene as a DataURL.
	* @param overlayOnCamera - If true, overlays the image on a camera image
	*     without any projection or aspect ratio correction.
	* @returns Promise which returns the screenshot as a data uri.
	*/
	async getScreenshot(overlayOnCamera = false) {
		return new Promise((resolve, reject) => {
			this.pendingScreenshotRequests.push(new PendingScreenshotRequest(resolve, reject, overlayOnCamera));
		});
	}
};
//#endregion
//#region src/core/components/SimulationTimer.ts
/**
* Tracks elapsed simulation time independently from browser wall time.
*/
var SimulationTimer = class {
	constructor() {
		this.elapsedMs = 0;
	}
	getElapsedMs() {
		return this.elapsedMs;
	}
	update(frameTimeMs, timescale) {
		if (this.previousFrameTimeMs !== void 0) this.elapsedMs += Math.max(0, frameTimeMs - this.previousFrameTimeMs) * timescale;
		this.previousFrameTimeMs = frameTimeMs;
	}
	step(dtMs, timescale) {
		this.elapsedMs += dtMs * timescale;
		this.previousFrameTimeMs = void 0;
	}
	pause() {
		this.previousFrameTimeMs = void 0;
	}
};
//#endregion
//#region src/context/shared/ContextNumberUtils.ts
const CONTEXT_NUMBER_SCALE = 1e4;
function roundContextNumber(value) {
	const rounded = Math.round(value * CONTEXT_NUMBER_SCALE) / CONTEXT_NUMBER_SCALE;
	return Object.is(rounded, -0) ? 0 : rounded;
}
//#endregion
//#region src/core/components/XRSystems.ts
/**
* A node to hold all XR Blocks Systems.
*/
var XRSystems = class extends THREE.Group {
	constructor(..._args) {
		super(..._args);
		this.type = "XRSystems";
		this.name = "XR Blocks Systems";
	}
};
//#endregion
//#region src/context/shared/SemanticObjectUtils.ts
const boundsBox = new THREE.Box3();
const boundsCorner = new THREE.Vector3();
function isSemanticInternalObject(object) {
	if (object.userData.xrblocksPrivateSelf === true || isInternalRoot(object)) return true;
	let parent = object.parent;
	while (parent) {
		if (isInternalRoot(parent)) return true;
		parent = parent.parent;
	}
	return false;
}
function isObjectVisible(object) {
	let current = object;
	while (current) {
		if (!current.visible) return false;
		current = current.parent;
	}
	return true;
}
function hasRenderableDescendant(object) {
	const stack = [...object.children];
	while (stack.length > 0) {
		const child = stack.pop();
		if (child.userData.xrblocksPrivateSelf === true) {
			stack.push(...child.children);
			continue;
		}
		if (isSemanticInternalObject(child)) continue;
		if (child instanceof THREE.Mesh) return true;
		stack.push(...child.children);
	}
	return false;
}
function isDescendantOf$1(object, ancestor) {
	let current = object;
	while (current) {
		if (current === ancestor) return true;
		current = current.parent;
	}
	return false;
}
function getObjectBounds(object, target) {
	const clipped = getUIPresentationBounds(object, target ?? new THREE.Box3());
	if (clipped !== void 0) return clipped;
	const presentation = getUIPresentationObject(object);
	if (presentation) {
		const presentationBounds = getThreeObjectBounds(presentation, target);
		if (presentationBounds) return presentationBounds;
	}
	const uiBounds = getUIObjectBounds(object, target);
	if (uiBounds) return uiBounds;
	return getThreeObjectBounds(object, target);
}
function getThreeObjectBounds(object, target) {
	try {
		boundsBox.setFromObject(object);
	} catch (_error) {
		return null;
	}
	if (boundsBox.isEmpty()) return null;
	return target ? target.copy(boundsBox) : boundsBox.clone();
}
function isInternalRoot(object) {
	return object.userData.xrblocksPrivate === true || object instanceof XRSystems || object instanceof DepthMesh || object.constructor.isDepthMesh === true;
}
function getUIObjectBounds(object, target) {
	const uiObject = object;
	const size = (object instanceof UICard ? getResolvedUICardSize(object) : void 0) ?? uiObject.size;
	if (uiObject.isUI !== true || typeof size?.width !== "number" || typeof size.height !== "number") return null;
	object.updateMatrixWorld(true);
	const halfWidth = size.width / 2;
	const halfHeight = size.height / 2;
	boundsBox.makeEmpty();
	for (const x of [-halfWidth, halfWidth]) for (const y of [-halfHeight, halfHeight]) {
		boundsCorner.set(x, y, 0).applyMatrix4(object.matrixWorld);
		boundsBox.expandByPoint(boundsCorner);
	}
	return target ? target.copy(boundsBox) : boundsBox.clone();
}
//#endregion
//#region src/context/scene/semantic-tree/SemanticTreeBuilder.ts
const tempPosition = new THREE.Vector3();
const tempBoundsCenter = new THREE.Vector3();
const tempBoundsSize = new THREE.Vector3();
const tempBoundsBox$2 = new THREE.Box3();
let snapshotCounter = 0;
function buildSemanticTree({ scene, registry, capturedAt, interaction }) {
	scene.updateMatrixWorld(true);
	const nodes = {};
	const rootIds = [];
	const nodeObjects = /* @__PURE__ */ new Map();
	const objectNodeIds = /* @__PURE__ */ new WeakMap();
	const roundedCapturedAt = roundContextNumber(capturedAt);
	const snapshotId = `ctx_snapshot_${Math.round(roundedCapturedAt)}_${snapshotCounter++}`;
	const visit = (object, semanticParentId) => {
		if (object.userData.xrblocksPrivateSelf === true) {
			for (const child of object.children) visit(child, semanticParentId);
			return;
		}
		if (shouldPruneObject(object)) return;
		const semantic = describeSemanticObject(object, interaction);
		let nextSemanticParentId = semanticParentId;
		if (semantic) {
			const id = registry.getNodeId(object);
			const node = createSemanticNode(object, id, semantic, semanticParentId);
			nodes[id] = node;
			nodeObjects.set(id, object);
			objectNodeIds.set(object, id);
			if (semanticParentId) nodes[semanticParentId]?.children.push(id);
			else rootIds.push(id);
			nextSemanticParentId = id;
		}
		for (const child of object.children) visit(child, nextSemanticParentId);
	};
	for (const child of scene.children) visit(child, void 0);
	return {
		tree: {
			snapshotId,
			capturedAt: roundedCapturedAt,
			rootIds,
			nodes
		},
		nodeObjects,
		objectNodeIds
	};
}
function shouldPruneObject(object) {
	if (object.userData.semantic?.hidden) return true;
	return isSemanticInternalObject(object);
}
function describeSemanticObject(object, interaction) {
	const override = object.userData.semantic;
	const hasExplicitIdentity = hasExplicitSemanticIdentity(object);
	const role = resolveRole(object);
	if (!role) return null;
	if (!hasExplicitIdentity) {
		if (object instanceof THREE.Mesh && hasSemanticAncestor(object) || isLayoutOnlyContainer(object, role)) return null;
	}
	const disabled = override?.disabled ?? inferDisabled(object);
	return {
		role,
		name: override?.name ?? inferName(object),
		source: override?.source ?? inferSource(object),
		text: override?.text ?? inferText(object),
		traits: mergeTraits(inferTraits(object, disabled), override?.traits),
		disabled,
		selected: interaction?.isSelectingAt(object),
		hovered: interaction?.isHovered(object),
		pointerEvents: object.xb?.pointerEvents ?? "auto",
		interactionEnabled: object.xb?.interactionEnabled ?? true,
		...inferValue(object),
		...inferEditingState(object)
	};
}
function hasSemanticAncestor(object) {
	let parent = object.parent;
	while (parent) {
		const hasExplicitIdentity = hasExplicitSemanticIdentity(parent);
		const role = resolveRole(parent);
		if (role && (hasExplicitIdentity || !isLayoutOnlyContainer(parent, role))) return true;
		parent = parent.parent;
	}
	return false;
}
function hasExplicitSemanticIdentity(object) {
	const semantic = object.userData.semantic;
	return Boolean(semantic?.role || semantic?.name);
}
function resolveRole(object) {
	const semantic = object.userData.semantic;
	if (semantic?.role) return semantic.role;
	const inferredRole = inferRole(object);
	if (inferredRole) return inferredRole;
	return semantic?.name ? inferExplicitRole(object) : "";
}
function inferRole(object) {
	if (isUIElement(object)) {
		const kind = getUIElementKind(object);
		if (kind === "button") return "button";
		if (kind === "slider") return "slider";
		if (kind === "input") return "textbox";
		if (kind === "scroll") return "region";
		if (kind === "text") return "text";
		if (kind === "image" || kind === "icon") return "image";
		return "group";
	}
	if (object instanceof THREE.Mesh) return "object";
	if (object instanceof THREE.Group && hasRenderableDescendant(object)) return object.name ? "group" : "";
	return "";
}
function inferExplicitRole(object) {
	return object.children.length > 0 ? "group" : "object";
}
function inferName(object) {
	const semanticObject = object;
	return semanticObject.ariaLabel ?? semanticObject.label ?? semanticObject.text ?? semanticObject.icon ?? object.name ?? `${object.type}_${object.id}`;
}
function inferText(object) {
	return object.text;
}
function inferSource(object) {
	if (isUIElement(object)) return "xrblocks";
	return "three";
}
function inferTraits(object, disabled) {
	const traits = /* @__PURE__ */ new Set();
	if (object.xb?.manipulation) traits.add("manipulable");
	if (isUIElement(object) && (getUIElementKind(object) === "button" || getUIElementKind(object) === "slider" || getUIElementKind(object) === "input") && object.xb?.interactionEnabled !== false && !disabled) traits.add("selectable");
	if (getSemanticControl(object)?.scroll) traits.add("scrollable");
	if (isUIElement(object) && getUIElementKind(object) === "input" && !object.readOnly && !disabled) traits.add("editable");
	return traits.size ? [...traits] : void 0;
}
function mergeTraits(inferred, explicit) {
	if (!inferred?.length && !explicit?.length) return void 0;
	return [.../* @__PURE__ */ new Set([...inferred ?? [], ...explicit ?? []])];
}
function inferValue(object) {
	if (!isUIElement(object) || getUIElementKind(object) !== "slider") return {};
	const slider = object;
	return {
		value: slider.value,
		min: slider.min,
		max: slider.max
	};
}
function inferDisabled(object) {
	return getSemanticControl(object)?.isDisabled() ?? object.disabled;
}
function inferEditingState(object) {
	const description = {};
	if (isUIElement(object) && getUIElementKind(object) === "input") {
		const input = object;
		description.focused = input.focused;
		description.readOnly = input.readOnly;
		description.multiline = input.multiline;
	}
	const scroll = getSemanticControl(object)?.scroll;
	if (scroll) {
		description.scroll = {
			offset: roundContextNumber(scroll.getOffset()),
			viewportHeight: roundContextNumber(scroll.getViewportHeight())
		};
		if (object instanceof UIScrollView) {
			description.scroll.maximum = roundContextNumber(object.maxScrollTop);
			description.scroll.contentHeight = roundContextNumber(object.scrollHeight);
		}
	}
	return description;
}
function isLayoutOnlyContainer(object, role) {
	const className = object.constructor.name;
	if (role !== "group") return false;
	return !object.name && (className === "Object3D" || className === "Group");
}
function createSemanticNode(object, id, semantic, parentId) {
	object.getWorldPosition(tempPosition);
	const node = {
		id,
		role: semantic.role,
		name: semantic.name,
		visible: isEffectivelyVisible(object),
		pointerEvents: semantic.pointerEvents,
		interactionEnabled: semantic.interactionEnabled,
		position: [
			roundContextNumber(tempPosition.x),
			roundContextNumber(tempPosition.y),
			roundContextNumber(tempPosition.z)
		],
		children: [],
		objectId: object.id,
		source: semantic.source,
		type: object.constructor.name || object.type
	};
	if (parentId) node.parentId = parentId;
	if (semantic.text) node.text = semantic.text;
	if (semantic.traits?.length) node.traits = semantic.traits;
	if (semantic.disabled !== void 0) node.disabled = semantic.disabled;
	if (semantic.selected !== void 0) node.selected = semantic.selected;
	if (semantic.hovered !== void 0) node.hovered = semantic.hovered;
	if (semantic.focused !== void 0) node.focused = semantic.focused;
	if (semantic.readOnly !== void 0) node.readOnly = semantic.readOnly;
	if (semantic.multiline !== void 0) node.multiline = semantic.multiline;
	if (semantic.scroll !== void 0) node.scroll = semantic.scroll;
	if (semantic.value !== void 0) node.value = semantic.value;
	if (semantic.min !== void 0) node.min = semantic.min;
	if (semantic.max !== void 0) node.max = semantic.max;
	const bounds = getSemanticBounds(object);
	if (bounds) node.bounds = bounds;
	return node;
}
function isEffectivelyVisible(object) {
	let current = object;
	while (current) {
		if (!current.visible) return false;
		current = current.parent;
	}
	return true;
}
function getSemanticBounds(object) {
	const bounds = getObjectBounds(object, tempBoundsBox$2);
	if (!bounds) return;
	const center = bounds.getCenter(tempBoundsCenter);
	const size = bounds.getSize(tempBoundsSize);
	return {
		center: [
			roundContextNumber(center.x),
			roundContextNumber(center.y),
			roundContextNumber(center.z)
		],
		size: [
			roundContextNumber(size.x),
			roundContextNumber(size.y),
			roundContextNumber(size.z)
		]
	};
}
//#endregion
//#region src/context/shared/SemanticIdRegistry.ts
const LABEL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function formatLabel(index) {
	let value = index;
	let label = "";
	do {
		label = LABEL_ALPHABET[value % 26] + label;
		value = Math.floor(value / 26) - 1;
	} while (value >= 0);
	return label;
}
var SemanticIdRegistry = class {
	constructor() {
		this.nextNodeIndex = 1;
		this.nextLabelIndex = 0;
		this.nodeIds = /* @__PURE__ */ new WeakMap();
		this.labels = /* @__PURE__ */ new WeakMap();
	}
	getNodeId(object) {
		let id = this.nodeIds.get(object);
		if (!id) {
			id = `ctx_${this.nextNodeIndex++}`;
			this.nodeIds.set(object, id);
		}
		return id;
	}
	getMarkLabel(object) {
		let label = this.labels.get(object);
		if (!label) {
			label = formatLabel(this.nextLabelIndex++);
			this.labels.set(object, label);
		}
		return label;
	}
};
//#endregion
//#region src/context/scene/som/SetOfMarkBuilder.ts
const tempCenter$1 = new THREE.Vector3();
const tempBoundsBox$1 = new THREE.Box3();
const tempProjection$1 = new THREE.Vector3();
async function createSetOfMarkContext({ tree, image, nodeObjects, registry, projectionMatrix, matrixWorldInverse }) {
	const marks = [];
	for (const node of Object.values(tree.nodes)) {
		if (!node.view?.inLineOfSight) continue;
		const object = nodeObjects.get(node.id);
		if (!object) continue;
		const screenPosition = projectObjectCenter(object, projectionMatrix, matrixWorldInverse);
		if (!screenPosition) continue;
		marks.push({
			label: registry.getMarkLabel(object),
			nodeId: node.id,
			role: node.role,
			name: node.name,
			x: screenPosition.x,
			y: screenPosition.y
		});
	}
	return {
		snapshotId: tree.snapshotId,
		capturedAt: tree.capturedAt,
		image: await renderSetOfMarkImage(image, marks),
		marks
	};
}
function projectObjectCenter(object, projectionMatrix, matrixWorldInverse) {
	const box = getObjectBounds(object, tempBoundsBox$1);
	if (box) box.getCenter(tempCenter$1);
	else object.getWorldPosition(tempCenter$1);
	const projected = tempProjection$1.copy(tempCenter$1).applyMatrix4(matrixWorldInverse).applyMatrix4(projectionMatrix);
	if (projected.x < -1 || projected.x > 1 || projected.y < -1 || projected.y > 1 || projected.z < -1 || projected.z > 1) return null;
	return {
		x: roundContextNumber((projected.x + 1) / 2),
		y: roundContextNumber((1 - projected.y) / 2)
	};
}
async function renderSetOfMarkImage(image, marks) {
	if (typeof document === "undefined" || !image || marks.length === 0) return image;
	const img = new Image();
	img.src = image;
	await new Promise((resolve, reject) => {
		img.onload = () => resolve();
		img.onerror = () => reject(/* @__PURE__ */ new Error("Failed to load SOM screenshot."));
	});
	const canvas = document.createElement("canvas");
	canvas.width = img.width;
	canvas.height = img.height;
	const ctx = canvas.getContext("2d");
	if (!ctx) return image;
	ctx.drawImage(img, 0, 0);
	for (const mark of marks) {
		const x = mark.x * canvas.width;
		const y = mark.y * canvas.height;
		ctx.beginPath();
		ctx.arc(x, y, 14, 0, Math.PI * 2);
		ctx.fillStyle = "#ff005599";
		ctx.fill();
		ctx.lineWidth = 2;
		ctx.strokeStyle = "#ffffff";
		ctx.stroke();
		ctx.fillStyle = "#ffffff";
		ctx.font = "bold 14px Arial";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText(mark.label, x, y);
	}
	return canvas.toDataURL("image/png");
}
//#endregion
//#region src/context/scene/visible-objects/VisibleObjectsBuilder.ts
const tempCenter = new THREE.Vector3();
const tempProjection = new THREE.Vector3();
const tempCameraPosition = new THREE.Vector3();
const tempDirection = new THREE.Vector3();
const tempBoundsBox = new THREE.Box3();
const raycaster = new THREE.Raycaster();
function createVisibleObjectsContext({ scene, camera, semanticTree, occlusionOpacityThreshold = 0 }) {
	scene.updateMatrixWorld(true);
	camera.updateMatrixWorld(true);
	camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
	const nodes = { ...semanticTree.tree.nodes };
	const raycastTargets = scene.children.filter((child) => child.visible && !isSemanticInternalObject(child));
	for (const nodeId of Object.keys(nodes)) {
		const node = nodes[nodeId];
		const object = semanticTree.nodeObjects.get(nodeId);
		nodes[nodeId] = {
			...node,
			view: object ? createSemanticViewData({
				camera,
				node,
				object,
				raycastTargets,
				occlusionOpacityThreshold
			}) : createNotRenderedViewData()
		};
	}
	return {
		...semanticTree.tree,
		nodes
	};
}
function createSemanticViewData({ camera, node, object, raycastTargets, occlusionOpacityThreshold }) {
	if (!node.visible || !isObjectVisible(object)) return createNotRenderedViewData();
	if (getUIPresentationBounds(object, tempBoundsBox) === null) return createNotRenderedViewData();
	const center = getObjectBounds(object, tempBoundsBox)?.getCenter(tempCenter) ?? object.getWorldPosition(tempCenter);
	const projected = projectWorldPoint(center, camera);
	if (!isProjectedInFrame(projected)) return {
		rendered: true,
		inFrame: false,
		inLineOfSight: false,
		...projectedToScreenCoordinates(projected)
	};
	return {
		rendered: true,
		inFrame: true,
		inLineOfSight: isObjectInLineOfSight({
			camera,
			object,
			targetPoint: center,
			raycastTargets,
			occlusionOpacityThreshold
		}),
		...projectedToScreenCoordinates(projected)
	};
}
function createNotRenderedViewData() {
	return {
		rendered: false,
		inFrame: false,
		inLineOfSight: false
	};
}
function projectWorldPoint(point, camera) {
	return tempProjection.copy(point).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
}
function isProjectedInFrame(projected) {
	return projected.x >= -1 && projected.x <= 1 && projected.y >= -1 && projected.y <= 1 && projected.z >= -1 && projected.z <= 1;
}
function projectedToScreenCoordinates(projected) {
	return {
		x: roundContextNumber((projected.x + 1) / 2),
		y: roundContextNumber((1 - projected.y) / 2)
	};
}
function isObjectInLineOfSight({ camera, object, targetPoint, raycastTargets, occlusionOpacityThreshold }) {
	camera.getWorldPosition(tempCameraPosition);
	tempDirection.copy(targetPoint).sub(tempCameraPosition);
	const targetDistance = tempDirection.length();
	if (targetDistance <= 0) return true;
	raycaster.camera = camera;
	raycaster.set(tempCameraPosition, tempDirection.normalize());
	raycaster.near = 0;
	raycaster.far = targetDistance;
	return raycaster.intersectObjects(raycastTargets, true).find((hit) => {
		if (hit.distance >= targetDistance - 1e-4) return false;
		if (isSemanticInternalObject(hit.object)) return false;
		if (isDescendantOf$1(hit.object, object) || isDescendantOf$1(object, hit.object)) return false;
		if (!isOpacityOccluding(hit.object, occlusionOpacityThreshold)) return false;
		return isObjectVisible(hit.object);
	}) === void 0;
}
function isOpacityOccluding(object, occlusionOpacityThreshold) {
	if (!(object instanceof THREE.Mesh)) return true;
	return getMaterialOpacity(object.material) > occlusionOpacityThreshold;
}
function getMaterialOpacity(material) {
	return Math.max(...(Array.isArray(material) ? material : [material]).map((item) => item.transparent ? item.opacity : 1));
}
//#endregion
//#region src/context/scene/SceneDetector.ts
var SceneDetector = class extends Script {
	constructor(..._args) {
		super(..._args);
		this.registry = new SemanticIdRegistry();
		this.snapshot = null;
		this.snapshotPromise = null;
		this.activeClients = /* @__PURE__ */ new Set();
		this.currentDetectionPromise = null;
		this.currentVisibleObjectsPromise = null;
		this.currentSetOfMarkPromise = null;
		this.currentContextPromise = null;
		this.currentContextRequestKey = "";
		this.lastContinuousDetectionStartedAtMs = -Infinity;
		this.disposed = false;
		this.tree = null;
		this.visibleObjects = null;
		this.setOfMark = null;
	}
	static {
		this.dependencies = {
			options: ContextOptions,
			scene: THREE.Scene,
			camera: THREE.Camera,
			screenshotSynthesizer: ScreenshotSynthesizer,
			simulationTimer: SimulationTimer,
			interaction: Interaction
		};
	}
	init({ options, scene, camera, screenshotSynthesizer, simulationTimer, interaction, deviceCamera }) {
		this.options = options;
		this.scene = scene;
		this.camera = camera;
		this.screenshotSynthesizer = screenshotSynthesizer;
		this.simulationTimer = simulationTimer;
		this.interaction = interaction;
		this.deviceCamera = deviceCamera ?? this.deviceCamera;
		this.snapshot = null;
		this.disposed = false;
	}
	setDeviceCamera(deviceCamera) {
		this.deviceCamera = deviceCamera;
	}
	resolveNodeObject(nodeId) {
		return this.snapshot?.semanticInternal?.nodeObjects.get(nodeId);
	}
	start(client) {
		if (!this.options.enabled || !this.options.scene.enabled) {
			console.warn("Cannot start scene context detection: scene context is not enabled.");
			return;
		}
		if (this.activeClients.has(client)) return;
		this.activeClients.add(client);
		if (this.activeClients.size === 1) this.runContinuousDetection();
	}
	stop(client) {
		this.activeClients.delete(client);
	}
	update() {
		if (!this.shouldRunContinuous()) return;
		this.runContinuousDetection();
	}
	shouldRunContinuous(now = performance.now()) {
		if (this.activeClients.size === 0 || this.currentDetectionPromise) return;
		const pollingIntervalMs = this.options.scene.pollingIntervalMs;
		if (pollingIntervalMs > 0 && now - this.lastContinuousDetectionStartedAtMs < pollingIntervalMs) return;
		return true;
	}
	runDetection() {
		if (this.currentDetectionPromise) return this.currentDetectionPromise;
		if (this.activeClients.size > 0) {
			this.runContinuousDetection();
			return this.currentDetectionPromise;
		}
		this.currentDetectionPromise = this.runContextDetection({ semanticTree: true }).then((result) => result.semanticTree).finally(() => {
			this.currentDetectionPromise = null;
		});
		return this.currentDetectionPromise;
	}
	runVisibleObjectsDetection() {
		if (this.currentVisibleObjectsPromise) return this.currentVisibleObjectsPromise;
		this.currentVisibleObjectsPromise = this.runContextDetection({
			semanticTree: false,
			visibleObjects: true
		}).then((result) => result.visibleObjects).finally(() => {
			this.currentVisibleObjectsPromise = null;
		});
		return this.currentVisibleObjectsPromise;
	}
	runSetOfMarkDetection() {
		if (this.currentSetOfMarkPromise) return this.currentSetOfMarkPromise;
		this.currentSetOfMarkPromise = this.runContextDetection({
			semanticTree: false,
			visibleObjects: true,
			setOfMark: true
		}, { preserveVisibleObjects: true }).then((result) => result.setOfMark).finally(() => {
			this.currentSetOfMarkPromise = null;
		});
		return this.currentSetOfMarkPromise;
	}
	runContextDetection(options = {
		semanticTree: true,
		visibleObjects: true,
		setOfMark: true
	}, snapshotOptions = {}) {
		const request = {
			semanticTree: options.semanticTree !== false,
			visibleObjects: options.visibleObjects === true,
			setOfMark: options.setOfMark === true
		};
		const requestKey = JSON.stringify({
			...request,
			preserveVisibleObjects: snapshotOptions.preserveVisibleObjects === true
		});
		if (this.currentContextPromise && this.currentContextRequestKey === requestKey) return this.currentContextPromise;
		this.beginSnapshot(snapshotOptions);
		this.currentContextRequestKey = requestKey;
		this.currentContextPromise = this.detectSceneContext(request).finally(() => {
			this.currentContextPromise = null;
			this.currentContextRequestKey = "";
		});
		return this.currentContextPromise;
	}
	runContinuousDetection() {
		if (this.currentDetectionPromise) return this.currentDetectionPromise;
		this.lastContinuousDetectionStartedAtMs = performance.now();
		this.currentDetectionPromise = this.runContextDetection({
			semanticTree: true,
			visibleObjects: this.options.scene.visibleObjects.enabled,
			setOfMark: this.options.scene.som.enabled
		}).then((result) => result.semanticTree).then((result) => {
			this.tree = result;
			return result;
		}).finally(() => {
			this.currentDetectionPromise = null;
		});
		return this.currentDetectionPromise;
	}
	async detectSceneContext(options) {
		if (this.disposed) return {};
		const result = {};
		if (options.semanticTree) {
			result.semanticTree = await this.getSemanticTree();
			if (this.disposed) return {};
			this.tree = result.semanticTree;
		}
		if (options.visibleObjects || options.setOfMark) {
			result.visibleObjects = await this.getVisibleObjectsContext();
			if (this.disposed) return {};
		}
		if (options.setOfMark) {
			result.setOfMark = await this.getSetOfMarkContext();
			if (this.disposed) return {};
		}
		return this.disposed ? {} : result;
	}
	beginSnapshot(options = {}) {
		if (options.preserveVisibleObjects && this.snapshot?.visibleObjects) {
			this.snapshot.som = void 0;
			return;
		}
		this.snapshot = {};
	}
	async getSemanticTree() {
		return (await this.getSnapshot()).semanticInternal.tree;
	}
	async getVisibleObjectsContext(camera = this.camera) {
		const snapshot = await this.getSnapshot();
		if (!snapshot.visibleObjects) snapshot.visibleObjects = createVisibleObjectsContext({
			scene: this.scene,
			camera,
			semanticTree: snapshot.semanticInternal,
			occlusionOpacityThreshold: this.options.scene.visibleObjects.occlusionOpacityThreshold
		});
		if (!this.disposed) this.visibleObjects = snapshot.visibleObjects;
		return snapshot.visibleObjects;
	}
	async getSetOfMarkContext() {
		const snapshot = await this.getSnapshot();
		if (!snapshot.som) {
			const camera = this.camera;
			camera.updateMatrixWorld(true);
			camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
			const projectionMatrix = camera.projectionMatrix.clone();
			const matrixWorldInverse = camera.matrixWorldInverse.clone();
			const visibleObjects = await this.getVisibleObjectsContext(camera);
			const overlayOnCamera = this.deviceCamera?.loaded === true;
			snapshot.som = await createSetOfMarkContext({
				tree: visibleObjects,
				image: await this.screenshotSynthesizer.getScreenshot(overlayOnCamera),
				nodeObjects: snapshot.semanticInternal.nodeObjects,
				registry: this.registry,
				projectionMatrix,
				matrixWorldInverse
			});
		}
		if (!this.disposed) this.setOfMark = snapshot.som;
		return snapshot.som;
	}
	async getSnapshot() {
		if (this.snapshot?.semanticInternal) return this.snapshot;
		if (this.snapshotPromise) return this.snapshotPromise;
		this.snapshotPromise = Promise.resolve().then(() => {
			const snapshot = this.snapshot ?? {};
			snapshot.semanticInternal = buildSemanticTree({
				scene: this.scene,
				registry: this.registry,
				capturedAt: this.getCaptureTimeMs(),
				interaction: this.interaction
			});
			this.snapshot = snapshot;
			return snapshot;
		}).finally(() => {
			this.snapshotPromise = null;
		});
		return this.snapshotPromise;
	}
	dispose() {
		this.disposed = true;
		this.activeClients.clear();
		this.snapshot = null;
		this.snapshotPromise = null;
		this.currentDetectionPromise = null;
		this.currentVisibleObjectsPromise = null;
		this.currentSetOfMarkPromise = null;
		this.currentContextPromise = null;
		this.currentContextRequestKey = "";
		this.tree = null;
		this.visibleObjects = null;
		this.setOfMark = null;
	}
	getCaptureTimeMs() {
		return this.simulationTimer?.getElapsedMs() ?? performance.now();
	}
};
//#endregion
//#region src/context/Context.ts
var Context = class extends Script {
	constructor(..._args) {
		super(..._args);
		this.editorIcon = "account_tree";
	}
	static {
		this.dependencies = {
			options: ContextOptions,
			scene: THREE.Scene,
			camera: THREE.Camera,
			screenshotSynthesizer: ScreenshotSynthesizer
		};
	}
	init({ options, deviceCamera }) {
		this.options = options;
		this.removeDetectors();
		this.deviceCamera = deviceCamera ?? this.deviceCamera;
		if (!options.enabled) return;
		if (options.scene.enabled) {
			this.scene = new SceneDetector();
			this.scene.setDeviceCamera(this.deviceCamera);
			this.add(this.scene);
		}
	}
	setDeviceCamera(deviceCamera) {
		this.deviceCamera = deviceCamera;
		this.scene?.setDeviceCamera(deviceCamera);
	}
	dispose() {
		this.removeDetectors();
	}
	removeDetectors() {
		if (this.scene) {
			this.scene.dispose();
			this.remove(this.scene);
		}
		this.scene = void 0;
	}
};
//#endregion
//#region src/core/components/ScriptsManager.ts
let ScriptsManagerEventType = /* @__PURE__ */ function(ScriptsManagerEventType) {
	ScriptsManagerEventType["EXCEPTION"] = "exception";
	return ScriptsManagerEventType;
}({});
const TARGET_DISPATCH = {
	onObjectSelectStart: (script, argument) => script.onObjectSelectStart(argument),
	onObjectSelectEnd: (script, argument) => script.onObjectSelectEnd(argument),
	onObjectLongSelect: (script, argument) => script.onObjectLongSelect(argument),
	onObjectTouchStart: (script, argument) => script.onObjectTouchStart(argument),
	onObjectTouching: (script, argument) => script.onObjectTouching(argument),
	onObjectTouchEnd: (script, argument) => script.onObjectTouchEnd(argument),
	onObjectGrabStart: (script, argument) => script.onObjectGrabStart(argument),
	onObjectGrabbing: (script, argument) => script.onObjectGrabbing(argument),
	onObjectGrabEnd: (script, argument) => script.onObjectGrabEnd(argument),
	onHoverEnter: (script, argument) => script.onHoverEnter(argument),
	onHovering: (script, argument) => script.onHovering(argument),
	onHoverExit: (script, argument) => script.onHoverExit(argument)
};
const TARGETED_HOOKS = Object.freeze(Object.keys(TARGET_DISPATCH));
const GLOBAL_HOOKS = Object.freeze([
	"update",
	"physicsStep",
	"onSelectStart",
	"onSelectEnd",
	"onSelect",
	"onSelecting",
	"onLongSelect",
	"onSqueezeStart",
	"onSqueezeEnd",
	"onSqueeze",
	"onSqueezing",
	"onKeyDown",
	"onKeyUp",
	"onXRSessionStarted",
	"onXRSessionEnded",
	"onSimulatorStarted"
]);
const INDEXED_HOOKS = Object.freeze([
	...TARGETED_HOOKS,
	...GLOBAL_HOOKS,
	"onObjectManipulate"
]);
const RAY_TARGET_HOOKS = Object.freeze([
	"onObjectSelectStart",
	"onObjectSelectEnd",
	"onObjectLongSelect",
	"onHoverEnter",
	"onHovering",
	"onHoverExit"
]);
const DIRECT_TOUCH_TARGET_HOOKS = Object.freeze([
	"onObjectSelectStart",
	"onObjectSelectEnd",
	"onObjectLongSelect",
	"onObjectTouchStart",
	"onObjectTouching",
	"onObjectTouchEnd",
	"onObjectGrabStart",
	"onObjectGrabbing",
	"onObjectGrabEnd"
]);
const SCRIPT_READY = Promise.resolve();
const NO_SCRIPT_CHANGES = Promise.resolve([]);
var ScriptsManager = class extends THREE.EventDispatcher {
	constructor(initScriptFunction) {
		super();
		this.initScriptFunction = initScriptFunction;
		this.activeScripts = /* @__PURE__ */ new Set();
		this.hookScripts = /* @__PURE__ */ new Map();
		this.pendingInitializations = /* @__PURE__ */ new Map();
		this.seenScripts = /* @__PURE__ */ new Set();
		this.interactionCandidates = /* @__PURE__ */ new Set();
		this.failedScripts = /* @__PURE__ */ new Set();
		this.syncPromises = [];
		this.traversalStack = [];
		this.disposed = false;
		this.catchExceptions = true;
		this.isScript = (object) => object.isXRScript === true;
		this.hasTargetHandler = (object, sourceType) => {
			if (!this.isScript(object)) return false;
			const script = object;
			return (sourceType === "direct-touch" ? DIRECT_TOUCH_TARGET_HOOKS : RAY_TARGET_HOOKS).some((hook) => this.hasIndexedHook(script, hook));
		};
		this.hasTargetHook = (object, hook) => this.isScript(object) && this.hasIndexedHook(object, hook);
		this.invokeTarget = (object, hook, argument) => {
			if (!this.isScript(object)) return;
			const script = object;
			if (!this.hasOverriddenHook(script, hook)) return;
			this.callTargeted([script], hook, (target) => TARGET_DISPATCH[hook](target, eventForTarget(argument, target)));
		};
		this.invokeGlobal = (hook, event) => {
			if (hook === "onSelectStart") this.callSelectStart(event);
			else if (hook === "onSelecting") this.callSelecting(event);
			else if (hook === "onSelect") this.callSelect(event);
			else if (hook === "onLongSelect") this.callLongSelect(event);
			else this.callSelectEnd(event);
		};
		this.invokeManipulation = (script, event) => {
			if (!this.hasOverriddenHook(script, "onObjectManipulate")) return;
			this.callTargeted([script], "onObjectManipulate", (target) => target.onObjectManipulate(event));
		};
		this.invokeSemantic = (object, callback) => {
			this.callTargeted([object], "semantic control callback", callback);
		};
		this.checkScript = (object) => {
			if (object.xb?.manipulation || getSemanticControl(object) || this.hasTargetHandler(object, "direct-touch")) this.interactionCandidates.add(object);
			if (object.isXRScript) {
				const script = object;
				this.seenScripts.add(script);
				if (!this.activeScripts.has(script) && !this.failedScripts.has(script)) this.syncPromises.push(this.initScript(script));
			}
		};
		this.callSelecting = (event) => {
			this.callHook("onSelecting", (script) => script.onSelecting(event));
		};
		this.callSqueezing = (controller) => {
			const event = controllerSelectEvent(controller);
			this.callHook("onSqueezing", (script) => script.onSqueezing(event));
		};
		this.update = (time, frame) => {
			this.callHook("update", (script) => script.update(time, frame));
		};
		this.physicsStep = () => {
			this.callHook("physicsStep", (script) => script.physicsStep());
		};
		this.callSelectStart = (event) => {
			this.callHook("onSelectStart", (script) => script.onSelectStart(event));
		};
		this.callSelectEnd = (event) => {
			this.callHook("onSelectEnd", (script) => script.onSelectEnd(event));
		};
		this.callSelect = (event) => {
			this.callHook("onSelect", (script) => script.onSelect(event));
		};
		this.callLongSelect = (event) => {
			this.callHook("onLongSelect", (script) => script.onLongSelect(event));
		};
		this.callSqueezeStart = (raw) => {
			const event = controllerSelectEvent(raw.target);
			this.callHook("onSqueezeStart", (script) => script.onSqueezeStart(event));
		};
		this.callSqueezeEnd = (raw) => {
			const event = controllerSelectEvent(raw.target);
			this.callHook("onSqueezeEnd", (script) => script.onSqueezeEnd(event));
		};
		this.callSqueeze = (raw) => {
			const event = controllerSelectEvent(raw.target);
			this.callHook("onSqueeze", (script) => script.onSqueeze(event));
		};
		this.callKeyDown = (event) => {
			this.callHook("onKeyDown", (script) => script.onKeyDown(event));
		};
		this.callKeyUp = (event) => {
			this.callHook("onKeyUp", (script) => script.onKeyUp(event));
		};
		this.onXRSessionStarted = (session) => {
			this.callHook("onXRSessionStarted", (script) => script.onXRSessionStarted(session));
		};
		this.onXRSessionEnded = () => {
			this.callHook("onXRSessionEnded", (script) => script.onXRSessionEnded());
		};
		this.onSimulatorStarted = () => {
			this.callHook("onSimulatorStarted", (script) => script.onSimulatorStarted());
		};
	}
	/** Objects found during the lifecycle traversal that direct touch can use. */
	get directTouchCandidates() {
		return this.interactionCandidates;
	}
	handleException(error, script, context) {
		console.error(`An error occurred in script ${script.name || script.constructor.name} [${context}]:`, error);
		this.dispatchEvent({
			type: "exception",
			scriptName: script.name || script.constructor.name,
			context,
			error,
			timestamp: performance.now()
		});
	}
	handleScriptError(error, script, context) {
		const normalizedError = error instanceof Error ? error : new Error(String(error));
		if (!this.catchExceptions) throw normalizedError;
		this.handleException(normalizedError, script, context);
	}
	/** Reports an asynchronous subsystem error against its owning Script. */
	reportError(error, script, context) {
		this.handleScriptError(error, script, context);
	}
	/**
	* Calls one targeted hook along a captured Script path. Developer errors use
	* the same exception policy as global Script callbacks.
	*/
	callTargeted(path, context, callback) {
		for (const script of path) try {
			callback(script);
		} catch (error) {
			this.handleScriptError(error, script, context);
		}
	}
	/**
	* Initializes a script and adds it to the set of scripts which will receive
	* callbacks. Concurrent calls share one initialization.
	* @param script - The script to initialize
	* @returns A promise which resolves when the script is initialized.
	*/
	initScript(script) {
		if (this.disposed) return Promise.reject(/* @__PURE__ */ new Error("ScriptsManager has been disposed."));
		if (this.activeScripts.has(script)) return SCRIPT_READY;
		if (this.failedScripts.has(script)) return SCRIPT_READY;
		const pending = this.pendingInitializations.get(script);
		if (pending) {
			if (pending.connection === "disconnected") pending.connection = "reconnected";
			return pending.promise;
		}
		const entry = {
			script,
			promise: SCRIPT_READY,
			connection: "connected"
		};
		entry.promise = SCRIPT_READY.then(() => this.finishInitialization(entry));
		this.pendingInitializations.set(script, entry);
		return entry.promise;
	}
	async finishInitialization(entry) {
		let failed = false;
		let initializationError;
		try {
			try {
				await this.initScriptFunction(entry.script);
			} catch (error) {
				failed = true;
				initializationError = error;
				if (entry.connection === "connected") this.failedScripts.add(entry.script);
			}
			if (entry.connection !== "connected") this.disposeScript(entry.script);
			else if (!failed) {
				this.activeScripts.add(entry.script);
				this.failedScripts.delete(entry.script);
				this.indexScript(entry.script);
			}
		} finally {
			if (this.pendingInitializations.get(entry.script) === entry) this.pendingInitializations.delete(entry.script);
		}
		if (entry.connection === "reconnected") {
			await this.initScript(entry.script);
			return;
		}
		if (initializationError !== void 0) throw initializationError instanceof Error ? initializationError : new Error(String(initializationError));
	}
	/**
	* Uninitializes a script calling dispose and removes it from the set of
	* scripts which will receive callbacks. A pending initialization is disposed
	* after it finishes and is never activated.
	* @param script - The script to uninitialize.
	*/
	uninitScript(script) {
		const pending = this.pendingInitializations.get(script);
		if (pending) {
			pending.connection = "disconnected";
			return;
		}
		if (!this.activeScripts.delete(script)) return;
		this.unindexScript(script);
		this.disposeScript(script);
	}
	/** Disposes every Script generation and prevents further initialization. */
	dispose() {
		if (this.disposalPromise) return this.disposalPromise;
		this.disposed = true;
		for (const pending of this.pendingInitializations.values()) pending.connection = "disconnected";
		const scripts = /* @__PURE__ */ new Set([...this.activeScripts, ...this.failedScripts]);
		const pending = [...this.pendingInitializations.values()].map((entry) => entry.promise);
		this.activeScripts.clear();
		this.failedScripts.clear();
		this.hookScripts.clear();
		this.seenScripts.clear();
		this.interactionCandidates.clear();
		this.syncPromises.length = 0;
		this.disposalPromise = Promise.resolve().then(() => this.finishDisposal(scripts, pending));
		return this.disposalPromise;
	}
	async finishDisposal(scripts, pending) {
		let firstError;
		for (const script of scripts) try {
			this.disposeScript(script);
		} catch (error) {
			firstError ??= error;
		}
		const pendingResults = await Promise.allSettled(pending);
		for (const result of pendingResults) if (result.status === "rejected") firstError ??= result.reason;
		this.pendingInitializations.clear();
		if (firstError !== void 0) throw firstError;
	}
	disposeScript(script) {
		let firstError;
		const run = (context, callback) => {
			try {
				callback();
			} catch (error) {
				const normalizedError = error instanceof Error ? error : new Error(String(error));
				if (this.catchExceptions) this.handleException(normalizedError, script, context);
				else firstError ??= normalizedError;
			}
		};
		run("beforeDispose", () => this.beforeDispose?.(script));
		run("dispose", () => script.dispose());
		run("afterDispose", () => this.afterDispose?.(script));
		if (firstError) throw firstError;
	}
	scanScene(scene) {
		const stack = this.traversalStack;
		stack.length = 0;
		stack.push(scene);
		while (stack.length > 0) {
			const object = stack.pop();
			if (object.userData.xrblocksPrivate === true) continue;
			this.checkScript(object);
			for (let index = object.children.length - 1; index >= 0; index--) stack.push(object.children[index]);
		}
	}
	/**
	* Finds all scripts in the scene and initializes them or uninitializes them.
	* Returns a promise which resolves when all new scripts finish initializing.
	* @param scene - The main scene which is used to find scripts.
	*/
	syncScriptsWithScene(scene) {
		if (this.disposed) return Promise.reject(/* @__PURE__ */ new Error("ScriptsManager has been disposed."));
		this.seenScripts.clear();
		this.interactionCandidates.clear();
		this.syncPromises.length = 0;
		this.scanScene(scene);
		for (const script of this.activeScripts) if (!this.seenScripts.has(script)) this.uninitScript(script);
		for (const script of this.pendingInitializations.keys()) {
			if (this.seenScripts.has(script)) continue;
			const pending = this.pendingInitializations.get(script);
			if (pending) this.syncPromises.push(pending.promise);
			this.uninitScript(script);
		}
		for (const script of [...this.failedScripts]) if (!this.seenScripts.has(script)) {
			this.failedScripts.delete(script);
			this.disposeScript(script);
		}
		return this.syncPromises.length === 0 ? NO_SCRIPT_CHANGES : Promise.allSettled(this.syncPromises);
	}
	callHook(hook, callback) {
		const scripts = this.hookScripts.get(hook);
		if (scripts) this.callTargeted(scripts, hook, callback);
	}
	hasOverriddenHook(script, hook) {
		return !isDefaultScriptMethod(Reflect.get(script, hook));
	}
	hasIndexedHook(script, hook) {
		return this.hookScripts.get(hook)?.has(script) ?? false;
	}
	getHookSet(hook) {
		let scripts = this.hookScripts.get(hook);
		if (!scripts) {
			scripts = /* @__PURE__ */ new Set();
			this.hookScripts.set(hook, scripts);
		}
		return scripts;
	}
	indexScript(script) {
		for (const hook of INDEXED_HOOKS) if (this.hasOverriddenHook(script, hook)) this.getHookSet(hook).add(script);
	}
	unindexScript(script) {
		for (const scripts of this.hookScripts.values()) scripts.delete(script);
	}
};
function controllerSelectEvent(controller) {
	const type = controller.inputSource?.hand ? "hand-ray" : controller.userData.isMouse ? "mouse" : "controller-ray";
	return {
		source: getInteractionSource(controller, type),
		stopPropagation() {}
	};
}
function eventForTarget(argument, currentTarget) {
	if (!argument || typeof argument !== "object") return argument;
	if (Reflect.get(argument, "currentTarget") === currentTarget) return argument;
	const event = Object.create(Object.getPrototypeOf(argument));
	Object.defineProperties(event, Object.getOwnPropertyDescriptors(argument));
	Object.defineProperty(event, "currentTarget", {
		enumerable: true,
		configurable: true,
		value: currentTarget
	});
	return event;
}
//#endregion
//#region src/core/components/WebXRSessionManager.ts
let WebXRSessionEventType = /* @__PURE__ */ function(WebXRSessionEventType) {
	WebXRSessionEventType["UNSUPPORTED"] = "unsupported";
	WebXRSessionEventType["READY"] = "ready";
	WebXRSessionEventType["BEFORE_SESSION_START"] = "beforesessionstart";
	WebXRSessionEventType["SESSION_START"] = "sessionstart";
	WebXRSessionEventType["SESSION_END"] = "sessionend";
	WebXRSessionEventType["SESSION_ERROR"] = "sessionerror";
	return WebXRSessionEventType;
}({});
/**
* Manages the WebXR session lifecycle by extending THREE.EventDispatcher
* to broadcast its state to any listener.
*/
var WebXRSessionManager = class extends THREE.EventDispatcher {
	constructor(renderer, sessionInit, mode) {
		super();
		this.renderer = renderer;
		this.sessionInit = sessionInit;
		this.mode = mode;
		this.waitingForXRSession = false;
		this.disposed = false;
		this.onSessionStartedInternal = async (session) => {
			if (this.disposed) {
				await session.end();
				return;
			}
			session.addEventListener("end", this.onSessionEndedInternal);
			try {
				this.dispatchEvent({
					type: "beforesessionstart",
					session
				});
				if (this.disposed) {
					session.removeEventListener("end", this.onSessionEndedInternal);
					await session.end();
					return;
				}
				await this.renderer.xr.setSession(session);
			} catch (error) {
				session.removeEventListener("end", this.onSessionEndedInternal);
				try {
					await session.end();
				} catch (cleanupError) {
					throw new AggregateError([error, cleanupError], "XR renderer setup failed and the session could not be closed.");
				}
				throw error;
			}
			if (this.disposed) {
				session.removeEventListener("end", this.onSessionEndedInternal);
				await session.end();
				return;
			}
			this.currentSession = session;
			this.dispatchEvent({
				type: "sessionstart",
				session
			});
		};
		this.onSessionEndedInternal = () => {
			this.currentSession?.removeEventListener("end", this.onSessionEndedInternal);
			this.currentSession = void 0;
			if (!this.disposed) this.dispatchEvent({ type: "sessionend" });
		};
	}
	/**
	* Checks for WebXR support and availability of the requested session mode.
	* This should be called to initialize the manager and trigger the first
	* events.
	*/
	async initialize() {
		if (!("xr" in navigator)) {
			console.warn("WebXR not supported");
			this.xrModeSupported = false;
			this.dispatchEvent({ type: "unsupported" });
			return;
		}
		let modeSupported = false;
		try {
			modeSupported = await navigator.xr.isSessionSupported(this.mode) || false;
		} catch (e) {
			if (this.disposed) return;
			console.error("Error getting isSessionSupported", e);
			this.xrModeSupported = false;
			this.dispatchEvent({ type: "unsupported" });
			return;
		}
		if (this.disposed) return;
		if (modeSupported) {
			this.xrModeSupported = true;
			this.sessionOptions = {
				...this.sessionInit,
				optionalFeatures: this.sessionInit.optionalFeatures || []
			};
			this.dispatchEvent({
				type: "ready",
				sessionOptions: this.sessionOptions
			});
			if (navigator.xr.offerSession !== void 0) navigator.xr.offerSession(this.mode, this.sessionOptions).then(this.onSessionStartedInternal).catch((err) => {
				console.warn(err);
			});
		} else {
			console.log(`${this.mode} not supported`);
			this.xrModeSupported = false;
			this.dispatchEvent({ type: "unsupported" });
		}
	}
	/**
	* Requests and initializes a WebXR session.
	*/
	startSession() {
		if (this.disposed) throw new Error("WebXRSessionManager has been disposed");
		else if (this.xrModeSupported === void 0) throw new Error("Initialize not yet complete");
		else if (!this.xrModeSupported) throw new Error("WebXR not supported");
		else if (this.currentSession) throw new Error("Session already started");
		else if (this.waitingForXRSession) throw new Error("Waiting for session to start");
		this.waitingForXRSession = true;
		navigator.xr.requestSession(this.mode, this.sessionOptions).then(this.onSessionStartedInternal).finally(() => {
			this.waitingForXRSession = false;
		}).catch((err) => {
			console.error("Error requesting session", err, "mode:", this.mode, "sesionOptions:", this.sessionOptions);
			if (!this.disposed) this.dispatchEvent({
				type: "sessionerror",
				error: err
			});
		});
	}
	/**
	* Ends the WebXR session.
	*/
	async endSession() {
		const session = this.currentSession;
		if (!session) throw new Error("No session to end");
		try {
			await session.end();
		} finally {
			session.removeEventListener("end", this.onSessionEndedInternal);
			if (this.currentSession === session) this.currentSession = void 0;
		}
	}
	/**
	* Returns whether XR is supported. Will be undefined until initialize is
	* complete.
	*/
	isXRSupported() {
		return this.xrModeSupported;
	}
	getSessionOptions() {
		return this.sessionOptions;
	}
	dispose() {
		if (this.disposalPromise) return this.disposalPromise;
		this.disposed = true;
		this.disposalPromise = this.currentSession ? this.endSession() : Promise.resolve();
		return this.disposalPromise;
	}
};
//#endregion
//#region src/core/components/XRButton.ts
const XRBUTTON_WRAPPER_ID = "XRButtonWrapper";
const XRBUTTON_CLASS = "XRButton";
var XRButton = class {
	constructor(sessionManager, permissionsManager, appTitle = "", appDescription = "", startText = "ENTER XR", endText = "END XR", invalidText = "XR NOT SUPPORTED", startSimulatorText = "START SIMULATOR", showEnterSimulatorButton = false, startSimulator = () => {}, permissions = {
		geolocation: false,
		camera: false,
		microphone: false
	}) {
		this.sessionManager = sessionManager;
		this.permissionsManager = permissionsManager;
		this.appTitle = appTitle;
		this.appDescription = appDescription;
		this.startText = startText;
		this.endText = endText;
		this.invalidText = invalidText;
		this.startSimulatorText = startSimulatorText;
		this.startSimulator = startSimulator;
		this.permissions = permissions;
		this.domElement = document.createElement("div");
		this.simulatorButtonElement = document.createElement("button");
		this.xrButtonElement = document.createElement("button");
		this.errorElement = document.createElement("p");
		this.disposed = false;
		this.startingSimulator = false;
		this.onUnsupported = () => this.showXRNotSupported();
		this.onReady = () => this.onSessionReady();
		this.onSessionStart = () => this.onSessionStarted();
		this.onSessionEnd = () => this.onSessionEnded();
		this.onSessionError = (event) => this.showError(event.error);
		this.domElement.id = XRBUTTON_WRAPPER_ID;
		this.createXRAppTitle();
		this.createXRAppDescription();
		this.createXRButtonElement();
		if (showEnterSimulatorButton) this.createSimulatorButton();
		this.createErrorElement();
		this.sessionManager.addEventListener("unsupported", this.onUnsupported);
		this.sessionManager.addEventListener("ready", this.onReady);
		this.sessionManager.addEventListener("sessionstart", this.onSessionStart);
		this.sessionManager.addEventListener("sessionend", this.onSessionEnd);
		this.sessionManager.addEventListener("sessionerror", this.onSessionError);
	}
	createErrorElement() {
		this.errorElement.className = "XRButtonError";
		this.errorElement.setAttribute("role", "alert");
		this.errorElement.style.maxWidth = "min(90vw, 40rem)";
		this.errorElement.hidden = true;
		this.domElement.appendChild(this.errorElement);
	}
	showError(error, mode = "XR") {
		if (this.disposed) return;
		const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
		this.errorElement.textContent = `${mode} could not start. ${detail}`;
		this.errorElement.hidden = false;
		if (mode === "Simulator") return;
		this.xrButtonElement.textContent = this.sessionManager.currentSession ? this.endText : this.startText;
		this.xrButtonElement.disabled = this.startingSimulator;
		this.simulatorButtonElement.disabled = this.startingSimulator || !!this.sessionManager.currentSession;
	}
	createSimulatorButton() {
		this.simulatorButtonElement.classList.add(XRBUTTON_CLASS);
		this.simulatorButtonElement.innerText = this.startSimulatorText;
		this.simulatorButtonElement.onclick = async () => {
			if (this.disposed || this.simulatorButtonElement.disabled) return;
			this.setSimulatorStarting(true);
			this.errorElement.textContent = "";
			this.errorElement.hidden = true;
			try {
				await this.startSimulator();
				if (!this.disposed) this.domElement.remove();
			} catch (error) {
				if (this.disposed) return;
				this.setSimulatorStarting(false);
				this.showError(error, "Simulator");
			}
		};
		this.domElement.appendChild(this.simulatorButtonElement);
	}
	createXRAppTitle() {
		if (!this.appTitle) return;
		const appTitle = document.createElement("h1");
		appTitle.textContent = this.appTitle;
		this.domElement.appendChild(appTitle);
	}
	createXRAppDescription() {
		if (!this.appDescription) return;
		const appDescription = document.createElement("h4");
		appDescription.textContent = this.appDescription;
		this.domElement.appendChild(appDescription);
	}
	createXRButtonElement() {
		this.xrButtonElement.classList.add(XRBUTTON_CLASS);
		this.xrButtonElement.disabled = true;
		this.xrButtonElement.textContent = "...";
		this.domElement.appendChild(this.xrButtonElement);
	}
	onSessionReady() {
		this.errorElement.textContent = "";
		this.errorElement.hidden = true;
		const button = this.xrButtonElement;
		button.style.display = "";
		button.innerHTML = this.startText;
		button.disabled = this.startingSimulator;
		this.simulatorButtonElement.disabled = this.startingSimulator;
		const allowsVideoFallback = this.sessionManager.getSessionOptions()?.optionalFeatures?.includes("camera-access");
		button.onclick = () => {
			if (this.disposed || button.disabled) return;
			this.errorElement.textContent = "";
			this.errorElement.hidden = true;
			button.textContent = "ENTERING XR...";
			button.disabled = true;
			this.simulatorButtonElement.disabled = true;
			this.permissionsManager.checkAndRequestPermissions(this.permissions, { allowVideoFallback: allowsVideoFallback }).then((result) => {
				if (this.disposed) return;
				if (result.granted) this.sessionManager.startSession();
				else this.showError(new Error(result.error || "Browser permission was not granted."));
			}).catch((error) => this.showError(error));
		};
	}
	showXRNotSupported() {
		this.xrButtonElement.textContent = this.invalidText;
		this.xrButtonElement.disabled = true;
	}
	async onSessionStarted() {
		this.errorElement.textContent = "";
		this.errorElement.hidden = true;
		this.xrButtonElement.innerHTML = this.endText;
		this.xrButtonElement.disabled = this.startingSimulator;
		this.simulatorButtonElement.disabled = true;
		this.xrButtonElement.onclick = () => {
			this.sessionManager.endSession();
		};
	}
	onSessionEnded() {
		this.onSessionReady();
	}
	setSimulatorStarting(starting) {
		if (this.disposed) return;
		this.startingSimulator = starting;
		this.simulatorButtonElement.disabled = starting || !!this.sessionManager.currentSession;
		this.xrButtonElement.disabled = starting || this.sessionManager.isXRSupported() !== true;
	}
	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.sessionManager.removeEventListener("unsupported", this.onUnsupported);
		this.sessionManager.removeEventListener("ready", this.onReady);
		this.sessionManager.removeEventListener("sessionstart", this.onSessionStart);
		this.sessionManager.removeEventListener("sessionend", this.onSessionEnd);
		this.sessionManager.removeEventListener("sessionerror", this.onSessionError);
		this.simulatorButtonElement.onclick = null;
		this.xrButtonElement.onclick = null;
		this.domElement.remove();
	}
};
//#endregion
//#region src/core/components/XREffects.ts
var XRPass = class extends Pass {
	render(_renderer, _writeBuffer, _readBuffer, _deltaTime, _maskActive, _viewId = 0) {}
};
/**
* XREffects manages the XR rendering pipeline.
* Use core.effects
* It handles multiple passes and render targets for applying effects to XR
* scenes.
*/
var XREffects = class {
	constructor(renderer, scene, timer) {
		this.renderer = renderer;
		this.scene = scene;
		this.timer = timer;
		this.passes = [];
		this.renderTargets = [];
		this.dimensions = new THREE.Vector2();
	}
	setRenderTarget(target) {
		this.renderer.setRenderTarget(target);
	}
	/**
	* Adds a pass to the effect pipeline.
	*/
	addPass(pass) {
		pass.renderToScreen = false;
		this.passes.push(pass);
	}
	/**
	* Sets up render targets for the effect pipeline.
	*/
	setupRenderTargets(dimensions) {
		const defaultTarget = this.renderer.getRenderTarget();
		if (defaultTarget == null) return;
		const neededRenderTargets = this.renderer.xr.isPresenting ? 4 : 2;
		for (let i = 0; i < neededRenderTargets; i++) if (i >= this.renderTargets.length || this.renderTargets[i].width != dimensions.x || this.renderTargets[i].height != dimensions.y) {
			this.renderTargets[i]?.depthTexture?.dispose();
			this.renderTargets[i]?.dispose();
			this.renderTargets[i] = defaultTarget.clone();
			const hasStencil = this.renderTargets[i].stencilBuffer;
			this.renderTargets[i].depthTexture = new THREE.DepthTexture(dimensions.x, dimensions.y, hasStencil ? THREE.UnsignedInt248Type : THREE.UnsignedIntType, void 0, void 0, void 0, void 0, void 0, void 0, hasStencil ? THREE.DepthStencilFormat : THREE.DepthFormat);
		}
		for (let i = neededRenderTargets; i < this.renderTargets.length; i++) {
			this.renderTargets[i].depthTexture?.dispose();
			this.renderTargets[i].dispose();
		}
	}
	/**
	* Renders the XR effects.
	*/
	render(camera) {
		this.renderer.getDrawingBufferSize(this.dimensions);
		this.setupRenderTargets(this.dimensions);
		this.renderer.xr.cameraAutoUpdate = false;
		if (!this.renderer.getRenderTarget()) return;
		if (this.renderer.xr.isPresenting) this.renderXr();
		else this.renderSimulator(camera);
	}
	renderXr() {
		assertWebGLRenderer(this.renderer, "XREffects.renderXr");
		const defaultTarget = this.renderer.getRenderTarget();
		const renderer = this.renderer;
		const xrEnabled = renderer.xr.enabled;
		const xrIsPresenting = renderer.xr.isPresenting;
		const prevAutoClearColor = renderer.autoClearColor;
		const renderTargets = this.renderTargets;
		renderer.xr.cameraAutoUpdate = false;
		renderer.xr.enabled = false;
		const deltaTime = this.timer.getDelta();
		const numCameras = renderer.xr.getCamera().cameras.length;
		if (numCameras > 0) {
			const prevMatrixWorldAutoUpdate = this.scene.matrixWorldAutoUpdate;
			if (prevMatrixWorldAutoUpdate) this.scene.updateMatrixWorld();
			this.scene.matrixWorldAutoUpdate = false;
			try {
				for (let camIndex = 0; camIndex < numCameras; ++camIndex) {
					const cam = renderer.xr.getCamera().cameras[camIndex];
					renderer.setViewport(cam.viewport);
					this.setRenderTarget(renderTargets[camIndex]);
					renderer.clear();
					renderer.xr.isPresenting = true;
					renderer.render(this.scene, cam);
				}
			} finally {
				this.scene.matrixWorldAutoUpdate = prevMatrixWorldAutoUpdate;
			}
			this.setRenderTarget(defaultTarget);
			renderer.clear();
			renderer.xr.isPresenting = false;
			renderer.autoClearColor = false;
			for (let eye = 0; eye < numCameras; eye++) {
				for (let i = 0; i < this.passes.length - 1; ++i) {
					const lastRenderTargetIndex = i % 2;
					const nextRenderTargetIndex = (i + 1) % 2;
					defaultTarget.viewport.set(eye * this.dimensions.x / numCameras, 0, this.dimensions.x / numCameras, this.dimensions.y);
					this.passes[i].render(renderer, this.renderTargets[2 * nextRenderTargetIndex + eye], this.renderTargets[2 * lastRenderTargetIndex + eye], deltaTime, false, eye);
				}
				if (this.passes.length > 0) {
					const lastRenderTargetIndex = (this.passes.length - 1) % 2;
					defaultTarget.viewport.set(eye * this.dimensions.x / numCameras, 0, this.dimensions.x / numCameras, this.dimensions.y);
					this.passes[this.passes.length - 1].render(renderer, defaultTarget, this.renderTargets[2 * lastRenderTargetIndex + eye], deltaTime, false, eye);
				}
			}
			renderer.autoClearColor = prevAutoClearColor;
			renderer.xr.enabled = xrEnabled;
			renderer.xr.isPresenting = xrIsPresenting;
		}
	}
	renderSimulator(camera) {
		const defaultTarget = this.renderer.getRenderTarget();
		const renderer = this.renderer;
		const xrEnabled = renderer.xr.enabled;
		const prevAutoClearColor = renderer.autoClearColor;
		renderer.xr.cameraAutoUpdate = false;
		renderer.xr.enabled = false;
		const deltaTime = this.timer.getDelta();
		if (this.passes.length === 0) {
			this.setRenderTarget(defaultTarget);
			renderer.render(this.scene, camera);
			renderer.xr.enabled = xrEnabled;
			return;
		}
		this.setRenderTarget(this.renderTargets[0]);
		renderer.clear();
		renderer.render(this.scene, camera);
		this.setRenderTarget(defaultTarget);
		renderer.clear();
		renderer.autoClearColor = false;
		for (let i = 0; i < this.passes.length - 1; ++i) {
			const lastRenderTargetIndex = i % 2;
			const nextRenderTargetIndex = (i + 1) % 2;
			this.passes[i].render(renderer, this.renderTargets[nextRenderTargetIndex], this.renderTargets[lastRenderTargetIndex], deltaTime, false, 0);
		}
		if (this.passes.length > 0) {
			const lastRenderTargetIndex = (this.passes.length - 1) % 2;
			this.passes[this.passes.length - 1].render(renderer, defaultTarget, this.renderTargets[lastRenderTargetIndex], deltaTime, false, 0);
		}
		renderer.autoClearColor = prevAutoClearColor;
		renderer.xr.enabled = xrEnabled;
	}
	dispose() {
		let firstError;
		for (const target of this.renderTargets) for (const dispose of [() => target.depthTexture?.dispose(), () => target.dispose()]) try {
			dispose();
		} catch (error) {
			firstError ??= error;
		}
		this.renderTargets.length = 0;
		for (const pass of this.passes) try {
			pass.dispose();
		} catch (error) {
			firstError ??= error;
		}
		this.passes.length = 0;
		if (firstError !== void 0) throw firstError;
	}
};
//#endregion
//#region src/debug/DebugGlobals.ts
let lifecycle;
function registerDebugGlobals(sdk) {
	if (!debugRequestedByUrl() || typeof window === "undefined") return;
	const debugWindow = window;
	if ("xb" in debugWindow || "xbReady" in debugWindow) {
		console.warn("XR Blocks debug globals were not installed because window.xb or window.xbReady is already defined.");
		return;
	}
	let resolveReady;
	let rejectReady;
	const ready = new Promise((resolve, reject) => {
		resolveReady = resolve;
		rejectReady = reject;
	});
	ready.catch(() => void 0);
	debugWindow.xb = sdk;
	debugWindow.xbReady = ready;
	lifecycle = {
		core: sdk.core,
		resolve: resolveReady,
		reject: rejectReady
	};
}
function markDebugReady(core) {
	if (lifecycle?.core === core) lifecycle.resolve();
}
function markDebugFailed(core, error) {
	if (lifecycle?.core === core) lifecycle.reject(error);
}
function debugRequestedByUrl() {
	if (typeof window === "undefined") return false;
	const value = new URLSearchParams(window.location.search).get("debug")?.toLowerCase();
	return value === "1" || value === "true";
}
//#endregion
//#region src/core/User.ts
/**
* User is an embodied instance to manage hands, controllers, speech, and
* avatars. It extends Script to update human-world interaction.
*
* In the long run, User is to manages avatars, hands, and everything of Human
* I/O. In third-person view simulation, it should come with an low-poly avatar.
* To support multi-user social XR planned for future iterations.
*/
var User = class extends Script {
	constructor(..._args) {
		super(..._args);
		this.local = true;
		this.numHands = 2;
		this.height = 1.6;
		this.panelDistance = 1.75;
		this.handedness = 1;
		this.safeSpaceRadius = .2;
		this.objectDistance = 1.5;
		this.objectAngle = -18 / 180 * Math.PI;
		this.pivots = [];
	}
	static {
		this.dependencies = {
			input: Input,
			interaction: Interaction
		};
	}
	/**
	* Initializes the User.
	*/
	init({ input, interaction }) {
		this.input = input;
		this.interaction = interaction;
		this.controllers = input.controllers;
	}
	/**
	* Sets the user's height on the first frame.
	* @param camera -
	*/
	setHeight(camera) {
		this.height = camera.position.y;
	}
	/**
	* Adds pivots at the starting tip of user's hand / controller / mouse rays.
	*/
	enablePivots() {
		this.input.enablePivots();
	}
	/**
	* Gets the pivot object for a given controller id.
	* @param id - The controller id.
	* @returns The pivot object.
	*/
	getPivot(id) {
		return this.controllers[id].getObjectByName("pivot");
	}
	/**
	* Gets the world position of the pivot for a given controller id.
	* @param id - The controller id.
	* @returns The world position of the pivot.
	*/
	getPivotPosition(id) {
		return this.getPivot(id)?.getWorldPosition(new THREE.Vector3());
	}
	getRay(controllerId, target = new THREE.Ray()) {
		const ray = this.interaction.getSourceSnapshot(this.controllers[controllerId])?.ray;
		return ray ? target.copy(ray) : target;
	}
	getRayIntersection(controllerId) {
		const controller = this.controllers[controllerId];
		const resolved = this.interaction.getResolvedRay(controller);
		return resolved ? this.interaction.getIntersectionAt(resolved.surface, controller) : null;
	}
	/**
	* Checks if any controller is pointing at the given object or its children.
	* @param obj - The object to check against.
	* @returns True if a controller is pointing at the object.
	*/
	isPointingAt(obj) {
		return this.interaction.isPointingAt(obj);
	}
	/**
	* Checks if any controller is selecting the given object or its children.
	* @param obj - The object to check against.
	* @returns True if a controller is selecting the object.
	*/
	isSelectingAt(obj) {
		return this.interaction.isSelectingAt(obj);
	}
	isManipulating(obj) {
		return this.interaction.isManipulating(obj);
	}
	/**
	* Gets the intersection point on a specific object.
	* @param obj - The object to check for intersection.
	* @param id - The controller ID, or -1 for any controller.
	* @returns The intersection details, or null if no intersection.
	*/
	getIntersectionAt(obj, id = -1) {
		return this.interaction.getIntersectionAt(obj, id < 0 ? void 0 : this.controllers[id]);
	}
	/**
	* Gets the world position of a controller.
	* @param id - The controller id.
	* @param target - The target vector to
	* store the result.
	* @returns The world position of the controller.
	*/
	getControllerPosition(id, target = new THREE.Vector3()) {
		this.controllers[id].getWorldPosition(target);
		return target;
	}
	/**
	* Calculates the distance between a controller and an object.
	* @param id - The controller id.
	* @param object - The object to measure the distance to.
	* @returns The distance between the controller and the object.
	*/
	getControllerObjectDistance(id, object) {
		const controllerPos = this.getControllerPosition(id);
		const objPos = new THREE.Vector3();
		object.getWorldPosition(objPos);
		return controllerPos.distanceTo(objPos);
	}
	/**
	* Checks if either controller is selecting.
	* @param id - The controller id. If -1, check both controllers.
	* @returns True if selecting, false otherwise.
	*/
	isSelecting(id = -1) {
		if (id == -1) return this.input.controllers.some((controller) => {
			return controller.userData.selected;
		});
		return this.input.controllers[id].userData.selected;
	}
	/**
	* Checks if either controller is squeezing.
	* @param id - The controller id. If -1, check both controllers.
	* @returns True if squeezing, false otherwise.
	*/
	isSqueezing(id = -1) {
		if (id == -1) return this.input.controllers.some((controller) => {
			return controller.userData.squeezing;
		});
		return this.input.controllers[id].userData.squeezing;
	}
};
//#endregion
//#region src/input/gestures/GestureRecognition.ts
var GestureRecognition = class extends Script {
	constructor(..._args) {
		super(..._args);
		this.activeGestures = {
			left: /* @__PURE__ */ new Map(),
			right: /* @__PURE__ */ new Map()
		};
		this.latestScores = {
			left: null,
			right: null
		};
		this.pendingRecognition = {
			left: false,
			right: false
		};
		this.lastEvaluation = 0;
	}
	static {
		this.dependencies = {
			user: User,
			options: GestureRecognitionOptions
		};
	}
	async init({ options, user }) {
		this.options = options;
		await this.options.poseEstimator.init?.({ user });
		await this.options.gestureRecognizer.init?.();
		if (!this.options.enabled) console.info("GestureRecognition initialized but disabled. Call options.enableGestures() to activate.");
	}
	update() {
		if (!this.options.enabled) return;
		const now = performance.now();
		const interval = this.options.updateIntervalMs;
		if (interval > 0 && now - this.lastEvaluation < interval) return;
		this.lastEvaluation = now;
		this.evaluateHand(0);
		this.evaluateHand(1);
	}
	evaluateHand(handedness) {
		const handLabel = HAND_INDEX_TO_LABEL[handedness];
		if (!handLabel) return;
		const activeMap = this.activeGestures[handLabel];
		const context = this.options.poseEstimator.getHandContext(handedness);
		if (!context) {
			for (const [name] of activeMap.entries()) this.emitGesture("gestureend", {
				name,
				hand: handLabel,
				confidence: 0
			});
			activeMap.clear();
			return;
		}
		this.recognizeHand(context);
		const scores = this.latestScores[handLabel];
		if (!scores) return;
		this.emitFromScores(handLabel, scores);
	}
	recognizeHand(context) {
		const handLabel = context.handLabel;
		if (this.pendingRecognition[handLabel]) return;
		const result = this.options.gestureRecognizer.recognize(context);
		if (result instanceof Promise) {
			this.pendingRecognition[handLabel] = true;
			result.then((scores) => {
				this.latestScores[handLabel] = scores;
			}).catch((error) => {
				console.error("GestureRecognition recognizer failed:", error);
			}).finally(() => {
				this.pendingRecognition[handLabel] = false;
			});
			return;
		}
		this.latestScores[handLabel] = result;
	}
	emitFromScores(handLabel, scores) {
		const activeMap = this.activeGestures[handLabel];
		const processed = /* @__PURE__ */ new Set();
		for (const [name, config] of Object.entries(this.options.gestures)) {
			const gestureName = name;
			if (!config?.enabled) continue;
			const result = scores[gestureName];
			const isActive = result && result.confidence >= this.options.minimumConfidence;
			processed.add(gestureName);
			const previousState = activeMap.get(gestureName);
			if (isActive) {
				const detail = {
					name: gestureName,
					hand: handLabel,
					confidence: THREE.MathUtils.clamp(result.confidence, 0, 1),
					data: result.data
				};
				if (!previousState) {
					activeMap.set(gestureName, {
						confidence: detail.confidence,
						data: detail.data
					});
					this.emitGesture("gesturestart", detail);
				} else {
					previousState.confidence = detail.confidence;
					previousState.data = detail.data;
					this.emitGesture("gestureupdate", detail);
				}
			} else if (previousState) {
				activeMap.delete(gestureName);
				this.emitGesture("gestureend", {
					name: gestureName,
					hand: handLabel,
					confidence: 0
				});
			}
		}
		for (const name of Array.from(activeMap.keys())) if (!processed.has(name)) {
			activeMap.delete(name);
			this.emitGesture("gestureend", {
				name,
				hand: handLabel,
				confidence: 0
			});
		}
	}
	emitGesture(type, detail) {
		const event = {
			type,
			detail,
			target: this
		};
		this.dispatchEvent(event);
	}
	dispose() {
		this.options.poseEstimator.dispose?.();
		this.options.gestureRecognizer.dispose?.();
	}
};
//#endregion
//#region src/ui/UITheme.ts
const COLOR_PROPERTIES = [
	"surface",
	"raisedSurface",
	"primary",
	"primaryText",
	"text",
	"secondaryText",
	"outline",
	"disabledSurface",
	"disabledText"
];
const COLOR_PROPERTY_SET = new Set(COLOR_PROPERTIES);
const THEME_PROPERTIES = /* @__PURE__ */ new Set([
	"colors",
	"borderRadius",
	"styles"
]);
const UI_THEME_STYLE_ROLES = /* @__PURE__ */ new Set([
	"surface",
	"panel",
	"text",
	"button",
	"slider",
	"scroll",
	"input",
	"image",
	"icon"
]);
const grayGlassTheme = createThemeSnapshot({
	colors: {
		surface: "rgba(5, 5, 5, 0.6)",
		raisedSurface: "rgba(255, 255, 255, 0.08)",
		primary: "#61dafb",
		primaryText: "#282c34",
		text: "#ffffff",
		secondaryText: "#aab2c0",
		outline: "rgba(255, 255, 255, 0.18)",
		disabledSurface: "#282c3466",
		disabledText: "#aab2c0"
	},
	borderRadius: 32,
	styles: {
		surface: {
			backgroundColor: {
				gradientType: "linear",
				rotation: 90,
				stops: [
					{
						position: 0,
						color: "rgba(55, 55, 65, 0.75)"
					},
					{
						position: .4,
						color: "rgba(32, 32, 38, 0.80)"
					},
					{
						position: 1,
						color: "rgba(18, 18, 22, 0.85)"
					}
				]
			},
			borderColor: {
				gradientType: "linear",
				rotation: 90,
				stops: [
					{
						position: 0,
						color: "rgba(255, 255, 255, 0.42)"
					},
					{
						position: .5,
						color: "rgba(255, 255, 255, 0.14)"
					},
					{
						position: 1,
						color: "rgba(255, 255, 255, 0.22)"
					}
				]
			},
			borderWidth: 1.5,
			borderRadius: 32,
			padding: 24,
			gap: 16,
			innerShadowColor: "rgba(150, 150, 150, 0.05)",
			innerShadowBlur: 24
		},
		button: {
			height: 46,
			flexDirection: "row",
			justifyContent: "center",
			alignItems: "center",
			gap: 10,
			paddingLeft: 20,
			paddingRight: 20,
			backgroundColor: "rgba(255, 255, 255, 0.08)",
			color: "#ffffff",
			borderColor: "rgba(255, 255, 255, 0.18)",
			borderWidth: 1.5,
			borderRadius: 23,
			":hover": { backgroundColor: "rgba(255, 255, 255, 0.14)" },
			":disabled": {
				backgroundColor: "#282c3466",
				color: "#aab2c0"
			}
		},
		text: { color: "#ffffff" }
	}
});
const colorfulTheme = createThemeSnapshot({
	colors: {
		surface: "rgba(10, 17, 31, 0.96)",
		raisedSurface: "rgba(22, 35, 58, 0.96)",
		primary: "#22d3ee",
		primaryText: "#111827",
		text: "#f8fafc",
		secondaryText: "#cbd5e1",
		outline: "#8ff0df",
		disabledSurface: "rgba(71, 85, 105, 0.45)",
		disabledText: "#94a3b8"
	},
	borderRadius: 32,
	styles: {
		surface: {
			backgroundColor: "rgba(10, 17, 31, 0.96)",
			borderColor: "#8ff0df",
			borderWidth: 3,
			borderRadius: 32,
			padding: 24,
			gap: 16
		},
		button: {
			height: 46,
			flexDirection: "row",
			justifyContent: "center",
			alignItems: "center",
			gap: 10,
			paddingLeft: 20,
			paddingRight: 20,
			backgroundColor: "#233653",
			color: "#f8fafc",
			borderColor: "#8ff0df",
			borderWidth: 2,
			borderRadius: 22,
			":hover": { backgroundColor: "#315274" },
			":active": { backgroundColor: "#7c3aed" },
			":disabled": {
				backgroundColor: "rgba(71, 85, 105, 0.45)",
				color: "#94a3b8"
			}
		},
		text: { color: "#f8fafc" }
	}
});
const glimmerTheme = createGlimmerTheme({
	surface: "rgba(5, 5, 5, 0.65)",
	raisedSurface: "rgba(255, 255, 255, 0.08)",
	primary: "#3b82f6",
	secondaryText: "rgba(255, 255, 255, 0.85)",
	outline: "rgba(255, 255, 255, 0.35)",
	disabledSurface: "rgba(255, 255, 255, 0.04)",
	disabledText: "rgba(255, 255, 255, 0.4)",
	borderStops: [
		"rgba(255, 255, 255, 0.5)",
		"rgba(255, 255, 255, 0.25)",
		"rgba(255, 255, 255, 0.35)"
	],
	buttonHover: "#2563eb",
	buttonActive: "#1d4ed8",
	buttonDisabledSurface: "rgba(255, 255, 255, 0.08)"
});
const glimmerOpaqueTheme = createGlimmerTheme({
	surface: "rgba(15, 23, 42, 0.96)",
	raisedSurface: "rgba(30, 41, 59, 0.96)",
	primary: "#3b82f6",
	secondaryText: "#cbd5e1",
	outline: "rgba(255, 255, 255, 0.35)",
	disabledSurface: "rgba(51, 65, 85, 0.5)",
	disabledText: "#94a3b8",
	borderStops: [
		"rgba(255, 255, 255, 0.5)",
		"rgba(255, 255, 255, 0.25)",
		"rgba(255, 255, 255, 0.35)"
	],
	buttonHover: "#2563eb",
	buttonActive: "#1d4ed8"
});
const glimmerAmberTheme = createGlimmerTheme({
	surface: "rgba(25, 18, 5, 0.75)",
	raisedSurface: "rgba(255, 193, 7, 0.12)",
	primary: "#f59e0b",
	secondaryText: "rgba(255, 255, 255, 0.85)",
	outline: "rgba(251, 191, 36, 0.45)",
	disabledSurface: "rgba(255, 255, 255, 0.04)",
	disabledText: "rgba(255, 255, 255, 0.4)",
	borderStops: [
		"rgba(251, 191, 36, 0.55)",
		"rgba(251, 191, 36, 0.25)",
		"rgba(251, 191, 36, 0.35)"
	],
	buttonHover: "#d97706",
	buttonActive: "#b45309",
	buttonDisabledSurface: "rgba(255, 255, 255, 0.08)"
});
const glimmerGreenTheme = createGlimmerTheme({
	surface: "rgba(5, 20, 10, 0.75)",
	raisedSurface: "rgba(16, 185, 129, 0.12)",
	primary: "#10b981",
	secondaryText: "rgba(255, 255, 255, 0.85)",
	outline: "rgba(52, 211, 153, 0.45)",
	disabledSurface: "rgba(255, 255, 255, 0.04)",
	disabledText: "rgba(255, 255, 255, 0.4)",
	borderStops: [
		"rgba(52, 211, 153, 0.55)",
		"rgba(52, 211, 153, 0.25)",
		"rgba(52, 211, 153, 0.35)"
	],
	buttonHover: "#059669",
	buttonActive: "#047857",
	buttonDisabledSurface: "rgba(255, 255, 255, 0.08)"
});
const uiThemePresets = Object.freeze({
	grayGlass: grayGlassTheme,
	colorful: colorfulTheme,
	glimmer: glimmerTheme,
	glimmerOpaque: glimmerOpaqueTheme,
	glimmerAmber: glimmerAmberTheme,
	glimmerGreen: glimmerGreenTheme
});
const defaultTheme = grayGlassTheme;
/** Creates a detached, deeply frozen theme snapshot. */
function createThemeSnapshot(value) {
	validateRecord(value, "UI theme");
	validateThemeProperties(value);
	const colors = cloneColors(value.colors, false);
	const borderRadius = validateBorderRadius(value.borderRadius);
	const styles = value.styles === void 0 ? void 0 : cloneThemeStyles(value.styles);
	return deepFreeze({
		colors,
		borderRadius,
		...styles ? { styles } : void 0
	});
}
/** Applies a partial update and returns one new immutable snapshot. */
function updateThemeSnapshot(theme, update) {
	validateRecord(update, "UI theme update");
	validateThemeProperties(update);
	return createThemeSnapshot({
		colors: update.colors === void 0 ? theme.colors : {
			...theme.colors,
			...cloneColors(update.colors, true)
		},
		borderRadius: update.borderRadius === void 0 ? theme.borderRadius : update.borderRadius,
		styles: update.styles === void 0 ? theme.styles : update.styles
	});
}
function createGlimmerTheme(options) {
	return createThemeSnapshot({
		colors: {
			surface: options.surface,
			raisedSurface: options.raisedSurface,
			primary: options.primary,
			primaryText: "#ffffff",
			text: "#ffffff",
			secondaryText: options.secondaryText,
			outline: options.outline,
			disabledSurface: options.disabledSurface,
			disabledText: options.disabledText
		},
		borderRadius: 32,
		styles: {
			surface: {
				backgroundColor: options.surface,
				borderColor: {
					gradientType: "linear",
					rotation: 90,
					stops: [
						{
							position: 0,
							color: options.borderStops[0]
						},
						{
							position: .5,
							color: options.borderStops[1]
						},
						{
							position: 1,
							color: options.borderStops[2]
						}
					]
				},
				borderWidth: 2,
				borderRadius: 32,
				padding: 22,
				gap: 12,
				innerShadowColor: "rgba(150, 150, 150, 0.05)",
				innerShadowBlur: 32
			},
			button: {
				height: 44,
				flexDirection: "row",
				alignItems: "center",
				justifyContent: "center",
				gap: 8,
				paddingLeft: 16,
				paddingRight: 16,
				backgroundColor: options.primary,
				color: "#ffffff",
				borderWidth: 0,
				borderRadius: 16,
				":hover": { backgroundColor: options.buttonHover },
				":active": { backgroundColor: options.buttonActive },
				":disabled": {
					backgroundColor: options.buttonDisabledSurface ?? options.disabledSurface,
					color: options.disabledText
				}
			},
			text: { color: "#ffffff" }
		}
	});
}
function cloneColors(value, partial) {
	validateRecord(value, "UI theme colors");
	const colors = value;
	for (const [property, color] of Object.entries(colors)) if (!COLOR_PROPERTY_SET.has(property) || typeof color !== "string") throw new Error(`Invalid UI theme color "${property}".`);
	if (!partial) {
		for (const property of COLOR_PROPERTIES) if (typeof colors[property] !== "string") throw new Error(`Invalid UI theme color "${property}".`);
	}
	return { ...colors };
}
function cloneThemeStyles(value) {
	validateRecord(value, "UI theme styles");
	const styles = {};
	for (const [kind, style] of Object.entries(value)) {
		if (!UI_THEME_STYLE_ROLES.has(kind)) throw new Error(`Invalid UI theme style kind "${kind}".`);
		styles[kind] = cloneUIStyle(style);
	}
	return styles;
}
function validateThemeProperties(value) {
	for (const property of Object.keys(value)) if (!THEME_PROPERTIES.has(property)) throw new Error(`Invalid UI theme property "${property}".`);
}
function validateBorderRadius(value) {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error("Invalid UI theme property \"borderRadius\".");
	return value;
}
function validateRecord(value, name) {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be an object.`);
}
function deepFreeze(value) {
	if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
	for (const nested of Object.values(value)) deepFreeze(nested);
	return Object.freeze(value);
}
//#endregion
//#region src/ui/UIValidation.ts
function createUIValidationReport(ready, issues) {
	return {
		ready,
		ok: ready && issues.every((issue) => issue.severity !== "error"),
		issues: Object.freeze([...issues])
	};
}
//#endregion
//#region src/ui/UI.ts
let activeValidator;
/** Lightweight global UI settings. It does not load the rendering backend. */
var UI = class {
	constructor() {
		this.themeSnapshot = defaultTheme;
		this.themeRevision = 0;
	}
	get theme() {
		return this.themeSnapshot;
	}
	set theme(value) {
		const snapshot = typeof value === "string" ? uiThemePresets[value] : createThemeSnapshot(value);
		if (!snapshot) throw new Error(`Unknown UI theme preset "${value}".`);
		this.themeSnapshot = snapshot;
		this.themeRevision++;
	}
	setTheme(update) {
		this.themeSnapshot = updateThemeSnapshot(this.themeSnapshot, update);
		this.themeRevision++;
	}
	/** Validates the latest completed layout for one UI root or all UI roots. */
	validate(root) {
		return activeValidator?.(root) ?? createUIValidationReport(false, [{
			code: "not-ready",
			severity: "error",
			element: root,
			message: "The UI renderer has not completed a layout."
		}]);
	}
	/** Internal revision used by the private renderer. */
	get revision() {
		return this.themeRevision;
	}
};
const ui = new UI();
/** Installs the active renderer's mounted-layout validator. */
function setUIValidator(validator) {
	activeValidator = validator;
}
//#endregion
//#region src/ui/internal/UIRenderer.ts
const WARNED_OVERLAY_TRANSFORMS = /* @__PURE__ */ new WeakSet();
const IDENTITY_MATRIX = new THREE.Matrix4();
const OVERLAY_FORWARD = new THREE.Vector3();
const STALE_UI_LOAD = /* @__PURE__ */ new Error("Stale UI backend load.");
/** Owns all private UI rendering state for one Core lifecycle. */
var UIRenderer = class {
	constructor(interaction, loader = defaultLoader, reportError) {
		this.interaction = interaction;
		this.loader = loader;
		this.reportError = reportError;
		this.privateRoot = new THREE.Group();
		this.mounts = /* @__PURE__ */ new Map();
		this.roots = [];
		this.connectedRoots = /* @__PURE__ */ new Set();
		this.viewport = {
			width: 0,
			height: 0
		};
		this.backendState = { kind: "idle" };
		this.presentationState = {
			hovered: false,
			active: false,
			disabled: false,
			cursorPointCount: 0
		};
		this.presentationStateFor = (element, cursorPoints) => {
			const state = this.presentationState;
			state.hovered = this.interaction.isPointingAt(element);
			state.active = this.interaction.isSelectingAt(element);
			state.disabled = getSemanticControl(element)?.isDisabled() ?? false;
			state.cursorPointCount = cursorPoints ? this.interaction.writeCursorPointsAt(element, cursorPoints[0], cursorPoints[1]) : 0;
			return state;
		};
		this.validate = (root) => {
			if (this.backendState.kind !== "ready") return createUIValidationReport(false, [{
				code: "not-ready",
				severity: "error",
				element: root,
				message: "The UI renderer has not completed a layout."
			}]);
			const records = root ? [this.mounts.get(root)].filter((record) => record?.connected === true) : [...this.mounts.values()].filter((record) => record.connected);
			if (root && records.length === 0) return createUIValidationReport(true, [{
				code: "not-mounted",
				severity: "error",
				element: root,
				message: `${root.name} is not a mounted UI root.`
			}]);
			const issues = [];
			for (const record of records) issues.push(...record.mount.validate());
			return createUIValidationReport(true, issues);
		};
		this.privateRoot.name = "XR Blocks private UI";
		this.privateRoot.userData.xrblocksPrivate = true;
		this.interaction.setSelectionFocusHandler((target) => {
			if (this.backendState.kind === "ready") this.backendState.backend.handlePointerTarget?.(target);
		});
	}
	/** Mounts UI roots already connected when Core initializes. */
	async initialize(scene, renderer) {
		this.publicScene = scene;
		this.renderer = renderer;
		setUIValidator(this.validate);
		scene.add(this.privateRoot);
		if (this.collectConnectedRoots().length === 0) return;
		let backend;
		try {
			backend = await this.loadBackend();
		} catch (cause) {
			if (cause === STALE_UI_LOAD || this.backendState.kind === "disposed") return;
			setUIValidator(void 0);
			this.privateRoot.removeFromParent();
			this.publicScene = void 0;
			this.renderer = void 0;
			throw new Error("XR Blocks could not load the UI renderer during initialization.", { cause });
		}
		const currentRoots = this.collectConnectedRoots();
		for (let order = 0; order < currentRoots.length; order++) this.mount(currentRoots[order], backend, order);
	}
	/** Reconciles public UI and updates current hit geometry. */
	reconcile(deltaSeconds, camera) {
		if (!this.publicScene || !this.renderer) return;
		const roots = this.collectConnectedRoots();
		this.connectedRoots.clear();
		for (const root of roots) this.connectedRoots.add(root);
		for (const root of this.mounts.keys()) if (!this.connectedRoots.has(root)) this.disconnect(root);
		for (let order = 0; order < roots.length; order++) {
			const root = roots[order];
			const record = this.mounts.get(root);
			if (record && !record.connected) record.connected = true;
			if (record && record.order !== order) record.order = order;
		}
		if (roots.length === 0) return;
		if (this.backendState.kind === "idle") {
			const loadingRoots = [...roots];
			this.loadBackend().catch((error) => {
				if (error === STALE_UI_LOAD || this.backendState.kind === "disposed") return;
				if (this.reportError) for (const root of loadingRoots) this.reportError(error, root);
				else console.error("XR Blocks UI backend failed to load.", error);
			});
			return;
		}
		if (this.backendState.kind !== "ready") return;
		const backend = this.backendState.backend;
		for (let order = 0; order < roots.length; order++) {
			const root = roots[order];
			if (!this.mounts.has(root)) this.mount(root, backend, order);
		}
		this.reconcileMounts(deltaSeconds, camera);
	}
	/** Presents Interaction state resolved from the current hit geometry. */
	present() {
		for (const record of this.mounts.values()) {
			if (!record.connected) continue;
			record.mount.present(this.presentationStateFor);
		}
	}
	/** Cancels hit mappings and releases one disconnected public root. */
	release(root) {
		this.unmount(root);
	}
	dispose() {
		this.interaction.setSelectionFocusHandler();
		const backendState = this.backendState;
		this.backendState = { kind: "disposed" };
		for (const root of [...this.mounts.keys()]) this.unmount(root);
		if (backendState.kind === "ready") backendState.backend.dispose();
		this.roots.length = 0;
		this.connectedRoots.clear();
		this.viewport.width = 0;
		this.viewport.height = 0;
		setUIValidator(void 0);
		this.privateRoot.removeFromParent();
		this.publicScene = void 0;
		this.renderer = void 0;
	}
	async loadBackend() {
		const state = this.backendState;
		if (state.kind === "ready") return state.backend;
		if (state.kind === "loading") return state.promise;
		if (state.kind === "failed") throw state.error;
		if (state.kind === "disposed") throw STALE_UI_LOAD;
		const promise = Promise.resolve().then(() => this.createBackend());
		this.backendState = {
			kind: "loading",
			promise
		};
		return promise;
	}
	async createBackend() {
		try {
			const backend = (await this.loader()).createUIBackend();
			if (this.backendState.kind !== "loading" || !this.renderer) {
				backend.dispose();
				throw STALE_UI_LOAD;
			}
			try {
				if (this.renderer instanceof THREE.WebGLRenderer) backend.configureRenderer?.(this.renderer);
			} catch (error) {
				backend.dispose();
				throw error;
			}
			this.backendState = {
				kind: "ready",
				backend
			};
			return backend;
		} catch (error) {
			if (error !== STALE_UI_LOAD && this.backendState.kind === "loading") this.backendState = {
				kind: "failed",
				error
			};
			throw error;
		}
	}
	mount(root, backend, order) {
		const mount = backend.createMount(root);
		this.privateRoot.add(mount.object);
		this.mounts.set(root, {
			root,
			mount,
			unregisterHits: [],
			visible: effectiveVisible(root),
			connected: true,
			order
		});
	}
	disconnect(root) {
		const record = this.mounts.get(root);
		if (!record || !record.connected) return;
		record.connected = false;
		record.mount.object.visible = false;
		record.mount.setActive?.(false);
		this.interaction.cancelObject(root, "removed");
		for (const unregister of record.unregisterHits) unregister();
		record.unregisterHits = [];
	}
	unmount(root) {
		const record = this.mounts.get(root);
		if (!record) return;
		for (const unregister of record.unregisterHits) unregister();
		record.mount.object.removeFromParent();
		record.mount.dispose();
		this.mounts.delete(root);
	}
	reconcileMounts(deltaSeconds, camera) {
		this.viewport.width = window.innerWidth;
		this.viewport.height = window.innerHeight;
		for (const record of this.mounts.values()) record.mount.prepareCommit?.();
		for (const record of this.mounts.values()) {
			if (!record.connected) continue;
			const visible = effectiveVisible(record.root);
			if (record.visible && !visible) this.interaction.cancelObject(record.root, "hidden");
			record.visible = visible;
			record.mount.object.visible = visible;
			record.mount.setActive?.(visible);
			syncRootTransform(record.root, record.mount.object, camera);
			const mappings = record.mount.commit(ui.theme, this.viewport, record.order);
			if (mappings) {
				for (const unregister of record.unregisterHits) unregister();
				record.unregisterHits.length = 0;
				const overlay = getUIElementKind(record.root) === "overlay";
				for (const mapping of mappings) record.unregisterHits.push(this.registerHit(mapping, overlay));
			}
			record.mount.update(deltaSeconds);
		}
	}
	registerHit(mapping, overlay) {
		mapping.physical.userData.xrblocksHitOrder = mapping.physical.renderOrder;
		mapping.physical.userData.xrblocksOverlay = overlay;
		return this.interaction.registerHitSurface(mapping.physical, mapping.logical, mapping.options);
	}
	collectConnectedRoots() {
		collectUIRoots(this.roots);
		const scene = this.publicScene;
		if (!scene) {
			this.roots.length = 0;
			return this.roots;
		}
		let connectedCount = 0;
		for (const root of this.roots) if (isDescendantOf(root, scene)) this.roots[connectedCount++] = root;
		this.roots.length = connectedCount;
		return this.roots;
	}
};
function effectiveVisible(object) {
	let current = object;
	while (current) {
		if (!current.visible) return false;
		current = current.parent;
	}
	return true;
}
function isDescendantOf(object, ancestor) {
	let current = object;
	while (current) {
		if (current === ancestor) return true;
		current = current.parent;
	}
	return false;
}
function syncRootTransform(root, renderRoot, camera) {
	if (getUIElementKind(root) === "overlay") {
		root.updateWorldMatrix(true, false);
		if (!root.matrixWorld.equals(IDENTITY_MATRIX)) {
			if (!WARNED_OVERLAY_TRANSFORMS.has(root)) {
				WARNED_OVERLAY_TRANSFORMS.add(root);
				console.warn("UIOverlay ignores Object3D transforms.");
			}
		}
		if (camera) {
			camera.getWorldPosition(renderRoot.position);
			camera.getWorldQuaternion(renderRoot.quaternion);
			renderRoot.position.add(OVERLAY_FORWARD.set(0, 0, -1).applyQuaternion(renderRoot.quaternion));
		}
		renderRoot.scale.setScalar(.001);
		return;
	}
	root.updateWorldMatrix(true, false);
	renderRoot.matrix.copy(root.matrixWorld);
	renderRoot.matrixAutoUpdate = false;
	renderRoot.matrixWorldNeedsUpdate = true;
}
async function defaultLoader() {
	return import("./internal/UIKitBackend.js").then((n) => n.t);
}
//#endregion
//#region src/lighting/Lighting.ts
const DEBUGGING = false;
/**
* Lighting provides XR lighting capabilities within the XR Blocks framework.
* It uses webXR to propvide estimated lighting that matches the environment
* and supports casting shadows from the estimated light.
*/
var Lighting = class Lighting {
	/**
	* Lighting is a lightweight manager based on three.js to simply prototyping
	* with Lighting features within the XR Blocks framework.
	*/
	constructor() {
		this.dirLight = new THREE.DirectionalLight();
		this.ambientProbe = new THREE.LightProbe();
		this.ambientLight = new THREE.Vector3();
		this.shadowOpacity = 0;
		this.lightGroup = new THREE.Group();
		this.simulatorRunning = false;
		if (Lighting.instance) return Lighting.instance;
		Lighting.instance = this;
	}
	/**
	* Initializes the lighting module with the given options. Sets up lights and
	* shadows and adds necessary components to the scene.
	* @param lightingOptions - Lighting options.
	* @param renderer - Main renderer.
	* @param scene - Main scene.
	* @param depth - Depth manager.
	*/
	init(lightingOptions, renderer, scene, depth) {
		this.options = lightingOptions;
		this.depth = depth;
		if (this.options.enabled) {
			this.xrLight = new XREstimatedLight(renderer);
			if (this.options.castDirectionalLightShadow) {
				renderer.shadowMap.enabled = true;
				renderer.shadowMap.type = THREE.PCFShadowMap;
			}
			if (this.options.castDirectionalLightShadow) {
				const dirLight = this.dirLight;
				dirLight.castShadow = true;
				dirLight.shadow.mapSize.width = 2048;
				dirLight.shadow.mapSize.height = 2048;
				dirLight.shadow.camera.near = .3;
				dirLight.shadow.camera.far = 50;
				const cameraFrustrumRadius = 4;
				dirLight.shadow.camera.left = -4;
				dirLight.shadow.camera.right = cameraFrustrumRadius;
				dirLight.shadow.camera.top = cameraFrustrumRadius;
				dirLight.shadow.camera.bottom = -4;
				dirLight.shadow.blurSamples = 25;
				dirLight.shadow.radius = 5;
				dirLight.shadow.bias = 0;
				this.lightGroup.add(dirLight.target);
				if (this.options.debugging || DEBUGGING) scene.add(new THREE.CameraHelper(dirLight.shadow.camera));
			}
			if (this.options.useAmbientSH) this.lightGroup.add(this.ambientProbe);
			if (this.options.useDirectionalLight) this.lightGroup.add(this.dirLight);
			scene.add(this.lightGroup);
			this.xrLight.addEventListener("estimationend", () => {
				scene.remove(this.xrLight);
			});
		}
	}
	/**
	* Updates the lighting and shadow setup used to render. Called every frame
	* in the render loop.
	*/
	update() {
		if (this.options.enabled) {
			this.dirLight.position.copy(this.xrLight.directionalLight.position).multiplyScalar(20);
			this.dirLight.target.position.setScalar(0);
			this.dirLight.color = this.xrLight.directionalLight.color;
			this.dirLight.intensity = this.xrLight.directionalLight.intensity;
			this.ambientProbe.sh.copy(this.xrLight.lightProbe.sh);
			this.ambientProbe.intensity = this.xrLight.lightProbe.intensity;
			this.ambientLight.copy(this.xrLight.lightProbe.sh.coefficients[0]);
			if (this.simulatorRunning) {
				this.dirLight.position.set(-10, 10, -2);
				this.dirLight.target.position.set(0, 0, -.5);
				this.dirLight.color.setHex(16777215);
				this.dirLight.intensity = 3.8;
				this.ambientProbe.sh.fromArray([
					.22636516392230988,
					.2994415760040283,
					.2827182114124298,
					.03430574759840965,
					.029604531824588776,
					-.002050594426691532,
					.016114741563796997,
					.004344218410551548,
					.07621686905622482,
					.024204734712839127,
					-.02397896535694599,
					-.07645703107118607,
					.15790101885795593,
					.16706973314285278,
					.18418270349502563,
					-.13088643550872803,
					-.1461198776960373,
					-.1411236822605133,
					.04788218438625336,
					.08909443765878677,
					.10185115039348602,
					.020251473411917686,
					-.002100071171298623,
					-.06455840915441513,
					-.12393051385879517,
					-.05158703774213791,
					-.00532124936580658
				]);
				this.ambientProbe.intensity = 1;
				this.ambientLight.copy(this.ambientProbe.sh.coefficients[0]);
			}
			if (this.options.castDirectionalLightShadow && this.options.useDynamicSoftShadow) {
				const ambientLightIntensity = this.ambientLight;
				const ambientMonoIntensity = .21 * ambientLightIntensity.x + .72 * ambientLightIntensity.y + .07 * ambientLightIntensity.z;
				const mainLightIntensity = new THREE.Vector3(this.dirLight.color.r, this.dirLight.color.g, this.dirLight.color.b).multiplyScalar(this.dirLight.intensity);
				const ambientToMain = ambientMonoIntensity / (.21 * mainLightIntensity.x + .72 * mainLightIntensity.y + .07 * mainLightIntensity.z);
				this.dirLight.shadow.radius = Math.min(Math.max(1, ambientToMain * 30), 10);
				this.shadowOpacity = Math.max(Math.min((10 - ambientToMain * 30) * .7, .7), .3);
				if (this.depth?.options?.enabled && this.depth.options.depthMesh.enabled && this.depth.depthMesh?.material instanceof THREE.ShadowMaterial) this.depth.depthMesh.material.opacity = this.shadowOpacity;
			}
		}
		if (this.options.debugging || DEBUGGING) this.debugLog();
	}
	/**
	* Logs current estimate light parameters for debugging.
	*/
	debugLog() {
		console.log("Lighting.dirLight", this.dirLight);
		console.log("Lighting.ambientProbe", this.ambientProbe);
		console.log("Lighting.ambientLight", this.ambientLight);
	}
};
//#endregion
//#region src/sound/AudioPlayer.ts
const DEFAULT_SCHEDULE_AHEAD_TIME = 1;
var AudioPlayer = class extends Script {
	constructor(options = {}) {
		super();
		this.options = {};
		this.audioQueue = [];
		this.nextStartTime = 0;
		this.volume = 1;
		this.category = "speech";
		this.scheduleAheadTime = DEFAULT_SCHEDULE_AHEAD_TIME;
		this.options = {
			sampleRate: 24e3,
			channelCount: 1,
			...options
		};
		if (options.category) this.category = options.category;
	}
	/**
	* Sets the CategoryVolumes instance for this player to respect
	* master/category volumes
	*/
	setCategoryVolumes(categoryVolumes) {
		this.categoryVolumes = categoryVolumes;
		this.updateGainNodeVolume();
	}
	/**
	* Sets the specific volume for this player (0.0 to 1.0)
	*/
	setVolume(level) {
		this.volume = Math.max(0, Math.min(1, level));
		this.updateGainNodeVolume();
	}
	/**
	* Updates the gain node volume based on category volumes
	* Public so CoreSound can update it when master volume changes
	*/
	updateGainNodeVolume() {
		if (this.gainNode && this.categoryVolumes) {
			const effectiveVolume = this.categoryVolumes.getEffectiveVolume(this.category, this.volume);
			this.gainNode.gain.value = effectiveVolume;
		} else if (this.gainNode) this.gainNode.gain.value = this.volume;
	}
	async initializeAudioContext() {
		if (!this.audioContext) {
			this.audioContext = new AudioContext({ sampleRate: this.options.sampleRate });
			this.nextStartTime = this.audioContext.currentTime;
			this.gainNode = this.audioContext.createGain();
			this.gainNode.connect(this.audioContext.destination);
			this.updateGainNodeVolume();
		}
		if (this.audioContext.state === "suspended") await this.audioContext.resume();
	}
	async playAudioChunk(base64AudioData) {
		if (!base64AudioData) return;
		await this.initializeAudioContext();
		const arrayBuffer = this.base64ToArrayBuffer(base64AudioData);
		const audioBuffer = this.audioContext.createBuffer(this.options.channelCount, arrayBuffer.byteLength / 2, this.options.sampleRate);
		const channelData = audioBuffer.getChannelData(0);
		const int16View = new Int16Array(arrayBuffer);
		for (let i = 0; i < int16View.length; i++) channelData[i] = int16View[i] / 32768;
		this.audioQueue.push(audioBuffer);
		this.scheduleAudioBuffers();
	}
	scheduleAudioBuffers() {
		while (this.audioQueue.length > 0 && this.nextStartTime <= this.audioContext.currentTime + this.scheduleAheadTime) {
			const audioBuffer = this.audioQueue.shift();
			const currentTime = this.audioContext.currentTime;
			const startTime = Math.max(this.nextStartTime, currentTime);
			const source = this.audioContext.createBufferSource();
			source.buffer = audioBuffer;
			source.connect(this.gainNode || this.audioContext.destination);
			source.onended = () => this.scheduleAudioBuffers();
			source.start(startTime);
			this.nextStartTime = startTime + audioBuffer.duration;
		}
	}
	clearQueue() {
		this.audioQueue = [];
	}
	getIsPlaying() {
		return this.nextStartTime > this.audioContext.currentTime;
	}
	getQueueLength() {
		return this.audioQueue.length;
	}
	base64ToArrayBuffer(base64) {
		const binaryString = atob(base64);
		const bytes = new Uint8Array(binaryString.length);
		for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
		return bytes.buffer;
	}
	stop() {
		this.clearQueue();
		if (this.audioContext) {
			this.audioContext.close();
			this.audioContext = void 0;
			this.gainNode = void 0;
			this.nextStartTime = 0;
		}
	}
	static isSupported() {
		return !!("AudioContext" in window);
	}
	dispose() {
		this.stop();
		super.dispose();
	}
};
//#endregion
//#region src/sound/BackgroundMusic.ts
const MUSIC_LIBRARY_PATH = XR_BLOCKS_ASSETS_PATH + "musicLibrary/";
const musicLibrary = {
	ambient: MUSIC_LIBRARY_PATH + "AmbientLoop.opus",
	background: MUSIC_LIBRARY_PATH + "BackgroundMusic4.mp3",
	buttonHover: MUSIC_LIBRARY_PATH + "ButtonHover.opus",
	buttonPress: MUSIC_LIBRARY_PATH + "ButtonPress.opus",
	menuDismiss: MUSIC_LIBRARY_PATH + "MenuDismiss.opus"
};
var BackgroundMusic = class extends Script {
	constructor(listener, categoryVolumes) {
		super();
		this.listener = listener;
		this.categoryVolumes = categoryVolumes;
		this.audioLoader = new THREE.AudioLoader();
		this.currentAudio = null;
		this.isPlaying = false;
		this.musicLibrary = musicLibrary;
		this.specificVolume = .5;
		this.musicCategory = "music";
	}
	setVolume(level) {
		this.specificVolume = THREE.MathUtils.clamp(level, 0, 1);
		if (this.currentAudio && this.isPlaying && this.categoryVolumes) {
			const effectiveVolume = this.categoryVolumes.getEffectiveVolume(this.musicCategory, this.specificVolume);
			this.currentAudio.setVolume(effectiveVolume);
			console.log(`BackgroundMusic volume updated to: ${effectiveVolume} (specific: ${this.specificVolume})`);
		}
	}
	playMusic(musicKey, category = "music") {
		if (!this.categoryVolumes || !this.listener || !this.audioLoader) {
			console.error("BackgroundMusic not properly initialized.");
			return;
		}
		const soundPath = this.musicLibrary[musicKey];
		if (!soundPath) {
			console.error(`BackgroundMusic: Music key "${musicKey}" not found.`);
			return;
		}
		this.stopMusic();
		console.log(`BackgroundMusic: Loading sound: ${soundPath}`);
		this.musicCategory = category;
		const listener = this.listener;
		this.audioLoader.load(soundPath, (buffer) => {
			console.log(`BackgroundMusic: Successfully loaded ${soundPath}`);
			const audio = new THREE.Audio(listener);
			audio.setBuffer(buffer);
			audio.setLoop(this.musicCategory === "music" || this.musicCategory === "ambient");
			const effectiveVolume = this.categoryVolumes.getEffectiveVolume(this.musicCategory, this.specificVolume);
			audio.setVolume(effectiveVolume);
			console.log(`BackgroundMusic: Setting volume for "${musicKey}" to ${effectiveVolume}`);
			audio.play();
			this.currentAudio = audio;
			this.isPlaying = true;
			console.log(`BackgroundMusic: Playing "${musicKey}" in category "${this.musicCategory}"`);
		}, (xhr) => {
			console.log(`BackgroundMusic: Loading ${soundPath} - ${(xhr.loaded / xhr.total * 100).toFixed(0)}% loaded`);
		}, (error) => {
			console.error(`BackgroundMusic: Error loading sound ${soundPath}:`, error);
			this.currentAudio = null;
			this.isPlaying = false;
		});
	}
	stopMusic() {
		if (this.currentAudio && this.isPlaying) {
			console.log("BackgroundMusic: Stopping current audio.");
			this.currentAudio.stop();
		}
		this.currentAudio = null;
		this.isPlaying = false;
	}
	destroy() {
		console.log("BackgroundMusic Destroying...");
		this.stopMusic();
	}
};
//#endregion
//#region src/sound/CategoryVolumes.ts
let VolumeCategory = /* @__PURE__ */ function(VolumeCategory) {
	VolumeCategory["music"] = "music";
	VolumeCategory["sfx"] = "sfx";
	VolumeCategory["speech"] = "speech";
	VolumeCategory["ui"] = "ui";
	return VolumeCategory;
}({});
var CategoryVolumes = class {
	constructor() {
		this.isMuted = false;
		this.masterVolume = 1;
		this.volumes = Object.fromEntries(Object.values(VolumeCategory).map((cat) => [cat, 1]));
	}
	getCategoryVolume(category) {
		return this.volumes[category] ?? 1;
	}
	getEffectiveVolume(category, specificVolume = 1) {
		if (this.isMuted) return 0;
		const categoryVol = this.getCategoryVolume(category);
		const clampedSpecificVolume = THREE.MathUtils.clamp(specificVolume, 0, 1);
		return this.masterVolume * categoryVol * clampedSpecificVolume;
	}
};
//#endregion
//#region src/sound/SoundSynthesizer.ts
/**
* Defines common UI sound presets with their default parameters.
* Each preset specifies frequency, duration, and waveform type.
*/
const SOUND_PRESETS = {
	BEEP: {
		frequency: 1e3,
		duration: .07,
		waveformType: "sine"
	},
	CLICK: [{
		frequency: 1500,
		duration: .02,
		waveformType: "triangle",
		delay: 0
	}],
	ACTIVATE: [{
		frequency: 800,
		duration: .05,
		waveformType: "sine",
		delay: 0
	}, {
		frequency: 1200,
		duration: .07,
		waveformType: "sine",
		delay: 50
	}],
	DEACTIVATE: [{
		frequency: 1200,
		duration: .05,
		waveformType: "sine",
		delay: 0
	}, {
		frequency: 800,
		duration: .07,
		waveformType: "sine",
		delay: 50
	}]
};
var SoundSynthesizer = class extends Script {
	constructor(..._args) {
		super(..._args);
		this.isInitialized = false;
		this.debug = false;
	}
	/**
	* Initializes the AudioContext.
	*/
	_initAudioContext() {
		if (!this.isInitialized) {
			this.audioContext = new AudioContext();
			this.isInitialized = true;
			if (this.debug) console.log("SoundSynthesizer: AudioContext initialized.");
		}
	}
	/**
	* Plays a single tone with specified parameters.
	* @param frequency - The frequency of the tone in Hz.
	* @param duration - The duration of the tone in seconds.
	* @param volume - The volume of the tone (0.0 to 1.0).
	* @param waveformType - The type of waveform ('sine', 'square', 'sawtooth',
	*     'triangle').
	*/
	playTone(frequency, duration, volume, waveformType) {
		this._initAudioContext();
		if (!this.audioContext) {
			console.error("SoundSynthesizer: AudioContext not available. Cannot play tone.");
			return;
		}
		const oscillator = this.audioContext.createOscillator();
		oscillator.type = waveformType;
		oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
		const gainNode = this.audioContext.createGain();
		gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
		oscillator.connect(gainNode);
		gainNode.connect(this.audioContext.destination);
		oscillator.start();
		const stopTime = this.audioContext.currentTime + duration;
		const fadeOutTime = Math.max(.01, duration * .1);
		gainNode.gain.exponentialRampToValueAtTime(1e-5, stopTime - fadeOutTime);
		oscillator.stop(stopTime);
	}
	/**
	* Plays a predefined sound preset.
	* @param presetName - The name of the preset (e.g., 'BEEP', 'CLICK',
	*     'ACTIVATE', 'DEACTIVATE').
	* @param volume - The volume for the preset (overrides default
	*     if present, otherwise uses this).
	*/
	playPresetTone(presetName, volume = .5) {
		const preset = SOUND_PRESETS[presetName];
		if (!preset) {
			console.warn(`SoundSynthesizer: Preset '${presetName}' not found.`);
			return;
		}
		if (!Array.isArray(preset)) {
			const tone = preset;
			this.playTone(tone.frequency, tone.duration, volume, tone.waveformType);
		} else preset.forEach((toneConfig) => {
			setTimeout(() => {
				this.playTone(toneConfig.frequency, toneConfig.duration, volume, toneConfig.waveformType);
			}, toneConfig.delay || 0);
		});
	}
};
//#endregion
//#region src/sound/SpatialAudio.ts
const spatialSoundLibrary = {
	ambient: "musicLibrary/AmbientLoop.opus",
	buttonHover: "musicLibrary/ButtonHover.opus",
	paintOneShot1: "musicLibrary/PaintOneShot1.opus"
};
let soundIdCounter = 0;
var SpatialAudio = class extends Script {
	constructor(listener, categoryVolumes) {
		super();
		this.listener = listener;
		this.categoryVolumes = categoryVolumes;
		this.audioLoader = new THREE.AudioLoader();
		this.soundLibrary = spatialSoundLibrary;
		this.activeSounds = /* @__PURE__ */ new Map();
		this.specificVolume = 1;
		this.category = "sfx";
		this.defaultRefDistance = 1;
		this.defaultRolloffFactor = 1;
	}
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
	playSoundAtObject(soundKey, targetObject, options = {}) {
		if (!this.listener || !this.audioLoader || !targetObject) {
			console.error("SpatialAudio not properly initialized or targetObject missing.");
			return null;
		}
		const soundPath = this.soundLibrary[soundKey];
		if (!soundPath) {
			console.error(`SpatialAudio: Sound key "${soundKey}" not found.`);
			return null;
		}
		const soundId = ++soundIdCounter;
		const specificVolume = options.volume !== void 0 ? options.volume : this.specificVolume;
		const loop = options.loop || false;
		const refDistance = options.refDistance !== void 0 ? options.refDistance : this.defaultRefDistance;
		const rolloffFactor = options.rolloffFactor !== void 0 ? options.rolloffFactor : this.defaultRolloffFactor;
		console.log(`SpatialAudio: Loading sound "${soundKey}" (${soundPath})`);
		this.audioLoader.load(soundPath, (buffer) => {
			console.log(`SpatialAudio: Successfully loaded "${soundKey}"`);
			if (!this.listener) {
				console.error("SpatialAudio: Listener lost during load.");
				return;
			}
			const audio = new THREE.PositionalAudio(this.listener);
			audio.setBuffer(buffer);
			audio.setLoop(loop);
			audio.setRefDistance(refDistance);
			audio.setRolloffFactor(rolloffFactor);
			const effectiveVolume = this.categoryVolumes.getEffectiveVolume(this.category, specificVolume);
			audio.setVolume(effectiveVolume);
			targetObject.add(audio);
			this.activeSounds.set(soundId, {
				audio,
				target: targetObject,
				options
			});
			if (!loop) audio.onEnded = () => {
				console.log(`SpatialAudio: Sound "${soundKey}" (ID: ${soundId}) ended.`);
				this._cleanupSound(soundId);
				if (options.onEnded && typeof options.onEnded === "function") options.onEnded();
				audio.onEnded = () => {};
			};
			audio.play();
			console.log(`SpatialAudio: Playing "${soundKey}" (ID: ${soundId}) at object ${targetObject.name || targetObject.uuid}, Volume: ${effectiveVolume}`);
		}, (xhr) => {
			console.log(`SpatialAudio: Loading "${soundKey}" - ${(xhr.loaded / xhr.total * 100).toFixed(0)}% loaded`);
		}, (error) => {
			console.error(`SpatialAudio: Error loading sound "${soundKey}":`, error);
			this.activeSounds.delete(soundId);
		});
		return soundId;
	}
	/**
	* Stops a specific sound instance by its ID.
	* @param soundId - The ID returned by playSoundAtObject.
	*/
	stopSound(soundId) {
		const soundData = this.activeSounds.get(soundId);
		if (soundData) {
			console.log(`SpatialAudio: Stopping sound ID: ${soundId}`);
			if (soundData.audio.isPlaying) soundData.audio.stop();
			this._cleanupSound(soundId);
		} else console.warn(`SpatialAudio: Sound ID ${soundId} not found for stopping.`);
	}
	/**
	* Internal method to remove sound from object and map.
	* @param soundId - id
	*/
	_cleanupSound(soundId) {
		const soundData = this.activeSounds.get(soundId);
		if (soundData) {
			if (soundData.audio.isPlaying) try {
				soundData.audio.stop();
			} catch {}
			if (soundData.target && soundData.audio.parent === soundData.target) soundData.target.remove(soundData.audio);
			this.activeSounds.delete(soundId);
			console.log(`SpatialAudio: Cleaned up sound ID: ${soundId}`);
		}
	}
	/**
	* Sets the base specific volume for subsequently played spatial sounds.
	* Does NOT affect currently playing sounds (use updateAllVolumes for that).
	* @param level - Volume level (0.0 to 1.0).
	*/
	setVolume(level) {
		this.specificVolume = THREE.MathUtils.clamp(level, 0, 1);
		console.log(`SpatialAudio default specific volume set to: ${this.specificVolume}`);
	}
	/**
	* Updates the volume of all currently playing spatial sounds managed by this
	* instance.
	*/
	updateAllVolumes() {
		if (!this.categoryVolumes) return;
		console.log(`SpatialAudio: Updating volumes for ${this.activeSounds.size} active sounds.`);
		this.activeSounds.forEach((soundData) => {
			const specificVolume = soundData.options.volume !== void 0 ? soundData.options.volume : this.specificVolume;
			const effectiveVolume = this.categoryVolumes.getEffectiveVolume(this.category, specificVolume);
			soundData.audio.setVolume(effectiveVolume);
		});
	}
	destroy() {
		console.log("SpatialAudio Destroying...");
		Array.from(this.activeSounds.keys()).forEach((id) => this.stopSound(id));
		this.activeSounds.clear();
		console.log("SpatialAudio Destroyed.");
	}
};
//#endregion
//#region src/sound/SpeechRecognizer.ts
var SpeechRecognizer = class extends Script {
	static {
		this.dependencies = { soundOptions: SoundOptions };
	}
	constructor(soundSynthesizer) {
		super();
		this.soundSynthesizer = soundSynthesizer;
		this.isListening = false;
		this.lastTranscript = "";
		this.lastConfidence = 0;
		this.playActivationSounds = false;
		this._handleStart = () => {
			console.debug("SpeechRecognizer: Listening started.");
			this.dispatchEvent({ type: "start" });
			if (this.playActivationSounds) this.soundSynthesizer.playPresetTone("ACTIVATE");
		};
		this._handleResult = (event) => {
			let interimTranscript = "";
			let finalTranscript = "";
			let currentConfidence = 0;
			for (let i = event.resultIndex; i < event.results.length; ++i) {
				const result = event.results[i];
				const transcript = result[0].transcript;
				if (result.isFinal) {
					finalTranscript += transcript;
					currentConfidence = result[0].confidence;
				} else interimTranscript += transcript;
			}
			this.lastTranscript = finalTranscript.trim() || interimTranscript.trim();
			this.lastConfidence = currentConfidence;
			this.lastCommand = void 0;
			if (finalTranscript && this.options.commands.length > 0) {
				const upperTranscript = finalTranscript.trim().toUpperCase();
				for (const command of this.options.commands) if (upperTranscript.includes(command.toUpperCase()) && this.lastConfidence >= this.options.commandConfidenceThreshold) {
					this.lastCommand = command;
					console.debug(`SpeechRecognizer Detected Command: ${this.lastCommand}`);
					break;
				}
			}
			this.dispatchEvent({
				type: "result",
				originalEvent: event,
				transcript: this.lastTranscript,
				confidence: this.lastConfidence,
				command: this.lastCommand,
				isFinal: !!finalTranscript
			});
		};
		this._handleEnd = () => {
			this.isListening = false;
			this.dispatchEvent({ type: "end" });
			if (this.options.continuous && this.error !== "aborted" && this.error !== "no-speech") {
				console.debug("SpeechRecognizer: Restarting continuous listening...");
				setTimeout(() => this.start(), 100);
			} else if (this.playActivationSounds) this.soundSynthesizer.playPresetTone("DEACTIVATE");
		};
		this._handleError = (event) => {
			console.error("SpeechRecognizer: Error:", event.error);
			this.error = event.error;
			this.isListening = false;
			this.dispatchEvent({
				type: "error",
				error: event.error
			});
		};
	}
	init({ soundOptions }) {
		this.options = soundOptions.speechRecognizer;
		const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
		if (!SpeechRecognitionAPI) {
			console.warn("SpeechRecognizer: Speech Recognition API not supported in this browser.");
			this.error = "API not supported";
			return;
		}
		this.recognition = new SpeechRecognitionAPI();
		this.recognition.lang = this.options.lang;
		this.recognition.continuous = this.options.continuous;
		this.recognition.interimResults = this.options.interimResults;
		this.recognition.onstart = this._handleStart;
		this.recognition.onresult = this._handleResult;
		this.recognition.onend = this._handleEnd;
		this.recognition.onerror = this._handleError;
	}
	onSimulatorStarted() {
		this.playActivationSounds = this.options.playSimulatorActivationSounds;
	}
	start() {
		if (!this.recognition) {
			console.error("SpeechRecognizer: Not initialized.");
			return;
		}
		if (this.isListening) {
			console.warn("SpeechRecognizer: Already listening.");
			return;
		}
		try {
			this.lastTranscript = "";
			this.lastCommand = void 0;
			this.lastConfidence = 0;
			this.error = void 0;
			this.recognition.start();
			this.isListening = true;
			console.debug("SpeechRecognizer: Listening started.");
		} catch (e) {
			console.error("SpeechRecognizer: Error starting recognition:", e);
			this.error = e.message || "Start failed";
			this.isListening = false;
			this.dispatchEvent({
				type: "error",
				error: this.error
			});
		}
	}
	stop() {
		if (!this.recognition || !this.isListening) return;
		try {
			this.recognition.stop();
			console.debug("SpeechRecognizer: Stop requested.");
		} catch (e) {
			console.error("SpeechRecognizer: Error stopping recognition:", e);
			this.error = e.message || "Stop failed";
			this.isListening = false;
		}
	}
	getLastTranscript() {
		return this.lastTranscript;
	}
	getLastCommand() {
		return this.lastCommand;
	}
	getLastConfidence() {
		return this.lastConfidence;
	}
	destroy() {
		this.stop();
		if (this.recognition) {
			this.recognition.onstart = null;
			this.recognition.onresult = null;
			this.recognition.onend = null;
			this.recognition.onerror = null;
			this.recognition = void 0;
		}
	}
};
//#endregion
//#region src/sound/SpeechSynthesizer.ts
var SpeechSynthesizer = class extends Script {
	static {
		this.dependencies = { soundOptions: SoundOptions };
	}
	constructor(categoryVolumes, onStartCallback = () => {}, onEndCallback = () => {}, onErrorCallback = (_) => {}) {
		super();
		this.categoryVolumes = categoryVolumes;
		this.onStartCallback = onStartCallback;
		this.onEndCallback = onEndCallback;
		this.onErrorCallback = onErrorCallback;
		this.synth = window.speechSynthesis;
		this.voices = [];
		this.isSpeaking = false;
		this.debug = false;
		this.specificVolume = 1;
		this.speechCategory = "speech";
		this.loadVoices = () => {
			if (!this.synth) return;
			this.voices = this.synth.getVoices();
			if (this.debug) console.log("SpeechSynthesizer: Voices loaded:", this.voices.length);
			this.selectedVoice = this.voices.find((voice) => voice.name.includes("Google") && voice.lang.startsWith("en")) || this.voices.find((voice) => voice.lang.startsWith("en"));
			if (this.selectedVoice) {
				if (this.debug) console.log("SpeechSynthesizer: Selected voice:", this.selectedVoice.name);
			} else console.warn("SpeechSynthesizer: No suitable default voice found.");
		};
		if (!this.synth) console.error("SpeechSynthesizer: Speech Synthesis API not supported.");
		else {
			this.loadVoices();
			if (this.synth.onvoiceschanged !== void 0) this.synth.onvoiceschanged = this.loadVoices;
		}
		if (!this.categoryVolumes && this.synth) console.warn("SpeechSynthesizer: CategoryVolumes not found. Volume control will use specificVolume only.");
	}
	init({ soundOptions }) {
		this.options = soundOptions.speechSynthesizer;
		if (this.debug) console.log("SpeechSynthesizer initialized.");
	}
	setVolume(level) {
		this.specificVolume = THREE.MathUtils.clamp(level, 0, 1);
		console.log(`SpeechSynthesizer specific volume set to: ${this.specificVolume}`);
	}
	speak(text, lang = "en-US", pitch = 1, rate = 1) {
		return new Promise((resolve, reject) => {
			if (!this.synth) {
				console.warn("SpeechSynthesizer: Cannot speak. API not supported.");
				return reject(/* @__PURE__ */ new Error("Speech Synthesis API not supported."));
			}
			if (this.isSpeaking) {
				if (this.options.allowInterruptions) {
					console.warn("SpeechSynthesizer: Already speaking. Interrupting current speech.");
					this.cancel();
				} else {
					const errorMsg = "Already speaking and interruptions are not allowed.";
					console.warn(`SpeechSynthesizer: ${errorMsg}`);
					return reject(/* @__PURE__ */ new Error(errorMsg));
				}
			}
			const utterance = new SpeechSynthesisUtterance(text);
			utterance.onstart = () => {
				this.isSpeaking = true;
				console.log("SpeechSynthesizer: Speaking started.");
				if (this.onStartCallback) this.onStartCallback();
			};
			utterance.onend = () => {
				this.isSpeaking = false;
				console.log("SpeechSynthesizer: Speaking ended.");
				if (this.onEndCallback) this.onEndCallback();
				resolve();
			};
			utterance.onerror = (event) => {
				if (this.options.allowInterruptions && (event.error === "interrupted" || event.error === "canceled")) {
					console.warn(`SpeechSynthesizer: Speech utterance interrupted: ${event.error}`);
					return;
				}
				console.error("SpeechSynthesizer: Error occurred:", event.error);
				this.isSpeaking = false;
				this.onErrorCallback(/* @__PURE__ */ new Error(`Speech synthesis error code ${event.error}`));
				reject(event.error);
			};
			let voice = this.selectedVoice;
			if (!voice || !voice.lang.startsWith(lang.substring(0, 2))) voice = this.voices.find((v) => v.lang === lang && v.name.includes("Google")) || this.voices.find((v) => v.lang.startsWith(lang.substring(0, 2)) && v.name.includes("Google")) || this.voices.find((v) => v.lang === lang) || this.voices.find((v) => v.lang.startsWith(lang.substring(0, 2)));
			if (voice) {
				utterance.voice = voice;
				console.log(`SpeechSynthesizer: Using voice: ${voice.name} for lang ${lang}`);
			} else {
				utterance.lang = lang;
				console.warn(`SpeechSynthesizer: No specific voice found for lang ${lang}. Using browser default.`);
			}
			utterance.pitch = THREE.MathUtils.clamp(pitch, 0, 2);
			utterance.rate = THREE.MathUtils.clamp(rate, .1, 10);
			let effectiveVolume = this.specificVolume;
			if (this.categoryVolumes) effectiveVolume = this.categoryVolumes.getEffectiveVolume(this.speechCategory, this.specificVolume);
			else effectiveVolume = THREE.MathUtils.clamp(this.specificVolume, 0, 1);
			utterance.volume = effectiveVolume;
			console.log(`SpeechSynthesizer: Setting utterance volume to ${effectiveVolume}`);
			if (this.onBoundaryCallback) utterance.onboundary = (event) => this.onBoundaryCallback?.(event.charIndex);
			this.synth.speak(utterance);
		});
	}
	tts(text, lang, pitch, rate) {
		this.speak(text, lang, pitch, rate);
	}
	cancel() {
		if (this.synth && this.synth.speaking) {
			this.synth.cancel();
			this.isSpeaking = false;
			console.log("SpeechSynthesizer: Speech cancelled.");
		}
	}
	destroy() {
		this.cancel();
		if (this.synth && this.synth.onvoiceschanged !== void 0) this.synth.onvoiceschanged = null;
		this.voices = [];
		console.log("SpeechSynthesizer destroyed.");
	}
};
//#endregion
//#region src/sound/CoreSound.ts
var CoreSound = class extends Script {
	constructor(..._args) {
		super(..._args);
		this.type = "CoreSound";
		this.name = "Core Sound";
		this.categoryVolumes = new CategoryVolumes();
		this.soundSynthesizer = new SoundSynthesizer();
		this.listener = new THREE.AudioListener();
	}
	static {
		this.dependencies = {
			camera: THREE.Camera,
			soundOptions: SoundOptions
		};
	}
	init({ camera, soundOptions }) {
		this.options = soundOptions;
		this.backgroundMusic = new BackgroundMusic(this.listener, this.categoryVolumes);
		this.spatialAudio = new SpatialAudio(this.listener, this.categoryVolumes);
		this.audioListener = new AudioListener();
		this.audioPlayer = new AudioPlayer({ sampleRate: 48e3 });
		this.audioPlayer.setCategoryVolumes(this.categoryVolumes);
		camera.add(this.listener);
		this.add(this.backgroundMusic);
		this.add(this.spatialAudio);
		this.add(this.audioListener);
		this.add(this.audioPlayer);
		this.add(this.soundSynthesizer);
		if (this.options.speechRecognizer.enabled) {
			this.speechRecognizer = new SpeechRecognizer(this.soundSynthesizer);
			this.add(this.speechRecognizer);
		}
		if (this.options.speechSynthesizer.enabled) {
			this.speechSynthesizer = new SpeechSynthesizer(this.categoryVolumes);
			this.add(this.speechSynthesizer);
		}
	}
	getAudioListener() {
		return this.listener;
	}
	setMasterVolume(level) {
		this.categoryVolumes.masterVolume = THREE.MathUtils.clamp(level, 0, 1);
		this.audioPlayer?.updateGainNodeVolume();
	}
	getMasterVolume() {
		return this.categoryVolumes.isMuted ? 0 : this.categoryVolumes.masterVolume;
	}
	setCategoryVolume(category, level) {
		if (category in this.categoryVolumes.volumes) this.categoryVolumes.volumes[category] = THREE.MathUtils.clamp(level, 0, 1);
	}
	getCategoryVolume(category) {
		return category in this.categoryVolumes.volumes ? this.categoryVolumes.volumes[category] : 1;
	}
	async enableAudio(options = {}) {
		const { streamToAI = true, accumulate = false } = options;
		if (streamToAI && this.speechRecognizer?.isListening) {
			console.log("Disabling SpeechRecognizer while streaming audio.");
			this.speechRecognizer.stop();
		}
		this.audioListener.setAIStreaming(streamToAI);
		await this.audioListener.startCapture({ accumulate });
	}
	disableAudio() {
		this.audioListener?.stopCapture();
	}
	/**
	* Starts recording audio with chunk accumulation
	*/
	async startRecording() {
		await this.audioListener.startCapture({ accumulate: true });
	}
	/**
	* Stops recording and returns the accumulated audio buffer
	*/
	stopRecording() {
		const buffer = this.audioListener.getAccumulatedBuffer();
		this.audioListener.stopCapture();
		return buffer;
	}
	/**
	* Gets the accumulated recording buffer without stopping
	*/
	getRecordedBuffer() {
		return this.audioListener.getAccumulatedBuffer();
	}
	/**
	* Clears the accumulated recording buffer
	*/
	clearRecordedBuffer() {
		this.audioListener.clearAccumulatedBuffer();
	}
	/**
	* Gets the sample rate being used for recording
	*/
	getRecordingSampleRate() {
		return this.audioListener.audioContext?.sampleRate || 48e3;
	}
	setAIStreaming(enabled) {
		this.audioListener?.setAIStreaming(enabled);
	}
	isAIStreamingEnabled() {
		return this.audioListener?.aiService !== null;
	}
	async playAIAudio(base64AudioData) {
		if (this.audioPlayer["options"].sampleRate !== 24e3) {
			this.audioPlayer["options"].sampleRate = 24e3;
			if (this.audioPlayer["audioContext"]) this.audioPlayer.stop();
		}
		await this.audioPlayer.playAudioChunk(base64AudioData);
	}
	stopAIAudio() {
		this.audioPlayer?.clearQueue();
	}
	isAIAudioPlaying() {
		return this.audioPlayer?.getIsPlaying();
	}
	/**
	* Plays a raw audio buffer (Int16 PCM data) with proper sample rate
	*/
	async playRecordedAudio(audioBuffer, sampleRate) {
		if (!audioBuffer) return;
		if (sampleRate && sampleRate !== this.audioPlayer["options"].sampleRate) {
			this.audioPlayer["options"].sampleRate = sampleRate;
			this.audioPlayer.stop();
		}
		const bytes = new Uint8Array(audioBuffer);
		let binary = "";
		for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
		const base64Audio = btoa(binary);
		await this.audioPlayer.playAudioChunk(base64Audio);
	}
	isAudioEnabled() {
		return this.audioListener?.getIsCapturing();
	}
	getLatestAudioBuffer() {
		return this.audioListener?.getLatestAudioBuffer();
	}
	clearLatestAudioBuffer() {
		this.audioListener?.clearLatestAudioBuffer();
	}
	getEffectiveVolume(category, specificVolume = 1) {
		return this.categoryVolumes.getEffectiveVolume(category, specificVolume);
	}
	muteAll() {
		this.categoryVolumes.isMuted = true;
	}
	unmuteAll() {
		this.categoryVolumes.isMuted = false;
	}
	destroy() {
		this.backgroundMusic?.destroy();
		this.spatialAudio?.destroy();
		this.speechRecognizer?.destroy();
		this.speechSynthesizer?.destroy();
		this.audioListener?.dispose();
		this.audioPlayer?.dispose();
		this.listener?.parent?.remove(this.listener);
	}
};
//#endregion
//#region src/utils/CreateLoadingSpinner.ts
var LoadingSpinner = class LoadingSpinner extends HTMLElement {
	static {
		this.style = `
    /* Styles for the wrapper that covers the screen */
    .wrapper {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.1);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 9999;
      transition: visibility 0s, opacity 0.2s linear;
    }

    /* The spinning circle */
    .spinner {
      border: 8px solid rgba(255, 255, 255, 0.3);
      border-left-color: #ffffff;
      border-radius: 50%;
      width: 60px;
      height: 60px;
      animation: spin 1s linear infinite;
    }

    /* The animation is safely scoped inside the shadow DOM */
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }`;
	}
	static {
		this.innerHTML = `
    <style>
      ${LoadingSpinner.style}
    </style>
    <div class="wrapper">
      <div class="spinner"></div>
    </div>
  `;
	}
	connectedCallback() {
		const shadowRoot = this.attachShadow({ mode: "open" });
		shadowRoot.innerHTML = LoadingSpinner.innerHTML;
	}
};
if (!customElements.get("xb-blocks-loading-spinner")) customElements.define("xb-blocks-loading-spinner", LoadingSpinner);
function createLoadingSpinner() {
	return document.body.appendChild(document.createElement("xb-blocks-loading-spinner"));
}
//#endregion
//#region src/utils/LoadingSpinnerManager.ts
/**
* Manages the global THREE.DefaultLoadingManager instance for
* XRBlocks and handles communication of loading progress to the parent iframe.
* This module controls the visibility of a loading spinner
* in the DOM based on loading events.
*
* Import the single instance
* `loadingSpinnerManager` to use it throughout the application.
*/
var LoadingSpinnerManager = class {
	constructor() {
		this.isLoading = false;
		this.setupCallbacks();
	}
	showSpinner() {
		if (!this.spinnerElement) this.spinnerElement = createLoadingSpinner();
	}
	hideSpinner() {
		if (this.spinnerElement) {
			this.spinnerElement.remove();
			this.spinnerElement = void 0;
		}
	}
	setupCallbacks() {
		/**
		* Callback function for when the first loading item starts.
		* It sends an initial 'XR_LOADING_PROGRESS' message to the parent window.
		* Note: The spinner is now shown via a manual call to showSpinner()
		* @param _url - The URL of the item being loaded.
		* @param itemsLoaded - The number of items loaded so far.
		* @param itemsTotal - The total number of items to load.
		*/
		THREE.DefaultLoadingManager.onStart = (_url, itemsLoaded, itemsTotal) => {
			this.isLoading = true;
			window.parent.postMessage({
				type: "XR_LOADING_PROGRESS",
				payload: {
					progress: itemsLoaded / itemsTotal,
					message: "Loading assets..."
				}
			}, "*");
		};
		/**
		* Callback function for when a loading item progresses.
		* It sends a 'XR_LOADING_PROGRESS' message to the parent window with
		* updated progress.
		* @param _url - The URL of the item currently in progress.
		* @param itemsLoaded - The number of items loaded so far.
		* @param itemsTotal - The total number of items to load.
		*/
		THREE.DefaultLoadingManager.onProgress = (_url, itemsLoaded, itemsTotal) => {
			window.parent.postMessage({
				type: "XR_LOADING_PROGRESS",
				payload: {
					progress: itemsLoaded / itemsTotal,
					message: `Loading ${Math.round(itemsLoaded / itemsTotal * 100)}%`
				}
			}, "*");
		};
		/**
		* Callback function for when all loading items are complete.
		* It removes the loading spinner from the DOM and sends an
		* 'XR_LOADING_COMPLETE' message to the parent window.
		*/
		THREE.DefaultLoadingManager.onLoad = () => {
			this.isLoading = false;
			this.hideSpinner();
			window.parent.postMessage({ type: "XR_LOADING_COMPLETE" }, "*");
		};
		/**
		* Callback function for when a loading item encounters an error.
		* It removes the loading spinner from the DOM and sends an
		* 'XR_LOADING_ERROR' message to the parent window.
		* @param url - The URL of the item that failed to load.
		*/
		THREE.DefaultLoadingManager.onError = (url) => {
			this.isLoading = false;
			console.warn("XRBlocks: Error loading: " + url);
			this.hideSpinner();
			window.parent.postMessage({
				type: "XR_LOADING_ERROR",
				payload: {
					url,
					message: "Failed to load assets."
				}
			}, "*");
		};
	}
};
const loadingSpinnerManager = new LoadingSpinnerManager();
//#endregion
//#region src/core/components/XRTransition.ts
/**
* Manages smooth transitions between AR (transparent) and VR (colored)
* backgrounds within an active XR session.
*/
var XRTransition = class extends MeshScript {
	static {
		this.dependencies = {
			renderer: THREE.WebGLRenderer,
			camera: THREE.Camera,
			timer: THREE.Timer,
			scene: THREE.Scene,
			options: Options
		};
	}
	constructor() {
		const geometry = new THREE.SphereGeometry(1, 64, 32);
		const material = new THREE.MeshBasicMaterial({
			color: 16777215,
			transparent: true,
			opacity: 0,
			depthTest: false,
			side: THREE.BackSide
		});
		super(geometry, material);
		this.xb = { pointerEvents: "none" };
		this.currentMode = "AR";
		this.transitionTime = 1.5;
		this.targetAlpha = 0;
		this.defaultBackgroundColor = new THREE.Color(16777215);
		this.renderOrder = -Infinity;
	}
	init({ renderer, camera, timer, scene, options }) {
		this.renderer = renderer;
		this.sceneCamera = camera;
		this.timer = timer;
		this.scene = scene;
		this.transitionTime = options.transition.transitionTime;
		this.defaultBackgroundColor.set(options.transition.defaultBackgroundColor);
		this.material.color.copy(this.defaultBackgroundColor);
		this.scene.add(this);
	}
	/**
	* Starts the transition to a VR background.
	* @param options - Optional parameters.
	*/
	toVR({ targetAlpha = 1, color } = {}) {
		this.targetAlpha = THREE.MathUtils.clamp(targetAlpha, 0, 1);
		this.material.color.set(color ?? this.defaultBackgroundColor);
		this.currentMode = "VR";
	}
	/**
	* Starts the transition to a transparent AR background.
	*/
	toAR() {
		this.targetAlpha = 0;
		this.currentMode = "AR";
	}
	update() {
		if (this.renderer.xr.isPresenting) this.renderer.xr.getCamera().getWorldPosition(this.position);
		else this.sceneCamera.getWorldPosition(this.position);
		const currentOpacity = this.material.opacity;
		if (currentOpacity !== this.targetAlpha) {
			const lerpFactor = this.timer.getDelta() / this.transitionTime;
			this.material.opacity = THREE.MathUtils.lerp(currentOpacity, this.targetAlpha, lerpFactor);
			if (Math.abs(this.material.opacity - this.targetAlpha) < .01) this.material.opacity = this.targetAlpha;
		}
	}
	dispose() {
		if (this.parent) this.parent.remove(this);
		this.material.dispose();
		this.geometry.dispose();
	}
};
//#endregion
//#region src/core/components/PermissionsManager.ts
/**
* A utility class to manage and request browser permissions for
* Location, Camera, and Microphone.
*/
var PermissionsManager = class {
	/**
	* Requests permission to access the user's geolocation.
	* Note: This actually attempts to fetch the position to trigger the prompt.
	*/
	async requestLocationPermission() {
		if (!("geolocation" in navigator)) return {
			granted: false,
			status: "error",
			error: "Geolocation is not supported by this browser."
		};
		return new Promise((resolve) => {
			navigator.geolocation.getCurrentPosition(() => {
				resolve({
					granted: true,
					status: "granted"
				});
			}, (error) => {
				let errorMsg = "Unknown error";
				switch (error.code) {
					case error.PERMISSION_DENIED:
						errorMsg = "User denied the request.";
						break;
					case error.POSITION_UNAVAILABLE:
						errorMsg = "Location information is unavailable.";
						break;
					case error.TIMEOUT: errorMsg = "The request to get user location timed out.";
				}
				resolve({
					granted: false,
					status: "denied",
					error: errorMsg
				});
			}, { timeout: 1e4 });
		});
	}
	/**
	* Requests permission to access the microphone.
	* Opens a stream to trigger the prompt, then immediately closes it.
	*/
	async requestMicrophonePermission() {
		return this.requestMediaPermission({ audio: true });
	}
	/**
	* Requests permission to access the camera.
	* Opens a stream to trigger the prompt, then immediately closes it.
	*/
	async requestCameraPermission(options) {
		return this.requestMediaPermission({ video: true }, options);
	}
	/**
	* Requests permission for both camera and microphone simultaneously.
	*/
	async requestAVPermission() {
		return this.requestMediaPermission({
			video: true,
			audio: true
		});
	}
	/**
	* Internal helper to handle getUserMedia requests.
	* Crucially, this stops the tracks immediately after permission is granted
	* so the hardware doesn't remain active.
	*/
	async requestMediaPermission(constraints, options) {
		if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return {
			granted: false,
			status: "error",
			error: "Media Devices API is not supported by this browser."
		};
		try {
			(await navigator.mediaDevices.getUserMedia(constraints)).getTracks().forEach((track) => track.stop());
			return {
				granted: true,
				status: "granted"
			};
		} catch (err) {
			if (this.shouldAllowVideoFallback(err, constraints, options)) return {
				granted: true,
				status: "granted"
			};
			const status = "denied";
			let errorMessage = "Permission denied";
			if (err instanceof Error) {
				if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") return {
					granted: false,
					status: "error",
					error: "Hardware not found."
				};
				errorMessage = err.message || errorMessage;
			}
			return {
				granted: false,
				status,
				error: errorMessage
			};
		}
	}
	shouldAllowVideoFallback(err, constraints, options) {
		if (!options?.allowVideoFallback || !this.isVideoOnlyRequest(constraints)) return false;
		return err instanceof Error && (err.name === "NotFoundError" || err.name === "DevicesNotFoundError");
	}
	isVideoOnlyRequest(constraints) {
		const requestsVideo = constraints.video !== void 0 && constraints.video !== false;
		const requestsAudio = constraints.audio !== void 0 && constraints.audio !== false;
		return requestsVideo && !requestsAudio;
	}
	/**
	* Requests multiple permissions sequentially.
	* Returns a single result: granted is true only if ALL requested permissions are granted.
	*/
	async checkAndRequestPermissions({ geolocation = false, camera = false, microphone = false }, options) {
		const results = [];
		if (geolocation) {
			if (await this.checkPermissionStatus("geolocation") === "granted") results.push({
				granted: true,
				status: "granted"
			});
			else results.push(await this.requestLocationPermission());
		}
		if (camera && microphone) {
			const camStatus = await this.checkPermissionStatus("camera");
			const micStatus = await this.checkPermissionStatus("microphone");
			if (camStatus === "granted" && micStatus === "granted") results.push({
				granted: true,
				status: "granted"
			});
			else if (camStatus === "granted") results.push(await this.requestMicrophonePermission());
			else if (micStatus === "granted") results.push(await this.requestCameraPermission(options));
			else results.push(await this.requestAVPermission());
		} else if (camera) {
			if (await this.checkPermissionStatus("camera") === "granted") results.push({
				granted: true,
				status: "granted"
			});
			else results.push(await this.requestCameraPermission(options));
		} else if (microphone) {
			if (await this.checkPermissionStatus("microphone") === "granted") results.push({
				granted: true,
				status: "granted"
			});
			else results.push(await this.requestMicrophonePermission());
		}
		if (results.length === 0) return {
			granted: true,
			status: "granted"
		};
		const allGranted = results.every((r) => r.granted);
		const anyDenied = results.find((r) => r.status === "denied");
		const anyError = results.find((r) => r.status === "error");
		const errors = results.filter((r) => r.error).map((r) => r.error).join(" | ");
		let finalStatus = "granted";
		if (anyError) finalStatus = "error";
		else if (anyDenied) finalStatus = "denied";
		return {
			granted: allGranted,
			status: finalStatus,
			error: errors || void 0
		};
	}
	/**
	* Checks the current status of a permission without triggering a prompt.
	* Useful for UI state (e.g., disabling buttons if already denied).
	* * @param permissionName - 'geolocation', 'camera', or 'microphone'
	*/
	async checkPermissionStatus(permissionName) {
		if (!navigator.permissions || !navigator.permissions.query) return "unknown";
		try {
			let queryName;
			if (permissionName === "geolocation") queryName = "geolocation";
			else if (permissionName === "camera" || permissionName === "microphone") {
				const descriptor = { name: permissionName };
				return (await navigator.permissions.query(descriptor)).state;
			} else return "unknown";
			return (await navigator.permissions.query({ name: queryName })).state;
		} catch (error) {
			console.warn(`Error checking permission status for ${permissionName}`, error);
			return "unknown";
		}
	}
};
//#endregion
//#region src/core/Core.ts
const EPSILON$1 = 1e-9;
function loadSimulatorModule() {
	return import("./internal/Simulator.js").then((n) => n.t);
}
/**
* Core is the central engine of the XR Blocks framework, acting as a
* singleton manager for all XR subsystems. Its primary goal is to abstract
* low-level WebXR and THREE.js details, providing a simplified and powerful API
* for developers and AI agents to build interactive XR applications.
*/
var Core = class Core {
	get currentFrame() {
		return this._renderer?.xr.getFrame();
	}
	/**
	* The WebGL or WebGPU renderer, created during {@link Core.init}. Reading it
	* before `init()` has run returns `undefined` and logs a one-time warning.
	*/
	get renderer() {
		if (!this._renderer) console.warn("xb.core.renderer is not available until xb.init() creates it. Access it in or after your Script's init() method.");
		return this._renderer;
	}
	set renderer(renderer) {
		this._renderer = renderer;
	}
	get isPaused() {
		return this._isPaused;
	}
	get elapsedTime() {
		return this.simulationTimer.getElapsedMs() / 1e3;
	}
	/** Current state of this terminal Core lifetime. */
	get lifecycle() {
		return this.lifecycleState;
	}
	pause() {
		this._isPaused = true;
		this.simulationTimer.pause();
	}
	resume() {
		this._isPaused = false;
	}
	stepFrame(dtMs = 16.67) {
		if (this.isSteppingFrame) throw new Error("Core.stepFrame() cannot be called while already stepping.");
		this.isSteppingFrame = true;
		try {
			const scaledDtMs = dtMs * this.timer.getTimescale();
			this.simulationTimer.step(dtMs, this.timer.getTimescale());
			this.manualStepTime += dtMs;
			this.update(this.manualStepTime, void 0);
			if (this.physics) {
				this.manualPhysicsAccumulatorMs += scaledDtMs;
				const physicsStepMs = this.physics.timestep * 1e3;
				while (this.manualPhysicsAccumulatorMs >= physicsStepMs - EPSILON$1) {
					this.physicsStep();
					this.manualPhysicsAccumulatorMs = Math.max(0, this.manualPhysicsAccumulatorMs - physicsStepMs);
				}
			}
		} finally {
			this.isSteppingFrame = false;
		}
	}
	/**
	* Core is a singleton manager that manages all XR "blocks".
	* It initializes core components and abstractions like the scene, camera,
	* user, UI, AI, and input managers.
	*/
	constructor(simulatorLoader = loadSimulatorModule) {
		this.screenshotSynthesizer = new ScreenshotSynthesizer();
		this.waitFrame = new WaitFrame();
		this.xrReferenceSpaceCache = new XRReferenceSpaceCache();
		this.registry = new Registry();
		this.timer = new THREE.Timer();
		this.simulationTimer = new SimulationTimer();
		this.input = new Input();
		this.camera = new THREE.PerspectiveCamera();
		this.scene = new THREE.Scene();
		this.user = new User();
		this.sound = new CoreSound();
		this.xrSystemsGroup = new XRSystems();
		this.renderSceneCallback = (cameraOverride) => this.renderScene(cameraOverride);
		this.reticleOptions = new ReticleOptions();
		this.reticlePresenter = new ReticlePresenter(this.reticleOptions);
		this.manualPhysicsAccumulatorMs = 0;
		this.lifecycleState = "new";
		this.world = new World();
		this.context = new Context();
		this.textureLoader = new THREE.TextureLoader();
		this.webXRSettings = {};
		this.shouldAutostartSimulator = false;
		this.simulatorRunning = false;
		this.onBeforeWebXRSessionStart = (event) => {
			if (this.options?.framebufferScaleFactor === "native" && typeof XRWebGLLayer !== "undefined") {
				const maxScale = XRWebGLLayer.getNativeFramebufferScaleFactor(event.session);
				this.renderer.xr.setFramebufferScaleFactor(maxScale);
			}
		};
		this.onWebXRSessionStarted = (event) => {
			this.onXRSessionStarted(event.session);
		};
		this.onWebXRUnsupported = () => {
			if (!this.options.enableSimulator) return;
			this.xrButton?.domElement.remove();
			this.shouldAutostartSimulator = true;
		};
		this._isPaused = false;
		this.isSteppingFrame = false;
		this.manualStepTime = 0;
		this.depth = new Depth();
		this.ai = new AI();
		this.scriptsManager = new ScriptsManager(async (script) => {
			await callInitWithDependencyInjection(script, this.registry, this);
			if (this.physics) await script.initPhysics(this.physics);
		});
		this.permissionsManager = new PermissionsManager();
		this.update = (time, frame) => {
			if (this._isPaused && !this.isSteppingFrame) return;
			this.manualStepTime = Math.max(this.manualStepTime, time);
			if (!this.isSteppingFrame) this.simulationTimer.update(time, this.timer.getTimescale());
			this.timer.update(time);
			const deltaSeconds = this.timer.getDelta();
			if (this.simulatorRunning) this.simulator?.simulatorUpdate();
			this.depth.update(frame);
			if (this.deviceCamera?.isUsingXRCameraAccess) this.deviceCamera.updateXRCamera(frame);
			if (this.lighting) this.lighting.update();
			if (this.renderer.xr.isPresenting) this.renderer.xr.updateCamera(this.camera);
			this.input.sampleSources();
			this.scriptsManager.syncScriptsWithScene(this.scene);
			this.waitFrame.onFrame();
			this.scriptsManager.update(time, frame);
			for (const controller of this.input.controllers) if (controller.userData.squeezing) this.scriptsManager.callSqueezing(controller);
			const frameCamera = this.getFrameCamera();
			this.uiRenderer.reconcile(deltaSeconds, frameCamera);
			this.interaction.syncTouchCandidates(this.scriptsManager.directTouchCandidates);
			this.scene.updateMatrixWorld();
			this.interaction.update(this.input.getFrame(), deltaSeconds);
			this.uiRenderer.present();
			this.renderSimulatorAndScene();
			if (this.renderer instanceof THREE.WebGLRenderer) this.screenshotSynthesizer.onAfterRender(this.renderer, this.renderSceneCallback, this.deviceCamera);
		};
		this.physicsStep = () => {
			if (this._isPaused && !this.isSteppingFrame) return;
			this.physics.physicsStep();
			this.scriptsManager.physicsStep();
		};
		this.startSimulator = async () => {
			this.assertLifecycleActive("start the simulator");
			if (this.simulatorRunning && this.simulator) return this.simulator;
			if (this.startingSimulator) return this.startingSimulator;
			this.xrButton?.setSimulatorStarting(true);
			this.startingSimulator = (async () => {
				const { Simulator } = await this.simulatorLoader();
				this.assertLifecycleActive("load the simulator runtime");
				const simulator = new Simulator(this.renderSceneCallback, this.renderer);
				try {
					this.xrSystemsGroup.add(simulator);
					await this.scriptsManager.initScript(simulator);
					this.assertLifecycleActive("finish simulator startup");
					this.simulator = simulator;
					this.registry.register(simulator);
					this.onSimulatorStarted();
					this.xrButton?.dispose();
					this.xrButton = void 0;
					return simulator;
				} catch (error) {
					simulator.removeFromParent();
					try {
						simulator.dispose();
					} catch (cleanupError) {
						console.error("Simulator cleanup failed after startup failed.", cleanupError);
					}
					throw error;
				}
			})();
			try {
				return await this.startingSimulator;
			} finally {
				this.startingSimulator = void 0;
				this.xrButton?.setSimulatorStarting(false);
			}
		};
		this.onXRSessionEnded = () => {
			if (!this.isLifecycleActive()) return;
			this.deviceCamera?.onXRSessionEnded();
			this.scriptsManager.onXRSessionEnded();
		};
		this.onWindowResize = () => {
			this.camera.aspect = window.innerWidth / window.innerHeight;
			this.camera.updateProjectionMatrix();
			this.renderer.setSize(window.innerWidth, window.innerHeight);
		};
		if (Core.instance) return Core.instance;
		Core.instance = this;
		this.simulatorLoader = simulatorLoader;
		this.interaction = new Interaction({
			callbacks: this.scriptsManager,
			scene: this.scene,
			camera: this.camera,
			timer: this.timer,
			reticle: this.reticlePresenter,
			reticleOptions: this.reticleOptions
		});
		this.uiRenderer = new UIRenderer(this.interaction, void 0, (error, root) => this.scriptsManager.reportError(error, root, "UI renderer load"));
		this.scriptsManager.beforeDispose = (script) => this.interaction.cancelObject(script, "removed");
		this.scriptsManager.afterDispose = (script) => {
			if (isUIElement(script)) this.uiRenderer.release(script);
		};
		this.scene.name = "XR Blocks Scene";
		this.scene.add(this.xrSystemsGroup);
		this.xrSystemsGroup.add(this.user, this.sound, this.world, this.context);
		this.registry.register(this.registry);
		this.registry.register(this);
		this.registry.register(this.waitFrame);
		this.registry.register(this.screenshotSynthesizer);
		this.registry.register(this.xrReferenceSpaceCache);
		this.registry.register(this.simulationTimer);
		this.registry.register(this.scene);
		this.registry.register(this.timer);
		this.registry.register(this.input);
		this.registry.register(this.user);
		this.registry.register(this.interaction);
		this.registry.register(this.sound);
		this.registry.register(this.scriptsManager);
		this.registry.register(this.depth);
		this.registry.register(this.world);
		this.registry.register(this.context);
		this.registry.register(this.xrSystemsGroup);
	}
	dispose() {
		if (this.disposalPromise) return this.disposalPromise;
		if (this.lifecycleState === "disposed") return Promise.resolve();
		this.lifecycleState = "disposing";
		this.disposalPromise = this.finishDisposal();
		return this.disposalPromise;
	}
	async finishDisposal() {
		let firstError;
		const cleanups = [
			() => {
				if (this.physicsInterval === void 0) return;
				clearInterval(this.physicsInterval);
				this.physicsInterval = void 0;
			},
			() => {
				if (typeof this._renderer?.setAnimationLoop === "function") this._renderer.setAnimationLoop(null);
			},
			() => window.removeEventListener("resize", this.onWindowResize),
			() => {
				const button = this.xrButton;
				this.xrButton = void 0;
				button?.dispose();
			},
			() => this.disposeWebXRSessionManager(),
			async () => {
				try {
					await this.startingSimulator;
				} catch {}
			},
			() => this.scriptsManager.dispose(),
			() => {
				this.simulatorRunning = false;
			},
			() => this.interaction.clear(),
			() => this.uiRenderer.dispose(),
			() => this.input.dispose(),
			() => this.depth.dispose(),
			() => {
				const camera = this.deviceCamera;
				this.deviceCamera = void 0;
				camera?.dispose();
			},
			() => {
				const effects = this.effects;
				this.effects = void 0;
				effects?.dispose();
			},
			() => {
				const physics = this.physics;
				this.physics = void 0;
				physics?.dispose();
			},
			() => {
				const renderer = this._renderer;
				this._renderer = void 0;
				if (typeof renderer?.dispose === "function") renderer.dispose();
			},
			() => {
				this.rendererContainer?.remove();
				this.rendererContainer = void 0;
			}
		];
		for (const cleanup of cleanups) try {
			await cleanup();
		} catch (error) {
			firstError ??= error;
		}
		this.lifecycleState = "disposed";
		if (firstError !== void 0) throw firstError;
	}
	async disposeWebXRSessionManager() {
		const manager = this.webXRSessionManager;
		if (!manager) return;
		this.webXRSessionManager = void 0;
		manager.removeEventListener("beforesessionstart", this.onBeforeWebXRSessionStart);
		manager.removeEventListener("sessionstart", this.onWebXRSessionStarted);
		manager.removeEventListener("sessionend", this.onXRSessionEnded);
		manager.removeEventListener("unsupported", this.onWebXRUnsupported);
		await manager.dispose();
	}
	/**
	* Initializes the Core system with a given set of options. This includes
	* setting up the renderer, enabling features like controllers, depth
	* sensing, and physics, and starting the render loop.
	* @param options - Configuration options for the
	* session.
	*/
	init(options = new Options()) {
		if (this.lifecycleState === "initializing" || this.lifecycleState === "running") return this.initializationPromise;
		if (this.lifecycleState === "disposing" || this.lifecycleState === "disposed") return Promise.reject(/* @__PURE__ */ new Error(`Core cannot initialize after disposal has ${this.lifecycleState === "disposing" ? "started" : "completed"}.`));
		this.lifecycleState = "initializing";
		this.initializationPromise = Promise.resolve().then(() => this.runInitialization(options));
		return this.initializationPromise;
	}
	async runInitialization(options) {
		try {
			await this.initialize(options);
		} catch (error) {
			markDebugFailed(this, error);
			if (this.lifecycleState === "initializing") try {
				await this.dispose();
			} catch (cleanupError) {
				console.error("Core cleanup failed after initialization failed.", cleanupError);
			}
			throw error;
		}
		this.assertInitializing();
		this.lifecycleState = "running";
		markDebugReady(this);
	}
	async initialize(options) {
		loadingSpinnerManager.showSpinner();
		this.registry.register(options, Options);
		this.registry.register(options.depth, DepthOptions);
		this.registry.register(options.simulator, SimulatorOptions);
		this.registry.register(options.world, WorldOptions);
		this.registry.register(options.context, ContextOptions);
		this.registry.register(options.context.scene, SceneOptions);
		this.registry.register(options.world.meshes, MeshDetectionOptions);
		this.registry.register(options.ai, AIOptions);
		this.registry.register(options.sound, SoundOptions);
		this.registry.register(options.gestures, GestureRecognitionOptions);
		this.registry.register(options.headGestures, HeadGestureRecognitionOptions);
		this.registry.register(options.strokes, StrokeRecognitionOptions);
		if (options.transition.enabled) {
			this.transition = new XRTransition();
			this.user.add(this.transition);
			this.registry.register(this.transition);
		}
		this.camera.copy(new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, options.camera.near, options.camera.far));
		this.registry.register(this.camera, THREE.Camera);
		this.registry.register(this.camera, THREE.PerspectiveCamera);
		if (options.rendererBackend === "webgpu") {
			const { WebGPURenderer } = await import("three/webgpu");
			this.assertInitializing();
			this.renderer = new WebGPURenderer({
				canvas: options.canvas,
				antialias: options.antialias,
				stencil: options.stencil,
				alpha: true,
				forceWebGL: options.webgpuOptions?.forceWebGL
			});
			await this.renderer.init();
			this.assertInitializing();
		} else this.renderer = new THREE.WebGLRenderer({
			canvas: options.canvas,
			antialias: options.antialias,
			stencil: options.stencil,
			alpha: true,
			logarithmicDepthBuffer: options.logarithmicDepthBuffer
		});
		if (isWebGPURenderer(this.renderer)) {
			const { applyWebGPUReticleMaterial } = await import("./internal/ReticleWebGPUMaterial.js");
			this.assertInitializing();
			this.input.setReticleConfigurer(applyWebGPUReticleMaterial);
		}
		this.renderer.setPixelRatio(window.devicePixelRatio);
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		this.renderer.xr.enabled = true;
		if ("getDepthSensingMesh" in this.renderer.xr) this.renderer.xr.getDepthSensingMesh = function() {
			return null;
		};
		this.registry.register(this.renderer);
		this.registry.register(new RendererHolder(this.renderer));
		this.renderer.xr.setReferenceSpaceType(options.referenceSpaceType);
		if (typeof options.framebufferScaleFactor === "number") this.renderer.xr.setFramebufferScaleFactor(options.framebufferScaleFactor);
		window.addEventListener("resize", this.onWindowResize);
		if (!options.canvas) {
			this.rendererContainer = document.createElement("div");
			document.body.appendChild(this.rendererContainer);
			this.rendererContainer.appendChild(this.renderer.domElement);
		}
		this.options = options;
		this.reticleOptions.maxDistance = options.reticles.maxDistance;
		this.reticleOptions.defaultRenderDistance = options.reticles.defaultRenderDistance;
		this.scriptsManager.catchExceptions = options.catchScriptExceptions;
		this.interaction.setLongSelectDuration(options.interaction.longSelectDuration);
		this.interaction.setRaycastMode(options.interaction.raycastMode);
		this.input.init({
			systemsGroup: this.xrSystemsGroup,
			options,
			renderer: this.renderer
		});
		if (options.controllers.enabled) {
			this.input.bindSqueezeStart(this.scriptsManager.callSqueezeStart);
			this.input.bindSqueezeEnd(this.scriptsManager.callSqueezeEnd);
			this.input.bindSqueeze(this.scriptsManager.callSqueeze);
			this.input.bindKeyDown(this.scriptsManager.callKeyDown);
			this.input.bindKeyUp(this.scriptsManager.callKeyUp);
		}
		if (options.deviceCamera?.enabled) {
			this.deviceCamera = new XRDeviceCamera(options.deviceCamera);
			this.deviceCamera.setRenderer(this.renderer);
			this.registry.register(this.deviceCamera);
			this.context.setDeviceCamera(this.deviceCamera);
		}
		const webXRRequiredFeatures = options.webxrRequiredFeatures;
		const webXROptionalFeatures = options.webxrOptionalFeatures;
		if (!webXROptionalFeatures.includes(options.referenceSpaceType)) webXROptionalFeatures.push(options.referenceSpaceType);
		if (options.deviceCamera?.enabled) webXROptionalFeatures.push("camera-access");
		this.webXRSettings.requiredFeatures = webXRRequiredFeatures;
		this.webXRSettings.optionalFeatures = webXROptionalFeatures;
		if (options.depth.enabled) {
			webXRRequiredFeatures.push("depth-sensing");
			webXRRequiredFeatures.push("local-floor");
			this.webXRSettings.depthSensing = {
				usagePreference: options.depth.usagePreference,
				dataFormatPreference: options.depth.dataFormatPreference,
				depthTypeRequest: options.depth.depthTypeRequest,
				matchDepthView: options.depth.matchDepthView
			};
			await this.depth.init(this.camera, options.depth, this.renderer, this.registry, this.scene);
			this.assertInitializing();
			if (this.depth.depthMesh) this.depth.depthMesh.xb = {
				...this.depth.depthMesh.xb,
				pointerEvents: options.reticles.projectOnDepthMesh ? "auto" : "none",
				reticleMode: "surface"
			};
		}
		if (options.hands.enabled) {
			webXROptionalFeatures.push("hand-tracking");
			this.user.hands = new Hands(this.input.hands);
			if (options.gestures.enabled) {
				this.poseEstimation = options.gestures.poseEstimator;
				this.gestureRecognition = new GestureRecognition();
				this.xrSystemsGroup.add(this.gestureRecognition);
				this.registry.register(this.poseEstimation);
				this.registry.register(this.gestureRecognition);
			}
		}
		if (options.world.planes.enabled) webXROptionalFeatures.push("plane-detection");
		if (options.world.meshes.enabled) webXROptionalFeatures.push("mesh-detection");
		if (options.layers.enabled) webXROptionalFeatures.push("layers");
		if (options.world.anchors.enabled) webXROptionalFeatures.push("anchors");
		if (options.lighting.enabled) {
			assertWebGLRenderer(this.renderer, "Lighting");
			webXROptionalFeatures.push("light-estimation");
			this.lighting = new Lighting();
			this.lighting.init(options.lighting, this.renderer, this.scene, this.depth);
		}
		if (options.physics && options.physics.RAPIER) {
			this.physics = new Physics();
			this.registry.register(this.physics);
			await this.physics.init({ physicsOptions: options.physics });
			this.assertInitializing();
			if (options.depth.enabled) this.depth.depthMesh?.initRapierPhysics(this.physics.RAPIER, this.physics.blendedWorld);
		}
		this.webXRSessionManager = new WebXRSessionManager(this.renderer, this.webXRSettings, options.xrSessionMode);
		this.webXRSessionManager.addEventListener("beforesessionstart", this.onBeforeWebXRSessionStart);
		this.webXRSessionManager.addEventListener("sessionstart", this.onWebXRSessionStarted);
		this.webXRSessionManager.addEventListener("sessionend", this.onXRSessionEnded);
		this.shouldAutostartSimulator = this.options.xrButton.alwaysAutostartSimulator;
		if (!this.shouldAutostartSimulator && options.xrButton.enabled) {
			this.xrButton = new XRButton(this.webXRSessionManager, this.permissionsManager, options.xrButton?.appTitle, options.xrButton?.appDescription, options.xrButton?.startText, options.xrButton?.endText, options.xrButton?.invalidText, options.xrButton?.startSimulatorText, options.xrButton?.showEnterSimulatorButton, this.startSimulator, options.permissions);
			document.body.appendChild(this.xrButton.domElement);
		}
		this.webXRSessionManager.addEventListener("unsupported", this.onWebXRUnsupported);
		await this.webXRSessionManager.initialize();
		this.assertInitializing();
		if (options.usePostprocessing) this.effects = new XREffects(this.renderer, this.scene, this.timer);
		if (options.ai.enabled) {
			this.registry.register(this.ai);
			this.xrSystemsGroup.add(this.ai);
			await this.scriptsManager.initScript(this.ai);
			this.assertInitializing();
		}
		await Promise.all([this.uiRenderer.initialize(this.scene, this.renderer), this.scriptsManager.syncScriptsWithScene(this.scene)]);
		this.assertInitializing();
		this.uiRenderer.reconcile(0, this.camera);
		this.uiRenderer.present();
		this.renderer.setAnimationLoop(this.update);
		if (this.physics) this.physicsInterval = setInterval(this.physicsStep, 1e3 * this.physics.timestep);
		if (this.options.reticles.enabled) this.input.addReticles();
		if (this.shouldAutostartSimulator) {
			await this.startSimulator();
			this.assertInitializing();
		}
		if (!loadingSpinnerManager.isLoading) loadingSpinnerManager.hideSpinner();
	}
	/**
	* Lifecycle callback executed when an XR session starts. Notifies all active
	* scripts.
	* @param session - The newly started WebXR session.
	*/
	async onXRSessionStarted(session) {
		if (!this.isLifecycleActive()) return;
		this.xrReferenceSpaceCache.onXRSessionStart(session);
		if (this.options.deviceCamera?.enabled) {
			await this.deviceCamera.init();
			if (!this.isLifecycleActive()) return;
		}
		this.scriptsManager.onXRSessionStarted(session);
	}
	isLifecycleActive() {
		return this.lifecycleState === "initializing" || this.lifecycleState === "running";
	}
	assertInitializing() {
		if (this.lifecycleState === "initializing") return;
		throw new Error(`Core initialization stopped because Core is ${this.lifecycleState}.`);
	}
	assertLifecycleActive(operation) {
		if (this.isLifecycleActive()) return;
		throw new Error(`Core cannot ${operation} while it is ${this.lifecycleState}.`);
	}
	/**
	* Lifecycle callback executed when the desktop simulator starts. Notifies
	* all active scripts.
	*/
	onSimulatorStarted() {
		this.simulatorRunning = true;
		this.scriptsManager.onSimulatorStarted();
		if (this.lighting) this.lighting.simulatorRunning = true;
	}
	renderSimulatorAndScene() {
		if (this.simulatorRunning && this.simulator) this.simulator.renderFrame();
		else this.renderScene();
	}
	getFrameCamera() {
		if (!this.simulatorRunning || !this.simulator) return this.camera;
		return this.simulator.getRenderCamera() ?? this.camera;
	}
	renderScene(cameraOverride) {
		const camera = cameraOverride ?? this.camera;
		if (this.renderSceneOverride) this.renderSceneOverride(this.renderer, this.scene, camera);
		else if (this.effects) this.effects.render(camera);
		else this.renderer.render(this.scene, camera);
	}
};
//#endregion
//#region src/VisemeWeights.ts
/** Zero-weight viseme set; useful as a rest pose initialiser. */
const ZERO_VISEME = Object.freeze({
	jawOpen: 0,
	aa: 0,
	oo: 0,
	oh: 0,
	ee: 0,
	consonant: 0
});
//#endregion
//#region src/StylizedFace.ts
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
var StylizedFace = class StylizedFace extends Script {
	static {
		this.BLINK_MS = 140;
	}
	constructor(opts = {}) {
		super();
		this.visemes = { ...ZERO_VISEME };
		this.metrics = {
			width: 1,
			openHeight: 0
		};
		this.lastDrawnWidth = NaN;
		this.lastDrawnOpenHeight = NaN;
		this.lastDrawnBlinkScale = NaN;
		this.nextBlinkAt = 0;
		this.blinkStartAt = -Infinity;
		this._disposed = false;
		this.headRadius = opts.headRadius ?? .1;
		this.showEyes = opts.showEyes ?? true;
		const size = opts.textureSize ?? 256;
		this.canvas = document.createElement("canvas");
		this.canvas.width = size;
		this.canvas.height = size;
		this.ctx = this.canvas.getContext("2d");
		this.texture = new THREE.CanvasTexture(this.canvas);
		this.texture.colorSpace = THREE.SRGBColorSpace;
		this.texture.anisotropy = 4;
		const planeSize = this.headRadius * 1.4;
		const geom = new THREE.PlaneGeometry(planeSize, planeSize);
		const mat = new THREE.MeshBasicMaterial({
			map: this.texture,
			transparent: true,
			depthWrite: false
		});
		this.mesh = new THREE.Mesh(geom, mat);
		this.mesh.position.z = -this.headRadius * 1.001;
		this.mesh.rotation.y = Math.PI;
		this.add(this.mesh);
		this.nextBlinkAt = performance.now() + 2e3 + Math.random() * 3e3;
		this.drawIfDirty();
	}
	/**
	* Drive the mouth drawing from a viseme weight set. Cheap enough to
	* call every frame; redraws and re-uploads the canvas texture only
	* when the lip shape or blink frame would actually change pixels.
	*/
	setVisemes(v) {
		this.visemes = v;
		this.metrics = computeMetrics(v);
		this.drawIfDirty();
	}
	/**
	* Frame hook — keeps the blink animation running independently of
	* any external `setVisemes` driver. A face that isn't being driven
	* (no lipsync stream, no blendshape feed) still blinks on its own.
	*/
	update() {
		this.drawIfDirty();
	}
	/** Free the texture, geometry, and material. Idempotent. */
	dispose() {
		if (this._disposed) return;
		this._disposed = true;
		this.texture.dispose();
		this.mesh.geometry.dispose();
		this.mesh.material.dispose();
		super.dispose();
	}
	drawIfDirty() {
		const blinkScale = this.showEyes ? this.currentBlinkScale(performance.now()) : 1;
		const EPS = .005;
		if (Math.abs(this.metrics.width - this.lastDrawnWidth) < EPS && Math.abs(this.metrics.openHeight - this.lastDrawnOpenHeight) < EPS && Math.abs(blinkScale - this.lastDrawnBlinkScale) < EPS) return;
		this.lastDrawnWidth = this.metrics.width;
		this.lastDrawnOpenHeight = this.metrics.openHeight;
		this.lastDrawnBlinkScale = blinkScale;
		this.drawFace(blinkScale);
		this.texture.needsUpdate = true;
	}
	drawFace(blinkScale) {
		const ctx = this.ctx;
		if (!ctx) return;
		const w = this.canvas.width;
		const h = this.canvas.height;
		ctx.clearRect(0, 0, w, h);
		const m = this.metrics;
		const cx = w / 2;
		const mouthY = this.showEyes ? h * .6 : h * .5;
		const halfW = w * .22 * m.width;
		const halfH = h * .012 + h * .13 * m.openHeight;
		ctx.fillStyle = "#1a0808";
		ctx.beginPath();
		ctx.ellipse(cx, mouthY, halfW, halfH, 0, 0, Math.PI * 2);
		ctx.fill();
		if (this.showEyes) {
			const eyeY = h * .36;
			const eyeOffset = w * .16;
			const eyeR = w * .07;
			for (const ex of [cx - eyeOffset, cx + eyeOffset]) {
				ctx.beginPath();
				ctx.ellipse(ex, eyeY, eyeR, eyeR * blinkScale, 0, 0, Math.PI * 2);
				ctx.fill();
			}
		}
	}
	/**
	* Returns the vertical scale (0..1) for the eyes at the given wall
	* clock time. 1 = fully open; near 0 = mid-blink. Also advances the
	* blink schedule as a side effect (starts a new blink when due).
	*/
	currentBlinkScale(now) {
		const t = (now - this.blinkStartAt) / StylizedFace.BLINK_MS;
		if (t >= 0 && t < 1) return 1 - .95 * (4 * t * (1 - t));
		if (now >= this.nextBlinkAt) {
			this.blinkStartAt = now;
			this.nextBlinkAt = now + 2500 + Math.random() * 4e3;
		}
		return 1;
	}
};
function computeMetrics(v) {
	const openHeight = clamp(v.jawOpen * .9 + v.aa * .5 + v.oh * .5, 0, 1);
	return {
		width: clamp(1 + v.ee * .45 - v.oo * .55 - v.oh * .2, .35, 1.4),
		openHeight
	};
}
//#endregion
//#region src/depth/DepthDebugUtils.ts
/**
* Generates a visual representation of the current depth buffer on a
* {@link Depth} instance and triggers a download for debugging.
* @param depth - The depth subsystem instance.
* @param viewIndex - The depth view index to visualize.
*/
function visualizeDepth(depth, viewIndex = 0) {
	const depthArray = depth.depthArray[viewIndex];
	if (!depthArray) {
		console.warn("Cannot visualize depth map: no depth data available.");
		return;
	}
	visualizeDepthMap(depthArray, depth.width, depth.height);
}
/**
* Generates a visual representation of a depth map, normalized to 0-1 range,
* and triggers a download for debugging.
* @param depthArray - The raw depth data array.
* @param width - The depth map width in pixels.
* @param height - The depth map height in pixels.
*/
function visualizeDepthMap(depthArray, width, height) {
	if (!width || !height || depthArray.length === 0) {
		console.warn("Cannot visualize depth map: missing dimensions or data.");
		return;
	}
	let min = Infinity;
	let max = -Infinity;
	for (let i = 0; i < depthArray.length; ++i) {
		const val = depthArray[i];
		if (val > 0) {
			if (val < min) min = val;
			if (val > max) max = val;
		}
	}
	if (min === Infinity) {
		min = 0;
		max = 1;
	}
	if (min === max) max = min + 1;
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d");
	const imageData = ctx.createImageData(width, height);
	const data = imageData.data;
	for (let i = 0; i < depthArray.length; ++i) {
		const raw = depthArray[i];
		const normalized = raw === 0 ? 0 : (raw - min) / (max - min);
		const byteVal = Math.floor(normalized * 255);
		const stride = i * 4;
		data[stride] = byteVal;
		data[stride + 1] = byteVal;
		data[stride + 2] = byteVal;
		data[stride + 3] = 255;
	}
	ctx.putImageData(imageData, 0, 0);
	const timestamp = (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace("T", "_").replace(/:/g, "-");
	const link = document.createElement("a");
	link.download = `depth_debug_${timestamp}.png`;
	link.href = canvas.toDataURL("image/png");
	link.click();
}
//#endregion
//#region src/generative/BackgroundKeyer.ts
const DEFAULT_TOLERANCE = 48;
/**
* Estimates the background color of an image by averaging its four corner
* pixels. Generated images that place the subject on a plain, uniform
* background (the generative_object demo instructs the model to do so) have
* corners that are a reliable sample.
* @param image - The source RGBA image.
* @returns The estimated `[r, g, b]` background color (0-255).
*/
function estimateBackgroundColor(image) {
	const { data, width, height } = image;
	const corners = [
		0,
		(width - 1) * 4,
		(height - 1) * width * 4,
		((height - 1) * width + (width - 1)) * 4
	];
	let r = 0;
	let g = 0;
	let b = 0;
	for (const offset of corners) {
		r += data[offset];
		g += data[offset + 1];
		b += data[offset + 2];
	}
	return [
		r / corners.length,
		g / corners.length,
		b / corners.length
	];
}
/**
* Makes background-colored pixels transparent, turning a subject-on-a-plain-
* background image into a clean cutout. Operates on a copy; the input is not
* mutated.
* @param image - The source RGBA image.
* @param options - Keying options.
* @returns A new {@link RgbaImage} with background pixels set to alpha 0.
*/
function keyOutBackground(image, options = {}) {
	const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
	const [bgR, bgG, bgB] = estimateBackgroundColor(image);
	const toleranceSquared = tolerance * tolerance;
	const out = new Uint8ClampedArray(image.data);
	for (let i = 0; i < out.length; i += 4) {
		const dr = out[i] - bgR;
		const dg = out[i + 1] - bgG;
		const db = out[i + 2] - bgB;
		if (dr * dr + dg * dg + db * db <= toleranceSquared) out[i + 3] = 0;
	}
	return {
		data: out,
		width: image.width,
		height: image.height
	};
}
/**
* Builds a grayscale displacement map from a keyed image: background pixels
* (alpha 0) become black (no displacement) and subject pixels become their
* luminance. Masking by alpha keeps the transparent background from displacing
* into stray geometry. The result is opaque RGBA.
* @param image - A keyed RGBA image (background already at alpha 0).
* @returns A new opaque {@link RgbaImage} usable as a displacement/bump map.
*/
function buildDisplacementMap(image) {
	const { data, width, height } = image;
	const out = new Uint8ClampedArray(data.length);
	for (let i = 0; i < data.length; i += 4) {
		const luminance = data[i + 3] === 0 ? 0 : Math.round(.2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2]);
		out[i] = luminance;
		out[i + 1] = luminance;
		out[i + 2] = luminance;
		out[i + 3] = 255;
	}
	return {
		data: out,
		width,
		height
	};
}
//#endregion
//#region src/utils/RotationUtils.ts
const euler = new THREE.Euler();
const matrix4 = new THREE.Matrix4();
const v1 = new THREE.Vector3();
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
function extractYaw(rotation, target = new THREE.Quaternion()) {
	euler.setFromQuaternion(rotation, "YXZ");
	return target.setFromAxisAngle(UP, euler.y);
}
/**
* Creates a rotation such that forward (0, 0, -1) points towards the forward
* vector and the up direction is the normalized projection of the provided up
* vector onto the plane orthogonal to the target.
* @param forward - Forward vector
* @param up - Up vector
* @param target - Output
* @returns
*/
function lookAtRotation(forward, up = UP, target = new THREE.Quaternion()) {
	matrix4.lookAt(ZERO_VECTOR3, forward, up);
	return target.setFromRotationMatrix(matrix4);
}
/**
* Clamps the provided rotation's angle.
* The rotation is modified in place.
* @param rotation - The quaternion to clamp.
* @param angle - The maximum allowed angle in radians.
*/
function clampRotationToAngle(rotation, angle) {
	let currentAngle = 2 * Math.acos(rotation.w);
	currentAngle = (currentAngle + Math.PI) % (2 * Math.PI) - Math.PI;
	if (Math.abs(currentAngle) <= angle) return;
	const axis = v1.set(rotation.x, rotation.y, rotation.z).multiplyScalar(1 / Math.sqrt(1 - rotation.w * rotation.w));
	axis.normalize();
	rotation.setFromAxisAngle(axis, angle * Math.sign(currentAngle));
}
//#endregion
//#region src/generative/GenerativeObjectUtils.ts
const tempForward = new THREE.Vector3();
const tempAwayFromCamera = new THREE.Vector3();
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
function computeBillboardScale(imageWidth, imageHeight, maxSize, target = new THREE.Vector2()) {
	if (imageWidth <= 0 || imageHeight <= 0 || maxSize <= 0) return target.set(maxSize, maxSize);
	const aspect = imageWidth / imageHeight;
	if (aspect >= 1) return target.set(maxSize, maxSize / aspect);
	return target.set(maxSize * aspect, maxSize);
}
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
function poseInFrontOfCamera(camera, distance, position = new THREE.Vector3(), quaternion = new THREE.Quaternion()) {
	camera.getWorldDirection(tempForward);
	camera.getWorldPosition(position);
	position.addScaledVector(tempForward, distance);
	lookAtRotation(tempForward, void 0, quaternion);
	return {
		position,
		quaternion
	};
}
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
function quaternionFacingCamera(objectPosition, cameraPosition, target = new THREE.Quaternion()) {
	const awayFromCamera = tempAwayFromCamera.subVectors(objectPosition, cameraPosition);
	awayFromCamera.y = 0;
	if (awayFromCamera.lengthSq() === 0) return target.identity();
	return lookAtRotation(awayFromCamera, void 0, target);
}
//#endregion
//#region src/layers/LayerCapability.ts
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
function layerCapability(session, binding, preferWebGL = false) {
	if (!session) return "unsupported";
	const hasWebGLQuad = typeof binding?.createQuadLayer === "function";
	if (preferWebGL && hasWebGLQuad) return "webgl";
	if (typeof XRMediaBinding === "function") return "media";
	if (hasWebGLQuad) return "webgl";
	return "unsupported";
}
/**
* Whether a capability can actually present a layer.
*
* @param capability - Result of {@link layerCapability}.
* @returns True when a quad layer can be created.
*/
function isLayerCapable(capability) {
	return capability !== "unsupported";
}
//#endregion
//#region src/layers/LayerManager.ts
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
var LayerManager = class {
	constructor() {
		this.session = null;
		this.binding = null;
		this.gl = null;
		this.baseLayer = null;
		this.layers = [];
		this.capability = "unsupported";
		this.preferWebGL = false;
	}
	/**
	* Forces the WebGL path on platforms that also offer a media binding.
	*
	* Quest has both and would otherwise always take the media path, so without
	* this the WebGL path cannot be exercised on the hardware most likely to be
	* to hand.
	*
	* @param prefer - Whether to take WebGL over media.
	*/
	setPreferWebGL(prefer) {
		this.preferWebGL = prefer;
		this.capability = layerCapability(this.session, this.binding, prefer);
	}
	/**
	* Binds the manager to a session.
	*
	* @param session - The active session, or null when one ends.
	* @param binding - The WebGL binding, if one exists.
	* @param gl - The context the binding was made against. Needed to upload
	*   frames into a layer's texture on the WebGL path.
	*/
	setSession(session, binding = null, gl = null) {
		this.session = session;
		this.binding = binding;
		this.gl = gl;
		this.capability = layerCapability(session, binding, this.preferWebGL);
		if (!session) {
			this.layers.length = 0;
			this.baseLayer = null;
			this.binding = null;
			this.gl = null;
		}
	}
	/** @returns The WebGL binding, if the session has one. */
	getBinding() {
		return this.binding;
	}
	/** @returns The context layer textures are uploaded through. */
	getContext() {
		return this.gl;
	}
	/**
	* Records the layer three.js renders the scene into.
	*
	* @param layer - The projection or WebGL layer backing the scene.
	*/
	setBaseLayer(layer) {
		this.baseLayer = layer;
	}
	/** @returns Which layer path this platform supports. */
	getCapability() {
		return this.capability;
	}
	/** @returns True when a layer can actually be presented. */
	isSupported() {
		return isLayerCapable(this.capability) && !!this.baseLayer;
	}
	/** @returns The layers currently composited in front of the scene. */
	getLayers() {
		return this.layers;
	}
	/**
	* Adds a layer in front of the scene.
	*
	* @param layer - Layer to present.
	* @returns True when it was added and submitted.
	*/
	add(layer) {
		if (!this.session || !this.baseLayer) return false;
		if (this.layers.includes(layer)) return true;
		this.layers.push(layer);
		try {
			this.submit();
		} catch (error) {
			this.layers.pop();
			throw error;
		}
		return true;
	}
	/**
	* Removes a layer.
	*
	* @param layer - Layer to stop presenting.
	* @returns True when it was present and removed.
	*/
	remove(layer) {
		const index = this.layers.indexOf(layer);
		if (index < 0) return false;
		this.layers.splice(index, 1);
		this.submit();
		return true;
	}
	/**
	* Pushes the current layer stack to the compositor.
	*
	* Always includes the base layer, since replacing the array without it would
	* leave the scene itself unrendered.
	*/
	submit() {
		if (!this.session || !this.baseLayer) return;
		this.session.updateRenderState({ layers: [this.baseLayer, ...this.layers] });
	}
};
//#endregion
//#region src/layers/VideoLayer.ts
const DEFAULT_WIDTH_M = 1.6;
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
var VideoLayer = class {
	/**
	* @param manager - Owns the layer stack this layer joins.
	*/
	constructor(manager) {
		this.manager = manager;
		this.layer = null;
		this.state = "fallback";
		this.path = "none";
		this.video = null;
		this.sourceWidth = 0;
		this.sourceHeight = 0;
		this.uploads = 0;
		this.lastFrameTime = -1;
	}
	/** @returns Whether the video is being presented as a layer. */
	getState() {
		return this.state;
	}
	/** @returns Which binding is presenting the video. */
	getPath() {
		return this.path;
	}
	/** @returns The underlying layer, if one was created. */
	getLayer() {
		return this.layer;
	}
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
	attach(video, session, space, placement = {}) {
		this.detach();
		if (!this.manager.isSupported()) {
			this.state = "fallback";
			return false;
		}
		const width = placement.width ?? DEFAULT_WIDTH_M;
		const height = placement.height ?? width / aspectRatioOf(video);
		const position = placement.position ?? new THREE.Vector3(0, 0, -2);
		const quaternion = placement.quaternion ?? new THREE.Quaternion();
		const transform = new XRRigidTransform({
			x: position.x,
			y: position.y,
			z: position.z
		}, {
			x: quaternion.x,
			y: quaternion.y,
			z: quaternion.z,
			w: quaternion.w
		});
		const capability = this.manager.getCapability();
		const layer = capability === "media" ? createMediaLayer(video, session, space, transform, width, height) : capability === "webgl" ? createWebGLLayer(this.manager.getBinding(), video, space, transform, width, height) : null;
		if (!layer) {
			this.state = "fallback";
			return false;
		}
		let added = false;
		try {
			added = this.manager.add(layer);
		} finally {
			if (!added) layer.destroy?.();
		}
		if (!added) {
			this.state = "fallback";
			return false;
		}
		this.layer = layer;
		this.video = video;
		this.sourceWidth = video.videoWidth;
		this.sourceHeight = video.videoHeight;
		this.uploads = 0;
		this.lastFrameTime = -1;
		this.path = capability === "media" ? "media" : "webgl";
		this.state = "layer";
		return true;
	}
	/**
	* Draws the current video frame into the layer.
	*
	* Only the WebGL path needs this: on the media path the compositor pulls
	* frames from the element itself and the app never draws one. Safe to call
	* every frame regardless.
	*
	* @param frame - The frame being rendered.
	*/
	update(frame) {
		if (this.path !== "webgl" || !this.layer || !this.video) return;
		const binding = this.manager.getBinding();
		const gl = this.manager.getContext();
		if (!binding || !gl) return;
		if (this.video.videoWidth !== this.sourceWidth || this.video.videoHeight !== this.sourceHeight) return;
		if (this.video.currentTime === this.lastFrameTime && !this.layer.needsRedraw) return;
		this.lastFrameTime = this.video.currentTime;
		try {
			const subImage = binding.getSubImage(this.layer, frame);
			const previousUnit = gl.getParameter(gl.ACTIVE_TEXTURE);
			const previousTexture = gl.getParameter(gl.TEXTURE_BINDING_2D);
			const previousFlip = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL);
			gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
			gl.bindTexture(gl.TEXTURE_2D, subImage.colorTexture);
			gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.video);
			gl.bindTexture(gl.TEXTURE_2D, previousTexture);
			gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, previousFlip);
			gl.activeTexture(previousUnit);
			this.uploads++;
		} catch {}
	}
	/**
	* How many frames have actually been uploaded.
	*
	* On the WebGL path the app draws every frame itself, so a count that stays
	* at zero is the difference between a layer that is presenting and one that
	* was created and then quietly did nothing.
	*
	* @returns Number of successful uploads since attaching.
	*/
	getUploadCount() {
		return this.uploads;
	}
	/** Stops presenting the layer and returns the video to the scene. */
	detach() {
		const layer = this.layer;
		this.layer = null;
		this.video = null;
		this.sourceWidth = 0;
		this.sourceHeight = 0;
		this.path = "none";
		this.state = "fallback";
		if (layer) try {
			this.manager.remove(layer);
		} finally {
			layer.destroy?.();
		}
	}
};
/**
* Whether this platform treats quad extents as half width and half height.
*
* The spec means full metres and Chromium passes them to OpenXR unchanged, but
* the Quest browser halves them, so the same numbers give a quad at twice the
* size there. It applies to the compositor, not to one binding, so the WebGL
* path needs the same correction on Quest that the media path does.
*
* `XRMediaBinding` is the tell: Quest is the only browser that ships it, and it
* is still present when the WebGL path is taken by choice.
* See immersive-web/layers#324.
*
* @returns True when extents must be halved.
*/
function usesHalfExtents() {
	return typeof XRMediaBinding === "function";
}
/**
* Builds a quad layer the compositor drives itself.
*
* @param video - Element the compositor reads frames from.
* @param session - Session the binding is made against.
* @param space - Space the transform is expressed in.
* @param transform - Where the quad sits.
* @param width - Full width in metres.
* @param height - Full height in metres.
* @returns The layer, or null when the platform refuses it.
*/
function createMediaLayer(video, session, space, transform, width, height) {
	if (typeof XRMediaBinding !== "function") return null;
	const scale = usesHalfExtents() ? .5 : 1;
	try {
		return new XRMediaBinding(session).createQuadLayer(video, {
			space,
			layout: "mono",
			transform,
			width: width * scale,
			height: height * scale
		});
	} catch (error) {
		console.warn("Could not create XR media quad layer:", error);
		return null;
	}
}
/**
* Builds a quad layer the app draws into each frame.
*
* This is the path Chrome and Android XR need, since neither implements
* `XRMediaBinding`.
*
* @param binding - The WebGL binding for the session.
* @param video - Element frames are uploaded from.
* @param space - Space the transform is expressed in.
* @param transform - Where the quad sits.
* @param width - Full width in metres.
* @param height - Full height in metres.
* @returns The layer, or null when the platform refuses it.
*/
function createWebGLLayer(binding, video, space, transform, width, height) {
	if (!binding?.createQuadLayer) return null;
	if (!video.videoWidth || !video.videoHeight) return null;
	const scale = usesHalfExtents() ? .5 : 1;
	try {
		return binding.createQuadLayer({
			space,
			layout: "mono",
			transform,
			width: width * scale,
			height: height * scale,
			viewPixelWidth: video.videoWidth,
			viewPixelHeight: video.videoHeight,
			isStatic: false
		});
	} catch (error) {
		console.warn("Could not create XR WebGL quad layer:", error);
		return null;
	}
}
/**
* Aspect ratio of a video, falling back to 16:9 before metadata arrives.
*
* @param video - The element to measure.
* @returns Width divided by height.
*/
function aspectRatioOf(video) {
	if (video.videoWidth > 0 && video.videoHeight > 0) return video.videoWidth / video.videoHeight;
	return 16 / 9;
}
//#endregion
//#region src/input/strokes/StrokeRecognition.ts
/**
* StrokeRecognizer is a framework Script that handles recording hand stroke gestures
* and recognizing them as geometric shapes using a configured provider.
* It listens to gesture events and tracks specified hand joints to record the path.
*/
var StrokeRecognizer = class extends Script {
	constructor(..._args) {
		super(..._args);
		this.capturedPoints = [];
		this.isActive = false;
		this.isRecording = false;
		this.gestureStartTime = 0;
		this.gestureEndTime = 0;
		this.activeHand = -1;
	}
	static {
		this.dependencies = {
			scene: THREE.Scene,
			camera: THREE.Camera,
			user: User,
			options: StrokeRecognitionOptions
		};
	}
	init({ scene, camera, user, options }) {
		this.scene = scene;
		this.camera = camera;
		this.user = user;
		this.options = options;
		this.configureProvider();
		if (!this.options.enabled) console.info("StrokeRecognizer initialized but disabled. Call options.enableStrokes() to activate.");
	}
	dispose() {}
	configureProvider() {
		const provider = this.options.providerConfig.provider;
		switch (provider) {
			case "onedollar":
				this.recognizer = new OneDollarUnistrokeRecognizer({
					camera: this.camera,
					scene: this.scene,
					supportedShapes: this.options.providerConfig.onedollar.supportedShapes
				});
				break;
			default:
				console.warn(`StrokeRecognizer: provider '${provider}' is unknown; falling back to 'onedollar'.`);
				this.recognizer = new OneDollarUnistrokeRecognizer({
					camera: this.camera,
					scene: this.scene,
					supportedShapes: this.options.providerConfig.onedollar.supportedShapes
				});
		}
	}
	/**
	* Activates the stroke recognizer, enabling gesture tracking and recording.
	*/
	activate() {
		this.isActive = true;
	}
	/**
	* Deactivates the stroke recognizer, cancels recording without an end event,
	* and clears any captured points. The next stroke starts with a fresh delay
	* and hand selection after reactivation.
	* Callers should clear any in-progress stroke UI when deactivating.
	*/
	deactivate() {
		this.isActive = false;
		this.isRecording = false;
		this.gestureStartTime = 0;
		this.gestureEndTime = 0;
		this.activeHand = -1;
		this.clearPoints();
	}
	/**
	* Clears the list of captured points.
	*/
	clearPoints() {
		this.capturedPoints = [];
	}
	/**
	* Adds a point to the current stroke if the maximum point limit has not been reached.
	* @param pos - The world position of the point.
	* @param timestamp - The timestamp when the point was captured.
	*/
	addPoint(pos, timestamp) {
		if (this.capturedPoints.length < this.options.maxPoints) this.capturedPoints.push({
			pos: pos.clone(),
			timestamp
		});
	}
	/**
	* Main update loop. Handles recording points during an active gesture
	* and triggers recognition when the gesture ends.
	*/
	update() {
		if (!this.options.enabled) return;
		if (!this.isActive) return;
		const currentTime = Date.now() / 1e3;
		if (this.user.isSelecting?.()) {
			if (!this.isRecording) {
				this.isRecording = true;
				this.gestureStartTime = currentTime;
				this.clearPoints();
				this.activeHand = 0;
				if (this.user.isSelecting?.(0)) this.activeHand = 0;
				else if (this.user.isSelecting?.(1)) this.activeHand = 1;
				this.dispatchEvent({
					type: "unistrokestart",
					target: this,
					detail: {}
				});
				if (!this.isActive || !this.isRecording) return;
			}
			if (currentTime - this.gestureStartTime > this.options.startDelay) {
				const trackingJoint = this.user.hands?.getJoint(this.options.joint, this.activeHand);
				if (trackingJoint) {
					const worldPos = new THREE.Vector3();
					trackingJoint.getWorldPosition(worldPos);
					this.addPoint(worldPos, currentTime);
					this.dispatchEvent({
						type: "unistrokeupdate",
						target: this,
						detail: { point: worldPos }
					});
				}
			}
		} else if (this.isRecording) {
			this.isRecording = false;
			this.gestureEndTime = currentTime;
			const result = this.recognizeGesture();
			this.dispatchEvent({
				type: "unistrokeend",
				target: this,
				detail: result ? { result } : {}
			});
		}
	}
	/**
	* Calculates the best-fitting plane for a set of 3D points using a simple 3-point estimator.
	* Falls back to camera plane if points are collinear.
	*/
	calculateBestFittingPlane(points) {
		if (points.length < 3) return null;
		const p0 = points[0];
		let p1 = p0;
		let maxDistSq = 0;
		for (const p of points) {
			const d = p.distanceToSquared(p0);
			if (d > maxDistSq) {
				maxDistSq = d;
				p1 = p;
			}
		}
		if (maxDistSq < 1e-4) return null;
		let p2 = p0;
		let maxLineDistSq = 0;
		const line = new THREE.Line3(p0, p1);
		const closestPoint = new THREE.Vector3();
		for (const p of points) {
			line.closestPointToPoint(p, false, closestPoint);
			const distSq = p.distanceToSquared(closestPoint);
			if (distSq > maxLineDistSq) {
				maxLineDistSq = distSq;
				p2 = p;
			}
		}
		if (maxLineDistSq < 1e-4) return null;
		const origin = p0;
		const u = new THREE.Vector3().subVectors(p1, p0).normalize();
		const plane = new THREE.Plane().setFromCoplanarPoints(p0, p1, p2);
		return {
			origin,
			u,
			v: new THREE.Vector3().crossVectors(plane.normal, u).normalize()
		};
	}
	/**
	* Filters captured points, projects them to a 2D plane, and calls the backend recognizer.
	* Uses best-fitting plane if possible, otherwise falls back to camera viewport plane.
	* @returns The recognition result or null if not enough points were captured.
	*/
	recognizeGesture() {
		const cutoffTime = this.gestureEndTime - this.options.endDelay;
		const filteredPoints = this.capturedPoints.filter((p) => p.timestamp <= cutoffTime);
		if (filteredPoints.length > 10) {
			const points3D = filteredPoints.map((p) => p.pos);
			const bestFittingPlane = this.calculateBestFittingPlane(points3D);
			let points2D;
			if (bestFittingPlane) points2D = points3D.map((p) => {
				const v = new THREE.Vector3().subVectors(p, bestFittingPlane.origin);
				return {
					x: v.dot(bestFittingPlane.u),
					y: v.dot(bestFittingPlane.v)
				};
			});
			else points2D = points3D.map((p) => {
				const localPos = p.clone().applyMatrix4(this.camera.matrixWorldInverse);
				return {
					x: localPos.x,
					y: localPos.y
				};
			});
			return this.recognizer.recognize(points2D);
		}
		return null;
	}
};
//#endregion
//#region src/input/gestures/poseEstimators/MediaPipeHandPoseEstimator.ts
const MEDIAPIPE_JOINT_INDEX = {
	wrist: 0,
	"thumb-metacarpal": 1,
	"thumb-phalanx-proximal": 2,
	"thumb-phalanx-distal": 3,
	"thumb-tip": 4,
	"index-finger-phalanx-proximal": 5,
	"index-finger-phalanx-intermediate": 6,
	"index-finger-phalanx-distal": 7,
	"index-finger-tip": 8,
	"middle-finger-phalanx-proximal": 9,
	"middle-finger-phalanx-intermediate": 10,
	"middle-finger-phalanx-distal": 11,
	"middle-finger-tip": 12,
	"ring-finger-phalanx-proximal": 13,
	"ring-finger-phalanx-intermediate": 14,
	"ring-finger-phalanx-distal": 15,
	"ring-finger-tip": 16,
	"pinky-finger-phalanx-proximal": 17,
	"pinky-finger-phalanx-intermediate": 18,
	"pinky-finger-phalanx-distal": 19,
	"pinky-finger-tip": 20
};
const ESTIMATED_METACARPALS = {
	"index-finger-metacarpal": 5,
	"middle-finger-metacarpal": 9,
	"ring-finger-metacarpal": 13,
	"pinky-finger-metacarpal": 17
};
const METACARPAL_INTERPOLATION = .65;
var MediaPipeHandContext = class {
	constructor(handedness, handLabel, landmarks) {
		this.handedness = handedness;
		this.handLabel = handLabel;
		this.joints = createJointMapFromLandmarks(landmarks);
	}
	getJoint(jointName) {
		return this.joints.get(jointName);
	}
};
var MediaPipeHandPoseEstimator = class {
	async init() {}
	getHandContext(_handedness) {
		return null;
	}
	getHandContexts() {
		return {};
	}
};
function createJointMapFromLandmarks(landmarks) {
	const joints = /* @__PURE__ */ new Map();
	for (const [jointName, index] of Object.entries(MEDIAPIPE_JOINT_INDEX)) {
		const landmark = landmarks[index];
		if (!landmark) continue;
		joints.set(jointName, landmarkToVector(landmark));
	}
	const wristLandmark = landmarks[0];
	if (!wristLandmark) return joints;
	for (const [jointName, index] of Object.entries(ESTIMATED_METACARPALS)) {
		const knuckleLandmark = landmarks[index];
		if (!knuckleLandmark) continue;
		const wrist = landmarkToVector(wristLandmark);
		const knuckle = landmarkToVector(knuckleLandmark);
		joints.set(jointName, wrist.lerp(knuckle, METACARPAL_INTERPOLATION));
	}
	return joints;
}
function landmarkToVector(landmark) {
	return new THREE.Vector3(.5 - landmark.x, .5 - landmark.y, -(landmark.z ?? 0));
}
//#endregion
//#region src/input/gestures/poseEstimators/TensorFlowHandPoseEstimator.ts
var TensorFlowHandPoseEstimator = class {
	async init() {}
	getHandContext(_handedness) {
		return null;
	}
	getHandContexts() {
		return {};
	}
};
//#endregion
//#region src/utils/VersionCheck.ts
function checkThreeVersion() {
	if (parseInt(THREE.REVISION) < 182) console.error(`three.js version ${THREE.REVISION} is too old. Please update to version 182 or higher.`);
}
//#endregion
//#region src/singletons.ts
checkThreeVersion();
/**
* The global singleton instance of Core, serving as the main entry point
* for the entire XR system. This binding is stable for the module lifetime;
* disposing Core is terminal.
*/
const core = new Core();
/**
* A direct alias to the main `THREE.Scene` instance managed by the core.
* Use this to add or remove objects from your XR experience.
* @example
* ```
* const myObject = new THREE.Mesh();
* scene.add(myObject);
* ```
*/
const scene = core.scene;
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
const user = core.user;
/**
* A direct alias to the `World` instance, which manages real-world
* understanding features like plane detection and object detection.
*/
const world = core.world;
/**
* A direct alias to the `Context` instance, which provides agent-facing
* observations such as semantic trees, visible objects, and Set-of-Mark views.
*/
const context = core.context;
/**
* A direct alias to the `AI` instance for integrating generative AI features,
* including multi-modal understanding, image generation, and live conversation.
*/
const ai = core.ai;
/**
* A direct alias to the `Depth` instance, which manages depth sensing features.
*/
const depth = core.depth;
/**
* A direct alias to the `Timer` instance, which manages time deltas.
*/
const timer = core.timer;
/**
* A direct alias to the `CoreSound` instance, which manages audio.
*/
const sound = core.sound;
/**
* A direct alias to the `Input` instance, which manages inputs like controllers and hands.
*/
const input = core.input;
/**
* A direct alias to the `THREE.PerspectiveCamera` instance.
*/
const camera = core.camera;
/**
* A shortcut for `core.scene.add()`. Adds one or more objects to the scene.
* @param object - The object(s) to add.
* @see {@link three#Object3D.add}
*/
function add(...object) {
	return scene.add(...object);
}
/**
* A shortcut for `core.init()`. Initializes the XR Blocks system and starts
* the render loop. This is the main entry point for any application.
* @param options - Configuration options for the session.
* @see {@link Core.init}
*/
function init(options = new Options()) {
	return core.init(options);
}
/**
* Manually initializes a Script and resolves after its dependencies and
* lifecycle initialization are complete.
*/
function initScript(script) {
	return core.scriptsManager.initScript(script);
}
/**
* A shortcut for `core.timer.getDelta()`. Gets the time in seconds since
* the last frame, useful for animations.
* @returns The delta time in seconds.
* @see {@link THREE.Timer.getDelta}
*/
function getDeltaTime() {
	return core.timer.getDelta();
}
/**
* Gets elapsed time in seconds from the simulation or render clock.
* Simulation time excludes pauses and is the default.
* @param clock - Clock used to measure elapsed time.
* @returns The elapsed time in seconds.
*/
function getElapsedTime(clock = "simulation") {
	return clock === "simulation" ? core.elapsedTime : core.timer.getElapsed();
}
/**
* Retrieves the left camera from the stereoscopic XR camera rig.
* @returns The left eye's camera.
*/
function getXrCameraLeft() {
	return core.renderer.xr.getCamera().cameras[0];
}
/**
* Retrieves the right camera from the stereoscopic XR camera rig.
* @returns The right eye's camera.
*/
function getXrCameraRight() {
	return core.renderer.xr.getCamera().cameras[1];
}
//#endregion
//#region src/stereo/utils.ts
/**
* Sets the given object and all its children to only be visible in the left
* eye.
* @param obj - Object to show only in the left eye.
* @returns The original object.
*/
function showOnlyInLeftEye(obj) {
	obj.layers.set(1);
	obj.children.forEach((child) => {
		showOnlyInLeftEye(child);
	});
	return obj;
}
/**
* Sets the given object and all its children to only be visible in the right
* eye.
* @param obj - Object to show only in the right eye.
* @returns The original object.
*/
function showOnlyInRightEye(obj) {
	obj.layers.set(2);
	obj.children.forEach((child) => {
		showOnlyInRightEye(child);
	});
	return obj;
}
/**
* Loads a stereo image from a URL and returns two THREE.Texture objects, one
* for the left eye and one for the right eye.
* @param url - The URL of the stereo image.
* @returns A promise that resolves to an array containing the left and right
*     eye textures.
*/
async function loadStereoImageAsTextures(url) {
	const image = await new Promise((resolve, reject) => {
		new THREE.ImageLoader().load(url, resolve, void 0, reject);
	});
	const leftTexture = new THREE.Texture();
	leftTexture.image = image;
	leftTexture.repeat.x = .5;
	leftTexture.needsUpdate = true;
	const rightTexture = leftTexture.clone();
	rightTexture.offset.x = .5;
	rightTexture.needsUpdate = true;
	return [leftTexture, rightTexture];
}
//#endregion
//#region src/placement/FaceCamera.ts
/** Rotates its parent to face the active camera. */
var FaceCamera = class extends TransformScript {
	static {
		this.dependencies = {
			camera: THREE.Camera,
			timer: THREE.Timer
		};
	}
	constructor(options = {}) {
		super();
		this.worldPosition = new THREE.Vector3();
		this.cameraPosition = new THREE.Vector3();
		this.parentWorldQuaternion = new THREE.Quaternion();
		this.targetQuaternion = new THREE.Quaternion();
		this.faceCameraScratch = {
			target: new THREE.Vector3(),
			matrix: new THREE.Matrix4(),
			worldQuaternion: new THREE.Quaternion()
		};
		this.mode = options.mode ?? "capsule";
		this.capsuleHalfHeight = options.capsuleHalfHeight ?? .25;
		this.smoothing = options.smoothing ?? .1;
	}
	init({ camera, timer }) {
		this.camera = camera;
		this.timer = timer;
	}
	update() {
		const object = this.parent;
		if (!this.canUpdate || !object || !this.camera || !this.timer) return;
		object.getWorldPosition(this.worldPosition);
		this.camera.getWorldPosition(this.cameraPosition);
		const parentWorldQuaternion = object.parent?.getWorldQuaternion(this.parentWorldQuaternion);
		const targetQuaternion = faceCameraQuaternion(this.worldPosition, this.cameraPosition, parentWorldQuaternion, this.mode, this.capsuleHalfHeight, this.targetQuaternion, this.faceCameraScratch);
		if (!targetQuaternion) return;
		const alpha = faceCameraSlerpAlpha(this.smoothing, this.timer.getDelta());
		object.quaternion.slerp(targetQuaternion, alpha);
	}
};
//#endregion
//#region src/placement/FollowHead.ts
/** Moves its parent toward an offset in camera space. */
var FollowHead = class extends TransformScript {
	static {
		this.dependencies = {
			camera: THREE.Camera,
			timer: THREE.Timer
		};
	}
	constructor(options) {
		super();
		this.target = new THREE.Vector3();
		this.cameraWorldPosition = new THREE.Vector3();
		this.cameraWorldQuaternion = new THREE.Quaternion();
		this.objectWorldPosition = new THREE.Vector3();
		this.offset = options.offset.clone();
		this.smoothing = options.smoothing ?? .1;
	}
	init({ camera, timer }) {
		this.camera = camera;
		this.timer = timer;
	}
	update() {
		const object = this.parent;
		if (!this.canUpdate || !object || !this.camera || !this.timer) return;
		this.camera.getWorldPosition(this.cameraWorldPosition);
		this.camera.getWorldQuaternion(this.cameraWorldQuaternion);
		this.target.copy(this.offset).applyQuaternion(this.cameraWorldQuaternion).add(this.cameraWorldPosition);
		object.parent?.worldToLocal(this.target);
		const alpha = 1 - Math.exp(-this.smoothing * this.timer.getDelta() * 60);
		object.position.lerp(this.target, alpha);
	}
	rebase() {
		const object = this.parent;
		if (!object || !this.camera) return;
		object.getWorldPosition(this.objectWorldPosition);
		this.camera.getWorldPosition(this.cameraWorldPosition);
		this.camera.getWorldQuaternion(this.cameraWorldQuaternion);
		this.offset.copy(this.objectWorldPosition).sub(this.cameraWorldPosition).applyQuaternion(this.cameraWorldQuaternion.invert());
	}
};
//#endregion
//#region src/placement/FollowObject.ts
/** Copies position, rotation, or both from another object to its parent. */
var FollowObject = class extends TransformScript {
	constructor(options) {
		super();
		this.targetWorldPosition = new THREE.Vector3();
		this.targetWorldQuaternion = new THREE.Quaternion();
		this.objectWorldPosition = new THREE.Vector3();
		this.objectWorldQuaternion = new THREE.Quaternion();
		this.parentWorldQuaternion = new THREE.Quaternion();
		this.target = options.target;
		this.mode = options.mode ?? "position";
		this.positionOffset = options.positionOffset?.clone() ?? new THREE.Vector3();
		this.rotationOffset = options.rotationOffset?.clone() ?? new THREE.Quaternion();
	}
	update() {
		const object = this.parent;
		if (!this.canUpdate || !object) return;
		if (this.mode === "position" || this.mode === "pose") {
			this.target.getWorldPosition(this.targetWorldPosition);
			this.targetWorldPosition.add(this.positionOffset);
			object.parent?.worldToLocal(this.targetWorldPosition);
			object.position.copy(this.targetWorldPosition);
		}
		if (this.mode === "rotation" || this.mode === "pose") {
			this.target.getWorldQuaternion(this.targetWorldQuaternion);
			this.targetWorldQuaternion.multiply(this.rotationOffset);
			if (object.parent) {
				object.parent.getWorldQuaternion(this.parentWorldQuaternion);
				this.targetWorldQuaternion.premultiply(this.parentWorldQuaternion.invert());
			}
			object.quaternion.copy(this.targetWorldQuaternion);
		}
	}
	rebase() {
		const object = this.parent;
		if (!object) return;
		if (this.mode === "position" || this.mode === "pose") {
			object.getWorldPosition(this.objectWorldPosition);
			this.target.getWorldPosition(this.targetWorldPosition);
			this.positionOffset.copy(this.objectWorldPosition).sub(this.targetWorldPosition);
		}
		if (this.mode === "rotation" || this.mode === "pose") {
			object.getWorldQuaternion(this.objectWorldQuaternion);
			this.target.getWorldQuaternion(this.targetWorldQuaternion);
			this.rotationOffset.copy(this.targetWorldQuaternion).invert().multiply(this.objectWorldQuaternion);
		}
	}
};
//#endregion
//#region src/placement/Orbit.ts
const TAU = Math.PI * 2;
const EPSILON = 1e-8;
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const NEGATIVE_Z_AXIS = new THREE.Vector3(0, 0, -1);
const WORLD_FRAME = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X_AXIS, NEGATIVE_Z_AXIS, Y_AXIS));
/**
* Moves its parent around a target focus.
*
* Bounds are captured during initialization and after `resume()`. Call
* `resume()` after changing geometry or scale to refresh overlap avoidance.
*/
var Orbit = class extends TransformScript {
	static {
		this.dependencies = {
			camera: THREE.Camera,
			timer: THREE.Timer
		};
	}
	constructor(options) {
		super();
		this.meanAnomaly = 0;
		this.precessionAngle = 0;
		this.orientation = new THREE.Quaternion();
		this.frameQuaternion = new THREE.Quaternion();
		this.precessionQuaternion = new THREE.Quaternion();
		this.orbitQuaternion = new THREE.Quaternion();
		this.basisMatrix = new THREE.Matrix4();
		this.targetPosition = new THREE.Vector3();
		this.ownerPosition = new THREE.Vector3();
		this.worldPosition = new THREE.Vector3();
		this.orbitOffset = new THREE.Vector3();
		this.normal = new THREE.Vector3();
		this.tangent = new THREE.Vector3();
		this.cameraPosition = new THREE.Vector3();
		this.cameraUp = new THREE.Vector3();
		this.worldQuaternion = new THREE.Quaternion();
		if (!options?.target) throw new Error("Orbit requires a target object.");
		this.target = options.target;
		this.configuredRadius = positive(options.radius ?? .5, "radius");
		this.semiMajorRadius = this.configuredRadius;
		this.period = positive(options.period ?? 20, "period");
		const path = oneOf(options.path ?? "circular", ["circular", "elliptical"], "path");
		const eccentricity = options.eccentricity ?? (path === "elliptical" ? .2 : 0);
		if (path === "circular" && eccentricity !== 0) throw new Error("Circular Orbit paths require zero eccentricity.");
		this.eccentricity = range(eccentricity, 0, 1, "eccentricity");
		this.minorAxisScale = Math.sqrt(1 - this.eccentricity ** 2);
		this.frame = oneOf(options.frame ?? "world", [
			"world",
			"target",
			"view"
		], "frame");
		this.precessionPeriod = optionalPositive(options.precessionPeriod, "precessionPeriod");
		this.orientation.setFromAxisAngle(X_AXIS, finite(options.inclination ?? 0, "inclination"));
		const direction = oneOf(options.direction ?? "counterclockwise", ["clockwise", "counterclockwise"], "direction");
		this.directionSign = direction === "clockwise" ? -1 : 1;
		this.clearance = nonnegative(options.clearance ?? 0, "clearance");
	}
	init({ camera, timer }) {
		this.camera = camera;
		this.timer = timer;
		const owner = this.parent;
		if (!owner) return;
		if (isAncestorOrSelf(owner, this.target) || isAncestorOrSelf(this.target, owner)) throw new Error("Orbit target must not be its owner, ancestor, or descendant.");
		this.semiMajorRadius = this.configuredRadius;
		this.applyClearance(owner);
		this.updateOrbitOrientation();
	}
	update() {
		const owner = this.parent;
		if (!this.canUpdate || !owner || !this.timer) return;
		const delta = this.timer.getDelta();
		if (!Number.isFinite(delta) || delta <= 0) return;
		this.meanAnomaly = normalizeAngle(this.meanAnomaly + this.directionSign * (TAU * delta / this.period));
		if (this.precessionPeriod !== void 0) this.precessionAngle = normalizeAngle(this.precessionAngle + TAU * delta / this.precessionPeriod);
		this.updateOrbitOrientation();
		this.applyPosition(owner);
	}
	/** Restarts the orbit from the parent's manipulated position. */
	rebase() {
		const owner = this.parent;
		if (!owner) return;
		this.updateOrbitOrientation();
		owner.getWorldPosition(this.ownerPosition);
		this.orbitOffset.copy(this.ownerPosition).sub(this.targetPosition);
		const distance = this.orbitOffset.length();
		if (distance > EPSILON) {
			this.rebasePlane(this.orbitOffset.multiplyScalar(1 / distance));
			this.semiMajorRadius = distance / (1 - this.eccentricity);
			this.meanAnomaly = 0;
		}
		this.applyClearance(owner);
		this.updateOrbitOrientation();
		this.applyPosition(owner);
	}
	updateOrbitOrientation() {
		this.updateFrame();
		this.precessionQuaternion.setFromAxisAngle(Z_AXIS, this.precessionAngle);
		this.orbitQuaternion.copy(this.frameQuaternion).multiply(this.precessionQuaternion).multiply(this.orientation).normalize();
	}
	updateFrame() {
		this.target.getWorldPosition(this.targetPosition);
		if (this.frame === "world") {
			this.frameQuaternion.copy(WORLD_FRAME);
			return;
		}
		if (this.frame === "target") {
			this.target.getWorldQuaternion(this.frameQuaternion).multiply(WORLD_FRAME);
			return;
		}
		const camera = this.camera;
		if (!camera) {
			this.frameQuaternion.copy(WORLD_FRAME);
			return;
		}
		camera.getWorldPosition(this.cameraPosition);
		camera.getWorldQuaternion(this.worldQuaternion);
		this.cameraUp.copy(camera.up).applyQuaternion(this.worldQuaternion);
		this.basisMatrix.lookAt(this.cameraPosition, this.targetPosition, this.cameraUp);
		this.frameQuaternion.setFromRotationMatrix(this.basisMatrix);
	}
	rebasePlane(direction) {
		this.normal.copy(Z_AXIS).applyQuaternion(this.orbitQuaternion);
		projectOntoPlane(this.normal, direction);
		if (this.normal.lengthSq() <= EPSILON) {
			this.normal.copy(Y_AXIS);
			projectOntoPlane(this.normal, direction);
		}
		if (this.normal.lengthSq() <= EPSILON) {
			this.normal.copy(X_AXIS);
			projectOntoPlane(this.normal, direction);
		}
		this.normal.normalize();
		this.tangent.crossVectors(this.normal, direction).normalize();
		this.basisMatrix.makeBasis(direction, this.tangent, this.normal);
		this.orbitQuaternion.setFromRotationMatrix(this.basisMatrix);
		this.orientation.copy(this.frameQuaternion).multiply(this.precessionQuaternion).invert().multiply(this.orbitQuaternion).normalize();
	}
	applyPosition(owner) {
		const eccentricAnomaly = solveKepler(this.meanAnomaly, this.eccentricity);
		this.orbitOffset.set(this.semiMajorRadius * (Math.cos(eccentricAnomaly) - this.eccentricity), this.semiMajorRadius * this.minorAxisScale * Math.sin(eccentricAnomaly), 0);
		this.orbitOffset.applyQuaternion(this.orbitQuaternion);
		this.worldPosition.copy(this.targetPosition).add(this.orbitOffset);
		owner.parent?.worldToLocal(this.worldPosition);
		owner.position.copy(this.worldPosition);
	}
	applyClearance(owner) {
		const minimumPeriapsis = worldBoundingRadius(this.target) + worldBoundingRadius(owner) + this.clearance;
		this.semiMajorRadius = Math.max(this.semiMajorRadius, minimumPeriapsis / (1 - this.eccentricity));
	}
};
function projectOntoPlane(vector, normal) {
	vector.addScaledVector(normal, -vector.dot(normal));
}
function worldBoundingRadius(object) {
	object.updateWorldMatrix(true, true);
	const bounds = new THREE.Box3().setFromObject(object);
	if (bounds.isEmpty()) return 0;
	const origin = object.getWorldPosition(new THREE.Vector3());
	const x = Math.max(Math.abs(bounds.min.x - origin.x), Math.abs(bounds.max.x - origin.x));
	const y = Math.max(Math.abs(bounds.min.y - origin.y), Math.abs(bounds.max.y - origin.y));
	const z = Math.max(Math.abs(bounds.min.z - origin.z), Math.abs(bounds.max.z - origin.z));
	return Math.hypot(x, y, z);
}
function solveKepler(meanAnomaly, eccentricity) {
	if (eccentricity === 0) return meanAnomaly;
	let mean = normalizeAngle(meanAnomaly);
	if (mean > Math.PI) mean -= TAU;
	let lower = -Math.PI;
	let upper = Math.PI;
	let eccentricAnomaly = eccentricity < .8 || mean === 0 ? mean : Math.sign(mean) * Math.PI;
	for (let iteration = 0; iteration < 16; iteration += 1) {
		const error = eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly) - mean;
		if (Math.abs(error) <= 1e-12) return eccentricAnomaly;
		if (error > 0) upper = eccentricAnomaly;
		else lower = eccentricAnomaly;
		const derivative = 1 - eccentricity * Math.cos(eccentricAnomaly);
		const next = eccentricAnomaly - error / derivative;
		eccentricAnomaly = Number.isFinite(next) && next > lower && next < upper ? next : (lower + upper) * .5;
	}
	return eccentricAnomaly;
}
function normalizeAngle(angle) {
	const normalized = angle % TAU;
	return normalized < 0 ? normalized + TAU : normalized;
}
function finite(value, name) {
	if (!Number.isFinite(value)) throw new Error(`Orbit ${name} must be finite.`);
	return value;
}
function positive(value, name) {
	finite(value, name);
	if (value <= 0) throw new Error(`Orbit ${name} must be greater than zero.`);
	return value;
}
function optionalPositive(value, name) {
	return value === void 0 ? void 0 : positive(value, name);
}
function nonnegative(value, name) {
	finite(value, name);
	if (value < 0) throw new Error(`Orbit ${name} must be nonnegative.`);
	return value;
}
function range(value, min, max, name) {
	finite(value, name);
	if (value < min || value >= max) throw new Error(`Orbit ${name} must be in [${min}, ${max}).`);
	return value;
}
function oneOf(value, choices, name) {
	if (!choices.includes(value)) throw new Error(`Orbit ${name} must be ${choices.join(" or ")}.`);
	return value;
}
function isAncestorOrSelf(object, possibleAncestor) {
	for (let current = object; current; current = current.parent) if (current === possibleAncestor) return true;
	return false;
}
//#endregion
//#region src/placement/VisibilityTransition.ts
/** Animates its parent's visibility with a scale transition. */
var VisibilityTransition = class extends TransformScript {
	static {
		this.dependencies = { timer: THREE.Timer };
	}
	constructor(options = {}) {
		super();
		this.visibleScale = new THREE.Vector3(1, 1, 1);
		this.progress = 1;
		this.targetVisible = true;
		this.animating = false;
		this.duration = options.duration ?? .3;
	}
	init({ timer }) {
		this.timer = timer;
		if (!this.parent) return;
		this.targetVisible = this.parent.visible;
		this.progress = this.targetVisible ? 1 : 0;
		if (this.targetVisible) this.visibleScale.copy(this.parent.scale);
	}
	show() {
		if (!this.parent) return;
		this.parent.visible = true;
		this.targetVisible = true;
		this.animating = true;
	}
	hide() {
		if (!this.parent) return;
		if (this.progress >= 1) this.visibleScale.copy(this.parent.scale);
		this.targetVisible = false;
		this.animating = true;
	}
	toggle() {
		if (this.targetVisible) this.hide();
		else this.show();
	}
	update() {
		if (!this.canUpdate || !this.parent || !this.timer || !this.animating) return;
		const direction = this.targetVisible ? 1 : -1;
		const delta = Math.min(this.timer.getDelta(), .1);
		this.progress = THREE.MathUtils.clamp(this.progress + direction * (delta / Math.max(this.duration, .001)), 0, 1);
		const eased = 1 - (1 - this.progress) * (1 - this.progress);
		this.parent.scale.copy(this.visibleScale).multiplyScalar(eased);
		if (this.progress === 0 || this.progress === 1) {
			this.animating = false;
			if (this.progress === 0) this.parent.visible = false;
		}
	}
};
//#endregion
//#region src/ui/components/UIButton.ts
/** A semantic button that activates after a valid captured press and release. */
var UIButton = class extends UIElement {
	constructor({ label, icon, ariaLabel, disabled = false, onClick, children, ...options } = {}) {
		if (typeof disabled !== "boolean") throw new Error("UIButton disabled must be a boolean.");
		if (children?.length && (label !== void 0 || icon !== void 0)) throw new Error("UIButton convenience label/icon content cannot be combined with children.");
		if (!ariaLabel && !label) throw new Error("UIButton requires ariaLabel when it has no text label.");
		super("button", {
			...options,
			children
		});
		this.name = "UIButton";
		this._disabled = false;
		this._label = label;
		this._icon = icon;
		this._ariaLabel = ariaLabel;
		this._disabled = disabled;
		this.onClick = onClick;
		registerSemanticControl(this, {
			kind: "button",
			isDisabled: () => this._disabled,
			activate: () => this.onClick?.()
		});
	}
	get label() {
		return this._label;
	}
	set label(value) {
		this.assertConvenienceContent(value);
		const previous = this._label;
		this._label = value;
		try {
			this.assertAccessibleName();
		} catch (error) {
			this._label = previous;
			throw error;
		}
		this.markUIDirty();
	}
	get icon() {
		return this._icon;
	}
	set icon(value) {
		this.assertConvenienceContent(value);
		this._icon = value;
		this.assertAccessibleName();
		this.markUIDirty();
	}
	get ariaLabel() {
		return this._ariaLabel ?? this._label;
	}
	set ariaLabel(value) {
		const previous = this._ariaLabel;
		this._ariaLabel = value;
		try {
			this.assertAccessibleName();
		} catch (error) {
			this._ariaLabel = previous;
			throw error;
		}
		this.markUIDirty();
	}
	get disabled() {
		return this._disabled;
	}
	set disabled(value) {
		if (typeof value !== "boolean") throw new Error("UIButton disabled must be a boolean.");
		if (value === this._disabled) return;
		this._disabled = value;
		this.markUIDirty();
	}
	onObjectSelectStart(event) {
		event.stopPropagation();
	}
	onObjectSelectEnd(event) {
		event.stopPropagation();
	}
	add(...objects) {
		if (objects.some(isUIElement) && (this._label !== void 0 || this._icon !== void 0)) throw new Error("UIButton convenience label/icon content cannot be combined with children.");
		return super.add(...objects);
	}
	assertConvenienceContent(value) {
		if (this.children.some(isUIElement) && value !== void 0) throw new Error("UIButton convenience label/icon content cannot be combined with children.");
	}
	assertAccessibleName() {
		if (!this._ariaLabel && !this._label) throw new Error("UIButton requires an accessible name.");
	}
};
//#endregion
//#region src/ui/components/UIIcon.ts
/** One Material Symbol icon. */
var UIIcon = class extends UIElement {
	constructor({ icon, variant = "outlined", weight = 400, filled = false, ariaLabel, ...options }) {
		if (!icon) throw new Error("UIIcon requires an icon name.");
		validateVariant(variant);
		validateWeight(weight);
		if (typeof filled !== "boolean") throw new Error("UIIcon filled must be a boolean.");
		super("icon", options);
		this.name = "UIIcon";
		this._icon = icon;
		this._variant = variant;
		this._weight = weight;
		this._filled = filled;
		this.ariaLabel = ariaLabel;
	}
	get icon() {
		return this._icon;
	}
	set icon(value) {
		if (!value) throw new Error("UIIcon.icon must be a non-empty string.");
		if (value === this._icon) return;
		this._icon = value;
		this.markUIDirty();
	}
	get variant() {
		return this._variant;
	}
	set variant(value) {
		validateVariant(value);
		if (value === this._variant) return;
		this._variant = value;
		this.markUIDirty();
	}
	get weight() {
		return this._weight;
	}
	set weight(value) {
		validateWeight(value);
		if (value === this._weight) return;
		this._weight = value;
		this.markUIDirty();
	}
	get filled() {
		return this._filled;
	}
	set filled(value) {
		if (typeof value !== "boolean") throw new Error("UIIcon filled must be a boolean.");
		if (value === this._filled) return;
		this._filled = value;
		this.markUIDirty();
	}
};
function validateVariant(value) {
	if (![
		"outlined",
		"rounded",
		"sharp"
	].includes(value)) throw new Error("UIIcon variant must be outlined, rounded, or sharp.");
}
function validateWeight(value) {
	if (![
		100,
		200,
		300,
		400,
		500,
		600,
		700
	].includes(value)) throw new Error("UIIcon weight must be from 100 to 700 in steps of 100.");
}
//#endregion
//#region src/ui/components/UIImage.ts
/** URL-backed or caller-texture-backed image content. */
var UIImage = class extends UIElement {
	constructor({ src, ariaLabel, ...options }) {
		if (typeof src !== "string" && !(src instanceof THREE.Texture)) throw new Error("UIImage.src must be a URL or THREE.Texture.");
		super("image", options);
		this.name = "UIImage";
		this._src = src;
		this.ariaLabel = ariaLabel;
	}
	get src() {
		return this._src;
	}
	set src(value) {
		if (typeof value !== "string" && !(value instanceof THREE.Texture)) throw new Error("UIImage.src must be a URL or THREE.Texture.");
		if (value === this._src) return;
		this._src = value;
		this.markUIDirty();
	}
};
//#endregion
//#region src/ui/components/UIPanel.ts
/** A passive flex-layout and visual grouping element. */
var UIPanel = class extends UIElement {
	constructor(options = {}) {
		super("panel", options);
		this.name = "UIPanel";
	}
};
//#endregion
//#region src/ui/components/UISlider.ts
/** A horizontal slider with one exclusive captured interaction. */
var UISlider = class extends UIElement {
	constructor({ ariaLabel, min = 0, max = 1, step = .01, value = 0, disabled = false, onInput, onChange, ...options }) {
		if (!ariaLabel) throw new Error("UISlider requires ariaLabel.");
		if (typeof disabled !== "boolean") throw new Error("UISlider disabled must be a boolean.");
		validateRange(min, max, step);
		validateValue(value);
		super("slider", options);
		this.name = "UISlider";
		this.interactionChanged = false;
		this.ariaLabel = ariaLabel;
		this._min = min;
		this._max = max;
		this._step = step;
		this._value = quantize(value, min, max, step);
		this._disabled = disabled;
		this.onInput = onInput;
		this.onChange = onChange;
		registerSemanticControl(this, {
			kind: "slider",
			isDisabled: () => this._disabled,
			activate: () => {},
			begin: (input) => this.beginInput(input),
			update: (input) => this.updateInput(input),
			complete: () => this.completeInput(),
			cancel: () => this.cancelInput()
		});
	}
	get min() {
		return this._min;
	}
	set min(value) {
		validateRange(value, this._max, this._step);
		this._min = value;
		this.requantizeInteraction();
	}
	get max() {
		return this._max;
	}
	set max(value) {
		validateRange(this._min, value, this._step);
		this._max = value;
		this.requantizeInteraction();
	}
	get step() {
		return this._step;
	}
	set step(value) {
		validateRange(this._min, this._max, value);
		this._step = value;
		this.requantizeInteraction();
	}
	get value() {
		return this._value;
	}
	set value(value) {
		this.setProgrammaticValue(value);
	}
	get disabled() {
		return this._disabled;
	}
	set disabled(value) {
		if (typeof value !== "boolean") throw new Error("UISlider disabled must be a boolean.");
		if (value === this._disabled) return;
		this._disabled = value;
		this.markUIDirty();
	}
	onObjectSelectStart(event) {
		event.stopPropagation();
	}
	onObjectSelectEnd(event) {
		event.stopPropagation();
	}
	beginInput(input) {
		this.interactionStart = this._value;
		this.interactionChanged = false;
		this.updateInput(input);
	}
	updateInput(input) {
		const ratio = clamp(input.uv?.x ?? .5, 0, 1);
		const next = quantize(this._min + ratio * (this._max - this._min), this._min, this._max, this._step);
		if (next === this._value) return;
		this._value = next;
		this.interactionChanged = true;
		this.markUIDirty();
		this.onInput?.(next);
	}
	completeInput() {
		if (this.interactionStart === void 0) return;
		const changed = this.interactionChanged;
		this.interactionStart = void 0;
		this.interactionChanged = false;
		if (changed) this.onChange?.(this._value);
	}
	cancelInput() {
		if (this.interactionStart === void 0) return;
		const original = this.interactionStart;
		this.interactionStart = void 0;
		this.interactionChanged = false;
		if (original === this._value) return;
		this._value = original;
		this.markUIDirty();
		this.onInput?.(original);
	}
	setProgrammaticValue(value) {
		validateValue(value);
		const next = quantize(value, this._min, this._max, this._step);
		if (this.interactionStart !== void 0) {
			this.interactionStart = next;
			this.interactionChanged = false;
		}
		if (next === this._value) return;
		this._value = next;
		this.markUIDirty();
	}
	requantizeInteraction() {
		const next = quantize(this._value, this._min, this._max, this._step);
		if (this.interactionStart !== void 0) {
			this.interactionStart = quantize(this.interactionStart, this._min, this._max, this._step);
			this.interactionChanged = next !== this.interactionStart;
		}
		if (next !== this._value) this._value = next;
		this.markUIDirty();
	}
};
function validateRange(min, max, step) {
	if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(step) || min > max || step <= 0) throw new Error("UISlider requires finite values with min <= max and step > 0.");
}
function validateValue(value) {
	if (!Number.isFinite(value)) throw new Error("UISlider value must be finite.");
}
function quantize(value, min, max, step) {
	const stepped = min + Math.round((value - min) / step) * step;
	return clamp(Number(stepped.toPrecision(12)), min, max);
}
//#endregion
//#region src/utils/ModelUtils.ts
/**
* Calculates the bounding box for a group of THREE.Object3D instances.
*
* @param objects - An array of THREE.Object3D instances.
* @returns The computed THREE.Box3.
*/
function getGroupBoundingBox(objects) {
	const bbox = new THREE.Box3();
	if (objects.length === 0) return bbox;
	const parentReferences = /* @__PURE__ */ new Map();
	for (const child of objects) {
		if (child.parent) {
			parentReferences.set(child, child.parent);
			child.removeFromParent();
		}
		bbox.expandByObject(child, true);
	}
	for (const [child, parent] of parentReferences.entries()) parent.add(child);
	return bbox;
}
//#endregion
//#region src/utils/SparkRendererHolder.ts
var SparkRendererHolder = class {
	constructor(renderer) {
		this.renderer = renderer;
	}
};
//#endregion
//#region src/ui/model/ModelViewerPlatform.ts
const CORNER_RADIUS = .03;
const SEGMENTS = 5;
const MAX_OPACITY = .5;
const FADE_SPEED = 2;
/** Private visual and translation surface owned by ModelViewer. */
var ModelViewerPlatform = class extends THREE.Mesh {
	constructor(width, depth, thickness) {
		const faceMaterial = createMaterial();
		const sideMaterial = createMaterial();
		super(createPlatformGeometry(width, depth, thickness), [faceMaterial, sideMaterial]);
		this.opacity = 0;
		this.targetOpacity = 0;
		this.xb = { manipulationHandle: { action: ManipulationAction.Translate } };
		this.userData.xrblocksPrivate = true;
	}
	setHovered(hovered) {
		this.targetOpacity = hovered ? MAX_OPACITY : 0;
	}
	update(deltaSeconds) {
		const difference = this.targetOpacity - this.opacity;
		const step = Math.min(Math.abs(difference), FADE_SPEED * deltaSeconds);
		this.opacity += Math.sign(difference) * step;
		const [faceMaterial, sideMaterial] = this.material;
		faceMaterial.opacity = .5 * this.opacity;
		sideMaterial.opacity = this.opacity;
	}
	dispose() {
		this.removeFromParent();
		this.geometry.dispose();
		for (const material of this.material) material.dispose();
		super.dispose();
	}
};
function createMaterial() {
	return new THREE.MeshLambertMaterial({
		color: 16777215,
		transparent: true,
		depthWrite: false,
		opacity: 0
	});
}
/** Builds the existing rounded slab look with Three.js geometry primitives. */
function createPlatformGeometry(width, depth, thickness) {
	const bevel = thickness / 2;
	const shapeWidth = Math.max(width - 2 * bevel, bevel);
	const shapeDepth = Math.max(depth - 2 * bevel, bevel);
	const radius = Math.max(0, Math.min(CORNER_RADIUS - bevel, shapeWidth / 2, shapeDepth / 2));
	const geometry = new THREE.ExtrudeGeometry(createRoundedRectangle(shapeWidth, shapeDepth, radius), {
		depth: 0,
		steps: 1,
		curveSegments: SEGMENTS,
		bevelEnabled: true,
		bevelSegments: SEGMENTS,
		bevelSize: bevel,
		bevelThickness: bevel
	});
	geometry.center();
	geometry.rotateX(Math.PI / 2);
	geometry.computeBoundingBox();
	return geometry;
}
function createRoundedRectangle(width, height, radius) {
	const left = -width / 2;
	const right = width / 2;
	const bottom = -height / 2;
	const top = height / 2;
	const shape = new THREE.Shape();
	shape.moveTo(left + radius, bottom);
	shape.lineTo(right - radius, bottom);
	shape.quadraticCurveTo(right, bottom, right, bottom + radius);
	shape.lineTo(right, top - radius);
	shape.quadraticCurveTo(right, top, right - radius, top);
	shape.lineTo(left + radius, top);
	shape.quadraticCurveTo(left, top, left, top - radius);
	shape.lineTo(left, bottom + radius);
	shape.quadraticCurveTo(left, bottom, left + radius, bottom);
	return shape;
}
//#endregion
//#region src/ui/model/ModelViewer.ts
const PLATFORM_MARGIN = .2;
const PLATFORM_THICKNESS = .02;
const ROTATION_PROXY_MAX_ASPECT = 2;
const ROTATION_PROXY_PADDING_RATIO = .2;
const ROTATION_PROXY_MIN_PADDING = .01;
const ROTATION_PROXY_MAX_PADDING = .05;
const GLTF_EXTENSIONS = /* @__PURE__ */ new Set(["gltf", "glb"]);
const SPLAT_EXTENSIONS = /* @__PURE__ */ new Set([
	"ply",
	"spz",
	"splat",
	"ksplat"
]);
var RotationHitSurface = class extends THREE.Mesh {
	constructor(bounds) {
		const size = bounds.getSize(new THREE.Vector3());
		const halfX = .5 * size.x;
		const halfZ = .5 * size.z;
		const shortRadius = Math.min(halfX, halfZ);
		const maxRadius = shortRadius * ROTATION_PROXY_MAX_ASPECT;
		const padding = THREE.MathUtils.clamp(shortRadius * ROTATION_PROXY_PADDING_RATIO, ROTATION_PROXY_MIN_PADDING, ROTATION_PROXY_MAX_PADDING);
		const geometry = new THREE.CylinderGeometry(1, 1, 1);
		geometry.scale(Math.min(halfX, maxRadius) + padding, Math.max(size.y, .001), Math.min(halfZ, maxRadius) + padding);
		super(geometry, new THREE.MeshBasicMaterial({
			colorWrite: false,
			depthWrite: false
		}));
		bounds.getCenter(this.position);
		this.xb = { manipulationHandle: { action: ManipulationAction.Rotate } };
		this.userData.xrblocksPrivate = true;
	}
	dispose() {
		this.removeFromParent();
		this.geometry.dispose();
		this.material.dispose();
		super.dispose();
	}
};
/** Loads and presents one interactive glTF or Gaussian Splat model. */
var ModelViewer = class extends Script {
	static {
		this.dependencies = {
			depth: Depth,
			interaction: Interaction,
			scene: THREE.Scene,
			rendererHolder: RendererHolder,
			registry: Registry,
			timer: THREE.Timer
		};
	}
	constructor({ origin = "bottom-center", manipulation, platformMargin = PLATFORM_MARGIN, autoplay = true, occlusion = false, castShadow = true, receiveShadow = true } = {}) {
		super();
		this.loader = new ModelLoader();
		this.boundingBox = new THREE.Box3();
		this.visualRoot = new THREE.Object3D();
		this.animationActions = [];
		this.occludableMaterials = /* @__PURE__ */ new WeakSet();
		this.occludableShaders = /* @__PURE__ */ new Set();
		this.hoveringControllers = /* @__PURE__ */ new Set();
		this.unregisterHitSurfaces = [];
		this.loadGeneration = 0;
		this.acceptingLoads = true;
		this.name = "ModelViewer";
		this.visualRoot.name = "ModelViewerVisual";
		this.visualRoot.xb = { pointerEvents: "none" };
		this.add(this.visualRoot);
		this.origin = origin;
		this.platformMargin = typeof platformMargin === "number" ? new THREE.Vector2(platformMargin, platformMargin) : new THREE.Vector2(platformMargin.x, platformMargin.y);
		this.autoplay = autoplay;
		this.occlusionEnabled = occlusion;
		this.castShadow = castShadow;
		this.receiveShadow = receiveShadow;
		this.manipulation = manipulation ?? true;
	}
	get manipulation() {
		return this.xb?.manipulation;
	}
	set manipulation(value) {
		this.xb ??= {};
		this.xb.manipulation = normalizeViewerManipulation(value);
		this.syncInteractionSurfaces();
	}
	async init({ depth, interaction, scene, rendererHolder, registry, timer }) {
		this.clearHitRegistrations();
		if (this.depth && this.depth !== depth) this.unregisterOcclusionShaders(this.depth);
		this.acceptingLoads = true;
		this.depth = depth;
		this.interaction = interaction;
		this.scene = scene;
		this.renderer = rendererHolder.renderer;
		this.registry = registry;
		this.timer = timer;
		for (const shader of this.occludableShaders) depth.occludableShaders.add(shader);
		if (this.splatMesh) await this.createSparkRendererIfNeeded();
		this.syncInteractionSurfaces();
	}
	/** Replaces the current model. The file format is inferred from the URL. */
	async load(source) {
		const request = normalizeSource(source);
		const extension = fileExtension(request.url);
		if (GLTF_EXTENSIONS.has(extension)) {
			const generation = this.beginModelLoad();
			await this.loadGLTF(request, generation);
			return;
		}
		if (SPLAT_EXTENSIONS.has(extension)) {
			if (request.path) throw new Error("ModelViewer source.path is only supported for glTF.");
			const generation = this.beginModelLoad();
			await this.loadSplat(request, generation);
			return;
		}
		throw new Error(`ModelViewer does not support .${extension || "(none)"}.`);
	}
	/**
	* Presents an existing Three.js object. The caller retains ownership of its
	* geometry, materials, and textures.
	*/
	setContent(content) {
		this.beginModelLoad();
		const bounds = getGroupBoundingBox([content]);
		alignOrigin(content, bounds, this.origin);
		this.contentRoot = content;
		this.boundingBox.copy(bounds);
		this.visualRoot.add(content);
		this.finishModelLoad();
	}
	/** Plays every animation in the loaded glTF. */
	playAnimation({ once = false } = {}) {
		for (const action of this.animationActions) {
			action.reset();
			action.clampWhenFinished = once;
			action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
			action.play();
		}
	}
	update() {
		const delta = this.timer?.getDelta() ?? 0;
		this.animationMixer?.update(delta);
		this.platform?.update(delta);
	}
	onHoverEnter(event) {
		this.hoveringControllers.add(event.source.controller);
		this.platform?.setHovered(true);
	}
	onHoverExit(event) {
		this.hoveringControllers.delete(event.source.controller);
		if (this.hoveringControllers.size === 0) this.platform?.setHovered(false);
	}
	dispose() {
		this.acceptingLoads = false;
		this.loadGeneration++;
		this.releaseLoadedModel();
		this.hoveringControllers.clear();
		this.depth = void 0;
		this.interaction = void 0;
		this.scene = void 0;
		this.renderer = void 0;
		this.registry = void 0;
		this.timer = void 0;
		super.dispose();
	}
	async loadGLTF(source, generation) {
		const gltf = await this.loader.loadGLTF({
			path: source.path,
			url: source.url,
			renderer: this.renderer
		});
		if (!this.isModelLoadCurrent(generation)) {
			disposeObjectTree(gltf.scene);
			throw this.staleModelLoadError();
		}
		applyAssetTransform(gltf.scene, source);
		const bounds = getGroupBoundingBox([gltf.scene]);
		alignOrigin(gltf.scene, bounds, this.origin);
		this.gltf = gltf;
		this.contentRoot = gltf.scene;
		this.boundingBox.copy(bounds);
		this.visualRoot.add(gltf.scene);
		this.setupAnimations(gltf);
		this.finishModelLoad();
	}
	async loadSplat(source, generation) {
		const splatMesh = await this.loader.loadSplat({ url: source.url });
		if (!this.isModelLoadCurrent(generation)) {
			splatMesh.dispose();
			throw this.staleModelLoadError();
		}
		const root = new THREE.Object3D();
		root.add(splatMesh);
		applyAssetTransform(root, source);
		root.updateMatrix();
		const bounds = splatMesh.boundingBox.clone().applyMatrix4(root.matrix);
		if (!this.isModelLoadCurrent(generation)) {
			splatMesh.dispose();
			root.clear();
			throw this.staleModelLoadError();
		}
		alignOrigin(root, bounds, this.origin);
		this.splatMesh = splatMesh;
		this.contentRoot = root;
		this.boundingBox.copy(bounds);
		this.visualRoot.add(root);
		await this.createSparkRendererIfNeeded(generation);
		this.assertModelLoadCurrent(generation);
		this.finishModelLoad();
	}
	finishModelLoad() {
		this.syncInteractionSurfaces();
	}
	setupAnimations(gltf) {
		if (gltf.animations.length === 0) return;
		this.animationMixer = new THREE.AnimationMixer(gltf.scene);
		for (const clip of gltf.animations) {
			const action = this.animationMixer.clipAction(clip);
			this.animationActions.push(action);
			if (this.autoplay) action.play();
		}
	}
	syncInteractionSurfaces() {
		this.clearHitRegistrations();
		this.replaceRotationHitSurface();
		this.replacePlatform();
		if (!this.contentRoot) return;
		const config = normalizeManipulationConfig(this.xb?.manipulation);
		if (this.boundingBox.isEmpty()) {
			this.applyShadows();
			if (this.occlusionEnabled) this.applyOcclusion();
			return;
		}
		if (config?.rotate) {
			const rotationHitSurface = new RotationHitSurface(this.boundingBox);
			this.rotationHitSurface = rotationHitSurface;
			this.add(rotationHitSurface);
			this.registerHitSurface(rotationHitSurface);
		}
		if (config?.translate) {
			const size = this.boundingBox.getSize(new THREE.Vector3());
			const center = this.boundingBox.getCenter(new THREE.Vector3());
			const platform = new ModelViewerPlatform(size.x + this.platformMargin.x, size.z + this.platformMargin.y, PLATFORM_THICKNESS);
			platform.position.set(center.x, this.boundingBox.min.y - PLATFORM_THICKNESS / 2, center.z);
			platform.setHovered(this.hoveringControllers.size > 0);
			this.platform = platform;
			this.add(platform);
			this.registerHitSurface(platform);
		}
		this.applyShadows();
		if (this.occlusionEnabled) this.applyOcclusion();
	}
	registerHitSurface(physical) {
		if (!this.interaction) return;
		this.unregisterHitSurfaces.push(this.interaction.registerHitSurface(physical, this));
	}
	clearHitRegistrations() {
		for (const unregister of this.unregisterHitSurfaces) unregister();
		this.unregisterHitSurfaces.length = 0;
	}
	replaceRotationHitSurface(next) {
		this.rotationHitSurface?.dispose();
		this.rotationHitSurface = next;
		if (next) this.add(next);
	}
	replacePlatform(next) {
		this.platform?.dispose();
		this.platform = next;
		if (next) this.add(next);
	}
	applyShadows() {
		this.contentRoot?.traverse((object) => {
			object.castShadow = this.castShadow;
			object.receiveShadow = this.receiveShadow;
		});
		if (this.platform) {
			this.platform.castShadow = false;
			this.platform.receiveShadow = false;
		}
	}
	applyOcclusion() {
		if (!this.gltf) return;
		this.gltf.scene.traverse((object) => {
			const mesh = object;
			if (!mesh.isMesh) return;
			mesh.layers.enable(3);
			for (const material of asMaterials(mesh.material)) this.makeMaterialOccludable(material);
		});
		if (this.platform) {
			this.platform.layers.enable(3);
			for (const material of this.platform.material) this.makeMaterialOccludable(material);
		}
	}
	makeMaterialOccludable(material) {
		if (this.occludableMaterials.has(material)) return;
		this.occludableMaterials.add(material);
		OcclusionUtils.addOcclusionToMaterial(material, (shader) => {
			this.registerOccludableShader(shader);
		});
	}
	registerOccludableShader(shader) {
		this.occludableShaders.add(shader);
		this.depth?.occludableShaders.add(shader);
	}
	unregisterOcclusionShaders(depth = this.depth) {
		if (!depth) return;
		for (const shader of this.occludableShaders) depth.occludableShaders.delete(shader);
	}
	async createSparkRendererIfNeeded(generation = this.loadGeneration) {
		const renderer = this.registry?.get(THREE.WebGLRenderer);
		if (!this.splatMesh || !this.scene || !renderer || !this.registry) return;
		const { SparkRenderer } = await import("@sparkjsdev/spark");
		if (!this.isModelLoadCurrent(generation)) return;
		let sparkRenderer;
		this.scene.traverse((object) => {
			if (object instanceof SparkRenderer) sparkRenderer = object;
		});
		if (!sparkRenderer) {
			sparkRenderer = new SparkRenderer({
				renderer,
				maxStdDev: Math.sqrt(4)
			});
			this.scene.add(sparkRenderer);
		}
		if (!this.registry.get(SparkRendererHolder)) this.registry.register(new SparkRendererHolder(sparkRenderer));
	}
	beginModelLoad() {
		if (!this.acceptingLoads) throw new Error("ModelViewer cannot load content after disposal.");
		const generation = ++this.loadGeneration;
		this.releaseLoadedModel();
		return generation;
	}
	isModelLoadCurrent(generation) {
		return this.acceptingLoads && generation === this.loadGeneration;
	}
	assertModelLoadCurrent(generation) {
		if (!this.isModelLoadCurrent(generation)) throw this.staleModelLoadError();
	}
	staleModelLoadError() {
		return /* @__PURE__ */ new Error("ModelViewer load was superseded or disposed.");
	}
	releaseLoadedModel() {
		this.clearHitRegistrations();
		this.replaceRotationHitSurface();
		this.replacePlatform();
		this.unregisterOcclusionShaders();
		this.occludableShaders.clear();
		this.animationMixer?.stopAllAction();
		if (this.animationMixer && this.gltf) this.animationMixer.uncacheRoot(this.gltf.scene);
		this.animationMixer = void 0;
		this.animationActions.length = 0;
		if (this.gltf) {
			this.gltf.scene.removeFromParent();
			disposeObjectTree(this.gltf.scene);
			this.gltf = void 0;
		}
		if (this.splatMesh) {
			this.splatMesh.removeFromParent();
			this.splatMesh.dispose();
			this.splatMesh = void 0;
		}
		this.contentRoot?.removeFromParent();
		this.contentRoot = void 0;
		this.boundingBox.makeEmpty();
	}
};
function normalizeViewerManipulation(value) {
	if (value === void 0 || value === true) return {
		actions: {
			translate: true,
			rotate: true,
			scale: true
		},
		handle: { action: ManipulationAction.Rotate }
	};
	return value;
}
function normalizeSource(source) {
	return typeof source === "string" ? { url: source } : source;
}
function fileExtension(url) {
	const cleanUrl = url.split(/[?#]/, 1)[0];
	const dot = cleanUrl.lastIndexOf(".");
	return dot > cleanUrl.lastIndexOf("/") ? cleanUrl.slice(dot + 1).toLowerCase() : "";
}
function applyAssetTransform(root, source) {
	if (typeof source.scale === "number") root.scale.setScalar(source.scale);
	else if (source.scale) root.scale.copy(source.scale);
	if (source.rotation) root.rotation.set(source.rotation.x, source.rotation.y, source.rotation.z);
}
function alignOrigin(root, bounds, origin) {
	if (origin === "source" || bounds.isEmpty()) return;
	const translation = bounds.getCenter(new THREE.Vector3()).multiplyScalar(-1);
	if (origin === "bottom-center") translation.y = -bounds.min.y;
	root.position.add(translation);
	bounds.translate(translation);
}
function asMaterials(material) {
	return Array.isArray(material) ? material : [material];
}
//#endregion
//#region src/video/VideoFileStream.ts
/**
* VideoFileStream handles video playback from a file source.
*/
var VideoFileStream = class extends VideoStream {
	/**
	* @param options - Configuration for the file stream.
	*/
	constructor({ videoFile = void 0, willCaptureFrequently = false } = {}) {
		super({ willCaptureFrequently });
		this.videoFile_ = videoFile;
	}
	/**
	* Initializes the file stream based on the given video file.
	*/
	async init() {
		await super.init();
		if (this.videoFile_) {
			this.setState_("initializing");
			await this.initStream_();
		} else {
			console.warn("VideoFileStream initialized without a video file.");
			this.setState_("idle");
		}
	}
	/**
	* Initializes the video stream from the provided file.
	*/
	async initStream_() {
		if (!this.videoFile_) throw new Error("No video file has been provided.");
		this.stop_();
		this.video_.srcObject = null;
		this.video_.src = typeof this.videoFile_ === "string" ? this.videoFile_ : URL.createObjectURL(this.videoFile_);
		this.video_.loop = true;
		this.video_.muted = true;
		await new Promise((resolve, reject) => {
			this.video_.onloadedmetadata = () => {
				this.handleVideoStreamLoadedMetadata(resolve, reject);
			};
			this.video_.onerror = () => {
				const error = /* @__PURE__ */ new Error("Error occurred while loading the video file.");
				this.setState_("error", { error });
				reject(error);
			};
			this.video_.play();
		});
		this.setState_("streaming", {
			width: this.width,
			height: this.height,
			aspectRatio: this.aspectRatio,
			videoFile: this.videoFile_
		});
	}
	/**
	* Sets a new video file source and re-initializes the stream.
	* @param videoFile - The new video file to play.
	*/
	async setSource(videoFile) {
		if (!videoFile) {
			console.warn("setSource called with no file. Stopping stream.");
			this.stop_();
			this.videoFile_ = void 0;
			return;
		}
		this.setState_("initializing");
		this.videoFile_ = videoFile;
		await this.initStream_();
	}
};
//#endregion
//#region src/world/anchors/AnchoredObjects.ts
/**
* Builds a pose, using the platform type when it exists.
*
* XRRigidTransform is a browser global that is absent outside a WebXR-capable
* page, so constructing it unconditionally would make this unusable under test
* and in the simulator. The simulated path only reads position and orientation,
* and a real device always provides the constructor.
*
* @param position - World position.
* @param quaternion - World orientation.
* @returns A pose accepted by the anchor subsystem.
*/
function makePose(position, quaternion) {
	const p = {
		x: position.x,
		y: position.y,
		z: position.z
	};
	const o = {
		x: quaternion.x,
		y: quaternion.y,
		z: quaternion.z,
		w: quaternion.w
	};
	const Ctor = globalThis.XRRigidTransform;
	return Ctor ? new Ctor(p, o) : {
		position: p,
		orientation: o
	};
}
/**
* Keeps `THREE.Object3D`s attached to spatial anchors.
*
* {@link AnchorManager} deals in anchors and poses; every app on top of it
* otherwise repeats the same work of holding a map from anchor to object and
* copying poses across each frame. This owns that, so an app anchors an object
* and then forgets about it.
*/
var AnchoredObjects = class {
	/**
	* @param manager - The anchor subsystem to attach through.
	* @param parent - Object to add anchored content to, usually the scene.
	*/
	constructor(manager, parent) {
		this.manager = manager;
		this.parent = parent;
		this.objects = /* @__PURE__ */ new Map();
	}
	/**
	* Anchors an object where it currently sits, and saves it.
	*
	* @param object - Object to pin. Added to the parent if not already in it.
	* @param label - Label to restore it by later.
	* @returns The tracked anchor, or null when anchoring is unavailable.
	*/
	async anchor(object, label) {
		const position = new THREE.Vector3();
		const quaternion = new THREE.Quaternion();
		object.getWorldPosition(position);
		object.getWorldQuaternion(quaternion);
		const tracked = await this.manager.create(makePose(position, quaternion), label);
		if (!tracked) return null;
		await this.manager.persist(tracked.id);
		if (object.parent !== this.parent) this.parent.add(object);
		this.objects.set(tracked.id, object);
		return tracked;
	}
	/**
	* Rebuilds objects for every anchor saved in a previous session.
	*
	* @param factory - Builds the object for a restored anchor.
	* @returns How many objects were restored.
	*/
	async restore(factory) {
		let restored = 0;
		for (const result of await this.manager.restoreAll()) {
			if (result.status !== "restored" || !result.anchor) continue;
			if (this.objects.has(result.anchor.id)) continue;
			const object = factory(result.record.label, result.record);
			if (!object) continue;
			this.parent.add(object);
			this.objects.set(result.anchor.id, object);
			restored++;
		}
		return restored;
	}
	/**
	* Moves every attached object onto its anchor's current pose.
	*
	* Call once per frame. Anchors drift as the platform refines its map of the
	* room, which is the whole point of anchoring rather than storing a position.
	*
	* @param referenceSpace - Space to read poses in. Not needed for simulated
	*     anchors, which hold their own pose.
	*/
	update(referenceSpace) {
		for (const [id, object] of this.objects) {
			const pose = this.manager.getPose(id, referenceSpace);
			if (!pose) continue;
			const { position, orientation } = pose.transform;
			object.position.set(position.x, position.y, position.z);
			object.quaternion.set(orientation.x, orientation.y, orientation.z, orientation.w);
		}
	}
	/**
	* Detaches an anchored object and forgets its anchor.
	* @param id - Id of the anchor to remove.
	*/
	remove(id) {
		const object = this.objects.get(id);
		if (object) {
			this.parent.remove(object);
			this.objects.delete(id);
		}
		this.manager.delete(id);
	}
	/**
	* The object attached to an anchor.
	* @param id - Id of the anchor.
	* @returns The object, or undefined.
	*/
	get(id) {
		return this.objects.get(id);
	}
	/**
	* Every attached object, keyed by anchor id.
	* @returns The attached objects.
	*/
	getAll() {
		return this.objects;
	}
	/** Detaches everything and forgets every saved anchor. */
	clear() {
		for (const id of [...this.objects.keys()]) this.remove(id);
		this.manager.forgetAll();
	}
};
//#endregion
//#region src/world/segmentation/SegmentationMask.ts
/**
* Per-pixel semantic categories emitted by the selfie multiclass segmentation
* model. Index `0` is the background; every other index is part of a person,
* so anything `>= 1` can be treated as foreground.
*/
let SegmentCategory = /* @__PURE__ */ function(SegmentCategory) {
	SegmentCategory[SegmentCategory["Background"] = 0] = "Background";
	SegmentCategory[SegmentCategory["Hair"] = 1] = "Hair";
	SegmentCategory[SegmentCategory["BodySkin"] = 2] = "BodySkin";
	SegmentCategory[SegmentCategory["FaceSkin"] = 3] = "FaceSkin";
	SegmentCategory[SegmentCategory["Clothes"] = 4] = "Clothes";
	SegmentCategory[SegmentCategory["Others"] = 5] = "Others";
	return SegmentCategory;
}({});
//#endregion
//#region src/entry.ts
registerDebugGlobals(/* @__PURE__ */ __exportAll({
	AI: () => AI,
	AIOptions: () => AIOptions,
	ActiveControllers: () => ActiveControllers,
	Agent: () => Agent,
	AnchorManager: () => AnchorManager,
	AnchoredObjects: () => AnchoredObjects,
	AnchorsOptions: () => AnchorsOptions,
	AudioListener: () => AudioListener,
	AudioPlayer: () => AudioPlayer,
	BACK: () => BACK,
	BackgroundMusic: () => BackgroundMusic,
	CategoryVolumes: () => CategoryVolumes,
	Context: () => Context,
	ContextOptions: () => ContextOptions,
	Core: () => Core,
	CoreSound: () => CoreSound,
	DEFAULT_DEVICE_CAMERA_HEIGHT: () => 720,
	DEFAULT_DEVICE_CAMERA_WIDTH: () => DEFAULT_DEVICE_CAMERA_WIDTH,
	DEFAULT_RGB_TO_DEPTH_PARAMS: () => DEFAULT_RGB_TO_DEPTH_PARAMS,
	DEVICE_CAMERA_PARAMETERS: () => DEVICE_CAMERA_PARAMETERS,
	DOWN: () => DOWN,
	Depth: () => Depth,
	DepthMesh: () => DepthMesh,
	DepthMeshOptions: () => DepthMeshOptions,
	DepthOptions: () => DepthOptions,
	DepthTextures: () => DepthTextures,
	DetectedBodyPose: () => DetectedBodyPose,
	DetectedFace: () => DetectedFace,
	DetectedMesh: () => DetectedMesh,
	DetectedObject: () => DetectedObject,
	DetectedPlane: () => DetectedPlane,
	DeviceCameraOptions: () => DeviceCameraOptions,
	FINGER_ORDER: () => FINGER_ORDER,
	FORWARD: () => FORWARD,
	FaceCamera: () => FaceCamera,
	FaceLandmarkName: () => FaceLandmarkName,
	FaceRecognizer: () => FaceRecognizer,
	FacesOptions: () => FacesOptions,
	FollowHead: () => FollowHead,
	FollowObject: () => FollowObject,
	GEMINI_DEFAULT_FLASH_MODEL: () => GEMINI_DEFAULT_FLASH_MODEL,
	GEMINI_DEFAULT_IMAGE_MODEL: () => GEMINI_DEFAULT_IMAGE_MODEL,
	GEMINI_DEFAULT_LIVE_MODEL: () => GEMINI_DEFAULT_LIVE_MODEL,
	GamepadBindings: () => GamepadBindings,
	GamepadController: () => GamepadController,
	GazeController: () => GazeController,
	Gemini: () => Gemini,
	GeminiOptions: () => GeminiOptions,
	GenerateSkyboxTool: () => GenerateSkyboxTool,
	GestureRecognition: () => GestureRecognition,
	GestureRecognitionOptions: () => GestureRecognitionOptions,
	GetWeatherTool: () => GetWeatherTool,
	HAND_BONE_IDX_CONNECTION_MAP: () => HAND_BONE_IDX_CONNECTION_MAP,
	HAND_INDEX_TO_LABEL: () => HAND_INDEX_TO_LABEL,
	HAND_JOINT_COUNT: () => 25,
	HAND_JOINT_IDX_CONNECTION_MAP: () => HAND_JOINT_IDX_CONNECTION_MAP,
	HAND_JOINT_NAMES: () => HAND_JOINT_NAMES,
	Handedness: () => Handedness,
	Hands: () => Hands,
	HandsOptions: () => HandsOptions,
	HeadGestureRecognition: () => HeadGestureRecognition,
	HeadGestureRecognitionOptions: () => HeadGestureRecognitionOptions,
	HeuristicGestureRecognizer: () => HeuristicGestureRecognizer,
	HeuristicHeadGestureRecognizer: () => HeuristicHeadGestureRecognizer,
	HumanRecognizer: () => HumanRecognizer,
	HumansOptions: () => HumansOptions,
	Input: () => Input,
	InputOptions: () => InputOptions,
	Interaction: () => Interaction,
	InteractionOptions: () => InteractionOptions,
	Keycodes: () => Keycodes,
	LEFT: () => LEFT,
	LEFT_VIEW_ONLY_LAYER: () => 1,
	LayerManager: () => LayerManager,
	LayersOptions: () => LayersOptions,
	Lighting: () => Lighting,
	LightingOptions: () => LightingOptions,
	LoadingSpinnerManager: () => LoadingSpinnerManager,
	LocalStorageAnchorStore: () => LocalStorageAnchorStore,
	ManipulationAction: () => ManipulationAction,
	MediaPipeHandContext: () => MediaPipeHandContext,
	MediaPipeHandPoseEstimator: () => MediaPipeHandPoseEstimator,
	MeshDetectionOptions: () => MeshDetectionOptions,
	MeshDetector: () => MeshDetector,
	MeshScript: () => MeshScript,
	ModelLoader: () => ModelLoader,
	ModelViewer: () => ModelViewer,
	MouseController: () => MouseController,
	NUM_HANDS: () => 2,
	OCCLUDABLE_ITEMS_LAYER: () => 3,
	ObjectDetector: () => ObjectDetector,
	ObjectsOptions: () => ObjectsOptions,
	OcclusionPass: () => OcclusionPass,
	OcclusionUtils: () => OcclusionUtils,
	OpenAI: () => OpenAI,
	OpenAIOptions: () => OpenAIOptions,
	Options: () => Options,
	Orbit: () => Orbit,
	Physics: () => Physics,
	PhysicsOptions: () => PhysicsOptions,
	PlaneDetector: () => PlaneDetector,
	PlanesOptions: () => PlanesOptions,
	PoseJointName: () => PoseJointName,
	RENDERER_BACKENDS: () => RENDERER_BACKENDS,
	RIGHT: () => RIGHT,
	RIGHT_VIEW_ONLY_LAYER: () => 2,
	Registry: () => Registry,
	ReticleOptions: () => ReticleOptions,
	Reticles: () => Reticles,
	SIMULATOR_HAND_COMMON_BIOMECHANICAL_CONSTRAINTS_DEGREES: () => SIMULATOR_HAND_COMMON_BIOMECHANICAL_CONSTRAINTS_DEGREES,
	SIMULATOR_HAND_POSE_NAMES: () => SIMULATOR_HAND_POSE_NAMES,
	SIMULATOR_HAND_POSE_ROTATIONS: () => SIMULATOR_HAND_POSE_ROTATIONS,
	SOUND_PRESETS: () => SOUND_PRESETS,
	SceneDetector: () => SceneDetector,
	SceneOptions: () => SceneOptions,
	SceneSetOfMarkOptions: () => SceneSetOfMarkOptions,
	SceneVisibilityOptions: () => SceneVisibilityOptions,
	ScreenshotSynthesizer: () => ScreenshotSynthesizer,
	Script: () => Script,
	ScriptMixin: () => ScriptMixin,
	ScriptsManager: () => ScriptsManager,
	ScriptsManagerEventType: () => ScriptsManagerEventType,
	SegmentCategory: () => SegmentCategory,
	SegmentationOptions: () => SegmentationOptions,
	Segmenter: () => Segmenter,
	SetSimulatorEnvironmentEvent: () => SetSimulatorEnvironmentEvent,
	SetSimulatorHandPhysicsEvent: () => SetSimulatorHandPhysicsEvent,
	SetSimulatorModeEvent: () => SetSimulatorModeEvent,
	ShowSimulatorInstructionsEvent: () => ShowSimulatorInstructionsEvent,
	SimulatorAnchor: () => SimulatorAnchor,
	SimulatorHandPose: () => SimulatorHandPose,
	SimulatorHandPoseChangeRequestEvent: () => SimulatorHandPoseChangeRequestEvent,
	SimulatorMode: () => SimulatorMode,
	SimulatorOptions: () => SimulatorOptions,
	SkyboxAgent: () => SkyboxAgent,
	SoundOptions: () => SoundOptions,
	SoundSynthesizer: () => SoundSynthesizer,
	SparkRendererHolder: () => SparkRendererHolder,
	SpatialAudio: () => SpatialAudio,
	SpeechRecognizer: () => SpeechRecognizer,
	SpeechRecognizerOptions: () => SpeechRecognizerOptions,
	SpeechSynthesizer: () => SpeechSynthesizer,
	SpeechSynthesizerOptions: () => SpeechSynthesizerOptions,
	StreamState: () => StreamState,
	StrokeRecognizer: () => StrokeRecognizer,
	StylizedFace: () => StylizedFace,
	TensorFlowHandPoseEstimator: () => TensorFlowHandPoseEstimator,
	Tool: () => Tool,
	TransformScript: () => TransformScript,
	UIButton: () => UIButton,
	UICard: () => UICard,
	UIElement: () => UIElement,
	UIIcon: () => UIIcon,
	UIImage: () => UIImage,
	UIOverlay: () => UIOverlay,
	UIPanel: () => UIPanel,
	UIScrollView: () => UIScrollView,
	UISlider: () => UISlider,
	UIText: () => UIText,
	UITextInput: () => UITextInput,
	UP: () => UP,
	User: () => User,
	VIEW_DEPTH_GAP: () => VIEW_DEPTH_GAP,
	VideoFileStream: () => VideoFileStream,
	VideoLayer: () => VideoLayer,
	VideoStream: () => VideoStream,
	VisibilityTransition: () => VisibilityTransition,
	VolumeCategory: () => VolumeCategory,
	WaitFrame: () => WaitFrame,
	WebXRHandContext: () => WebXRHandContext,
	WebXRHandPoseEstimator: () => WebXRHandPoseEstimator,
	WebXRSessionEventType: () => WebXRSessionEventType,
	WebXRSessionManager: () => WebXRSessionManager,
	World: () => World,
	WorldOptions: () => WorldOptions,
	XRButton: () => XRButton,
	XRDeviceCamera: () => XRDeviceCamera,
	XREffects: () => XREffects,
	XRPass: () => XRPass,
	XRReferenceSpaceCache: () => XRReferenceSpaceCache,
	XRTransitionOptions: () => XRTransitionOptions,
	XR_BLOCKS_ASSETS_PATH: () => XR_BLOCKS_ASSETS_PATH,
	ZERO_VECTOR3: () => ZERO_VECTOR3,
	ZERO_VISEME: () => ZERO_VISEME,
	_getBvhImportStatus: () => _getBvhImportStatus,
	add: () => add,
	ai: () => ai,
	anchorCapability: () => anchorCapability,
	applyBVH: () => applyBVH,
	applySimulatorHandPoseRotationConstraints: () => applySimulatorHandPoseRotationConstraints,
	aspectRatioOf: () => aspectRatioOf,
	assertWebGLRenderer: () => assertWebGLRenderer,
	average: () => average,
	buildDisplacementMap: () => buildDisplacementMap,
	callInitWithDependencyInjection: () => callInitWithDependencyInjection,
	camera: () => camera,
	clamp: () => clamp,
	clamp01: () => clamp01,
	clampRotationToAngle: () => clampRotationToAngle,
	computeBillboardScale: () => computeBillboardScale,
	context: () => context,
	core: () => core,
	cropImage: () => cropImage,
	defaultAnchorStorageKey: () => defaultAnchorStorageKey,
	depth: () => depth,
	detectDeviceCameraTarget: () => detectDeviceCameraTarget,
	disposeBVH: () => disposeBVH,
	disposeMaterial: () => disposeMaterial,
	disposeMeshResources: () => disposeMeshResources,
	disposeObjectChildren: () => disposeObjectChildren,
	disposeObjectTree: () => disposeObjectTree,
	disposeRenderableResources: () => disposeRenderableResources,
	enableAcceleratedRaycast: () => enableAcceleratedRaycast,
	estimateBackgroundColor: () => estimateBackgroundColor,
	estimateHandScale: () => estimateHandScale,
	extractYaw: () => extractYaw,
	getAdjacentFingerSpreads: () => getAdjacentFingerSpreads,
	getBoneVectors: () => getBoneVectors,
	getCameraParametersSnapshot: () => getCameraParametersSnapshot,
	getColorHex: () => getColorHex,
	getDeltaTime: () => getDeltaTime,
	getDeviceCameraClipFromView: () => getDeviceCameraClipFromView,
	getDeviceCameraWorldFromClip: () => getDeviceCameraWorldFromClip,
	getDeviceCameraWorldFromView: () => getDeviceCameraWorldFromView,
	getElapsedTime: () => getElapsedTime,
	getFingerBendAngles: () => getFingerBendAngles,
	getFingerCurl: () => getFingerCurl,
	getFingerDirection: () => getFingerDirection,
	getFingerJoint: () => getFingerJoint,
	getFingerPalmAlignment: () => getFingerPalmAlignment,
	getFingerSpread: () => getFingerSpread,
	getFingerStraightness: () => getFingerStraightness,
	getFingertipDistance: () => getFingertipDistance,
	getFingertipPalmDistance: () => getFingertipPalmDistance,
	getObjectTargetPoint: () => getObjectTargetPoint,
	getPalmNormal: () => getPalmNormal,
	getPalmPose: () => getPalmPose,
	getPalmRight: () => getPalmRight,
	getPalmUp: () => getPalmUp,
	getPalmWidth: () => getPalmWidth,
	getRelativeBoneAngles: () => getRelativeBoneAngles,
	getThumbBendAngles: () => getThumbBendAngles,
	getThumbCurl: () => getThumbCurl,
	getThumbDirection: () => getThumbDirection,
	getThumbOpposition: () => getThumbOpposition,
	getThumbStraightness: () => getThumbStraightness,
	getThumbVerticalDirection: () => getThumbVerticalDirection,
	getUIPresentationObject: () => getUIPresentationObject,
	getUrlParamBool: () => getUrlParamBool,
	getUrlParamFloat: () => getUrlParamFloat,
	getUrlParamInt: () => getUrlParamInt,
	getUrlParameter: () => getUrlParameter,
	getVec4ByColorString: () => getVec4ByColorString,
	getXrCameraLeft: () => getXrCameraLeft,
	getXrCameraRight: () => getXrCameraRight,
	init: () => init,
	initScript: () => initScript,
	input: () => input,
	intrinsicsToProjectionMatrix: () => intrinsicsToProjectionMatrix,
	isBVHReady: () => isBVHReady,
	isDeviceCameraPoseAvailable: () => isDeviceCameraPoseAvailable,
	isLayerCapable: () => isLayerCapable,
	isWebGPURenderer: () => isWebGPURenderer,
	keyOutBackground: () => keyOutBackground,
	layerCapability: () => layerCapability,
	lerp: () => lerp,
	loadStereoImageAsTextures: () => loadStereoImageAsTextures,
	loadingSpinnerManager: () => loadingSpinnerManager,
	lookAtRotation: () => lookAtRotation,
	objectIsDescendantOf: () => objectIsDescendantOf,
	parseBase64DataURL: () => parseBase64DataURL,
	parseSimulatorHandPoseRotations: () => parseSimulatorHandPoseRotations,
	placeObjectAtIntersectionFacingTarget: () => placeObjectAtIntersectionFacingTarget,
	poseInFrontOfCamera: () => poseInFrontOfCamera,
	print: () => print,
	quaternionFacingCamera: () => quaternionFacingCamera,
	resolveSimulatorHandPoseRotations: () => resolveSimulatorHandPoseRotations,
	resolveSimulatorRotationsFromKeypoints: () => resolveSimulatorRotationsFromKeypoints,
	scene: () => scene,
	showOnlyInLeftEye: () => showOnlyInLeftEye,
	showOnlyInRightEye: () => showOnlyInRightEye,
	sound: () => sound,
	timer: () => timer,
	transformRgbUvToWorld: () => transformRgbUvToWorld,
	traverseUtil: () => traverseUtil,
	ui: () => ui,
	urlParams: () => urlParams,
	user: () => user,
	visualizeDepth: () => visualizeDepth,
	visualizeDepthMap: () => visualizeDepthMap,
	world: () => world,
	xrDepthMeshOptions: () => xrDepthMeshOptions,
	xrDepthMeshPhysicsOptions: () => xrDepthMeshPhysicsOptions,
	xrDepthMeshVisualizationOptions: () => xrDepthMeshVisualizationOptions,
	xrDeviceCameraEnvironmentContinuousOptions: () => xrDeviceCameraEnvironmentContinuousOptions,
	xrDeviceCameraEnvironmentOptions: () => xrDeviceCameraEnvironmentOptions,
	xrDeviceCameraUserContinuousOptions: () => xrDeviceCameraUserContinuousOptions,
	xrDeviceCameraUserOptions: () => xrDeviceCameraUserOptions
}));
//#endregion
export { AI, AIOptions, ActiveControllers, Agent, AnchorManager, AnchoredObjects, AnchorsOptions, AudioListener, AudioPlayer, BACK, BackgroundMusic, CategoryVolumes, Context, ContextOptions, Core, CoreSound, DEFAULT_DEVICE_CAMERA_HEIGHT, DEFAULT_DEVICE_CAMERA_WIDTH, DEFAULT_RGB_TO_DEPTH_PARAMS, DEVICE_CAMERA_PARAMETERS, DOWN, Depth, DepthMesh, DepthMeshOptions, DepthOptions, DepthTextures, DetectedBodyPose, DetectedFace, DetectedMesh, DetectedObject, DetectedPlane, DeviceCameraOptions, FINGER_ORDER, FORWARD, FaceCamera, FaceLandmarkName, FaceRecognizer, FacesOptions, FollowHead, FollowObject, GEMINI_DEFAULT_FLASH_MODEL, GEMINI_DEFAULT_IMAGE_MODEL, GEMINI_DEFAULT_LIVE_MODEL, GamepadBindings, GamepadController, GazeController, Gemini, GeminiOptions, GenerateSkyboxTool, GestureRecognition, GestureRecognitionOptions, GetWeatherTool, HAND_BONE_IDX_CONNECTION_MAP, HAND_INDEX_TO_LABEL, HAND_JOINT_COUNT, HAND_JOINT_IDX_CONNECTION_MAP, HAND_JOINT_NAMES, Handedness, Hands, HandsOptions, HeadGestureRecognition, HeadGestureRecognitionOptions, HeuristicGestureRecognizer, HeuristicHeadGestureRecognizer, HumanRecognizer, HumansOptions, Input, InputOptions, Interaction, InteractionOptions, Keycodes, LEFT, LEFT_VIEW_ONLY_LAYER, LayerManager, LayersOptions, Lighting, LightingOptions, LoadingSpinnerManager, LocalStorageAnchorStore, ManipulationAction, MediaPipeHandContext, MediaPipeHandPoseEstimator, MeshDetectionOptions, MeshDetector, MeshScript, ModelLoader, ModelViewer, MouseController, NUM_HANDS, OCCLUDABLE_ITEMS_LAYER, ObjectDetector, ObjectsOptions, OcclusionPass, OcclusionUtils, OpenAI, OpenAIOptions, Options, Orbit, Physics, PhysicsOptions, PlaneDetector, PlanesOptions, PoseJointName, RENDERER_BACKENDS, RIGHT, RIGHT_VIEW_ONLY_LAYER, Registry, ReticleOptions, Reticles, SIMULATOR_HAND_COMMON_BIOMECHANICAL_CONSTRAINTS_DEGREES, SIMULATOR_HAND_POSE_NAMES, SIMULATOR_HAND_POSE_ROTATIONS, SOUND_PRESETS, SceneDetector, SceneOptions, SceneSetOfMarkOptions, SceneVisibilityOptions, ScreenshotSynthesizer, Script, ScriptMixin, ScriptsManager, ScriptsManagerEventType, SegmentCategory, SegmentationOptions, Segmenter, SetSimulatorEnvironmentEvent, SetSimulatorHandPhysicsEvent, SetSimulatorModeEvent, ShowSimulatorInstructionsEvent, SimulatorAnchor, SimulatorHandPose, SimulatorHandPoseChangeRequestEvent, SimulatorMode, SimulatorOptions, SkyboxAgent, SoundOptions, SoundSynthesizer, SparkRendererHolder, SpatialAudio, SpeechRecognizer, SpeechRecognizerOptions, SpeechSynthesizer, SpeechSynthesizerOptions, StreamState, StrokeRecognizer, StylizedFace, TensorFlowHandPoseEstimator, Tool, TransformScript, UIButton, UICard, UIElement, UIIcon, UIImage, UIOverlay, UIPanel, UIScrollView, UISlider, UIText, UITextInput, UP, User, VIEW_DEPTH_GAP, VideoFileStream, VideoLayer, VideoStream, VisibilityTransition, VolumeCategory, WaitFrame, WebXRHandContext, WebXRHandPoseEstimator, WebXRSessionEventType, WebXRSessionManager, World, WorldOptions, XRButton, XRDeviceCamera, XREffects, XRPass, XRReferenceSpaceCache, XRTransitionOptions, XR_BLOCKS_ASSETS_PATH, ZERO_VECTOR3, ZERO_VISEME, _getBvhImportStatus, add, ai, anchorCapability, applyBVH, applySimulatorHandPoseRotationConstraints, aspectRatioOf, assertWebGLRenderer, average, buildDisplacementMap, callInitWithDependencyInjection, camera, clamp, clamp01, clampRotationToAngle, computeBillboardScale, context, core, cropImage, defaultAnchorStorageKey, depth, detectDeviceCameraTarget, disposeBVH, disposeMaterial, disposeMeshResources, disposeObjectChildren, disposeObjectTree, disposeRenderableResources, enableAcceleratedRaycast, estimateBackgroundColor, estimateHandScale, extractYaw, getAdjacentFingerSpreads, getBoneVectors, getCameraParametersSnapshot, getColorHex, getDeltaTime, getDeviceCameraClipFromView, getDeviceCameraWorldFromClip, getDeviceCameraWorldFromView, getElapsedTime, getFingerBendAngles, getFingerCurl, getFingerDirection, getFingerJoint, getFingerPalmAlignment, getFingerSpread, getFingerStraightness, getFingertipDistance, getFingertipPalmDistance, getObjectTargetPoint, getPalmNormal, getPalmPose, getPalmRight, getPalmUp, getPalmWidth, getRelativeBoneAngles, getThumbBendAngles, getThumbCurl, getThumbDirection, getThumbOpposition, getThumbStraightness, getThumbVerticalDirection, getUIPresentationObject, getUrlParamBool, getUrlParamFloat, getUrlParamInt, getUrlParameter, getVec4ByColorString, getXrCameraLeft, getXrCameraRight, init, initScript, input, intrinsicsToProjectionMatrix, isBVHReady, isDeviceCameraPoseAvailable, isLayerCapable, isWebGPURenderer, keyOutBackground, layerCapability, lerp, loadStereoImageAsTextures, loadingSpinnerManager, lookAtRotation, objectIsDescendantOf, parseBase64DataURL, parseSimulatorHandPoseRotations, placeObjectAtIntersectionFacingTarget, poseInFrontOfCamera, print, quaternionFacingCamera, resolveSimulatorHandPoseRotations, resolveSimulatorRotationsFromKeypoints, scene, showOnlyInLeftEye, showOnlyInRightEye, sound, timer, transformRgbUvToWorld, traverseUtil, ui, urlParams, user, visualizeDepth, visualizeDepthMap, world, xrDepthMeshOptions, xrDepthMeshPhysicsOptions, xrDepthMeshVisualizationOptions, xrDeviceCameraEnvironmentContinuousOptions, xrDeviceCameraEnvironmentOptions, xrDeviceCameraUserContinuousOptions, xrDeviceCameraUserOptions };

//# sourceMappingURL=xrblocks.js.map