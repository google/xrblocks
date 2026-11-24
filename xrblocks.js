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
* @version v0.25.0
* @commitid 158df33
* @builddate 2026-11-24T09:52:00.949Z
* @description XR Blocks SDK, built from source with the above commit ID.
* @agent When using with Gemini to create XR apps, use **Gemini Canvas** mode,
* and follow rules below:
* 1. Include the following importmap for maximum compatibility:
"three": "https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.js",
"three/addons/": "https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/",
"@pmndrs/uikit": "https://cdn.jsdelivr.net/npm/@pmndrs/uikit@1.0.77/dist/index.min.js",
"@pmndrs/uikit-pub-sub": "https://cdn.jsdelivr.net/npm/@pmndrs/uikit-pub-sub@1.0.77/dist/index.min.js",
"@pmndrs/msdfonts": "https://cdn.jsdelivr.net/npm/@pmndrs/msdfonts@1.0.77/dist/index.min.js",
"@pmndrs/msdfonts/inter": "https://cdn.jsdelivr.net/npm/@pmndrs/msdfonts@1.0.77/dist/inter.js",
"@pmndrs/msdfonts/": "https://cdn.jsdelivr.net/npm/@pmndrs/msdfonts@1.0.77/dist/",
"zod": "https://cdn.jsdelivr.net/npm/zod@4.4.3/+esm",
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
import { A as UIElement, D as getObjectTargetPoint, E as ManipulationAction, F as getUIPresentationObject, G as Script, K as ScriptMixin, O as objectIsDescendantOf, R as isUIElement, V as TransformScript, W as MeshScript, b as registerSemanticControl, k as traverseUtil, l as UICard, o as UIScrollView, r as UIDropdown, w as normalizeManipulationConfig } from "./internal/PanelBackfaceVisibility.js";
import { $ as AudioPlayer, $n as xrDepthMeshPhysicsOptions, $t as defaultAnchorStorageKey, A as AnchorManager, An as getFingerJoint, Ar as Gemini, At as Context, B as loadingSpinnerManager, Bn as getPalmWidth, Br as getUrlParamFloat, Bt as FORWARD, C as enableAcceleratedRaycast, Cn as clamp01, Cr as DeviceCameraOptions, Ct as XRButton, D as PoseJointName, Dn as getFingerBendAngles, Dr as xrDeviceCameraUserOptions, Dt as ScriptsManager, E as DetectedBodyPose, En as getBoneVectors, Er as xrDeviceCameraUserContinuousOptions, Et as WaitFrame, F as DetectedPlane, Fn as getFingertipPalmDistance, Fr as GeminiOptions, G as SpeechSynthesizer, Gn as getThumbOpposition, Gr as parseBase64DataURL, Gt as InputOptions, H as RadixSplatManager, Hn as getThumbBendAngles, Hr as getUrlParameter, Ht as RIGHT, I as ObjectDetector, In as getPalmNormal, Ir as OpenAIOptions, It as faceCameraQuaternion, J as SOUND_PRESETS, Jn as LayersOptions, Jt as RENDERER_BACKENDS, K as SpeechRecognizer, Kn as getThumbStraightness, Kr as print, Kt as InteractionOptions, L as DetectedObject, Ln as getPalmPose, Lr as clamp, Lt as faceCameraSlerpAlpha, M as LocalStorageAnchorStore, Mn as getFingerSpread, Mr as GEMINI_DEFAULT_FLASH_MODEL, Mt as DepthMesh, N as anchorCapability, Nn as getFingerStraightness, Nr as GEMINI_DEFAULT_IMAGE_MODEL, Nt as Interaction, O as MeshDetector, On as getFingerCurl, Or as AI, Ot as ScriptsManagerEventType, P as PlaneDetector, Pn as getFingertipDistance, Pr as GEMINI_DEFAULT_LIVE_MODEL, Q as BackgroundMusic, Qn as xrDepthMeshOptions, Qt as AnchorsOptions, R as placeObjectAtIntersectionFacingTarget, Rn as getPalmRight, Rr as getColorHex, Rt as BACK, S as disposeBVH, Sn as average, Sr as DEFAULT_RGB_TO_DEPTH_PARAMS, St as XRPass, T as HumanRecognizer, Tn as getAdjacentFingerSpreads, Tr as xrDeviceCameraEnvironmentOptions, Tt as WebXRSessionManager, U as RadixSplatObject, Un as getThumbCurl, Ur as getVec4ByColorString, Ut as UP, V as callInitWithDependencyInjection, Vn as getRelativeBoneAngles, Vr as getUrlParamInt, Vt as LEFT, W as CoreSound, Wn as getThumbDirection, Wr as lerp, Wt as ZERO_VECTOR3, X as CategoryVolumes, Xn as DepthMeshOptions, Xt as XRTransitionOptions, Y as SoundSynthesizer, Yn as HandsOptions, Yt as ReticleOptions, Z as VolumeCategory, Zn as DepthOptions, Zt as WorldOptions, _ as FaceRecognizer, _n as WebXRHandContext, _r as getDeviceCameraWorldFromView, _t as OcclusionPass, a as SPLAT_EXTENSIONS, an as MeshDetectionOptions, ar as SceneVisibilityOptions, at as User, b as _getBvhImportStatus, bn as HeuristicGestureRecognizer, br as transformRgbUvToWorld, bt as XRReferenceSpaceCache, c as SIMULATOR_HAND_POSE_ROTATIONS, cn as SpeechRecognizerOptions, cr as StreamState, ct as Reticles, d as resolveSimulatorRotationsFromKeypoints, dn as LightingOptions, dr as assertDeviceCameraTarget, dt as GazeController, en as SegmentationOptions, er as xrDepthMeshVisualizationOptions, et as AudioListener, f as SIMULATOR_HAND_COMMON_BIOMECHANICAL_CONSTRAINTS_DEGREES, fn as StrokeRecognitionOptions, fr as cropImage, ft as GamepadController, g as Segmenter, gn as GestureRecognitionOptions, gr as getDeviceCameraWorldFromClip, gt as OcclusionUtils, h as World, hn as HeuristicHeadGestureRecognizer, hr as getDeviceCameraClipFromView, ht as Depth, i as GLTF_EXTENSIONS, in as ObjectsOptions, ir as SceneSetOfMarkOptions, it as GestureRecognition, j as SimulatorAnchor, jn as getFingerPalmAlignment, jr as AIOptions, jt as SceneDetector, k as DetectedMesh, kn as getFingerDirection, kr as OpenAI, kt as Registry, l as applySimulatorHandPoseRotationConstraints, ln as SpeechSynthesizerOptions, lr as VideoStream, lt as MouseController, m as Core, mn as HeadGestureRecognitionOptions, mr as getCameraParametersSnapshot, n as ensureSceneSparkRenderer, nn as HumansOptions, nr as ContextOptions, nt as Lighting, o as getGroupBoundingBox, on as SplatsOptions, or as ScreenshotSynthesizer, ot as ActiveControllers, p as parseSimulatorHandPoseRotations, pn as OneDollarUnistrokeRecognizer, pr as detectDeviceCameraTarget, pt as GamepadBindings, q as SpatialAudio, qn as getThumbVerticalDirection, qr as urlParams, qt as Options, r as SparkRendererHolder, rn as PlanesOptions, rr as SceneOptions, rt as ui, s as getModelFileExtension, sn as SoundOptions, sr as XRDeviceCamera, st as Input, t as ModelLoader, tn as FacesOptions, tr as resolveSerializerRenderer, tt as Physics, u as resolveSimulatorHandPoseRotations, un as PhysicsOptions, ur as DEVICE_CAMERA_PARAMETERS, ut as HeadGestureRecognition, v as DetectedFace, vn as WebXRHandPoseEstimator, vr as isDeviceCameraPoseAvailable, vt as DepthTextures, w as isBVHReady, wn as estimateHandScale, wr as xrDeviceCameraEnvironmentContinuousOptions, wt as WebXRSessionEventType, x as applyBVH, xn as FINGER_ORDER, xr as intrinsicsToProjectionMatrix, xt as XREffects, y as FaceLandmarkName, yn as HAND_INDEX_TO_LABEL, yr as resolveDeviceCameraTarget, yt as registerDebugGlobals, z as LoadingSpinnerManager, zn as getPalmUp, zr as getUrlParamBool, zt as DOWN } from "./internal/ModelLoader.js";
import { a as HAND_JOINT_IDX_CONNECTION_MAP, c as OCCLUDABLE_ITEMS_LAYER, d as XR_BLOCKS_ASSETS_PATH, i as HAND_JOINT_COUNT, l as RIGHT_VIEW_ONLY_LAYER, n as DEFAULT_DEVICE_CAMERA_WIDTH, o as LEFT_VIEW_ONLY_LAYER, r as HAND_BONE_IDX_CONNECTION_MAP, s as NUM_HANDS, t as DEFAULT_DEVICE_CAMERA_HEIGHT, u as VIEW_DEPTH_GAP } from "./internal/constants.js";
import { a as SetSimulatorModeEvent, c as SimulatorMode, d as Handedness, f as Hands, i as ShowSimulatorInstructionsEvent, l as SimulatorOptions, n as SimulatorHandPose, o as SimulatorHandPoseChangeRequestEvent, p as HAND_JOINT_NAMES, r as SetSimulatorHandPhysicsEvent, s as SetSimulatorEnvironmentEvent, t as SIMULATOR_HAND_POSE_NAMES, u as Keycodes } from "./internal/HandPoses.js";
import { a as disposeRenderableResources, i as disposeObjectTree, l as isWebGPURenderer, n as disposeMeshResources, o as RendererHolder, r as disposeObjectChildren, s as assertWebGLRenderer, t as disposeMaterial, u as isSerializerRenderer } from "./internal/ThreeDisposal.js";
import { a as UIOverlay, i as UIText, t as UITextInput } from "./internal/UITextInput.js";
import * as THREE from "three";
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
				const side = this.user.input?.controllers.find((controller) => controller.userData.selected)?.inputSource?.handedness;
				if (side === "left" || side === "right") this.activeHand = side === "left" ? 0 : 1;
				else {
					this.activeHand = 0;
					if (this.user.isSelecting?.(0)) this.activeHand = 0;
					else if (this.user.isSelecting?.(1)) this.activeHand = 1;
				}
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
* @see {@link THREE.Object3D.add}
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
		event.stopGlobalPropagation();
	}
	onObjectSelectEnd(event) {
		event.stopPropagation();
		event.stopGlobalPropagation();
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
//#region src/ui/components/UIExitButton.ts
const DEFAULT_EXIT_BUTTON_STYLE = Object.freeze({
	position: "relative",
	width: "100%",
	height: 56,
	alignSelf: "stretch",
	flexShrink: 0,
	flexDirection: "row",
	justifyContent: "center",
	alignItems: "center",
	gap: 8,
	paddingTop: 0,
	paddingRight: 0,
	paddingBottom: 0,
	paddingLeft: 0,
	borderRadius: 36,
	borderWidth: 0,
	borderColor: "transparent",
	borderAlign: "outside",
	backgroundColor: "rgba(255, 154, 154, 0.16)",
	color: "#e1e2e8",
	fontSize: 16,
	fontWeight: "normal",
	lineHeight: "24px",
	whiteSpace: "nowrap",
	":hover": Object.freeze({
		backgroundColor: "rgba(255, 154, 154, 0.24)",
		color: "#e1e2e8",
		borderWidth: 0,
		borderColor: "transparent"
	}),
	":active": Object.freeze({
		backgroundColor: "rgba(255, 154, 154, 0.3)",
		color: "#e1e2e8",
		borderWidth: 0,
		borderColor: "transparent"
	}),
	":focus": Object.freeze({
		backgroundColor: "rgba(255, 154, 154, 0.16)",
		color: "#e1e2e8",
		borderColor: "#e1e2e8",
		borderWidth: 2
	}),
	":disabled": Object.freeze({
		backgroundColor: "rgba(225, 226, 232, 0.07)",
		color: "#a5a6ac",
		borderWidth: 0,
		borderColor: "transparent"
	})
});
function mergeExitButtonStyle(style) {
	if (!style) return { ...DEFAULT_EXIT_BUTTON_STYLE };
	const paddingOverrides = style.padding !== void 0 ? {
		paddingTop: style.paddingTop ?? style.padding,
		paddingRight: style.paddingRight ?? style.padding,
		paddingBottom: style.paddingBottom ?? style.padding,
		paddingLeft: style.paddingLeft ?? style.padding
	} : void 0;
	return {
		...DEFAULT_EXIT_BUTTON_STYLE,
		...style,
		...paddingOverrides,
		":hover": {
			...DEFAULT_EXIT_BUTTON_STYLE[":hover"],
			...style[":hover"]
		},
		":active": {
			...DEFAULT_EXIT_BUTTON_STYLE[":active"],
			...style[":active"]
		},
		":focus": {
			...DEFAULT_EXIT_BUTTON_STYLE[":focus"],
			...style[":focus"]
		},
		":disabled": {
			...DEFAULT_EXIT_BUTTON_STYLE[":disabled"],
			...style[":disabled"]
		}
	};
}
/**
* An in-panel pill exit button placed at the bottom of XR cards and overlays.
* Uses dependency injection to resolve the active `WebXRSessionManager`,
* collapsing out of layout outside WebXR sessions unless `alwaysVisible` is set,
* and cleanly ending the session when clicked.
*/
var UIExitButton = class UIExitButton extends UIButton {
	static {
		this.optionalDependencies = { sessionManager: WebXRSessionManager };
	}
	static {
		this.instances = /* @__PURE__ */ new Set();
	}
	static {
		this._alwaysVisible = false;
	}
	/**
	* Live global override that keeps all `UIExitButton` instances visible and
	* in-flow even outside an active WebXR session (for desktop simulator previews).
	*/
	static get alwaysVisible() {
		return UIExitButton._alwaysVisible;
	}
	static set alwaysVisible(value) {
		UIExitButton._alwaysVisible = Boolean(value);
		UIExitButton.syncTrackedInstances();
	}
	static syncTrackedInstances() {
		for (const ref of UIExitButton.instances) {
			const instance = ref.deref();
			if (!instance) UIExitButton.instances.delete(ref);
			else instance.syncVisibility();
		}
	}
	constructor({ label, ariaLabel, alwaysVisible = false, pointerEvents = "auto", style, visible, onClick, onExit, sessionManager, ...rest } = {}) {
		const resolvedLabel = label === void 0 && !rest.children?.length ? "Exit app" : label;
		const resolvedAriaLabel = ariaLabel ?? (resolvedLabel || "Exit app");
		const activeDisplay = style?.display && style.display !== "none" ? style.display : "flex";
		const shouldShow = UIExitButton._alwaysVisible || alwaysVisible || visible === true || Boolean(sessionManager?.currentSession);
		const mergedStyle = mergeExitButtonStyle(style);
		mergedStyle.display = shouldShow ? activeDisplay : "none";
		super({
			label: resolvedLabel,
			ariaLabel: resolvedAriaLabel,
			pointerEvents,
			style: mergedStyle,
			onClick: () => {
				this.handleExit(onClick);
			},
			...rest,
			visible: shouldShow
		});
		this.name = "UIExitButton";
		this.onSessionStart = () => {
			this.syncVisibility();
		};
		this.onSessionEnd = () => {
			this.syncVisibility();
		};
		this._onExit = onExit;
		this.instanceAlwaysVisible = alwaysVisible;
		this.explicitVisible = visible;
		this.activeDisplay = activeDisplay;
		this.instanceRef = new WeakRef(this);
		for (const ref of UIExitButton.instances) if (!ref.deref()) UIExitButton.instances.delete(ref);
		UIExitButton.instances.add(this.instanceRef);
		if (sessionManager) this.setSessionManager(sessionManager);
	}
	init(dependencies = {}) {
		UIExitButton.instances.add(this.instanceRef);
		if (dependencies.sessionManager) this.setSessionManager(dependencies.sessionManager);
		else this.syncVisibility();
	}
	dispose() {
		UIExitButton.instances.delete(this.instanceRef);
		this.sessionManager?.removeEventListener("sessionstart", this.onSessionStart);
		this.sessionManager?.removeEventListener("sessionend", this.onSessionEnd);
		this.sessionManager = void 0;
		super.dispose();
	}
	async handleExit(customOnClick) {
		if (this._onExit) {
			await this._onExit();
			return;
		}
		if (customOnClick) {
			customOnClick();
			return;
		}
		if (this.sessionManager?.currentSession) try {
			await this.sessionManager.endSession();
		} catch (error) {
			if (!(error instanceof Error && error.message === "No session to end")) console.error("Failed to end XR session", error);
		}
	}
	syncVisibility() {
		const shouldShow = UIExitButton._alwaysVisible || this.instanceAlwaysVisible || this.explicitVisible === true || Boolean(this.sessionManager?.currentSession);
		this.visible = shouldShow;
		this.style.display = shouldShow ? this.activeDisplay : "none";
	}
	setSessionManager(sessionManager) {
		this.sessionManager?.removeEventListener("sessionstart", this.onSessionStart);
		this.sessionManager?.removeEventListener("sessionend", this.onSessionEnd);
		this.sessionManager = sessionManager;
		sessionManager.addEventListener("sessionstart", this.onSessionStart);
		sessionManager.addEventListener("sessionend", this.onSessionEnd);
		this.syncVisibility();
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
		validateRange$1(min, max, step);
		validateValue$1(value);
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
		validateRange$1(value, this._max, this._step);
		this._min = value;
		this.requantizeInteraction();
	}
	get max() {
		return this._max;
	}
	set max(value) {
		validateRange$1(this._min, value, this._step);
		this._max = value;
		this.requantizeInteraction();
	}
	get step() {
		return this._step;
	}
	set step(value) {
		validateRange$1(this._min, this._max, value);
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
		event.stopGlobalPropagation();
	}
	onObjectSelectEnd(event) {
		event.stopPropagation();
		event.stopGlobalPropagation();
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
		validateValue$1(value);
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
function validateRange$1(min, max, step) {
	if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(step) || min > max || step <= 0) throw new Error("UISlider requires finite values with min <= max and step > 0.");
}
function validateValue$1(value) {
	if (!Number.isFinite(value)) throw new Error("UISlider value must be finite.");
}
function quantize(value, min, max, step) {
	const stepped = min + Math.round((value - min) / step) * step;
	return clamp(Number(stepped.toPrecision(12)), min, max);
}
//#endregion
//#region src/ui/components/UIToggle.ts
/** An on/off switch that flips after a valid captured press and release. */
var UIToggle = class extends UIElement {
	constructor({ ariaLabel, checked = false, disabled = false, offLabel = "Off", onLabel = "On", onChange, ...options }) {
		if (!ariaLabel) throw new Error("UIToggle requires ariaLabel.");
		validateBoolean("checked", checked);
		validateBoolean("disabled", disabled);
		validateString("offLabel", offLabel);
		validateString("onLabel", onLabel);
		super("toggle", options);
		this.name = "UIToggle";
		this.ariaLabel = ariaLabel;
		this._checked = checked;
		this._disabled = disabled;
		this._offLabel = offLabel;
		this._onLabel = onLabel;
		this.onChange = onChange;
		registerSemanticControl(this, {
			kind: "button",
			isDisabled: () => this._disabled,
			activate: () => {
				this._checked = !this._checked;
				this.markUIDirty();
				this.onChange?.(this._checked);
			}
		});
	}
	get checked() {
		return this._checked;
	}
	set checked(value) {
		validateBoolean("checked", value);
		if (value === this._checked) return;
		this._checked = value;
		this.markUIDirty();
	}
	get disabled() {
		return this._disabled;
	}
	set disabled(value) {
		validateBoolean("disabled", value);
		if (value === this._disabled) return;
		this._disabled = value;
		this.markUIDirty();
	}
	get offLabel() {
		return this._offLabel;
	}
	set offLabel(value) {
		validateString("offLabel", value);
		if (value === this._offLabel) return;
		this._offLabel = value;
		this.markUIDirty();
	}
	get onLabel() {
		return this._onLabel;
	}
	set onLabel(value) {
		validateString("onLabel", value);
		if (value === this._onLabel) return;
		this._onLabel = value;
		this.markUIDirty();
	}
	onObjectSelectStart(event) {
		event.stopPropagation();
		event.stopGlobalPropagation();
	}
	onObjectSelectEnd(event) {
		event.stopPropagation();
		event.stopGlobalPropagation();
	}
};
function validateBoolean(property, value) {
	if (typeof value !== "boolean") throw new Error(`UIToggle ${property} must be a boolean.`);
}
function validateString(property, value) {
	if (typeof value !== "string") throw new Error(`UIToggle ${property} must be a string.`);
}
//#endregion
//#region src/ui/components/UIProgress.ts
/**
* A display-only bar whose fill shows how far a task has progressed. `value`
* is clamped to `[min, max]`; `min` and `max` are fixed at construction.
*/
var UIProgress = class extends UIElement {
	constructor({ ariaLabel, value = 0, min = 0, max = 1, ...options }) {
		if (!ariaLabel) throw new Error("UIProgress requires ariaLabel.");
		validateRange(min, max);
		validateValue(value);
		super("progress", options);
		this.name = "UIProgress";
		this.ariaLabel = ariaLabel;
		this._min = min;
		this._max = max;
		this._value = clamp(value, min, max);
	}
	get min() {
		return this._min;
	}
	get max() {
		return this._max;
	}
	get value() {
		return this._value;
	}
	set value(value) {
		validateValue(value);
		const next = clamp(value, this._min, this._max);
		if (next === this._value) return;
		this._value = next;
		this.markUIDirty();
	}
};
function validateRange(min, max) {
	if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) throw new Error("UIProgress requires finite values with min < max.");
}
function validateValue(value) {
	if (!Number.isFinite(value)) throw new Error("UIProgress value must be finite.");
}
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
		if (this.splatObject) await this.registerSplatRendererIfNeeded();
		this.syncInteractionSurfaces();
	}
	/** Replaces the current model. The file format is inferred from the URL. */
	async load(source) {
		const request = normalizeSource(source);
		const extension = getModelFileExtension(request.url);
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
		const splatObject = await this.loader.loadSplat({
			url: source.url,
			renderer: this.renderer
		});
		if (!this.isModelLoadCurrent(generation)) {
			splatObject.dispose();
			throw this.staleModelLoadError();
		}
		const root = new THREE.Object3D();
		root.add(splatObject);
		applyAssetTransform(root, source);
		root.updateMatrix();
		const bounds = splatObject.boundingBox.clone().applyMatrix4(root.matrix);
		if (!this.isModelLoadCurrent(generation)) {
			splatObject.dispose();
			root.clear();
			throw this.staleModelLoadError();
		}
		alignOrigin(root, bounds, this.origin);
		this.splatObject = splatObject;
		this.contentRoot = root;
		this.boundingBox.copy(bounds);
		this.visualRoot.add(root);
		await this.registerSplatRendererIfNeeded(generation);
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
	/**
	* Registers loaded splat content with `RadixSplatManager` (`@sparkjsdev/radix`
	* on `THREE.WebGPURenderer`, covering WebGPU and its WebGL2 TSL fallback) or a
	* shared `SparkRenderer` (`@sparkjsdev/spark` on classic `THREE.WebGLRenderer`).
	*/
	async registerSplatRendererIfNeeded(generation = this.loadGeneration) {
		if (!this.splatObject || !this.scene || !this.registry) return;
		if (this.splatObject instanceof RadixSplatObject) {
			await this.registry.get(RadixSplatManager)?.register(this.splatObject);
			return;
		}
		const renderer = this.registry.get(THREE.WebGLRenderer);
		if (!renderer || !this.isModelLoadCurrent(generation)) return;
		await ensureSceneSparkRenderer({
			scene: this.scene,
			renderer,
			registry: this.registry
		});
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
		if (this.splatObject) {
			this.splatObject.removeFromParent();
			this.splatObject.dispose();
			this.splatObject = void 0;
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
	DEFAULT_EXIT_BUTTON_STYLE: () => DEFAULT_EXIT_BUTTON_STYLE,
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
	RadixSplatManager: () => RadixSplatManager,
	RadixSplatObject: () => RadixSplatObject,
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
	SplatsOptions: () => SplatsOptions,
	StreamState: () => StreamState,
	StrokeRecognizer: () => StrokeRecognizer,
	StylizedFace: () => StylizedFace,
	TensorFlowHandPoseEstimator: () => TensorFlowHandPoseEstimator,
	Tool: () => Tool,
	TransformScript: () => TransformScript,
	UIButton: () => UIButton,
	UICard: () => UICard,
	UIDropdown: () => UIDropdown,
	UIElement: () => UIElement,
	UIExitButton: () => UIExitButton,
	UIIcon: () => UIIcon,
	UIImage: () => UIImage,
	UIOverlay: () => UIOverlay,
	UIPanel: () => UIPanel,
	UIProgress: () => UIProgress,
	UIScrollView: () => UIScrollView,
	UISlider: () => UISlider,
	UIText: () => UIText,
	UITextInput: () => UITextInput,
	UIToggle: () => UIToggle,
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
	assertDeviceCameraTarget: () => assertDeviceCameraTarget,
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
	ensureSceneSparkRenderer: () => ensureSceneSparkRenderer,
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
	isSerializerRenderer: () => isSerializerRenderer,
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
	resolveDeviceCameraTarget: () => resolveDeviceCameraTarget,
	resolveSerializerRenderer: () => resolveSerializerRenderer,
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
export { AI, AIOptions, ActiveControllers, Agent, AnchorManager, AnchoredObjects, AnchorsOptions, AudioListener, AudioPlayer, BACK, BackgroundMusic, CategoryVolumes, Context, ContextOptions, Core, CoreSound, DEFAULT_DEVICE_CAMERA_HEIGHT, DEFAULT_DEVICE_CAMERA_WIDTH, DEFAULT_EXIT_BUTTON_STYLE, DEFAULT_RGB_TO_DEPTH_PARAMS, DEVICE_CAMERA_PARAMETERS, DOWN, Depth, DepthMesh, DepthMeshOptions, DepthOptions, DepthTextures, DetectedBodyPose, DetectedFace, DetectedMesh, DetectedObject, DetectedPlane, DeviceCameraOptions, FINGER_ORDER, FORWARD, FaceCamera, FaceLandmarkName, FaceRecognizer, FacesOptions, FollowHead, FollowObject, GEMINI_DEFAULT_FLASH_MODEL, GEMINI_DEFAULT_IMAGE_MODEL, GEMINI_DEFAULT_LIVE_MODEL, GamepadBindings, GamepadController, GazeController, Gemini, GeminiOptions, GenerateSkyboxTool, GestureRecognition, GestureRecognitionOptions, GetWeatherTool, HAND_BONE_IDX_CONNECTION_MAP, HAND_INDEX_TO_LABEL, HAND_JOINT_COUNT, HAND_JOINT_IDX_CONNECTION_MAP, HAND_JOINT_NAMES, Handedness, Hands, HandsOptions, HeadGestureRecognition, HeadGestureRecognitionOptions, HeuristicGestureRecognizer, HeuristicHeadGestureRecognizer, HumanRecognizer, HumansOptions, Input, InputOptions, Interaction, InteractionOptions, Keycodes, LEFT, LEFT_VIEW_ONLY_LAYER, LayerManager, LayersOptions, Lighting, LightingOptions, LoadingSpinnerManager, LocalStorageAnchorStore, ManipulationAction, MediaPipeHandContext, MediaPipeHandPoseEstimator, MeshDetectionOptions, MeshDetector, MeshScript, ModelLoader, ModelViewer, MouseController, NUM_HANDS, OCCLUDABLE_ITEMS_LAYER, ObjectDetector, ObjectsOptions, OcclusionPass, OcclusionUtils, OpenAI, OpenAIOptions, Options, Orbit, Physics, PhysicsOptions, PlaneDetector, PlanesOptions, PoseJointName, RENDERER_BACKENDS, RIGHT, RIGHT_VIEW_ONLY_LAYER, RadixSplatManager, RadixSplatObject, Registry, ReticleOptions, Reticles, SIMULATOR_HAND_COMMON_BIOMECHANICAL_CONSTRAINTS_DEGREES, SIMULATOR_HAND_POSE_NAMES, SIMULATOR_HAND_POSE_ROTATIONS, SOUND_PRESETS, SceneDetector, SceneOptions, SceneSetOfMarkOptions, SceneVisibilityOptions, ScreenshotSynthesizer, Script, ScriptMixin, ScriptsManager, ScriptsManagerEventType, SegmentCategory, SegmentationOptions, Segmenter, SetSimulatorEnvironmentEvent, SetSimulatorHandPhysicsEvent, SetSimulatorModeEvent, ShowSimulatorInstructionsEvent, SimulatorAnchor, SimulatorHandPose, SimulatorHandPoseChangeRequestEvent, SimulatorMode, SimulatorOptions, SkyboxAgent, SoundOptions, SoundSynthesizer, SparkRendererHolder, SpatialAudio, SpeechRecognizer, SpeechRecognizerOptions, SpeechSynthesizer, SpeechSynthesizerOptions, SplatsOptions, StreamState, StrokeRecognizer, StylizedFace, TensorFlowHandPoseEstimator, Tool, TransformScript, UIButton, UICard, UIDropdown, UIElement, UIExitButton, UIIcon, UIImage, UIOverlay, UIPanel, UIProgress, UIScrollView, UISlider, UIText, UITextInput, UIToggle, UP, User, VIEW_DEPTH_GAP, VideoFileStream, VideoLayer, VideoStream, VisibilityTransition, VolumeCategory, WaitFrame, WebXRHandContext, WebXRHandPoseEstimator, WebXRSessionEventType, WebXRSessionManager, World, WorldOptions, XRButton, XRDeviceCamera, XREffects, XRPass, XRReferenceSpaceCache, XRTransitionOptions, XR_BLOCKS_ASSETS_PATH, ZERO_VECTOR3, ZERO_VISEME, _getBvhImportStatus, add, ai, anchorCapability, applyBVH, applySimulatorHandPoseRotationConstraints, aspectRatioOf, assertDeviceCameraTarget, assertWebGLRenderer, average, buildDisplacementMap, callInitWithDependencyInjection, camera, clamp, clamp01, clampRotationToAngle, computeBillboardScale, context, core, cropImage, defaultAnchorStorageKey, depth, detectDeviceCameraTarget, disposeBVH, disposeMaterial, disposeMeshResources, disposeObjectChildren, disposeObjectTree, disposeRenderableResources, enableAcceleratedRaycast, ensureSceneSparkRenderer, estimateBackgroundColor, estimateHandScale, extractYaw, getAdjacentFingerSpreads, getBoneVectors, getCameraParametersSnapshot, getColorHex, getDeltaTime, getDeviceCameraClipFromView, getDeviceCameraWorldFromClip, getDeviceCameraWorldFromView, getElapsedTime, getFingerBendAngles, getFingerCurl, getFingerDirection, getFingerJoint, getFingerPalmAlignment, getFingerSpread, getFingerStraightness, getFingertipDistance, getFingertipPalmDistance, getObjectTargetPoint, getPalmNormal, getPalmPose, getPalmRight, getPalmUp, getPalmWidth, getRelativeBoneAngles, getThumbBendAngles, getThumbCurl, getThumbDirection, getThumbOpposition, getThumbStraightness, getThumbVerticalDirection, getUIPresentationObject, getUrlParamBool, getUrlParamFloat, getUrlParamInt, getUrlParameter, getVec4ByColorString, getXrCameraLeft, getXrCameraRight, init, initScript, input, intrinsicsToProjectionMatrix, isBVHReady, isDeviceCameraPoseAvailable, isLayerCapable, isSerializerRenderer, isWebGPURenderer, keyOutBackground, layerCapability, lerp, loadStereoImageAsTextures, loadingSpinnerManager, lookAtRotation, objectIsDescendantOf, parseBase64DataURL, parseSimulatorHandPoseRotations, placeObjectAtIntersectionFacingTarget, poseInFrontOfCamera, print, quaternionFacingCamera, resolveDeviceCameraTarget, resolveSerializerRenderer, resolveSimulatorHandPoseRotations, resolveSimulatorRotationsFromKeypoints, scene, showOnlyInLeftEye, showOnlyInRightEye, sound, timer, transformRgbUvToWorld, traverseUtil, ui, urlParams, user, visualizeDepth, visualizeDepthMap, world, xrDepthMeshOptions, xrDepthMeshPhysicsOptions, xrDepthMeshVisualizationOptions, xrDeviceCameraEnvironmentContinuousOptions, xrDeviceCameraEnvironmentOptions, xrDeviceCameraUserContinuousOptions, xrDeviceCameraUserOptions };

//# sourceMappingURL=xrblocks.js.map