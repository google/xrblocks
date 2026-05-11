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
 * @version v0.13.0
 * @commitid 809bce4
 * @builddate 2026-05-11T23:20:57.232Z
 * @description XR Blocks SDK, built from source with the above commit ID.
 * @agent When using with Gemini to create XR apps, use **Gemini Canvas** mode,
 * and follow rules below:
 * 1. Include the following importmap for maximum compatibility:
    "three": "https://cdn.jsdelivr.net/npm/three@0.182.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.182.0/examples/jsm/",
    "troika-three-text": "https://cdn.jsdelivr.net/gh/protectwise/troika@028b81cf308f0f22e5aa8e78196be56ec1997af5/packages/troika-three-text/src/index.js",
    "troika-three-utils": "https://cdn.jsdelivr.net/gh/protectwise/troika@v0.52.4/packages/troika-three-utils/src/index.js",
    "troika-worker-utils": "https://cdn.jsdelivr.net/gh/protectwise/troika@v0.52.4/packages/troika-worker-utils/src/index.js",
    "bidi-js": "https://esm.sh/bidi-js@%5E1.0.2?target=es2022",
    "webgl-sdf-generator": "https://esm.sh/webgl-sdf-generator@1.1.1/es2022/webgl-sdf-generator.mjs",
    "lit": "https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js",
    "lit/": "https://esm.run/lit@3/",
    2. If the app focus on standalone objects, spawn it in front of the user in
    WebXR and rescale to reasonable physical size. Wrap them with xb.ModelViewer
    and make sure users can drag the platform to move it around in XR.
    3. When rendering a large scene, remember users may navigate the scene in a
    physical world space, also add locomotion methods like pinch to teleport.
    4. Do not halluciate mode files --- use either public high-quality assets,
    or generate from primitive shapes of use vox formats for voxels or
    lego-styles.
 */
import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { XREstimatedLight } from 'three/addons/webxr/XREstimatedLight.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Builds the context to be sent to the AI for reasoning.
 */
class Context {
    constructor(instructions = 'You are a helpful assistant.') {
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
        const history = memory.getShortTerm();
        const formattedHistory = history
            .map((entry) => this.formatEntry(entry))
            .join('\n');
        const toolDescriptions = tools
            .map((tool) => `- ${tool.name}: ${tool.description}`)
            .join('\n');
        return `${this.instructions} You have access to the following tools: ${toolDescriptions}
        Current Conversation history: ${formattedHistory}. You should reply to the user or call a tool as needed.`;
    }
    formatEntry(entry) {
        switch (entry.role) {
            case 'user':
                return `User: ${entry.content}`;
            case 'ai':
                return `AI: ${entry.content}`;
            case 'tool':
                return `Tool Output: ${entry.content}`;
        }
    }
}

/**
 * Manages the agent's memory, including short-term, long-term, and working
 * memory.
 */
class Memory {
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
}

/**
 * An agent that can use an AI to reason and execute tools.
 */
class Agent {
    static { this.dependencies = {}; }
    constructor(ai, tools = [], instruction = '', callbacks) {
        this.isSessionActive = false;
        this.ai = ai;
        this.tools = tools;
        this.memory = new Memory();
        this.contextBuilder = new Context(instruction);
        this.lifecycleCallbacks = callbacks;
    }
    /**
     * Starts the agent's reasoning loop with an initial prompt.
     * @param prompt - The initial prompt from the user.
     * @returns The final text response from the agent.
     */
    async start(prompt) {
        this.memory.addShortTerm({ role: 'user', content: prompt });
        if (!this.ai.isAvailable()) {
            await this.ai.init({ aiOptions: this.ai.options });
        }
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
            const response = await this.ai.model.query({ type: 'text', text: context });
            this.memory.addShortTerm({ role: 'ai', content: JSON.stringify(response) });
            if (response?.toolCall) {
                console.log(`Executing tool: ${response.toolCall.name}`);
                const tool = this.findTool(response.toolCall.name);
                if (tool) {
                    const result = await tool.execute(response.toolCall.args);
                    this.memory.addShortTerm({
                        role: 'tool',
                        content: JSON.stringify(result),
                    });
                }
                else {
                    const errorMsg = `Error: Tool "${response.toolCall.name}" not found.`;
                    console.error(errorMsg);
                    this.memory.addShortTerm({ role: 'tool', content: errorMsg });
                }
            }
            else if (response?.text) {
                console.log(`Final Response: ${response.text}`);
                return response.text;
            }
            else {
                const finalResponse = 'The AI did not provide a valid response.';
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
            memorySize: this.memory.getShortTerm?.()?.length || 0,
        };
    }
}

/**
 * A base class for tools that the agent can use.
 */
class Tool {
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
            if (this.onTriggered) {
                const result = await Promise.resolve(this.onTriggered(args));
                return {
                    success: true,
                    data: result,
                    metadata: { executedAt: Date.now(), toolName: this.name },
                };
            }
            throw new Error('The execute method must be implemented by a subclass or onTriggered must be provided.');
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                metadata: { executedAt: Date.now(), toolName: this.name },
            };
        }
    }
    /**
     * Returns a JSON representation of the tool.
     * @returns A valid FunctionDeclaration object.
     */
    toJSON() {
        const result = { name: this.name };
        if (this.description) {
            result.description = this.description;
        }
        if (this.parameters) {
            result.parameters = this.parameters;
        }
        if (this.behavior) {
            result.behavior = this.behavior;
        }
        return result;
    }
}

/**
 * A tool that generates a 360-degree equirectangular skybox image
 * based on a given prompt using an AI service.
 */
class GenerateSkyboxTool extends Tool {
    constructor(ai, scene) {
        super({
            name: 'generateSkybox',
            description: 'Generate a 360 equirectangular skybox image for the given prompt.',
            parameters: {
                type: 'OBJECT',
                properties: {
                    prompt: {
                        type: 'STRING',
                        description: 'A description of the skybox to generate, e.g. "a sunny beach with palm trees"',
                    },
                },
                required: ['prompt'],
            },
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
            const image = await this.ai.generate('Generate a 360 equirectangular skybox image for the prompt of:' +
                args.prompt, 'image', 'Generate a 360 equirectangular skybox image for the prompt');
            if (image) {
                console.log('Applying texture...');
                this.scene.background = new THREE.TextureLoader().load(image);
                this.scene.background.mapping = THREE.EquirectangularReflectionMapping;
                return {
                    success: true,
                    data: 'Skybox generated successfully.',
                    metadata: { prompt: args.prompt, timestamp: Date.now() },
                };
            }
            else {
                return {
                    success: false,
                    error: 'Failed to generate skybox image',
                    metadata: { prompt: args.prompt, timestamp: Date.now() },
                };
            }
        }
        catch (e) {
            console.error('error:', e);
            return {
                success: false,
                error: e instanceof Error
                    ? e.message
                    : 'Unknown error while creating skybox',
                metadata: { prompt: args.prompt, timestamp: Date.now() },
            };
        }
    }
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
class SkyboxAgent extends Agent {
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
            toolCallCount: 0,
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
        // Wrap callbacks to track session state
        const wrappedCallbacks = this.wrapCallbacks(callbacks);
        if (callbacks) {
            this.ai.setLiveCallbacks(wrappedCallbacks);
        }
        const functionDeclarations = this.tools.map((tool) => tool.toJSON());
        const systemInstruction = {
            parts: [{ text: this.contextBuilder.instruction }],
        };
        await this.ai.startLiveSession({
            tools: [{ functionDeclarations }],
            systemInstruction: systemInstruction,
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
            },
        };
    }
    /**
     * Sends tool execution results back to the AI.
     *
     * @param response - The tool response containing function results
     */
    async sendToolResponse(response) {
        if (!this.validateToolResponse(response)) {
            console.error('Invalid tool response format:', response);
            return;
        }
        // Handle both single response and array of responses
        const responses = Array.isArray(response.functionResponses)
            ? response.functionResponses
            : [response.functionResponses];
        this.sessionState.toolCallCount += responses.length;
        console.log('Sending tool response:', response);
        this.ai.sendToolResponse(response);
    }
    /**
     * Validates that a tool response has the correct format.
     * @param response - The tool response to validate.
     * @returns True if the response is valid, false otherwise.
     */
    validateToolResponse(response) {
        if (!response.functionResponses) {
            return false;
        }
        // Handle both single response and array of responses
        const responses = Array.isArray(response.functionResponses)
            ? response.functionResponses
            : [response.functionResponses];
        return responses.every((fr) => fr.id && fr.name && fr.response !== undefined);
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
            response: result.success ? { result: result.data } : { error: result.error },
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
        if (!this.sessionState.startTime)
            return null;
        const endTime = this.sessionState.endTime || Date.now();
        return endTime - this.sessionState.startTime;
    }
}

/**
 * A tool that gets the current weather for a specific location.
 */
class GetWeatherTool extends Tool {
    constructor() {
        super({
            name: 'get_weather',
            description: 'Gets the current weather for a specific location.',
            parameters: {
                type: 'OBJECT',
                properties: {
                    location: {
                        type: 'STRING',
                        description: 'The city and state, e.g. San Francisco, CA',
                    },
                    unit: {
                        type: 'STRING',
                        enum: ['celsius', 'fahrenheit'],
                    },
                },
                required: ['location'],
            },
        });
    }
    /**
     * Executes the tool's action.
     * @param args - The arguments for the tool.
     * @returns A promise that resolves with a ToolResult containing weather information.
     */
    async execute(args) {
        if (!args.latitude || !args.longitude) {
            args.latitude = 37.7749; // Default to San Francisco
            args.longitude = -122.4194;
        }
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${args.latitude}&longitude=${args.longitude}&current=weather_code,temperature_2m&temperature_unit=fahrenheit`;
        try {
            const response = await fetch(url);
            const data = await response.json();
            if (response.ok) {
                return {
                    success: true,
                    data: {
                        temperature: data.current.temperature_2m,
                        weathercode: data.current.weather_code,
                    },
                    metadata: {
                        latitude: args.latitude,
                        longitude: args.longitude,
                        timestamp: Date.now(),
                    },
                };
            }
            else {
                return {
                    success: false,
                    error: 'Could not retrieve weather for the specified location.',
                    metadata: { latitude: args.latitude, longitude: args.longitude },
                };
            }
        }
        catch (error) {
            console.error('Error fetching weather:', error);
            return {
                success: false,
                error: error instanceof Error
                    ? error.message
                    : 'There was an error fetching the weather.',
                metadata: { latitude: args.latitude, longitude: args.longitude },
            };
        }
    }
}

/**
 * UX manages the user experience (UX) state for an interactive object in
 * the scene. It tracks interaction states like hover,
 * selection, and dragging for multiple controllers.
 */
class UX {
    /**
     * @param parent - The script or object that owns this UX instance.
     */
    constructor(parent) {
        /**
         * Indicates if the parent object can be dragged.
         */
        this.draggable = false;
        /**
         * Indicates if the parent object can be selected.
         */
        this.selectable = false;
        /**
         * Indicates if the parent object can be touched.
         */
        this.touchable = false;
        // --- Interaction States ---
        /**
         * An array tracking the selection state for each controller.
         * `selected[i]` is true if controller `i` is selecting the object.
         */
        this.selected = [];
        /**
         * An array tracking the hover state for each controller.
         * `hovered[i]` is true if controller `i` is hovering over the object.
         */
        this.hovered = [];
        /**
         * An array tracking the touch state for each controller.
         * `touched[i]` is true if controller `i` is touching over the object.
         */
        this.touched = [];
        /**
         * An array tracking the drag state for each controller.
         */
        this.activeDragged = [];
        // --- Intersection Data ---
        /**
         * An array storing the 3D position of the last intersection for each
         * controller.
         */
        this.positions = [];
        /**
         * An array storing the distance of the last intersection for each controller.
         */
        this.distances = [];
        /**
         * An array storing the UV coordinates of the last intersection for each
         * controller.
         */
        this.uvs = [];
        // --- Drag Management State ---
        /**
         * The initial position of the object when a drag operation begins.
         */
        this.initialPosition = new THREE.Vector3();
        this.parent = parent;
    }
    /**
     * Checks if the object is currently being hovered by any controller.
     */
    isHovered() {
        return this.hovered.includes(true);
    }
    /**
     * Checks if the object is currently being selected by any controller.
     */
    isSelected() {
        return this.selected.includes(true);
    }
    /**
     * Checks if the object is currently being dragged by any controller.
     */
    isDragging() {
        return this.activeDragged.includes(true);
    }
    /**
     * Updates the interaction state for a specific controller based on a new
     * intersection. This is internally called by the core input system when a
     * raycast hits the parent object.
     * @param controller - The controller performing the
     *     interaction.
     * @param intersection - The raycast intersection data.
     */
    update(controller, intersection) {
        const id = controller.userData.id;
        this.initializeVariablesForId(id);
        if (this.isRelevantIntersection(intersection)) {
            this.hovered[id] = true;
            this.selected[id] = controller.userData.selected;
            if (intersection.uv) {
                this.uvs[id].copy(intersection.uv);
            }
            this.positions[id].copy(intersection.point);
            this.distances[id] = intersection.distance;
            if (!this.selected[id]) {
                this.activeDragged[id] = false;
            }
        }
    }
    /**
     * Ensures that the internal arrays for tracking states are large enough to
     * accommodate a given controller ID.
     * @param id - The controller ID to ensure exists.
     */
    initializeVariablesForId(id) {
        while (this.selected.length <= id) {
            this.selected.push(false);
            this.hovered.push(false);
            this.activeDragged.push(false);
            this.positions.push(new THREE.Vector3());
            this.distances.push(1);
            this.uvs.push(new THREE.Vector2());
        }
    }
    /**
     * Checks if the intersection object belongs to this UX's attached Script.
     * Allow overriding this function for more complex objects with multiple
     * meshes.
     * @param intersection - The raycast intersection to check.
     * @returns True if the intersection is relevant to this UX's parent object.
     */
    isRelevantIntersection(intersection) {
        return (intersection.object === this.parent ||
            intersection.object === this.parent.mesh);
    }
    /**
     * Resets the hover and selection states for all controllers. This is
     * typically called at the beginning of each frame.
     */
    reset() {
        for (const i in this.selected) {
            this.selected[i] = false;
            this.hovered[i] = false;
        }
    }
    /**
     * Gets the IDs of up to two controllers that are currently hovering over the
     * parent object, always returning a two-element array. This is useful for
     * shaders or components like Panels that expect a fixed number of interaction
     * points.
     *
     * @returns A fixed-size two-element array. Each element is either a
     *     controller ID (e.g., 0, 1) or null.
     */
    getPrimaryTwoControllerIds() {
        const activeControllerIds = [];
        // this.hovered is an array of booleans, indexed by controller ID.
        if (this.hovered) {
            for (let i = 0; i < this.hovered.length && activeControllerIds.length < 2; ++i) {
                if (this.hovered[i]) {
                    activeControllerIds.push(i);
                }
            }
        }
        // Ensures the returned array always has two elements.
        const controllerId1 = activeControllerIds[0] ?? null;
        const controllerId2 = activeControllerIds[1] ?? null;
        return [controllerId1, controllerId2];
    }
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
 * See `/templates/0_basic/` for an example to start with.
 *
 *
 * If the class does not extends View, it can still bind the above three
 * function, where the engine ignores whether reticle exists.
 *
 * # Supported (native WebXR) functions to extend:
 *
 * onSelectStart(event)
 * onSelectEnd(event)
 *
 */
function ScriptMixin(base) {
    return class extends base {
        constructor() {
            super(...arguments);
            this.ux = new UX(this);
            this.isXRScript = true;
        }
        /**
         * Initializes an instance with XR controllers, grips, hands, raycaster, and
         * default options. We allow all scripts to quickly access its user (e.g.,
         * user.isSelecting(), user.hands), world (e.g., physical depth mesh,
         * lighting estimation, and recognized objects), and scene (the root of
         * three.js's scene graph). If this returns a promise, we will wait for it.
         */
        init(_) { }
        /**
         * Runs per frame.
         */
        update(_time, _frame) { }
        /**
         * Enables depth-aware interactions with physics. See /demos/ballpit
         */
        initPhysics(_physics) { }
        physicsStep() { }
        onXRSessionStarted(_session) { }
        onXRSessionEnded() { }
        onSimulatorStarted() { }
        // Global controller callbacks.
        // See https://developer.mozilla.org/en-US/docs/Web/API/XRInputSourceEvent
        /**
         * Called whenever pinch / mouse click starts, globally.
         * @param _event - event.target holds its controller
         */
        onSelectStart(_event) { }
        /**
         * Called whenever pinch / mouse click discontinues, globally.
         * @param _event - event.target holds its controller
         */
        onSelectEnd(_event) { }
        /**
         * Called whenever pinch / mouse click successfully completes, globally.
         * @param _event - event.target holds its controller.
         */
        onSelect(_event) { }
        /**
         * Called whenever pinch / mouse click is happening, globally.
         */
        onSelecting(_event) { }
        /**
         * Called on keyboard keypress.
         * @param _event - Event containing `.code` to read the keyboard key.
         */
        onKeyDown(_event) { }
        onKeyUp(_event) { }
        /**
         * Called whenever gamepad trigger starts, globally.
         * @param _event - event.target holds its controller.
         */
        onSqueezeStart(_event) { }
        /**
         * Called whenever gamepad trigger stops, globally.
         * @param _event - event.target holds its controller.
         */
        onSqueezeEnd(_event) { }
        /**
         * Called whenever gamepad is being triggered, globally.
         */
        onSqueezing(_event) { }
        /**
         * Called whenever gamepad trigger successfully completes, globally.
         * @param _event - event.target holds its controller.
         */
        onSqueeze(_event) { }
        // Object-specific controller callbacks.
        /**
         * Called when the controller starts selecting this object the script
         * represents, e.g. View, ModelView.
         * @param _event - event.target holds its controller.
         * @returns Whether the event was handled. If true, the event will not bubble up.
         */
        onObjectSelectStart(_event) { }
        /**
         * Called when the controller stops selecting this object the script
         * represents, e.g. View, ModelView.
         * @param _event - event.target holds its controller.
         * @returns Whether the event was handled. If true, the event will not bubble up.
         */
        onObjectSelectEnd(_event) { }
        /**
         * Called when the controller starts hovering over this object with reticle.
         * @param _controller - An XR controller.
         * @returns Whether the event was handled. If true, the event will not bubble up.
         */
        onHoverEnter(_controller) { }
        /**
         * Called when the controller hovers over this object with reticle.
         * @param _controller - An XR controller.
         * @returns Whether the event was handled. If true, the event will not bubble up.
         */
        onHoverExit(_controller) { }
        /**
         * Called when the controller hovers over this object with reticle.
         * @param _controller - An XR controller.
         * @returns Whether the event was handled. If true, the event will not bubble up.
         */
        onHovering(_controller) { }
        /**
         * Called when a hand's index finger starts touching this object.
         */
        onObjectTouchStart(_event) { }
        /**
         * Called every frame that a hand's index finger is touching this object.
         */
        onObjectTouching(_event) { }
        /**
         * Called when a hand's index finger stops touching this object.
         */
        onObjectTouchEnd(_event) { }
        /**
         * Called when a hand starts grabbing this object (touching + pinching).
         */
        onObjectGrabStart(_event) { }
        /**
         * Called every frame a hand is grabbing this object.
         */
        onObjectGrabbing(_event) { }
        /**
         * Called when a hand stops grabbing this object.
         */
        onObjectGrabEnd(_event) { }
        /**
         * Called when the script is removed from the scene. Opposite of init.
         */
        dispose() { }
    };
}
/**
 * Script manages app logic or interaction between user and objects.
 */
const ScriptMixinObject3D = ScriptMixin(THREE.Object3D);
class Script extends ScriptMixinObject3D {
}
/**
 * MeshScript can be constructed with geometry and materials, with
 * `super(geometry, material)`; for direct access to its geometry.
 * MeshScripts hold a UX object that contains its interaction information such
 * as which controller is selecting or touching this object, as well as the
 * exact selected UV / xyz of the reticle, or touched point.
 */
const ScriptMixinMeshScript = ScriptMixin(THREE.Mesh);
class MeshScript extends ScriptMixinMeshScript {
    /**
     * {@inheritDoc}
     */
    constructor(geometry, material) {
        super(geometry, material);
    }
}

/**
 * Clamps a value between a minimum and maximum value.
 */
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
/**
 * Linearly interpolates between two numbers `x` and `y` by a given amount `t`.
 */
function lerp(x, y, t) {
    return x + (y - x) * t;
}
/**
 * Python-style print function for debugging.
 */
function print(...args) {
    console.log('*', ...args);
}
// Parses URL parameters using the URLSearchParams API.
const urlParams = new URLSearchParams(window.location.search);
/**
 * Function to get the value of a URL parameter.
 * @param name - The name of the URL parameter.
 * @returns The value of the URL parameter or null if not found.
 */
function getUrlParameter(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}
/**
 * Retrieves a boolean URL parameter. Returns true for 'true' or '1', false for
 * 'false' or '0'. If the parameter is not found, returns the specified default
 * boolean value.
 * @param name - The name of the URL parameter.
 * @param defaultBool - The default boolean value if the
 *     parameter is not present.
 * @returns The boolean value of the URL parameter.
 */
function getUrlParamBool(name, defaultBool = false) {
    const inputString = urlParams.get(name)?.toLowerCase();
    // Convert the parameter value to a boolean. Returns true for 'true' or '1'.
    if (inputString === 'true' || inputString === '1') {
        return true;
    }
    // Returns false for 'false' or '0'.
    if (inputString === 'false' || inputString === '0') {
        return false;
    }
    // If the parameter is not found, returns the default boolean value.
    return defaultBool;
}
/**
 * Retrieves an integer URL parameter. If the parameter is not found or is not a
 * valid number, returns the specified default integer value.
 * @param name - The name of the URL parameter.
 * @param defaultNumber - The default integer value if the
 *     parameter is not present.
 * @returns The integer value of the URL parameter.
 */
function getUrlParamInt(name, defaultNumber = 0) {
    const inputNumber = urlParams.get(name);
    if (inputNumber) {
        // Convert the parameter value to an integer. If valid, returns it.
        const num = parseInt(inputNumber, 10);
        if (!isNaN(num)) {
            return num;
        }
    }
    // If the parameter is not found or invalid, returns the default integer
    // value.
    return defaultNumber;
}
/**
 * Retrieves a float URL parameter. If the parameter is not found or is not a
 * valid number, returns the specified default float value.
 * @param name - The name of the URL parameter.
 * @param defaultNumber - The default float value if the parameter
 *     is not present.
 * @returns The float value of the URL parameter.
 */
function getUrlParamFloat(name, defaultNumber = 0) {
    const inputNumber = urlParams.get(name);
    if (inputNumber) {
        // Convert the parameter value to a float. If valid, returns it.
        const num = parseFloat(inputNumber);
        if (!isNaN(num)) {
            return num;
        }
    }
    // If the parameter is not found or invalid, returns the default float value.
    return defaultNumber;
}
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
function getVec4ByColorString(colorString) {
    if (typeof colorString !== 'string') {
        throw new Error('colorString must be a string');
    }
    // Remove the '#' if it exists.
    const hex = colorString.startsWith('#') ? colorString.slice(1) : colorString;
    const len = hex.length;
    let alpha = 1.0; // Default alpha to 1
    let expandedHex = hex;
    if (len === 3 || len === 4) {
        // Expand shorthand: rgb -> rrgbbaa or rgba -> rrggbbaa
        expandedHex = hex
            .split('')
            .map((char) => char + char)
            .join('');
    }
    if (expandedHex.length === 8) {
        alpha = parseInt(expandedHex.slice(6, 8), 16) / 255;
        expandedHex = expandedHex.slice(0, 6);
    }
    else if (expandedHex.length === 6) ;
    else {
        throw new Error(`Invalid hex color string format: ${colorString}`);
    }
    const r = parseInt(expandedHex.slice(0, 2), 16) / 255;
    const g = parseInt(expandedHex.slice(2, 4), 16) / 255;
    const b = parseInt(expandedHex.slice(4, 6), 16) / 255;
    if (isNaN(r) || isNaN(g) || isNaN(b) || isNaN(alpha)) {
        throw new Error(`Invalid hex values in color string: ${colorString}`);
    }
    return new THREE.Vector4(r, g, b, alpha);
}
function getColorHex(fontColor) {
    if (typeof fontColor === 'string') {
        const vec4 = getVec4ByColorString(fontColor);
        const r = Math.round(vec4.x * 255);
        const g = Math.round(vec4.y * 255);
        const b = Math.round(vec4.z * 255);
        return (r << 16) + (g << 8) + b;
    }
    else if (typeof fontColor === 'number') {
        return fontColor;
    }
    else {
        // Default to white if fontColor is invalid.
        return 0xffffff;
    }
}
/**
 * Parses a data URL (e.g., "data:image/png;base64,...") into its
 * stripped base64 string and MIME type.
 * This function handles common image MIME types.
 * @param dataURL - The data URL string.
 * @returns An object containing the stripped base64 string and the extracted
 *     MIME type.
 */
function parseBase64DataURL(dataURL) {
    const mimeTypeRegex = /^data:(image\/[a-zA-Z0-9\-+.]+);base64,/;
    const match = dataURL.match(mimeTypeRegex);
    if (match) {
        const mimeType = match[1];
        const strippedBase64 = dataURL.substring(match[0].length);
        return { strippedBase64, mimeType };
    }
    else {
        return { strippedBase64: dataURL, mimeType: null };
    }
}

const GEMINI_DEFAULT_FLASH_MODEL = 'gemini-2.5-flash';
const GEMINI_DEFAULT_LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';
class GeminiOptions {
    constructor() {
        this.apiKey = '';
        this.urlParam = 'geminiKey';
        this.keyValid = false;
        this.enabled = false;
        this.model = GEMINI_DEFAULT_FLASH_MODEL;
        this.liveModel = GEMINI_DEFAULT_LIVE_MODEL;
        this.config = {};
    }
}
class OpenAIOptions {
    constructor() {
        this.apiKey = '';
        this.urlParam = 'openaiKey';
        this.model = 'gpt-4.1';
        this.enabled = false;
    }
}
class AIOptions {
    constructor() {
        this.enabled = false;
        this.model = 'gemini';
        this.gemini = new GeminiOptions();
        this.openai = new OpenAIOptions();
        this.globalUrlParams = {
            key: 'key', // Generic key parameter
        };
    }
}

class BaseAIModel {
    constructor() { }
    async hasApiKey() {
        return false;
    }
}

function isRunningInGeminiCanvas() {
    // Canvas injects several scripts which allow using the free tier of Gemini and Firebase APIs without API keys.
    return (typeof window
        .firebaseAuthBridgeScriptLoaded !== 'undefined');
}

let createPartFromUri;
let createUserContent;
let GoogleGenAI;
let EndSensitivity;
let StartSensitivity;
let Modality;
// --- Attempt Dynamic Import ---
async function loadGoogleGenAIModule() {
    if (GoogleGenAI) {
        return;
    }
    try {
        const genAIModule = await import('@google/genai');
        if (genAIModule && genAIModule.GoogleGenAI) {
            createPartFromUri = genAIModule.createPartFromUri;
            createUserContent = genAIModule.createUserContent;
            GoogleGenAI = genAIModule.GoogleGenAI;
            EndSensitivity = genAIModule.EndSensitivity;
            StartSensitivity = genAIModule.StartSensitivity;
            Modality = genAIModule.Modality;
            console.log("'@google/genai' module loaded successfully.");
        }
        else {
            throw new Error("'@google/genai' module loaded but is not valid.");
        }
    }
    catch (error) {
        const errorMessage = `The '@google/genai' module is required for Gemini but failed to load. Error: ${error}`;
        console.error(errorMessage);
        throw new Error(errorMessage);
    }
}
class Gemini extends BaseAIModel {
    constructor(options) {
        super();
        this.options = options;
        this.inited = false;
        this.isLiveMode = false;
        this.liveCallbacks = {};
    }
    async init() {
        await loadGoogleGenAIModule();
    }
    isAvailable() {
        if (!GoogleGenAI) {
            return false;
        }
        if (!this.inited) {
            // Use a random string as API key to avoid Google GenAI from complaining.
            this.ai = new GoogleGenAI({ apiKey: this.options.apiKey || 'X' });
            this.inited = true;
        }
        return true;
    }
    isLiveAvailable() {
        return this.isAvailable() && EndSensitivity && StartSensitivity && Modality;
    }
    async startLiveSession(params = {}, model) {
        if (!this.isLiveAvailable()) {
            throw new Error('Live API not available. Make sure @google/genai module is loaded.');
        }
        if (this.liveSession) {
            return this.liveSession;
        }
        const defaultConfig = {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } },
            },
            outputAudioTranscription: {},
            inputAudioTranscription: {},
            ...params,
        };
        const callbacks = {
            onopen: () => {
                this.isLiveMode = true;
                console.log('🔓 Live session opened.');
                if (this.liveCallbacks?.onopen) {
                    this.liveCallbacks.onopen();
                }
            },
            onmessage: (e) => {
                if (this.liveCallbacks?.onmessage) {
                    this.liveCallbacks.onmessage(e);
                }
            },
            onerror: (e) => {
                console.error('❌ Live session error:', e);
                if (this.liveCallbacks?.onerror) {
                    this.liveCallbacks.onerror(e);
                }
            },
            onclose: (event) => {
                this.isLiveMode = false;
                this.liveSession = undefined;
                if (event.reason) {
                    console.warn('🔒 Live session closed:', event);
                }
                else {
                    console.warn('🔒 Live session closed without reason.');
                }
                if (this.liveCallbacks?.onclose) {
                    this.liveCallbacks.onclose(event);
                }
            },
        };
        try {
            const connectParams = {
                model: model ?? this.options.liveModel,
                callbacks: callbacks,
                config: defaultConfig,
            };
            console.log('Connecting with params:', connectParams);
            this.liveSession = await this.ai.live.connect(connectParams);
            return this.liveSession;
        }
        catch (error) {
            console.error('❌ Failed to start live session:', error);
            throw error;
        }
    }
    async stopLiveSession() {
        if (!this.liveSession) {
            return;
        }
        this.liveSession.close();
        this.liveSession = undefined;
        this.isLiveMode = false;
    }
    // Set Live session callbacks
    setLiveCallbacks(callbacks) {
        this.liveCallbacks = callbacks;
    }
    sendToolResponse(response) {
        if (this.liveSession) {
            console.debug('Sending tool response to gemini:', response);
            this.liveSession.sendToolResponse(response);
        }
    }
    sendRealtimeInput(input) {
        if (!this.liveSession) {
            return;
        }
        try {
            this.liveSession.sendRealtimeInput(input);
        }
        catch (error) {
            console.error('❌ Error sending realtime input:', error);
            throw error;
        }
    }
    getLiveSessionStatus() {
        return {
            isActive: this.isLiveMode,
            hasSession: !!this.liveSession,
            isAvailable: this.isLiveAvailable(),
        };
    }
    async query(input) {
        const useExponentialBackoff = 'useExponentialBackoff' in input &&
            input.useExponentialBackoff !== undefined
            ? input.useExponentialBackoff
            : isRunningInGeminiCanvas();
        if (useExponentialBackoff) {
            return this.queryWithExponentialFalloff(input);
        }
        return this.queryOnce(input);
    }
    async queryOnce(input) {
        if (!this.inited) {
            console.warn('Gemini not inited.');
            return null;
        }
        const options = this.options;
        const config = options.config || {};
        if (!('type' in input)) {
            const response = await this.ai.models.generateContent({
                model: options.model,
                contents: input.prompt,
                config: config,
            });
            return { text: response.text || null };
        }
        const model = this.ai.models;
        const modelParams = {
            model: this.options.model,
            contents: [],
            config: this.options.config || {},
        };
        let response = null;
        switch (input.type) {
            case 'text':
                modelParams.contents = input.text;
                response = await model.generateContent(modelParams);
                break;
            case 'base64':
                if (!input.mimeType) {
                    input.mimeType = 'image/png';
                }
                modelParams.contents = {
                    inlineData: {
                        mimeType: input.mimeType,
                        data: input.base64,
                    },
                };
                response = await model.generateContent(modelParams);
                break;
            case 'uri':
                modelParams.contents = createUserContent([
                    createPartFromUri(input.uri, input.mimeType),
                    input.text,
                ]);
                response = await model.generateContent(modelParams);
                break;
            case 'multiPart':
                modelParams.contents = [{ role: 'user', parts: input.parts }];
                response = await model.generateContent(modelParams);
                break;
        }
        if (!response) {
            return { text: null };
        }
        const toolCall = response.functionCalls?.[0];
        if (toolCall && toolCall.name) {
            return { toolCall: { name: toolCall.name, args: toolCall.args } };
        }
        return { text: response.text || null };
    }
    // Try to query multiple times with exponential backoff.
    // Only used within a Gemini Canvas environment.
    async queryWithExponentialFalloff(input) {
        const delays = [1000, 2000, 4000, 8000, 16000];
        let attempt = 0;
        let lastError = null;
        while (attempt < delays.length) {
            try {
                return await this.queryOnce(input);
            }
            catch (error) {
                console.warn(`Attempt ${attempt + 1} failed:`, error);
                lastError = error;
                await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
                attempt++;
            }
        }
        console.error('Failed to query with exponential backoff:', lastError);
        return null;
    }
    async generate(prompt, type = 'image', systemInstruction = 'Generate an image', model = 'gemini-2.5-flash-image') {
        if (!this.isAvailable())
            return;
        let contents;
        if (Array.isArray(prompt)) {
            contents = prompt.map((item) => {
                if (typeof item === 'string') {
                    if (item.startsWith('data:image/')) {
                        const [header, data] = item.split(',');
                        const mimeType = header.split(';')[0].split(':')[1];
                        return { inlineData: { mimeType, data } };
                    }
                    else {
                        return { text: item };
                    }
                }
                // Assumes other items are already valid Part objects
                return item;
            });
        }
        else {
            contents = prompt;
        }
        const response = await this.ai.models.generateContent({
            model: model,
            contents: contents,
            config: { systemInstruction },
        });
        if (response.candidates && response.candidates.length > 0) {
            const firstCandidate = response.candidates[0];
            for (const part of firstCandidate?.content?.parts || []) {
                if (type === 'image' && part.inlineData) {
                    return 'data:image/png;base64,' + part.inlineData.data;
                }
            }
        }
    }
    async hasApiKey() {
        return this.options.apiKey !== '' || isRunningInGeminiCanvas();
    }
}

let OpenAIApi = null;
async function loadOpenAIModule() {
    if (OpenAIApi) {
        return;
    }
    try {
        const openAIModule = await import('openai');
        OpenAIApi = openAIModule.default;
        console.log("'openai' module loaded successfully.");
    }
    catch (error) {
        console.warn("'openai' module not found. Using fallback implementations.", 'Error details:', error);
    }
}
class OpenAI extends BaseAIModel {
    constructor(options) {
        super();
        this.options = options;
    }
    async init() {
        await loadOpenAIModule();
        if (this.options.apiKey && OpenAIApi) {
            this.openai = new OpenAIApi({
                apiKey: this.options.apiKey,
                dangerouslyAllowBrowser: true,
            });
            console.log('OpenAI model initialized');
        }
        else {
            console.error('OpenAI API key is missing or module failed to load.');
        }
    }
    isAvailable() {
        return !!this.openai;
    }
    async query(input, _tools) {
        if (!this.isAvailable()) {
            throw new Error('OpenAI model is not initialized.');
        }
        try {
            const completion = await this.openai.chat.completions.create({
                messages: [{ role: 'user', content: input.prompt }],
                model: this.options.model,
            });
            const content = completion.choices[0].message.content;
            if (content) {
                return { text: content };
            }
            return null;
        }
        catch (error) {
            console.error('Error querying OpenAI:', error);
            throw error;
        }
    }
    async generate() {
        throw new Error('Wrapper not implemented');
    }
}

const SUPPORTED_MODELS = {
    gemini: Gemini,
    openai: OpenAI,
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
 *    - URL Parameter: ?key=\<api_key\>
 *    - keys.json file: Local configuration file
 *    - User Prompt: Interactive fallback
 * 2. keys.json Support:
 *    - Structure: \{"gemini": \{"apiKey": "YOUR_KEY_HERE"\}\}
 *    - Automatically loads if present
 */
class AI extends Script {
    constructor() {
        super(...arguments);
        this.editorIcon = 'network_intelligence';
        this.lock = false;
    }
    static { this.dependencies = { aiOptions: AIOptions }; }
    /**
     * Load API keys from keys.json file if available
     * Parsed keys object or null if not found
     */
    async loadKeysFromFile() {
        if (this.keysCache)
            return this.keysCache;
        try {
            const response = await fetch('./keys.json');
            if (response.ok) {
                this.keysCache = (await response.json());
                console.log('🔑 Loaded keys.json');
                return this.keysCache;
            }
        }
        catch {
            // Silent fail - keys.json is optional
        }
        return null;
    }
    async init({ aiOptions }) {
        this.options = aiOptions;
        if (!aiOptions.enabled) {
            console.log('AI is disabled in options');
            return;
        }
        const modelName = aiOptions.model;
        const ModelClass = SUPPORTED_MODELS[modelName];
        if (ModelClass) {
            const modelOptions = aiOptions[modelName];
            if (modelOptions && modelOptions.enabled) {
                await this.initializeModel(ModelClass, modelOptions);
            }
            else {
                console.log(`${modelName} is disabled in AI options`);
            }
        }
        else {
            console.error(`Unsupported AI model: ${modelName}`);
        }
    }
    async initializeModel(ModelClass, modelOptions) {
        const apiKey = await this.resolveApiKey(modelOptions);
        if ((!apiKey || !this.isValidApiKey(apiKey)) && !this.hasApiKey()) {
            console.error(`No valid API key found for ${this.options.model}`);
            return;
        }
        modelOptions.apiKey = apiKey || '';
        this.model = new ModelClass(modelOptions);
        try {
            await this.model.init();
            console.log(`${this.options.model} initialized`);
        }
        catch (error) {
            console.error(`Failed to initialize ${this.options.model}:`, error);
            this.model = undefined;
        }
    }
    async resolveApiKey(modelOptions) {
        const modelName = this.options.model;
        // 1. Check options
        if (modelOptions.apiKey) {
            return modelOptions.apiKey;
        }
        // 2. Check URL parameters for 'key'
        const genericKey = getUrlParameter('key');
        if (genericKey) {
            return genericKey;
        }
        // 3. Check URL parameters for model-specific key
        const modelKey = getUrlParameter(modelOptions.urlParam);
        if (modelKey)
            return modelKey;
        // Temporary fallback to geminiKey64 for teamfood.
        const geminiKey64 = getUrlParameter('geminiKey64');
        if (geminiKey64) {
            return window.atob(geminiKey64);
        }
        // 3. Check keys.json file
        const keysFromFile = await this.loadKeysFromFile();
        if (keysFromFile) {
            const modelNameWithApiKeySuffix = modelName + `ApiKey`;
            let keyFromFile = null;
            if (typeof keysFromFile[modelName] === 'object') {
                keyFromFile = keysFromFile[modelName]?.apiKey;
            }
            else if (typeof keysFromFile[modelNameWithApiKeySuffix] === 'string') {
                keyFromFile = keysFromFile[modelNameWithApiKeySuffix];
            }
            else if (typeof keysFromFile[modelName] === 'string') {
                keyFromFile = keysFromFile[modelName];
            }
            if (keyFromFile) {
                console.log(`🔑 Using ${modelName} key from keys.json`);
                return keyFromFile;
            }
        }
        return null;
    }
    isValidApiKey(key) {
        return key && typeof key === 'string' && key.length > 0;
    }
    isAvailable() {
        return this.model && this.model.isAvailable();
    }
    async query(input, tools) {
        if (!this.isAvailable()) {
            throw new Error("AI is not available. Check if it's enabled and properly initialized.");
        }
        return await this.model.query(input, tools);
    }
    async startLiveSession(config = {}, model) {
        if (!this.model) {
            throw new Error('AI model is not initialized.');
        }
        if (!('isLiveAvailable' in this.model) || !this.model.isLiveAvailable()) {
            throw new Error('Live session is not available for the current model.');
        }
        try {
            const session = await this.model.startLiveSession(config, model);
            return session;
        }
        catch (error) {
            console.error('❌ Failed to start Live session:', error);
            throw error;
        }
    }
    async stopLiveSession() {
        if (!this.model)
            return;
        try {
            await ('stopLiveSession' in this.model && this.model.stopLiveSession());
        }
        catch (error) {
            console.error('❌ Error stopping Live session:', error);
        }
    }
    async setLiveCallbacks(callbacks) {
        if (this.model && 'setLiveCallbacks' in this.model) {
            this.model.setLiveCallbacks(callbacks);
        }
    }
    sendToolResponse(response) {
        if (this.model && 'sendToolResponse' in this.model) {
            this.model.sendToolResponse(response);
        }
    }
    sendRealtimeInput(input) {
        if (!this.model || !('sendRealtimeInput' in this.model))
            return false;
        return this.model.sendRealtimeInput(input);
    }
    getLiveSessionStatus() {
        if (!this.model || !('getLiveSessionStatus' in this.model)) {
            return { isActive: false, hasSession: false, isAvailable: false };
        }
        return this.model.getLiveSessionStatus();
    }
    isLiveAvailable() {
        return (this.model &&
            'isLiveAvailable' in this.model &&
            this.model.isLiveAvailable());
    }
    /**
     * In simulator mode, pop up a 2D UI to request Gemini key;
     * In XR mode, show a 3D UI to instruct users to get an API key.
     */
    triggerKeyPopup() { }
    async generate(prompt, type = 'image', systemInstruction = 'Generate an image', model = undefined) {
        return this.model.generate(prompt, type, systemInstruction, model);
    }
    /**
     * Create a sample keys.json file structure for reference
     * @returns Sample keys.json structure
     */
    static createSampleKeysStructure() {
        return {
            gemini: { apiKey: 'YOUR_GEMINI_API_KEY_HERE' },
            openai: { apiKey: 'YOUR_OPENAI_API_KEY_HERE' },
        };
    }
    /**
     * Check if the current model has an API key available from any source
     * @returns True if API key is available
     */
    async hasApiKey() {
        if (!this.options)
            return false;
        const modelOptions = this.options[this.options.model];
        if (!modelOptions)
            return false;
        if (this.model?.hasApiKey ? await this.model.hasApiKey() : false)
            return true;
        const apiKey = await this.resolveApiKey(modelOptions);
        return apiKey && this.isValidApiKey(apiKey);
    }
}

// --- Hands ---
/**
 * The number of hands tracked in a typical XR session (left and right).
 */
const NUM_HANDS = 2;
/**
 * The number of joints per hand tracked in a typical XR session.
 */
const HAND_JOINT_COUNT = 25;
/**
 * The pairs of joints as an adjcent list.
 */
const HAND_JOINT_IDX_CONNECTION_MAP = [
    [1, 2],
    [2, 3],
    [3, 4], // Thumb has 3 bones
    [5, 6],
    [6, 7],
    [7, 8],
    [8, 9], // Index finger has 4 bones
    [10, 11],
    [11, 12],
    [12, 13],
    [13, 14], // Middle finger has 4 bones
    [15, 16],
    [16, 17],
    [17, 18],
    [18, 19], // Ring finger has 4 bones
    [20, 21],
    [21, 22],
    [22, 23],
    [23, 24], // Little finger has 4 bones
];
/**
 * The pairs of bones' ids per angle as an adjcent list.
 */
// clang-format off
const HAND_BONE_IDX_CONNECTION_MAP = [
    [0, 1],
    [1, 2], // Thumb has 2 angles
    [3, 4],
    [4, 5],
    [5, 6], // Index finger has 3 angles
    [7, 8],
    [8, 9],
    [9, 10], // Middle finger has 3 angles
    [11, 12],
    [12, 13],
    [13, 14], // Ring finger has 3 angles
    [15, 16],
    [16, 17],
    [17, 18], // Little finger has 3 angles
];
// clang-format on
// --- UI ---
/**
 * A small depth offset (in meters) applied between layered UI elements to
 * prevent Z-fighting, which is a visual artifact where surfaces at similar
 * depths appear to flicker.
 */
const VIEW_DEPTH_GAP = 0.002;
// --- Renderer Layer ---
/**
 * The THREE.js rendering layer used exclusively for objects that should only be
 * visible to the left eye's camera in stereoscopic rendering.
 */
const LEFT_VIEW_ONLY_LAYER = 1;
/**
 * The THREE.js rendering layer used exclusively for objects that should only be
 * visible to the right eye's camera in stereoscopic rendering.
 */
const RIGHT_VIEW_ONLY_LAYER = 2;
/**
 * The THREE.js rendering layer for virtual objects that should be realistically
 * occluded by real-world objects when depth sensing is active.
 */
const OCCLUDABLE_ITEMS_LAYER = 3;
/**
 * Layer used for rendering overlaid UI text. Currently only used for LabelView.
 */
const UI_OVERLAY_LAYER = 4;
// --- Camera ---
/**
 * The default ideal width in pixels for requesting the device camera stream.
 * Corresponds to a 720p resolution.
 */
const DEFAULT_DEVICE_CAMERA_WIDTH = 1280;
/**
 * The default ideal height in pixels for requesting the device camera stream.
 * Corresponds to a 720p resolution.
 */
const DEFAULT_DEVICE_CAMERA_HEIGHT = 720;
const XR_BLOCKS_ASSETS_PATH = 'https://cdn.jsdelivr.net/gh/xrblocks/assets@a500427f2dfc12312df1a75860460244bab3a146/';

/**
 * Recursively freezes an object and all its nested properties, making them
 * immutable. This prevents any future changes to the object or its sub-objects.
 * @param obj - The object to freeze deeply.
 * @returns The same object that was passed in, now deeply frozen.
 */
function deepFreeze(obj) {
    Object.freeze(obj);
    Object.getOwnPropertyNames(obj).forEach((name) => {
        // We use `any` here because `T` is a generic and we can't be sure
        // what properties it has without more complex type manipulation.
        // The function's signature provides the necessary type safety for
        // consumers.
        const prop = obj[name];
        if (prop && typeof prop === 'object' && !Object.isFrozen(prop)) {
            deepFreeze(prop);
        }
    });
    return obj;
}
/**
 * Recursively merges properties from `obj2` into `obj1`.
 * If a property exists in both objects and is an object itself, it will be
 * recursively merged. Otherwise, the value from `obj2` will overwrite the
 * value in `obj1`.
 * @param obj1 - The target object to merge into.
 * @param obj2 - The source object to merge from.
 */
function deepMerge(obj1, obj2) {
    if (obj2 == null) {
        return obj1;
    }
    const merged = obj1;
    for (const key in obj2) {
        // Ensure the key is actually on obj2, not its prototype chain,
        // and skip dangerous keys to prevent prototype pollution.
        if (Object.hasOwn(obj2, key) &&
            key !== '__proto__' &&
            key !== 'constructor' &&
            key !== 'prototype') {
            const val1 = merged[key];
            const val2 = obj2[key];
            if (val1 &&
                typeof val1 === 'object' &&
                val2 &&
                typeof val2 === 'object') {
                // If both values are objects, recurse
                deepMerge(val1, val2);
            }
            else if (val2 && typeof val2 === 'object') {
                // Clone val2 if val1 is not an object
                const clone = Array.isArray(val2) ? [] : {};
                deepMerge(clone, val2);
                merged[key] = clone;
            }
            else {
                // Otherwise, overwrite
                merged[key] = val2;
            }
        }
    }
}

/**
 * Default parameters for rgb to depth projection.
 * For RGB and depth, 4:3 and 1:1, respectively.
 */
const DEFAULT_RGB_TO_DEPTH_PARAMS = {
    scale: 1,
    scaleX: 0.75,
    scaleY: 0.63,
    translateU: 0.2,
    translateV: -0.02,
    k1: -0.046,
    k2: 0,
    k3: 0,
    p1: 0,
    p2: 0,
    xc: 0,
    yc: 0,
};
/**
 * Configuration options for the device camera.
 */
class DeviceCameraOptions {
    constructor(options) {
        this.enabled = false;
        /**
         * Hint for performance optimization on frequent captures.
         */
        this.willCaptureFrequently = false;
        /**
         * Parameters for RGB to depth UV mapping given different aspect ratios.
         */
        this.rgbToDepthParams = { ...DEFAULT_RGB_TO_DEPTH_PARAMS };
        deepMerge(this, options);
    }
}
// Base configuration for all common capture settings.
const baseCaptureOptions = {
    enabled: true,
    videoConstraints: {
        width: { ideal: DEFAULT_DEVICE_CAMERA_WIDTH },
        height: { ideal: DEFAULT_DEVICE_CAMERA_HEIGHT },
    },
};
const xrDeviceCameraEnvironmentOptions = deepFreeze(new DeviceCameraOptions({
    ...baseCaptureOptions,
    videoConstraints: {
        ...baseCaptureOptions.videoConstraints,
        facingMode: 'environment',
    },
}));
const xrDeviceCameraUserOptions = deepFreeze(new DeviceCameraOptions({
    ...baseCaptureOptions,
    videoConstraints: {
        ...baseCaptureOptions.videoConstraints,
        facingMode: 'user',
    },
}));
const xrDeviceCameraEnvironmentContinuousOptions = deepFreeze(new DeviceCameraOptions({
    ...xrDeviceCameraEnvironmentOptions,
    willCaptureFrequently: true,
}));
const xrDeviceCameraUserContinuousOptions = deepFreeze(new DeviceCameraOptions({
    ...xrDeviceCameraUserOptions,
    willCaptureFrequently: true,
}));

function intrinsicsToProjectionMatrix(K, width, height, near, far, target) {
    const fx = K[0];
    const fy = K[4];
    const cx = K[2];
    const cy = K[5];
    // Calculate the projection matrix elements
    // Note: Three.js set() takes row-major arguments (m00, m01, m02...)
    // but stores them column-major internally.
    const x = (2 * fx) / width;
    const y = (2 * fy) / height;
    // Principal point offsets
    // These map the center of the image (cx, cy) to the center of the viewport
    const a = 1 - (2 * cx) / width;
    const b = (2 * cy) / height - 1;
    const c = -(far + near) / (far - near);
    const d = -(2 * far * near) / (far - near);
    target.set(x, 0, a, 0, 0, y, b, 0, 0, 0, c, d, 0, 0, -1, 0);
    return target;
}

// prettier-ignore
const MOOHAN_INTRINSICS_MATRIX = [
    800, 0, 640,
    0, 800, 360,
    0, 0, 1,
];
const MOOHAN_PROJECTION_MATRIX = intrinsicsToProjectionMatrix(MOOHAN_INTRINSICS_MATRIX, 1280, 720, 0.1, 1000, new THREE.Matrix4());
const MOOHAN_CAMERA_POSE_IN_RIGHT_CAMERA_POSITION = new THREE.Vector3(0, -3e-3, 0);
const MOOHAN_CAMERA_POSE_IN_RIGHT_CAMERA_ROTATION = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.02, -0.05, 0, 'YXZ'));
const MOOHAN_CAMERA_POSE_IN_RIGHT_CAMERA_SCALE = new THREE.Vector3(1, 1, 1);
// Pose of the moohan camera w.r.t. right camera.
new THREE.Matrix4().compose(MOOHAN_CAMERA_POSE_IN_RIGHT_CAMERA_POSITION, MOOHAN_CAMERA_POSE_IN_RIGHT_CAMERA_ROTATION, MOOHAN_CAMERA_POSE_IN_RIGHT_CAMERA_SCALE);
function getMoohanCameraPose(_camera, xrCameras, target) {
    target.compose(MOOHAN_CAMERA_POSE_IN_RIGHT_CAMERA_POSITION, MOOHAN_CAMERA_POSE_IN_RIGHT_CAMERA_ROTATION, MOOHAN_CAMERA_POSE_IN_RIGHT_CAMERA_SCALE);
    target.premultiply(xrCameras.cameras[1].matrixWorld);
}

const DEVICE_CAMERA_PARAMETERS = {
    galaxyxr: {
        projectionMatrix: MOOHAN_PROJECTION_MATRIX,
        getCameraPose: getMoohanCameraPose,
    },
};
function getDeviceCameraClipFromView(renderCamera, deviceCamera, targetDevice) {
    if (deviceCamera.simulatorCamera) {
        const simulatorCamera = new THREE.PerspectiveCamera();
        // The simulator camera captures a 1x1 image by cropping the center.
        // If aspect > 1 (landscape), the height is the limiting factor, so the fov is unchanged.
        // If aspect < 1 (portrait), the width is the limiting factor, so the new vertical fov is the original horizontal fov.
        const originalAspect = renderCamera.aspect;
        if (originalAspect > 1.0) {
            simulatorCamera.fov = renderCamera.fov;
        }
        else {
            const vFovRad = THREE.MathUtils.degToRad(renderCamera.fov);
            const hFovRad = 2 * Math.atan(Math.tan(vFovRad / 2) * originalAspect);
            simulatorCamera.fov = THREE.MathUtils.radToDeg(hFovRad);
        }
        simulatorCamera.aspect = 1.0;
        simulatorCamera.near = renderCamera.near;
        simulatorCamera.far = renderCamera.far;
        simulatorCamera.updateProjectionMatrix();
        return simulatorCamera.projectionMatrix;
    }
    else {
        return DEVICE_CAMERA_PARAMETERS[targetDevice].projectionMatrix;
    }
}
function getDeviceCameraWorldFromView(renderCamera, xrCameras, deviceCamera, targetDevice) {
    if (deviceCamera?.simulatorCamera) {
        return renderCamera.matrixWorld.clone();
    }
    else if (xrCameras && xrCameras.cameras.length > 0) {
        const target = new THREE.Matrix4();
        DEVICE_CAMERA_PARAMETERS[targetDevice].getCameraPose(renderCamera, xrCameras, target);
        return target;
    }
    throw new Error('No XR cameras available');
}
function getDeviceCameraWorldFromClip(renderCamera, xrCameras, deviceCamera, targetDevice) {
    const projectionMatrix = getDeviceCameraClipFromView(renderCamera, deviceCamera, targetDevice);
    const viewMatrix = getDeviceCameraWorldFromView(renderCamera, xrCameras, deviceCamera, targetDevice).invert();
    return new THREE.Matrix4()
        .multiplyMatrices(projectionMatrix, viewMatrix)
        .invert();
}
function getCameraParametersSnapshot(camera, xrCameras, deviceCamera, targetDevice) {
    const clipFromView = getDeviceCameraClipFromView(camera, deviceCamera, targetDevice);
    if (!clipFromView) {
        throw new Error('Could not get clip from view');
    }
    return {
        clipFromView: clipFromView,
        viewFromClip: clipFromView.clone().invert(),
        worldFromClip: getDeviceCameraWorldFromClip(camera, xrCameras, deviceCamera, targetDevice),
        worldFromView: getDeviceCameraWorldFromView(camera, xrCameras, deviceCamera, targetDevice),
    };
}
/**
 * Raycasts to the depth mesh to find the world position and normal at a given UV coordinate.
 * @param rgbUv - The UV coordinate to raycast from.
 * @param depthMeshSnapshot - The depth mesh to raycast against.
 * @param cameraParametersSnapshot - Parameters of the device camera relative to the render camera's world.
 * @returns The world position, normal, and depth at the given UV coordinate.
 */
function transformRgbUvToWorld(rgbUv, depthMeshSnapshot, cameraParametersSnapshot) {
    const origin = new THREE.Vector3().applyMatrix4(cameraParametersSnapshot.worldFromView);
    const direction = new THREE.Vector3(2 * rgbUv.x - 1, 2 * (1.0 - rgbUv.y) - 1, -1)
        .applyMatrix4(cameraParametersSnapshot.worldFromClip)
        .sub(origin)
        .normalize();
    const raycaster = new THREE.Raycaster(origin, direction);
    const intersections = raycaster.intersectObject(depthMeshSnapshot);
    if (intersections.length === 0) {
        console.warn('No intersections found for UV:', rgbUv);
        return null;
    }
    const intersection = intersections[0];
    return {
        worldPosition: intersection.point,
        worldNormal: intersection
            .face.normal.clone()
            .applyQuaternion(depthMeshSnapshot.quaternion),
        depthInMeters: intersection.distance,
    };
}
/**
 * Helper function to prepare a canvas for the bounding box for rendering purposes.
 * Calculates the clamped bounding box and returns the canvas, context, and dimensions.
 */
function createBoundingBoxCanvasResult(width, height, boundingBox) {
    const unitBox = new THREE.Box2(new THREE.Vector2(0, 0), new THREE.Vector2(1, 1));
    const clampedBox = boundingBox.clone().intersect(unitBox);
    const cropSize = new THREE.Vector2();
    clampedBox.getSize(cropSize);
    if (cropSize.x === 0 || cropSize.y === 0) {
        return null;
    }
    const sourceX = Math.floor(width * clampedBox.min.x);
    const sourceY = Math.floor(height * clampedBox.min.y);
    const sourceWidth = Math.ceil(width * cropSize.x);
    const sourceHeight = Math.ceil(height * cropSize.y);
    const canvas = document.createElement('canvas');
    canvas.width = sourceWidth;
    canvas.height = sourceHeight;
    const ctx = canvas.getContext('2d');
    return { canvas, ctx, sourceX, sourceY, sourceWidth, sourceHeight };
}
/**
 * Asynchronously crops an image (provided as a base64 string or ImageData) using a THREE.Box2 bounding box.
 * This function draws a specified portion of the image to a canvas and returns the canvas content as a new base64 string.
 * @param imageSource - The source image as a base64 string or ImageData object.
 * @param boundingBox - The bounding box with relative coordinates (0-1) for cropping.
 * @returns A promise that resolves with the base64 string of the cropped image.
 */
async function cropImage(imageSource, boundingBox) {
    if (!imageSource) {
        throw new Error('No image data provided for cropping.');
    }
    let width;
    let height;
    let drawOp;
    if (typeof imageSource === 'string') {
        const img = new Image();
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = (err) => {
                console.error('Error loading image for cropping:', err);
                reject(new Error('Failed to load image for cropping.'));
            };
            img.src = imageSource.startsWith('data:image')
                ? imageSource
                : `data:image/png;base64,${imageSource}`;
        });
        width = img.width;
        height = img.height;
        drawOp = (ctx, canvasResult) => {
            ctx.drawImage(img, canvasResult.sourceX, canvasResult.sourceY, canvasResult.sourceWidth, canvasResult.sourceHeight, 0, 0, canvasResult.sourceWidth, canvasResult.sourceHeight);
        };
    }
    else if (imageSource instanceof ImageData) {
        width = imageSource.width;
        height = imageSource.height;
        drawOp = (ctx, canvasResult) => {
            ctx.putImageData(imageSource, -canvasResult.sourceX, -canvasResult.sourceY, canvasResult.sourceX, canvasResult.sourceY, canvasResult.sourceWidth, canvasResult.sourceHeight);
        };
    }
    else {
        console.warn('Unsupported image source type for cropping.');
        return 'data:image/png;base64,';
    }
    const canvasResult = createBoundingBoxCanvasResult(width, height, boundingBox);
    if (!canvasResult) {
        console.warn('Unable to create CanvasResult for cropping.');
        return 'data:image/png;base64,';
    }
    drawOp(canvasResult.ctx, canvasResult);
    return canvasResult.canvas.toDataURL('image/png');
}

/**
 * Enum for video stream states.
 */
var StreamState;
(function (StreamState) {
    StreamState["IDLE"] = "idle";
    StreamState["INITIALIZING"] = "initializing";
    StreamState["STREAMING"] = "streaming";
    StreamState["ERROR"] = "error";
    StreamState["NO_DEVICES_FOUND"] = "no_devices_found";
})(StreamState || (StreamState = {}));
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
        reader.onerror = () => reject(reader.error);
    });
}
/**
 * The base class for handling video streams (from camera or file), managing
 * the underlying <video> element, streaming state, and snapshot logic.
 */
class VideoStream extends Script {
    get video() {
        return this.video_;
    }
    /**
     * @param options - The configuration options.
     */
    constructor({ willCaptureFrequently = false } = {}) {
        super();
        this.loaded = false;
        this.state = StreamState.IDLE;
        this.stream_ = null;
        this.video_ = document.createElement('video');
        this.frozenTexture_ = null;
        this.canvas_ = null;
        this.context_ = null;
        this.willCaptureFrequently_ = willCaptureFrequently;
        this.video_.autoplay = true;
        this.video_.muted = true;
        this.video_.playsInline = true;
        this.texture = new THREE.VideoTexture(this.video_);
        this.texture.colorSpace = THREE.SRGBColorSpace;
        this.texture.minFilter = THREE.LinearFilter;
        this.texture.magFilter = THREE.LinearFilter;
        // Keep the texture updating when srcObject changes.
        const texture = this.texture;
        const videoEl = this.video_;
        texture.update = function () {
            if (videoEl.readyState >= videoEl.HAVE_CURRENT_DATA) {
                texture.needsUpdate = true;
            }
        };
    }
    /**
     * Sets the stream's state and dispatches a 'statechange' event.
     * @param state - The new state.
     * @param details - Additional data for the event payload.
     */
    setState_(state, details = {}) {
        if (this.state === state && !details.force)
            return;
        this.state = state;
        this.dispatchEvent({ type: 'statechange', state: this.state, ...details });
        console.debug(`VideoStream state changed to ${state} with details:`, details);
    }
    /**
     * Processes video metadata, sets dimensions, and resolves a promise.
     * @param resolve - The resolve function of the wrapping Promise.
     * @param reject - The reject function of the wrapping Promise.
     * @param allowRetry - Whether to allow a retry attempt on failure.
     */
    handleVideoStreamLoadedMetadata(resolve, reject, allowRetry = false) {
        try {
            if (this.video_.videoWidth > 0 && this.video_.videoHeight > 0) {
                this.width = this.video_.videoWidth;
                this.height = this.video_.videoHeight;
                this.aspectRatio = this.width / this.height;
                this.loaded = true;
                resolve();
            }
            else if (allowRetry) {
                setTimeout(() => {
                    this.handleVideoStreamLoadedMetadata(resolve, reject, false);
                }, 500);
            }
            else {
                const error = new Error('Failed to get valid video dimensions.');
                this.setState_(StreamState.ERROR, { error });
                reject(error);
            }
        }
        catch (error) {
            if (error instanceof Error) {
                this.setState_(StreamState.ERROR, { error });
                reject(error);
            }
        }
    }
    getSnapshot({ width = this.width, height = this.height, outputFormat = 'texture', ...rest } = {}) {
        if (!this.loaded ||
            !width ||
            !height ||
            this.video_.readyState < this.video_.HAVE_CURRENT_DATA) {
            return null;
        }
        if (width > this.width || height > this.height) {
            console.warn(`The requested snapshot width (${width}px x ${height}px) is larger than the source video width (${this.width}px x ${this.height}px). The snapshot will be upscaled.`);
        }
        const mimeType = ('mimeType' in rest ? rest.mimeType : undefined) ?? 'image/jpeg';
        const quality = ('quality' in rest ? rest.quality : undefined) ?? 0.9;
        try {
            // Re-initialize canvas only if dimensions have changed.
            if (!this.canvas_ ||
                this.canvas_.width !== width ||
                this.canvas_.height !== height) {
                this.canvas_ = document.createElement('canvas');
                this.canvas_.width = width;
                this.canvas_.height = height;
                this.context_ = this.canvas_.getContext('2d', {
                    willCaptureFrequently: this.willCaptureFrequently_,
                });
            }
            this.context_.drawImage(this.video_, 0, 0, width, height);
            switch (outputFormat) {
                case 'imageData':
                    return this.context_.getImageData(0, 0, width, height);
                case 'base64':
                    return new Promise((resolve) => this.canvas_.toBlob(resolve, mimeType, quality)).then((blob) => (blob ? blobToBase64(blob) : null));
                case 'blob':
                    return new Promise((resolve) => this.canvas_.toBlob(resolve, mimeType, quality));
                case 'texture':
                default: {
                    const frozenTexture = new THREE.Texture(this.canvas_);
                    frozenTexture.needsUpdate = true;
                    frozenTexture.colorSpace = THREE.SRGBColorSpace;
                    this.frozenTexture_ = frozenTexture;
                    return this.frozenTexture_;
                }
            }
        }
        catch (error) {
            console.error('Error capturing snapshot:', error);
            return null;
        }
    }
    /**
     * Stops the current video stream tracks.
     */
    stop_() {
        if (this.stream_) {
            this.stream_.getTracks().forEach((track) => track.stop());
            this.stream_ = null;
        }
        if (this.video_.srcObject) {
            this.video_.srcObject = null;
        }
        if (this.video_.src && this.video_.src.startsWith('blob:')) {
            URL.revokeObjectURL(this.video_.src);
        }
        this.video_.src = '';
        this.loaded = false;
        this.setState_(StreamState.IDLE);
    }
    /**
     * Disposes of all resources used by this stream.
     */
    dispose() {
        this.stop_();
        this.texture?.dispose();
        this.frozenTexture_?.dispose();
        this.canvas_ = null;
        this.context_ = null;
        super.dispose();
    }
}

/**
 * Handles video capture from a device camera, manages the device list,
 * and reports its state using VideoStream's event model.
 */
class XRDeviceCamera extends VideoStream {
    static { this.XR_CAMERA_ACCESS_TIMEOUT_MS = 5000; }
    /**
     * @param options - The configuration options.
     */
    constructor(options) {
        super({ willCaptureFrequently: options.willCaptureFrequently ?? false });
        this.options = options;
        this.isInitializing_ = false;
        this.availableDevices_ = [];
        this.currentDeviceIndex_ = -1;
        this.useXRCameraAccess_ = false;
        this.xrCameraAccessTimeout_ = null;
        this.videoConstraints_ = options.videoConstraints ?? {
            facingMode: 'environment',
        };
        this.rgbToDepthParams =
            options.rgbToDepthParams ?? DEFAULT_RGB_TO_DEPTH_PARAMS;
    }
    /**
     * Retrieves the list of available video input devices.
     * @returns A promise that resolves with an
     * array of video devices.
     */
    async getAvailableVideoDevices() {
        if (!navigator.mediaDevices?.enumerateDevices) {
            console.warn('navigator.mediaDevices.enumerateDevices() is not supported.');
            return [];
        }
        const devices = [
            ...(await navigator.mediaDevices.enumerateDevices()),
        ];
        if (this.simulatorCamera) {
            const simulatorDevices = await this.simulatorCamera.enumerateDevices();
            devices.push(...simulatorDevices);
        }
        return devices.filter((device) => device.kind === 'videoinput');
    }
    /**
     * Sets the renderer reference, needed for WebXR camera access fallback.
     */
    setRenderer(renderer) {
        this.renderer_ = renderer;
    }
    /**
     * Initializes the camera based on the initial constraints.
     */
    async init() {
        this.useXRCameraAccess_ = false;
        this.clearXRCameraAccessTimeout_();
        this.setState_(StreamState.INITIALIZING);
        try {
            this.availableDevices_ = await this.getAvailableVideoDevices();
            if (this.availableDevices_.length > 0) {
                await this.initStream_();
            }
            else if (this.renderer_) {
                this.startXRCameraAccessFallback_('No video devices found.');
                return;
            }
            else {
                this.setState_(StreamState.NO_DEVICES_FOUND);
                console.warn('No video devices found.');
            }
        }
        catch (error) {
            if (this.renderer_) {
                this.startXRCameraAccessFallback_('Camera initialization failed.', error);
                return;
            }
            this.setState_(StreamState.ERROR, { error: error });
            console.error('Error initializing XRDeviceCamera:', error);
            throw error;
        }
    }
    getDeviceIdFromLabel(label) {
        return (this.availableDevices_.find((x) => x.label == label)?.deviceId ?? null);
    }
    /**
     * Initializes the media stream from the user's camera. After the stream
     * starts, it updates the current device index based on the stream's active
     * track.
     */
    async initStream_() {
        if (this.isInitializing_)
            return;
        this.isInitializing_ = true;
        this.setState_(StreamState.INITIALIZING);
        // Reset state for the new stream.
        this.currentTrackSettings_ = undefined;
        this.currentDeviceIndex_ = -1;
        try {
            console.debug('Requesting media stream with constraints:', this.videoConstraints_);
            let stream = null;
            const deviceIdConstraint = this.videoConstraints_.deviceId;
            const targetDeviceId = typeof deviceIdConstraint === 'string'
                ? deviceIdConstraint
                : Array.isArray(deviceIdConstraint)
                    ? deviceIdConstraint[0]
                    : deviceIdConstraint?.exact;
            const useSimulatorCamera = !!this.simulatorCamera &&
                ((targetDeviceId &&
                    this.availableDevices_.find((d) => d.deviceId === targetDeviceId)
                        ?.groupId === 'simulator') ||
                    (!targetDeviceId &&
                        this.videoConstraints_.facingMode === 'environment'));
            const targetDeviceIdFromLabel = this.options.cameraLabel
                ? this.getDeviceIdFromLabel(this.options.cameraLabel)
                : null;
            if (!this.videoConstraints_.deviceId && targetDeviceIdFromLabel) {
                this.videoConstraints_ = {
                    deviceId: targetDeviceIdFromLabel,
                    ...this.videoConstraints_,
                };
            }
            if (useSimulatorCamera) {
                stream = this.simulatorCamera.getMedia(this.videoConstraints_);
                if (!stream) {
                    throw new Error('Simulator camera failed to provide a media stream.');
                }
            }
            else {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: this.videoConstraints_,
                });
            }
            const videoTracks = stream?.getVideoTracks() || [];
            if (!videoTracks.length) {
                throw new Error('MediaStream has no video tracks.');
            }
            const activeTrack = videoTracks[0];
            this.currentTrackSettings_ = activeTrack.getSettings();
            console.debug('Active track settings:', this.currentTrackSettings_);
            if (this.currentTrackSettings_.deviceId) {
                this.currentDeviceIndex_ = this.availableDevices_.findIndex((device) => device.deviceId === this.currentTrackSettings_.deviceId);
            }
            else {
                console.warn('Stream started without deviceId as it was unavailable');
            }
            // Clear handlers before resetting the element.
            this.video_.onerror = null;
            this.video_.onloadedmetadata = null;
            this.stop_(); // Stop any previous stream before starting new one.
            this.stream_ = stream;
            this.video_.srcObject = stream;
            await new Promise((resolve, reject) => {
                this.video_.onloadedmetadata = () => {
                    this.handleVideoStreamLoadedMetadata(resolve, reject, true);
                };
                // Autoplay policy can still reject play() here.
                this.video_.play().catch((playError) => {
                    console.warn('video.play() rejected (may still autoplay):', playError);
                });
            });
            const details = {
                width: this.width,
                height: this.height,
                aspectRatio: this.aspectRatio,
                device: this.getCurrentDevice(),
                facingMode: this.currentTrackSettings_.facingMode,
                trackSettings: this.currentTrackSettings_,
            };
            this.setState_(StreamState.STREAMING, details);
        }
        finally {
            this.isInitializing_ = false;
        }
    }
    /**
     * Sets the active camera by its device ID. Removes potentially conflicting
     * constraints such as facingMode.
     * @param deviceId - Device ID
     */
    async setDeviceId(deviceId) {
        const newIndex = this.availableDevices_.findIndex((device) => device.deviceId === deviceId);
        if (newIndex === -1) {
            throw new Error(`Device with ID ${deviceId} not found.`);
        }
        if (newIndex === this.currentDeviceIndex_) {
            console.log(`Device ${deviceId} is already active.`);
            return;
        }
        delete this.videoConstraints_.facingMode;
        this.videoConstraints_.deviceId = { exact: deviceId };
        await this.initStream_();
    }
    /**
     * Sets the active camera by its facing mode ('user' or 'environment').
     * @param facingMode - facing mode
     */
    async setFacingMode(facingMode) {
        delete this.videoConstraints_.deviceId;
        this.videoConstraints_.facingMode = facingMode;
        this.currentDeviceIndex_ = -1;
        await this.initStream_();
    }
    /**
     * Gets the list of enumerated video devices.
     */
    getAvailableDevices() {
        return this.availableDevices_;
    }
    /**
     * Gets the currently active device info, if available.
     */
    getCurrentDevice() {
        if (this.currentDeviceIndex_ === -1 || !this.availableDevices_.length) {
            return undefined;
        }
        return this.availableDevices_[this.currentDeviceIndex_];
    }
    /**
     * Gets the settings of the currently active video track.
     */
    getCurrentTrackSettings() {
        return this.currentTrackSettings_;
    }
    /**
     * Gets the index of the currently active device.
     */
    getCurrentDeviceIndex() {
        return this.currentDeviceIndex_;
    }
    /**
     * Whether the camera is using the WebXR Raw Camera Access API fallback.
     */
    get isUsingXRCameraAccess() {
        return this.useXRCameraAccess_;
    }
    /**
     * Updates the camera texture from the WebXR Raw Camera Access API.
     * Must be called each frame from the render loop when in XR camera mode.
     */
    updateXRCamera(frame) {
        if (!this.useXRCameraAccess_ || !this.renderer_ || !frame)
            return;
        const binding = this.renderer_.xr.getBinding();
        const refSpace = this.renderer_.xr.getReferenceSpace();
        if (!binding || !refSpace)
            return;
        const pose = frame.getViewerPose(refSpace);
        if (!pose)
            return;
        for (const view of pose.views) {
            const xrCamera = view.camera;
            if (!xrCamera)
                continue;
            const glTexture = binding.getCameraImage?.(xrCamera);
            if (!glTexture)
                continue;
            if (!this.xrCameraTexture_) {
                this.xrCameraTexture_ = new THREE.ExternalTexture(glTexture);
                this.xrCameraTexture_.minFilter = THREE.LinearFilter;
                this.xrCameraTexture_.magFilter = THREE.LinearFilter;
                this.xrCameraTexture_.colorSpace = THREE.SRGBColorSpace;
                this.xrCameraTexture_.generateMipmaps = false;
            }
            else {
                this.xrCameraTexture_.sourceTexture = glTexture;
            }
            this.width = xrCamera.width;
            this.height = xrCamera.height;
            this.aspectRatio = this.width / this.height;
            const texProperties = this.renderer_.properties.get(this.xrCameraTexture_);
            texProperties.__webglTexture = glTexture;
            texProperties.__version = 1;
            this.texture = this.xrCameraTexture_;
            if (!this.loaded) {
                this.clearXRCameraAccessTimeout_();
                this.loaded = true;
                this.setState_(StreamState.STREAMING, {
                    force: true,
                    width: this.width,
                    height: this.height,
                    aspectRatio: this.aspectRatio,
                });
            }
            break;
        }
    }
    registerSimulatorCamera(simulatorCamera) {
        this.simulatorCamera = simulatorCamera;
    }
    startXRCameraAccessFallback_(reason, error) {
        if (!this.isXRCameraAccessGranted_()) {
            this.useXRCameraAccess_ = false;
            this.loaded = false;
            this.setState_(StreamState.NO_DEVICES_FOUND, { force: true });
            console.warn(`${reason} WebXR Raw Camera Access API is not available in this session.`, error);
            return;
        }
        console.warn(`${reason} Falling back to WebXR Raw Camera Access API.`, error);
        this.useXRCameraAccess_ = true;
        this.loaded = false;
        this.setState_(StreamState.INITIALIZING, { force: true });
        this.clearXRCameraAccessTimeout_();
        this.xrCameraAccessTimeout_ = setTimeout(() => {
            if (!this.useXRCameraAccess_ || this.loaded)
                return;
            this.useXRCameraAccess_ = false;
            this.setState_(StreamState.NO_DEVICES_FOUND, { force: true });
            console.warn('WebXR Raw Camera Access API did not provide frames in time.');
        }, XRDeviceCamera.XR_CAMERA_ACCESS_TIMEOUT_MS);
    }
    isXRCameraAccessGranted_() {
        const session = this.renderer_?.xr.getSession();
        if (!session) {
            return true;
        }
        if (!('enabledFeatures' in session) || !session.enabledFeatures) {
            return true;
        }
        return session.enabledFeatures.includes('camera-access');
    }
    clearXRCameraAccessTimeout_() {
        if (!this.xrCameraAccessTimeout_)
            return;
        clearTimeout(this.xrCameraAccessTimeout_);
        this.xrCameraAccessTimeout_ = null;
    }
}

// Sorting function which uses the render order to try to find which element is on top.
function defaultSortFunction(a, b) {
    // 1. Primary: Distance (Ascending).
    // Return physically closer objects first.
    const distDiff = a.distance - b.distance;
    if (Math.abs(distDiff) > 0.00001) {
        return distDiff;
    }
    // 2. Secondary: Render Order (Descending).
    // Higher renderOrder = drawn later = on top.
    if (a.object.renderOrder !== b.object.renderOrder) {
        return b.object.renderOrder - a.object.renderOrder;
    }
    // 3. Fallback to id (Descending).
    // Higher id = created later.
    return b.object.id - a.object.id;
}
function intersect(object, raycaster, intersects, recursive) {
    let propagate = true;
    if (object.layers.test(raycaster.layers)) {
        const result = object.raycast(raycaster, intersects);
        if (result === false)
            propagate = false;
    }
    if (propagate === true && recursive === true) {
        const children = object.children;
        for (let i = 0, l = children.length; i < l; i++) {
            intersect(children[i], raycaster, intersects, true);
        }
    }
}
// Raycaster which allows setting a custom sorting function. This is mainly useful to identify the clicked element for 2D UI.
class Raycaster extends THREE.Raycaster {
    constructor() {
        super(...arguments);
        // Sorting function for the raycaster. Should return items from closest to furthest.
        this.sortFunction = defaultSortFunction;
    }
    /**
     * Intersects a single object with the raycaster, using the custom sort function.
     * @param object - The object to intersect with.
     * @param recursive - Whether to intersect with the object's children.
     * @param intersects - The array to store the intersections in.
     * @returns The intersections found.
     */
    intersectObject(object, recursive = true, intersects = []) {
        intersect(object, this, intersects, recursive);
        intersects.sort(this.sortFunction);
        return intersects;
    }
    /**
     * Intersects multiple objects with the raycaster, using the custom sort function.
     * @param objects - The objects to intersect with.
     * @param recursive - Whether to intersect with the objects' children.
     * @param intersects - The array to store the intersections in.
     * @returns The intersections found.
     */
    intersectObjects(objects, recursive = true, intersects = []) {
        for (let i = 0, l = objects.length; i < l; i++) {
            intersect(objects[i], this, intersects, recursive);
        }
        intersects.sort(this.sortFunction);
        return intersects;
    }
}

class Registry {
    constructor() {
        this.instances = new Map();
    }
    /**
     * Registers an new instanceof a given type.
     * If an existing instance of the same type is already registered, it will be
     * overwritten.
     * @param instance - The instance to register.
     * @param type - Type to register the instance as. Will default to
     * `instance.constructor` if not defined.
     */
    register(instance, type) {
        const registrationType = type ?? instance.constructor;
        if (instance instanceof registrationType) {
            this.instances.set(registrationType, instance);
        }
        else {
            throw new Error(`Instance of type '${instance.constructor.name}' is not an instance of the registration type '${registrationType.name}'.`);
        }
    }
    /**
     * Gets an existing instance of a registered type.
     * @param type - The constructor function of the type to retrieve.
     * @returns The instance of the requested type.
     */
    get(type) {
        return this.instances.get(type);
    }
    /**
     * Gets an existing instance of a registered type, or creates a new one if it
     * doesn't exist.
     * @param type - The constructor function of the type to retrieve.
     * @param factory - A function that creates a new instance of the type if it
     * doesn't already exist.
     * @returns The instance of the requested type.
     */
    getOrCreate(type, factory) {
        let instance = this.get(type);
        if (instance === undefined) {
            instance = factory();
            if (!(instance instanceof type)) {
                throw new Error(`Factory for type ${type.name} returned an incompatible instance of type ${instance.constructor.name}.`);
            }
            // Register the new instance with the requested type.
            this.register(instance, type);
        }
        return instance;
    }
    /**
     * Unregisters an instance of a given type.
     * @param type - The type to unregister.
     */
    unregister(type) {
        this.instances.delete(type);
    }
}

// Use a small canvas since a full size canvas can consume a lot of memory and
// cause toDataUrl to be slow.
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
class PendingScreenshotRequest {
    constructor(resolve, reject, overlayOnCamera) {
        this.resolve = resolve;
        this.reject = reject;
        this.overlayOnCamera = overlayOnCamera;
    }
}
class ScreenshotSynthesizer {
    constructor() {
        this.pendingScreenshotRequests = [];
        this.virtualBuffer = new Uint8Array();
        this.virtualRealBuffer = new Uint8Array();
        this.renderTargetWidth = DEFAULT_CANVAS_WIDTH;
    }
    async onAfterRender(renderer, renderSceneFn, deviceCamera) {
        if (this.pendingScreenshotRequests.length == 0) {
            return;
        }
        const haveVirtualOnlyRequests = this.pendingScreenshotRequests.every((request) => !request.overlayOnCamera);
        if (haveVirtualOnlyRequests) {
            this.createVirtualImageDataURL(renderer, renderSceneFn).then((virtualImageDataUrl) => {
                this.resolveVirtualOnlyRequests(virtualImageDataUrl);
            });
        }
        const haveVirtualAndRealReqeusts = this.pendingScreenshotRequests.some((request) => request.overlayOnCamera);
        if (haveVirtualAndRealReqeusts && deviceCamera) {
            this.createVirtualRealImageDataURL(renderer, renderSceneFn, deviceCamera).then((virtualRealImageDataUrl) => {
                if (virtualRealImageDataUrl) {
                    this.resolveVirtualRealRequests(virtualRealImageDataUrl);
                }
            });
        }
        else if (haveVirtualAndRealReqeusts) {
            throw new Error('No device camera provided');
        }
    }
    async createVirtualImageDataURL(renderer, renderSceneFn) {
        const mainRenderTarget = renderer.getRenderTarget();
        const isRenderingStereo = renderer.xr.isPresenting && renderer.xr.getCamera().cameras.length == 2;
        const mainRenderTargetSingleViewWidth = isRenderingStereo
            ? mainRenderTarget.width / 2
            : mainRenderTarget.width;
        const scaledHeight = Math.round(mainRenderTarget.height *
            (this.renderTargetWidth / mainRenderTargetSingleViewWidth));
        if (!this.virtualRenderTarget ||
            this.virtualRenderTarget.width != this.renderTargetWidth) {
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
        if (this.virtualBuffer.length != expectedBufferLength) {
            this.virtualBuffer = new Uint8Array(expectedBufferLength);
        }
        const buffer = this.virtualBuffer;
        await renderer.readRenderTargetPixelsAsync(virtualRenderTarget, 0, 0, virtualRenderTarget.width, virtualRenderTarget.height, buffer);
        flipBufferVertically(buffer, virtualRenderTarget.width, virtualRenderTarget.height);
        const canvas = this.virtualCanvas ||
            (this.virtualCanvas = document.createElement('canvas'));
        canvas.width = virtualRenderTarget.width;
        canvas.height = virtualRenderTarget.height;
        const context = canvas.getContext('2d');
        if (!context) {
            throw new Error('Failed to get 2D context');
        }
        const imageData = new ImageData(new Uint8ClampedArray(buffer), virtualRenderTarget.width, virtualRenderTarget.height);
        context.putImageData(imageData, 0, 0);
        return canvas.toDataURL();
    }
    resolveVirtualOnlyRequests(virtualImageDataUrl) {
        let remainingRequests = 0;
        for (let i = 0; i < this.pendingScreenshotRequests.length; i++) {
            const request = this.pendingScreenshotRequests[i];
            if (!request.overlayOnCamera) {
                request.resolve(virtualImageDataUrl);
            }
            else {
                this.pendingScreenshotRequests[remainingRequests++] = request;
            }
        }
        this.pendingScreenshotRequests.length = remainingRequests;
    }
    async createVirtualRealImageDataURL(renderer, renderSceneFn, deviceCamera) {
        if (!deviceCamera.loaded) {
            console.debug('Waiting for device camera to be loaded');
            return null;
        }
        const mainRenderTarget = renderer.getRenderTarget();
        const isRenderingStereo = renderer.xr.isPresenting && renderer.xr.getCamera().cameras.length == 2;
        const mainRenderTargetSize = new THREE.Vector2();
        if (mainRenderTarget) {
            mainRenderTargetSize.set(mainRenderTarget.width, mainRenderTarget.height);
        }
        else {
            renderer.getSize(mainRenderTargetSize);
        }
        const mainRenderTargetSingleViewWidth = isRenderingStereo
            ? mainRenderTargetSize.x / 2
            : mainRenderTargetSize.y;
        const scaledHeight = Math.round(mainRenderTargetSize.y *
            (this.renderTargetWidth / mainRenderTargetSingleViewWidth));
        if (!this.virtualRealRenderTarget ||
            this.virtualRealRenderTarget.height != scaledHeight) {
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
        if (this.virtualRealBuffer.length !=
            renderTarget.width * renderTarget.height * 4) {
            this.virtualRealBuffer = new Uint8Array(renderTarget.width * renderTarget.height * 4);
        }
        const buffer = this.virtualRealBuffer;
        await renderer.readRenderTargetPixelsAsync(renderTarget, 0, 0, renderTarget.width, renderTarget.height, buffer);
        flipBufferVertically(buffer, renderTarget.width, renderTarget.height);
        const canvas = this.virtualRealCanvas ||
            (this.virtualRealCanvas = document.createElement('canvas'));
        canvas.width = renderTarget.width;
        canvas.height = renderTarget.height;
        const context = canvas.getContext('2d');
        if (!context) {
            throw new Error('Failed to get 2D context');
        }
        const imageData = new ImageData(new Uint8ClampedArray(buffer), renderTarget.width, renderTarget.height);
        context.putImageData(imageData, 0, 0);
        return canvas.toDataURL();
    }
    resolveVirtualRealRequests(virtualRealImageDataUrl) {
        let remainingRequests = 0;
        for (let i = 0; i < this.pendingScreenshotRequests.length; i++) {
            const request = this.pendingScreenshotRequests[i];
            if (request.overlayOnCamera) {
                request.resolve(virtualRealImageDataUrl);
            }
            else {
                this.pendingScreenshotRequests[remainingRequests++] = request;
            }
        }
        this.pendingScreenshotRequests.length = remainingRequests;
    }
    getFullScreenQuad() {
        if (!this.fullScreenQuad) {
            this.fullScreenQuad = new FullScreenQuad(new THREE.MeshBasicMaterial({ transparent: true }));
        }
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
}

class ScriptsManager {
    constructor(initScriptFunction) {
        this.initScriptFunction = initScriptFunction;
        /** The set of all currently initialized scripts. */
        this.scripts = new Set();
        this.callSelectStartBound = this.callSelectStart.bind(this);
        this.callSelectEndBound = this.callSelectEnd.bind(this);
        this.callSelectBound = this.callSelect.bind(this);
        this.callSqueezeStartBound = this.callSqueezeStart.bind(this);
        this.callSqueezeEndBound = this.callSqueezeEnd.bind(this);
        this.callSqueezeBound = this.callSqueeze.bind(this);
        this.callKeyDownBound = this.callKeyDown.bind(this);
        this.callKeyUpBound = this.callKeyUp.bind(this);
        /** The set of scripts currently being initialized. */
        this.initializingScripts = new Set();
        this.seenScripts = new Set();
        this.syncPromises = [];
        this.checkScriptBound = this.checkScript.bind(this);
    }
    /**
     * Initializes a script and adds it to the set of scripts which will receive
     * callbacks. This will be called automatically by Core when a script is found
     * in the scene but can also be called manually.
     * @param script - The script to initialize
     * @returns A promise which resolves when the script is initialized.
     */
    async initScript(script) {
        if (this.scripts.has(script) || this.initializingScripts.has(script)) {
            return;
        }
        this.initializingScripts.add(script);
        await this.initScriptFunction(script);
        this.scripts.add(script);
        this.initializingScripts.delete(script);
    }
    /**
     * Uninitializes a script calling dispose and removes it from the set of
     * scripts which will receive callbacks.
     * @param script - The script to uninitialize.
     */
    uninitScript(script) {
        if (!this.scripts.has(script)) {
            return;
        }
        script.dispose();
        this.scripts.delete(script);
        this.initializingScripts.delete(script);
    }
    /**
     * Helper for scene traversal to avoid closure allocation.
     */
    checkScript(obj) {
        if (obj.isXRScript) {
            const script = obj;
            this.syncPromises.push(this.initScript(script));
            this.seenScripts.add(script);
        }
    }
    /**
     * Finds all scripts in the scene and initializes them or uninitailizes them.
     * Returns a promise which resolves when all new scripts are finished
     * initalizing.
     * @param scene - The main scene which is used to find scripts.
     */
    syncScriptsWithScene(scene) {
        this.seenScripts.clear();
        this.syncPromises.length = 0;
        scene.traverse(this.checkScriptBound);
        // Delete missing scripts.
        for (const script of this.scripts) {
            if (!this.seenScripts.has(script)) {
                this.uninitScript(script);
            }
        }
        return Promise.allSettled(this.syncPromises);
    }
    callSelectStart(event) {
        for (const script of this.scripts) {
            script.onSelectStart(event);
        }
    }
    callSelectEnd(event) {
        for (const script of this.scripts) {
            script.onSelectEnd(event);
        }
    }
    callSelect(event) {
        for (const script of this.scripts) {
            script.onSelect(event);
        }
    }
    callSqueezeStart(event) {
        for (const script of this.scripts) {
            script.onSqueezeStart(event);
        }
    }
    callSqueezeEnd(event) {
        for (const script of this.scripts) {
            script.onSqueezeEnd(event);
        }
    }
    callSqueeze(event) {
        for (const script of this.scripts) {
            script.onSqueeze(event);
        }
    }
    callKeyDown(event) {
        for (const script of this.scripts) {
            script.onKeyDown(event);
        }
    }
    callKeyUp(event) {
        for (const script of this.scripts) {
            script.onKeyUp(event);
        }
    }
    onXRSessionStarted(session) {
        for (const script of this.scripts) {
            script.onXRSessionStarted(session);
        }
    }
    onXRSessionEnded() {
        for (const script of this.scripts) {
            script.onXRSessionEnded();
        }
    }
    onSimulatorStarted() {
        for (const script of this.scripts) {
            script.onSimulatorStarted();
        }
    }
}

class WaitFrame {
    constructor() {
        this.callbacks = [];
    }
    /**
     * Executes all registered callbacks and clears the list.
     */
    onFrame() {
        this.callbacks.forEach((callback) => {
            try {
                callback();
            }
            catch (e) {
                console.error(e);
            }
        });
        this.callbacks.length = 0;
    }
    /**
     * Wait for the next frame.
     */
    async waitFrame() {
        return new Promise((resolve) => {
            this.callbacks.push(resolve);
        });
    }
}

// Event type definitions for clarity
var WebXRSessionEventType;
(function (WebXRSessionEventType) {
    WebXRSessionEventType["UNSUPPORTED"] = "unsupported";
    WebXRSessionEventType["READY"] = "ready";
    WebXRSessionEventType["SESSION_START"] = "sessionstart";
    WebXRSessionEventType["SESSION_END"] = "sessionend";
})(WebXRSessionEventType || (WebXRSessionEventType = {}));
/**
 * Manages the WebXR session lifecycle by extending THREE.EventDispatcher
 * to broadcast its state to any listener.
 */
class WebXRSessionManager extends THREE.EventDispatcher {
    constructor(renderer, sessionInit, mode) {
        super(); // Initialize the EventDispatcher
        this.renderer = renderer;
        this.sessionInit = sessionInit;
        this.mode = mode;
        this.onSessionEndedBound = this.onSessionEndedInternal.bind(this);
        this.waitingForXRSession = false;
    }
    /**
     * Checks for WebXR support and availability of the requested session mode.
     * This should be called to initialize the manager and trigger the first
     * events.
     */
    async initialize() {
        if (!('xr' in navigator)) {
            console.warn('WebXR not supported');
            this.xrModeSupported = false;
            this.dispatchEvent({ type: WebXRSessionEventType.UNSUPPORTED });
            return;
        }
        let modeSupported = false;
        try {
            modeSupported =
                (await navigator.xr.isSessionSupported(this.mode)) || false;
        }
        catch (e) {
            console.error('Error getting isSessionSupported', e);
            this.xrModeSupported = false;
            this.dispatchEvent({ type: WebXRSessionEventType.UNSUPPORTED });
            return;
        }
        if (modeSupported) {
            this.xrModeSupported = true;
            this.sessionOptions = {
                ...this.sessionInit,
                optionalFeatures: [
                    'local-floor',
                    ...(this.sessionInit.optionalFeatures || []),
                ],
            };
            // Fire the 'ready' event with the sessionOptions in the data payload
            this.dispatchEvent({
                type: WebXRSessionEventType.READY,
                sessionOptions: this.sessionOptions,
            });
            // Automatically start session if 'offerSession' is available
            if (navigator.xr.offerSession !== undefined) {
                navigator.xr.offerSession(this.mode, this.sessionOptions)
                    .then(this.onSessionStartedInternal.bind(this))
                    .catch((err) => {
                    console.warn(err);
                });
            }
        }
        else {
            console.log(`${this.mode} not supported`);
            this.xrModeSupported = false;
            this.dispatchEvent({ type: WebXRSessionEventType.UNSUPPORTED });
        }
    }
    /**
     * Ends the WebXR session.
     */
    startSession() {
        if (this.xrModeSupported === undefined) {
            throw new Error('Initialize not yet complete');
        }
        else if (!this.xrModeSupported) {
            throw new Error('WebXR not supported');
        }
        else if (this.currentSession) {
            throw new Error('Session already started');
        }
        else if (this.waitingForXRSession) {
            throw new Error('Waiting for session to start');
        }
        this.waitingForXRSession = true;
        navigator
            .xr.requestSession(this.mode, this.sessionOptions)
            .finally(() => {
            this.waitingForXRSession = false;
        })
            .then(this.onSessionStartedInternal.bind(this));
    }
    /**
     * Ends the WebXR session.
     */
    endSession() {
        if (!this.currentSession) {
            throw new Error('No session to end');
        }
        this.currentSession.end();
        this.currentSession = undefined;
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
    /** Internal callback for when a session successfully starts. */
    async onSessionStartedInternal(session) {
        session.addEventListener('end', this.onSessionEndedBound);
        await this.renderer.xr.setSession(session);
        this.currentSession = session;
        // Fire the 'sessionstart' event with the session in the data payload
        this.dispatchEvent({
            type: WebXRSessionEventType.SESSION_START,
            session: session,
        });
    }
    /** Internal callback for when the session ends. */
    onSessionEndedInternal( /*event*/) {
        // Fire the 'sessionend' event
        this.dispatchEvent({ type: WebXRSessionEventType.SESSION_END });
        this.currentSession?.removeEventListener('end', this.onSessionEndedBound);
        this.currentSession = undefined;
    }
}

const XRBUTTON_WRAPPER_ID = 'XRButtonWrapper';
const XRBUTTON_CLASS = 'XRButton';
class XRButton {
    constructor(sessionManager, permissionsManager, appTitle = '', appDescription = '', startText = 'ENTER XR', endText = 'END XR', invalidText = 'XR NOT SUPPORTED', startSimulatorText = 'START SIMULATOR', showEnterSimulatorButton = false, startSimulator = () => { }, permissions = {
        geolocation: false,
        camera: false,
        microphone: false,
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
        this.domElement = document.createElement('div');
        this.simulatorButtonElement = document.createElement('button');
        this.xrButtonElement = document.createElement('button');
        this.domElement.id = XRBUTTON_WRAPPER_ID;
        this.createXRAppTitle();
        this.createXRAppDescription();
        this.createXRButtonElement();
        if (showEnterSimulatorButton) {
            this.createSimulatorButton();
        }
        this.sessionManager.addEventListener(WebXRSessionEventType.UNSUPPORTED, this.showXRNotSupported.bind(this));
        this.sessionManager.addEventListener(WebXRSessionEventType.READY, () => this.onSessionReady());
        this.sessionManager.addEventListener(WebXRSessionEventType.SESSION_START, () => this.onSessionStarted());
        this.sessionManager.addEventListener(WebXRSessionEventType.SESSION_END, this.onSessionEnded.bind(this));
    }
    createSimulatorButton() {
        this.simulatorButtonElement.classList.add(XRBUTTON_CLASS);
        this.simulatorButtonElement.innerText = this.startSimulatorText;
        this.simulatorButtonElement.onclick = () => {
            this.domElement.remove();
            this.startSimulator();
        };
        this.domElement.appendChild(this.simulatorButtonElement);
    }
    createXRAppTitle() {
        if (!this.appTitle) {
            return;
        }
        const appTitle = document.createElement('h1');
        appTitle.textContent = this.appTitle;
        this.domElement.appendChild(appTitle);
    }
    createXRAppDescription() {
        if (!this.appDescription) {
            return;
        }
        const appDescription = document.createElement('h4');
        appDescription.textContent = this.appDescription;
        this.domElement.appendChild(appDescription);
    }
    createXRButtonElement() {
        this.xrButtonElement.classList.add(XRBUTTON_CLASS);
        this.xrButtonElement.disabled = true;
        this.xrButtonElement.textContent = '...';
        this.domElement.appendChild(this.xrButtonElement);
    }
    onSessionReady() {
        const button = this.xrButtonElement;
        button.style.display = '';
        button.innerHTML = this.startText;
        button.disabled = false;
        const allowsVideoFallback = this.sessionManager
            .getSessionOptions()
            ?.optionalFeatures?.includes('camera-access');
        button.onclick = () => {
            this.permissionsManager
                .checkAndRequestPermissions(this.permissions, {
                allowVideoFallback: allowsVideoFallback,
            })
                .then((result) => {
                if (result.granted) {
                    this.sessionManager.startSession();
                }
                else {
                    this.xrButtonElement.textContent =
                        'Error:' + result.error + '\nPlease try again.';
                }
            });
        };
    }
    showXRNotSupported() {
        this.xrButtonElement.textContent = this.invalidText;
        this.xrButtonElement.disabled = true;
    }
    async onSessionStarted() {
        this.xrButtonElement.innerHTML = this.endText;
    }
    onSessionEnded() {
        this.xrButtonElement.innerHTML = this.startText;
    }
}

class XRPass extends Pass {
    render(_renderer, _writeBuffer, _readBuffer, _deltaTime, _maskActive, _viewId = 0) { }
}
/**
 * XREffects manages the XR rendering pipeline.
 * Use core.effects
 * It handles multiple passes and render targets for applying effects to XR
 * scenes.
 */
class XREffects {
    constructor(renderer, scene, timer) {
        this.renderer = renderer;
        this.scene = scene;
        this.timer = timer;
        this.passes = [];
        this.renderTargets = [];
        this.dimensions = new THREE.Vector2();
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
        if (defaultTarget == null) {
            return;
        }
        const neededRenderTargets = this.renderer.xr.isPresenting ? 4 : 2;
        for (let i = 0; i < neededRenderTargets; i++) {
            if (i >= this.renderTargets.length ||
                this.renderTargets[i].width != dimensions.x ||
                this.renderTargets[i].height != dimensions.y) {
                this.renderTargets[i]?.depthTexture?.dispose();
                this.renderTargets[i]?.dispose();
                this.renderTargets[i] = defaultTarget.clone();
                this.renderTargets[i].depthTexture = new THREE.DepthTexture(dimensions.x, dimensions.y);
            }
        }
        for (let i = neededRenderTargets; i < this.renderTargets.length; i++) {
            this.renderTargets[i].depthTexture?.dispose();
            this.renderTargets[i].dispose();
        }
    }
    /**
     * Renders the XR effects.
     */
    render() {
        this.renderer.getDrawingBufferSize(this.dimensions);
        this.setupRenderTargets(this.dimensions);
        this.renderer.xr.cameraAutoUpdate = false;
        const defaultTarget = this.renderer.getRenderTarget();
        if (!defaultTarget) {
            return;
        }
        if (this.renderer.xr.isPresenting) {
            this.renderXr();
        }
        else {
            this.renderSimulator();
        }
    }
    renderXr() {
        const defaultTarget = this.renderer.getRenderTarget();
        const renderer = this.renderer;
        const xrEnabled = renderer.xr.enabled;
        const xrIsPresenting = renderer.xr.isPresenting;
        const renderTargets = this.renderTargets;
        const viewport = new THREE.Vector4();
        renderer.getViewport(viewport);
        renderer.xr.cameraAutoUpdate = false;
        renderer.xr.enabled = false;
        const deltaTime = this.timer.getDelta();
        if (renderer.xr.getCamera().cameras.length == 2) {
            for (let camIndex = 0; camIndex < 2; ++camIndex) {
                const cam = renderer.xr.getCamera().cameras[camIndex];
                renderer.setViewport(cam.viewport);
                renderer.setRenderTarget(renderTargets[camIndex]);
                renderer.clear();
                renderer.xr.isPresenting = true;
                renderer.render(this.scene, cam);
            }
            renderer.setRenderTarget(defaultTarget);
            renderer.clear();
            renderer.xr.isPresenting = false;
            renderer.autoClearColor = false;
            for (let eye = 0; eye < 2; eye++) {
                for (let i = 0; i < this.passes.length - 1; ++i) {
                    const lastRenderTargetIndex = i % 2;
                    const nextRenderTargetIndex = (i + 1) % 2;
                    defaultTarget.viewport.set((eye * this.dimensions.x) / 2, 0, this.dimensions.x / 2, this.dimensions.y);
                    this.passes[i].render(renderer, this.renderTargets[2 * nextRenderTargetIndex + eye], this.renderTargets[2 * lastRenderTargetIndex + eye], deltaTime, 
                    /*maskActive=*/ false, 
                    /*viewId=*/ eye);
                }
                if (this.passes.length > 0) {
                    const lastRenderTargetIndex = (this.passes.length - 1) % 2;
                    defaultTarget.viewport.set((eye * this.dimensions.x) / 2, 0, this.dimensions.x / 2, this.dimensions.y);
                    this.passes[this.passes.length - 1].render(renderer, defaultTarget, this.renderTargets[2 * lastRenderTargetIndex + eye], deltaTime, 
                    /*maskActive=*/ false, 
                    /*viewId=*/ eye);
                }
            }
            renderer.xr.enabled = xrEnabled;
            renderer.xr.isPresenting = xrIsPresenting;
        }
    }
    renderSimulator() {
        const defaultTarget = this.renderer.getRenderTarget();
        const renderer = this.renderer;
        const xrEnabled = renderer.xr.enabled;
        const xrIsPresenting = renderer.xr.isPresenting;
        const viewport = new THREE.Vector4();
        renderer.getViewport(viewport);
        renderer.xr.cameraAutoUpdate = false;
        renderer.xr.enabled = false;
        const deltaTime = this.timer.getDelta();
        renderer.setRenderTarget(defaultTarget);
        renderer.clear();
        renderer.xr.isPresenting = false;
        renderer.autoClearColor = false;
        for (let i = 0; i < this.passes.length - 1; ++i) {
            const lastRenderTargetIndex = i % 2;
            const nextRenderTargetIndex = (i + 1) % 2;
            this.passes[i].render(renderer, this.renderTargets[nextRenderTargetIndex], this.renderTargets[lastRenderTargetIndex], deltaTime, 
            /*maskActive=*/ false, 
            /*viewId=*/ 0);
        }
        if (this.passes.length > 0) {
            const lastRenderTargetIndex = (this.passes.length - 1) % 2;
            this.passes[this.passes.length - 1].render(renderer, defaultTarget, this.renderTargets[lastRenderTargetIndex], deltaTime, 
            /*maskActive=*/ false, 
            /*viewId=*/ 0);
        }
        renderer.xr.enabled = xrEnabled;
        renderer.xr.isPresenting = xrIsPresenting;
    }
}

const DepthMeshTexturedShader = {
    vertexShader: /* glsl */ `
varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec2 vUv;

void main() {
  vUv = uv;
  vNormal = normal;

  // Computes the view position.
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = -mvPosition.xyz;

  gl_Position = projectionMatrix * mvPosition;
}
`,
    fragmentShader: /* glsl */ `
#include <packing>

uniform vec3 uColor;
uniform sampler2D uDepthTexture;
uniform sampler2DArray uDepthTextureArray;
uniform vec3 uLightDirection;
uniform vec2 uResolution;
uniform float uRawValueToMeters;

varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec2 vUv;

const highp float kMaxDepthInMeters = 8.0;
const float kInvalidDepthThreshold = 0.01;
uniform float uMinDepth;
uniform float uMaxDepth;
uniform float uDebug;
uniform float uOpacity;
uniform bool uUsingFloatDepth;
uniform bool uIsTextureArray;

float saturate(in float x) {
  return clamp(x, 0.0, 1.0);
}

vec3 TurboColormap(in float x) {
  const vec4 kRedVec4 = vec4(0.55305649, 3.00913185, -5.46192616, -11.11819092);
  const vec4 kGreenVec4 = vec4(0.16207513, 0.17712472, 15.24091500, -36.50657960);
  const vec4 kBlueVec4 = vec4(-0.05195877, 5.18000081, -30.94853351, 81.96403246);
  const vec2 kRedVec2 = vec2(27.81927491, -14.87899417);
  const vec2 kGreenVec2 = vec2(25.95549545, -5.02738237);
  const vec2 kBlueVec2 = vec2(-86.53476570, 30.23299484);

  // Adjusts color space via 6 degree poly interpolation to avoid pure red.
  vec4 v4 = vec4( 1.0, x, x * x, x * x * x);
  vec2 v2 = v4.zw * v4.z;
  return vec3(
    dot(v4, kRedVec4)   + dot(v2, kRedVec2),
    dot(v4, kGreenVec4) + dot(v2, kGreenVec2),
    dot(v4, kBlueVec4)  + dot(v2, kBlueVec2)
  );
}

// Depth is packed into the luminance and alpha components of its texture.
// The texture is in a normalized format, storing raw values that need to be
// converted to meters.
float DepthGetMeters(in sampler2D depth_texture, in vec2 depth_uv) {
  if (uUsingFloatDepth) {
    return texture2D(depth_texture, depth_uv).r * uRawValueToMeters;
  }
  vec2 packedDepthAndVisibility = texture2D(depth_texture, depth_uv).rg;
  return dot(packedDepthAndVisibility, vec2(255.0, 256.0 * 255.0)) * uRawValueToMeters;
}

float DepthArrayGetMeters(in sampler2DArray depth_texture, in vec2 depth_uv) {
  return uRawValueToMeters * texture(uDepthTextureArray, vec3 (depth_uv.x, depth_uv.y, 0)).r;
}

vec3 DepthGetColorVisualization(in float x) {
  return step(kInvalidDepthThreshold, x) * TurboColormap(x);
}

void main() {
  vec3 lightDirection = normalize(uLightDirection);

  // Compute UV coordinates relative to resolution
  // vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 uv = vUv;

  // Ambient, diffuse, and specular terms
  vec3 ambient = 0.1 * uColor;
  float diff = max(dot(vNormal, lightDirection), 0.0);
  vec3 diffuse = diff * uColor;

  vec3 viewDir = normalize(vViewPosition);
  vec3 reflectDir = reflect(-lightDirection, vNormal);
  float spec = pow(max(dot(viewDir, reflectDir), 0.0), 16.0);
  vec3 specular = vec3(0.5) * spec; // Adjust specular color/strength

  // Combine Phong lighting
  vec3 finalColor = ambient + diffuse + specular;
  // finalColor = vec3(vNormal);

  // Output color
  gl_FragColor = uOpacity * vec4(finalColor, 1.0);

  if (uDebug > 0.5) {
    return;
  }

  vec2 depth_uv = uv;
  depth_uv.y = 1.0 - depth_uv.y;

  float depth = (uIsTextureArray ? DepthArrayGetMeters(uDepthTextureArray, depth_uv) : DepthGetMeters(uDepthTexture, depth_uv)) * 8.0;
  float normalized_depth =
    saturate((depth - uMinDepth) / (uMaxDepth - uMinDepth));
  gl_FragColor = uOpacity * vec4(TurboColormap(normalized_depth), 1.0);
}
`,
};

class DepthMesh extends MeshScript {
    static { this.dependencies = {
        renderer: THREE.WebGLRenderer,
    }; }
    static { this.isDepthMesh = true; }
    constructor(depthOptions, width, height, depthTextures) {
        const options = depthOptions.depthMesh;
        const depthResolution = options.depthFullResolution;
        const ignoreEdgePixels = options.ignoreEdgePixels;
        const activeRes = Math.max(2, depthResolution - 2 * ignoreEdgePixels);
        const geometry = new THREE.PlaneGeometry(1, 1, activeRes - 1, activeRes - 1);
        const minU = ignoreEdgePixels / (depthResolution - 1);
        const maxU = (depthResolution - 1 - ignoreEdgePixels) / (depthResolution - 1);
        const minV = ignoreEdgePixels / (depthResolution - 1);
        const maxV = (depthResolution - 1 - ignoreEdgePixels) / (depthResolution - 1);
        const uvs = geometry.attributes.uv.array;
        for (let i = 0; i < uvs.length; i += 2) {
            uvs[i] = minU + uvs[i] * (maxU - minU);
            uvs[i + 1] = minV + uvs[i + 1] * (maxV - minV);
        }
        let material;
        let uniforms;
        if (options.useDepthTexture || options.showDebugTexture) {
            uniforms = {
                uDepthTexture: { value: null },
                uDepthTextureArray: { value: null },
                uIsTextureArray: { value: 0.0 },
                uColor: { value: new THREE.Color(0xaaaaaa) },
                uResolution: { value: new THREE.Vector2(width, height) },
                uRawValueToMeters: { value: 1.0 },
                uMinDepth: { value: 0.0 },
                uMaxDepth: { value: 8.0 },
                uOpacity: { value: options.opacity },
                uDebug: { value: options.showDebugTexture ? 1.0 : 0.0 },
                uLightDirection: { value: new THREE.Vector3(1.0, 1.0, 1.0).normalize() },
                uUsingFloatDepth: { value: depthOptions.useFloat32 },
            };
            material = new THREE.ShaderMaterial({
                uniforms: uniforms,
                vertexShader: DepthMeshTexturedShader.vertexShader,
                fragmentShader: DepthMeshTexturedShader.fragmentShader,
                side: THREE.FrontSide,
                transparent: true,
            });
        }
        else {
            material = new THREE.ShadowMaterial({ opacity: options.shadowOpacity });
            material.depthWrite = false;
        }
        super(geometry, material);
        this.depthOptions = depthOptions;
        this.depthTextures = depthTextures;
        this.ignoreReticleRaycast = false;
        this.worldPosition = new THREE.Vector3();
        this.worldQuaternion = new THREE.Quaternion();
        this.updateVertexNormals = false;
        this.minDepth = 8;
        this.maxDepth = 0;
        this.minDepthPrev = 8;
        this.maxDepthPrev = 0;
        this.colliders = [];
        this.projectionMatrixInverse = new THREE.Matrix4();
        this.lastColliderUpdateTime = 0;
        this.colliderId = 0;
        this.visible = options.showDebugTexture || options.renderShadow;
        this.options = options;
        this.lastColliderUpdateTime = performance.now();
        this.updateVertexNormals = options.updateVertexNormals;
        this.colliderUpdateFps = options.colliderUpdateFps;
        this.depthTextureMaterialUniforms = uniforms;
        if (options.renderShadow) {
            this.receiveShadow = true;
            this.castShadow = false;
        }
        // Create a downsampled geometry for raycasts and physics.
        if (options.useDownsampledGeometry) {
            this.downsampledGeometry = new THREE.PlaneGeometry(1, 1, 39, 39);
            const dsUvs = this.downsampledGeometry.attributes.uv.array;
            for (let i = 0; i < dsUvs.length; i += 2) {
                dsUvs[i] = minU + dsUvs[i] * (maxU - minU);
                dsUvs[i + 1] = minV + dsUvs[i + 1] * (maxV - minV);
            }
            this.downsampledMesh = new THREE.Mesh(this.downsampledGeometry, material);
            this.downsampledMesh.visible = false;
        }
    }
    /**
     * Initialize the depth mesh.
     */
    init({ renderer }) {
        this.renderer = renderer;
    }
    /**
     * Updates the depth data and geometry positions based on the provided camera
     * and depth data.
     */
    updateDepth(depthData, projectionMatrixInverse) {
        this.projectionMatrixInverse = projectionMatrixInverse;
        this.minDepth = 8;
        this.maxDepth = 0;
        if (this.options.updateFullResolutionGeometry) {
            this.updateFullResolutionGeometry(depthData);
        }
        if (this.downsampledGeometry) {
            this.updateGeometry(depthData, this.downsampledGeometry);
        }
        this.minDepthPrev = this.minDepth;
        this.maxDepthPrev = this.maxDepth;
        this.geometry.attributes.position.needsUpdate = true;
        const depthTextureLeft = this.depthTextures?.get(0);
        if (depthTextureLeft && this.depthTextureMaterialUniforms) {
            const isTextureArray = depthTextureLeft instanceof THREE.ExternalTexture;
            this.depthTextureMaterialUniforms.uIsTextureArray.value = isTextureArray
                ? 1.0
                : 0;
            if (isTextureArray)
                this.depthTextureMaterialUniforms.uDepthTextureArray.value =
                    depthTextureLeft;
            else
                this.depthTextureMaterialUniforms.uDepthTexture.value =
                    depthTextureLeft;
            this.depthTextureMaterialUniforms.uMinDepth.value = this.minDepth;
            this.depthTextureMaterialUniforms.uMaxDepth.value = this.maxDepth;
            this.depthTextureMaterialUniforms.uRawValueToMeters.value = this
                .depthTextures.depthData.length
                ? this.depthTextures.depthData[0].rawValueToMeters
                : 1.0;
        }
        if (this.options.updateVertexNormals) {
            this.geometry.computeVertexNormals();
        }
        this.updateColliderIfNeeded();
    }
    updatePose(translation, quaternion) {
        this.position.copy(translation);
        this.quaternion.copy(quaternion);
        if (this.downsampledMesh) {
            this.downsampledMesh.position.copy(translation);
            this.downsampledMesh.quaternion.copy(quaternion);
            this.downsampledMesh.updateMatrixWorld();
        }
    }
    updateGPUDepth(depthData, projectionMatrixInverse) {
        this.updateDepth(this.convertGPUToGPU(depthData), projectionMatrixInverse);
    }
    convertGPUToGPU(depthData) {
        if (!this.depthTarget) {
            this.depthTarget = new THREE.WebGLRenderTarget(depthData.width, depthData.height, {
                format: THREE.RedFormat,
                type: THREE.FloatType,
                internalFormat: 'R32F',
                minFilter: THREE.NearestFilter,
                magFilter: THREE.NearestFilter,
                depthBuffer: false,
            });
            this.depthTexture = new THREE.ExternalTexture(depthData.texture);
            const textureProperties = this.renderer.properties.get(this.depthTexture);
            textureProperties.__webglTexture = depthData.texture;
            this.gpuPixels = new Float32Array(depthData.width * depthData.height);
            const depthShader = new THREE.ShaderMaterial({
                vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    vUv.y = 1.0-vUv.y;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
                fragmentShader: `
                precision highp float;
                precision highp sampler2DArray;

                uniform sampler2DArray uTexture;
                uniform float uCameraNear;
                varying vec2 vUv;

                void main() {
                  float z = texture(uTexture, vec3(vUv, 0)).r;
                  z = uCameraNear / (1.0 - z);
                  z = clamp(z, 0.0, 20.0);
                  gl_FragColor = vec4(z, 0, 0, 1.0);
                }
            `,
                uniforms: {
                    uTexture: { value: this.depthTexture },
                    uCameraNear: {
                        value: depthData.depthNear,
                    },
                },
                blending: THREE.NoBlending,
                depthTest: false,
                depthWrite: false,
                side: THREE.DoubleSide,
            });
            const depthMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), depthShader);
            this.depthScene = new THREE.Scene();
            this.depthScene.add(depthMesh);
            this.depthCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        }
        const originalRenderTarget = this.renderer.getRenderTarget();
        this.renderer.xr.enabled = false;
        this.renderer.setRenderTarget(this.depthTarget);
        this.renderer.render(this.depthScene, this.depthCamera);
        this.renderer.readRenderTargetPixels(this.depthTarget, 0, 0, depthData.width, depthData.height, this.gpuPixels, 0);
        this.renderer.xr.enabled = true;
        this.renderer.setRenderTarget(originalRenderTarget);
        return {
            width: depthData.width,
            height: depthData.height,
            data: this.gpuPixels.buffer,
            rawValueToMeters: depthData.rawValueToMeters,
        };
    }
    /**
     * Method to manually update the full resolution geometry.
     * Only needed if options.updateFullResolutionGeometry is false.
     */
    updateFullResolutionGeometry(depthData) {
        this.updateGeometry(depthData, this.geometry);
    }
    /**
     * Internal method to update the geometry of the depth mesh.
     */
    updateGeometry(depthData, geometry) {
        const width = depthData.width;
        const height = depthData.height;
        const depthArray = this.depthOptions.useFloat32
            ? new Float32Array(depthData.data)
            : new Uint16Array(depthData.data);
        const vertexPosition = new THREE.Vector3();
        for (let i = 0; i < geometry.attributes.position.count; ++i) {
            const u = geometry.attributes.uv.array[2 * i];
            const v = geometry.attributes.uv.array[2 * i + 1];
            // Grabs the nearest for now.
            const depthX = Math.round(clamp(u * (width - 1), 0, width - 1));
            const depthY = Math.round(clamp((1.0 - v) * (height - 1), 0, height - 1));
            const rawDepth = depthArray[depthY * width + depthX];
            let depth = depthData.rawValueToMeters * rawDepth;
            // Finds global min/max.
            if (depth > 0) {
                if (depth < this.minDepth) {
                    this.minDepth = depth;
                }
                else if (depth > this.maxDepth) {
                    this.maxDepth = depth;
                }
            }
            // This is a wrong algorithm to patch holes but working amazingly well.
            // Per-row maximum may work better but haven't tried here.
            // A proper local maximum takes another pass.
            if (depth == 0 && this.options.patchHoles) {
                depth = this.maxDepthPrev;
            }
            if (this.options.patchHolesUpper && v > 0.9) {
                depth = this.minDepthPrev;
            }
            vertexPosition.set(2.0 * (u - 0.5), 2.0 * (v - 0.5), -1);
            // This relates to camera.near
            vertexPosition.applyMatrix4(this.projectionMatrixInverse);
            vertexPosition.multiplyScalar(-depth / vertexPosition.z);
            geometry.attributes.position.array[3 * i + 0] = vertexPosition.x;
            geometry.attributes.position.array[3 * i + 1] = vertexPosition.y;
            geometry.attributes.position.array[3 * i + 2] = vertexPosition.z;
        }
    }
    /**
     * Optimizes collider updates to run periodically based on the specified FPS.
     */
    updateColliderIfNeeded() {
        const timeSinceLastUpdate = performance.now() - this.lastColliderUpdateTime;
        if (this.RAPIER && timeSinceLastUpdate > 1000 / this.colliderUpdateFps) {
            this.getWorldPosition(this.worldPosition);
            this.getWorldQuaternion(this.worldQuaternion);
            this.rigidBody.setTranslation(this.worldPosition, false);
            this.rigidBody.setRotation(this.worldQuaternion, false);
            const geometry = this.downsampledGeometry
                ? this.downsampledGeometry
                : this.geometry;
            const vertices = geometry.attributes.position.array;
            const indices = geometry.getIndex().array;
            // Changing the density does not fix the issue.
            const shape = this.RAPIER.ColliderDesc.trimesh(vertices, indices).setDensity(1.0);
            // const convextHull = this.RAPIER.ColliderDesc.convexHull(vertices);
            if (this.options.useDualCollider) {
                this.colliderId = (this.colliderId + 1) % 2;
                this.blendedWorld.removeCollider(this.colliders[this.colliderId], false);
                this.colliders[this.colliderId] = this.blendedWorld.createCollider(shape, this.rigidBody);
            }
            else {
                const newCollider = this.blendedWorld.createCollider(shape, this.rigidBody);
                this.blendedWorld.removeCollider(this.collider, /*wakeUp=*/ false);
                this.collider = newCollider;
            }
            this.lastColliderUpdateTime = performance.now();
        }
    }
    initRapierPhysics(RAPIER, blendedWorld) {
        this.getWorldPosition(this.worldPosition);
        this.getWorldQuaternion(this.worldQuaternion);
        const desc = RAPIER.RigidBodyDesc.fixed()
            .setTranslation(this.worldPosition.x, this.worldPosition.y, this.worldPosition.z)
            .setRotation(this.worldQuaternion);
        this.rigidBody = blendedWorld.createRigidBody(desc);
        const vertices = this.geometry.attributes.position.array;
        const indices = this.geometry.getIndex().array;
        const shape = RAPIER.ColliderDesc.trimesh(vertices, indices);
        if (this.options.useDualCollider) {
            this.colliders = [];
            this.colliders.push(blendedWorld.createCollider(shape, this.rigidBody), blendedWorld.createCollider(shape, this.rigidBody));
            this.colliderId = 0;
        }
        else {
            this.collider = blendedWorld.createCollider(shape, this.rigidBody);
        }
        this.RAPIER = RAPIER;
        this.blendedWorld = blendedWorld;
        this.lastColliderUpdateTime = performance.now();
    }
    /**
     * Customizes raycasting to compute normals for intersections.
     * @param raycaster - The raycaster object.
     * @param intersects - Array to store intersections.
     * @returns - True if intersections are found.
     */
    raycast(raycaster, intersects) {
        const intersections = [];
        if (this.downsampledMesh) {
            this.downsampledMesh.raycast(raycaster, intersections);
        }
        else {
            super.raycast(raycaster, intersections);
        }
        intersections.forEach((intersect) => {
            intersect.object = this;
        });
        if (!this.updateVertexNormals) {
            // Use the face normals instead of attribute normals.
            intersections.forEach((intersect) => {
                if (intersect.normal && intersect.face) {
                    intersect.normal.copy(intersect.face.normal);
                }
            });
        }
        intersects.push(...intersections);
        return true;
    }
    getColliderFromHandle(handle) {
        if (this.collider?.handle == handle) {
            return this.collider;
        }
        for (const collider of this.colliders) {
            if (collider?.handle == handle) {
                return collider;
            }
        }
        return undefined;
    }
}

class DepthMeshOptions {
    constructor() {
        this.enabled = false;
        this.updateVertexNormals = false;
        this.showDebugTexture = false;
        this.useDepthTexture = false;
        this.renderShadow = false;
        this.shadowOpacity = 0.25;
        this.patchHoles = false;
        this.patchHolesUpper = false;
        // Opacity of the debug material.
        this.opacity = 1.0;
        this.useDualCollider = false;
        // Use downsampled geometry for raycast and collisions
        this.useDownsampledGeometry = true;
        // Whether to always update the full resolution geometry.
        this.updateFullResolutionGeometry = false;
        this.colliderUpdateFps = 5;
        /** FPS cap for depth mesh geometry updates. 0 = update every frame. */
        this.depthMeshUpdateFps = 0;
        this.depthFullResolution = 160;
        this.ignoreEdgePixels = 3;
    }
}
class DepthOptions {
    constructor(options) {
        this.debugging = false;
        this.enabled = false;
        this.depthMesh = new DepthMeshOptions();
        this.depthTexture = {
            enabled: false,
            constantKernel: false,
            applyGaussianBlur: false,
            applyKawaseBlur: false,
        };
        // Occlusion pass.
        this.occlusion = { enabled: false };
        this.useFloat32 = true;
        this.depthTypeRequest = ['raw'];
        this.matchDepthView = true;
        deepMerge(this, options);
    }
}
const xrDepthMeshOptions = deepFreeze(new DepthOptions({
    enabled: true,
    depthMesh: {
        enabled: true,
        updateVertexNormals: false,
        showDebugTexture: false,
        useDepthTexture: false,
        renderShadow: false,
        shadowOpacity: 0.25,
        patchHoles: true,
        // Use downsampled geometry for raycast and collisions
        useDownsampledGeometry: true,
        // Whether to always update the full resolution geometry.
        updateFullResolutionGeometry: false,
        colliderUpdateFps: 5,
    },
}));
const xrDepthMeshVisualizationOptions = deepFreeze(new DepthOptions({
    enabled: true,
    depthMesh: {
        enabled: true,
        updateVertexNormals: true,
        showDebugTexture: true,
        useDepthTexture: true,
        renderShadow: false,
        shadowOpacity: 0.25,
        patchHoles: true,
        opacity: 0.1,
        // Use downsampled geometry for raycast and collisions
        useDownsampledGeometry: true,
        // Whether to always update the full resolution geometry.
        updateFullResolutionGeometry: true,
        colliderUpdateFps: 5,
    },
    depthTexture: {
        enabled: true,
        constantKernel: true,
        applyGaussianBlur: true,
        applyKawaseBlur: true,
    },
}));
const xrDepthMeshPhysicsOptions = deepFreeze(new DepthOptions({
    enabled: true,
    depthMesh: {
        enabled: true,
        updateVertexNormals: false,
        showDebugTexture: false,
        useDepthTexture: false,
        renderShadow: true,
        shadowOpacity: 0.25,
        patchHoles: true,
        patchHolesUpper: true,
        useDualCollider: false,
        // Use downsampled geometry for raycast and collisions
        useDownsampledGeometry: true,
        // Whether to always update the full resolution geometry.
        updateFullResolutionGeometry: false,
        colliderUpdateFps: 5,
    },
}));

class DepthTextures {
    constructor(options) {
        this.options = options;
        this.float32Arrays = [];
        this.uint8Arrays = [];
        this.dataTextures = [];
        this.nativeTextures = [];
        this.depthData = [];
    }
    createDataDepthTextures(depthData, viewId) {
        if (this.dataTextures[viewId]) {
            this.dataTextures[viewId].dispose();
        }
        if (this.options.useFloat32) {
            const typedArray = new Float32Array(depthData.width * depthData.height);
            const format = THREE.RedFormat;
            const type = THREE.FloatType;
            this.float32Arrays[viewId] = typedArray;
            this.dataTextures[viewId] = new THREE.DataTexture(typedArray, depthData.width, depthData.height, format, type);
        }
        else {
            const typedArray = new Uint8Array(depthData.width * depthData.height * 2);
            const format = THREE.RGFormat;
            const type = THREE.UnsignedByteType;
            this.uint8Arrays[viewId] = typedArray;
            this.dataTextures[viewId] = new THREE.DataTexture(typedArray, depthData.width, depthData.height, format, type);
        }
    }
    updateData(depthData, viewId) {
        if (this.dataTextures.length < viewId + 1 ||
            this.dataTextures[viewId].image.width !== depthData.width ||
            this.dataTextures[viewId].image.height !== depthData.height) {
            this.createDataDepthTextures(depthData, viewId);
        }
        if (this.options.useFloat32) {
            this.float32Arrays[viewId].set(new Float32Array(depthData.data));
        }
        else {
            this.uint8Arrays[viewId].set(new Uint8Array(depthData.data));
        }
        this.dataTextures[viewId].needsUpdate = true;
        this.depthData[viewId] = depthData;
    }
    updateNativeTexture(depthData, renderer, viewId) {
        if (this.dataTextures.length < viewId + 1) {
            this.nativeTextures[viewId] = new THREE.ExternalTexture(depthData.texture);
        }
        else {
            this.nativeTextures[viewId].sourceTexture = depthData.texture;
        }
        // fixed in newer revision of three
        const textureProperties = renderer.properties.get(this.nativeTextures[viewId]);
        textureProperties.__webglTexture = depthData.texture;
        textureProperties.__version = 1;
    }
    get(viewId) {
        if (this.dataTextures.length > 0) {
            return this.dataTextures[viewId];
        }
        return this.nativeTextures[viewId];
    }
}

const KawaseBlurShader = {
    vertexShader: /* glsl */ `
    uniform float uBlurSize;
    uniform vec2 uTexelSize;
    varying vec2 vTexCoord;
    varying vec4 uv1;
    varying vec4 uv2;
    varying vec4 uv3;
    varying vec4 uv4;

    void vertCopy(vec2 uv) {}

    void vertUpsample(vec2 uv) {
        vec2 halfPixel = uTexelSize * 0.5;
        vec2 offset = vec2(uBlurSize);
        uv1.xy = uv + vec2(-halfPixel.x * 2.0, 0.0) * offset;
        uv1.zw = uv + vec2(-halfPixel.x, halfPixel.y) * offset;
        uv2.xy = uv + vec2(0.0, halfPixel.y * 2.0) * offset;
        uv2.zw = uv + halfPixel * offset;
        uv3.xy = uv + vec2(halfPixel.x * 2.0, 0.0) * offset;
        uv3.zw = uv + vec2(halfPixel.x, -halfPixel.y) * offset;
        uv4.xy = uv + vec2(0.0, -halfPixel.y * 2.0) * offset;
        uv4.zw = uv - halfPixel * offset;
    }

    void vertDownsample(vec2 uv) {
        vec2 halfPixel = uTexelSize * 0.5;
        vec2 offset = vec2(uBlurSize);
        uv1.xy = uv - halfPixel * offset;
        uv1.zw = uv + halfPixel * offset;
        uv2.xy = uv - vec2(halfPixel.x, -halfPixel.y) * offset;
        uv2.zw = uv + vec2(halfPixel.x, -halfPixel.y) * offset;
    }

    void main() {
        vTexCoord = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        if (MODE == 0) {
            vertCopy(uv);
        } else if (MODE == 1) {
            vertDownsample(uv);
        } else {
            vertUpsample(uv);
        }
    }
`,
    fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vTexCoord;
    varying vec4 uv1;
    varying vec4 uv2;
    varying vec4 uv3;
    varying vec4 uv4;

    vec2 getUV0() {
        return vTexCoord;
    }

    vec4 fragCopy() {
        return texture2D(tDiffuse, getUV0());
    }

    vec4 fragDownsample() {
        vec4 sum = texture2D(tDiffuse, getUV0()) * 4.0;
        sum += texture2D(tDiffuse, uv1.xy);
        sum += texture2D(tDiffuse, uv1.zw);
        sum += texture2D(tDiffuse, uv2.xy);
        sum += texture2D(tDiffuse, uv2.zw);
        return sum * 0.125;
    }

    vec4 fragUpsample() {
        vec4 sum = texture2D(tDiffuse, uv1.xy);
        sum += texture2D(tDiffuse, uv1.zw) * 2.0;
        sum += texture2D(tDiffuse, uv2.xy);
        sum += texture2D(tDiffuse, uv2.zw) * 2.0;
        sum += texture2D(tDiffuse, uv3.xy);
        sum += texture2D(tDiffuse, uv3.zw) * 2.0;
        sum += texture2D(tDiffuse, uv4.xy);
        sum += texture2D(tDiffuse, uv4.zw) * 2.0;
        return sum * 0.0833;
    }

    void main(void) {
        if (MODE == 0) {
            gl_FragColor = fragCopy();
        } else if (MODE == 1) {
            gl_FragColor = fragDownsample();
        } else {
            gl_FragColor = fragUpsample();
        }
    }
`,
};

// Postprocessing shader which applies occlusion onto the entire rendered frame.
const OcclusionShader = {
    vertexShader: /* glsl */ `
varying vec2 vTexCoord;

void main() {
    vTexCoord = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
    `,
    fragmentShader: /* glsl */ `
precision mediump float;

uniform sampler2D tDiffuse;
uniform sampler2D tOcclusionMap;

varying vec2 vTexCoord;

void main(void) {
  vec4 diffuse = texture2D(tDiffuse, vTexCoord);
  vec4 occlusion = texture2D(tOcclusionMap, vTexCoord);
  float occlusionValue = occlusion.r / max(0.0001, occlusion.g);
  occlusionValue = clamp(occlusionValue, 0.0, 1.0);
  gl_FragColor = occlusionValue * diffuse;

  gl_FragColor = sRGBTransferOETF( gl_FragColor );
}
`,
};

// Postprocessing to convert a render texture + depth map into an occlusion map.
const OcclusionMapShader = {
    vertexShader: /* glsl */ `
varying vec2 vTexCoord;

void main() {
    vTexCoord = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
  `,
    fragmentShader: /* glsl */ `
#include <packing>

precision mediump float;

uniform sampler2D uDepthTexture;
uniform mat4 uUvTransform;
uniform float uRawValueToMeters;
uniform float uAlpha;
uniform float uViewId;
uniform bool uFloatDepth;

uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform float cameraNear;
uniform float cameraFar;

varying vec2 vTexCoord;

float DepthGetMeters(in sampler2D depth_texture, in vec2 depth_uv) {
  // Depth is packed into the luminance and alpha components of its texture.
  // The texture is in a normalized format, storing raw values that need to be
  // converted to meters.
  vec2 packedDepthAndVisibility = texture2D(depth_texture, depth_uv).rg;
  if (uFloatDepth) {
    return packedDepthAndVisibility.r * uRawValueToMeters;
  }
  return dot(packedDepthAndVisibility, vec2(255.0, 256.0 * 255.0)) * uRawValueToMeters;
}

float readOrthographicDepth( sampler2D depthSampler, vec2 coord ) {
  float fragCoordZ = texture2D( depthSampler, coord ).x;
  // See https://github.com/mrdoob/three.js/issues/23072.
  #ifdef USE_LOGDEPTHBUF
    float viewZ = 1.0 - exp2(fragCoordZ * log(cameraFar + 1.0) / log(2.0));
  #else
    float viewZ = perspectiveDepthToViewZ(fragCoordZ, cameraNear, cameraFar);
  #endif
  return viewZToOrthographicDepth( viewZ, cameraNear, cameraFar );
}

void main(void) {
  vec4 texCoord = vec4(vTexCoord, 0, 1);
  vec2 uv = texCoord.xy;
  uv.y = 1.0 - uv.y;

  vec4 diffuse = texture2D( tDiffuse, texCoord.xy );
  highp float real_depth = DepthGetMeters(uDepthTexture, uv);
  highp float virtual_depth =
    (readOrthographicDepth(tDepth, texCoord.xy ) *
    (cameraFar - cameraNear) + cameraNear);
  gl_FragColor = vec4(step(virtual_depth, real_depth), step(0.001, diffuse.a), 0.0, 0.0);
}
`,
};

class OcclusionMapMeshMaterial extends THREE.MeshBasicMaterial {
    constructor(camera, useFloatDepth) {
        super();
        this.uniforms = {
            uDepthTexture: { value: null },
            uDepthTextureArray: { value: null },
            uViewId: { value: 0.0 },
            uIsTextureArray: { value: 0.0 },
            uRawValueToMeters: { value: 8.0 / 65536.0 },
            cameraFar: { value: camera.far },
            cameraNear: { value: camera.near },
            uFloatDepth: { value: useFloatDepth },
            // Used for interpreting Quest 3 depth.
            uDepthNear: { value: 0 },
        };
        this.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, this.uniforms);
            this.uniforms = shader.uniforms;
            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', [
                'varying vec2 vTexCoord;',
                'varying float vVirtualDepth;',
                '#include <common>',
            ].join('\n'))
                .replace('#include <fog_vertex>', [
                '#include <fog_vertex>',
                'vec4 view_position = modelViewMatrix * vec4( position, 1.0 );',
                'vVirtualDepth = -view_position.z;',
                'gl_Position = gl_Position / gl_Position.w;',
                'vTexCoord = 0.5 + 0.5 * gl_Position.xy;',
            ].join('\n'));
            shader.fragmentShader = shader.fragmentShader
                .replace('uniform vec3 diffuse;', [
                'uniform vec3 diffuse;',
                'uniform sampler2D uDepthTexture;',
                'uniform sampler2DArray uDepthTextureArray;',
                'uniform float uRawValueToMeters;',
                'uniform float cameraNear;',
                'uniform float cameraFar;',
                'uniform bool uFloatDepth;',
                'uniform bool uIsTextureArray;',
                'uniform float uDepthNear;',
                'uniform int uViewId;',
                'varying vec2 vTexCoord;',
                'varying float vVirtualDepth;',
            ].join('\n'))
                .replace('#include <clipping_planes_pars_fragment>', [
                '#include <clipping_planes_pars_fragment>',
                `
  float DepthGetMeters(in sampler2D depth_texture, in vec2 depth_uv) {
    // Depth is packed into the luminance and alpha components of its texture.
    // The texture is in a normalized format, storing raw values that need to be
    // converted to meters.
    vec2 packedDepthAndVisibility = texture2D(depth_texture, depth_uv).rg;
    if (uFloatDepth) {
      return packedDepthAndVisibility.r * uRawValueToMeters;
    }
    return dot(packedDepthAndVisibility, vec2(255.0, 256.0 * 255.0)) * uRawValueToMeters;
  }
  float DepthArrayGetMeters(in sampler2DArray depth_texture, in vec2 depth_uv) {
    float textureValue = texture(depth_texture, vec3(depth_uv.x, depth_uv.y, uViewId)).r;
    return uRawValueToMeters * uDepthNear / (1.0 - textureValue);
  }
`,
            ].join('\n'))
                .replace('#include <dithering_fragment>', [
                '#include <dithering_fragment>',
                'vec4 texCoord = vec4(vTexCoord, 0, 1);',
                'vec2 uv = vec2(texCoord.x, uIsTextureArray?texCoord.y:(1.0 - texCoord.y));',
                'highp float real_depth = uIsTextureArray ? DepthArrayGetMeters(uDepthTextureArray, uv) : DepthGetMeters(uDepthTexture, uv);',
                'gl_FragColor = vec4(step(vVirtualDepth, real_depth), 1.0, 0.0, 1.0);',
            ].join('\n'));
        };
    }
}

var KawaseBlurMode;
(function (KawaseBlurMode) {
    KawaseBlurMode[KawaseBlurMode["COPY"] = 0] = "COPY";
    KawaseBlurMode[KawaseBlurMode["DOWN"] = 1] = "DOWN";
    KawaseBlurMode[KawaseBlurMode["UP"] = 2] = "UP";
})(KawaseBlurMode || (KawaseBlurMode = {}));
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
class OcclusionPass extends Pass {
    constructor(scene, camera, useFloatDepth = true, renderToScreen = false, occludableItemsLayer = OCCLUDABLE_ITEMS_LAYER) {
        super();
        this.scene = scene;
        this.camera = camera;
        this.renderToScreen = renderToScreen;
        this.occludableItemsLayer = occludableItemsLayer;
        this.depthTextures = [];
        this.depthNear = [];
        this.occlusionMeshMaterial = new OcclusionMapMeshMaterial(camera, useFloatDepth);
        this.occlusionMapUniforms = {
            uDepthTexture: { value: null },
            uDepthTextureArray: { value: null },
            uViewId: { value: 0.0 },
            uIsTextureArray: { value: 0.0 },
            uUvTransform: { value: new THREE.Matrix4() },
            uRawValueToMeters: { value: 8.0 / 65536.0 },
            uAlpha: { value: 0.75 },
            tDiffuse: { value: null },
            tDepth: { value: null },
            uFloatDepth: { value: useFloatDepth },
            cameraFar: { value: camera.far },
            cameraNear: { value: camera.near },
        };
        this.occlusionMapQuad = new FullScreenQuad(new THREE.ShaderMaterial({
            name: 'OcclusionMapShader',
            uniforms: this.occlusionMapUniforms,
            vertexShader: OcclusionMapShader.vertexShader,
            fragmentShader: OcclusionMapShader.fragmentShader,
        }));
        this.occlusionMapTexture = new THREE.WebGLRenderTarget();
        this.kawaseBlurTargets = [
            new THREE.WebGLRenderTarget(), // 1/2 resolution
            new THREE.WebGLRenderTarget(), // 1/4 resolution
            new THREE.WebGLRenderTarget(), // 1/8 resolution
        ];
        this.kawaseBlurQuads = [
            this.setupKawaseBlur(KawaseBlurMode.DOWN, this.occlusionMapTexture.texture),
            this.setupKawaseBlur(KawaseBlurMode.DOWN, this.kawaseBlurTargets[0].texture),
            this.setupKawaseBlur(KawaseBlurMode.DOWN, this.kawaseBlurTargets[1].texture),
            this.setupKawaseBlur(KawaseBlurMode.UP, this.kawaseBlurTargets[2].texture),
            this.setupKawaseBlur(KawaseBlurMode.UP, this.kawaseBlurTargets[1].texture),
            this.setupKawaseBlur(KawaseBlurMode.UP, this.kawaseBlurTargets[0].texture),
        ];
        this.occlusionUniforms = {
            tDiffuse: { value: null },
            tOcclusionMap: { value: this.occlusionMapTexture.texture },
        };
        this.occlusionQuad = new FullScreenQuad(new THREE.ShaderMaterial({
            name: 'OcclusionShader',
            uniforms: this.occlusionUniforms,
            vertexShader: OcclusionShader.vertexShader,
            fragmentShader: OcclusionShader.fragmentShader,
        }));
        this.occludableItemsLayer = occludableItemsLayer;
    }
    setupKawaseBlur(mode, inputTexture) {
        const uniforms = {
            uBlurSize: { value: 7.0 },
            uTexelSize: { value: new THREE.Vector2() },
            tDiffuse: { value: inputTexture },
        };
        const kawase1Material = new THREE.ShaderMaterial({
            name: 'Kawase',
            uniforms: uniforms,
            vertexShader: KawaseBlurShader.vertexShader,
            fragmentShader: KawaseBlurShader.fragmentShader,
            defines: { MODE: mode },
        });
        return new FullScreenQuad(kawase1Material);
    }
    setDepthTexture(depthTexture, rawValueToMeters, viewId, depthNear) {
        this.depthTextures[viewId] = depthTexture;
        this.occlusionMapUniforms.uRawValueToMeters.value = rawValueToMeters;
        this.occlusionMeshMaterial.uniforms.uRawValueToMeters.value =
            rawValueToMeters;
        this.depthNear[viewId] = depthNear;
        depthTexture.needsUpdate = true;
    }
    /**
     * Render the occlusion map.
     * @param renderer - The three.js renderer.
     * @param writeBuffer - The buffer to write the final result.
     * @param readBuffer - The buffer for the current of virtual depth.
     * @param viewId - The view to render.
     */
    render(renderer, writeBuffer, readBuffer, viewId = 0) {
        const originalRenderTarget = renderer.getRenderTarget();
        const dimensions = new THREE.Vector2();
        if (readBuffer == null) {
            this.renderOcclusionMapFromScene(renderer, dimensions, viewId);
        }
        else {
            this.renderOcclusionMapFromReadBuffer(renderer, readBuffer, dimensions, viewId);
        }
        // Blur the occlusion map
        this.blurOcclusionMap(renderer, dimensions);
        // Fuse the rendered image and the occlusion map.
        this.applyOcclusionMapToRenderedImage(renderer, readBuffer, writeBuffer);
        renderer.setRenderTarget(originalRenderTarget);
    }
    renderOcclusionMapFromScene(renderer, dimensions, viewId) {
        // Compute our own read buffer.
        const texture = this.depthTextures[viewId];
        const isTextureArray = texture instanceof THREE.ExternalTexture;
        this.occlusionMeshMaterial.uniforms.uIsTextureArray.value = isTextureArray
            ? 1.0
            : 0;
        this.occlusionMeshMaterial.uniforms.uViewId.value = viewId;
        if (isTextureArray) {
            this.occlusionMeshMaterial.uniforms.uDepthTextureArray.value = texture;
            this.occlusionMeshMaterial.uniforms.uDepthNear.value =
                this.depthNear[viewId];
        }
        else {
            this.occlusionMeshMaterial.uniforms.uDepthTexture.value = texture;
        }
        this.scene.overrideMaterial = this.occlusionMeshMaterial;
        renderer.getDrawingBufferSize(dimensions);
        this.occlusionMapTexture.setSize(dimensions.x, dimensions.y);
        const renderTarget = this.occlusionMapTexture;
        renderer.setRenderTarget(renderTarget);
        const camera = renderer.xr.getCamera().cameras[viewId] || this.camera;
        const originalCameraLayers = Array.from(Array(32).keys()).filter((element) => camera.layers.isEnabled(element));
        camera.layers.set(this.occludableItemsLayer);
        renderer.render(this.scene, camera);
        camera.layers.disableAll();
        originalCameraLayers.forEach((element) => {
            camera.layers.enable(element);
        });
        this.scene.overrideMaterial = null;
    }
    renderOcclusionMapFromReadBuffer(renderer, readBuffer, dimensions, viewId) {
        // Convert the readBuffer into an occlusion map.
        // Render depth into texture
        this.occlusionMapUniforms.tDiffuse.value = readBuffer.texture;
        this.occlusionMapUniforms.tDepth.value = readBuffer.depthTexture;
        const texture = this.depthTextures[viewId];
        const isTextureArray = texture instanceof THREE.ExternalTexture;
        this.occlusionMeshMaterial.uniforms.uIsTextureArray.value = isTextureArray
            ? 1.0
            : 0;
        this.occlusionMeshMaterial.uniforms.uViewId.value = viewId;
        if (isTextureArray) {
            this.occlusionMeshMaterial.uniforms.uDepthTextureArray.value = texture;
            this.occlusionMeshMaterial.uniforms.uDepthNear.value =
                this.depthNear[viewId];
        }
        else {
            this.occlusionMeshMaterial.uniforms.uDepthTexture.value = texture;
        }
        // First render the occlusion map to an intermediate buffer.
        renderer.getDrawingBufferSize(dimensions);
        this.occlusionMapTexture.setSize(dimensions.x, dimensions.y);
        renderer.setRenderTarget(this.occlusionMapTexture);
        this.occlusionMapQuad.render(renderer);
    }
    blurOcclusionMap(renderer, dimensions) {
        for (let i = 0; i < 3; i++) {
            this.kawaseBlurTargets[i].setSize(dimensions.x / 2 ** i, dimensions.y / 2 ** i);
        }
        for (let i = 0; i < 3; i++) {
            this.kawaseBlurQuads[i].material.uniforms.uTexelSize.value.set(1 / (dimensions.x / 2 ** i), 1 / (dimensions.y / 2 ** i));
            this.kawaseBlurQuads[this.kawaseBlurQuads.length - 1 - i]
                .material.uniforms.uTexelSize.value.set(1 / (dimensions.x / 2 ** (i - 1)), 1 / (dimensions.y / 2 ** (i - 1)));
        }
        renderer.setRenderTarget(this.kawaseBlurTargets[0]);
        this.kawaseBlurQuads[0].render(renderer);
        renderer.setRenderTarget(this.kawaseBlurTargets[1]);
        this.kawaseBlurQuads[1].render(renderer);
        renderer.setRenderTarget(this.kawaseBlurTargets[2]);
        this.kawaseBlurQuads[2].render(renderer);
        renderer.setRenderTarget(this.kawaseBlurTargets[1]);
        this.kawaseBlurQuads[3].render(renderer);
        renderer.setRenderTarget(this.kawaseBlurTargets[0]);
        this.kawaseBlurQuads[4].render(renderer);
        renderer.setRenderTarget(this.occlusionMapTexture);
        this.kawaseBlurQuads[5].render(renderer);
    }
    applyOcclusionMapToRenderedImage(renderer, readBuffer, writeBuffer) {
        if (readBuffer && (this.renderToScreen || writeBuffer)) {
            this.occlusionUniforms.tDiffuse.value = readBuffer.texture;
            renderer.setRenderTarget(writeBuffer && !this.renderToScreen ? writeBuffer : null);
            this.occlusionQuad.render(renderer);
        }
    }
    dispose() {
        this.occlusionMeshMaterial.dispose();
        this.occlusionMapTexture.dispose();
        for (let i = 0; i < this.kawaseBlurQuads.length; i++) {
            this.kawaseBlurQuads[i].dispose();
        }
    }
    updateOcclusionMapUniforms(uniforms, renderer) {
        const camera = renderer.xr.getCamera().cameras[0] || this.camera;
        uniforms.tOcclusionMap.value = this.occlusionMapTexture.texture;
        uniforms.uOcclusionClipFromWorld.value
            .copy(camera.projectionMatrix)
            .multiply(camera.matrixWorldInverse);
    }
}

const DEFAULT_DEPTH_WIDTH = 160;
const DEFAULT_DEPTH_HEIGHT = DEFAULT_DEPTH_WIDTH;
const clipSpacePosition = new THREE.Vector3();
const normViewCoord = new THREE.Vector3();
class Depth {
    get rawValueToMeters() {
        if (this.cpuDepthData.length) {
            return this.cpuDepthData[0].rawValueToMeters;
        }
        else if (this.gpuDepthData.length) {
            return this.gpuDepthData[0].rawValueToMeters;
        }
        return 0;
    }
    /**
     * Depth is a lightweight manager based on three.js to simply prototyping
     * with Depth in WebXR.
     */
    constructor() {
        this.enabled = false;
        this.view = [];
        this.cpuDepthData = [];
        this.gpuDepthData = [];
        this.depthArray = [];
        this.options = new DepthOptions();
        this.width = DEFAULT_DEPTH_WIDTH;
        this.height = DEFAULT_DEPTH_HEIGHT;
        this.occludableShaders = new Set();
        // Whether we're counting the number of depth clients.
        this.depthClientsInitialized = false;
        this.depthClients = new Set();
        this.depthProjectionMatrices = [];
        this.depthProjectionInverseMatrices = [];
        this.depthViewMatrices = [];
        this.depthViewProjectionMatrices = [];
        this.depthCameraPositions = [];
        this.depthCameraRotations = [];
        /**
         * Transforms from normalized view coordinates to normalized depth buffer
         * coordinates. Identity when matchDepthView is true.
         */
        this.normDepthBufferFromNormViewMatrices = [];
        /** Timestamp of the last depth mesh geometry update. */
        this.lastDepthMeshUpdateTime = 0;
        if (Depth.instance) {
            return Depth.instance;
        }
        Depth.instance = this;
    }
    /**
     * Initialize Depth manager.
     */
    init(camera, options, renderer, registry, scene) {
        this.camera = camera;
        this.options = options;
        this.renderer = renderer;
        this.enabled = options.enabled;
        if (this.options.depthTexture.enabled) {
            this.depthTextures = new DepthTextures(options);
            registry.register(this.depthTextures);
        }
        if (this.options.depthMesh.enabled) {
            this.depthMesh = new DepthMesh(options, this.width, this.height, this.depthTextures);
            registry.register(this.depthMesh);
            if (this.options.depthMesh.renderShadow) {
                this.renderer.shadowMap.enabled = true;
                this.renderer.shadowMap.type = THREE.PCFShadowMap;
            }
            scene.add(this.depthMesh);
        }
        if (this.options.occlusion.enabled) {
            this.occlusionPass = new OcclusionPass(scene, camera);
        }
    }
    /**
     * Retrieves the depth at normalized coordinates (u, v).
     * Note: The UV coordinates are with respect to the user's view, not the depth camera view.
     * @param u - Normalized horizontal coordinate.
     * @param v - Normalized vertical coordinate.
     * @returns Depth value at the specified coordinates.
     */
    getDepth(u, v) {
        if (!this.depthArray[0])
            return 0.0;
        // When matchDepthView is false, transform from view-space UVs to
        // depth buffer UVs using normDepthBufferFromNormView.
        if (this.normDepthBufferFromNormViewMatrices.length > 0) {
            normViewCoord.set(u, v, 0);
            normViewCoord.applyMatrix4(this.normDepthBufferFromNormViewMatrices[0]);
            u = normViewCoord.x;
            v = normViewCoord.y;
        }
        const depthX = Math.round(clamp(u * this.width, 0, this.width - 1));
        const depthY = Math.round(clamp((1.0 - v) * this.height, 0, this.height - 1));
        const rawDepth = this.depthArray[0][depthY * this.width + depthX];
        return this.rawValueToMeters * rawDepth;
    }
    /**
     * Projects the given world position to depth camera's clip space and then
     * to the depth camera's view space using the depth.
     * @param position - The world position to project.
     * @returns The depth camera view space position.
     */
    getProjectedDepthViewPositionFromWorldPosition(position, target = new THREE.Vector3()) {
        clipSpacePosition
            .copy(position)
            .applyMatrix4(this.depthViewMatrices[0])
            .applyMatrix4(this.depthProjectionMatrices[0]);
        const u = 0.5 * (clipSpacePosition.x + 1.0);
        const v = 0.5 * (clipSpacePosition.y + 1.0);
        let depth = 0.0;
        if (this.depthArray[0]) {
            const depthX = Math.round(clamp(u * this.width, 0, this.width - 1));
            const depthY = Math.round(clamp((1.0 - v) * this.height, 0, this.height - 1));
            const rawDepth = this.depthArray[0][depthY * this.width + depthX];
            depth = this.rawValueToMeters * rawDepth;
        }
        target.set(2.0 * (u - 0.5), 2.0 * (v - 0.5), -1);
        target.applyMatrix4(this.depthProjectionInverseMatrices[0]);
        target.multiplyScalar(-depth / target.z);
        return target;
    }
    /**
     * Retrieves the depth at normalized coordinates (u, v).
     * Note: The UV coordinates are with respect to the user's view, not the depth camera view.
     * @param u - Normalized horizontal coordinate.
     * @param v - Normalized vertical coordinate.
     * @returns Vertex at (u, v)
     */
    getVertex(u, v) {
        if (!this.depthArray[0])
            return null;
        // When matchDepthView is false, transform from view-space UVs to
        // depth buffer UVs using normDepthBufferFromNormView.
        if (this.normDepthBufferFromNormViewMatrices.length > 0) {
            normViewCoord.set(u, v, 0);
            normViewCoord.applyMatrix4(this.normDepthBufferFromNormViewMatrices[0]);
            u = normViewCoord.x;
            v = normViewCoord.y;
        }
        const depthX = Math.round(clamp(u * this.width, 0, this.width - 1));
        const depthY = Math.round(clamp((1.0 - v) * this.height, 0, this.height - 1));
        const rawDepth = this.depthArray[0][depthY * this.width + depthX];
        const depth = this.rawValueToMeters * rawDepth;
        const vertexPosition = new THREE.Vector3(2.0 * (u - 0.5), 2.0 * (v - 0.5), -1);
        vertexPosition.applyMatrix4(this.depthProjectionInverseMatrices[0]);
        vertexPosition.multiplyScalar(-depth / vertexPosition.z);
        return vertexPosition;
    }
    updateDepthMatrices(depthData, viewId) {
        // Populate depth view and projection matrices.
        while (viewId >= this.depthViewMatrices.length) {
            this.depthViewMatrices.push(new THREE.Matrix4());
            this.depthViewProjectionMatrices.push(new THREE.Matrix4());
            this.depthProjectionMatrices.push(new THREE.Matrix4());
            this.depthProjectionInverseMatrices.push(new THREE.Matrix4());
            this.depthCameraPositions.push(new THREE.Vector3());
            this.depthCameraRotations.push(new THREE.Quaternion());
            this.normDepthBufferFromNormViewMatrices.push(new THREE.Matrix4());
        }
        // Store the view-to-depth-buffer coordinate transform.
        if (depthData.normDepthBufferFromNormView) {
            this.normDepthBufferFromNormViewMatrices[viewId].fromArray(depthData.normDepthBufferFromNormView.matrix);
        }
        else {
            this.normDepthBufferFromNormViewMatrices[viewId].identity();
        }
        if (depthData.projectionMatrix && depthData.transform) {
            this.depthProjectionMatrices[viewId].fromArray(depthData.projectionMatrix);
            this.depthViewMatrices[viewId].fromArray(depthData.transform.inverse.matrix);
            this.depthCameraPositions[viewId].set(depthData.transform.position.x, depthData.transform.position.y, depthData.transform.position.z);
            this.depthCameraRotations[viewId].set(depthData.transform.orientation.x, depthData.transform.orientation.y, depthData.transform.orientation.z, depthData.transform.orientation.w);
        }
        else {
            const camera = this.renderer.xr?.getCamera()?.cameras?.[viewId] ?? this.camera;
            this.depthProjectionMatrices[viewId].copy(camera.projectionMatrix);
            this.depthViewMatrices[viewId].copy(camera.matrixWorldInverse);
            this.depthCameraPositions[viewId].copy(camera.position);
            this.depthCameraRotations[viewId].copy(camera.quaternion);
        }
        this.depthProjectionInverseMatrices[viewId]
            .copy(this.depthProjectionMatrices[viewId])
            .invert();
        this.depthViewProjectionMatrices[viewId].multiplyMatrices(this.depthProjectionMatrices[viewId], this.depthViewMatrices[viewId]);
    }
    updateCPUDepthData(depthData, viewId = 0) {
        this.cpuDepthData[viewId] = depthData;
        this.updateDepthMatrices(depthData, viewId);
        // Updates Depth Array.
        this.depthArray[viewId] = this.options.useFloat32
            ? new Float32Array(depthData.data)
            : new Uint16Array(depthData.data);
        this.width = depthData.width;
        this.height = depthData.height;
        // Updates Depth Texture.
        if (this.options.depthTexture.enabled && this.depthTextures) {
            this.depthTextures.updateData(depthData, viewId);
        }
        if (this.options.depthMesh.enabled && this.depthMesh && viewId == 0) {
            if (this.shouldUpdateDepthMesh()) {
                this.depthMesh.updateDepth(depthData, this.depthProjectionInverseMatrices[0]);
            }
            this.depthMesh.updatePose(this.depthCameraPositions[0], this.depthCameraRotations[0]);
        }
    }
    updateGPUDepthData(depthData, viewId = 0) {
        this.gpuDepthData[viewId] = depthData;
        this.updateDepthMatrices(depthData, viewId);
        // For now, assume that we need cpu depth only if depth mesh is enabled.
        // In the future, add a separate option.
        const needCpuDepth = this.options.depthMesh.enabled;
        const cpuDepth = needCpuDepth && this.depthMesh
            ? this.depthMesh.convertGPUToGPU(depthData)
            : null;
        if (cpuDepth) {
            if (this.depthArray[viewId] == null) {
                this.depthArray[viewId] = this.options.useFloat32
                    ? new Float32Array(cpuDepth.data)
                    : new Uint16Array(cpuDepth.data);
                this.width = cpuDepth.width;
                this.height = cpuDepth.height;
            }
            else {
                // Copies the data from an ArrayBuffer to the existing TypedArray.
                this.depthArray[viewId].set(this.options.useFloat32
                    ? new Float32Array(cpuDepth.data)
                    : new Uint16Array(cpuDepth.data));
            }
        }
        // Updates Depth Texture.
        if (this.options.depthTexture.enabled && this.depthTextures) {
            this.depthTextures.updateNativeTexture(depthData, this.renderer, viewId);
        }
        if (this.options.depthMesh.enabled && this.depthMesh && viewId == 0) {
            if (this.shouldUpdateDepthMesh()) {
                if (cpuDepth) {
                    this.depthMesh.updateDepth(cpuDepth, this.depthProjectionInverseMatrices[0]);
                }
                else {
                    this.depthMesh.updateGPUDepth(depthData, this.depthProjectionInverseMatrices[0]);
                }
            }
            this.depthMesh.updatePose(this.depthCameraPositions[0], this.depthCameraRotations[0]);
        }
    }
    /**
     * Checks whether the depth mesh geometry should be updated this frame,
     * based on the configured depthMeshUpdateFps. The pose is always updated
     * every frame so the mesh tracks the depth camera smoothly, but the
     * expensive geometry rebuild can be throttled.
     */
    shouldUpdateDepthMesh() {
        const fps = this.options.depthMesh.depthMeshUpdateFps;
        if (fps <= 0)
            return true;
        const now = performance.now();
        if (now - this.lastDepthMeshUpdateTime < 1000 / fps) {
            return false;
        }
        this.lastDepthMeshUpdateTime = now;
        return true;
    }
    getTexture(viewId) {
        if (!this.options.depthTexture.enabled)
            return undefined;
        return this.depthTextures?.get(viewId);
    }
    update(frame) {
        if (!this.options.enabled)
            return;
        if (frame) {
            this.updateLocalDepth(frame);
        }
        if (this.options.occlusion.enabled) {
            this.renderOcclusionPass();
        }
    }
    updateLocalDepth(frame) {
        const session = frame.session;
        const binding = this.renderer.xr.getBinding();
        // Enable or disable depth based on the number of clients.
        const pausingDepthSupported = session.depthActive !== undefined;
        if (pausingDepthSupported && this.depthClientsInitialized) {
            const needsDepth = this.depthClients.size > 0;
            if (session.depthActive && !needsDepth) {
                session.pauseDepthSensing?.();
            }
            else if (!session.depthActive && needsDepth) {
                session.resumeDepthSensing?.();
            }
            if (this.depthClients.size == 0) {
                return;
            }
        }
        const xrRefSpace = this.renderer.xr.getReferenceSpace();
        if (xrRefSpace) {
            const pose = frame.getViewerPose(xrRefSpace);
            if (pose) {
                for (let viewId = 0; viewId < pose.views.length; ++viewId) {
                    const view = pose.views[viewId];
                    this.view[viewId] = view;
                    if (session.depthUsage === 'gpu-optimized') {
                        const depthData = binding.getDepthInformation(view);
                        if (!depthData) {
                            return;
                        }
                        this.updateGPUDepthData(depthData, viewId);
                    }
                    else {
                        const depthData = frame.getDepthInformation(view);
                        if (!depthData) {
                            return;
                        }
                        this.updateCPUDepthData(depthData, viewId);
                    }
                }
            }
            else {
                console.error('Pose unavailable in the current frame.');
            }
        }
    }
    renderOcclusionPass() {
        const leftDepthTexture = this.getTexture(0);
        if (leftDepthTexture) {
            this.occlusionPass.setDepthTexture(leftDepthTexture, this.rawValueToMeters, 0, this.gpuDepthData[0]
                ?.depthNear);
        }
        const rightDepthTexture = this.getTexture(1);
        if (rightDepthTexture) {
            this.occlusionPass.setDepthTexture(rightDepthTexture, this.rawValueToMeters, 1, this.gpuDepthData[1]
                ?.depthNear);
        }
        const xrIsPresenting = this.renderer.xr.isPresenting;
        this.renderer.xr.isPresenting = false;
        this.occlusionPass.render(this.renderer, undefined, undefined, 0);
        this.renderer.xr.isPresenting = xrIsPresenting;
        for (const shader of this.occludableShaders) {
            this.occlusionPass.updateOcclusionMapUniforms(shader.uniforms, this.renderer);
        }
    }
    debugLog() {
        const arrayBuffer = this.cpuDepthData[0].data;
        const uint8Array = new Uint8Array(arrayBuffer);
        // Convert Uint8Array to a string where each character represents a byte
        const binaryString = Array.from(uint8Array, (byte) => String.fromCharCode(byte)).join('');
        // Convert binary string to base64
        const data_str = btoa(binaryString);
        console.log(data_str);
    }
    resumeDepth(client) {
        this.depthClientsInitialized = true;
        this.depthClients.add(client);
    }
    pauseDepth(client) {
        this.depthClientsInitialized = true;
        this.depthClients.delete(client);
    }
}

const HAND_JOINT_NAMES = [
    'wrist',
    'thumb-metacarpal',
    'thumb-phalanx-proximal',
    'thumb-phalanx-distal',
    'thumb-tip',
    'index-finger-metacarpal',
    'index-finger-phalanx-proximal',
    'index-finger-phalanx-intermediate',
    'index-finger-phalanx-distal',
    'index-finger-tip',
    'middle-finger-metacarpal',
    'middle-finger-phalanx-proximal',
    'middle-finger-phalanx-intermediate',
    'middle-finger-phalanx-distal',
    'middle-finger-tip',
    'ring-finger-metacarpal',
    'ring-finger-phalanx-proximal',
    'ring-finger-phalanx-intermediate',
    'ring-finger-phalanx-distal',
    'ring-finger-tip',
    'pinky-finger-metacarpal',
    'pinky-finger-phalanx-proximal',
    'pinky-finger-phalanx-intermediate',
    'pinky-finger-phalanx-distal',
    'pinky-finger-tip',
];

/**
 * Utility class for managing WebXR hand tracking data based on
 * reported Handedness.
 */
/**
 * Enum for handedness, using WebXR standard strings.
 */
var Handedness;
(function (Handedness) {
    Handedness[Handedness["NONE"] = -1] = "NONE";
    Handedness[Handedness["LEFT"] = 0] = "LEFT";
    Handedness[Handedness["RIGHT"] = 1] = "RIGHT";
})(Handedness || (Handedness = {}));
/**
 * Represents and provides access to WebXR hand tracking data.
 * Uses the 'handedness' property of input hands for identification.
 */
class Hands {
    /**
     * @param hands - An array containing XRHandSpace objects from Three.js.
     */
    constructor(hands) {
        this.hands = hands;
        this.dominant = Handedness.RIGHT;
    }
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
    getJoint(jointName, targetHandednessEnum) {
        let resolvedHandednessEnum = targetHandednessEnum;
        if (resolvedHandednessEnum === Handedness.NONE) {
            resolvedHandednessEnum = this.dominant;
        }
        const hand = this.hands[resolvedHandednessEnum];
        if (!hand) {
            console.log('no hand');
            return undefined;
        }
        if (!hand.joints || !(jointName in hand.joints)) {
            return undefined;
        }
        return hand.joints[jointName];
    }
    /**
     * Gets the index finger tip joint.
     * @param handedness - Optional handedness
     *     ('left'/'right'),
     * defaults to NONE (uses dominant hand).
     * @returns The joint object or null.
     */
    getIndexTip(handedness = Handedness.NONE) {
        return this.getJoint('index-finger-tip', handedness);
    }
    /**
     * Gets the thumb tip joint.
     * @param handedness - Optional handedness
     *     ('left'/'right'),
     * defaults to NONE (uses dominant hand).
     * @returns The joint object or null.
     */
    getThumbTip(handedness = Handedness.NONE) {
        return this.getJoint('thumb-tip', handedness);
    }
    /**
     * Gets the middle finger tip joint.
     * @param handedness - Optional handedness
     *     ('left'/'right'),
     * defaults to NONE (uses dominant hand).
     * @returns The joint object or null.
     */
    getMiddleTip(handedness = Handedness.NONE) {
        return this.getJoint('middle-finger-tip', handedness);
    }
    /**
     * Gets the ring finger tip joint.
     * @param handedness - Optional handedness
     *     ('left'/'right'),
     * defaults to NONE (uses dominant hand).
     * @returns The joint object or null.
     */
    getRingTip(handedness = Handedness.NONE) {
        return this.getJoint('ring-finger-tip', handedness);
    }
    /**
     * Gets the pinky finger tip joint.
     * @param handedness - Optional handedness
     *     ('left'/'right'),
     * defaults to NONE (uses dominant hand).
     * @returns The joint object or null.
     */
    getPinkyTip(handedness = Handedness.NONE) {
        return this.getJoint('pinky-finger-tip', handedness);
    }
    /**
     * Gets the wrist joint.
     * @param handedness - Optional handedness enum value
     *     (LEFT/RIGHT/NONE),
     * defaults to NONE (uses dominant hand).
     * @returns The joint object or null.
     */
    getWrist(handedness = Handedness.NONE) {
        return this.getJoint('wrist', handedness);
    }
    /**
     * Generates a string representation of the hand joint data for both hands.
     * Always lists LEFT hand data first, then RIGHT hand data, if available.
     * @returns A string containing position data for all available
     * joints.
     */
    toString() {
        let s = '';
        const orderedHandedness = [Handedness.LEFT, Handedness.RIGHT];
        orderedHandedness.forEach((handedness) => {
            const hand = this.hands[handedness];
            if (!hand || !hand.joints) {
                s += `${handedness} Hand: Data unavailable\n`;
                return; // Continue to the next handedness
            }
            HAND_JOINT_NAMES.forEach((jointName) => {
                const joint = hand.joints[jointName];
                if (joint) {
                    if (joint.position) {
                        s += `${handedness} - ${jointName}: ${joint.position.x.toFixed(3)}, ${joint.position.y.toFixed(3)}, ${joint.position.z.toFixed(3)}\n`;
                    }
                    else {
                        s += `${handedness} - ${jointName}: Position unavailable\n`;
                    }
                }
                else {
                    s += `${handedness} - ${jointName}: Joint unavailable\n`;
                }
            });
        });
        return s;
    }
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
    toPositionQuaternionArray() {
        const data = [];
        const orderedHandedness = [Handedness.LEFT, Handedness.RIGHT];
        const numJoints = HAND_JOINT_NAMES.length;
        const numValuesPerJoint = 7; // 3 position + 4 quaternion
        orderedHandedness.forEach((handedness) => {
            const hand = this.hands[handedness];
            // Check if hand and joints data exist for this handedness
            const handDataAvailable = hand && hand.joints;
            HAND_JOINT_NAMES.forEach((jointName) => {
                const joint = handDataAvailable ? hand.joints[jointName] : null;
                // Check if specific joint and its properties exist
                if (joint && joint.position && joint.quaternion) {
                    data.push(joint.position.x, joint.position.y, joint.position.z);
                    data.push(joint.quaternion.x, joint.quaternion.y, joint.quaternion.z, joint.quaternion.w);
                }
                else {
                    // If hand, joints, joint, or properties missing, push zeros
                    for (let i = 0; i < numValuesPerJoint; i++) {
                        data.push(0);
                    }
                }
            });
        });
        // The final array should always have the same size
        const expectedSize = orderedHandedness.length * numJoints * numValuesPerJoint;
        if (data.length !== expectedSize) {
            // This case should theoretically not happen with the logic above,
            // but added as a safeguard during development/debugging.
            console.error(`XRHands.toPositionQuaternionArray: Output array size mismatch. Expected ${expectedSize}, got ${data.length}. Padding with zeros.`);
            // Pad with zeros if necessary, though ideally the logic prevents this
            while (data.length < expectedSize) {
                data.push(0);
            }
        }
        return data;
    }
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
    isValid(handIndex) {
        if (!this.hands || !Array.isArray(this.hands) || this.hands.length !== 2) {
            return false;
        }
        if (handIndex === 0 || handIndex === 1) {
            return !!this.hands[handIndex];
        }
        return !!this.hands[Handedness.LEFT] && !!this.hands[Handedness.RIGHT];
    }
}

/**
 * Shader for the Reticle UI component.
 *
 * This shader renders a dynamic, anti-aliased circle that provides visual
 * feedback for user interaction. It can smoothly transition between a hollow
 * ring (idle/hover state) and a solid, shrinking circle (pressed state).
 * The anti-aliasing is achieved using screen-space derivatives (fwidth) to
 * ensure crisp edges at any resolution or distance.
 */
const ReticleShader = {
    uniforms: {
        uColor: { value: new THREE.Color().setHex(0xffffff) },
        uPressed: { value: 0.0 },
    },
    vertexShader: /* glsl */ `
  varying vec2 vTexCoord;

  void main() {
    vTexCoord = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    // Makes the position slightly closer to avoid z fighting.
    gl_Position.z -= 0.1;
  }
`,
    fragmentShader: /* glsl */ `
  precision mediump float;

  uniform sampler2D uDepthTexture;
  uniform vec3 uColor;
  uniform float uPressed;

  varying vec2 vTexCoord;

  void main(void) {
    // Distance from center of quad.
    highp float dist = distance(vTexCoord, vec2(0.5f, 0.5f));
    if (dist > 0.45) discard;

    // Get the rate of change of dist on x and y.
    highp vec2 dist_grad = vec2(dFdx(dist), dFdy(dist));
    highp float grad_magnitude = length(dist_grad);
    highp float antialias_dist = max(grad_magnitude, 0.001f);

    // Outer radius is 0.5, but we want to bring it in a few pixels so we have room
    // for a gradient outward to anti-alias the circle.
    // These "few pixels" are determined by our derivative calculation above.
    highp float outerradius = 0.5f - antialias_dist;
    highp float delta_to_outer = dist - outerradius;
    highp float clamped_outer_delta = clamp(delta_to_outer, 0.0f, antialias_dist);
    highp float outer_alpha = 1.0f - (clamped_outer_delta / antialias_dist);

    // #FFFFFF = (1,1,1)
    // #FFFFFF with 0.5 alpha = (((1,1,1) * 0.5), 0.5)
    vec4 inner_base_color = vec4(0.5 * uColor, 0.5);
    vec4 pressed_inner_color = vec4(uColor, 1.0);
    // #505050 = (0.077,0.077,0.077)
    // #505050 with 0.7 alpha = (((0.077,0.077,0.077)*0.7), 0.7)
    const vec4 inner_gradient_color = vec4(0.054, 0.054, 0.054, 1.0);
    const vec4 outer_ring_color = vec4(0.077, 0.077, 0.077, 1.0);
    // 0.5 - stoke_width (0.75dp = 0.04 approx)
    const float gradient_end = 0.46;
    // 73% of gradient_end
    const float gradient_start = 0.33;
    // gradient_end - 130% stoke_width. Additional 30% to account for the down scaling.
    const float pressed_inner_radius = 0.41;

    vec4 unpressed_inner_color =
            mix(inner_base_color, inner_gradient_color,
                    smoothstep(gradient_start, gradient_end, dist));
    vec4 unpressed_color =
            mix(unpressed_inner_color, outer_ring_color,
                    step(gradient_end, dist));

    // Builds a smooth gradient to fade between colors.
    highp float smooth_distance = antialias_dist * 4.0;
    float percent_to_inner_rad = max(pressed_inner_radius - dist, 0.0) / pressed_inner_radius;
    highp float pressed_color_t = 1.0 - percent_to_inner_rad;
    pressed_color_t -= (1.0 - smooth_distance);
    pressed_color_t *= (1.0 / smooth_distance);
    pressed_color_t = clamp(pressed_color_t, 0.0, 1.0);
    vec4 pressed_color = mix(pressed_inner_color, outer_ring_color, pressed_color_t);

    vec4 final_color = mix(unpressed_color, pressed_color, uPressed);
    gl_FragColor = final_color * outer_alpha;
    // Converts to straight alpha.
    gl_FragColor.rgb = gl_FragColor.rgb / max(gl_FragColor.a, 0.001);
  }
`,
};

/**
 * A 3D visual marker used to indicate a user's aim or interaction
 * point in an XR scene. It orients itself to surfaces it intersects with and
 * provides visual feedback for states like "pressed".
 */
class Reticle extends THREE.Mesh {
    /**
     * Creates an instance of Reticle.
     * @param rotationSmoothing - A factor between 0.0 (no smoothing) and
     * 1.0 (no movement) to smoothly animate orientation changes.
     * @param offset - A small z-axis offset to prevent z-fighting.
     * @param size - The radius of the reticle's circle geometry.
     * @param depthTest - Determines if the reticle should be occluded by other
     * objects. Defaults to `false` to ensure it is always visible.
     */
    constructor(rotationSmoothing = 0.8, offset = 0.001, size = 0.019, depthTest = false) {
        const geometry = new THREE.CircleGeometry(size, 32);
        geometry.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0, offset));
        super(geometry, new THREE.ShaderMaterial({
            uniforms: THREE.UniformsUtils.clone(ReticleShader.uniforms),
            vertexShader: ReticleShader.vertexShader,
            fragmentShader: ReticleShader.fragmentShader,
            depthTest: depthTest,
            transparent: true,
        }));
        /** Text description of the PanelMesh */
        this.name = 'Reticle';
        this.editorIcon = 'target';
        /** Prevents the reticle itself from being a target for raycasting. */
        this.ignoreReticleRaycast = true;
        /** The world-space direction vector of the ray that hit the target. */
        this.direction = new THREE.Vector3();
        /** Ensures the reticle is drawn on top of other transparent objects. */
        this.renderOrder = 1000;
        // --- Private properties for performance optimization ---
        this.originalNormal = new THREE.Vector3(0, 0, 1);
        this.newRotation = new THREE.Quaternion();
        this.objectRotation = new THREE.Quaternion();
        this.normalVector = new THREE.Vector3();
        this.rotationSmoothing = rotationSmoothing;
        this.offset = offset;
    }
    /**
     * Orients the reticle to be flush with a surface, based on the surface
     * normal. It smoothly interpolates the rotation for a polished visual effect.
     * @param normal - The world-space normal of the surface.
     */
    setRotationFromNormalVector(normal) {
        const angle = this.originalNormal.angleTo(normal);
        // Calculate the rotation axis by taking the cross product.
        // Note: this.originalNormal is modified here but reset by the next line.
        this.originalNormal.cross(normal).normalize();
        this.newRotation.setFromAxisAngle(this.originalNormal, angle);
        this.originalNormal.set(0, 0, 1); // Reset for next use.
        // Smoothly interpolate from the current rotation to the new rotation.
        this.quaternion.slerp(this.newRotation, 1.0 - this.rotationSmoothing);
    }
    /**
     * Updates the reticle's complete pose (position and rotation) from a
     * raycaster intersection object.
     * @param intersection - The intersection data from a raycast.
     */
    setPoseFromIntersection(intersection) {
        if (!intersection || !intersection.normal)
            return;
        this.intersection = intersection;
        this.position.copy(intersection.point);
        // The intersection normal is in the local space of the intersected object.
        // It must be transformed into world space to correctly orient the reticle.
        intersection.object.getWorldQuaternion(this.objectRotation);
        this.normalVector
            .copy(intersection.normal)
            .applyQuaternion(this.objectRotation);
        this.setRotationFromNormalVector(this.normalVector);
    }
    /**
     * Sets the color of the reticle via its shader uniform.
     * @param color - The color to apply.
     */
    setColor(color) {
        this.material.uniforms.uColor.value.set(color);
    }
    /**
     * Gets the current color of the reticle.
     * @returns The current color from the shader uniform.
     */
    getColor() {
        return this.material.uniforms.uColor.value;
    }
    /**
     * Sets the visual state of the reticle to "pressed" or "unpressed".
     * This provides visual feedback to the user during interaction.
     * @param pressed - True to show the pressed state, false otherwise.
     */
    setPressed(pressed) {
        this.material.uniforms.uPressed.value = pressed ? 1.0 : 0.0;
        this.scale.setScalar(pressed ? 0.7 : 1.0);
    }
    /**
     * Sets the pressed state as a continuous value for smooth animations.
     * @param pressedAmount - A value from 0.0 (unpressed) to 1.0 (fully
     * pressed).
     */
    setPressedAmount(pressedAmount) {
        this.material.uniforms.uPressed.value = pressedAmount;
        this.scale.setScalar(lerp(1.0, 0.7, pressedAmount));
    }
    /**
     * Overrides the default raycast method to make the reticle ignored by
     * raycasters.
     */
    raycast() { }
}

class ControllerRayVisual extends THREE.Line {
    constructor() {
        const geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, -1),
        ]);
        super(geometry);
        this.scale.z = 5;
    }
    // Ignore raycasts to this line.
    raycast() { }
}

const STORAGE_KEY = 'xrblocks:simulator:gamepad-bindings:v1';
const DEFAULT_BINDINGS = {
    select: 0, // A / Cross
    cycleHandPoseLeft: 14, // D-pad left
    cycleHandPoseRight: 15, // D-pad right
    cycleSimulatorMode: 3, // Y
    toggleUI: 5, // RB / R1
    toggleHand: 4, // LB / L1
    moveDown: 6, // LT (analog)
    moveUp: 7, // RT (analog)
    openSettings: 9, // Start / Menu
};
/**
 * Manages gamepad button-to-action mappings with localStorage persistence.
 * One button per action — assigning a button removes it from any previous action.
 */
class GamepadBindings {
    constructor() {
        this.bindings = { ...DEFAULT_BINDINGS };
        this.load();
    }
    getBinding(action) {
        return this.bindings[action];
    }
    getAllBindings() {
        return { ...this.bindings };
    }
    setBinding(action, buttonIndex) {
        // openSettings must always be bound so users can never lock themselves
        // out of the menu — silently ignore attempts to rebind or unbind it,
        // and refuse to assign its button to any other action.
        if (action === 'openSettings')
            return;
        if (buttonIndex === this.bindings.openSettings)
            return;
        // Auto-unbind any other action using this button, except openSettings
        // (same lock-out reason).
        for (const key of Object.keys(this.bindings)) {
            if (key !== action &&
                key !== 'openSettings' &&
                this.bindings[key] === buttonIndex) {
                this.bindings[key] = -1;
            }
        }
        this.bindings[action] = buttonIndex;
        this.save();
    }
    resetDefaults() {
        this.bindings = { ...DEFAULT_BINDINGS };
        this.save();
    }
    load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw)
                return;
            const parsed = JSON.parse(raw);
            if (parsed?.version !== 1 || typeof parsed.bindings !== 'object')
                return;
            for (const key of Object.keys(DEFAULT_BINDINGS)) {
                if (typeof parsed.bindings[key] === 'number') {
                    this.bindings[key] = parsed.bindings[key];
                }
            }
        }
        catch {
            // localStorage unavailable or corrupted — keep defaults.
        }
    }
    save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, bindings: this.bindings }));
        }
        catch {
            // localStorage unavailable — silently continue.
        }
    }
}

const DEADZONE = 0.15;
/**
 * Simulates an XR controller using a connected gamepad (Xbox/PS).
 * The controller ray always points forward from the camera center,
 * similar to GazeController but with button-driven selection.
 */
class GamepadController extends Script {
    static { this.dependencies = {
        camera: THREE.Camera,
    }; }
    constructor() {
        super();
        this.type = 'GamepadController';
        this.name = 'Gamepad Controller';
        this.userData = { id: 4, connected: false, selected: false };
        this.bindings = new GamepadBindings();
        /** True if the toast has been shown this session. */
        this.hasShownToast = false;
        /** When true, normal gamepad UI/select actions are suppressed (modal menu). */
        this.menuActive = false;
        this._prevButtons = [];
        this._risingEdges = [];
        this._captureCallback = null;
    }
    init({ camera }) {
        this.camera = camera;
    }
    /**
     * Enters capture mode — the next button press will invoke the callback
     * instead of triggering normal actions, then exit capture mode.
     */
    captureNextButtonPress(callback) {
        this._captureCallback = callback;
    }
    cancelCapture() {
        this._captureCallback = null;
    }
    get captureActive() {
        return this._captureCallback !== null;
    }
    update() {
        super.update();
        const gp = this._pollGamepad();
        if (gp && !this.userData.connected) {
            this.activeGamepad = gp;
            this.gamepad = gp;
            this.dispatchEvent({ type: 'connected', target: this });
        }
        else if (!gp && this.userData.connected) {
            this._onDisconnect();
            return;
        }
        if (!gp || !this.userData.connected)
            return;
        this.activeGamepad = gp;
        // Compute rising edges for this frame (before any consumption).
        for (let i = 0; i < gp.buttons.length; i++) {
            const down = gp.buttons[i]?.pressed ?? false;
            const wasDown = this._prevButtons[i] ?? false;
            this._risingEdges[i] = down && !wasDown;
        }
        // Sync pose with camera (center-screen ray, like GazeController).
        this.position.copy(this.camera.position);
        this.quaternion.copy(this.camera.quaternion);
        this.updateMatrixWorld();
        // Check for capture mode on any rising edge.
        if (this._captureCallback) {
            for (let i = 0; i < gp.buttons.length; i++) {
                if (this._risingEdges[i]) {
                    const cb = this._captureCallback;
                    this._captureCallback = null;
                    cb(i);
                    this._updatePrevButtons(gp);
                    return; // Consume all input this frame.
                }
            }
        }
        // Normal select handling via bindings (suppressed when a modal menu is
        // active so A-button activates UI rather than firing scene selects).
        if (!this.menuActive) {
            const selectBtn = this.bindings.getBinding('select');
            const selectDown = gp.buttons[selectBtn]?.pressed ?? false;
            const selectWas = this._prevButtons[selectBtn] ?? false;
            if (selectDown && !selectWas)
                this.callSelectStart();
            if (!selectDown && selectWas)
                this.callSelectEnd();
        }
        this._updatePrevButtons(gp);
    }
    callSelectStart() {
        this.dispatchEvent({ type: 'selectstart', target: this });
    }
    callSelectEnd() {
        this.dispatchEvent({ type: 'selectend', target: this });
    }
    connect() {
        this.dispatchEvent({ type: 'connected', target: this });
    }
    disconnect() {
        this.dispatchEvent({ type: 'disconnected', target: this });
    }
    /**
     * Returns the axes of the active gamepad with deadzone applied.
     * [leftX, leftY, rightX, rightY]
     */
    getAxes() {
        const gp = this.activeGamepad;
        if (!gp)
            return [0, 0, 0, 0];
        return [
            GamepadController.applyDeadzone(gp.axes[0] ?? 0),
            GamepadController.applyDeadzone(gp.axes[1] ?? 0),
            GamepadController.applyDeadzone(gp.axes[2] ?? 0),
            GamepadController.applyDeadzone(gp.axes[3] ?? 0),
        ];
    }
    static applyDeadzone(value) {
        if (!Number.isFinite(value))
            return 0;
        if (Math.abs(value) < DEADZONE)
            return 0;
        const sign = Math.sign(value);
        return sign * ((Math.abs(value) - DEADZONE) / (1 - DEADZONE));
    }
    /**
     * Returns the analog value (0..1) of the given button index, or 0 if
     * unbound or no gamepad. Useful for triggers (which expose .value).
     */
    getButtonValue(index) {
        if (index < 0)
            return 0;
        return this.activeGamepad?.buttons[index]?.value ?? 0;
    }
    /**
     * Returns the analog values of the left and right triggers (LT, RT) on a
     * standard-mapped gamepad, in [0, 1]. Returns [0, 0] when no gamepad.
     */
    getTriggers() {
        const gp = this.activeGamepad;
        if (!gp)
            return [0, 0];
        return [gp.buttons[6]?.value ?? 0, gp.buttons[7]?.value ?? 0];
    }
    /**
     * Returns true if the given button index had a rising edge this frame.
     * Safe to call from any update order — uses pre-computed edges.
     */
    isButtonJustPressed(buttonIndex) {
        return this._risingEdges[buttonIndex] ?? false;
    }
    _updatePrevButtons(gp) {
        for (let i = 0; i < gp.buttons.length; i++) {
            this._prevButtons[i] = gp.buttons[i]?.pressed ?? false;
        }
    }
    _pollGamepad() {
        const gamepads = navigator.getGamepads?.();
        if (!gamepads)
            return null;
        for (const pad of gamepads) {
            if (pad && pad.connected && pad.mapping === 'standard')
                return pad;
        }
        return null;
    }
    _onDisconnect() {
        if (this.userData.selected) {
            this.callSelectEnd();
        }
        this._prevButtons = [];
        this._captureCallback = null;
        this.activeGamepad = null;
        this.dispatchEvent({ type: 'disconnected', target: this });
    }
}

/**
 * A simple utility class for linearly animating a numeric value over
 * time. It clamps the value within a specified min/max range and updates it
 * based on a given speed.
 */
class AnimatableNumber {
    constructor(value = 0, minValue = 0, maxValue = 1, speed = 1) {
        this.value = value;
        this.minValue = minValue;
        this.maxValue = maxValue;
        this.speed = speed;
    }
    /**
     * Updates the value based on the elapsed time.
     * @param deltaTimeSeconds - The time elapsed since the last update, in
     * seconds.
     */
    update(deltaTimeSeconds) {
        this.value = clamp(this.value + deltaTimeSeconds * this.speed, this.minValue, this.maxValue);
    }
}

/**
 * A threshold for gaze movement speed (in units per second) to determine if the
 * user's gaze is stable. If the reticle moves faster than this, the selection
 * timer resets.
 */
const PRESS_MOVEMENT_THRESHOLD = 0.2;
/**
 * Implements a gaze-based controller for XR interactions.
 * This allows users to select objects by looking at them for a set duration.
 * It functions as a virtual controller that is always aligned with the user's
 * camera (head pose).
 * WebXR Eye Tracking is not yet available. This API simulates a reticle
 * at the center of the field of view for simulating gaze-based interaction.
 */
class GazeController extends Script {
    constructor() {
        super(...arguments);
        /**
         * User data for the controller, including its connection status, unique ID,
         * and selection state.
         */
        this.userData = { connected: false, id: 2, selected: false };
        /**
         * The visual indicator for where the user is looking.
         */
        this.reticle = new Reticle();
        /**
         * The time in seconds the user must gaze at an object to trigger a selection.
         */
        this.activationTimeSeconds = 1.5;
        /**
         * An animatable number that tracks the progress of the gaze selection, from
         * 0.0 to 1.0.
         */
        this.activationAmount = new AnimatableNumber(0.0, 0.0, 1.0, 1.0 / this.activationTimeSeconds);
        /**
         * Stores the reticle's position from the previous frame to calculate movement
         * speed.
         */
        this.lastReticlePosition = new THREE.Vector3();
        /**
         * A clock to measure the time delta between frames for smooth animation and
         * movement calculation.
         */
        this.clock = new THREE.Clock();
    }
    static { this.dependencies = { camera: THREE.Camera }; }
    init({ camera }) {
        this.camera = camera;
    }
    /**
     * The main update loop, called every frame by the core engine.
     * It handles syncing the controller with the camera and manages the gaze
     * selection logic.
     */
    update() {
        super.update();
        this.position.copy(this.camera.position);
        this.quaternion.copy(this.camera.quaternion);
        this.updateMatrixWorld();
        const delta = this.clock.getDelta();
        this.activationAmount.update(delta);
        const movement = this.lastReticlePosition.distanceTo(this.reticle.position) / delta;
        if (movement > PRESS_MOVEMENT_THRESHOLD) {
            this.activationAmount.value = 0.0;
            if (this.userData.selected) {
                this.callSelectEnd();
            }
            this.userData.selected = false;
        }
        if (this.activationAmount.value == 1.0 && !this.userData.selected) {
            this.callSelectStart();
        }
        this.updateReticleScale();
        this.lastReticlePosition.copy(this.reticle.position);
    }
    /**
     * Updates the reticle's scale and shader uniforms to provide visual feedback
     * for gaze activation. The reticle shrinks and fills in as the activation
     * timer progresses.
     */
    updateReticleScale() {
        this.reticle.setPressedAmount(this.activationAmount.value);
    }
    /**
     * Dispatches a 'selectstart' event, signaling that a gaze selection has been
     * initiated.
     */
    callSelectStart() {
        this.dispatchEvent({ type: 'selectstart', target: this });
    }
    /**
     * Dispatches a 'selectend' event, signaling that a gaze selection has been
     * released (e.g., by moving gaze).
     */
    callSelectEnd() {
        this.dispatchEvent({ type: 'selectend', target: this });
    }
    /**
     * Connects the gaze controller to the input system.
     */
    connect() {
        this.dispatchEvent({ type: 'connected', target: this });
    }
    /**
     * Disconnects the gaze controller from the input system.
     */
    disconnect() {
        this.dispatchEvent({ type: 'disconnected', target: this });
    }
}

/**
 * Simulates an XR controller using the mouse for desktop
 * environments. This class translates 2D mouse movements on the screen into a
 * 3D ray in the scene, allowing for point-and-click interactions in a
 * non-immersive context. It functions as a virtual controller that is always
 * aligned with the user's pointer.
 */
class MouseController extends Script {
    static { this.dependencies = {
        camera: THREE.Camera,
    }; }
    constructor() {
        super();
        this.type = 'MouseController';
        this.name = 'Mouse Controller';
        this.editorIcon = 'mouse';
        /**
         * User data for the controller, including its connection status, unique ID,
         * and selection state (mouse button pressed).
         */
        this.userData = { id: 3, connected: false, selected: false };
        /** A THREE.Raycaster used to determine the 3D direction of the mouse. */
        this.raycaster = new THREE.Raycaster();
        /** A normalized vector representing the default forward direction. */
        this.forwardVector = new THREE.Vector3(0, 0, -1);
    }
    /**
     * Initialize the MouseController
     */
    init({ camera }) {
        this.camera = camera;
    }
    /**
     * The main update loop, called every frame.
     * If connected, it syncs the controller's origin point with the camera's
     * position.
     */
    update() {
        super.update();
        if (!this.userData.connected) {
            return;
        }
        this.position.copy(this.camera.position);
    }
    /**
     * Updates the controller's transform based on the mouse's position on the
     * screen. This method sets both the position and rotation, ensuring the
     * object has a valid world matrix for raycasting.
     * @param event - The mouse event containing clientX and clientY coordinates.
     */
    updateMousePositionFromEvent(event) {
        if (this.camera === undefined) {
            return;
        }
        // The controller's origin point is always the camera's position.
        this.position.copy(this.camera.position);
        const mouse = new THREE.Vector2();
        // Converts mouse coordinates from screen space (pixels) to normalized
        // device coordinates (-1 to +1).
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        // Updates the raycaster and sets the controller's new rotation.
        this.raycaster.setFromCamera(mouse, this.camera);
        const rayDirection = this.raycaster.ray.direction;
        this.quaternion.setFromUnitVectors(this.forwardVector, rayDirection);
        this.updateMatrixWorld();
    }
    /**
     * Dispatches a 'selectstart' event, simulating the start of a controller
     * press (e.g., mouse down).
     */
    callSelectStart() {
        this.dispatchEvent({ type: 'selectstart', target: this });
    }
    /**
     * Dispatches a 'selectend' event, simulating the end of a controller press
     * (e.g., mouse up).
     */
    callSelectEnd() {
        this.dispatchEvent({ type: 'selectend', target: this });
    }
    /**
     * "Connects" the virtual controller, notifying the input system that it is
     * active.
     */
    connect() {
        this.dispatchEvent({ type: 'connected', target: this });
    }
    /**
     * "Disconnects" the virtual controller.
     */
    disconnect() {
        this.dispatchEvent({ type: 'disconnected', target: this });
    }
}

class ActiveControllers extends THREE.Group {
    constructor() {
        super(...arguments);
        this.type = 'ActiveControllers';
        this.name = 'Active Controllers';
    }
}
class Reticles extends THREE.Group {
    constructor() {
        super(...arguments);
        this.type = 'Reticles';
        this.name = 'Reticles';
    }
}
// Reusable objects for performance.
const MATRIX4 = new THREE.Matrix4();
/**
 * The XRInput class holds all the controllers and performs raycasts through the
 * scene each frame.
 */
class Input {
    constructor() {
        this.controllers = [];
        this.controllerGrips = [];
        this.hands = [];
        this.raycaster = new Raycaster();
        this.initialized = false;
        this.pivotsEnabled = false;
        this.gazeController = new GazeController();
        this.mouseController = new MouseController();
        this.gamepadController = new GamepadController();
        this.controllersEnabled = true;
        this.listeners = new Map();
        this.intersectionsForController = new Map();
        this.intersections = [];
        this.activeControllers = new ActiveControllers();
        this.reticles = new Reticles();
    }
    /**
     * Initializes an instance with XR controllers, grips, hands, raycaster, and
     * default options. Only called by Core.
     */
    init({ scene, systemsGroup, options, renderer, }) {
        this.scene = scene;
        systemsGroup.add(this.activeControllers, this.reticles);
        this.controllersEnabled = options.controllers.enabled;
        this.options = options;
        const controllers = this.controllers;
        const controllerGrips = this.controllerGrips;
        for (let i = 0; i < NUM_HANDS; ++i) {
            controllers.push(renderer.xr.getController(i));
            controllers[i].userData.id = i;
            this.activeControllers.add(this.controllers[i]);
        }
        controllers.push(this.gazeController);
        controllers.push(this.mouseController);
        this.activeControllers.add(this.mouseController);
        controllers.push(this.gamepadController);
        this.activeControllers.add(this.gamepadController);
        for (const controller of controllers) {
            this.intersectionsForController.set(controller, []);
        }
        if (options.controllers.enabled) {
            if (options.controllers.visualization) {
                const controllerModelFactory = new XRControllerModelFactory();
                for (let i = 0; i < NUM_HANDS; ++i) {
                    controllerGrips.push(renderer.xr.getControllerGrip(i));
                    controllerGrips[i].add(controllerModelFactory.createControllerModel(controllerGrips[i]));
                    this.activeControllers.add(controllerGrips[i]);
                }
            }
            // TODO: Separate logic to XR Hands.
            if (options.hands.enabled) {
                for (let i = 0; i < NUM_HANDS; ++i) {
                    this.hands.push(renderer.xr.getHand(i));
                    this.activeControllers.add(this.hands[i]);
                }
                if (options.hands.visualization) {
                    if (options.hands.visualizeJoints) {
                        console.log('Visualize hand joints.');
                        const handModelFactory = new XRHandModelFactory();
                        for (let i = 0; i < NUM_HANDS; ++i) {
                            const handModel = handModelFactory.createHandModel(this.hands[i], 'boxes');
                            handModel.ignoreReticleRaycast =
                                true;
                            this.hands[i].add(handModel);
                        }
                    }
                    if (options.hands.visualizeMeshes) {
                        console.log('Visualize hand meshes.');
                        const handModelFactory = new XRHandModelFactory();
                        for (let i = 0; i < NUM_HANDS; ++i) {
                            const handModel = handModelFactory.createHandModel(this.hands[i], 'mesh');
                            handModel.ignoreReticleRaycast =
                                true;
                            this.hands[i].add(handModel);
                        }
                    }
                }
            }
        }
        if (options.controllers.visualizeRays) {
            for (let i = 0; i < NUM_HANDS; ++i) {
                controllers[i].add(new ControllerRayVisual());
            }
        }
        this.bindSelectStart(this.defaultOnSelectStart.bind(this));
        this.bindSelectEnd(this.defaultOnSelectEnd.bind(this));
        this.bindSqueezeStart(this.defaultOnSelectStart.bind(this));
        this.bindSqueezeEnd(this.defaultOnSelectEnd.bind(this));
        this.bindListener('connected', this.defaultOnConnected.bind(this));
        this.bindListener('disconnected', this.defaultOnDisconnected.bind(this));
    }
    /**
     * Retrieves the controller object by its ID.
     * @param id - The ID of the controller.
     * @returns The controller with the specified ID.
     */
    get(id) {
        return this.controllers[id];
    }
    /**
     * Adds an object to both controllers by creating a new group and cloning it.
     * @param obj - The object to add to each controller.
     */
    addObject(obj) {
        const group = new THREE.Group();
        group.add(obj);
        // Clones the group for each controller, adding it to the controller.
        for (let i = 0; i < this.controllers.length; ++i) {
            this.controllers[i].add(group.clone());
        }
    }
    /**
     * Creates a pivot point for each hand, primarily used as a reference
     * point.
     */
    enablePivots() {
        if (this.pivotsEnabled)
            return;
        this.pivotsEnabled = true;
        const pivot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.01, 3));
        pivot.name = 'pivot';
        pivot.position.z = -0.05;
        this.addObject(pivot);
    }
    /**
     * Adds reticles to the controllers and scene, with initial visibility set to
     * false.
     */
    addReticles() {
        let id = 0;
        for (const controller of this.controllers) {
            if (controller.reticle == null) {
                controller.reticle = new Reticle();
                controller.reticle.name = 'Reticle ' + id;
                ++id;
            }
            controller.reticle.visible = false;
            this.reticles.add(controller.reticle);
        }
    }
    /**
     * Default action to handle the start of a selection, setting the selecting
     * state to true.
     */
    defaultOnSelectStart(event) {
        const controller = event.target;
        controller.userData.selected = true;
        this.setRaycasterFromController(controller);
        this.performRaycastOnScene(controller);
    }
    /**
     * Default action to handle the end of a selection, setting the selecting
     * state to false.
     */
    defaultOnSelectEnd(event) {
        const controller = event.target;
        controller.userData.selected = false;
    }
    defaultOnSqueezeStart(event) {
        const controller = event.target;
        controller.userData.squeezing = true;
    }
    defaultOnSqueezeEnd(event) {
        const controller = event.target;
        controller.userData.squeezing = false;
    }
    defaultOnConnected(event) {
        const controller = event.target;
        controller.userData.connected = true;
        controller.gamepad = event.data?.gamepad;
        controller.inputSource = event.data;
        switch (event.data?.handedness) {
            case 'left':
                this.leftController = controller;
                break;
            case 'right':
                this.rightController = controller;
                break;
        }
    }
    defaultOnDisconnected(event) {
        const controller = event.target;
        controller.userData.connected = false;
        if (controller.reticle) {
            controller.reticle.visible = false;
        }
        delete controller?.gamepad;
        switch (event.data?.handedness) {
            case 'left':
                this.leftController = undefined;
                break;
            case 'right':
                this.rightController = undefined;
                break;
        }
    }
    /**
     * Binds a listener to both controllers.
     * @param listenerName - Event name
     * @param listener - Function to call
     */
    bindListener(listenerName, listener) {
        for (const controller of this.controllers) {
            controller.addEventListener(listenerName, listener);
        }
        if (!this.listeners.has(listenerName)) {
            this.listeners.set(listenerName, []);
        }
        this.listeners.get(listenerName).push(listener);
    }
    unbindListener(listenerName, listener) {
        if (this.listeners.has(listenerName)) {
            const listeners = this.listeners.get(listenerName);
            const index = listeners.indexOf(listener);
            if (index !== -1) {
                listeners.splice(index, 1);
            }
        }
        for (const controller of this.controllers) {
            controller.removeEventListener(listenerName, listener);
        }
    }
    dispatchEvent(event) {
        if (this.listeners.has(event.type)) {
            for (const listener of this.listeners.get(event.type)) {
                listener(event);
            }
        }
    }
    /**
     * Binds an event listener to handle 'selectstart' events for both
     * controllers.
     * @param event - The event listener function.
     */
    bindSelectStart(event) {
        this.bindListener('selectstart', event);
    }
    /**
     * Binds an event listener to handle 'selectend' events for both controllers.
     * @param event - The event listener function.
     */
    bindSelectEnd(event) {
        this.bindListener('selectend', event);
    }
    /**
     * Binds an event listener to handle 'select' events for both controllers.
     * @param event - The event listener function.
     */
    bindSelect(event) {
        this.bindListener('select', event);
    }
    /**
     * Binds an event listener to handle 'squeezestart' events for both
     * controllers.
     * @param event - The event listener function.
     */
    bindSqueezeStart(event) {
        this.bindListener('squeezestart', event);
    }
    /**
     * Binds an event listener to handle 'squeezeend' events for both controllers.
     * @param event - The event listener function.
     */
    bindSqueezeEnd(event) {
        this.bindListener('squeezeend', event);
    }
    bindSqueeze(event) {
        this.bindListener('squeeze', event);
    }
    bindKeyDown(event) {
        window.addEventListener('keydown', event);
    }
    bindKeyUp(event) {
        window.addEventListener('keyup', event);
    }
    unbindKeyDown(event) {
        window.removeEventListener('keydown', event);
    }
    unbindKeyUp(event) {
        window.removeEventListener('keyup', event);
    }
    /**
     * Finds intersections between a controller's ray and a specified object.
     * @param controller - The controller casting the ray.
     * @param obj - The object to intersect.
     * @returns Array of intersection points, if any.
     */
    intersectObjectByController(controller, obj) {
        controller.updateMatrixWorld();
        this.setRaycasterFromController(controller);
        return this.raycaster.intersectObject(obj, false);
    }
    /**
     * Finds intersections based on an event's target controller and a specified
     * object.
     * @param event - The event containing the controller reference.
     * @param obj - The object to intersect.
     * @returns Array of intersection points, if any.
     */
    intersectObjectByEvent(event, obj) {
        return this.intersectObjectByController(event.target, obj);
    }
    /**
     * Finds intersections with an object from either controller.
     * @param obj - The object to intersect.
     * @returns Array of intersection points, if any.
     */
    intersectObject(obj) {
        // Checks for intersections from the first controller.
        const intersection = this.intersectObjectByController(this.controllers[0], obj);
        if (intersection.length > 0) {
            return intersection;
        }
        // Checks for intersections from the second controller if no intersection
        // found.
        return this.intersectObjectByController(this.controllers[1], obj);
    }
    update() {
        if (this.controllersEnabled) {
            for (const controller of this.controllers) {
                this.updateController(controller);
            }
        }
    }
    updateController(controller) {
        if (controller.userData.connected === false) {
            return;
        }
        controller.updateMatrixWorld();
        if (this.options.controllers.performRaycastOnUpdate) {
            this.setRaycasterFromController(controller);
            this.performRaycastOnScene(controller);
            this.updateReticleFromIntersections(controller);
        }
    }
    /**
     * Sets the raycaster's origin and direction from any Object3D that
     * represents a controller. This replaces the non-standard
     * `setFromXRController`.
     * @param controller - The controller to cast a ray from.
     */
    setRaycasterFromController(controller) {
        controller.getWorldPosition(this.raycaster.ray.origin);
        MATRIX4.identity().extractRotation(controller.matrixWorld);
        this.raycaster.ray.direction
            .set(0, 0, -1)
            .applyMatrix4(MATRIX4)
            .normalize();
    }
    updateReticleFromIntersections(controller) {
        if (!controller.reticle)
            return;
        const reticle = controller.reticle;
        const intersection = this.intersectionsForController
            .get(controller)
            ?.find((intersection) => {
            let target = intersection.object;
            while (target) {
                if (target.ignoreReticleRaycast ===
                    true) {
                    return false;
                }
                target = target.parent;
            }
            return true;
        });
        if (!intersection) {
            const fallback = this.options.reticles.defaultDistance;
            if (fallback > 0) {
                reticle.visible = true;
                reticle.position
                    .copy(this.raycaster.ray.origin)
                    .addScaledVector(this.raycaster.ray.direction, fallback);
                reticle.quaternion.identity();
            }
            else {
                reticle.visible = false;
            }
            return;
        }
        reticle.visible = true;
        // Here isXRScript is semantically equals to isInteractable.
        if (intersection.object?.isXRScript) {
            intersection.object.ux.update(controller, intersection);
        }
        else if (intersection.object?.parent?.isXRScript) {
            intersection.object.parent.ux.update(controller, intersection);
        }
        reticle.intersection = intersection;
        reticle.direction.copy(this.raycaster.ray.direction).normalize();
        reticle.setPoseFromIntersection(intersection);
        reticle.setPressed(controller.userData.selected);
    }
    enableGazeController() {
        this.activeControllers.add(this.gazeController);
        this.gazeController.connect();
    }
    disableGazeController() {
        this.gazeController.disconnect();
        this.activeControllers.remove(this.gazeController);
    }
    disableControllers() {
        this.controllersEnabled = false;
        for (const controller of this.controllers) {
            controller.userData.selected = false;
            if (controller.reticle) {
                controller.reticle.visible = false;
                controller.reticle.targetObject = undefined;
            }
        }
    }
    enableControllers() {
        this.controllersEnabled = true;
    }
    // Performs the raycast assuming the raycaster is already set up.
    performRaycastOnScene(controller) {
        if (!this.scene)
            return;
        if (!this.intersectionsForController.has(controller)) {
            this.intersectionsForController.set(controller, []);
        }
        const intersections = this.intersectionsForController.get(controller);
        intersections.length = 0;
        this.raycaster.intersectObject(this.scene, true, intersections);
    }
}

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
function objectIsDescendantOf(child, parent) {
    // Starts the search from the child object.
    let currentNode = child;
    // Traverses up the scene graph hierarchy until we reach the top (null parent)
    // or find the target parent.
    while (currentNode) {
        // If the current node is the parent we're looking for, we've found a match.
        if (currentNode === parent) {
            return true;
        }
        // Moves up to the next level in the hierarchy.
        currentNode = currentNode.parent;
    }
    // If we reach the top of the hierarchy without finding the parent,
    // it is not an ancestor.
    return false;
}
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
function traverseUtil(node, callback) {
    if (callback(node)) {
        return true;
    }
    for (const child of node.children) {
        if (traverseUtil(child, callback)) {
            return true;
        }
    }
    return false;
}

const tempBox = new THREE.Box3();
/**
 * User is an embodied instance to manage hands, controllers, speech, and
 * avatars. It extends Script to update human-world interaction.
 *
 * In the long run, User is to manages avatars, hands, and everything of Human
 * I/O. In third-person view simulation, it should come with an low-poly avatar.
 * To support multi-user social XR planned for future iterations.
 */
class User extends Script {
    static { this.dependencies = {
        input: Input,
        scene: THREE.Scene,
    }; }
    /**
     * Constructs a new User.
     */
    constructor() {
        super();
        /**
         * Whether to represent a local user, or another user in a multi-user session.
         */
        this.local = true;
        /**
         * The number of hands associated with the XR user.
         */
        this.numHands = 2;
        /**
         * The height of the user in meters.
         */
        this.height = 1.6;
        /**
         * The default distance of a UI panel from the user in meters.
         */
        this.panelDistance = 1.75;
        /**
         * The handedness (primary hand) of the user (0 for left, 1 for right, 2 for
         * both).
         */
        this.handedness = 1;
        /**
         * The radius of the safe space around the user in meters.
         */
        this.safeSpaceRadius = 0.2;
        /**
         * The distance of a newly spawned object from the user in meters.
         */
        this.objectDistance = 1.5;
        /**
         * The angle of a newly spawned object from the user in radians.
         */
        this.objectAngle = (-18 / 180.0) * Math.PI;
        /**
         * An array of pivot objects. Pivot are sphere at the **starting** tip of
         * user's hand / controller / mouse rays for debugging / drawing applications.
         */
        this.pivots = [];
        /**
         * Maps a controller to the object it is currently hovering over.
         */
        this.hoveredObjectsForController = new Map();
        /**
         * Maps a controller to the object it has currently selected.
         */
        this.selectedObjectsForController = new Map();
        /**
         * Maps a hand index (0 or 1) to a set of meshes it is currently touching.
         */
        this.touchedObjects = new Map();
        /**
         * Maps a hand index to another map that associates a grabbed mesh with its
         * initial grab event data.
         */
        this.grabbedObjects = new Map();
    }
    /**
     * Initializes the User.
     */
    init({ input, scene }) {
        this.input = input;
        this.controllers = input.controllers;
        this.scene = scene;
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
        return this.controllers[id].getObjectByName('pivot');
    }
    /**
     * Gets the world position of the pivot for a given controller id.
     * @param id - The controller id.
     * @returns The world position of the pivot.
     */
    getPivotPosition(id) {
        return this.getPivot(id)?.getWorldPosition(new THREE.Vector3());
    }
    /**
     * Gets reticle's direction in THREE.Vector3.
     * Requires reticle enabled to be called.
     * @param controllerId -
     */
    getReticleDirection(controllerId) {
        return this.controllers[controllerId].reticle?.direction;
    }
    /**
     * Gets the object targeted by the reticle.
     * Requires `options.reticle.enabled`.
     * @param id - The controller id.
     * @returns The targeted object, or null.
     */
    getReticleTarget(id) {
        return this.controllers[id].reticle?.targetObject;
    }
    /**
     * Gets the intersection details from the reticle's raycast.
     * Requires `options.reticle.enabled`.
     * @param id - The controller id.
     * @returns The intersection object, or null if no intersection.
     */
    getReticleIntersection(id) {
        return this.controllers[id].reticle?.intersection;
    }
    /**
     * Checks if any controller is pointing at the given object or its children.
     * @param obj - The object to check against.
     * @returns True if a controller is pointing at the object.
     */
    isPointingAt(obj) {
        for (const selected of this.hoveredObjectsForController.values()) {
            if (objectIsDescendantOf(selected, obj)) {
                return true;
            }
        }
        return false;
    }
    /**
     * Checks if any controller is selecting the given object or its children.
     * @param obj - The object to check against.
     * @returns True if a controller is selecting the object.
     */
    isSelectingAt(obj) {
        for (const selected of this.selectedObjectsForController.values()) {
            if (objectIsDescendantOf(selected, obj)) {
                return true;
            }
        }
        return false;
    }
    /**
     * Gets the intersection point on a specific object.
     * Not recommended for general use, since a View / ModelView's
     * ux.positions contains the intersected points.
     * @param obj - The object to check for intersection.
     * @param id - The controller ID, or -1 for any controller.
     * @returns The intersection details, or null if no intersection.
     */
    getIntersectionAt(obj, id = -1) {
        if (id == -1) {
            for (let i = 0; i < 2; ++i) {
                if (this.getReticleTarget(i) === obj) {
                    return this.getReticleIntersection(i);
                }
            }
        }
        else {
            if (this.getReticleTarget(id) === obj) {
                return this.getReticleIntersection(id);
            }
        }
        return null;
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
        if (id == -1) {
            return this.input.controllers.some((controller) => {
                return controller.userData.selected;
            });
        }
        return this.input.controllers[id].userData.selected;
    }
    /**
     * Checks if either controller is squeezing.
     * @param id - The controller id. If -1, check both controllers.
     * @returns True if squeezing, false otherwise.
     */
    isSqueezing(id = -1) {
        if (id == -1) {
            return this.input.controllers.some((controller) => {
                return controller.userData.squeezing;
            });
        }
        return this.input.controllers[id].userData.squeezing;
    }
    /**
     * Handles the select start event for a controller.
     * @param event - The event object.
     */
    onSelectStart(event) {
        const controller = event.target;
        const intersections = this.input.intersectionsForController
            .get(controller)
            .filter((intersection) => {
            let target = intersection.object;
            while (target) {
                if (target.ignoreReticleRaycast ===
                    true) {
                    return false;
                }
                target = target.parent;
            }
            return true;
        });
        if (intersections && intersections.length > 0) {
            this.selectedObjectsForController.set(controller, intersections[0].object);
            this.callObjectSelectStart(event, intersections[0].object);
        }
    }
    /**
     * Handles the select end event for a controller.
     * @param event - The event object.
     */
    onSelectEnd(event) {
        const controller = event.target;
        const intersections = this.input.intersectionsForController.get(controller);
        if (intersections && intersections.length > 0) {
            const selectedObject = this.selectedObjectsForController.get(controller);
            this.callObjectSelectEnd(event, selectedObject || null);
            this.selectedObjectsForController.delete(controller);
            let ancestor = selectedObject || null;
            while (ancestor) {
                if (ancestor.isView && ancestor.visible) {
                    ancestor.onTriggered(controller.userData.id);
                    break;
                }
                ancestor = ancestor.parent;
            }
        }
    }
    /**
     * Handles the squeeze start event for a controller.
     * @param _event - The event object.
     */
    onSqueezeStart(_event) { }
    /**
     * Handles the squeeze end event for a controller.
     * @param _event - The event object.
     */
    onSqueezeEnd(_event) { }
    /**
     * The main update loop called each frame. Updates hover state for all
     * controllers.
     */
    update() {
        if (this.input.controllersEnabled) {
            for (const controller of this.input.controllers) {
                this.updateForController(controller);
            }
        }
        // Direct touch detection.
        this.updateTouchState();
        // Direct grab detection.
        this.updateGrabState();
    }
    /**
     * Checks for and handles grab events (touching + pinching).
     */
    updateGrabState() {
        if (!this.hands) {
            return;
        }
        for (let i = 0; i < this.numHands; i++) {
            const isPinching = this.isSelecting(i);
            const touchedMeshes = this.touchedObjects.get(i) || new Set();
            const currentlyGrabbedMeshes = isPinching
                ? touchedMeshes
                : new Set();
            const previouslyGrabbedMeshesMap = this.grabbedObjects.get(i) || new Map();
            const newlyGrabbedMeshes = [...currentlyGrabbedMeshes].filter((mesh) => !previouslyGrabbedMeshesMap.has(mesh));
            const releasedMeshes = [...previouslyGrabbedMeshesMap.keys()].filter((mesh) => !currentlyGrabbedMeshes.has(mesh));
            for (const mesh of newlyGrabbedMeshes) {
                const hand = this.hands.getWrist(i);
                if (!hand)
                    continue;
                const grabEvent = { handIndex: i, hand: hand };
                if (!this.grabbedObjects.has(i)) {
                    this.grabbedObjects.set(i, new Map());
                }
                this.grabbedObjects.get(i).set(mesh, grabEvent);
                this.callObjectGrabStart(grabEvent, mesh);
            }
            for (const mesh of releasedMeshes) {
                const grabEvent = previouslyGrabbedMeshesMap.get(mesh);
                this.callObjectGrabEnd(grabEvent, mesh);
                previouslyGrabbedMeshesMap.delete(mesh);
            }
            for (const mesh of currentlyGrabbedMeshes) {
                if (previouslyGrabbedMeshesMap.has(mesh)) {
                    const grabEvent = previouslyGrabbedMeshesMap.get(mesh);
                    this.callObjectGrabbing(grabEvent, mesh);
                }
            }
        }
    }
    /**
     * Checks for and handles touch events for the hands' index fingers.
     */
    updateTouchState() {
        if (!this.hands) {
            return;
        }
        for (let i = 0; i < this.numHands; i++) {
            const indexTip = this.hands.getIndexTip(i);
            if (!indexTip) {
                continue;
            }
            const indexTipPosition = new THREE.Vector3();
            indexTip.getWorldPosition(indexTipPosition);
            const currentlyTouchedMeshes = [];
            this.scene.traverse((object) => {
                if (object.isMesh && object.visible) {
                    try {
                        tempBox.setFromObject(object);
                    }
                    catch (_) {
                        return;
                    }
                    if (tempBox.containsPoint(indexTipPosition)) {
                        currentlyTouchedMeshes.push(object);
                    }
                }
            });
            const previouslyTouchedMeshes = this.touchedObjects.get(i) || new Set();
            const currentMeshesSet = new Set(currentlyTouchedMeshes);
            const newlyTouchedMeshes = currentlyTouchedMeshes.filter((mesh) => !previouslyTouchedMeshes.has(mesh));
            const removedMeshes = [...previouslyTouchedMeshes].filter((mesh) => !currentMeshesSet.has(mesh));
            const touchingEvent = { handIndex: i, touchPosition: indexTipPosition };
            if (newlyTouchedMeshes.length > 0) {
                for (const mesh of newlyTouchedMeshes) {
                    this.callObjectTouchStart(touchingEvent, mesh);
                }
            }
            if (removedMeshes.length > 0) {
                for (const mesh of removedMeshes) {
                    this.callObjectTouchEnd(touchingEvent, mesh);
                }
            }
            for (const mesh of currentMeshesSet) {
                this.callObjectTouching(touchingEvent, mesh);
            }
            if (currentMeshesSet.size > 0) {
                this.touchedObjects.set(i, currentMeshesSet);
            }
            else {
                this.touchedObjects.delete(i);
            }
        }
    }
    /**
     * Updates the hover state for a single controller.
     * @param controller - The controller to update.
     */
    updateForController(controller) {
        const intersections = this.input.intersectionsForController.get(controller);
        const currentHoverTarget = intersections.length > 0 ? intersections[0].object : null;
        const previousHoverTarget = this.hoveredObjectsForController.get(controller);
        if (previousHoverTarget !== currentHoverTarget) {
            this.callHoverExit(controller, previousHoverTarget || null);
            this.hoveredObjectsForController.set(controller, currentHoverTarget);
            this.callHoverEnter(controller, currentHoverTarget);
        }
        else if (previousHoverTarget) {
            this.callOnHovering(controller, previousHoverTarget);
        }
    }
    /**
     * Recursively calls onHoverExit on a target and its ancestors.
     * @param controller - The controller exiting hover.
     * @param target - The object being exited.
     */
    callHoverExit(controller, target) {
        if (target == null)
            return;
        if (target.isXRScript &&
            target.onHoverExit(controller)) {
            // The event was handled already so do not propagate up.
            return;
        }
        this.callHoverExit(controller, target.parent);
    }
    /**
     * Recursively calls onHoverEnter on a target and its ancestors.
     * @param controller - The controller entering hover.
     * @param target - The object being entered.
     */
    callHoverEnter(controller, target) {
        if (target == null)
            return;
        if (target.isXRScript &&
            target.onHoverEnter(controller)) {
            // The event was handled already so do not propagate up.
            return;
        }
        this.callHoverEnter(controller, target.parent);
    }
    /**
     * Recursively calls onHovering on a target and its ancestors.
     * @param controller - The controller hovering.
     * @param target - The object being entered.
     */
    callOnHovering(controller, target) {
        if (target == null)
            return;
        if (target.isXRScript &&
            target.onHovering(controller)) {
            // The event was handled already so do not propagate up.
            return;
        }
        this.callOnHovering(controller, target.parent);
    }
    /**
     * Recursively calls onObjectSelectStart on a target and its ancestors until
     * the event is handled.
     * @param event - The original select start event.
     * @param target - The object being selected.
     */
    callObjectSelectStart(event, target) {
        if (target == null)
            return;
        if (target.isXRScript &&
            target.onObjectSelectStart(event)) {
            // The event was handled already so do not propagate up.
            return;
        }
        this.callObjectSelectStart(event, target.parent);
    }
    /**
     * Recursively calls onObjectSelectEnd on a target and its ancestors until
     * the event is handled.
     * @param event - The original select end event.
     * @param target - The object being un-selected.
     */
    callObjectSelectEnd(event, target) {
        if (target == null)
            return;
        if (target.isXRScript &&
            target.onObjectSelectEnd(event)) {
            // The event was handled already so do not propagate up.
            return;
        }
        this.callObjectSelectEnd(event, target.parent);
    }
    /**
     * Recursively calls onObjectTouchStart on a target and its ancestors.
     * @param event - The original touch start event.
     * @param target - The object being touched.
     */
    callObjectTouchStart(event, target) {
        if (target == null)
            return;
        if (target.isXRScript) {
            target.onObjectTouchStart(event);
        }
        this.callObjectTouchStart(event, target.parent);
    }
    /**
     * Recursively calls onObjectTouching on a target and its ancestors.
     * @param event - The original touch event.
     * @param target - The object being touched.
     */
    callObjectTouching(event, target) {
        if (target == null)
            return;
        if (target.isXRScript) {
            target.onObjectTouching(event);
        }
        this.callObjectTouching(event, target.parent);
    }
    /**
     * Recursively calls onObjectTouchEnd on a target and its ancestors.
     * @param event - The original touch end event.
     * @param target - The object being un-touched.
     */
    callObjectTouchEnd(event, target) {
        if (target == null)
            return;
        if (target.isXRScript) {
            target.onObjectTouchEnd(event);
        }
        this.callObjectTouchEnd(event, target.parent);
    }
    /**
     * Recursively calls onObjectGrabStart on a target and its ancestors.
     * @param event - The original grab start event.
     * @param target - The object being grabbed.
     */
    callObjectGrabStart(event, target) {
        if (target == null)
            return;
        if (target.isXRScript) {
            target.onObjectGrabStart(event);
        }
        this.callObjectGrabStart(event, target.parent);
    }
    /**
     * Recursively calls onObjectGrabbing on a target and its ancestors.
     * @param event - The original grabbing event.
     * @param target - The object being grabbed.
     */
    callObjectGrabbing(event, target) {
        if (target == null)
            return;
        if (target.isXRScript) {
            target.onObjectGrabbing(event);
        }
        this.callObjectGrabbing(event, target.parent);
    }
    /**
     * Recursively calls onObjectGrabEnd on a target and its ancestors.
     * @param event - The original grab end event.
     * @param target - The object being released.
     */
    callObjectGrabEnd(event, target) {
        if (target == null)
            return;
        if (target.isXRScript) {
            target.onObjectGrabEnd(event);
        }
        this.callObjectGrabEnd(event, target.parent);
    }
    /**
     * Checks if a controller is selecting a specific object. Returns the
     * intersection details if true.
     * @param obj - The object to check for selection.
     * @param controller - The controller performing the select.
     * @returns The intersection object if a match is found, else null.
     */
    select(obj, controller) {
        const intersections = this.input.intersectionsForController.get(controller);
        return intersections &&
            intersections.length > 0 &&
            objectIsDescendantOf(intersections[0].object, obj)
            ? intersections[0]
            : null;
    }
}

class GestureRecognitionOptions {
    constructor(options) {
        /** Master switch for the gesture recognition block. */
        this.enabled = false;
        /**
         * Backing provider that extracts gesture information.
         *  - 'heuristics': WebXR joint heuristics only (no external ML dependency).
         *  - 'mediapipe': MediaPipe Hands running via Web APIs / wasm.
         *  - 'tfjs': TensorFlow.js hand-pose-detection models.
         */
        this.provider = 'heuristics';
        /**
         * Minimum confidence score to emit gesture events. Different providers map to
         * different score domains so this value is normalised to [0-1].
         */
        this.minimumConfidence = 0.6;
        /**
         * Optional throttle window for expensive providers.
         */
        this.updateIntervalMs = 33;
        /**
         * Default gesture catalogue.
         */
        this.gestures = {
            pinch: { enabled: true, threshold: 0.025 },
            'open-palm': { enabled: true },
            fist: { enabled: true },
            'thumbs-up': { enabled: true },
            point: { enabled: false },
            spread: { enabled: false, threshold: 0.04 },
        };
        deepMerge(this, options);
        if (options?.gestures) {
            for (const [name, config] of Object.entries(options.gestures)) {
                const gestureName = name;
                this.gestures[gestureName] = deepMerge({ ...this.gestures[gestureName] }, config);
            }
        }
    }
    enable() {
        this.enabled = true;
        return this;
    }
    /**
     * Convenience helper to toggle specific gestures.
     */
    setGestureEnabled(name, enabled) {
        this.gestures[name] ??= { enabled };
        this.gestures[name].enabled = enabled;
        return this;
    }
}

const EPSILON = 1e-6;
const FINGER_ORDER = ['index', 'middle', 'ring', 'pinky'];
const FINGER_PREFIX = {
    index: 'index-finger',
    middle: 'middle-finger',
    ring: 'ring-finger',
    pinky: 'pinky-finger',
};
const heuristicDetectors = {
    pinch: computePinch,
    'open-palm': computeOpenPalm,
    fist: computeFist,
    'thumbs-up': computeThumbsUp,
    point: computePoint,
    spread: computeSpread,
};
function computePinch(context, config) {
    const thumb = getJoint(context, 'thumb-tip');
    const index = getJoint(context, 'index-finger-tip');
    if (!thumb || !index)
        return undefined;
    const supportMetrics = ['middle', 'ring', 'pinky']
        .map((finger) => computeFingerMetric(context, finger))
        .filter(Boolean);
    const supportCurl = supportMetrics.length > 0
        ? average(supportMetrics.map((metrics) => metrics.curlRatio))
        : 1;
    const supportPenalty = clamp01((supportCurl - 1.05) / 0.35);
    const handScale = estimateHandScale(context);
    const threshold = config.threshold ?? Math.max(0.018, handScale * 0.35);
    const distance = thumb.distanceTo(index);
    if (!Number.isFinite(distance) || distance < EPSILON) {
        return { confidence: 0 };
    }
    const tightness = clamp01(1 - distance / (threshold * 0.85));
    const loosePenalty = clamp01(1 - distance / (threshold * 1.4));
    let confidence = clamp01(distance <= threshold ? tightness : loosePenalty * 0.4);
    confidence *= 1 - supportPenalty * 0.45;
    confidence = clamp01(confidence);
    return {
        confidence,
        data: { distance, threshold, supportPenalty },
    };
}
function computeOpenPalm(context, config) {
    const fingerMetrics = getFingerMetrics(context);
    if (!fingerMetrics.length)
        return undefined;
    const handScale = estimateHandScale(context);
    const palmWidth = getPalmWidth(context) ?? handScale * 0.85;
    const palmUp = getPalmUp(context);
    const extensionScores = fingerMetrics.map(({ tipDistance }) => clamp01((tipDistance - handScale * 0.5) / (handScale * 0.45)));
    const straightnessScores = fingerMetrics.map(({ curlRatio }) => clamp01((curlRatio - 1.1) / 0.5));
    const orientationScore = palmUp && fingerMetrics.length
        ? average(fingerMetrics.map((metrics) => fingerAlignmentScore(context, metrics, palmUp)))
        : 0.5;
    const neighbors = getAdjacentFingerDistances(context);
    const spreadScore = neighbors.average !== Infinity && palmWidth > EPSILON
        ? clamp01((neighbors.average - palmWidth * 0.55) / (palmWidth * 0.35))
        : 0;
    const extensionScore = average(extensionScores);
    const straightScore = average(straightnessScores);
    const confidence = clamp01(extensionScore * 0.4 +
        straightScore * 0.25 +
        spreadScore * 0.2 +
        orientationScore * 0.15);
    return {
        confidence,
        data: {
            extensionScore,
            straightScore,
            spreadScore,
            orientationScore,
            threshold: config.threshold,
        },
    };
}
function computeFist(context, config) {
    const fingerMetrics = getFingerMetrics(context);
    if (!fingerMetrics.length)
        return undefined;
    const handScale = estimateHandScale(context);
    const palmWidth = getPalmWidth(context) ?? handScale * 0.85;
    const tipAverage = average(fingerMetrics.map((metrics) => metrics.tipDistance));
    const curlAverage = average(fingerMetrics.map((metrics) => metrics.curlRatio));
    const neighbors = getAdjacentFingerDistances(context);
    const clusterScore = neighbors.average !== Infinity && palmWidth > EPSILON
        ? clamp01((palmWidth * 0.5 - neighbors.average) / (palmWidth * 0.35))
        : 0;
    const thumbTip = getJoint(context, 'thumb-tip');
    const indexBase = getFingerJoint(context, 'index', 'phalanx-proximal') ??
        getFingerJoint(context, 'index', 'metacarpal');
    const thumbWrapScore = thumbTip && indexBase && palmWidth > EPSILON
        ? clamp01((palmWidth * 0.55 - thumbTip.distanceTo(indexBase)) /
            (palmWidth * 0.35))
        : 0;
    const tipScore = clamp01((handScale * 0.55 - tipAverage) / (handScale * 0.25));
    const curlScore = clamp01((1.08 - curlAverage) / 0.25);
    const confidence = clamp01(tipScore * 0.45 +
        curlScore * 0.3 +
        clusterScore * 0.1 +
        thumbWrapScore * 0.15);
    return {
        confidence,
        data: {
            tipAverage,
            curlAverage,
            clusterScore,
            thumbWrapScore,
            threshold: config.threshold,
        },
    };
}
function computeThumbsUp(context, config) {
    const thumbMetrics = getThumbMetrics(context);
    const fingerMetrics = getFingerMetrics(context);
    if (!thumbMetrics || fingerMetrics.length < 2)
        return undefined;
    const handScale = estimateHandScale(context);
    const palmWidth = getPalmWidth(context) ?? handScale * 0.85;
    const palmUp = getPalmUp(context);
    const otherCurls = fingerMetrics.map((m) => m.curlRatio);
    const curledScore = clamp01((1.05 - average(otherCurls)) / 0.25);
    const thumbReachRatio = thumbMetrics.referenceDistance > EPSILON
        ? thumbMetrics.tipDistance / thumbMetrics.referenceDistance
        : 0;
    const thumbExtendedScore = clamp01((thumbReachRatio - 1.15) / 0.5);
    const indexTip = getJoint(context, 'index-finger-tip');
    const thumbIndexDistance = indexTip
        ? thumbMetrics.tip.distanceTo(indexTip)
        : 0;
    const separationScore = palmWidth > EPSILON
        ? clamp01((thumbIndexDistance - palmWidth * 0.4) / (palmWidth * 0.25))
        : 0;
    let orientationScore = 0;
    if (palmUp) {
        const thumbVector = new THREE.Vector3()
            .copy(thumbMetrics.tip)
            .sub(thumbMetrics.metacarpal ?? thumbMetrics.tip);
        if (thumbVector.lengthSq() > EPSILON) {
            thumbVector.normalize();
            const alignment = thumbVector.dot(palmUp);
            orientationScore = clamp01((alignment - 0.35) / 0.35);
        }
    }
    const confidence = clamp01(thumbExtendedScore * 0.3 +
        curledScore * 0.35 +
        orientationScore * 0.2 +
        separationScore * 0.15);
    return {
        confidence,
        data: {
            thumbReachRatio,
            curledScore,
            orientationScore,
            separationScore,
            threshold: config.threshold,
        },
    };
}
function computePoint(context, config) {
    const indexMetrics = computeFingerMetric(context, 'index');
    if (!indexMetrics)
        return undefined;
    const otherMetrics = FINGER_ORDER.slice(1)
        .map((finger) => computeFingerMetric(context, finger))
        .filter(Boolean);
    if (!otherMetrics.length)
        return undefined;
    const handScale = estimateHandScale(context);
    const palmWidth = getPalmWidth(context) ?? handScale * 0.85;
    const palmUp = getPalmUp(context);
    const indexCurlScore = clamp01((indexMetrics.curlRatio - 1.2) / 0.35);
    const indexReachScore = clamp01((indexMetrics.tipDistance - handScale * 0.6) / (handScale * 0.25));
    const indexDirectionScore = palmUp && indexMetrics
        ? fingerAlignmentScore(context, indexMetrics, palmUp)
        : 0.4;
    const othersCurl = average(otherMetrics.map((metrics) => metrics.curlRatio));
    const othersCurledScore = clamp01((1.05 - othersCurl) / 0.25);
    const thumbTip = getJoint(context, 'thumb-tip');
    const thumbTuckedScore = thumbTip && indexMetrics.metacarpal && palmWidth > EPSILON
        ? clamp01((palmWidth * 0.75 - thumbTip.distanceTo(indexMetrics.metacarpal)) /
            (palmWidth * 0.4))
        : 0.5;
    const confidence = clamp01(indexCurlScore * 0.35 +
        indexReachScore * 0.25 +
        othersCurledScore * 0.2 +
        indexDirectionScore * 0.1 +
        thumbTuckedScore * 0.1);
    return {
        confidence,
        data: {
            indexCurlScore,
            indexReachScore,
            othersCurledScore,
            indexDirectionScore,
            thumbTuckedScore,
            threshold: config.threshold,
        },
    };
}
function computeSpread(context, config) {
    const fingerMetrics = getFingerMetrics(context);
    if (!fingerMetrics.length)
        return undefined;
    const handScale = estimateHandScale(context);
    const palmWidth = getPalmWidth(context) ?? handScale * 0.85;
    const neighbors = getAdjacentFingerDistances(context);
    const palmUp = getPalmUp(context);
    const spreadScore = neighbors.average !== Infinity && palmWidth > EPSILON
        ? clamp01((neighbors.average - palmWidth * 0.6) / (palmWidth * 0.35))
        : 0;
    const extensionScore = clamp01((average(fingerMetrics.map((metrics) => metrics.curlRatio)) - 1.15) / 0.45);
    const orientationScore = palmUp && fingerMetrics.length
        ? average(fingerMetrics.map((metrics) => fingerAlignmentScore(context, metrics, palmUp)))
        : 0.5;
    const confidence = clamp01(spreadScore * 0.55 + extensionScore * 0.3 + orientationScore * 0.15);
    return {
        confidence,
        data: {
            spreadScore,
            extensionScore,
            orientationScore,
            threshold: config.threshold,
        },
    };
}
function computeFingerMetric(context, finger) {
    const tip = getFingerJoint(context, finger, 'tip');
    const proximal = getFingerJoint(context, finger, 'phalanx-proximal');
    const metacarpal = getFingerJoint(context, finger, 'metacarpal');
    const wrist = getJoint(context, 'wrist');
    if (!tip || !wrist)
        return null;
    const reference = proximal ?? metacarpal;
    if (!reference)
        return null;
    const referenceDistance = reference.distanceTo(wrist);
    const tipDistance = tip.distanceTo(wrist);
    const curlRatio = referenceDistance > EPSILON ? tipDistance / referenceDistance : 0;
    return {
        tip,
        metacarpal,
        referenceDistance,
        tipDistance,
        curlRatio,
    };
}
function getFingerMetrics(context) {
    return FINGER_ORDER.map((finger) => computeFingerMetric(context, finger)).filter(Boolean);
}
function getThumbMetrics(context) {
    const tip = getJoint(context, 'thumb-tip');
    const wrist = getJoint(context, 'wrist');
    if (!tip || !wrist)
        return undefined;
    const metacarpal = getJoint(context, 'thumb-metacarpal') ??
        getJoint(context, 'thumb-phalanx-proximal');
    if (!metacarpal)
        return undefined;
    const referenceDistance = metacarpal.distanceTo(wrist);
    const tipDistance = tip.distanceTo(wrist);
    return {
        tip,
        metacarpal,
        referenceDistance,
        tipDistance,
    };
}
function estimateHandScale(context) {
    const wrist = getJoint(context, 'wrist');
    const middleTip = getJoint(context, 'middle-finger-tip');
    const middleBase = getJoint(context, 'middle-finger-metacarpal');
    const palmWidth = getPalmWidth(context);
    const measurements = [];
    if (wrist && middleTip)
        measurements.push(middleTip.distanceTo(wrist));
    if (palmWidth)
        measurements.push(palmWidth);
    if (wrist && middleBase)
        measurements.push(middleBase.distanceTo(wrist) * 2);
    if (!measurements.length)
        return 0.08;
    return average(measurements);
}
function getPalmWidth(context) {
    const indexBase = getFingerJoint(context, 'index', 'metacarpal');
    const pinkyBase = getFingerJoint(context, 'pinky', 'metacarpal');
    if (!indexBase || !pinkyBase)
        return null;
    return indexBase.distanceTo(pinkyBase);
}
function getPalmNormal(context) {
    const wrist = getJoint(context, 'wrist');
    const indexBase = getFingerJoint(context, 'index', 'metacarpal');
    const pinkyBase = getFingerJoint(context, 'pinky', 'metacarpal');
    if (!wrist || !indexBase || !pinkyBase)
        return null;
    const u = new THREE.Vector3().subVectors(indexBase, wrist);
    const v = new THREE.Vector3().subVectors(pinkyBase, wrist);
    if (u.lengthSq() === 0 || v.lengthSq() === 0)
        return null;
    const normal = new THREE.Vector3().crossVectors(u, v);
    if (normal.lengthSq() === 0)
        return null;
    if (context.handLabel === 'left')
        normal.multiplyScalar(-1);
    return normal.normalize();
}
function getPalmRight(context) {
    const indexBase = getFingerJoint(context, 'index', 'metacarpal');
    const pinkyBase = getFingerJoint(context, 'pinky', 'metacarpal');
    if (!indexBase || !pinkyBase)
        return null;
    const right = new THREE.Vector3().subVectors(indexBase, pinkyBase);
    if (context.handLabel === 'left')
        right.multiplyScalar(-1);
    if (right.lengthSq() === 0)
        return null;
    return right.normalize();
}
function getPalmUp(context) {
    const normal = getPalmNormal(context);
    const right = getPalmRight(context);
    if (!normal || !right)
        return null;
    const up = new THREE.Vector3().copy(right).cross(normal);
    if (up.lengthSq() === 0)
        return null;
    return up.normalize();
}
function getAdjacentFingerDistances(context) {
    const tips = FINGER_ORDER.map((finger) => getFingerJoint(context, finger, 'tip'));
    if (tips.some((tip) => !tip)) {
        return { average: Infinity };
    }
    const distances = [
        tips[0].distanceTo(tips[1]),
        tips[1].distanceTo(tips[2]),
        tips[2].distanceTo(tips[3]),
    ];
    return { average: average(distances) };
}
function getJoint(context, jointName) {
    return context.joints.get(jointName);
}
function getFingerJoint(context, finger, suffix) {
    const prefix = FINGER_PREFIX[finger];
    return getJoint(context, `${prefix}-${suffix}`);
}
function fingerAlignmentScore(context, metrics, palmUp) {
    const base = metrics.metacarpal ?? getJoint(context, 'wrist');
    if (!base)
        return 0;
    const direction = new THREE.Vector3().subVectors(metrics.tip, base);
    if (direction.lengthSq() === 0)
        return 0;
    direction.normalize();
    return clamp01((direction.dot(palmUp) - 0.35) / 0.5);
}
function clamp01(value) {
    return THREE.MathUtils.clamp(value, 0, 1);
}
function average(values) {
    if (!values.length)
        return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

const HAND_INDEX_TO_LABEL = {
    [Handedness.LEFT]: 'left',
    [Handedness.RIGHT]: 'right',
};
const JOINT_TEMP_POOL = new Map();
class GestureRecognition extends Script {
    constructor() {
        super(...arguments);
        this.activeGestures = {
            left: new Map(),
            right: new Map(),
        };
        this.lastEvaluation = 0;
        this.detectors = new Map();
        this.activeProvider = null;
        this.providerWarned = false;
    }
    static { this.dependencies = {
        input: Input,
        user: User,
        options: GestureRecognitionOptions,
    }; }
    async init({ options, user, input, }) {
        this.options = options;
        this.user = user;
        this.input = input;
        this.configureProvider(true);
        if (!this.options.enabled) {
            console.info('GestureRecognition initialized but disabled. Call options.enableGestures() to activate.');
        }
    }
    update() {
        if (!this.options.enabled)
            return;
        if (!this.user.hands?.isValid?.())
            return;
        this.configureProvider();
        const now = performance.now();
        const interval = this.activeProvider === 'heuristics' ? 0 : this.options.updateIntervalMs;
        if (interval > 0 && now - this.lastEvaluation < interval) {
            return;
        }
        this.lastEvaluation = now;
        this.evaluateHand(Handedness.LEFT);
        this.evaluateHand(Handedness.RIGHT);
    }
    configureProvider(force = false) {
        const provider = this.options.provider;
        if (!force && provider === this.activeProvider)
            return;
        this.detectors.clear();
        switch (provider) {
            case 'heuristics':
                this.assignDetectors(heuristicDetectors);
                this.providerWarned = false;
                break;
            case 'mediapipe':
            case 'tfjs':
                this.assignDetectors(heuristicDetectors);
                if (!this.providerWarned) {
                    console.warn(`GestureRecognition: provider '${provider}' is not yet implemented; falling back to heuristics.`);
                    this.providerWarned = true;
                }
                break;
            default:
                this.assignDetectors(heuristicDetectors);
                if (!this.providerWarned) {
                    console.warn(`GestureRecognition: provider '${provider}' is unknown; falling back to heuristics.`);
                    this.providerWarned = true;
                }
                break;
        }
        this.activeProvider = provider;
    }
    assignDetectors(detectors) {
        for (const [name, detector] of Object.entries(detectors)) {
            if (!detector)
                continue;
            this.detectors.set(name, detector);
        }
    }
    evaluateHand(handedness) {
        const handLabel = HAND_INDEX_TO_LABEL[handedness];
        const activeMap = this.activeGestures[handLabel];
        if (!handLabel)
            return;
        const context = this.buildHandContext(handedness, handLabel);
        if (!context) {
            for (const [name] of activeMap.entries()) {
                this.emitGesture('gestureend', { name, hand: handLabel, confidence: 0 });
            }
            activeMap.clear();
            return;
        }
        const processed = new Set();
        for (const [name, config] of Object.entries(this.options.gestures)) {
            const gestureName = name;
            if (!config?.enabled)
                continue;
            const detector = this.detectors.get(gestureName);
            if (!detector)
                continue;
            const result = detector(context, config);
            const isActive = result && result.confidence >= this.options.minimumConfidence;
            processed.add(gestureName);
            const previousState = activeMap.get(gestureName);
            if (isActive) {
                const detail = {
                    name: gestureName,
                    hand: handLabel,
                    confidence: THREE.MathUtils.clamp(result.confidence, 0, 1),
                    data: result.data,
                };
                if (!previousState) {
                    activeMap.set(gestureName, {
                        confidence: detail.confidence,
                        data: detail.data,
                    });
                    this.emitGesture('gesturestart', detail);
                }
                else {
                    previousState.confidence = detail.confidence;
                    previousState.data = detail.data;
                    this.emitGesture('gestureupdate', detail);
                }
            }
            else if (previousState) {
                activeMap.delete(gestureName);
                this.emitGesture('gestureend', {
                    name: gestureName,
                    hand: handLabel,
                    confidence: 0.0,
                });
            }
        }
        for (const name of Array.from(activeMap.keys())) {
            if (!processed.has(name)) {
                activeMap.delete(name);
                this.emitGesture('gestureend', {
                    name,
                    hand: handLabel,
                    confidence: 0.0,
                });
            }
        }
    }
    buildHandContext(handedness, handLabel) {
        if (!this.user.hands)
            return null;
        const hand = this.user.hands.hands[handedness];
        if (!hand?.joints)
            return null;
        let jointCache = JOINT_TEMP_POOL.get(handLabel);
        if (!jointCache) {
            jointCache = new Map();
            JOINT_TEMP_POOL.set(handLabel, jointCache);
        }
        const joints = jointCache;
        joints.clear();
        for (const jointName of HAND_JOINT_NAMES) {
            const joint = hand.joints[jointName];
            if (!joint)
                continue;
            let vector = joints.get(jointName);
            if (!vector) {
                vector = new THREE.Vector3();
                joints.set(jointName, vector);
            }
            vector.setFromMatrixPosition(joint.matrixWorld);
        }
        if (!joints.size)
            return null;
        return {
            handedness,
            handLabel,
            joints,
        };
    }
    emitGesture(type, detail) {
        const event = { type, detail, target: this };
        this.dispatchEvent(event);
    }
}

const DEBUGGING = false;
/**
 * Lighting provides XR lighting capabilities within the XR Blocks framework.
 * It uses webXR to propvide estimated lighting that matches the environment
 * and supports casting shadows from the estimated light.
 */
class Lighting {
    /**
     * Lighting is a lightweight manager based on three.js to simply prototyping
     * with Lighting features within the XR Blocks framework.
     */
    constructor() {
        /** Main Directional light. */
        this.dirLight = new THREE.DirectionalLight();
        /** Ambient spherical harmonics light. */
        this.ambientProbe = new THREE.LightProbe();
        /** Ambient RGB light. */
        this.ambientLight = new THREE.Vector3();
        /** Opacity of cast shadow. */
        this.shadowOpacity = 0.0;
        /** Light group to attach to scene. */
        this.lightGroup = new THREE.Group();
        /** Flag to indicate if simulator is running. Controlled by Core. */
        this.simulatorRunning = false;
        if (Lighting.instance) {
            return Lighting.instance;
        }
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
                dirLight.shadow.camera.near = 0.3;
                dirLight.shadow.camera.far = 50.0;
                const cameraFrustrumRadius = 4.0;
                dirLight.shadow.camera.left = -cameraFrustrumRadius;
                dirLight.shadow.camera.right = cameraFrustrumRadius;
                dirLight.shadow.camera.top = cameraFrustrumRadius;
                dirLight.shadow.camera.bottom = -cameraFrustrumRadius;
                dirLight.shadow.blurSamples = 25;
                dirLight.shadow.radius = 5.0;
                dirLight.shadow.bias = 0.0;
                this.lightGroup.add(dirLight.target);
                if (this.options.debugging || DEBUGGING) {
                    scene.add(new THREE.CameraHelper(dirLight.shadow.camera));
                }
            }
            if (this.options.useAmbientSH) {
                this.lightGroup.add(this.ambientProbe);
            }
            if (this.options.useDirectionalLight) {
                this.lightGroup.add(this.dirLight);
            }
            scene.add(this.lightGroup);
            this.xrLight.addEventListener('estimationend', () => {
                scene.remove(this.xrLight);
            });
        }
    }
    /**
     * Updates the lighting and shadow setup used to render. Called every frame
     * in the render loop.
     */
    update() {
        // Update lights from WebXR estimated light.
        if (this.options.enabled) {
            this.dirLight.position
                .copy(this.xrLight.directionalLight.position)
                .multiplyScalar(20.0);
            this.dirLight.target.position.setScalar(0.0);
            this.dirLight.color = this.xrLight.directionalLight.color;
            this.dirLight.intensity = this.xrLight.directionalLight.intensity;
            this.ambientProbe.sh.copy(this.xrLight.lightProbe.sh);
            this.ambientProbe.intensity = this.xrLight.lightProbe.intensity;
            this.ambientLight.copy(this.xrLight.lightProbe.sh.coefficients[0]);
            // Replace lights with harcoded default if using simulator.
            if (this.simulatorRunning) {
                this.dirLight.position.set(-10, 10.0, -2);
                this.dirLight.target.position.set(0.0, 0.0, -0.5);
                this.dirLight.color.setHex(0xffffff);
                this.dirLight.intensity = 3.8;
                this.ambientProbe.sh.fromArray([
                    0.22636516392230988, 0.2994415760040283, 0.2827182114124298,
                    0.03430574759840965, 0.029604531824588776, -0.002050594426691532,
                    0.016114741563796997, 0.004344218410551548, 0.07621686905622482,
                    0.024204734712839127, -0.02397896535694599, -0.07645703107118607,
                    0.15790101885795593, 0.16706973314285278, 0.18418270349502563,
                    -0.13088643550872803, -0.1461198776960373, -0.1411236822605133,
                    0.04788218438625336, 0.08909443765878677, 0.10185115039348602,
                    0.020251473411917686, -0.002100071171298623, -0.06455840915441513,
                    -0.12393051385879517, -0.05158703774213791, -0.00532124936580658,
                ]);
                this.ambientProbe.intensity = 1.0;
                this.ambientLight.copy(this.ambientProbe.sh.coefficients[0]);
            }
            if (this.options.castDirectionalLightShadow &&
                this.options.useDynamicSoftShadow) {
                const ambientLightIntensity = this.ambientLight;
                const ambientMonoIntensity = 0.21 * ambientLightIntensity.x +
                    0.72 * ambientLightIntensity.y +
                    0.07 * ambientLightIntensity.z;
                const mainLightIntensity = new THREE.Vector3(this.dirLight.color.r, this.dirLight.color.g, this.dirLight.color.b).multiplyScalar(this.dirLight.intensity);
                const mainMonoIntensity = 0.21 * mainLightIntensity.x +
                    0.72 * mainLightIntensity.y +
                    0.07 * mainLightIntensity.z;
                const ambientToMain = ambientMonoIntensity / mainMonoIntensity;
                this.dirLight.shadow.radius = Math.min(Math.max(1.0, ambientToMain * 30), 10.0);
                this.shadowOpacity = Math.max(Math.min((10.0 - ambientToMain * 30) * 0.7, 0.7), 0.3);
                // Override depth material opacity with shadowOpacity
                if (this.depth?.options?.enabled &&
                    this.depth.options.depthMesh.enabled &&
                    this.depth.depthMesh?.material instanceof THREE.ShadowMaterial) {
                    this.depth.depthMesh.material.opacity = this.shadowOpacity;
                }
            }
        }
        if (this.options.debugging || DEBUGGING) {
            this.debugLog();
        }
    }
    /**
     * Logs current estimate light parameters for debugging.
     */
    debugLog() {
        console.log('Lighting.dirLight', this.dirLight);
        console.log('Lighting.ambientProbe', this.ambientProbe);
        console.log('Lighting.ambientLight', this.ambientLight);
    }
}

/**
 * Integrates the RAPIER physics engine into the XRCore lifecycle.
 * It sets up the physics in a blended world that combines virtual and physical
 * objects, steps the simulation forward in sync with the application's
 * framerate, and manages the lifecycle of physics-related objects.
 */
class Physics {
    constructor() {
        this.initialized = false;
        this.fps = 0;
    }
    get timestep() {
        return 1 / this.fps;
    }
    /**
     * Asynchronously initializes the RAPIER physics engine and creates the
     * blendedWorld. This is called in Core before the physics simulation starts.
     */
    async init({ physicsOptions }) {
        this.options = physicsOptions;
        this.RAPIER = this.options.RAPIER;
        this.fps = this.options.fps;
        if (this.RAPIER.init) {
            await this.RAPIER.init();
        }
        this.blendedWorld = new this.RAPIER.World(this.options.gravity);
        this.blendedWorld.timestep = this.timestep;
        if (this.options.useEventQueue) {
            this.eventQueue = new this.RAPIER.EventQueue(true);
        }
        this.initialized = true;
    }
    /**
     * Advances the physics simulation by one step.
     */
    physicsStep() {
        if (this.options?.worldStep && this.blendedWorld) {
            this.blendedWorld.step(this.eventQueue);
        }
    }
    /**
     * Frees the memory allocated by the RAPIER physics blendedWorld and event
     * queue. This is crucial for preventing memory leaks when the XR session
     * ends.
     */
    dispose() {
        if (this.eventQueue) {
            this.eventQueue.free();
        }
        if (this.blendedWorld) {
            this.blendedWorld.free();
        }
    }
}

class HandsOptions {
    constructor(options) {
        /** Whether hand tracking is enabled. */
        this.enabled = false;
        /** Whether to show any hand visualization. */
        this.visualization = false;
        /** Whether to show the tracked hand joints. */
        this.visualizeJoints = false;
        /** Whether to show the virtual hand meshes. */
        this.visualizeMeshes = false;
        this.debugging = false;
        deepMerge(this, options);
    }
    /**
     * Enables hands tracking.
     * @returns The instance for chaining.
     */
    enableHands() {
        this.enabled = true;
        return this;
    }
    enableHandsVisualization() {
        this.enabled = true;
        this.visualization = true;
        return this;
    }
}

/**
 * Default options for controlling Lighting module features.
 */
class LightingOptions {
    constructor(options) {
        /** Enables debugging renders and logs. */
        this.debugging = false;
        /** Enables XR lighting. */
        this.enabled = false;
        /** Add ambient spherical harmonics to lighting. */
        this.useAmbientSH = false;
        /** Add main diredtional light to lighting. */
        this.useDirectionalLight = false;
        /** Cast shadows using diretional light. */
        this.castDirectionalLightShadow = false;
        /**
         * Adjust hardness of shadows according to relative brightness of main light.
         */
        this.useDynamicSoftShadow = false; // experimental
        deepMerge(this, options);
    }
}

class PhysicsOptions {
    constructor() {
        /**
         * The target frames per second for the physics simulation loop.
         */
        this.fps = 45;
        /**
         * The global gravity vector applied to the physics world.
         */
        this.gravity = { x: 0.0, y: -9.81, z: 0.0 };
        /**
         * If true, the `Physics` manager will automatically call `world.step()`
         * on its fixed interval. Set to false if you want to control the
         * simulation step manually.
         */
        this.worldStep = true;
        /**
         * If true, an event queue will be created and passed to `world.step()`,
         * enabling the handling of collision and contact events.
         */
        this.useEventQueue = false;
    }
}

/**
 * A frozen object containing standardized string values for `event.code`.
 * Used for desktop simulation.
 */
var Keycodes;
(function (Keycodes) {
    // --- Movement Keys ---
    Keycodes["W_CODE"] = "KeyW";
    Keycodes["A_CODE"] = "KeyA";
    Keycodes["S_CODE"] = "KeyS";
    Keycodes["D_CODE"] = "KeyD";
    Keycodes["UP"] = "ArrowUp";
    Keycodes["DOWN"] = "ArrowDown";
    Keycodes["LEFT"] = "ArrowLeft";
    Keycodes["RIGHT"] = "ArrowRight";
    // --- Vertical Movement / Elevation ---
    Keycodes["Q_CODE"] = "KeyQ";
    Keycodes["E_CODE"] = "KeyE";
    Keycodes["PAGE_UP"] = "PageUp";
    Keycodes["PAGE_DOWN"] = "PageDown";
    // --- Action & Interaction Keys ---
    Keycodes["SPACE_CODE"] = "Space";
    Keycodes["ENTER_CODE"] = "Enter";
    Keycodes["T_CODE"] = "KeyT";
    // --- Modifier Keys ---
    Keycodes["LEFT_SHIFT_CODE"] = "ShiftLeft";
    Keycodes["RIGHT_SHIFT_CODE"] = "ShiftRight";
    Keycodes["LEFT_CTRL_CODE"] = "ControlLeft";
    Keycodes["RIGHT_CTRL_CODE"] = "ControlRight";
    Keycodes["LEFT_ALT_CODE"] = "AltLeft";
    Keycodes["RIGHT_ALT_CODE"] = "AltRight";
    Keycodes["CAPS_LOCK_CODE"] = "CapsLock";
    // --- UI & System Keys ---
    Keycodes["ESCAPE_CODE"] = "Escape";
    Keycodes["TAB_CODE"] = "Tab";
    // --- Alphabet Keys ---
    Keycodes["B_CODE"] = "KeyB";
    Keycodes["C_CODE"] = "KeyC";
    Keycodes["F_CODE"] = "KeyF";
    Keycodes["G_CODE"] = "KeyG";
    Keycodes["H_CODE"] = "KeyH";
    Keycodes["I_CODE"] = "KeyI";
    Keycodes["J_CODE"] = "KeyJ";
    Keycodes["K_CODE"] = "KeyK";
    Keycodes["L_CODE"] = "KeyL";
    Keycodes["M_CODE"] = "KeyM";
    Keycodes["N_CODE"] = "KeyN";
    Keycodes["O_CODE"] = "KeyO";
    Keycodes["P_CODE"] = "KeyP";
    Keycodes["R_CODE"] = "KeyR";
    Keycodes["U_CODE"] = "KeyU";
    Keycodes["V_CODE"] = "KeyV";
    Keycodes["X_CODE"] = "KeyX";
    Keycodes["Y_CODE"] = "KeyY";
    Keycodes["Z_CODE"] = "KeyZ";
    // --- Number Keys ---
    Keycodes["DIGIT_0"] = "Digit0";
    Keycodes["DIGIT_1"] = "Digit1";
    Keycodes["DIGIT_2"] = "Digit2";
    Keycodes["DIGIT_3"] = "Digit3";
    Keycodes["DIGIT_4"] = "Digit4";
    Keycodes["DIGIT_5"] = "Digit5";
    Keycodes["DIGIT_6"] = "Digit6";
    Keycodes["DIGIT_7"] = "Digit7";
    Keycodes["DIGIT_8"] = "Digit8";
    Keycodes["DIGIT_9"] = "Digit9";
    Keycodes["BACKQUOTE"] = "Backquote";
})(Keycodes || (Keycodes = {}));

var SimulatorMode;
(function (SimulatorMode) {
    SimulatorMode["USER"] = "User";
    SimulatorMode["POSE"] = "Navigation";
    SimulatorMode["CONTROLLER"] = "Hands";
})(SimulatorMode || (SimulatorMode = {}));
const DEFAULT_MODE_TOGGLE_ORDER = {
    [SimulatorMode.USER]: SimulatorMode.POSE,
    [SimulatorMode.POSE]: SimulatorMode.CONTROLLER,
    [SimulatorMode.CONTROLLER]: SimulatorMode.USER,
};
class SimulatorOptions {
    constructor(options) {
        this.initialCameraPosition = { x: 0, y: 1.5, z: 0 };
        this.environments = [
            {
                name: 'Living Room',
                scenePath: XR_BLOCKS_ASSETS_PATH +
                    'simulator/scenes/XREmulatorsceneV5_livingRoom.glb',
                scenePlanesPath: XR_BLOCKS_ASSETS_PATH +
                    'simulator/scenes/XREmulatorsceneV5_livingRoom_planes.json',
            },
        ];
        this.activeEnvironmentIndex = 0;
        this.initialScenePosition = { x: -1.6, y: 0.3, z: 0 };
        this.defaultMode = SimulatorMode.USER;
        this.defaultHand = Handedness.LEFT;
        this.modeToggle = {
            enabled: false,
            toggleKey: Keycodes.LEFT_SHIFT_CODE,
            toggleOrder: DEFAULT_MODE_TOGGLE_ORDER,
        };
        this.simulatorSettingsPanel = {
            enabled: true,
            element: 'xrblocks-simulator-settings',
        };
        this.instructions = {
            enabled: false,
            element: 'xrblocks-simulator-instructions',
            customInstructions: [],
        };
        this.handPosePanel = {
            enabled: true,
            element: 'xrblocks-simulator-hand-pose-panel',
        };
        this.geminiLivePanel = {
            enabled: false,
            element: 'xrblocks-simulator-geminilive',
        };
        this.stereo = {
            enabled: false,
        };
        this.deviceCamera = {
            // Whether to enable the simulator camera feed.
            // If disabled, the actual device camera will be used instead.
            enabled: true,
        };
        // Whether to render the main scene to a render texture before rendering the simulator scene
        // or directly to the canvas after rendering the simulator scene.
        this.renderToRenderTexture = true;
        // Blending mode when rendering the virtual scene.
        this.blendingMode = 'normal';
        deepMerge(this, options);
    }
}

class SpeechSynthesizerOptions {
    constructor() {
        this.enabled = false;
        /** If true, a new call to speak() will interrupt any ongoing speech. */
        this.allowInterruptions = false;
    }
}
class SpeechRecognizerOptions {
    constructor() {
        this.enabled = true;
        /** Recognition language (e.g., 'en-US'). */
        this.lang = 'en-US';
        /** If true, recognition continues after a pause. */
        this.continuous = false;
        /** Keywords to detect as commands. */
        this.commands = [];
        /** If true, provides interim results. */
        this.interimResults = false;
        /** Minimum confidence (0-1) for a command. */
        this.commandConfidenceThreshold = 0.7;
        /** If true, play activation sounds in simulator. */
        this.playSimulatorActivationSounds = true;
    }
}
class SoundOptions {
    constructor() {
        this.speechSynthesizer = new SpeechSynthesizerOptions();
        this.speechRecognizer = new SpeechRecognizerOptions();
    }
}

class MeshDetectionOptions {
    constructor(options) {
        this.showDebugVisualizations = false;
        this.enabled = false;
        if (options) {
            deepMerge(this, options);
        }
    }
    /**
     * Enables the mesh detector.
     */
    enable() {
        this.enabled = true;
        return this;
    }
}

/**
 * Configuration options for the ObjectDetector.
 */
class ObjectsOptions {
    constructor(options) {
        this.debugging = false;
        this.enabled = false;
        this.showDebugVisualizations = false;
        /**
         * Margin to add when cropping the object image, as a percentage of image
         * size.
         */
        this.objectImageMargin = 0.05;
        /**
         * Configuration for the detection backends.
         */
        this.backendConfig = {
            /** The active backend to use for detection. */
            activeBackend: 'gemini',
            gemini: {
                systemInstruction: `Please provide me with the bounding box coordinates for the primary objects in the given image, prioritizing objects that are nearby. For each bounding box, include ymin, xmin, ymax, and xmax. These coordinates should be absolute values ranging from 0 to 1000, corresponding to the image as if it were resized to 1000x1000 pixels. The origin (xmin:0; ymin:0) is the top-left corner of the image, and (xmax:1000; ymax:1000) is the bottom-right corner. List a maximum of 5 objects. Ignore hands and other human body parts, as well as any UI elements attached to them (e.g., a blue circle attached to a finger).`,
                responseSchema: {
                    type: 'ARRAY',
                    items: {
                        type: 'OBJECT',
                        required: ['objectName', 'ymin', 'xmin', 'ymax', 'xmax'],
                        properties: {
                            objectName: { type: 'STRING' },
                            ymin: { type: 'NUMBER' },
                            xmin: { type: 'NUMBER' },
                            ymax: { type: 'NUMBER' },
                            xmax: { type: 'NUMBER' },
                        },
                    },
                },
            },
            /** Configuration for MediaPipe backend. */
            mediapipe: {
                wasmFilesUrl: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm',
                // Check https://ai.google.dev/edge/mediapipe/solutions/vision/object_detector#models for other models.
                modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite2/int8/latest/efficientdet_lite2.tflite',
                scoreThreshold: 0.5,
            },
        };
        if (options) {
            deepMerge(this, options);
        }
    }
    /**
     * Enables the object detector.
     */
    enable() {
        this.enabled = true;
        return this;
    }
}

class PlanesOptions {
    constructor(options) {
        this.debugging = false;
        this.enabled = false;
        this.showDebugVisualizations = false;
        if (options) {
            deepMerge(this, options);
        }
    }
    enable() {
        this.enabled = true;
        return this;
    }
}

class SoundsOptions {
    constructor(options) {
        this.enabled = false;
        this.showDebugInfo = false;
        this.backendConfig = {
            activeBackend: 'mediapipe',
            mediapipe: {
                wasmFilesUrl: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio@0.10.35/wasm',
                modelAssetPath: 'https://tfhub.dev/google/lite-model/yamnet/classification/tflite/1?lite-format=tflite',
                // Control the number of samples that should be accumulated before the MediaPipe Classifier
                // can classify. Choosing a value that is too low would result in high occurrences of
                // "Silence" classifications.
                chunkSamples: 16000,
            },
        };
        if (options) {
            deepMerge(this, options);
        }
    }
    /**
     * Enables sound detection.
     */
    enable() {
        this.enabled = true;
        return this;
    }
}

class WorldOptions {
    constructor(options) {
        this.debugging = false;
        this.enabled = false;
        this.initiateRoomCapture = false;
        this.planes = new PlanesOptions();
        this.objects = new ObjectsOptions();
        this.meshes = new MeshDetectionOptions();
        this.sounds = new SoundsOptions();
        if (options) {
            deepMerge(this, options);
        }
    }
    /**
     * Enables plane detection.
     */
    enablePlaneDetection() {
        this.enabled = true;
        this.planes.enable();
        return this;
    }
    /**
     * Enables object detection.
     */
    enableObjectDetection() {
        this.enabled = true;
        this.objects.enable();
        return this;
    }
    /**
     * Enables mesh detection.
     */
    enableMeshDetection() {
        this.enabled = true;
        this.meshes.enable();
        return this;
    }
    /**
     * Enables sound detection.
     */
    enableSoundDetection() {
        this.enabled = true;
        this.sounds.enable();
        return this;
    }
}

/**
 * Default options for XR controllers, which encompass hands by default in
 * Android XR, mouse input on desktop, tracked controllers, and gamepads.
 */
class InputOptions {
    constructor() {
        /** Whether controller input is enabled. */
        this.enabled = true;
        /** Whether mouse input should act as a controller on desktop. */
        this.enabledMouse = true;
        /** Whether to enable debugging features for controllers. */
        this.debug = false;
        /** Whether to show controller models. */
        this.visualization = false;
        /** Whether to show the ray lines extending from the controllers. */
        this.visualizeRays = false;
        /** Whether to perform raycast on update. This is needed for the reticle to work properly. */
        this.performRaycastOnUpdate = true;
    }
}
/**
 * Default options for the reticle (pointing cursor).
 */
class ReticleOptions {
    constructor() {
        this.enabled = true;
        /**
         * When set to a positive value, the reticle is placed at this distance
         * (in meters) along the controller ray when no intersection is found,
         * instead of being hidden. Set to 0 to hide the reticle on miss.
         */
        this.defaultDistance = 0;
    }
}
/**
 * Options for the XR transition effect.
 */
class XRTransitionOptions {
    constructor() {
        /** Whether the transition effect is enabled. */
        this.enabled = false;
        /** The duration of the transition in seconds. */
        this.transitionTime = 0.5;
        /** The default background color for VR transitions. */
        this.defaultBackgroundColor = 0xffffff;
    }
}
const FORM_FACTORS = ['auto', 'xr', 'hud', 'vr', 'desktop', 'mobile'];
/**
 * A central configuration class for the entire XR Blocks system. It aggregates
 * all settings and provides chainable methods for enabling common features.
 */
class Options {
    get formFactor() {
        return this._formFactor;
    }
    /**
     * Form factor is a preset that configures the experience for a specific
     * device type. Currently it only controls whether the simulator is enabled
     * and should always be autostarted.
     */
    set formFactor(formFactor) {
        this._formFactor = formFactor;
        this.enableSimulator =
            formFactor === 'desktop' ||
                formFactor === 'auto' ||
                formFactor === 'mobile';
        this.xrButton.alwaysAutostartSimulator = formFactor === 'desktop';
        if (formFactor === 'vr') {
            this.enableVR();
        }
    }
    /**
     * Constructs the Options object by merging default values with provided
     * custom options.
     * @param options - A custom options object to override the defaults.
     */
    constructor(options) {
        /**
         * Whether to use antialiasing.
         */
        this.antialias = true;
        /**
         * Whether to use a logarithmic depth buffer. Useful for depth-aware
         * occlusions.
         */
        this.logarithmicDepthBuffer = false;
        /**
         * Global flag for enabling various debugging features.
         */
        this.debugging = false;
        /**
         * Whether to request a stencil buffer.
         */
        this.stencil = false;
        /**
         * Any additional required features when initializing webxr.
         */
        this.webxrRequiredFeatures = [];
        // "local-floor" sets the scene origin at the user's feet,
        // "local" sets the scene origin near their head.
        this.referenceSpaceType = 'local-floor';
        this.controllers = new InputOptions();
        this.depth = new DepthOptions();
        this.lighting = new LightingOptions();
        this.deviceCamera = new DeviceCameraOptions();
        this.hands = new HandsOptions();
        this.gestures = new GestureRecognitionOptions();
        this.reticles = new ReticleOptions();
        this.sound = new SoundOptions();
        this.ai = new AIOptions();
        this.simulator = new SimulatorOptions();
        this.world = new WorldOptions();
        this.physics = new PhysicsOptions();
        this.transition = new XRTransitionOptions();
        this.camera = {
            near: 0.01,
            far: 500,
        };
        /**
         * Whether to use post-processing effects.
         */
        this.usePostprocessing = false;
        this.enableSimulator = true;
        /**
         * Configuration for the XR session button.
         */
        this.xrButton = {
            appTitle: '',
            appDescription: '',
            enabled: true,
            startText: 'Enter XR',
            endText: 'Exit XR',
            invalidText: 'XR Not Supported',
            startSimulatorText: 'Enter Simulator',
            showEnterSimulatorButton: false,
            // Whether to autostart the simulator even if WebXR is available.
            alwaysAutostartSimulator: false,
        };
        /**
         * Which permissions to request before entering the XR session.
         */
        this.permissions = {
            geolocation: false,
            camera: false,
            microphone: false,
        };
        this.xrSessionMode = 'immersive-ar';
        this._formFactor = 'auto';
        deepMerge(this, options);
        this.parseUrlParams();
    }
    parseUrlParams() {
        const formFactorUrlParam = getUrlParameter('formFactor');
        if (formFactorUrlParam &&
            FORM_FACTORS.includes(formFactorUrlParam)) {
            this.formFactor = formFactorUrlParam;
        }
    }
    /**
     * Sets the session mode to VR and disables the simulator passthrough scene.
     */
    enableVR() {
        this.xrSessionMode = 'immersive-vr';
        if (this.simulator.environments[this.simulator.activeEnvironmentIndex]) {
            this.simulator.environments[this.simulator.activeEnvironmentIndex].scenePath = null;
            this.simulator.environments[this.simulator.activeEnvironmentIndex].scenePlanesPath = null;
        }
        return this;
    }
    /**
     * Enables a standard set of options for a UI-focused experience.
     * @returns The instance for chaining.
     */
    enableUI() {
        this.antialias = true;
        this.reticles.enabled = true;
        return this;
    }
    /**
     * Enables reticles for visualizing targets of hand rays in WebXR.
     * @returns The instance for chaining.
     */
    enableReticles() {
        this.reticles.enabled = true;
        return this;
    }
    /**
     * Enables depth sensing in WebXR with default options.
     * @returns The instance for chaining.
     */
    enableDepth() {
        this.depth = new DepthOptions(xrDepthMeshOptions);
        return this;
    }
    /**
     * Enables plane detection.
     * @returns The instance for chaining.
     */
    enablePlaneDetection() {
        this.world.enablePlaneDetection();
        return this;
    }
    /**
     * Enables object detection.
     * @returns The instance for chaining.
     */
    enableObjectDetection() {
        this.permissions.camera = true;
        this.world.enableObjectDetection();
        return this;
    }
    /**
     * Enables device camera (passthrough) with a specific facing mode.
     * @param facingMode - The desired camera facing mode, either 'environment' or
     *     'user'.
     * @returns The instance for chaining.
     */
    enableCamera(facingMode = 'environment') {
        this.permissions.camera = true;
        this.deviceCamera = new DeviceCameraOptions(facingMode === 'environment'
            ? xrDeviceCameraEnvironmentOptions
            : xrDeviceCameraUserOptions);
        return this;
    }
    /**
     * Enables hand tracking.
     * @returns The instance for chaining.
     */
    enableHands() {
        this.hands.enabled = true;
        return this;
    }
    /**
     * Enables the gesture recognition block and ensures hands are available.
     * @returns The instance for chaining.
     */
    enableGestures() {
        this.enableHands();
        this.gestures.enable();
        return this;
    }
    /**
     * Enables the visualization of rays for hand tracking.
     * @returns The instance for chaining.
     */
    enableHandRays() {
        this.controllers.visualizeRays = true;
        return this;
    }
    /**
     * Enables a standard set of AI features, including Gemini Live.
     * @returns The instance for chaining.
     */
    enableAI() {
        this.ai.enabled = true;
        this.ai.gemini.enabled = true;
        return this;
    }
    /**
     * Enables the XR transition component for toggling VR.
     * @returns The instance for chaining.
     */
    enableXRTransitions() {
        this.transition.enabled = true;
        return this;
    }
    /**
     * Enables input from hands and controllers.
     * Note that this is enabled by default and can also be changed at runtime with
     * xb.core.input.enableControllers() and xb.core.input.disableControllers().
     * @returns The instance for chaining.
     */
    enableControllers() {
        this.controllers.enabled = true;
        return this;
    }
    /**
     * Sets the title of the app to be displayed above the XR button.
     * @param title - The title of the app.
     * @returns The instance for chaining.
     */
    setAppTitle(title) {
        this.xrButton.appTitle = title;
        return this;
    }
    /**
     * Sets the description of the app to be displayed above the XR button.
     * @param description - The description of the app.
     * @returns The instance for chaining.
     */
    setAppDescription(description) {
        this.xrButton.appDescription = description;
        return this;
    }
}

class SimulatorMediaDeviceInfo {
    constructor(deviceId = 'simulator', groupId = 'simulator', kind = 'videoinput', label = 'Simulator Camera') {
        this.deviceId = deviceId;
        this.groupId = groupId;
        this.kind = kind;
        this.label = label;
    }
}

var ConstrainDomStringMatch;
(function (ConstrainDomStringMatch) {
    ConstrainDomStringMatch[ConstrainDomStringMatch["EXACT"] = 0] = "EXACT";
    ConstrainDomStringMatch[ConstrainDomStringMatch["IDEAL"] = 1] = "IDEAL";
    ConstrainDomStringMatch[ConstrainDomStringMatch["ACCEPTABLE"] = 2] = "ACCEPTABLE";
    ConstrainDomStringMatch[ConstrainDomStringMatch["UNACCEPTABLE"] = 3] = "UNACCEPTABLE";
})(ConstrainDomStringMatch || (ConstrainDomStringMatch = {}));
/**
 * Evaluates how a string value satisfies a ConstrainDOMString constraint.
 *
 * @param constraint - The ConstrainDOMString to check against.
 * @param value - The string value to test.
 * @returns A `ConstrainDomStringMatch` enum indicating the match level.
 */
function evaluateConstrainDOMString(constraint, value) {
    // Helper to check for a match against a string or string array.
    const matches = (c, v) => {
        return typeof c === 'string' ? v === c : c.includes(v);
    };
    // If no constraint is given, the value is simply acceptable.
    if (constraint == null) {
        return ConstrainDomStringMatch.ACCEPTABLE;
    }
    // A standalone string or array is treated as an implicit 'exact' requirement.
    if (typeof constraint === 'string' || Array.isArray(constraint)) {
        return matches(constraint, value)
            ? ConstrainDomStringMatch.EXACT
            : ConstrainDomStringMatch.UNACCEPTABLE;
    }
    // Handle the object-based constraint.
    if (typeof constraint === 'object') {
        // The 'exact' property is a hard requirement that overrides all others.
        if (constraint.exact !== undefined) {
            return matches(constraint.exact, value)
                ? ConstrainDomStringMatch.EXACT
                : ConstrainDomStringMatch.UNACCEPTABLE;
        }
        // If there's no 'exact' constraint, check 'ideal'.
        if (constraint.ideal !== undefined) {
            if (matches(constraint.ideal, value)) {
                return ConstrainDomStringMatch.IDEAL;
            }
        }
        // If the value doesn't match 'ideal' (or if 'ideal' wasn't specified),
        // it's still acceptable because 'ideal' is only a preference.
        return ConstrainDomStringMatch.ACCEPTABLE;
    }
    // Fallback for any unknown constraint types.
    return ConstrainDomStringMatch.UNACCEPTABLE;
}

class SimulatorCamera {
    constructor(renderer) {
        this.renderer = renderer;
        this.cameraCreated = false;
        this.fps = 30;
        this.matchRenderingCamera = true;
        this.width = 512;
        this.height = 512;
        this.camera = new THREE.PerspectiveCamera();
    }
    init() {
        this.createSimulatorCamera();
    }
    createSimulatorCamera() {
        if (this.cameraCreated) {
            return;
        }
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.context = this.canvas.getContext('2d');
        this.mediaStream = this.canvas.captureStream(this.fps);
        const videoTrack = this.mediaStream.getVideoTracks()[0];
        const id = this.mediaStream.getVideoTracks()[0].getSettings().deviceId;
        this.cameraInfo = new SimulatorMediaDeviceInfo(/*deviceId=*/ id);
        videoTrack.stop();
        this.cameraCreated = true;
    }
    async enumerateDevices() {
        if (this.cameraInfo) {
            return [this.cameraInfo];
        }
        return [];
    }
    onBeforeSimulatorSceneRender(camera, renderScene) {
        if (!this.cameraCreated) {
            return;
        }
        if (!this.matchRenderingCamera) {
            this.camera.position.copy(camera.position);
            this.camera.quaternion.copy(camera.quaternion);
            renderScene(this.camera);
            const sWidth = this.renderer.domElement.width;
            const sHeight = this.renderer.domElement.height;
            const aspectRatio = this.width / this.height;
            const croppedSourceWidth = Math.min(sWidth, sHeight * aspectRatio);
            const croppedSourceHeight = Math.min(sHeight, sWidth / aspectRatio);
            const sx = (sWidth - croppedSourceWidth) / 2;
            const sy = (sHeight - croppedSourceHeight) / 2;
            this.context.drawImage(this.renderer.domElement, sx, sy, croppedSourceWidth, croppedSourceHeight, 0, 0, this.width, this.height);
        }
    }
    onSimulatorSceneRendered() {
        if (!this.cameraCreated) {
            return;
        }
        if (this.matchRenderingCamera) {
            const sWidth = this.renderer.domElement.width;
            const sHeight = this.renderer.domElement.height;
            const aspectRatio = this.width / this.height;
            const croppedSourceWidth = Math.min(sWidth, sHeight * aspectRatio);
            const croppedSourceHeight = Math.min(sHeight, sWidth / aspectRatio);
            const sx = (sWidth - croppedSourceWidth) / 2;
            const sy = (sHeight - croppedSourceHeight) / 2;
            this.context.drawImage(this.renderer.domElement, sx, sy, croppedSourceWidth, croppedSourceHeight, 0, 0, this.width, this.height);
        }
    }
    restartVideoTrack() {
        if (!this.cameraCreated) {
            return;
        }
        this.mediaStream = this.canvas.captureStream(this.fps);
        const id = this.mediaStream.getVideoTracks()[0].getSettings().deviceId;
        this.cameraInfo.deviceId = id || '';
    }
    getMedia(constraints = {}) {
        if (!this.cameraCreated) {
            return;
        }
        if (!constraints?.deviceId ||
            evaluateConstrainDOMString(constraints?.deviceId, this.cameraInfo.deviceId) != ConstrainDomStringMatch.UNACCEPTABLE) {
            const videoTrack = this.mediaStream.getVideoTracks()[0];
            if (videoTrack.readyState == 'ended') {
                this.restartVideoTrack();
            }
            return this.mediaStream;
        }
        return null;
    }
}

const AVERAGE_IPD_METERS = 0.063;
var SimulatorRenderMode;
(function (SimulatorRenderMode) {
    SimulatorRenderMode["DEFAULT"] = "default";
    SimulatorRenderMode["STEREO_LEFT"] = "left";
    SimulatorRenderMode["STEREO_RIGHT"] = "right";
})(SimulatorRenderMode || (SimulatorRenderMode = {}));

class SimulatorControllerState {
    constructor() {
        this.localControllerPositions = [
            new THREE.Vector3(-0.3, -0.1, -0.3),
            new THREE.Vector3(0.3, -0.1, -0.3),
        ];
        this.localControllerOrientations = [
            new THREE.Quaternion(),
            new THREE.Quaternion(),
        ];
        this.currentControllerIndex = 0;
    }
}

const LEFT_HAND_FIST = [
    { t: [-0.0933, -0.0266, -0.1338], r: [0.1346, -0.1437, 0.0038, 0.9804] },
    { t: [-0.0648, -0.0265, -0.1529], r: [0.0354, -0.3351, -0.1786, 0.9244] },
    { t: [-0.0318, -0.0293, -0.1932], r: [0.0407, -0.2202, -0.5685, 0.7916] },
    { t: [-0.0212, -0.0345, -0.2179], r: [0.0132, -0.12, -0.576, 0.8084] },
    { t: [-0.0161, -0.039, -0.2469], r: [0.0132, -0.12, -0.576, 0.8084] },
    { t: [-0.0731, -0.0197, -0.1569], r: [0.0999, -0.2377, 0.0822, 0.9627] },
    { t: [-0.0399, -23e-4, -0.2221], r: [-0.4356, -0.1075, -0.0127, 0.8936] },
    { t: [-0.0325, -0.0319, -0.246], r: [0.9331, 0.066, 0.0832, -0.3436] },
    { t: [-0.035, -0.0462, -0.2296], r: [0.9874, 0.021, 0.128, -0.0903] },
    { t: [-0.0408, -0.0496, -0.2076], r: [0.9874, 0.021, 0.128, -0.0903] },
    { t: [-0.0853, -0.0187, -0.1614], r: [0.115, -0.1594, 0.0889, 0.9765] },
    { t: [-0.0646, -7e-4, -0.2271], r: [-0.4919, -0.1197, 0.0382, 0.8616] },
    { t: [-0.0544, -0.0353, -0.2477], r: [0.9309, 0.1571, 0.0605, -0.324] },
    { t: [-0.0548, -0.0542, -0.2244], r: [0.9835, 0.1315, 0.1097, 0.0583] },
    { t: [-0.0607, -0.051, -0.2013], r: [0.9835, 0.1315, 0.1097, 0.0583] },
    { t: [-0.0972, -0.0213, -0.1628], r: [0.0881, -0.0966, 0.0847, 0.9878] },
    { t: [-0.0856, -88e-4, -0.2263], r: [-0.4818, -0.1075, 0.1033, 0.8635] },
    { t: [-0.0742, -0.0406, -0.246], r: [0.9378, 0.1774, 0.0089, -0.2983] },
    { t: [-0.0715, -0.0585, -0.2205], r: [0.9769, 0.1847, 0.0804, 0.0714] },
    { t: [-0.0757, -0.0552, -0.1994], r: [0.9769, 0.1847, 0.0804, 0.0714] },
    { t: [-0.1078, -0.0253, -0.162], r: [0.0535, -0.0126, 0.0933, 0.9941] },
    { t: [-0.1069, -0.0188, -0.2215], r: [-0.4433, -0.1294, 0.1523, 0.8738] },
    { t: [-0.0939, -0.0444, -0.2398], r: [0.9002, 0.2018, -0.0275, -0.385] },
    { t: [-0.0891, -0.0599, -0.2248], r: [0.9644, 0.2553, 0.0425, -0.0538] },
    { t: [-0.0914, -0.0623, -0.2063], r: [0.9644, 0.2553, 0.0425, -0.0538] },
];
const RIGHT_HAND_FIST = [
    { t: [0.0504, -0.0155, -0.1083], r: [0.1392, 0.117, -0.058, 0.9816] },
    { t: [0.022, -0.0122, -0.1291], r: [-68e-4, 0.3422, 0.1705, 0.924] },
    { t: [-0.011, -0.019, -0.1691], r: [-0.0952, 0.2257, 0.5977, 0.7634] },
    { t: [-0.0171, -0.0305, -0.1932], r: [-0.249, 0.0162, 0.627, 0.738] },
    { t: [-73e-4, -0.0427, -0.2185], r: [-0.249, 0.0162, 0.627, 0.738] },
    { t: [0.0314, -68e-4, -0.133], r: [0.1126, 0.213, -0.1468, 0.9594] },
    { t: [0.0035, 0.014, -0.1987], r: [-0.5177, 0.1865, 0.0124, 0.8349] },
    { t: [-86e-4, -0.0192, -0.2148], r: [0.9671, -0.1129, -0.1466, -0.1747] },
    { t: [-31e-4, -0.0274, -0.1952], r: [0.9714, -0.0492, -0.2057, 0.1081] },
    { t: [0.0063, -0.0222, -0.1749], r: [0.9714, -0.0492, -0.2057, 0.1081] },
    { t: [0.0441, -73e-4, -0.137], r: [0.1251, 0.1341, -0.1467, 0.972] },
    { t: [0.0283, 0.0126, -0.2028], r: [-0.5227, 0.1469, -0.0852, 0.8354] },
    { t: [0.0144, -0.0224, -0.2202], r: [0.9399, -0.2078, -0.0451, -0.2671] },
    { t: [0.0137, -0.0382, -0.1948], r: [0.9665, -0.181, -0.1188, 0.1381] },
    { t: [0.0207, -0.0318, -0.1726], r: [0.9665, -0.181, -0.1188, 0.1381] },
    { t: [0.0559, -0.0112, -0.1379], r: [0.0948, 0.0732, -0.1351, 0.9836] },
    { t: [0.0482, 0.0022, -0.2011], r: [-0.5015, 0.1223, -0.1588, 0.8416] },
    { t: [0.0337, -0.0294, -0.2191], r: [0.9432, -0.2267, 0.0156, -0.2423] },
    { t: [0.0294, -0.0438, -0.1916], r: [0.9569, -0.2379, -0.08, 0.1464] },
    { t: [0.0346, -0.0376, -0.1714], r: [0.9569, -0.2379, -0.08, 0.1464] },
    { t: [0.0662, -0.0164, -0.1368], r: [0.0546, -84e-4, -0.1349, 0.9893] },
    { t: [0.068, -0.0102, -0.1955], r: [-0.4587, 0.1335, -0.2099, 0.853] },
    { t: [0.0529, -0.0353, -0.2127], r: [0.9107, -0.2444, 0.0606, -0.3274] },
    { t: [0.0466, -0.0483, -0.1959], r: [0.9518, -0.3056, -0.0236, 0.0063] },
    { t: [0.0488, -0.0485, -0.1773], r: [0.9518, -0.3056, -0.0236, 0.0063] },
];

const LEFT_HAND_PINCHING = [
    { t: [-0.05, -0.08, -0.1], r: [0.5373, 0, 0, 0.8434], s: [1, 1, 1] },
    {
        t: [-0.0281, -0.0594, -0.1165],
        r: [0.3072, -0.0483, -0.257, 0.915],
        s: [1, 1, 1],
    },
    {
        t: [-83e-4, -0.0299, -0.1581],
        r: [0.1832, 0.0632, -0.4718, 0.8602],
        s: [1, 1, 1],
    },
    {
        t: [-69e-4, -0.0195, -0.1841],
        r: [0.2232, 0.1362, -0.6112, 0.747],
        s: [1, 1, 0.9999],
    },
    {
        t: [-63e-4, -51e-4, -0.2109],
        r: [0.2232, 0.1362, -0.6112, 0.747],
        s: [1, 1, 0.9999],
    },
    {
        t: [-0.0369, -0.0541, -0.112],
        r: [0.5858, -0.1038, 0.0205, 0.8035],
        s: [1, 1, 1],
    },
    {
        t: [-0.024, 0.0142, -0.1465],
        r: [0.1342, -0.1392, -0.0707, 0.9786],
        s: [1.0001, 1, 0.9999],
    },
    {
        t: [-0.0122, 0.0248, -0.1828],
        r: [-0.2614, -0.0983, -0.1184, 0.9529],
        s: [1.0001, 0.9999, 0.9999],
    },
    {
        t: [-95e-4, 0.0131, -0.2017],
        r: [-0.3454, -0.0506, -0.1338, 0.9275],
        s: [1, 0.9999, 1],
    },
    {
        t: [-98e-4, -28e-4, -0.219],
        r: [-0.3454, -0.0506, -0.1338, 0.9275],
        s: [1, 0.9999, 1],
    },
    {
        t: [-0.0498, -0.0529, -0.1126],
        r: [0.5552, -0.0196, 0.0307, 0.8309],
        s: [1.0001, 1, 1],
    },
    {
        t: [-0.0496, 0.0131, -0.1444],
        r: [0.3957, -0.0669, 0.0916, 0.9113],
        s: [1, 0.9999, 1],
    },
    {
        t: [-0.0477, 0.0443, -0.173],
        r: [0.0284, -0.1256, 0.0276, 0.9913],
        s: [1, 1, 0.9999],
    },
    {
        t: [-0.0403, 0.0463, -0.2027],
        r: [-0.1956, -0.1387, -7e-3, 0.9708],
        s: [1.0001, 1, 1],
    },
    {
        t: [-0.0339, 0.036, -0.224],
        r: [-0.1956, -0.1387, -7e-3, 0.9708],
        s: [1.0001, 1, 1],
    },
    {
        t: [-0.0612, -0.0561, -0.1137],
        r: [0.5088, 0.0591, 0.0245, 0.8585],
        s: [1, 1.0001, 1],
    },
    {
        t: [-0.0697, 0.0021, -0.1467],
        r: [0.464, -0.0595, 0.1601, 0.8692],
        s: [1, 1, 1],
    },
    {
        t: [-0.0713, 0.0348, -0.1698],
        r: [0.0595, -0.1373, 0.0948, 0.9842],
        s: [1.0001, 1.0001, 1],
    },
    {
        t: [-0.0633, 0.0395, -0.2003],
        r: [-0.1735, -0.159, 0.0354, 0.9713],
        s: [1, 1, 0.9999],
    },
    {
        t: [-0.0561, 0.0313, -0.2197],
        r: [-0.1735, -0.159, 0.0354, 0.9713],
        s: [1, 1, 0.9999],
    },
    {
        t: [-0.0707, -0.0617, -0.1146],
        r: [0.4573, 0.1467, 0.0408, 0.8762],
        s: [1, 1, 1],
    },
    {
        t: [-0.0889, -0.0132, -0.148],
        r: [0.4065, 0.0051, 0.2314, 0.8838],
        s: [1, 0.9999, 1.0001],
    },
    {
        t: [-0.0946, 0.0109, -0.1723],
        r: [0.1595, -0.0578, 0.2175, 0.9612],
        s: [1, 0.9999, 1],
    },
    {
        t: [-0.094, 0.019, -0.1934],
        r: [-0.0122, -0.1189, 0.1509, 0.9813],
        s: [1.0001, 1, 1],
    },
    {
        t: [-0.0904, 0.0182, -0.2123],
        r: [-0.0122, -0.1189, 0.1509, 0.9813],
        s: [1.0001, 1, 1],
    },
];
const RIGHT_HAND_PINCHING = [
    { t: [0.05, -0.08, -0.1], r: [0.5373, 0, 0, 0.8434], s: [1, 1, 1] },
    {
        t: [0.0279, -0.0593, -0.1166],
        r: [0.307, 0.046, 0.2483, 0.9176],
        s: [1, 1, 1],
    },
    {
        t: [0.0082, -0.0291, -0.1587],
        r: [0.1833, -0.0669, 0.4657, 0.8632],
        s: [0.9999, 1, 1],
    },
    {
        t: [0.0071, -0.0186, -0.185],
        r: [0.2256, -0.1369, 0.6093, 0.7477],
        s: [1, 1, 0.9999],
    },
    {
        t: [0.0064, -39e-4, -0.212],
        r: [0.2256, -0.1369, 0.6093, 0.7477],
        s: [1, 1, 0.9999],
    },
    {
        t: [0.037, -0.0539, -0.1122],
        r: [0.5831, 0.1146, -0.0388, 0.8034],
        s: [1, 0.9999, 1],
    },
    {
        t: [0.0237, 0.0153, -0.147],
        r: [0.1209, 0.0891, 0.0196, 0.9885],
        s: [1, 0.9999, 1],
    },
    {
        t: [0.0163, 0.0257, -0.1849],
        r: [-0.2747, 0.0723, 0.0511, 0.9574],
        s: [1, 0.9999, 0.9999],
    },
    {
        t: [0.014, 0.0138, -0.204],
        r: [-0.3165, 0.0337, 0.0633, 0.9459],
        s: [1, 0.9999, 1],
    },
    {
        t: [0.0136, -12e-4, -0.2226],
        r: [-0.3165, 0.0337, 0.0633, 0.9459],
        s: [1, 0.9999, 1],
    },
    {
        t: [0.0501, -0.0527, -0.1126],
        r: [0.5625, 0.0291, -0.0455, 0.825],
        s: [1, 1, 1],
    },
    {
        t: [0.0497, 0.0141, -0.1449],
        r: [0.3465, 0.0658, -0.0921, 0.9312],
        s: [1.0001, 0.9999, 0.9999],
    },
    {
        t: [0.0473, 0.0424, -0.177],
        r: [0.0559, 0.1235, -0.0403, 0.9899],
        s: [1.0001, 1, 0.9999],
    },
    {
        t: [0.0402, 0.0463, -0.2069],
        r: [-0.0703, 0.1381, -0.0195, 0.9877],
        s: [1.0001, 1, 0.9999],
    },
    {
        t: [0.0335, 0.0419, -0.2304],
        r: [-0.0703, 0.1381, -0.0195, 0.9877],
        s: [1.0001, 1, 0.9999],
    },
    {
        t: [0.0615, -0.0561, -0.1136],
        r: [0.5287, -0.0513, -0.0363, 0.8465],
        s: [1.0001, 1, 0.9999],
    },
    {
        t: [0.07, 0.003, -0.1472],
        r: [0.4197, 0.0598, -0.1607, 0.8913],
        s: [1, 1, 0.9999],
    },
    {
        t: [0.0709, 0.0336, -0.1737],
        r: [0.1329, 0.1258, -0.1128, 0.9766],
        s: [1, 1, 1],
    },
    {
        t: [0.0643, 0.0431, -0.2038],
        r: [-0.0172, 0.145, -0.068, 0.9869],
        s: [1.0001, 0.9999, 1],
    },
    {
        t: [0.0577, 0.0418, -0.2253],
        r: [-0.0172, 0.145, -0.068, 0.9869],
        s: [1.0001, 0.9999, 1],
    },
    {
        t: [0.0711, -0.0617, -0.1145],
        r: [0.4861, -0.139, -0.0517, 0.8612],
        s: [1.0001, 0.9999, 1],
    },
    {
        t: [0.0893, -0.0125, -0.1485],
        r: [0.317, 0.0459, -0.2224, 0.9208],
        s: [1.0001, 0.9999, 1],
    },
    {
        t: [0.0902, 0.0078, -0.1772],
        r: [0.1921, 0.0784, -0.2077, 0.9559],
        s: [1, 1, 0.9999],
    },
    {
        t: [0.0889, 0.0174, -0.1979],
        r: [0.0936, 0.1253, -0.1462, 0.9768],
        s: [1.0001, 1, 1],
    },
    {
        t: [0.0857, 0.0208, -0.2167],
        r: [0.0936, 0.1253, -0.1462, 0.9768],
        s: [1.0001, 1, 1],
    },
];

const LEFT_HAND_POINTING = [
    { t: [-0.0283, -0.0376, -0.0293], r: [0.1372, -0.208, 0.241, 0.938] },
    { t: [0.0016, -0.0246, -0.0431], r: [0.0106, -0.3992, -14e-4, 0.9168] },
    { t: [0.0392, -0.0237, -0.0781], r: [-0.1, -0.2869, -0.466, 0.831] },
    { t: [0.0496, -0.0357, -0.1004], r: [-0.1511, -0.183, -0.4918, 0.8377] },
    { t: [0.0533, -0.0497, -0.1265], r: [-0.1511, -0.183, -0.4918, 0.8377] },
    { t: [-78e-4, -0.0226, -0.0496], r: [0.1168, -0.3031, 0.3253, 0.8881] },
    { t: [0.0265, 0.0074, -0.1082], r: [0.0563, -0.1303, 0.2725, 0.9516] },
    { t: [0.0346, 0.0153, -0.1453], r: [-0.0635, -0.1606, 0.2541, 0.9516] },
    { t: [0.0419, 0.0144, -0.1659], r: [-0.1073, -0.1342, 0.2464, 0.9538] },
    { t: [0.0494, 0.0105, -0.1873], r: [-0.1073, -0.1342, 0.2464, 0.9538] },
    { t: [-0.0184, -0.0273, -0.0562], r: [0.1156, -0.2249, 0.3238, 0.9117] },
    { t: [0.0052, -21e-4, -0.1177], r: [-0.4452, -0.2871, 0.2041, 0.8233] },
    { t: [0.0324, -0.0274, -0.1363], r: [0.8476, 0.3909, 0.031, -0.3574] },
    { t: [0.0392, -0.0465, -0.1142], r: [0.9167, 0.3645, 0.16, -0.0352] },
    { t: [0.032, -0.0501, -0.0915], r: [0.9167, 0.3645, 0.16, -0.0352] },
    { t: [-0.028, -0.0348, -0.0593], r: [0.0757, -0.1724, 0.308, 0.9326] },
    { t: [-0.01, -0.0186, -0.1201], r: [-0.5151, -0.3075, 0.2332, 0.7654] },
    { t: [0.018, -0.0439, -0.1306], r: [0.8841, 0.4115, 0.0419, -0.2175] },
    { t: [0.0214, -0.0572, -0.1026], r: [0.8915, 0.3885, 0.1955, 0.1266] },
    { t: [0.0111, -0.0549, -0.0835], r: [0.8915, 0.3885, 0.1955, 0.1266] },
    { t: [-0.0357, -0.0434, -0.0601], r: [0.0242, -0.0998, 0.3079, 0.9459] },
    { t: [-0.0254, -0.037, -0.1183], r: [-0.4608, -0.35, 0.2807, 0.7658] },
    { t: [0.0022, -0.0544, -0.1281], r: [0.8346, 0.4535, 0.0038, -0.3127] },
    { t: [0.0089, -0.0663, -0.1107], r: [0.8657, 0.4769, 0.1519, -59e-4] },
    { t: [0.003, -0.0699, -0.0932], r: [0.8657, 0.4769, 0.1519, -59e-4] },
];
const RIGHT_HAND_POINTING = [
    { t: [-42e-4, -0.0248, -0.0222], r: [0.1163, -95e-4, -0.3006, 0.9466] },
    { t: [-0.024, -0.0114, -0.048], r: [-0.052, 0.2376, -0.0719, 0.9673] },
    { t: [-0.0482, -0.0149, -0.0937], r: [-0.2324, 0.2162, 0.3797, 0.869] },
    { t: [-0.0535, -0.0306, -0.1155], r: [-0.2846, 0.1212, 0.4068, 0.8595] },
    { t: [-0.0521, -0.0492, -0.1388], r: [-0.2846, 0.1212, 0.4068, 0.8595] },
    { t: [-0.0129, -0.0119, -0.0508], r: [0.1258, 0.0866, -0.3895, 0.9083] },
    { t: [-0.0173, 0.01, -0.1215], r: [0.1174, -0.0564, -0.3421, 0.9306] },
    { t: [-97e-4, 0.018, -0.1587], r: [-0.0512, 0.0028, -0.347, 0.9365] },
    { t: [-0.0105, 0.0158, -0.1805], r: [-0.1583, 0.003, -0.3458, 0.9249] },
    { t: [-0.0137, 0.0085, -0.2021], r: [-0.1583, 0.003, -0.3458, 0.9249] },
    { t: [-17e-4, -0.019, -0.052], r: [0.1155, 0.0062, -0.386, 0.9152] },
    { t: [0.0038, -37e-4, -0.1206], r: [-0.2494, 0.0619, -0.3947, 0.8822] },
    { t: [-86e-4, -0.0197, -0.1569], r: [-0.7146, 0.3231, -0.2612, 0.5628] },
    { t: [-0.0306, -0.0389, -0.1502], r: [0.8643, -0.4054, 0.1306, -0.2676] },
    { t: [-0.0406, -0.0469, -0.1297], r: [0.8643, -0.4054, 0.1306, -0.2676] },
    { t: [0.0068, -0.0279, -0.0499], r: [0.0671, -0.0438, -0.3807, 0.9212] },
    { t: [0.0155, -0.022, -0.1146], r: [-0.3096, 0.1005, -0.4385, 0.8377] },
    { t: [-22e-4, -0.0389, -0.1452], r: [0.7388, -0.369, 0.2794, -0.4899] },
    { t: [-0.0264, -0.0553, -0.1341], r: [0.852, -0.4611, 0.1257, -0.214] },
    { t: [-0.0346, -0.0602, -0.1146], r: [0.852, -0.4611, 0.1257, -0.214] },
    { t: [0.0126, -0.0374, -0.0464], r: [0.0105, -0.1129, -0.3882, 0.9146] },
    { t: [0.0254, -0.0415, -0.1045], r: [-0.3088, 0.1125, -0.4825, 0.8119] },
    { t: [0.0078, -0.0548, -0.1304], r: [-0.6368, 0.3211, -0.3767, 0.5912] },
    { t: [-0.0112, -0.0661, -0.1307], r: [0.7535, -0.4639, 0.2523, -0.3916] },
    { t: [-0.0244, -0.0737, -0.1196], r: [0.7535, -0.4639, 0.2523, -0.3916] },
];

const LEFT_HAND_RELAXED = [
    { t: [-0.05, -0.08, -0.1], r: [0.5373, 0, 0, 0.8434] },
    { t: [-0.0281, -0.0594, -0.1165], r: [0.3943, -0.2036, -0.3103, 0.8407] },
    { t: [0.0026, -0.0299, -0.1518], r: [0.3476, -0.1049, -0.5285, 0.7674] },
    { t: [0.0169, -0.0181, -0.1728], r: [0.3521, 0.0515, -0.635, 0.6857] },
    { t: [0.0268, -18e-4, -0.1966], r: [0.3521, 0.0515, -0.635, 0.6857] },
    { t: [-0.0369, -0.0541, -0.1121], r: [0.5882, -0.1036, 0.0205, 0.8018] },
    { t: [-0.024, 0.0143, -0.1465], r: [0.3269, -0.0887, -3e-4, 0.9409] },
    { t: [-0.0172, 0.0394, -0.1765], r: [-0.0114, -0.0813, -0.0286, 0.9962] },
    { t: [-0.0138, 0.0388, -0.1986], r: [-0.1994, -0.0379, -0.0372, 0.9785] },
    { t: [-0.0125, 0.0287, -0.2199], r: [-0.1994, -0.0379, -0.0372, 0.9785] },
    { t: [-0.0499, -0.0528, -0.1125], r: [0.5569, -0.0203, 0.0319, 0.8297] },
    { t: [-0.0496, 0.0131, -0.1445], r: [0.3908, -0.0273, 0.1089, 0.9136] },
    { t: [-0.0513, 0.0438, -0.1738], r: [0.0747, -0.0923, 0.0634, 0.9909] },
    { t: [-0.0462, 0.0488, -0.2036], r: [-0.1936, -0.1156, 0.0299, 0.9738] },
    { t: [-0.0404, 0.0387, -0.2253], r: [-0.1936, -0.1156, 0.0299, 0.9738] },
    { t: [-0.0612, -0.0561, -0.1138], r: [0.5095, 0.0572, 0.0274, 0.8581] },
    { t: [-0.0698, 0.0022, -0.1468], r: [0.4396, -68e-4, 0.1748, 0.881] },
    { t: [-0.0751, 0.0329, -0.1719], r: [0.071, -0.0911, 0.1344, 0.9842] },
    { t: [-0.0703, 0.0383, -0.2029], r: [-0.1764, -0.1244, 0.0831, 0.9729] },
    { t: [-0.0641, 0.0302, -0.2227], r: [-0.1764, -0.1244, 0.0831, 0.9729] },
    { t: [-0.0708, -0.0616, -0.1145], r: [0.4571, 0.1437, 0.0457, 0.8765] },
    { t: [-0.0889, -0.0132, -0.148], r: [0.3971, 0.0569, 0.2436, 0.883] },
    { t: [-0.098, 0.0096, -0.1727], r: [0.1604, -85e-4, 0.243, 0.9566] },
    { t: [-0.0997, 0.0171, -0.194], r: [-34e-4, -0.0735, 0.1859, 0.9798] },
    { t: [-0.0979, 0.0165, -0.2131], r: [-34e-4, -0.0735, 0.1859, 0.9798] },
];
const RIGHT_HAND_RELAXED = [
    { t: [0.05, -0.08, -0.1], r: [0.5373, 0, 0, 0.8434] },
    { t: [0.0279, -0.0592, -0.1167], r: [0.3237, 0.1161, 0.293, 0.8921] },
    { t: [0.0026, -0.0313, -0.158], r: [0.2171, 0.0194, 0.5207, 0.8254] },
    { t: [-42e-4, -0.0219, -0.1837], r: [0.2597, -0.0685, 0.6498, 0.711] },
    { t: [-0.01, -84e-4, -0.2107], r: [0.2597, -0.0685, 0.6498, 0.711] },
    { t: [0.037, -0.0539, -0.1123], r: [0.5808, 0.1164, -0.0414, 0.8046] },
    { t: [0.0238, 0.0151, -0.147], r: [0.3081, 0.0484, -0.0273, 0.9497] },
    { t: [0.0206, 0.0393, -0.1786], r: [-0.0461, 0.0526, -0.0104, 0.9975] },
    { t: [0.0185, 0.0373, -0.201], r: [-0.1674, 0.0162, -64e-4, 0.9857] },
    { t: [0.0177, 0.0287, -0.223], r: [-0.1674, 0.0162, -64e-4, 0.9857] },
    { t: [0.05, -0.0527, -0.1126], r: [0.5619, 0.0306, -0.0478, 0.8252] },
    { t: [0.0497, 0.0138, -0.1449], r: [0.353, 0.0474, -0.1014, 0.9289] },
    { t: [0.0491, 0.0425, -0.1767], r: [0.0777, 0.1076, -0.0559, 0.9896] },
    { t: [0.0431, 0.0478, -0.2066], r: [-0.0679, 0.1248, -0.0343, 0.9893] },
    { t: [0.0369, 0.0436, -0.2302], r: [-0.0679, 0.1248, -0.0343, 0.9893] },
    { t: [0.0614, -0.0561, -0.1136], r: [0.5303, -0.05, -0.0384, 0.8455] },
    { t: [0.0699, 0.0028, -0.1472], r: [0.4168, 0.0427, -0.1662, 0.8926] },
    { t: [0.0722, 0.0331, -0.1739], r: [0.1339, 0.1107, -0.1236, 0.977] },
    { t: [0.0665, 0.0425, -0.2041], r: [-0.0175, 0.1318, -0.0809, 0.9878] },
    { t: [0.0606, 0.0413, -0.2257], r: [-0.0175, 0.1318, -0.0809, 0.9878] },
    { t: [0.0711, -0.0618, -0.1145], r: [0.4891, -0.1378, -0.0535, 0.8596] },
    { t: [0.0892, -0.0127, -0.1484], r: [0.3439, 0.0196, -0.23, 0.9102] },
    { t: [0.0924, 0.0087, -0.1761], r: [0.1965, 0.0585, -0.2173, 0.9543] },
    { t: [0.0921, 0.0184, -0.1968], r: [0.0936, 0.1069, -0.1575, 0.9773] },
    { t: [0.0896, 0.0217, -0.2157], r: [0.0936, 0.1069, -0.1575, 0.9773] },
];

const LEFT_HAND_ROCK = [
    {
        t: [-0.0123, -0.0183, -0.0267],
        r: [0.5149, -0.0845, -0.1158, 0.8452],
        s: [1, 1, 1],
    },
    {
        t: [0.0153, -52e-4, -0.0437],
        r: [0.2665, -0.0899, -0.3721, 0.8846],
        s: [1, 1, 1],
    },
    {
        t: [0.0335, 0.0154, -0.0867],
        r: [0.0177, 0.1842, -0.6731, 0.716],
        s: [1, 1, 1],
    },
    {
        t: [0.0267, 0.0228, -0.1122],
        r: [0.0728, 0.2226, -0.6735, 0.7011],
        s: [1, 1, 1],
    },
    {
        t: [0.019, 0.0341, -0.1386],
        r: [0.0728, 0.2226, -0.6735, 0.7011],
        s: [1, 1, 1],
    },
    {
        t: [0.0067, 0.0029, -0.0406],
        r: [0.475, -0.2118, -0.0726, 0.851],
        s: [1, 1, 1],
    },
    {
        t: [0.0388, 0.061, -0.0749],
        r: [0.5779, -0.1002, -0.0602, 0.8077],
        s: [1, 1, 1],
    },
    {
        t: [0.0481, 0.097, -0.086],
        r: [0.5059, -0.0922, -0.0672, 0.855],
        s: [1, 1, 1],
    },
    {
        t: [0.0529, 0.1158, -0.0964],
        r: [0.4458, -0.0565, -0.053, 0.8918],
        s: [1, 1, 1],
    },
    {
        t: [0.0562, 0.1334, -0.1107],
        r: [0.4458, -0.0565, -0.053, 0.8918],
        s: [1, 1, 1],
    },
    {
        t: [-52e-4, 0.0075, -0.0412],
        r: [0.5055, -0.126, -0.0623, 0.8513],
        s: [1, 1, 1],
    },
    {
        t: [0.0144, 0.0671, -0.0735],
        r: [0.1227, -0.0631, -0.0269, 0.9901],
        s: [1, 1, 1],
    },
    {
        t: [0.0199, 0.0775, -0.1133],
        r: [-0.4479, -0.0687, -0.0876, 0.8871],
        s: [1, 1, 1],
    },
    {
        t: [0.0211, 0.0534, -0.1312],
        r: [-0.6828, -0.0523, -0.1046, 0.7212],
        s: [1, 1, 1],
    },
    {
        t: [0.0192, 0.0294, -0.1316],
        r: [-0.6828, -0.0523, -0.1046, 0.7212],
        s: [1, 1, 1],
    },
    {
        t: [-0.0167, 0.0074, -0.0424],
        r: [0.491, -0.0372, -0.0778, 0.8669],
        s: [1, 1, 1],
    },
    {
        t: [-75e-4, 0.0623, -0.0758],
        r: [0.1717, -0.0904, 0.0273, 0.9806],
        s: [1, 1, 1],
    },
    {
        t: [-7e-4, 0.0753, -0.1121],
        r: [-0.3257, -0.1136, -0.0418, 0.9377],
        s: [1, 1, 1],
    },
    {
        t: [0.005, 0.0561, -0.1361],
        r: [-0.5492, -0.1111, -0.0905, 0.8233],
        s: [1, 1, 1],
    },
    {
        t: [0.0066, 0.0356, -0.1433],
        r: [-0.5492, -0.1111, -0.0905, 0.8233],
        s: [1, 1, 1],
    },
    {
        t: [-0.0273, 0.0051, -0.0431],
        r: [0.4566, 0.0629, -0.0766, 0.8841],
        s: [1, 1, 1],
    },
    {
        t: [-0.0297, 0.0531, -0.0769],
        r: [0.3942, -35e-4, 0.1163, 0.9116],
        s: [1, 1, 1],
    },
    {
        t: [-0.0317, 0.0768, -0.1013],
        r: [0.4582, 0.0006, 0.1099, 0.882],
        s: [1, 1, 1],
    },
    {
        t: [-0.0341, 0.0951, -0.1136],
        r: [0.4085, -0.0179, 0.0535, 0.911],
        s: [1, 1, 1],
    },
    {
        t: [-0.0354, 0.1086, -0.1266],
        r: [0.4085, -0.0179, 0.0535, 0.911],
        s: [1, 1, 1],
    },
];
const RIGHT_HAND_ROCK = [
    {
        t: [0.0015, -0.0417, -0.0513],
        r: [0.5617, 0.0123, 0.1355, 0.8161],
        s: [1, 1, 1],
    },
    {
        t: [-0.0235, -0.025, -0.07],
        r: [0.2818, 0.0046, 0.4006, 0.8718],
        s: [1, 1, 1],
    },
    {
        t: [-0.0354, -1e-4, -0.1128],
        r: [-0.0257, -0.2764, 0.6652, 0.6931],
        s: [1, 1, 1],
    },
    {
        t: [-0.0238, 0.0089, -0.1359],
        r: [-6e-4, -0.3419, 0.6556, 0.6733],
        s: [1, 1, 1],
    },
    {
        t: [-88e-4, 0.0215, -0.1584],
        r: [-6e-4, -0.3419, 0.6556, 0.6733],
        s: [1, 1, 1],
    },
    {
        t: [-0.015, -0.0179, -0.0645],
        r: [0.5302, 0.1299, 0.1154, 0.8299],
        s: [1, 1, 1],
    },
    {
        t: [-0.0403, 0.0456, -0.0947],
        r: [0.5874, 0.0115, 0.0813, 0.8051],
        s: [1, 1, 1],
    },
    {
        t: [-0.0451, 0.0825, -0.1058],
        r: [0.5048, 0.001, 0.0806, 0.8595],
        s: [1, 1, 1],
    },
    {
        t: [-0.0468, 0.1015, -0.1165],
        r: [0.4494, -0.0352, 0.0601, 0.8906],
        s: [1, 1, 1],
    },
    {
        t: [-0.0465, 0.1195, -0.1308],
        r: [0.4494, -0.0352, 0.0601, 0.8906],
        s: [1, 1, 1],
    },
    {
        t: [-29e-4, -0.0139, -0.063],
        r: [0.5567, 0.046, 0.0996, 0.8234],
        s: [1, 1, 1],
    },
    {
        t: [-0.016, 0.0502, -0.0895],
        r: [0.1657, -0.0189, 0.0053, 0.986],
        s: [1, 1, 1],
    },
    {
        t: [-0.0146, 0.0642, -0.1285],
        r: [-0.4455, 0.0104, 0.0258, 0.8948],
        s: [1, 1, 1],
    },
    {
        t: [-0.0143, 0.0404, -0.1468],
        r: [-0.7027, 0.0133, 0.0292, 0.7107],
        s: [1, 1, 1],
    },
    {
        t: [-0.0137, 0.0163, -0.146],
        r: [-0.7027, 0.0133, 0.0292, 0.7107],
        s: [1, 1, 1],
    },
    {
        t: [0.0087, -0.0144, -0.0627],
        r: [0.5389, -0.0411, 0.1061, 0.8346],
        s: [1, 1, 1],
    },
    {
        t: [0.0058, 0.0446, -0.0897],
        r: [0.2331, 0.0139, -0.0389, 0.9716],
        s: [1, 1, 1],
    },
    {
        t: [0.0052, 0.0621, -0.1248],
        r: [-0.3041, 0.0513, -24e-4, 0.9512],
        s: [1, 1, 1],
    },
    {
        t: [0.0022, 0.0442, -0.1503],
        r: [-0.5472, 0.0609, 0.0335, 0.8341],
        s: [1, 1, 1],
    },
    {
        t: [0.0009, 0.0239, -0.1579],
        r: [-0.5472, 0.0609, 0.0335, 0.8341],
        s: [1, 1, 1],
    },
    {
        t: [0.0194, -0.0172, -0.0627],
        r: [0.5054, -0.1365, 0.0899, 0.8473],
        s: [1, 1, 1],
    },
    {
        t: [0.0276, 0.0346, -0.0893],
        r: [0.4597, -0.0527, -0.1093, 0.8797],
        s: [1, 1, 1],
    },
    {
        t: [0.0334, 0.0611, -0.1099],
        r: [0.5162, -0.056, -0.0989, 0.8489],
        s: [1, 1, 1],
    },
    {
        t: [0.0378, 0.0805, -0.1194],
        r: [0.4448, -0.0407, -0.0462, 0.8935],
        s: [1, 1, 1],
    },
    {
        t: [0.0411, 0.0949, -0.1311],
        r: [0.4448, -0.0407, -0.0462, 0.8935],
        s: [1, 1, 1],
    },
];

const LEFT_HAND_THUMBS_DOWN = [
    {
        t: [-0.0169, 0.0317, -0.0845],
        r: [0.2721, -0.3488, -0.6314, 0.6369],
        s: [1, 1, 1],
    },
    {
        t: [-19e-4, 0.008, -0.1021],
        r: [-0.0533, 0.5043, 0.7891, -0.3467],
        s: [1, 1, 1],
    },
    {
        t: [0.0208, -0.0318, -0.1276],
        r: [-0.2229, 0.6138, 0.7555, 0.0539],
        s: [1, 1, 1],
    },
    {
        t: [0.0282, -0.0578, -0.1318],
        r: [-0.2724, 0.6476, 0.7112, 0.0242],
        s: [1, 1, 1],
    },
    {
        t: [0.0389, -0.0856, -0.1338],
        r: [-0.2724, 0.6476, 0.7112, 0.0242],
        s: [1, 1, 1],
    },
    {
        t: [0.0046, 0.0177, -0.0997],
        r: [0.1919, -0.3993, -0.6438, 0.6238],
        s: [1, 1, 1],
    },
    {
        t: [0.0618, -34e-4, -0.1463],
        r: [-0.1884, 0.0883, -0.6795, 0.7035],
        s: [1, 1, 1],
    },
    {
        t: [0.0481, -93e-4, -0.1821],
        r: [0.6204, -0.5352, 0.4297, -0.3794],
        s: [1, 1, 1],
    },
    {
        t: [0.0275, -94e-4, -0.1746],
        r: [0.6806, -0.6532, 0.2814, -0.176],
        s: [1, 1, 1],
    },
    {
        t: [0.0141, -64e-4, -0.1561],
        r: [0.6806, -0.6532, 0.2814, -0.176],
        s: [1, 1, 1],
    },
    {
        t: [0.0062, 0.0299, -0.1019],
        r: [0.2399, -0.3631, -0.598, 0.6731],
        s: [1, 1, 1],
    },
    {
        t: [0.0621, 0.0218, -0.1466],
        r: [-0.241, 0.1225, -0.6156, 0.7403],
        s: [1, 1, 1],
    },
    {
        t: [0.0427, 0.0133, -0.1823],
        r: [0.7097, -0.4862, 0.373, -0.3475],
        s: [1, 1, 1],
    },
    {
        t: [0.0165, 0.0095, -0.1681],
        r: [0.7968, -0.5892, 0.1321, -0.0209],
        s: [1, 1, 1],
    },
    {
        t: [0.0119, 0.0128, -0.1447],
        r: [0.7968, -0.5892, 0.1321, -0.0209],
        s: [1, 1, 1],
    },
    {
        t: [0.0033, 0.0406, -0.1037],
        r: [0.2574, -0.3085, -0.5681, 0.7183],
        s: [1, 1, 1],
    },
    {
        t: [0.052, 0.0419, -0.1485],
        r: [-0.2306, 0.1278, -0.5499, 0.7925],
        s: [1, 1, 1],
    },
    {
        t: [0.0339, 0.0328, -0.182],
        r: [0.7575, -0.4754, 0.2861, -0.344],
        s: [1, 1, 1],
    },
    {
        t: [0.0099, 0.025, -0.1634],
        r: [0.843, -0.5293, 0.0926, -0.0248],
        s: [1, 1, 1],
    },
    {
        t: [0.0068, 0.0266, -0.142],
        r: [0.843, -0.5293, 0.0926, -0.0248],
        s: [1, 1, 1],
    },
    {
        t: [-18e-4, 0.0508, -0.104],
        r: [0.2798, -0.2351, -0.5355, 0.7614],
        s: [1, 1, 1],
    },
    {
        t: [0.0378, 0.0613, -0.1483],
        r: [-0.1652, 0.0952, -0.5046, 0.842],
        s: [1, 1, 1],
    },
    {
        t: [0.0259, 0.054, -0.1792],
        r: [0.7429, -0.4404, 0.2677, -0.4273],
        s: [1, 1, 1],
    },
    {
        t: [0.0084, 0.0449, -0.169],
        r: [0.8704, -0.4542, 0.1121, -0.1532],
        s: [1, 1, 1],
    },
    {
        t: [0.002, 0.0431, -0.1514],
        r: [0.8704, -0.4542, 0.1121, -0.1532],
        s: [1, 1, 1],
    },
];
const RIGHT_HAND_THUMBS_DOWN = [
    {
        t: [0.0237, 0.033, -0.083],
        r: [0.325, 0.2979, 0.5612, 0.7004],
        s: [1, 1, 1],
    },
    {
        t: [0.0039, 0.0142, -0.1018],
        r: [0.0744, 0.4501, 0.7672, 0.4508],
        s: [1, 1, 1],
    },
    {
        t: [-0.0239, -0.0191, -0.133],
        r: [0.2089, 0.5732, 0.7915, 0.0363],
        s: [1, 1, 1],
    },
    {
        t: [-0.0341, -0.0435, -0.1401],
        r: [0.2664, 0.6251, 0.7316, 0.0555],
        s: [1, 1, 1],
    },
    {
        t: [-0.0476, -0.0698, -0.144],
        r: [0.2664, 0.6251, 0.7316, 0.0555],
        s: [1, 1, 1],
    },
    {
        t: [-3e-4, 0.0251, -0.0989],
        r: [0.2488, 0.3591, 0.5717, 0.6944],
        s: [1, 1, 1],
    },
    {
        t: [-0.0603, 0.0201, -0.1463],
        r: [-0.2217, -0.1036, 0.5936, 0.7667],
        s: [1, 1, 1],
    },
    {
        t: [-0.045, 0.0116, -0.1809],
        r: [0.681, 0.4806, -0.3657, -0.4143],
        s: [1, 1, 1],
    },
    {
        t: [-0.0253, 0.0071, -0.1724],
        r: [0.7487, 0.5817, -0.2444, -0.2032],
        s: [1, 1, 1],
    },
    {
        t: [-0.0121, 0.0068, -0.1535],
        r: [0.7487, 0.5817, -0.2444, -0.2032],
        s: [1, 1, 1],
    },
    {
        t: [0.001, 0.0374, -0.1005],
        r: [0.2971, 0.3158, 0.527, 0.7309],
        s: [1, 1, 1],
    },
    {
        t: [-0.0548, 0.0447, -0.1454],
        r: [-0.2475, -0.1117, 0.5236, 0.8076],
        s: [1, 1, 1],
    },
    {
        t: [-0.0369, 0.0331, -0.181],
        r: [0.759, 0.413, -0.3155, -0.3922],
        s: [1, 1, 1],
    },
    {
        t: [-0.0126, 0.0231, -0.1665],
        r: [0.8595, 0.4988, -0.1065, -0.0339],
        s: [1, 1, 1],
    },
    {
        t: [-84e-4, 0.0248, -0.1428],
        r: [0.8595, 0.4988, -0.1065, -0.0339],
        s: [1, 1, 1],
    },
    {
        t: [0.0064, 0.0472, -0.1018],
        r: [0.3122, 0.2567, 0.4998, 0.766],
        s: [1, 1, 1],
    },
    {
        t: [-0.0402, 0.0619, -0.1463],
        r: [-0.22, -0.1072, 0.4537, 0.8569],
        s: [1, 1, 1],
    },
    {
        t: [-0.025, 0.0506, -0.1806],
        r: [0.8003, 0.3914, -0.2353, -0.3886],
        s: [1, 1, 1],
    },
    {
        t: [-35e-4, 0.0369, -0.1624],
        r: [0.8979, 0.4322, -0.0728, -0.0395],
        s: [1, 1, 1],
    },
    {
        t: [-8e-4, 0.0373, -0.1409],
        r: [0.8979, 0.4322, -0.0728, -0.0395],
        s: [1, 1, 1],
    },
    {
        t: [0.0136, 0.0558, -0.1017],
        r: [0.3278, 0.1772, 0.4672, 0.8018],
        s: [1, 1, 1],
    },
    {
        t: [-0.0219, 0.0775, -0.1452],
        r: [-0.1811, -0.0932, 0.4016, 0.8929],
        s: [1, 1, 1],
    },
    {
        t: [-0.0108, 0.0677, -0.1758],
        r: [0.7842, 0.3582, -0.2073, -0.4623],
        s: [1, 1, 1],
    },
    {
        t: [0.004, 0.0547, -0.1656],
        r: [0.9158, 0.3542, -0.0821, -0.1706],
        s: [1, 1, 1],
    },
    {
        t: [0.0096, 0.0511, -0.1481],
        r: [0.9158, 0.3542, -0.0821, -0.1706],
        s: [1, 1, 1],
    },
];

const LEFT_HAND_THUMBS_UP = [
    { t: [-0.011, -0.0299, -0.0701], r: [0.1224, -0.1562, 0.6052, 0.771] },
    { t: [0.0025, -17e-4, -0.0854], r: [0.3796, -0.3776, 0.3843, 0.7521] },
    { t: [0.0162, 0.041, -0.1065], r: [0.6152, -0.1749, 0.0935, 0.763] },
    { t: [0.0204, 0.0676, -0.1116], r: [0.5992, -0.1247, 0.1335, 0.7795] },
    { t: [0.0225, 0.096, -0.1202], r: [0.5992, -0.1247, 0.1335, 0.7795] },
    { t: [-42e-4, -8e-3, -0.0928], r: [0.1427, -0.2467, 0.6763, 0.6793] },
    { t: [0.0063, 0.0312, -0.155], r: [-0.4551, -0.5645, 0.3425, 0.5974] },
    { t: [0.0447, 0.0257, -0.1538], r: [0.7509, 0.6277, 0.1981, -0.053] },
    { t: [0.0396, 0.0184, -0.1338], r: [0.7246, 0.5124, 0.4244, 0.1797] },
    { t: [0.0207, 0.0148, -0.1212], r: [0.7246, 0.5124, 0.4244, 0.1797] },
    { t: [-78e-4, -0.0192, -0.0982], r: [0.109, -0.1737, 0.6698, 0.7137] },
    { t: [-6e-4, 0.0083, -0.163], r: [-0.4929, -0.5301, 0.4215, 0.5462] },
    { t: [0.0407, 0.0046, -0.1614], r: [0.705, 0.703, 0.0897, -0.0263] },
    { t: [0.0382, -5e-4, -0.132], r: [0.6279, 0.5816, 0.4074, 0.3186] },
    { t: [0.0165, -21e-4, -0.1217], r: [0.6279, 0.5816, 0.4074, 0.3186] },
    { t: [-92e-4, -0.031, -0.0993], r: [0.0472, -0.1416, 0.6514, 0.7439] },
    { t: [0.0006, -0.0142, -0.1626], r: [-0.5202, -0.4929, 0.4819, 0.5042] },
    { t: [0.0398, -0.0159, -0.1611], r: [0.6996, 0.7076, 0.0706, 0.0696] },
    { t: [0.0338, -0.0161, -0.1304], r: [0.5876, 0.6289, 0.3607, 0.3593] },
    { t: [0.0143, -0.0168, -0.1208], r: [0.5876, 0.6289, 0.3607, 0.3593] },
    { t: [-81e-4, -0.0426, -0.0982], r: [-0.0269, -0.0934, 0.6476, 0.7558] },
    { t: [0.0026, -0.0377, -0.1578], r: [0.5435, 0.4612, -0.5243, -0.4658] },
    { t: [0.0366, -0.0376, -0.1559], r: [0.6991, 0.7017, 0.0384, 0.1318] },
    { t: [0.032, -0.0347, -0.1344], r: [0.575, 0.6796, 0.2522, 0.3795] },
    { t: [0.0166, -0.0342, -0.1237], r: [0.575, 0.6796, 0.2522, 0.3795] },
];
const RIGHT_HAND_THUMBS_UP = [
    { t: [0.0317, -0.0212, -0.089], r: [0.2199, 0.1003, -0.594, 0.7673] },
    { t: [0.0223, 0.009, -0.1042], r: [0.4294, 0.285, -0.3619, 0.7768] },
    { t: [0.0158, 0.0521, -0.1273], r: [0.6012, 0.067, -0.0513, 0.7947] },
    { t: [0.0145, 0.0784, -0.1348], r: [0.597, 0.0134, -0.0918, 0.7968] },
    { t: [0.0163, 0.1065, -0.1446], r: [0.597, 0.0134, -0.0918, 0.7968] },
    { t: [0.0303, 0.0032, -0.1103], r: [0.2434, 0.2002, -0.656, 0.6858] },
    { t: [0.0337, 0.0475, -0.1698], r: [-0.3298, 0.4729, -0.4297, 0.6949] },
    { t: [-26e-4, 0.0462, -0.1835], r: [0.7134, -0.6368, -2e-4, -0.2925] },
    { t: [-0.0107, 0.0369, -0.1654], r: [0.7745, -0.5891, -0.2133, -0.0877] },
    { t: [-47e-4, 0.0282, -0.145], r: [0.7745, -0.5891, -0.2133, -0.0877] },
    { t: [0.0347, -77e-4, -0.1158], r: [0.2088, 0.1254, -0.6589, 0.7117] },
    { t: [0.0416, 0.0251, -0.1782], r: [-0.3597, 0.4829, -0.4746, 0.6421] },
    { t: [0.0018, 0.0251, -0.19], r: [-0.673, 0.7069, -14e-4, 0.2177] },
    { t: [-77e-4, 0.0162, -0.163], r: [0.6957, -0.6456, -0.2988, 0.0994] },
    { t: [0.0063, 0.0104, -0.1443], r: [0.6957, -0.6456, -0.2988, 0.0994] },
    { t: [0.0361, -0.0196, -0.1178], r: [0.1467, 0.0923, -0.6537, 0.7367] },
    { t: [0.0398, 0.0027, -0.1801], r: [-0.3611, 0.446, -0.5466, 0.6099] },
    { t: [0.0028, 0.0047, -0.193], r: [-0.6782, 0.7246, -14e-4, 0.1226] },
    { t: [-3e-3, -6e-4, -0.1628], r: [-0.652, 0.6801, 0.2937, -0.1613] },
    { t: [0.0108, -46e-4, -0.1465], r: [-0.652, 0.6801, 0.2937, -0.1613] },
    { t: [0.0343, -0.0315, -0.1182], r: [0.0757, 0.0463, -0.6692, 0.7378] },
    { t: [0.0363, -0.021, -0.1779], r: [-0.3141, 0.3981, -0.6168, 0.602] },
    { t: [0.0062, -0.0166, -0.1931], r: [-0.6691, 0.7354, -0.0331, 0.1021] },
    { t: [0.0012, -0.0185, -0.1716], r: [-0.6175, 0.7316, 0.235, -0.168] },
    { t: [0.0116, -0.0223, -0.1564], r: [-0.6175, 0.7316, 0.235, -0.168] },
];

const LEFT_HAND_VICTORY = [
    {
        t: [-0.0485, -0.0629, -0.0748],
        r: [0.5235, 0.0269, -0.0122, 0.8515],
        s: [1, 1, 1],
    },
    {
        t: [-0.0274, -0.0424, -0.0935],
        r: [0.2683, -91e-4, -0.2476, 0.9309],
        s: [1, 1, 1],
    },
    {
        t: [-0.0197, -0.0171, -0.1372],
        r: [-0.0874, 0.2587, -0.5403, 0.7959],
        s: [1, 1, 1],
    },
    {
        t: [-0.0337, -0.0134, -0.1604],
        r: [-0.1021, 0.3471, -0.5231, 0.7717],
        s: [1, 1, 1],
    },
    {
        t: [-0.0538, -84e-4, -0.1819],
        r: [-0.1021, 0.3471, -0.5231, 0.7717],
        s: [1, 1, 1],
    },
    {
        t: [-0.0376, -0.037, -0.0897],
        r: [0.5048, -0.107, 0.0348, 0.8559],
        s: [1, 1, 1],
    },
    {
        t: [-0.0266, 0.0281, -0.1246],
        r: [0.567, -0.0696, 0.0098, 0.8207],
        s: [1, 1, 1],
    },
    {
        t: [-0.0224, 0.0646, -0.1371],
        r: [0.5031, -0.0677, 0.0059, 0.8615],
        s: [1, 1, 1],
    },
    {
        t: [-0.0201, 0.0836, -0.1477],
        r: [0.4589, -0.0365, 0.0223, 0.8874],
        s: [1, 1, 1],
    },
    {
        t: [-0.019, 0.1018, -0.1617],
        r: [0.4589, -0.0365, 0.0223, 0.8874],
        s: [1, 1, 1],
    },
    {
        t: [-0.0503, -0.0361, -0.0891],
        r: [0.5225, -0.0136, 0.0382, 0.8517],
        s: [1, 1, 1],
    },
    {
        t: [-0.0515, 0.0267, -0.1211],
        r: [0.5428, 0.1035, 0.1149, 0.8255],
        s: [1, 1, 1],
    },
    {
        t: [-0.0638, 0.0631, -0.1369],
        r: [0.5306, 0.067, 0.0906, 0.8401],
        s: [1, 1, 1],
    },
    {
        t: [-0.0702, 0.0896, -0.1495],
        r: [0.5467, 0.0608, 0.081, 0.8312],
        s: [1, 1, 1],
    },
    {
        t: [-0.0747, 0.1108, -0.1601],
        r: [0.5467, 0.0608, 0.081, 0.8312],
        s: [1, 1, 1],
    },
    {
        t: [-0.0613, -0.0396, -0.0891],
        r: [0.4925, 0.0763, 0.0204, 0.8667],
        s: [1, 1, 1],
    },
    {
        t: [-0.0712, 0.0158, -0.1219],
        r: [0.2546, -0.0246, 0.1592, 0.9535],
        s: [1, 1, 1],
    },
    {
        t: [-0.0722, 0.0349, -0.1561],
        r: [-0.2354, -0.1181, 0.1042, 0.959],
        s: [1, 1, 1],
    },
    {
        t: [-0.0638, 0.0217, -0.1832],
        r: [-0.4573, -0.1496, 0.0503, 0.8752],
        s: [1, 1, 1],
    },
    {
        t: [-0.0571, 0.0041, -0.1941],
        r: [-0.4573, -0.1496, 0.0503, 0.8752],
        s: [1, 1, 1],
    },
    {
        t: [-0.0706, -0.045, -0.0892],
        r: [0.4433, 0.1733, 0.0233, 0.8791],
        s: [1, 1, 1],
    },
    {
        t: [-0.0898, 0.0006, -0.1216],
        r: [0.0458, -0.1976, 0.107, 0.9733],
        s: [1, 1, 1],
    },
    {
        t: [-0.0762, 0.0038, -0.1526],
        r: [-0.348, -0.2273, 0.0117, 0.9095],
        s: [1, 1, 1],
    },
    {
        t: [-0.0668, -95e-4, -0.1675],
        r: [-0.5475, -0.2656, -0.0806, 0.7894],
        s: [1, 1, 1],
    },
    {
        t: [-0.0618, -0.0269, -0.1725],
        r: [-0.5475, -0.2656, -0.0806, 0.7894],
        s: [1, 1, 1],
    },
];
const RIGHT_HAND_VICTORY = [
    {
        t: [-17e-4, -0.0652, -0.0663],
        r: [0.5651, 0.0392, -0.0573, 0.8221],
        s: [1, 1, 1],
    },
    {
        t: [-0.0247, -0.042, -0.0786],
        r: [0.3207, 0.0849, 0.243, 0.9115],
        s: [1, 1, 1],
    },
    {
        t: [-0.0407, -0.0141, -0.1186],
        r: [-0.0285, -0.1953, 0.5625, 0.8029],
        s: [1, 1, 1],
    },
    {
        t: [-0.031, -94e-4, -0.1439],
        r: [-0.0751, -0.3079, 0.5331, 0.7845],
        s: [1, 1, 1],
    },
    {
        t: [-0.0133, -43e-4, -0.1673],
        r: [-0.0751, -0.3079, 0.5331, 0.7845],
        s: [1, 1, 1],
    },
    {
        t: [-0.0136, -0.0376, -0.076],
        r: [0.5464, 0.1682, -0.0848, 0.8161],
        s: [1, 1, 1],
    },
    {
        t: [-0.0272, 0.0313, -0.1019],
        r: [0.6129, 0.1411, -0.0752, 0.7738],
        s: [1, 1, 1],
    },
    {
        t: [-0.032, 0.0692, -0.1089],
        r: [0.5643, 0.143, -0.0679, 0.8103],
        s: [1, 1, 1],
    },
    {
        t: [-0.0353, 0.0897, -0.1161],
        r: [0.5256, 0.1162, -0.0834, 0.8386],
        s: [1, 1, 1],
    },
    {
        t: [-0.038, 0.11, -0.1265],
        r: [0.5256, 0.1162, -0.0834, 0.8386],
        s: [1, 1, 1],
    },
    {
        t: [-9e-4, -0.0372, -0.0776],
        r: [0.5593, 0.0765, -0.0968, 0.8197],
        s: [1, 1, 1],
    },
    {
        t: [-21e-4, 0.0287, -0.1033],
        r: [0.6072, -0.0412, -0.1868, 0.7712],
        s: [1, 1, 1],
    },
    {
        t: [0.01, 0.0671, -0.1136],
        r: [0.5687, 0.0002, -0.1587, 0.8071],
        s: [1, 1, 1],
    },
    {
        t: [0.0156, 0.0946, -0.124],
        r: [0.5609, 0.0092, -0.1498, 0.8142],
        s: [1, 1, 1],
    },
    {
        t: [0.019, 0.1163, -0.1339],
        r: [0.5609, 0.0092, -0.1498, 0.8142],
        s: [1, 1, 1],
    },
    {
        t: [0.0096, -0.0411, -0.08],
        r: [0.5291, -92e-4, -0.0837, 0.8443],
        s: [1, 1, 1],
    },
    {
        t: [0.0165, 0.0173, -0.1087],
        r: [0.2191, 0.1389, -0.1874, 0.9474],
        s: [1, 1, 1],
    },
    {
        t: [0.009, 0.0353, -0.1427],
        r: [-0.3548, 0.2386, -0.0503, 0.9026],
        s: [1, 1, 1],
    },
    {
        t: [-55e-4, 0.0162, -0.1628],
        r: [-0.5898, 0.2546, 0.0402, 0.7653],
        s: [1, 1, 1],
    },
    {
        t: [-0.0126, -42e-4, -0.1657],
        r: [-0.5898, 0.2546, 0.0402, 0.7653],
        s: [1, 1, 1],
    },
    {
        t: [0.0184, -0.0469, -0.0826],
        r: [0.4806, -0.0996, -0.0936, 0.8662],
        s: [1, 1, 1],
    },
    {
        t: [0.034, 0.0014, -0.1134],
        r: [0.079, 0.2891, -0.1225, 0.9461],
        s: [1, 1, 1],
    },
    {
        t: [0.0152, 0.0077, -0.141],
        r: [-0.2784, 0.3171, 0.0012, 0.9066],
        s: [1, 1, 1],
    },
    {
        t: [0.0023, -29e-4, -0.1556],
        r: [-0.458, 0.3482, 0.1094, 0.8106],
        s: [1, 1, 1],
    },
    {
        t: [-53e-4, -0.0187, -0.1623],
        r: [-0.458, 0.3482, 0.1094, 0.8106],
        s: [1, 1, 1],
    },
];

// Enum of hand poses.
var SimulatorHandPose;
(function (SimulatorHandPose) {
    SimulatorHandPose["RELAXED"] = "relaxed";
    SimulatorHandPose["PINCHING"] = "pinching";
    SimulatorHandPose["FIST"] = "fist";
    SimulatorHandPose["THUMBS_UP"] = "thumbs_up";
    SimulatorHandPose["POINTING"] = "pointing";
    SimulatorHandPose["ROCK"] = "rock";
    SimulatorHandPose["THUMBS_DOWN"] = "thumbs_down";
    SimulatorHandPose["VICTORY"] = "victory";
})(SimulatorHandPose || (SimulatorHandPose = {}));
const SIMULATOR_HAND_POSE_TO_JOINTS_LEFT = Object.freeze({
    [SimulatorHandPose.RELAXED]: LEFT_HAND_RELAXED,
    [SimulatorHandPose.PINCHING]: LEFT_HAND_PINCHING,
    [SimulatorHandPose.FIST]: LEFT_HAND_FIST,
    [SimulatorHandPose.THUMBS_UP]: LEFT_HAND_THUMBS_UP,
    [SimulatorHandPose.POINTING]: LEFT_HAND_POINTING,
    [SimulatorHandPose.ROCK]: LEFT_HAND_ROCK,
    [SimulatorHandPose.THUMBS_DOWN]: LEFT_HAND_THUMBS_DOWN,
    [SimulatorHandPose.VICTORY]: LEFT_HAND_VICTORY,
});
const SIMULATOR_HAND_POSE_TO_JOINTS_RIGHT = Object.freeze({
    [SimulatorHandPose.RELAXED]: RIGHT_HAND_RELAXED,
    [SimulatorHandPose.PINCHING]: RIGHT_HAND_PINCHING,
    [SimulatorHandPose.FIST]: RIGHT_HAND_FIST,
    [SimulatorHandPose.THUMBS_UP]: RIGHT_HAND_THUMBS_UP,
    [SimulatorHandPose.POINTING]: RIGHT_HAND_POINTING,
    [SimulatorHandPose.ROCK]: RIGHT_HAND_ROCK,
    [SimulatorHandPose.THUMBS_DOWN]: RIGHT_HAND_THUMBS_DOWN,
    [SimulatorHandPose.VICTORY]: RIGHT_HAND_VICTORY,
});
const SIMULATOR_HAND_POSE_NAMES = Object.freeze({
    [SimulatorHandPose.RELAXED]: 'Relaxed',
    [SimulatorHandPose.PINCHING]: 'Pinching',
    [SimulatorHandPose.FIST]: 'Fist',
    [SimulatorHandPose.THUMBS_UP]: 'Thumbs Up',
    [SimulatorHandPose.POINTING]: 'Pointing',
    [SimulatorHandPose.ROCK]: 'Rock',
    [SimulatorHandPose.THUMBS_DOWN]: 'Thumbs Down',
    [SimulatorHandPose.VICTORY]: 'Victory',
});

const { A_CODE: A_CODE$1, D_CODE: D_CODE$1, E_CODE: E_CODE$1, Q_CODE: Q_CODE$1, S_CODE: S_CODE$1, W_CODE: W_CODE$1 } = Keycodes;
const vector3$6 = new THREE.Vector3();
const euler$2 = new THREE.Euler();
const HAND_POSES = Object.values(SimulatorHandPose);
class SimulatorControlMode {
    /**
     * Create a SimulatorControlMode
     */
    constructor(simulatorControllerState, downKeys, hands, setStereoRenderMode, toggleUserInterface, cycleSimulatorMode = () => { }) {
        this.simulatorControllerState = simulatorControllerState;
        this.downKeys = downKeys;
        this.hands = hands;
        this.setStereoRenderMode = setStereoRenderMode;
        this.toggleUserInterface = toggleUserInterface;
        this.cycleSimulatorMode = cycleSimulatorMode;
    }
    /**
     * Initialize the simulator control mode.
     */
    init({ camera, input, timer, }) {
        this.camera = camera;
        this.input = input;
        this.timer = timer;
        input.gamepadController.init({ camera });
    }
    onPointerDown(_) { }
    onPointerUp(_) { }
    onPointerMove(_) { }
    onKeyDown(event) {
        if (event.code == Keycodes.DIGIT_1) {
            this.setStereoRenderMode(SimulatorRenderMode.STEREO_LEFT);
        }
        else if (event.code == Keycodes.DIGIT_2) {
            this.setStereoRenderMode(SimulatorRenderMode.STEREO_RIGHT);
        }
        else if (event.code == Keycodes.BACKQUOTE) {
            this.toggleUserInterface();
        }
    }
    onModeActivated() { }
    onModeDeactivated() { }
    update() {
        this.updateGamepad();
        this.updateCameraPosition();
        this.updateControllerPositions();
    }
    /**
     * Poll the gamepad and handle button actions. Called from all modes.
     */
    updateGamepad() {
        const gp = this.input.gamepadController;
        gp.update();
        if (gp.userData.connected) {
            this.updateGamepadUI(gp);
        }
    }
    updateCameraPosition() {
        const gp = this.input.gamepadController;
        // While a modal menu owns gamepad input, don't move the camera.
        if (gp.menuActive)
            return;
        const deltaTime = this.timer.getDelta();
        const cameraRotation = this.camera.quaternion;
        const cameraPosition = this.camera.position;
        const downKeys = this.downKeys;
        vector3$6
            .set(Number(downKeys.has(D_CODE$1)) - Number(downKeys.has(A_CODE$1)), Number(downKeys.has(Q_CODE$1)) - Number(downKeys.has(E_CODE$1)), Number(downKeys.has(S_CODE$1)) - Number(downKeys.has(W_CODE$1)))
            .multiplyScalar(deltaTime)
            .applyQuaternion(cameraRotation);
        cameraPosition.add(vector3$6);
        // Gamepad stick input (if connected).
        if (gp.userData.connected) {
            const [lx, ly, rx, ry] = gp.getAxes();
            // Left stick → move camera.
            if (lx !== 0 || ly !== 0) {
                vector3$6
                    .set(lx, 0, ly)
                    .multiplyScalar(deltaTime)
                    .applyQuaternion(cameraRotation);
                cameraPosition.add(vector3$6);
            }
            // Right stick → look (yaw + pitch).
            if (rx !== 0 || ry !== 0) {
                const LOOK_SPEED = 2.0;
                euler$2.setFromQuaternion(cameraRotation, 'YXZ');
                euler$2.y -= rx * LOOK_SPEED * deltaTime;
                euler$2.x -= ry * LOOK_SPEED * deltaTime;
                const PI_2 = Math.PI / 2;
                euler$2.x = Math.max(-PI_2 + 0.01, Math.min(PI_2 - 0.01, euler$2.x));
                cameraRotation.setFromEuler(euler$2);
            }
            // Configurable vertical movement bindings (defaults LT/RT, analog).
            const downVal = gp.getButtonValue(gp.bindings.getBinding('moveDown'));
            const upVal = gp.getButtonValue(gp.bindings.getBinding('moveUp'));
            const verticalDelta = (upVal - downVal) * deltaTime;
            if (verticalDelta !== 0) {
                cameraPosition.y += verticalDelta;
            }
        }
    }
    /**
     * Handle gamepad buttons for simulator UI using configurable bindings.
     */
    updateGamepadUI(gp) {
        // Suppress normal actions during rebind or while a modal menu owns input.
        if (gp.captureActive || gp.menuActive)
            return;
        const b = gp.bindings;
        if (gp.isButtonJustPressed(b.getBinding('cycleHandPoseLeft'))) {
            this.cycleHandPose(-1);
        }
        if (gp.isButtonJustPressed(b.getBinding('cycleHandPoseRight'))) {
            this.cycleHandPose(1);
        }
        if (gp.isButtonJustPressed(b.getBinding('cycleSimulatorMode'))) {
            this.cycleSimulatorMode();
        }
        if (gp.isButtonJustPressed(b.getBinding('toggleUI'))) {
            this.toggleUserInterface();
        }
        if (gp.isButtonJustPressed(b.getBinding('toggleHand'))) {
            this.hands.toggleHandedness();
        }
        if (gp.isButtonJustPressed(b.getBinding('openSettings'))) {
            gp.onOpenSettings?.();
        }
    }
    cycleHandPose(direction) {
        const idx = this.simulatorControllerState.currentControllerIndex;
        const currentPose = idx === 0 ? this.hands.leftHandPose : this.hands.rightHandPose;
        const currentIdx = HAND_POSES.indexOf(currentPose ?? HAND_POSES[0]);
        const nextIdx = (currentIdx + direction + HAND_POSES.length) % HAND_POSES.length;
        const nextPose = HAND_POSES[nextIdx];
        if (idx === 0) {
            this.hands.setLeftHandLerpPose(nextPose);
        }
        else {
            this.hands.setRightHandLerpPose(nextPose);
        }
    }
    updateControllerPositions() {
        this.camera.updateMatrixWorld();
        for (let i = 0; i < 2 && i < this.input.controllers.length; i++) {
            const controller = this.input.controllers[i];
            controller.position
                .copy(this.simulatorControllerState.localControllerPositions[i])
                .applyMatrix4(this.camera.matrixWorld);
            controller.quaternion
                .copy(this.simulatorControllerState.localControllerOrientations[i])
                .premultiply(this.camera.quaternion);
            controller.updateMatrix();
            const mesh = i == 0 ? this.hands.leftController : this.hands.rightController;
            mesh.position.copy(controller.position);
            mesh.quaternion.copy(controller.quaternion);
        }
    }
    rotateOnPointerMove(event, objectQuaternion, multiplier = 0.002) {
        euler$2.setFromQuaternion(objectQuaternion, 'YXZ');
        euler$2.y += event.movementX * multiplier;
        euler$2.x += event.movementY * multiplier;
        // Clamp camera pitch to +/-90 deg (+/-1.57 rad) with a 0.01 rad (0.573 deg)
        // buffer to prevent gimbal lock.
        const PI_2 = Math.PI / 2;
        euler$2.x = Math.max(-PI_2 + 0.01, Math.min(PI_2 - 0.01, euler$2.x));
        objectQuaternion.setFromEuler(euler$2);
    }
    enableSimulatorHands() {
        this.hands.showHands();
        this.input.dispatchEvent({
            type: 'connected',
            target: this.input.controllers[0],
            data: { handedness: 'left' },
        });
        this.input.dispatchEvent({
            type: 'connected',
            target: this.input.controllers[1],
            data: { handedness: 'right' },
        });
    }
    disableSimulatorHands() {
        this.hands.hideHands();
        this.input.dispatchEvent({
            type: 'disconnected',
            target: this.input.controllers[0],
            data: { handedness: 'left' },
        });
        this.input.dispatchEvent({
            type: 'disconnected',
            target: this.input.controllers[1],
            data: { handedness: 'right' },
        });
    }
}

const vector3$5 = new THREE.Vector3();
const { A_CODE, D_CODE, E_CODE, Q_CODE, S_CODE, SPACE_CODE, T_CODE, W_CODE } = Keycodes;
class SimulatorControllerMode extends SimulatorControlMode {
    onPointerMove(event) {
        if (event.buttons) {
            const controllerOrientation = this.simulatorControllerState.localControllerOrientations[this.simulatorControllerState.currentControllerIndex];
            this.rotateOnPointerMove(event, controllerOrientation, -2e-3);
        }
    }
    update() {
        this.updateGamepad();
        this.updateControllerPositions();
    }
    onModeActivated() {
        this.enableSimulatorHands();
    }
    updateControllerPositions() {
        const deltaTime = this.timer.getDelta();
        const downKeys = this.downKeys;
        const localPos = this.simulatorControllerState.localControllerPositions[this.simulatorControllerState.currentControllerIndex];
        vector3$5
            .set(Number(downKeys.has(D_CODE)) - Number(downKeys.has(A_CODE)), Number(downKeys.has(Q_CODE)) - Number(downKeys.has(E_CODE)), Number(downKeys.has(S_CODE)) - Number(downKeys.has(W_CODE)))
            .multiplyScalar(deltaTime);
        localPos.add(vector3$5);
        // Gamepad: left stick moves hand on XZ; configurable buttons on Y.
        const gp = this.input.gamepadController;
        if (gp.userData.connected && !gp.menuActive) {
            const [lx, ly] = gp.getAxes();
            const downVal = gp.getButtonValue(gp.bindings.getBinding('moveDown'));
            const upVal = gp.getButtonValue(gp.bindings.getBinding('moveUp'));
            vector3$5.set(lx, upVal - downVal, ly).multiplyScalar(deltaTime);
            localPos.add(vector3$5);
        }
        super.updateControllerPositions();
    }
    toggleControllerIndex() {
        this.hands.toggleHandedness();
    }
    onKeyDown(event) {
        super.onKeyDown(event);
        if (event.code == T_CODE) {
            this.toggleControllerIndex();
        }
        else if (event.code == SPACE_CODE) {
            const controllerSelecting = this.input.controllers[this.simulatorControllerState.currentControllerIndex].userData?.selected;
            const newSelectingState = !controllerSelecting;
            if (this.simulatorControllerState.currentControllerIndex == 0) {
                this.hands.setLeftHandPinching(newSelectingState);
            }
            else {
                this.hands.setRightHandPinching(newSelectingState);
            }
        }
    }
}

class SimulatorPoseMode extends SimulatorControlMode {
    onModeActivated() {
        this.enableSimulatorHands();
    }
    onPointerMove(event) {
        if (event.buttons) {
            this.rotateOnPointerMove(event, this.camera.quaternion);
        }
    }
}

class SimulatorUserMode extends SimulatorControlMode {
    onModeActivated() {
        this.disableSimulatorHands();
        this.input.mouseController.connect();
    }
    onModeDeactivated() {
        this.input.mouseController.disconnect();
    }
    /**
     * In User mode, hands are hidden — switch to a hand-visible mode
     * before cycling so the change is visible.
     */
    cycleHandPose(direction) {
        this.cycleSimulatorMode();
        super.cycleHandPose(direction);
    }
    onPointerDown(event) {
        if (event.buttons & 1) {
            this.input.mouseController.callSelectStart();
        }
    }
    onPointerUp() {
        if (this.input.mouseController.userData.selected) {
            this.input.mouseController.callSelectEnd();
        }
    }
    onPointerMove(event) {
        this.input.mouseController.updateMousePositionFromEvent(event);
        if (event.buttons & 2) {
            this.rotateOnPointerMove(event, this.camera.quaternion);
        }
    }
}

class SetSimulatorModeEvent extends Event {
    static { this.type = 'setSimulatorMode'; }
    constructor(simulatorMode) {
        super(SetSimulatorModeEvent.type, { bubbles: true, composed: true });
        this.simulatorMode = simulatorMode;
    }
}

function preventDefault(event) {
    event.preventDefault();
}
class SimulatorControls {
    #enabled;
    get enabled() {
        return this.#enabled;
    }
    set enabled(value) {
        this.setEnabled(value);
    }
    /**
     * Create the simulator controls.
     * @param hands - The simulator hands manager.
     * @param setStereoRenderMode - A function to set the stereo mode.
     * @param userInterface - The simulator user interface manager.
     */
    constructor(simulatorControllerState, hands, setStereoRenderMode, userInterface) {
        this.simulatorControllerState = simulatorControllerState;
        this.hands = hands;
        this.userInterface = userInterface;
        this.pointerDown = false;
        this.downKeys = new Set();
        this.simulatorMode = SimulatorMode.USER;
        this.#enabled = true;
        this._onPointerDown = this.onPointerDown.bind(this);
        this._onPointerUp = this.onPointerUp.bind(this);
        this._onKeyDown = this.onKeyDown.bind(this);
        this._onKeyUp = this.onKeyUp.bind(this);
        this._onPointerMove = this.onPointerMove.bind(this);
        this._onBlur = this.onBlur.bind(this);
        const toggleUserInterface = () => {
            this.userInterface.toggleInterfaceVisible();
        };
        const cycleSimulatorMode = () => {
            if (!this.simulatorOptions)
                return;
            this.setSimulatorMode(this.simulatorOptions.modeToggle.toggleOrder[this.simulatorMode]);
        };
        this.simulatorModes = {
            [SimulatorMode.USER]: new SimulatorUserMode(this.simulatorControllerState, this.downKeys, hands, setStereoRenderMode, toggleUserInterface, cycleSimulatorMode),
            [SimulatorMode.POSE]: new SimulatorPoseMode(this.simulatorControllerState, this.downKeys, hands, setStereoRenderMode, toggleUserInterface, cycleSimulatorMode),
            [SimulatorMode.CONTROLLER]: new SimulatorControllerMode(this.simulatorControllerState, this.downKeys, hands, setStereoRenderMode, toggleUserInterface, cycleSimulatorMode),
        };
        this.simulatorModeControls = this.simulatorModes[this.simulatorMode];
    }
    /**
     * Initialize the simulator controls.
     */
    init({ camera, input, timer, renderer, simulatorOptions, }) {
        for (const mode in this.simulatorModes) {
            this.simulatorModes[mode].init({ camera, input, timer });
        }
        this.renderer = renderer;
        this.setSimulatorMode(simulatorOptions.defaultMode);
        this.simulatorControllerState.currentControllerIndex =
            simulatorOptions.defaultHand === Handedness.LEFT ? 0 : 1;
        this.simulatorOptions = simulatorOptions;
        this.connect();
    }
    connect() {
        const domElement = this.renderer.domElement;
        document.addEventListener('keyup', this._onKeyUp);
        document.addEventListener('keydown', this._onKeyDown);
        domElement.addEventListener('pointermove', this._onPointerMove);
        domElement.addEventListener('pointerdown', this._onPointerDown);
        domElement.addEventListener('pointerup', this._onPointerUp);
        domElement.addEventListener('contextmenu', preventDefault);
        window.addEventListener('blur', this._onBlur);
        document.addEventListener('visibilitychange', this._onBlur);
    }
    update() {
        this.simulatorModeControls.update();
    }
    onPointerMove(event) {
        if (!this.enabled)
            return;
        this.simulatorModeControls.onPointerMove(event);
    }
    onPointerDown(event) {
        if (!this.enabled)
            return;
        this.simulatorModeControls.onPointerDown(event);
        this.pointerDown = true;
    }
    onPointerUp(event) {
        if (!this.enabled)
            return;
        this.simulatorModeControls.onPointerUp(event);
        this.pointerDown = false;
    }
    onKeyDown(event) {
        if (!this.enabled)
            return;
        // On macOS, keyup events are not fired for keys held when Command (Meta)
        // is pressed. Clear all keys to prevent stuck movement.
        if (event.metaKey ||
            event.code === 'MetaLeft' ||
            event.code === 'MetaRight') {
            this.downKeys.clear();
            return;
        }
        this.downKeys.add(event.code);
        if (this.simulatorOptions?.modeToggle.enabled &&
            event.code === this.simulatorOptions.modeToggle.toggleKey) {
            this.setSimulatorMode(this.simulatorOptions.modeToggle.toggleOrder[this.simulatorMode]);
        }
        this.simulatorModeControls.onKeyDown(event);
    }
    onKeyUp(event) {
        if (!this.enabled)
            return;
        this.downKeys.delete(event.code);
    }
    onBlur() {
        this.downKeys.clear();
    }
    setSimulatorMode(mode) {
        this.simulatorMode = mode;
        this.simulatorModeControls.onModeDeactivated();
        this.simulatorModeControls = this.simulatorModes[this.simulatorMode];
        this.simulatorModeControls.onModeActivated();
        if (this.simulatorSettingsPanelElement) {
            this.simulatorSettingsPanelElement.simulatorMode = mode;
        }
    }
    setSimulatorSettingsPanelElement(element) {
        element.simulatorMode = this.simulatorMode;
        element.addEventListener('setSimulatorMode', (event) => {
            if (event instanceof SetSimulatorModeEvent) {
                this.setSimulatorMode(event.simulatorMode);
            }
        });
        this.simulatorSettingsPanelElement = element;
    }
    setEnabled(value) {
        if (value == this.#enabled) {
            return;
        }
        this.#enabled = value;
        if (!value) {
            this.downKeys.clear();
        }
    }
}

class SimulatorDepthMaterial extends THREE.MeshBasicMaterial {
    onBeforeCompile(shader) {
        shader.vertexShader = shader.vertexShader
            .replace('#include <clipping_planes_pars_vertex>', [
            '#include <clipping_planes_pars_vertex>',
            'varying vec4 vViewCoordinates;',
        ].join('\n'))
            .replace('#include <project_vertex>', ['#include <project_vertex>', 'vViewCoordinates = mvPosition;'].join('\n'));
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <clipping_planes_pars_fragment>', [
            '#include <clipping_planes_pars_fragment>',
            'varying vec4 vViewCoordinates;',
        ].join('\n'))
            .replace('#include <dithering_fragment>', [
            '#include <dithering_fragment>',
            'gl_FragColor = vec4(-vViewCoordinates.z, 0.0, 0.0, 1.0);',
        ].join('\n'));
    }
}

class SimulatorDepth {
    constructor(simulatorScene) {
        this.simulatorScene = simulatorScene;
        this.depthWidth = 160;
        this.depthHeight = 160;
        this.depthBufferSlice = new Float32Array();
        /**
         * If true, copies the rendering camera's projection matrix each frame.
         */
        this.autoUpdateDepthCameraProjection = true;
        /**
         * If true, copies the rendering camera's transform each frame.
         */
        this.autoUpdateDepthCameraTransform = true;
        this.projectionMatrixArray = new Float32Array(16);
    }
    /**
     * Initialize Simulator Depth.
     */
    init(renderer, camera, depth) {
        this.renderer = renderer;
        this.camera = camera;
        this.depth = depth;
        if (this.camera instanceof THREE.PerspectiveCamera) {
            this.depthCamera = new THREE.PerspectiveCamera();
        }
        else if (this.camera instanceof THREE.OrthographicCamera) {
            this.depthCamera = new THREE.OrthographicCamera();
        }
        else {
            throw new Error('Unknown camera type');
        }
        this.depthCamera.copy(this.camera, /*recursive=*/ false);
        this.createRenderTarget();
        this.depthMaterial = new SimulatorDepthMaterial();
    }
    createRenderTarget() {
        this.depthRenderTarget = new THREE.WebGLRenderTarget(this.depthWidth, this.depthHeight, {
            format: THREE.RedFormat,
            type: THREE.FloatType,
        });
        this.depthBuffer = new Float32Array(this.depthWidth * this.depthHeight);
    }
    update() {
        this.updateDepthCamera();
        this.renderDepthScene();
        this.updateDepth();
    }
    updateDepthCamera() {
        const renderingCamera = this.camera;
        const depthCamera = this.depthCamera;
        if (this.autoUpdateDepthCameraProjection) {
            depthCamera.projectionMatrix.copy(renderingCamera.projectionMatrix);
            depthCamera.projectionMatrixInverse.copy(renderingCamera.projectionMatrixInverse);
        }
        if (this.autoUpdateDepthCameraTransform) {
            depthCamera.position.copy(renderingCamera.position);
            depthCamera.rotation.order = renderingCamera.rotation.order;
            depthCamera.quaternion.copy(renderingCamera.quaternion);
            depthCamera.scale.copy(renderingCamera.scale);
            depthCamera.matrix.copy(renderingCamera.matrix);
            depthCamera.matrixWorld.copy(renderingCamera.matrixWorld);
            depthCamera.matrixWorldInverse.copy(renderingCamera.matrixWorldInverse);
        }
    }
    renderDepthScene() {
        const originalRenderTarget = this.renderer.getRenderTarget();
        this.renderer.setRenderTarget(this.depthRenderTarget);
        this.simulatorScene.overrideMaterial = this.depthMaterial;
        this.renderer.render(this.simulatorScene, this.depthCamera);
        this.simulatorScene.overrideMaterial = null;
        this.renderer.setRenderTarget(originalRenderTarget);
    }
    async updateDepth() {
        // We preventively unbind the PIXEL_PACK_BUFFER before reading from the
        // render target in case external libraries (Spark.js) left it bound.
        const context = this.renderer.getContext();
        context.bindBuffer(context.PIXEL_PACK_BUFFER, null);
        // Cache the projection matrix and transform of the rendered depth.
        const projectionMatrix = this.depthCamera.projectionMatrix.clone();
        const transform = new XRRigidTransform(this.depthCamera.position, this.depthCamera.quaternion);
        await this.renderer.readRenderTargetPixelsAsync(this.depthRenderTarget, 0, 0, this.depthWidth, this.depthHeight, this.depthBuffer);
        // Flip the depth buffer.
        if (this.depthBufferSlice.length != this.depthWidth) {
            this.depthBufferSlice = new Float32Array(this.depthWidth);
        }
        for (let i = 0; i < this.depthHeight / 2; ++i) {
            const j = this.depthHeight - 1 - i;
            const i_offset = i * this.depthWidth;
            const j_offset = j * this.depthWidth;
            // Copy row i to a temp slice
            this.depthBufferSlice.set(this.depthBuffer.subarray(i_offset, i_offset + this.depthWidth));
            // Copy row j to row i
            this.depthBuffer.copyWithin(i_offset, j_offset, j_offset + this.depthWidth);
            // Copy the temp slice (original row i) to row j
            this.depthBuffer.set(this.depthBufferSlice, j_offset);
        }
        projectionMatrix.toArray(this.projectionMatrixArray);
        const depthData = {
            width: this.depthWidth,
            height: this.depthHeight,
            data: this.depthBuffer.buffer,
            rawValueToMeters: 1.0,
            projectionMatrix: this.projectionMatrixArray,
            transform: transform,
        };
        this.depth.updateCPUDepthData(depthData, 0);
    }
}

// Request to change the hand pose.
class SimulatorHandPoseChangeRequestEvent extends Event {
    static { this.type = 'SimulatorHandPoseChangeRequestEvent'; }
    constructor(pose) {
        super(SimulatorHandPoseChangeRequestEvent.type, {
            bubbles: true,
            composed: true,
        });
        this.pose = pose;
    }
}

class SimulatorXRHand {
}

const DEFAULT_HAND_PROFILE_PATH = 'https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0/dist/profiles/generic-hand/';
const vector3$4 = new THREE.Vector3();
const quaternion$1 = new THREE.Quaternion();
class SimulatorHands {
    constructor(simulatorControllerState, simulatorScene) {
        this.simulatorControllerState = simulatorControllerState;
        this.simulatorScene = simulatorScene;
        this.leftController = new THREE.Object3D();
        this.rightController = new THREE.Object3D();
        this.leftHandBones = [];
        this.rightHandBones = [];
        this.leftHandPose = SimulatorHandPose.RELAXED;
        this.rightHandPose = SimulatorHandPose.RELAXED;
        this.leftHandTargetJoints = SIMULATOR_HAND_POSE_TO_JOINTS_LEFT[SimulatorHandPose.RELAXED];
        this.rightHandTargetJoints = SIMULATOR_HAND_POSE_TO_JOINTS_RIGHT[SimulatorHandPose.RELAXED];
        this.lerpSpeed = 0.1;
        this.onHandPoseChangeRequestBound = this.onHandPoseChangeRequest.bind(this);
        this.leftXRHand = new SimulatorXRHand();
        this.rightXRHand = new SimulatorXRHand();
    }
    /**
     * Initialize Simulator Hands.
     */
    init({ input }) {
        this.input = input;
        this.loadMeshes();
        this.simulatorScene.add(this.leftController);
        this.simulatorScene.add(this.rightController);
    }
    loadMeshes() {
        this.loader = new GLTFLoader();
        this.loader.setPath(DEFAULT_HAND_PROFILE_PATH);
        this.loader.load('left.glb', (gltf) => {
            this.leftHand = gltf.scene;
            this.leftController.add(this.leftHand);
            HAND_JOINT_NAMES.forEach((jointName) => {
                const bone = gltf.scene.getObjectByName(jointName);
                if (bone) {
                    this.leftHandBones.push(bone);
                }
                else {
                    console.warn(`Couldn't find ${jointName} in left hand mesh`);
                }
            });
            this.setLeftHandJoints(this.leftHandTargetJoints);
            this.input.hands[0]?.dispatchEvent?.({
                type: 'connected',
                data: { hand: this.leftXRHand, handedness: 'left' },
            });
        });
        this.loader.load('right.glb', (gltf) => {
            this.rightHand = gltf.scene;
            this.rightController.add(this.rightHand);
            HAND_JOINT_NAMES.forEach((jointName) => {
                const bone = gltf.scene.getObjectByName(jointName);
                if (bone) {
                    this.rightHandBones.push(bone);
                }
                else {
                    console.warn(`Couldn't find ${jointName} in right hand mesh`);
                }
            });
            this.setRightHandJoints(this.rightHandTargetJoints);
            this.input.hands[1]?.dispatchEvent?.({
                type: 'connected',
                data: { hand: this.rightXRHand, handedness: 'right' },
            });
        });
    }
    setLeftHandLerpPose(pose) {
        if (this.leftHandPose === pose)
            return;
        if (pose === SimulatorHandPose.PINCHING) {
            this.input.dispatchEvent({
                type: 'selectstart',
                target: this.input.controllers[0],
                data: {
                    handedness: 'left',
                },
            });
        }
        else if (this.leftHandPose === SimulatorHandPose.PINCHING) {
            this.input.dispatchEvent({
                type: 'selectend',
                target: this.input.controllers[0],
                data: {
                    handedness: 'left',
                },
            });
        }
        this.leftHandPose = pose;
        this.leftHandTargetJoints = SIMULATOR_HAND_POSE_TO_JOINTS_LEFT[pose];
        this.updateHandPosePanel();
    }
    setRightHandLerpPose(pose) {
        if (this.rightHandPose === pose)
            return;
        if (pose === SimulatorHandPose.PINCHING) {
            this.input.dispatchEvent({
                type: 'selectstart',
                target: this.input.controllers[1],
                data: {
                    handedness: 'right',
                },
            });
        }
        else if (this.rightHandPose === SimulatorHandPose.PINCHING) {
            this.input.dispatchEvent({
                type: 'selectend',
                target: this.input.controllers[1],
                data: {
                    handedness: 'right',
                },
            });
        }
        this.rightHandPose = pose;
        this.rightHandTargetJoints = SIMULATOR_HAND_POSE_TO_JOINTS_RIGHT[pose];
        this.updateHandPosePanel();
    }
    setLeftHandJoints(joints) {
        // Unset the pose if the joints are manually defined.
        if (this.leftHandPose === SimulatorHandPose.PINCHING) {
            this.input.dispatchEvent({
                type: 'selectend',
                target: this.input.controllers[1],
                data: {
                    handedness: 'left',
                },
            });
        }
        if (joints != this.leftHandTargetJoints) {
            this.leftHandPose = undefined;
            this.leftHandTargetJoints = joints;
        }
        for (let i = 0; i < this.leftHandBones.length; i++) {
            const bone = this.leftHandBones[i];
            const jointData = joints[i];
            if (bone && jointData) {
                bone.position.fromArray(jointData.t);
                bone.quaternion.fromArray(jointData.r);
                bone.scale.fromArray([1, 1, 1]);
            }
        }
    }
    setRightHandJoints(joints) {
        // Unset the pose if the joints are manually defined.
        if (this.rightHandPose === SimulatorHandPose.PINCHING) {
            this.input.dispatchEvent({
                type: 'selectend',
                target: this.input.controllers[1],
                data: {
                    handedness: 'right',
                },
            });
        }
        if (joints != this.rightHandTargetJoints) {
            this.rightHandPose = undefined;
            this.rightHandTargetJoints = joints;
        }
        for (let i = 0; i < this.rightHandBones.length; i++) {
            const bone = this.rightHandBones[i];
            const jointData = joints[i];
            if (bone && jointData) {
                bone.position.fromArray(jointData.t);
                bone.quaternion.fromArray(jointData.r);
                bone.scale.fromArray([1, 1, 1]);
            }
        }
    }
    update() {
        this.lerpLeftHandPose();
        this.lerpRightHandPose();
        this.syncHandJoints();
    }
    lerpLeftHandPose() {
        for (let i = 0; i < this.leftHandBones.length; i++) {
            const bone = this.leftHandBones[i];
            const targetJoint = this.leftHandTargetJoints[i];
            if (bone && targetJoint) {
                vector3$4.fromArray(targetJoint.t);
                quaternion$1.fromArray(targetJoint.r);
                bone.position.lerp(vector3$4, this.lerpSpeed);
                bone.quaternion.slerp(quaternion$1, this.lerpSpeed);
            }
        }
    }
    lerpRightHandPose() {
        for (let i = 0; i < this.rightHandBones.length; i++) {
            const bone = this.rightHandBones[i];
            const targetJoint = this.rightHandTargetJoints[i];
            if (bone && targetJoint) {
                vector3$4.fromArray(targetJoint.t);
                quaternion$1.fromArray(targetJoint.r);
                bone.position.lerp(vector3$4, this.lerpSpeed);
                bone.quaternion.slerp(quaternion$1, this.lerpSpeed);
            }
        }
    }
    syncHandJoints() {
        const hands = this.input.hands;
        const leftHand = hands[0];
        if (leftHand) {
            this.leftController.updateWorldMatrix(true, false);
            leftHand.position.setFromMatrixPosition(this.leftController.matrixWorld);
            leftHand.setRotationFromMatrix(this.leftController.matrixWorld);
            leftHand.updateMatrix();
            for (let i = 0; i < this.leftHandBones.length; i++) {
                const joint = HAND_JOINT_NAMES[i];
                if (!(joint in leftHand.joints)) {
                    leftHand.joints[joint] = new THREE.Group();
                    leftHand.add(leftHand.joints[joint]);
                }
                leftHand.joints[joint].position.copy(this.leftHandBones[i].position);
                leftHand.joints[joint].quaternion.copy(this.leftHandBones[i].quaternion);
                leftHand.updateWorldMatrix(false, true);
            }
        }
        const rightHand = hands[1];
        if (rightHand) {
            this.rightController.updateWorldMatrix(true, false);
            rightHand.position.setFromMatrixPosition(this.rightController.matrixWorld);
            rightHand.setRotationFromMatrix(this.rightController.matrixWorld);
            rightHand.updateMatrix();
            for (let i = 0; i < this.rightHandBones.length; i++) {
                const joint = HAND_JOINT_NAMES[i];
                if (!(joint in rightHand.joints)) {
                    rightHand.joints[joint] = new THREE.Group();
                    rightHand.add(rightHand.joints[joint]);
                }
                rightHand.joints[joint].position.copy(this.rightHandBones[i].position);
                rightHand.joints[joint].quaternion.copy(this.rightHandBones[i].quaternion);
                rightHand.updateWorldMatrix(false, true);
            }
        }
    }
    setLeftHandPinching(pinching = true) {
        this.setLeftHandLerpPose(pinching ? SimulatorHandPose.PINCHING : SimulatorHandPose.RELAXED);
    }
    setRightHandPinching(pinching = true) {
        this.setRightHandLerpPose(pinching ? SimulatorHandPose.PINCHING : SimulatorHandPose.RELAXED);
    }
    showHands() {
        this.leftController.visible = true;
        this.rightController.visible = true;
        for (let i = 0; i < this.input.hands.length; i++) {
            this.input.hands[i].visible = true;
        }
        this.updateHandPosePanel();
    }
    hideHands() {
        this.leftController.visible = false;
        this.rightController.visible = false;
        for (let i = 0; i < this.input.hands.length; i++) {
            this.input.hands[i].visible = false;
        }
        this.updateHandPosePanel();
    }
    updateHandPosePanel() {
        if (!this.handPosePanelElement)
            return;
        if (this.simulatorControllerState.currentControllerIndex === 0) {
            this.handPosePanelElement.visible = this.leftController.visible;
            this.handPosePanelElement.handPose = this.leftHandPose;
        }
        else {
            this.handPosePanelElement.visible = this.rightController.visible;
            this.handPosePanelElement.handPose = this.rightHandPose;
        }
    }
    setHandPosePanelElement(element) {
        if (this.handPosePanelElement) {
            this.handPosePanelElement.removeEventListener(SimulatorHandPoseChangeRequestEvent.type, this.onHandPoseChangeRequestBound);
        }
        element.addEventListener(SimulatorHandPoseChangeRequestEvent.type, this.onHandPoseChangeRequestBound);
        this.handPosePanelElement = element;
        this.updateHandPosePanel();
    }
    onHandPoseChangeRequest(event) {
        if (event.type != SimulatorHandPoseChangeRequestEvent.type)
            return;
        const handPoseChangeEvent = event;
        if (this.simulatorControllerState.currentControllerIndex === 0) {
            this.setLeftHandLerpPose(handPoseChangeEvent.pose);
        }
        else {
            this.setRightHandLerpPose(handPoseChangeEvent.pose);
        }
    }
    toggleHandedness() {
        this.simulatorControllerState.currentControllerIndex =
            (this.simulatorControllerState.currentControllerIndex + 1) % 2;
        this.updateHandPosePanel();
        this.onHandednessChanged?.(this.simulatorControllerState.currentControllerIndex === 0
            ? 'left'
            : 'right');
    }
}

class SetSimulatorEnvironmentEvent extends Event {
    static { this.type = 'setSimulatorEnvironment'; }
    constructor(environmentIndex) {
        super(SetSimulatorEnvironmentEvent.type, { bubbles: true, composed: true });
        this.environmentIndex = environmentIndex;
    }
}

/** Standard gamepad button names for display. */
const BUTTON_NAMES = {
    0: 'A',
    1: 'B',
    2: 'X',
    3: 'Y',
    4: 'LB',
    5: 'RB',
    6: 'LT',
    7: 'RT',
    8: 'Back',
    9: 'Start',
    10: 'L3',
    11: 'R3',
    12: 'D-Up',
    13: 'D-Down',
    14: 'D-Left',
    15: 'D-Right',
};
function btnName(index) {
    return BUTTON_NAMES[index] ?? `Btn ${index}`;
}
class SimulatorInterface {
    constructor() {
        this.elements = [];
        this.interfaceVisible = true;
    }
    /**
     * Initialize the simulator interface.
     */
    init(simulatorOptions, simulatorControls, simulatorHands, input, simulatorScene) {
        if (simulatorScene) {
            this.createSimulatorSettingsPanel(simulatorOptions, simulatorControls, simulatorScene);
        }
        this.showGeminiLivePanel(simulatorOptions);
        this.createHandPosePanel(simulatorOptions, simulatorHands);
        simulatorHands.onHandednessChanged = (handedness) => {
            this._ensureGamepadToast().flash(`Active Hand: ${handedness === 'left' ? 'Left' : 'Right'}`);
        };
        this.showInstructions(simulatorOptions);
        if (input)
            this._initGamepadUI(input);
    }
    createSimulatorSettingsPanel(simulatorOptions, simulatorControls, simulatorScene) {
        if (simulatorOptions.simulatorSettingsPanel.enabled) {
            const settingsElement = document.createElement(simulatorOptions.simulatorSettingsPanel.element);
            settingsElement.environments = simulatorOptions.environments;
            settingsElement.activeEnvironmentIndex =
                simulatorOptions.activeEnvironmentIndex;
            document.body.appendChild(settingsElement);
            simulatorControls.setSimulatorSettingsPanelElement(settingsElement);
            settingsElement.addEventListener(SetSimulatorEnvironmentEvent.type, (event) => {
                if (event instanceof SetSimulatorEnvironmentEvent) {
                    simulatorOptions.activeEnvironmentIndex = event.environmentIndex;
                    const activeEnv = simulatorOptions.environments[event.environmentIndex];
                    simulatorScene.setEnvironment(activeEnv?.scenePath ?? null, new THREE.Vector3(simulatorOptions.initialScenePosition.x, simulatorOptions.initialScenePosition.y, simulatorOptions.initialScenePosition.z));
                }
            });
            this.elements.push(settingsElement);
        }
    }
    showInstructions(simulatorOptions) {
        if (simulatorOptions.instructions.enabled) {
            const element = document.createElement(simulatorOptions.instructions.element);
            element.customInstructions =
                simulatorOptions.instructions.customInstructions;
            document.body.appendChild(element);
            this.elements.push(element);
        }
    }
    showGeminiLivePanel(simulatorOptions) {
        if (simulatorOptions.geminiLivePanel.enabled) {
            const element = document.createElement(simulatorOptions.geminiLivePanel.element);
            document.body.appendChild(element);
            this.elements.push(element);
        }
    }
    createHandPosePanel(simulatorOptions, simulatorHands) {
        if (simulatorOptions.handPosePanel.enabled) {
            const handsPanelElement = document.createElement(simulatorOptions.handPosePanel.element);
            document.body.appendChild(handsPanelElement);
            simulatorHands.setHandPosePanelElement(handsPanelElement);
            this.elements.push(handsPanelElement);
        }
    }
    hideUiElements() {
        for (const element of this.elements) {
            element.style.display = 'none';
        }
        this.interfaceVisible = false;
    }
    showUiElements() {
        for (const element of this.elements) {
            element.style.display = '';
        }
        this.interfaceVisible = true;
    }
    getInterfaceVisible() {
        return !this.interfaceVisible;
    }
    toggleInterfaceVisible() {
        if (this.interfaceVisible) {
            this.hideUiElements();
        }
        else {
            this.showUiElements();
        }
    }
    _initGamepadUI(input) {
        const gp = input.gamepadController;
        gp.addEventListener('connected', () => {
            if (!gp.hasShownToast) {
                gp.hasShownToast = true;
                this.showGamepadToast(gp);
            }
        });
        gp.onOpenSettings = () => this.toggleGamepadSettings(gp);
    }
    _ensureGamepadToast() {
        if (!this._gamepadToast) {
            this._gamepadToast = document.createElement('xrblocks-gamepad-toast');
            document.body.appendChild(this._gamepadToast);
        }
        return this._gamepadToast;
    }
    showGamepadToast(gp) {
        const toast = this._ensureGamepadToast();
        const b = gp.bindings;
        toast.show({
            'Left Stick': 'Move (or Hand in Controller mode)',
            'Right Stick': 'Look',
            [btnName(b.getBinding('moveDown')) +
                ' / ' +
                btnName(b.getBinding('moveUp'))]: 'Down / Up',
            [btnName(b.getBinding('select'))]: 'Select / Interact',
            [btnName(b.getBinding('cycleHandPoseLeft')) +
                ' / ' +
                btnName(b.getBinding('cycleHandPoseRight'))]: 'Cycle Hand Pose',
            [btnName(b.getBinding('cycleSimulatorMode'))]: 'Cycle Simulator Mode',
            [btnName(b.getBinding('toggleUI'))]: 'Toggle UI',
            [btnName(b.getBinding('toggleHand'))]: 'Swap Active Hand',
            [btnName(b.getBinding('openSettings'))]: 'Gamepad Settings',
        });
    }
    toggleGamepadSettings(gp) {
        if (!this._gamepadSettings) {
            this._gamepadSettings = document.createElement('xrblocks-gamepad-settings');
            this._gamepadSettings.bindings = gp.bindings;
            this._gamepadSettings.gamepadController = gp;
            this._gamepadSettings.hidden = true;
            document.body.appendChild(this._gamepadSettings);
        }
        if (this._gamepadSettings.hidden) {
            this._gamepadSettings.show();
        }
        else {
            this._gamepadSettings.hide();
        }
    }
}

class SimulatorScene extends THREE.Scene {
    constructor() {
        super();
    }
    async init(simulatorOptions) {
        this.addLights();
        const activeEnv = simulatorOptions.environments[simulatorOptions.activeEnvironmentIndex];
        if (!activeEnv)
            return;
        if (activeEnv.videoPath) {
            return;
        }
        if (activeEnv.scenePath) {
            await this.loadGLTF(activeEnv.scenePath, new THREE.Vector3(simulatorOptions.initialScenePosition.x, simulatorOptions.initialScenePosition.y, simulatorOptions.initialScenePosition.z));
        }
    }
    async setEnvironment(path, initialPosition) {
        if (this.gltf) {
            this.remove(this.gltf.scene);
            this.gltf = undefined;
        }
        if (path) {
            await this.loadGLTF(path, initialPosition);
        }
    }
    addLights() {
        this.add(new THREE.HemisphereLight(0xbbbbbb, 0x888888, 3));
    }
    async loadGLTF(path, initialPosition) {
        const loader = new GLTFLoader();
        return new Promise((resolve, reject) => {
            loader.load(path, (gltf) => {
                gltf.scene.position.copy(initialPosition);
                this.add(gltf.scene);
                this.gltf = gltf;
                resolve(gltf);
            }, () => { }, (error) => {
                reject(error);
            });
        });
    }
}

/**
 * Call init on a script or subsystem with dependency injection.
 */
async function callInitWithDependencyInjection(script, registry, fallback) {
    const dependencies = script.constructor.dependencies;
    if (dependencies == null) {
        await script.init(fallback);
        return;
    }
    await script.init(Object.fromEntries(Object.entries(dependencies).map(([key, value]) => {
        const dependency = registry.get(value);
        if (!dependency) {
            throw new Error(`Dependency not found for key: ${value.name}`);
        }
        return [key, dependency];
    })));
}

class SimulatorUser extends Script {
    static { this.dependencies = { waitFrame: WaitFrame, registry: Registry }; }
    constructor() {
        super();
        this.name = 'Simulator User';
        this.journeyId = 0;
    }
    init({ waitFrame, registry }) {
        this.waitFrame = waitFrame;
        this.registry = registry;
    }
    stopJourney() {
        ++this.journeyId;
    }
    isOnJourneyId(id) {
        return id == this.journeyId;
    }
    async loadJourney(actions) {
        console.log('Load journey');
        const currentJourneyId = ++this.journeyId;
        for (let i = 0; this.isOnJourneyId(currentJourneyId) && i < actions.length; ++i) {
            callInitWithDependencyInjection(actions[i], this.registry, undefined);
            await actions[i].play({
                simulatorUser: this,
                journeyId: currentJourneyId,
                waitFrame: this.waitFrame,
            });
        }
        console.log('Journey finished');
    }
}

// World sensing for the simulator.
// Currently just injects planes.
class SimulatorWorld {
    async init(options, world) {
        this.options = options;
        this.world = world;
        const activeEnv = options.simulator.environments[options.simulator.activeEnvironmentIndex];
        if (options.world.planes.enabled && activeEnv?.scenePlanesPath) {
            await this.loadPlanes(activeEnv.scenePlanesPath);
        }
    }
    async loadPlanes(path) {
        const offsetPosition = new THREE.Vector3().copy(this.options.simulator.initialScenePosition);
        try {
            const planesData = (await fetch(path).then((response) => response.json()));
            const planes = planesData.planes.map((plane) => {
                return {
                    type: plane.type,
                    area: plane.area,
                    position: new THREE.Vector3(plane.position.x, plane.position.y, plane.position.z).add(offsetPosition),
                    quaternion: new THREE.Quaternion(plane.quaternion[0], plane.quaternion[1], plane.quaternion[2], plane.quaternion[3]),
                    polygon: plane.polygon,
                };
            });
            this.world.planes.setSimulatorPlanes(planes);
        }
        catch (error) {
            console.error('Failed to load planes:', error);
        }
    }
}

// Object which just holds the spark renderer so other classes don't need to import spark.
class SparkRendererHolder {
    constructor(renderer) {
        this.renderer = renderer;
    }
}

/**
 * Utility functions for positioning and orienting objects in 3D
 * space.
 */
// Reusable instances to avoid creating new objects in the render loop.
const vector3$3 = new THREE.Vector3();
const vector3a = new THREE.Vector3();
const vector3b = new THREE.Vector3();
const matrix4$2 = new THREE.Matrix4();
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
function placeObjectAtIntersectionFacingTarget(obj, intersection, target) {
    // 1. Position the object at the intersection point.
    obj.position.copy(intersection.point);
    // 2. Determine the world-space normal of the surface at the intersection
    // point. We must ensure the matrix of the intersected object is up-to-date.
    intersection.object.updateWorldMatrix(true, false);
    // 3. Determine the desired forward direction.
    // This is the vector from the object to the target, projected onto the
    // surface plane.
    const worldNormal = vector3b
        .copy(intersection.normal)
        .transformDirection(intersection.object.matrixWorld);
    const forwardVector = target
        .getWorldPosition(vector3$3)
        .sub(obj.position)
        .cross(worldNormal)
        .cross(worldNormal)
        .multiplyScalar(-1)
        .normalize();
    // 4. Create an orthonormal basis (a new coordinate system).
    // The 'up' vector is the surface normal.
    // The 'forward' vector is the direction towards the target on the plane.
    // The 'right' vector is perpendicular to both.
    const rightVector = vector3a.crossVectors(worldNormal, forwardVector);
    matrix4$2.makeBasis(rightVector, worldNormal, forwardVector);
    // 5. Apply the rotation from the new basis to the object.
    // This aligns the object's local axes with the new basis vectors.
    // Note: Three.js objects' 'forward' is conventionally the -Z axis.
    // makeBasis sets the +Z axis to forwardVector, so models may need to be
    // authored with +Z forward, or a rotation offset can be applied here.
    obj.quaternion.setFromRotationMatrix(matrix4$2);
    return obj;
}

/**
 * Represents a single detected object in the XR environment and holds metadata
 * about the object's properties. Note: 3D object position is stored in the
 * position property of `Three.Object3D`.
 */
class DetectedObject extends THREE.Object3D {
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
    constructor(label, image, detection2DBoundingBox, data) {
        super();
        this.label = label;
        this.image = image;
        this.detection2DBoundingBox = detection2DBoundingBox;
        this.data = data;
    }
}

/**
 * Base class for object detector backends.
 * Handles the orchestration of capturing snapshots, running detection,
 * and creating visual representations.
 *
 * T - The type of additional data associated with the detected object.
 */
let BaseDetectorBackend$1 = class BaseDetectorBackend {
    constructor(context) {
        this.context = context;
    }
    async run(depthMeshSnapshot, cameraParametersSnapshot) {
        if (!(await this.isAvailable())) {
            return [];
        }
        const snapshot = await this.getSnapshot();
        if (!snapshot)
            return [];
        let normalizedDetections = [];
        try {
            normalizedDetections = await this.detect(snapshot);
        }
        catch (error) {
            console.error('Object detection backend failed:', error);
            return [];
        }
        if (this.context.options.objects.showDebugVisualizations) {
            this.visualize(snapshot, normalizedDetections);
        }
        const detectionPromises = normalizedDetections.map(async (item) => {
            const boundingBox = new THREE.Box2(new THREE.Vector2(item.xmin, item.ymin), new THREE.Vector2(item.xmax, item.ymax));
            const center = new THREE.Vector2();
            boundingBox.getCenter(center);
            const worldCoordinates = transformRgbUvToWorld(center, depthMeshSnapshot, cameraParametersSnapshot);
            if (worldCoordinates) {
                const { worldPosition } = worldCoordinates;
                const margin = this.context.options.objects.objectImageMargin;
                const cropBox = boundingBox.clone();
                cropBox.min.subScalar(margin);
                cropBox.max.addScalar(margin);
                const imageSource = snapshot.imageData || snapshot.base64;
                if (!imageSource) {
                    throw new Error('No valid snapshot data for cropping');
                }
                const objectImage = await cropImage(imageSource, cropBox);
                const object = new DetectedObject(item.objectName, objectImage, boundingBox, item.additionalData);
                object.position.copy(worldPosition);
                if (this.context.debugVisualsGroup) {
                    this.createDebugVisual(object);
                }
                return object;
            }
            return null;
        });
        const detectedObjects = (await Promise.all(detectionPromises)).filter((obj) => obj !== null && obj !== undefined);
        return detectedObjects;
    }
    /**
     * Creates a debug visual representation for a detected object in the 3D scene.
     *
     * @param object - The detected object to visualize.
     */
    async createDebugVisual(object) {
        // Create sphere.
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 16), new THREE.MeshBasicMaterial({ color: 0xff4285f4 }));
        sphere.position.copy(object.position);
        // Create and configure the text label using Troika.
        const { Text } = await import('troika-three-text');
        const textLabel = new Text();
        textLabel.text = object.label;
        textLabel.fontSize = 0.07;
        textLabel.color = 0xffffff;
        textLabel.anchorX = 'center';
        textLabel.anchorY = 'bottom';
        // Position the label above the sphere
        textLabel.position.copy(sphere.position);
        textLabel.position.y += 0.04; // Offset above the sphere.
        this.context.debugVisualsGroup.add(sphere, textLabel);
        textLabel.sync(); // Required for Troika text to appear.
    }
    /**
     * Visualizes the detections by drawing bounding boxes on a canvas and downloading the image.
     * This is used for debugging detection results.
     *
     * @param snapshot - The camera snapshot used for detection.
     * @param detections - The array of normalized detections to draw.
     */
    visualize(snapshot, detections) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const drawDetectionsAndDownload = () => {
            detections.forEach((item) => {
                const rectX = item.xmin * canvas.width;
                const rectY = item.ymin * canvas.height;
                const rectWidth = (item.xmax - item.xmin) * canvas.width;
                const rectHeight = (item.ymax - item.ymin) * canvas.height;
                ctx.strokeStyle = '#FF0000';
                ctx.lineWidth = Math.max(2, canvas.width / 400);
                ctx.strokeRect(rectX, rectY, rectWidth, rectHeight);
                const text = item.objectName;
                const fontSize = Math.max(16, canvas.width / 80);
                ctx.font = `bold ${fontSize}px sans-serif`;
                ctx.textBaseline = 'bottom';
                const textMetrics = ctx.measureText(text);
                ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                ctx.fillRect(rectX, rectY - fontSize, textMetrics.width + 8, fontSize + 4);
                ctx.fillStyle = '#FFFFFF';
                ctx.fillText(text, rectX + 4, rectY + 2);
            });
            const timestamp = new Date()
                .toISOString()
                .slice(0, 19)
                .replace('T', '_')
                .replace(/:/g, '-');
            const link = document.createElement('a');
            link.download = `detection_debug_${timestamp}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        };
        if (snapshot.imageData) {
            canvas.width = snapshot.imageData.width;
            canvas.height = snapshot.imageData.height;
            ctx.putImageData(snapshot.imageData, 0, 0);
            drawDetectionsAndDownload();
        }
        else if (snapshot.base64) {
            const img = new Image();
            img.onload = () => {
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                ctx.drawImage(img, 0, 0);
                drawDetectionsAndDownload();
            };
            img.src = snapshot.base64;
        }
    }
};

/**
 * Object detector backend implementation using Gemini via the AI service.
 * Sends image data to a remote model for detection.
 *
 * T - The type of additional data associated with the detected object.
 */
class GeminiDetectorBackend extends BaseDetectorBackend$1 {
    async isAvailable() {
        return !!this.context.ai.isAvailable();
    }
    async getSnapshot() {
        const base64Image = await this.context.deviceCamera.getSnapshot({
            outputFormat: 'base64',
        });
        if (!base64Image)
            return null;
        return { base64: base64Image };
    }
    buildGeminiConfig() {
        const geminiOptions = this.context.options.objects.backendConfig.gemini;
        return {
            thinkingConfig: {
                thinkingBudget: 0,
            },
            responseMimeType: 'application/json',
            responseSchema: geminiOptions.responseSchema,
            systemInstruction: [{ text: geminiOptions.systemInstruction }],
        };
    }
    async detect(snapshot) {
        const { mimeType, strippedBase64 } = parseBase64DataURL(snapshot.base64);
        const config = this.buildGeminiConfig();
        const originalGeminiConfig = this.context.aiOptions.gemini.config;
        this.context.aiOptions.gemini.config = config;
        const textPrompt = 'What do you see in this image?';
        let backendResponse = null;
        try {
            backendResponse = await this.context.ai.model.query({
                type: 'multiPart',
                parts: [
                    { inlineData: { mimeType: mimeType || undefined, data: strippedBase64 } },
                    { text: textPrompt },
                ],
            });
        }
        catch (e) {
            console.error('Gemini detection failed', e);
            return [];
        }
        finally {
            this.context.aiOptions.gemini.config = originalGeminiConfig;
        }
        return this.normalizeDetections(backendResponse);
    }
    normalizeDetections(backendResponse) {
        let parsedResponse;
        try {
            if (backendResponse && backendResponse.text) {
                parsedResponse = JSON.parse(backendResponse.text);
            }
            else {
                return [];
            }
        }
        catch (e) {
            console.warn('Error while normalizing detections in Gemini Response', e);
            return [];
        }
        if (!Array.isArray(parsedResponse))
            return [];
        // Map Gemini JSON response to NormalizedDetectedObject format.
        // Gemini returns coordinates in the range [0, 1000], so we divide by 1000 to normalize.
        return parsedResponse.reduce((acc, item) => {
            const { ymin, xmin, ymax, xmax, objectName, ...additionalData } = item || {};
            if ([ymin, xmin, ymax, xmax].every((coord) => typeof coord === 'number')) {
                acc.push({
                    ymin: ymin / 1000,
                    xmin: xmin / 1000,
                    ymax: ymax / 1000,
                    xmax: xmax / 1000,
                    objectName: objectName || 'unknown',
                    additionalData: additionalData,
                });
            }
            return acc;
        }, []);
    }
}

let FilesetResolver$1;
let ObjectDetector$1;
// --- Attempt Dynamic Import ---
async function loadMediaPipeModule$1() {
    if (FilesetResolver$1 && ObjectDetector$1) {
        return;
    }
    try {
        const mediapipeModule = await import('@mediapipe/tasks-vision');
        FilesetResolver$1 = mediapipeModule.FilesetResolver;
        ObjectDetector$1 = mediapipeModule.ObjectDetector;
        console.log("'@mediapipe/tasks-vision' module loaded successfully.");
    }
    catch (error) {
        console.error('Failed to load MediaPipe module:', error);
        throw error;
    }
}
/**
 * Object detector backend implementation using MediaPipe's Object Detector.
 * Runs locally on the device.
 *
 * T - The type of additional data associated with the detected object (not used currently).
 */
let MediaPipeDetectorBackend$1 = class MediaPipeDetectorBackend extends BaseDetectorBackend$1 {
    constructor(context) {
        super(context);
        this.objectDetector = null;
        this.initializationPromise = this.tryInitializeObjectDetector();
    }
    async isAvailable() {
        try {
            await this.initializationPromise;
            return true;
        }
        catch (e) {
            console.error('MediaPipe Object Detector is not available:', e);
            return false;
        }
    }
    async getSnapshot() {
        const imageData = await this.context.deviceCamera.getSnapshot({
            outputFormat: 'imageData',
        });
        if (!imageData)
            return null;
        return { imageData };
    }
    async detect(snapshot) {
        await this.initializationPromise;
        if (!this.objectDetector)
            return [];
        const backendResponse = this.objectDetector.detect(snapshot.imageData);
        if (!backendResponse)
            return [];
        const width = snapshot.imageData.width;
        const height = snapshot.imageData.height;
        return this.normalizeDetections(backendResponse, width, height);
    }
    normalizeDetections(backendResponse, width, height) {
        // Map MediaPipe detections to NormalizedDetectedObject format.
        // We normalize the bounding box coordinates by the image dimensions.
        return backendResponse.detections.reduce((acc, detection) => {
            const box = detection.boundingBox;
            if (box) {
                const category = detection.categories?.[0];
                const objectName = category?.categoryName || category?.displayName || 'unknown';
                acc.push({
                    ymin: box.originY / height,
                    xmin: box.originX / width,
                    ymax: (box.originY + box.height) / height,
                    xmax: (box.originX + box.width) / width,
                    objectName: objectName,
                });
            }
            return acc;
        }, []);
    }
    /**
     * Initializes the MediaPipe Object Detector if it has not already been initialized.
     * Loads the fileset resolver for vision tasks and creates the detector instance
     * with the configured model asset path and score threshold.
     */
    async tryInitializeObjectDetector() {
        if (this.objectDetector)
            return;
        await loadMediaPipeModule$1();
        const mediapipeOptions = this.context.options.objects.backendConfig.mediapipe;
        const vision = await FilesetResolver$1.forVisionTasks(mediapipeOptions.wasmFilesUrl);
        this.objectDetector = await ObjectDetector$1.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: mediapipeOptions.modelAssetPath,
            },
            scoreThreshold: mediapipeOptions.scoreThreshold,
        });
    }
};

/**
 * Detects objects in the user's environment using a specified backend.
 * It queries an AI model with the device camera feed and returns located
 * objects with 2D and 3D positioning data.
 */
class ObjectDetector extends Script {
    constructor() {
        super(...arguments);
        /**
         * A map from the object's UUID to our custom `DetectedObject` instance.
         */
        this._detectedObjects = new Map();
        this._detectorBackends = new Map();
        this.targetDevice = 'galaxyxr';
    }
    static { this.dependencies = {
        options: WorldOptions,
        ai: AI,
        aiOptions: AIOptions,
        deviceCamera: XRDeviceCamera,
        depth: Depth,
        camera: THREE.Camera,
        renderer: THREE.WebGLRenderer,
    }; }
    /**
     * Initializes the ObjectDetector.
     * @override
     */
    init({ options, ai, aiOptions, deviceCamera, depth, camera, renderer, }) {
        this.options = options;
        this.ai = ai;
        this.aiOptions = aiOptions;
        this.deviceCamera = deviceCamera;
        this.depth = depth;
        this.camera = camera;
        this.renderer = renderer;
        if (this.options.objects.showDebugVisualizations) {
            this._debugVisualsGroup = new THREE.Group();
            // Disable raycasting for the debug group to prevent interaction errors.
            this._debugVisualsGroup.raycast = () => { };
            this.add(this._debugVisualsGroup);
        }
    }
    /**
     * Runs the object detection process based on the configured backend.
     * @returns A promise that resolves with an
     * array of detected `DetectedObject` instances.
     */
    async runDetection() {
        this.clear(); // Clear previous results before starting a new detection.
        const depthMeshSnapshot = this.getDepthMeshSnapshot();
        const cameraParametersSnapshot = getCameraParametersSnapshot(this.camera, this.renderer.xr.getCamera(), this.deviceCamera, this.targetDevice);
        const context = this.getDetectorContext();
        const activeBackend = this.options.objects.backendConfig.activeBackend;
        const detectorBackendPromise = this.getOrCreateDetectorBackend(activeBackend, context);
        let detectorBackend;
        try {
            detectorBackend = await detectorBackendPromise;
        }
        catch (error) {
            console.warn(`Failed to load or initialize ObjectDetector backend '${activeBackend}':`, error);
            return [];
        }
        const detectedObjects = await detectorBackend.run(depthMeshSnapshot, cameraParametersSnapshot);
        for (const obj of detectedObjects) {
            this._detectedObjects.set(obj.uuid, obj);
            this.add(obj);
        }
        return detectedObjects;
    }
    getDetectorContext() {
        return {
            options: this.options,
            ai: this.ai,
            aiOptions: this.aiOptions,
            deviceCamera: this.deviceCamera,
            debugVisualsGroup: this._debugVisualsGroup,
        };
    }
    getOrCreateDetectorBackend(activeBackend, context) {
        let detectorBackendPromise = this._detectorBackends.get(activeBackend);
        if (!detectorBackendPromise) {
            detectorBackendPromise = (async () => {
                switch (activeBackend) {
                    case 'gemini':
                        return new GeminiDetectorBackend(context);
                    case 'mediapipe':
                        return new MediaPipeDetectorBackend$1(context);
                    default:
                        throw new Error(`ObjectDetector backend '${activeBackend}' is not supported.`);
                }
            })();
            this._detectorBackends.set(activeBackend, detectorBackendPromise);
        }
        return detectorBackendPromise;
    }
    getDepthMeshSnapshot() {
        const clonedGeometry = this.depth.depthMesh.geometry.clone();
        clonedGeometry.computeBoundingSphere();
        clonedGeometry.computeBoundingBox();
        const depthMeshSnapshot = new THREE.Mesh(clonedGeometry, new THREE.MeshBasicMaterial());
        this.depth.depthMesh.getWorldPosition(depthMeshSnapshot.position);
        this.depth.depthMesh.getWorldQuaternion(depthMeshSnapshot.quaternion);
        this.depth.depthMesh.getWorldScale(depthMeshSnapshot.scale);
        depthMeshSnapshot.updateMatrixWorld(true);
        return depthMeshSnapshot;
    }
    /**
     * Retrieves a list of currently detected objects.
     *
     * @param label - The semantic label to filter by (e.g., 'chair'). If null,
     * all objects are returned.
     * @returns An array of `Object` instances.
     */
    get(label = null) {
        const allObjects = Array.from(this._detectedObjects.values());
        if (!label) {
            return allObjects;
        }
        return allObjects.filter((obj) => obj.label === label);
    }
    /**
     * Removes all currently detected objects from the scene and internal
     * tracking.
     */
    clear() {
        for (const obj of this._detectedObjects.values()) {
            this.remove(obj);
        }
        this._detectedObjects.clear();
        if (this._debugVisualsGroup) {
            this._debugVisualsGroup.clear();
        }
        return this;
    }
    /**
     * Toggles the visibility of all debug visualizations for detected objects.
     * @param visible - Whether the visualizations should be visible.
     */
    showDebugVisualizations(visible = true) {
        if (this._debugVisualsGroup) {
            this._debugVisualsGroup.visible = visible;
        }
    }
    /**
     * Generates a visual representation of the depth map, normalized to 0-1 range,
     * and triggers a download for debugging.
     * @param depthArray - The raw depth data array.
     */
    _visualizeDepthMap(depthArray) {
        const width = this.depth.width;
        const height = this.depth.height;
        if (!width || !height || depthArray.length === 0) {
            console.warn('Cannot visualize depth map: missing dimensions or data.');
            return;
        }
        // 1. Find Min/Max for normalization (ignoring 0/invalid depth).
        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < depthArray.length; ++i) {
            const val = depthArray[i];
            if (val > 0) {
                if (val < min)
                    min = val;
                if (val > max)
                    max = val;
            }
        }
        // Handle edge case where no valid depth exists.
        if (min === Infinity) {
            min = 0;
            max = 1;
        }
        if (min === max) {
            max = min + 1; // Avoid divide by zero
        }
        // 2. Create Canvas.
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(width, height);
        const data = imageData.data;
        // 3. Fill Pixels.
        for (let i = 0; i < depthArray.length; ++i) {
            const raw = depthArray[i];
            // Normalize to 0-1.
            // Typically 0 means invalid/sky in some depth APIs, so we keep it black.
            // Otherwise, map [min, max] to [0, 1].
            const normalized = raw === 0 ? 0 : (raw - min) / (max - min);
            const byteVal = Math.floor(normalized * 255);
            const stride = i * 4;
            data[stride] = byteVal; // R
            data[stride + 1] = byteVal; // G
            data[stride + 2] = byteVal; // B
            data[stride + 3] = 255; // Alpha
        }
        ctx.putImageData(imageData, 0, 0);
        // 4. Download.
        const timestamp = new Date()
            .toISOString()
            .slice(0, 19)
            .replace('T', '_')
            .replace(/:/g, '-');
        const link = document.createElement('a');
        link.download = `depth_debug_${timestamp}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    }
}

/**
 * Represents a single detected plane in the XR environment. It's a THREE.Mesh
 * that also holds metadata about the plane's properties.
 * Note: This requires chrome://flags/#openxr-spatial-entities to be enabled.
 */
class DetectedPlane extends THREE.Mesh {
    /**
     * @param xrPlane - The plane object from the WebXR API.
     * @param material - The material for the mesh.
     */
    constructor(xrPlane, material, simulatorPlane) {
        let geometry;
        if (xrPlane) {
            // Create geometry from the plane's polygon points.
            const planePolygon = xrPlane.polygon;
            const vertices = [];
            for (const point of planePolygon) {
                vertices.push(new THREE.Vector2(point.x, point.z));
            }
            const shape = new THREE.Shape(vertices);
            geometry = new THREE.ShapeGeometry(shape);
            // ShapeGeometry creates a mesh in the XY plane by default.
            // We must rotate it to lie flat in the XZ plane to correctly represent
            // horizontal surfaces before applying the world pose provided by the API.
            geometry.rotateX(Math.PI / 2);
        }
        else if (simulatorPlane) {
            const shape = new THREE.Shape(simulatorPlane.polygon);
            geometry = new THREE.ShapeGeometry(shape);
            // ShapeGeometry creates a mesh in the XY plane by default.
            // We must rotate it to lie flat in the XZ plane to correctly represent
            // horizontal surfaces before applying the world pose provided by the API.
            geometry.rotateX(Math.PI / 2);
        }
        super(geometry, material);
        this.xrPlane = xrPlane;
        this.simulatorPlane = simulatorPlane;
        if (xrPlane) {
            this.label = xrPlane.semanticLabel;
            this.orientation = xrPlane.orientation;
        }
        else if (simulatorPlane) {
            this.label = simulatorPlane.type;
            this.orientation = simulatorPlane.type;
            this.position.copy(simulatorPlane.position);
            this.quaternion.copy(simulatorPlane.quaternion);
        }
    }
}

/**
 * Detects and manages real-world planes provided by the WebXR Plane Detection
 * API. It creates, updates, and removes `Plane` mesh objects in the scene.
 */
class PlaneDetector extends Script {
    constructor() {
        super(...arguments);
        /**
         * A map from the WebXR `XRPlane` object to our custom `DetectedPlane` mesh.
         */
        this._detectedPlanes = new Map();
        this.usingSimulatorPlanes = false;
    }
    static { this.dependencies = { options: WorldOptions, renderer: THREE.WebGLRenderer }; }
    /**
     * Initializes the PlaneDetector.
     */
    init({ options, renderer, }) {
        this.renderer = renderer;
        if (options.planes.showDebugVisualizations) {
            this._debugMaterial = new THREE.MeshBasicMaterial({
                color: 0xffff00,
                wireframe: true,
                side: THREE.DoubleSide,
            });
        }
    }
    /**
     * Processes the XRFrame to update plane information.
     */
    update(_, frame) {
        if (!frame || !frame.detectedPlanes || this.usingSimulatorPlanes)
            return;
        this._xrRefSpace =
            this._xrRefSpace || this.renderer.xr.getReferenceSpace() || undefined;
        if (!this._xrRefSpace)
            return;
        const detectedPlanesInFrame = frame.detectedPlanes;
        const planesToRemove = new Set(this._detectedPlanes.keys());
        for (const xrPlane of detectedPlanesInFrame) {
            planesToRemove.delete(xrPlane); // This plane is still active.
            const existingPlaneMesh = this._detectedPlanes.get(xrPlane);
            if (existingPlaneMesh) {
                // Plane already exists, check if it needs an update.
                if (xrPlane.lastChangedTime >
                    (existingPlaneMesh.xrPlane?.lastChangedTime || 0)) {
                    this._updatePlaneMesh(frame, existingPlaneMesh, xrPlane);
                }
            }
            else {
                // This is a newly detected plane.
                this._addPlaneMesh(frame, xrPlane);
            }
        }
        // Remove planes that are no longer detected.
        for (const xrPlane of planesToRemove) {
            this._removePlaneMesh(xrPlane);
        }
    }
    /**
     * Creates and adds a new `Plane` mesh to the scene.
     * @param frame - WebXR frame.
     * @param xrPlane - The new WebXR plane object.
     */
    _addPlaneMesh(frame, xrPlane) {
        const material = this._debugMaterial || new THREE.MeshBasicMaterial({ visible: false });
        const planeMesh = new DetectedPlane(xrPlane, material);
        this._updatePlanePose(frame, planeMesh, xrPlane);
        this._detectedPlanes.set(xrPlane, planeMesh);
        this.add(planeMesh);
        return planeMesh;
    }
    /**
     * Updates an existing `DetectedPlane` mesh's geometry and pose.
     * @param frame - WebXR frame.
     * @param planeMesh - The mesh to update.
     * @param xrPlane - The updated plane data.
     */
    _updatePlaneMesh(frame, planeMesh, xrPlane) {
        // Recreate geometry from the new polygon.
        const newVertices = xrPlane.polygon.map((p) => new THREE.Vector2(p.x, p.z));
        const newShape = new THREE.Shape(newVertices);
        const newGeometry = new THREE.ShapeGeometry(newShape);
        planeMesh.geometry.dispose();
        planeMesh.geometry = newGeometry;
        planeMesh.xrPlane = xrPlane; // Update the reference.
        this._updatePlanePose(frame, planeMesh, xrPlane);
    }
    /**
     * Removes a `Plane` mesh from the scene and disposes of its resources.
     * @param xrPlane - The WebXR plane object to remove.
     */
    _removePlaneMesh(xrPlane) {
        const planeMesh = this._detectedPlanes.get(xrPlane);
        if (planeMesh) {
            planeMesh.geometry.dispose();
            this.remove(planeMesh);
            this._detectedPlanes.delete(xrPlane);
        }
    }
    /**
     * Updates the position and orientation of a `DetectedPlane` mesh from its XR
     * pose.
     * @param frame - The current XRFrame.
     * @param planeMesh - The mesh to update.
     * @param xrPlane - The plane data with the pose.
     */
    _updatePlanePose(frame, planeMesh, xrPlane) {
        const pose = frame.getPose(xrPlane.planeSpace, this._xrRefSpace);
        if (pose) {
            planeMesh.position.copy(pose.transform.position);
            planeMesh.quaternion.copy(pose.transform.orientation);
        }
    }
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
    get(label) {
        const allPlanes = Array.from(this._detectedPlanes.values());
        if (!label) {
            return allPlanes;
        }
        return allPlanes.filter((plane) => plane.label === label);
    }
    /**
     * Toggles the visibility of the debug meshes for all planes.
     * Requires `showDebugVisualizations` to be true in the options.
     * @param visible - Whether to show or hide the planes.
     */
    showDebugVisualizations(visible = true) {
        if (this._debugMaterial) {
            this.visible = visible;
        }
    }
    _addSimulatorPlaneMesh(plane) {
        const material = this._debugMaterial || new THREE.MeshBasicMaterial({ visible: false });
        const planeMesh = new DetectedPlane(null, material, plane);
        this.add(planeMesh);
        return planeMesh;
    }
    setSimulatorPlanes(planes) {
        this.usingSimulatorPlanes = true;
        this._detectedPlanes.clear();
        for (const plane of planes) {
            this._addSimulatorPlaneMesh(plane);
        }
    }
}

class DetectedMesh extends THREE.Mesh {
    // Expose rigidBody for pose updates
    get getRigidBody() {
        return this.rigidBody;
    }
    constructor(mesh, material) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(mesh.vertices, 3));
        geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
        geometry.computeVertexNormals();
        super(geometry, material);
        this.lastChangedTime = 0;
        this.lastChangedTime = mesh.lastChangedTime;
        this.semanticLabel = mesh.semanticLabel;
    }
    initRapierPhysics(RAPIER, blendedWorld) {
        this.RAPIER = RAPIER;
        this.blendedWorld = blendedWorld;
        const desc = RAPIER.RigidBodyDesc.fixed()
            .setTranslation(this.position.x, this.position.y, this.position.z)
            .setRotation(this.quaternion);
        this.rigidBody = blendedWorld.createRigidBody(desc);
        const vertices = this.geometry.attributes.position.array;
        const indices = this.geometry.getIndex().array;
        const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices);
        this.collider = blendedWorld.createCollider(colliderDesc, this.rigidBody);
    }
    updateVertices(mesh) {
        if (mesh.lastChangedTime === this.lastChangedTime)
            return;
        this.lastChangedTime = mesh.lastChangedTime;
        // Update existing geometry attributes instead of creating new geometry
        const positionAttribute = this.geometry.attributes.position;
        const indexAttribute = this.geometry.getIndex();
        const newVertexCount = mesh.vertices.length / 3;
        const newIndexCount = mesh.indices.length;
        if (positionAttribute.count !== newVertexCount ||
            (indexAttribute && indexAttribute.count !== newIndexCount)) {
            // Vertex or index count changed - recreate geometry
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(mesh.vertices, 3));
            geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
            geometry.computeVertexNormals();
            this.geometry.dispose();
            this.geometry = geometry;
        }
        else {
            // Same vertex count - update in place (more efficient)
            const positions = positionAttribute.array;
            if (positions.length === mesh.vertices.length) {
                positions.set(mesh.vertices);
                positionAttribute.needsUpdate = true;
            }
            if (indexAttribute) {
                const indices = indexAttribute.array;
                if (indices.length === mesh.indices.length) {
                    indices.set(mesh.indices);
                    indexAttribute.needsUpdate = true;
                }
            }
            this.geometry.computeVertexNormals();
        }
        // Update collider
        if (this.RAPIER && this.collider) {
            const RAPIER = this.RAPIER;
            this.blendedWorld.removeCollider(this.collider, false);
            const colliderDesc = RAPIER.ColliderDesc.trimesh(mesh.vertices, mesh.indices);
            this.collider = this.blendedWorld.createCollider(colliderDesc, this.rigidBody);
        }
    }
    dispose() {
        if (this.blendedWorld && this.collider) {
            this.blendedWorld.removeCollider(this.collider, false);
            this.collider = undefined;
        }
        if (this.blendedWorld && this.rigidBody) {
            this.blendedWorld.removeRigidBody(this.rigidBody);
            this.rigidBody = undefined;
        }
        this.geometry.dispose();
    }
}

const SEMANTIC_LABELS = ['floor', 'ceiling', 'wall'];
const SEMANTIC_COLORS = [0x00ff00, 0xffff00, 0x0000ff];
// Wrapper around WebXR Mesh Detection API
// https://immersive-web.github.io/real-world-meshing/
class MeshDetector extends Script {
    constructor() {
        super(...arguments);
        this.debugMaterials = new Map();
        this.fallbackDebugMaterial = null;
        this.xrMeshToThreeMesh = new Map();
        this.threeMeshToXrMesh = new Map();
        this.defaultMaterial = new THREE.MeshBasicMaterial({ visible: false });
        this.meshTimedata = new Map();
        // Optimization1: Mesh update throttling (similar to ARCore reflection cube map in /usr/local/google/home/adamren/Desktop/xrlabs/arlabs/xrblocks/samples/lighting)
        this.MESH_UPDATE_INTERVAL_MS = 1000; //0 -> 1000
        this.lastMeshUpdateTime = 0;
        // Optimization2: Periodic cleanup of stale/distant meshes
        this.MESH_STALE_TIME_MS = 3000; //1000000000 -> 3000
        this.CLEANUP_INTERVAL_MS = this.MESH_STALE_TIME_MS + 1000;
        // Optimization3: Camera culling constants
        this.kMaxViewDistance = 3.0; //1000000000.0 -> 3.0
        this.kFOVCosThreshold = 0.25; //0.0 -> 0.25
        this.lastCleanupTime = 0;
        // Profiling
        this.frameCount = 0;
    }
    static { this.dependencies = {
        options: MeshDetectionOptions,
        renderer: THREE.WebGLRenderer,
    }; }
    init({ options, renderer, }) {
        this.renderer = renderer;
        if (options.showDebugVisualizations) {
            this.fallbackDebugMaterial = new THREE.MeshBasicMaterial({
                color: 0x000000,
                wireframe: true,
                side: THREE.DoubleSide,
            });
            for (let i = 0; i < SEMANTIC_LABELS.length; i++) {
                this.debugMaterials.set(SEMANTIC_LABELS[i], new THREE.MeshBasicMaterial({
                    color: SEMANTIC_COLORS[i],
                    wireframe: true,
                    side: THREE.DoubleSide,
                }));
            }
        }
    }
    initPhysics(physics) {
        this.physics = physics;
        for (const [_, mesh] of this.xrMeshToThreeMesh.entries()) {
            mesh.initRapierPhysics(physics.RAPIER, physics.blendedWorld);
        }
    }
    updateMeshes(_timestamp, frame) {
        this.frameCount++;
        // Profiling1: Time spent in accessing detectedMeshes
        const t0 = performance.now();
        const meshes = frame?.detectedMeshes;
        performance.now() - t0;
        // console.log(
        //   `[MeshDetector Frame ${this.frameCount}] ` +
        //   `detectedMeshes access: ${_detectedMeshesTime.toFixed(3)}ms, ` +
        //   `timestamp: ${_timestamp.toFixed(3)}, ` +
        //   `meshCount: ${meshes?.size || 0}`
        // );
        if (!meshes || !frame)
            return;
        // Optimization1: Mesh update throttling
        const now = performance.now();
        const timeSinceLastUpdate = now - this.lastMeshUpdateTime;
        if (timeSinceLastUpdate < this.MESH_UPDATE_INTERVAL_MS) {
            return;
        }
        this.lastMeshUpdateTime = now;
        // Process meshes
        const referenceSpace = this.renderer.xr.getReferenceSpace();
        if (!referenceSpace)
            return;
        const { position: cameraPosition, forward: cameraForward } = this.getCameraInfo(frame, referenceSpace);
        for (const xrMesh of meshes) {
            // Optimization2: Check if mesh is in view and get distance
            const isVisible = this.shouldShowMeshInViewWithDistance(xrMesh, cameraPosition, cameraForward, frame, referenceSpace);
            if (!isVisible) {
                continue;
            }
            // Create or update mesh
            const cachedChangedTime = this.meshTimedata.get(xrMesh)?.lastChangedTime;
            const currentChangedTime = xrMesh.lastChangedTime;
            const isNewMesh = cachedChangedTime === undefined;
            const isUpdated = cachedChangedTime !== undefined &&
                cachedChangedTime !== currentChangedTime;
            const isUnchanged = cachedChangedTime !== undefined &&
                cachedChangedTime === currentChangedTime;
            if (isNewMesh) {
                const threeMesh = this.createMesh(frame, xrMesh);
                this.xrMeshToThreeMesh.set(xrMesh, threeMesh);
                this.threeMeshToXrMesh.set(threeMesh, xrMesh);
                this.meshTimedata.set(xrMesh, {
                    lastChangedTime: currentChangedTime,
                    lastSeenTime: now,
                });
                this.add(threeMesh);
                if (this.physics) {
                    threeMesh.initRapierPhysics(this.physics.RAPIER, this.physics.blendedWorld);
                }
            }
            else if (isUpdated) {
                const threeMesh = this.xrMeshToThreeMesh.get(xrMesh);
                threeMesh.updateVertices(xrMesh);
                // Update needed in case we have drift correction.
                this.updateMeshPose(frame, xrMesh, threeMesh);
                this.meshTimedata.set(xrMesh, {
                    lastChangedTime: currentChangedTime,
                    lastSeenTime: now,
                });
            }
            else if (isUnchanged) {
                this.meshTimedata.set(xrMesh, {
                    lastChangedTime: currentChangedTime,
                    lastSeenTime: now,
                });
            }
        }
        // Optimization3: Periodic cleanup of stale/distant meshes
        if (now - this.lastCleanupTime >= this.CLEANUP_INTERVAL_MS) {
            this.cleanupStaleMeshes(now);
            this.lastCleanupTime = now;
        }
    }
    removeMesh(xrMesh, threeMesh) {
        this.xrMeshToThreeMesh.delete(xrMesh);
        this.threeMeshToXrMesh.delete(threeMesh);
        this.meshTimedata.delete(xrMesh);
        threeMesh.dispose();
        this.remove(threeMesh);
    }
    cleanupStaleMeshes(now) {
        const meshesToRemove = [];
        for (const [xrMesh] of this.xrMeshToThreeMesh.entries()) {
            const cachedSeenTime = this.meshTimedata.get(xrMesh)?.lastSeenTime;
            const timeSinceLastSeen = now - (cachedSeenTime || 0);
            const isStale = timeSinceLastSeen >= this.MESH_STALE_TIME_MS;
            if (isStale) {
                meshesToRemove.push(xrMesh);
            }
        }
        for (const xrMesh of meshesToRemove) {
            const threeMesh = this.xrMeshToThreeMesh.get(xrMesh);
            if (threeMesh) {
                this.removeMesh(xrMesh, threeMesh);
            }
        }
    }
    createMesh(frame, xrMesh) {
        const semanticLabel = xrMesh.semanticLabel;
        const material = (semanticLabel && this.debugMaterials.get(semanticLabel)) ||
            this.fallbackDebugMaterial ||
            this.defaultMaterial;
        const mesh = new DetectedMesh(xrMesh, material);
        this.updateMeshPose(frame, xrMesh, mesh);
        return mesh;
    }
    updateMeshPose(frame, xrMesh, mesh) {
        const pose = frame.getPose(xrMesh.meshSpace, this.renderer.xr.getReferenceSpace());
        if (pose) {
            mesh.position.copy(pose.transform.position);
            mesh.quaternion.copy(pose.transform.orientation);
            // Update physics rigid body pose if it exists
            if (mesh instanceof DetectedMesh) {
                const rigidBody = mesh.getRigidBody;
                rigidBody?.setTranslation(mesh.position, false);
                rigidBody?.setRotation(mesh.quaternion, false);
            }
        }
    }
    getCameraInfo(frame, referenceSpace) {
        const viewerPose = frame.getViewerPose(referenceSpace);
        const cameraPosition = new THREE.Vector3(0, 0, 0);
        let cameraForward = new THREE.Vector3(0, 0, -1);
        if (viewerPose && viewerPose.views && viewerPose.views.length > 0) {
            // Get camera position from first view's transform
            const viewTransform = viewerPose.views[0].transform;
            const viewMatrix = new THREE.Matrix4().fromArray(viewTransform.matrix);
            cameraPosition.setFromMatrixPosition(viewMatrix);
            // Extract forward vector from matrix (typically -Z axis)
            const forward = new THREE.Vector3(0, 0, -1);
            forward.applyMatrix4(viewMatrix);
            forward.sub(cameraPosition).normalize();
            cameraForward = forward;
        }
        return { position: cameraPosition, forward: cameraForward };
    }
    computeMeshBoundingBox(xrMesh) {
        const vertices = xrMesh.vertices;
        if (vertices.length < 3)
            return null;
        return new THREE.Box3().setFromArray(vertices);
    }
    /** Six clip planes from the view-projection matrix (left, right, bottom, top, near, far). */
    buildFrustumPlanes(viewMatrix, projectionMatrix) {
        const viewProjectionMatrix = new THREE.Matrix4();
        viewProjectionMatrix.multiplyMatrices(projectionMatrix, viewMatrix);
        const e = viewProjectionMatrix.elements;
        const planes = [
            new THREE.Plane().setComponents(e[3] + e[0], e[7] + e[4], e[11] + e[8], e[15] + e[12]),
            new THREE.Plane().setComponents(e[3] - e[0], e[7] - e[4], e[11] - e[8], e[15] - e[12]),
            new THREE.Plane().setComponents(e[3] + e[1], e[7] + e[5], e[11] + e[9], e[15] + e[13]),
            new THREE.Plane().setComponents(e[3] - e[1], e[7] - e[5], e[11] - e[9], e[15] - e[13]),
            new THREE.Plane().setComponents(e[3] + e[2], e[7] + e[6], e[11] + e[10], e[15] + e[14]),
            new THREE.Plane().setComponents(e[3] - e[2], e[7] - e[6], e[11] - e[10], e[15] - e[14]),
        ];
        for (const plane of planes) {
            if (plane.normal.length() > 0.0001) {
                plane.normalize();
            }
        }
        return planes;
    }
    // Check if AABB intersects the frustum (based on C++ IntersectsBox)
    frustumIntersectsBox(planes, box) {
        const boxMin = box.min;
        const boxMax = box.max;
        const axisVert = new THREE.Vector3();
        for (const plane of planes) {
            const n = plane.normal;
            axisVert.x = n.x < 0.0 ? boxMin.x : boxMax.x;
            axisVert.y = n.y < 0.0 ? boxMin.y : boxMax.y;
            axisVert.z = n.z < 0.0 ? boxMin.z : boxMax.z;
            if (plane.distanceToPoint(axisVert) < 0.0) {
                return false;
            }
        }
        return true;
    }
    // New method: Frustum culling
    shouldShowMeshInViewWithFrustum(mesh, frame, referenceSpace) {
        // Get mesh pose
        const meshPose = frame.getPose(mesh.meshSpace, referenceSpace);
        if (!meshPose) {
            return true; // If pose is unavailable, show by default
        }
        // Get viewer pose and the first view
        const viewerPose = frame.getViewerPose(referenceSpace);
        if (!viewerPose || !viewerPose.views || viewerPose.views.length === 0) {
            return true;
        }
        const view = viewerPose.views[0];
        if (!view.projectionMatrix) {
            return true; // If no projection matrix, fall back to default behavior
        }
        // Compute mesh bounding box in local space
        const localBoundingBox = this.computeMeshBoundingBox(mesh);
        if (!localBoundingBox) {
            return true; // If bounding box cannot be computed, show by default
        }
        const meshTransform = new THREE.Matrix4().fromArray(meshPose.transform.matrix);
        const meshPosition = new THREE.Vector3();
        const meshQuaternion = new THREE.Quaternion();
        const meshScale = new THREE.Vector3();
        meshTransform.decompose(meshPosition, meshQuaternion, meshScale);
        // Transform bounding box 8 corners to reference space
        const corners = [
            new THREE.Vector3(localBoundingBox.min.x, localBoundingBox.min.y, localBoundingBox.min.z),
            new THREE.Vector3(localBoundingBox.max.x, localBoundingBox.min.y, localBoundingBox.min.z),
            new THREE.Vector3(localBoundingBox.min.x, localBoundingBox.max.y, localBoundingBox.min.z),
            new THREE.Vector3(localBoundingBox.max.x, localBoundingBox.max.y, localBoundingBox.min.z),
            new THREE.Vector3(localBoundingBox.min.x, localBoundingBox.min.y, localBoundingBox.max.z),
            new THREE.Vector3(localBoundingBox.max.x, localBoundingBox.min.y, localBoundingBox.max.z),
            new THREE.Vector3(localBoundingBox.min.x, localBoundingBox.max.y, localBoundingBox.max.z),
            new THREE.Vector3(localBoundingBox.max.x, localBoundingBox.max.y, localBoundingBox.max.z),
        ];
        // Apply mesh transform (order: scale, then rotate, then translate)
        for (const corner of corners) {
            corner.multiply(meshScale);
            corner.applyQuaternion(meshQuaternion);
            corner.add(meshPosition);
        }
        const worldBox = new THREE.Box3().setFromPoints(corners);
        // Build view matrix (from view transform)
        const viewTransform = view.transform;
        const viewMatrix = new THREE.Matrix4()
            .fromArray(viewTransform.matrix)
            .invert();
        // Build projection matrix
        const projectionMatrix = new THREE.Matrix4().fromArray(view.projectionMatrix);
        // Build frustum planes
        const frustumPlanes = this.buildFrustumPlanes(viewMatrix, projectionMatrix);
        return this.frustumIntersectsBox(frustumPlanes, worldBox);
    }
    shouldShowMeshInViewWithDistance(mesh, cameraPosition, cameraForward, frame, referenceSpace) {
        // Distance check
        const meshPose = frame.getPose(mesh.meshSpace, referenceSpace);
        if (!meshPose) {
            return true;
        }
        const meshPosition = new THREE.Vector3();
        meshPosition.setFromMatrixPosition(new THREE.Matrix4().fromArray(meshPose.transform.matrix));
        const dx = meshPosition.x - cameraPosition.x;
        const dy = meshPosition.y - cameraPosition.y;
        const dz = meshPosition.z - cameraPosition.z;
        const distanceSq = dx * dx + dy * dy + dz * dz;
        const distance = Math.sqrt(distanceSq);
        if (distance > this.kMaxViewDistance) {
            return false;
        }
        // FOV check
        if (distance > 0.001) {
            const invDistance = 1.0 / distance;
            const dotForward = dx * invDistance * cameraForward.x +
                dy * invDistance * cameraForward.y +
                dz * invDistance * cameraForward.z;
            if (dotForward < this.kFOVCosThreshold) {
                return false;
            }
        }
        return true;
    }
}

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}
class AudioListener extends Script {
    static { this.dependencies = { registry: Registry }; }
    constructor(options = {}) {
        super();
        this.isCapturing = false;
        this.latestAudioBuffer = null;
        this.accumulatedChunks = [];
        this.isAccumulating = false;
        this.options = {
            sampleRate: 16000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            ...options,
        };
    }
    /**
     * Init the AudioListener.
     */
    init({ registry }) {
        this.registry = registry;
    }
    async startCapture(callbacks = {}) {
        if (this.isCapturing)
            return;
        this.onAudioData = callbacks.onAudioData;
        this.onError = callbacks.onError;
        this.isAccumulating = callbacks.accumulate || false;
        if (this.isAccumulating) {
            this.accumulatedChunks = [];
        }
        try {
            await this.setupAudioCapture();
            this.isCapturing = true;
        }
        catch (error) {
            console.error('Failed to start audio capture:', error);
            this.onError?.(error);
            this.cleanup();
        }
    }
    stopCapture() {
        if (!this.isCapturing)
            return;
        this.cleanup();
        this.isCapturing = false;
    }
    async setupAudioCapture() {
        this.audioStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: this.options.echoCancellation,
                noiseSuppression: this.options.noiseSuppression,
                autoGainControl: this.options.autoGainControl,
            },
            video: false,
        });
        const actualSampleRate = this.audioStream
            .getAudioTracks()[0]
            .getSettings().sampleRate;
        this.audioContext = new AudioContext({ sampleRate: actualSampleRate });
        await this.setupAudioWorklet();
        this.sourceNode = this.audioContext.createMediaStreamSource(this.audioStream);
        this.processorNode = new AudioWorkletNode(this.audioContext, 'audio-capture-processor');
        this.processorNode.port.onmessage = (event) => {
            if (event.data.type === 'audioData') {
                this.latestAudioBuffer = event.data.data;
                // Accumulate chunks if requested
                if (this.isAccumulating) {
                    this.accumulatedChunks.push(event.data.data);
                }
                this.onAudioData?.(event.data.data);
                this.streamToAI(event.data.data);
            }
        };
        // Check if the AudioContext is running, resume if necessary
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
        this.sourceNode.connect(this.processorNode);
    }
    async setupAudioWorklet() {
        const processorCode = `
      class AudioCaptureProcessor extends AudioWorkletProcessor {
        process(inputs, outputs, parameters) {
          const input = inputs[0];
          if (input && input[0]) {
            const inputData = input[0];
            const pcmData = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
              pcmData[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
            }
            this.port.postMessage({type: 'audioData', data: pcmData.buffer});
          }
          return true;
        }
      }
      registerProcessor('audio-capture-processor', AudioCaptureProcessor);
    `;
        const blob = new Blob([processorCode], { type: 'application/javascript' });
        const processorURL = URL.createObjectURL(blob);
        await this.audioContext.audioWorklet.addModule(processorURL);
        URL.revokeObjectURL(processorURL);
    }
    streamToAI(audioBuffer) {
        if (!this.aiService?.sendRealtimeInput)
            return;
        const base64Audio = arrayBufferToBase64(audioBuffer);
        const actualSampleRate = this.audioContext?.sampleRate || this.options.sampleRate;
        this.aiService.sendRealtimeInput({
            audio: {
                data: base64Audio,
                mimeType: `audio/pcm;rate=${actualSampleRate}`,
            },
        });
    }
    setAIStreaming(enabled) {
        this.aiService = enabled ? this.registry.get(AI) : undefined;
    }
    cleanup() {
        this.processorNode?.disconnect();
        this.sourceNode?.disconnect();
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
        }
        this.audioStream?.getTracks().forEach((track) => track.stop());
        this.processorNode = undefined;
        this.sourceNode = undefined;
        this.audioContext = undefined;
        this.audioStream = undefined;
        this.onAudioData = undefined;
        this.onError = undefined;
        this.latestAudioBuffer = null;
        this.accumulatedChunks = [];
        this.isAccumulating = false;
        this.aiService = undefined;
    }
    static isSupported() {
        return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    }
    getIsCapturing() {
        return this.isCapturing;
    }
    getLatestAudioBuffer() {
        return this.latestAudioBuffer;
    }
    clearLatestAudioBuffer() {
        this.latestAudioBuffer = null;
    }
    /**
     * Gets all accumulated audio chunks as a single combined buffer
     */
    getAccumulatedBuffer() {
        if (this.accumulatedChunks.length === 0)
            return null;
        const totalLength = this.accumulatedChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
        const combined = new ArrayBuffer(totalLength);
        const combinedArray = new Uint8Array(combined);
        let offset = 0;
        for (const chunk of this.accumulatedChunks) {
            combinedArray.set(new Uint8Array(chunk), offset);
            offset += chunk.byteLength;
        }
        return combined;
    }
    /**
     * Clears accumulated chunks
     */
    clearAccumulatedBuffer() {
        this.accumulatedChunks = [];
    }
    /**
     * Gets the number of accumulated chunks
     */
    getAccumulatedChunkCount() {
        return this.accumulatedChunks.length;
    }
    dispose() {
        this.stopCapture();
        super.dispose();
    }
}

/**
 * Base class for sound detector backends.
 * Handles the orchestration of normalizing audio, running classifiers and creating results.
 */
class BaseDetectorBackend {
    constructor(context) {
        this.context = context;
    }
    /**
     * Calculates debug information for the given audio data.
     * @param audio - The normalized audio data.
     * @returns An object containing RMS, buffer size, and sample rate.
     */
    populateDebugData(audio) {
        let sumSquares = 0;
        const audioData = audio.data;
        for (let i = 0; i < audioData.length; i++) {
            sumSquares += audioData[i] * audioData[i];
        }
        const rms = Math.sqrt(sumSquares / audioData.length);
        return {
            rms: rms,
            bufferSize: audioData.length,
            sampleRate: this.context.sampleRate,
        };
    }
}

let FilesetResolver;
let AudioClassifier;
// --- Attempt Dynamic Import ---
async function loadMediaPipeModule() {
    if (FilesetResolver && AudioClassifier) {
        return;
    }
    try {
        const mediapipeModule = await import('@mediapipe/tasks-audio');
        FilesetResolver = mediapipeModule.FilesetResolver;
        AudioClassifier = mediapipeModule.AudioClassifier;
        console.log("'@mediapipe/tasks-audio' module loaded successfully.");
    }
    catch (error) {
        console.error('Failed to load MediaPipe module:', error);
        throw error;
    }
}
class MediaPipeDetectorBackend extends BaseDetectorBackend {
    constructor(context) {
        super(context);
        this.chunkSamples = 16000;
        this.accumulatedAudio = [];
        this.audioClassifier = null;
        const mediapipeConfig = this.context.options.sounds.backendConfig.mediapipe;
        this.chunkSamples = mediapipeConfig.chunkSamples;
        this.tryInitializeAudioClassifier();
    }
    async tryInitializeAudioClassifier() {
        if (this.audioClassifier)
            return;
        await loadMediaPipeModule();
        const mediapipeConfig = this.context.options.sounds.backendConfig.mediapipe;
        const audioTasks = await FilesetResolver.forAudioTasks(mediapipeConfig.wasmFilesUrl);
        this.audioClassifier = await AudioClassifier.createFromOptions(audioTasks, {
            baseOptions: { modelAssetPath: mediapipeConfig.modelAssetPath },
        });
    }
    /**
     * Normalizes audio data received as an ArrayBuffer (containing Int16 samples)
     * into a Float32Array with values in the range [-1.0, 1.0] that the MediaPipe
     * classifier can understand.
     * @param arrayBuffer - The raw audio data buffer.
     * @returns The normalized audio data.
     */
    normalizeAudio(arrayBuffer) {
        const int16Data = new Int16Array(arrayBuffer);
        const normalizedAudio = new Float32Array(int16Data.length);
        for (let i = 0; i < int16Data.length; i++) {
            normalizedAudio[i] = int16Data[i] / 32768.0;
        }
        return { data: normalizedAudio };
    }
    classify(audio) {
        if (!this.audioClassifier)
            return null;
        const audioData = audio.data;
        for (let i = 0; i < audioData.length; i++) {
            this.accumulatedAudio.push(audioData[i]);
        }
        // chunkSamples is required because the MediaPipe AudioClassifier operates on
        // discrete chunks of audio data. We accumulate samples until we reach this
        // threshold before performing classification. If we do not accumulate enough samples,
        // the MediaPipe AudioClassifier returns a classification of "Silence" which is not
        // useful.
        if (this.accumulatedAudio.length >= this.chunkSamples) {
            const chunk = new Float32Array(this.accumulatedAudio.slice(0, this.chunkSamples));
            this.accumulatedAudio = this.accumulatedAudio.slice(this.chunkSamples); // simple non-overlapping window
            const mediaPipeResult = this.audioClassifier.classify(chunk, this.context.sampleRate);
            const debugData = this.context.options.sounds.showDebugInfo
                ? this.populateDebugData({ data: chunk })
                : undefined;
            return {
                items: mediaPipeResult,
                debug: debugData,
            };
        }
        return null;
    }
}

const DEFAULT_SAMPLE_RATE = 44000;
/**
 * Detects and classifies sounds in the user's environment using a specified backend.
 * It queries an audio classifier model with the device mic input stream and returns
 * classifications over specific time intervals along with confidence scores.
 */
class SoundDetector extends Script {
    constructor() {
        super(...arguments);
        this._detectorBackends = new Map();
        this._isListening = false;
    }
    static { this.dependencies = { options: WorldOptions }; }
    get isListening() {
        return this._isListening;
    }
    /**
     * Initializes the SoundDetector.
     */
    async init({ options }) {
        this.options = options;
    }
    /**
     * Starts listening to the default mic input stream.
     */
    async startListening() {
        if (this._isListening)
            return;
        if (!this.audioListener) {
            this.audioListener = new AudioListener({
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            });
        }
        const sampleRate = this.audioListener?.audioContext?.sampleRate || DEFAULT_SAMPLE_RATE;
        const backend = await this.getOrCreateDetectorBackend(sampleRate);
        try {
            this._isListening = true;
            await this.audioListener.startCapture({
                onAudioData: async (buffer) => {
                    if (!backend)
                        return;
                    const normalizedAudio = backend.normalizeAudio(buffer);
                    const audioClassifierResult = backend.classify(normalizedAudio);
                    if (audioClassifierResult) {
                        this.dispatchEvent({
                            type: 'soundDetected',
                            audioClassifierResult: audioClassifierResult,
                        });
                    }
                },
            });
            console.log('SoundDetector: Started listening using AudioListener.');
        }
        catch (error) {
            console.error('SoundDetector: Failed to start audio classification:', error);
            this._isListening = false;
        }
    }
    /**
     * Stops listening and releases resources.
     */
    stopListening() {
        if (!this._isListening)
            return;
        this.audioListener?.stopCapture();
        this._isListening = false;
        console.log('SoundDetector: Stopped listening.');
    }
    update(_timestamp, _frame) {
        // No per-frame update logic needed, audio is handled asynchronously via streams.
    }
    getOrCreateDetectorBackend(sampleRate) {
        if (!this.options) {
            throw new Error('SoundDetector: Options not initialized. Call init first.');
        }
        const activeBackend = this.options.sounds.backendConfig.activeBackend;
        let detectorBackendPromise = this._detectorBackends.get(activeBackend);
        if (!detectorBackendPromise) {
            detectorBackendPromise = (async () => {
                switch (activeBackend) {
                    case 'mediapipe':
                        return new MediaPipeDetectorBackend({
                            options: this.options,
                            sampleRate,
                        });
                    default:
                        throw new Error(`SoundDetector backend '${activeBackend}' is not supported.`);
                }
            })();
            this._detectorBackends.set(activeBackend, detectorBackendPromise);
        }
        return detectorBackendPromise;
    }
}

// Import other modules as they are implemented in future.
// import { SceneMesh } from '/depth/SceneMesh.js';
// import { LightEstimation } from '/lighting/LightEstimation.js';
// import { HumanRecognizer } from '/human/HumanRecognizer.js';
/**
 * Manages all interactions with the real-world environment perceived by the XR
 * device. This class abstracts the complexity of various perception APIs
 * (Depth, Planes, Meshes, etc.) and provides a simple, event-driven interface
 * for developers to use `this.world.depth.mesh`, `this.world.planes`.
 */
class World extends Script {
    constructor() {
        super(...arguments);
        this.editorIcon = 'sensors';
        /**
         * A Three.js Raycaster for performing intersection tests.
         */
        this.raycaster = new THREE.Raycaster();
        // Whether we need to initiate a room capture.
        this.needsRoomCapture = false;
    }
    static { this.dependencies = {
        options: WorldOptions,
        camera: THREE.Camera,
    }; }
    /**
     * Initializes the world-sensing modules based on the provided configuration.
     * This method is called automatically by the XRCore.
     */
    async init({ options, camera, }) {
        this.options = options;
        this.camera = camera;
        if (!this.options || !this.options.enabled) {
            return;
        }
        this.needsRoomCapture = this.options.initiateRoomCapture;
        // Conditionally initialize each perception module based on options.
        if (this.options.planes.enabled) {
            this.planes = new PlaneDetector();
            this.add(this.planes);
        }
        if (this.options.objects.enabled) {
            this.objects = new ObjectDetector();
            this.add(this.objects);
        }
        if (this.options.meshes.enabled) {
            this.meshes = new MeshDetector();
            this.add(this.meshes);
        }
        if (this.options.sounds.enabled) {
            this.sounds = new SoundDetector();
            this.add(this.sounds);
        }
        // TODO: Initialize other modules as they are available & implemented.
        /*
    
        if (this.options.lighting.enabled) {
          this.lighting = new LightEstimation();
        }
    
        if (this.options.humans.enabled) {
          this.humans = new HumanRecognizer();
        }
        */
    }
    /**
     * Places an object at the reticle.
     */
    anchorObjectAtReticle(_object, _reticle) {
        throw new Error('Method not implemented');
    }
    /**
     * Updates all active world-sensing modules with the latest XRFrame data.
     * This method is called automatically by the XRCore on each frame.
     * @param _timestamp - The timestamp for the current frame.
     * @param frame - The current XRFrame, containing environmental
     * data.
     * @override
     */
    update(_timestamp, frame) {
        if (!this.options?.enabled || !frame) {
            return;
        }
        if (this.needsRoomCapture && frame.session.initiateRoomCapture) {
            this.needsRoomCapture = false;
            frame.session.initiateRoomCapture();
        }
        this.meshes?.updateMeshes(_timestamp, frame);
    }
    /**
     * Performs a raycast from a controller against detected real-world surfaces
     * (currently planes) and places a 3D object at the intersection point,
     * oriented to face the user.
     *
     * We recommend using /templates/3_depth/ to anchor objects based on
     * depth mesh for mixed reality experience for accuracy. This function is
     * design for demonstration purposes.
     *
     * @param objectToPlace - The object to position in the
     * world.
     * @param controller - The controller to use for raycasting.
     * @returns True if the object was successfully placed, false
     * otherwise.
     */
    placeOnSurface(objectToPlace, controller) {
        if (!this.planes) {
            console.warn('Cannot placeOnSurface: PlaneDetector is not enabled.');
            return false;
        }
        const allPlanes = this.planes.get();
        if (allPlanes.length === 0) {
            return false; // No surfaces to cast against.
        }
        this.raycaster.setFromXRController(controller);
        const intersections = this.raycaster.intersectObjects(allPlanes);
        if (intersections.length > 0) {
            const intersection = intersections[0];
            placeObjectAtIntersectionFacingTarget(objectToPlace, intersection, this.camera);
            return true;
        }
        return false;
    }
    /**
     * Toggles the visibility of all debug visualizations for world features.
     * @param visible - Whether the visualizations should be visible.
     */
    showDebugVisualizations(visible = true) {
        this.planes?.showDebugVisualizations(visible);
        this.objects?.showDebugVisualizations(visible);
    }
}

class Simulator extends Script {
    static { this.dependencies = {
        simulatorOptions: SimulatorOptions,
        input: Input,
        timer: THREE.Timer,
        camera: THREE.Camera,
        renderer: THREE.WebGLRenderer,
        scene: THREE.Scene,
        registry: Registry,
        options: Options,
        depth: Depth,
        world: World,
    }; }
    constructor(renderMainScene) {
        super();
        this.renderMainScene = renderMainScene;
        this.editorIcon = 'simulation';
        this.simulatorScene = new SimulatorScene();
        this.simulatorWorld = new SimulatorWorld();
        this.depth = new SimulatorDepth(this.simulatorScene);
        // Controller poses relative to the camera.
        this.simulatorControllerState = new SimulatorControllerState();
        this.hands = new SimulatorHands(this.simulatorControllerState, this.simulatorScene);
        this.simulatorUser = new SimulatorUser();
        this.userInterface = new SimulatorInterface();
        this.controls = new SimulatorControls(this.simulatorControllerState, this.hands, this.setStereoRenderMode.bind(this), this.userInterface);
        this.renderDepthPass = false;
        this.renderMode = SimulatorRenderMode.DEFAULT;
        this.stereoCameras = [];
        this.initialized = false;
        this.renderSimulatorSceneToCanvasBound = this.renderSimulatorSceneToCanvas.bind(this);
        this.add(this.simulatorUser);
    }
    async init({ simulatorOptions, input, timer, camera, renderer, scene, registry, options, depth, world, }) {
        if (this.initialized)
            return;
        // Get optional dependencies from the registry.
        const deviceCamera = registry.get(XRDeviceCamera);
        this.options = simulatorOptions;
        camera.position.copy(this.options.initialCameraPosition);
        this.userInterface.init(simulatorOptions, this.controls, this.hands, input, this.simulatorScene);
        renderer.autoClearColor = false;
        await this.simulatorScene.init(simulatorOptions);
        await this.simulatorWorld.init(options, world);
        this.hands.init({ input });
        this.controls.init({ camera, input, timer, renderer, simulatorOptions });
        if (deviceCamera &&
            !this.simulatorCamera &&
            this.options.deviceCamera.enabled) {
            this.simulatorCamera = new SimulatorCamera(renderer);
            this.simulatorCamera.init();
            deviceCamera.registerSimulatorCamera(this.simulatorCamera);
        }
        deviceCamera?.init();
        if (options.depth.enabled) {
            this.renderDepthPass = true;
            this.depth.init(renderer, camera, depth);
        }
        scene.add(camera);
        if (this.options.stereo.enabled) {
            this.setupStereoCameras(camera);
        }
        const activeEnv = this.options.environments[this.options.activeEnvironmentIndex];
        if (activeEnv?.videoPath) {
            this.videoElement = document.createElement('video');
            this.videoElement.src = activeEnv.videoPath;
            this.videoElement.loop = true;
            this.videoElement.muted = true;
            this.videoElement.play().catch((e) => {
                console.error(`Simulator: Failed to play video at ${activeEnv.videoPath}`, e);
            });
            this.videoElement.addEventListener('error', () => {
                console.error(`Simulator: Error loading video at ${activeEnv.videoPath}`, this.videoElement?.error);
            });
            const videoTexture = new THREE.VideoTexture(this.videoElement);
            videoTexture.colorSpace = THREE.SRGBColorSpace;
            this.backgroundVideoQuad = new FullScreenQuad(new THREE.MeshBasicMaterial({ map: videoTexture }));
        }
        this.virtualSceneRenderTarget = new THREE.WebGLRenderTarget(renderer.domElement.width, renderer.domElement.height, { stencilBuffer: options.stencil });
        const virtualSceneMaterial = new THREE.MeshBasicMaterial({
            map: this.virtualSceneRenderTarget.texture,
            transparent: true,
        });
        if (this.options.blendingMode === 'screen') {
            virtualSceneMaterial.blending = THREE.CustomBlending;
            virtualSceneMaterial.blendSrc = THREE.OneFactor;
            virtualSceneMaterial.blendDst = THREE.OneMinusSrcColorFactor;
            virtualSceneMaterial.blendEquation = THREE.AddEquation;
        }
        this.virtualSceneFullScreenQuad = new FullScreenQuad(virtualSceneMaterial);
        this.renderer = renderer;
        this.mainCamera = camera;
        this.mainScene = scene;
        this.registry = registry;
        this.initialized = true;
    }
    simulatorUpdate() {
        this.controls.update();
        this.hands.update();
        if (this.renderDepthPass) {
            this.depth.update();
        }
    }
    setStereoRenderMode(mode) {
        if (!this.options.stereo.enabled)
            return;
        this.renderMode = mode;
    }
    setupStereoCameras(camera) {
        const leftCamera = camera.clone();
        const rightCamera = camera.clone();
        leftCamera.layers.disableAll();
        leftCamera.layers.enable(0);
        leftCamera.layers.enable(1);
        rightCamera.layers.disableAll();
        rightCamera.layers.enable(0);
        rightCamera.layers.enable(2);
        leftCamera.position.set(-AVERAGE_IPD_METERS / 2, 0, 0);
        rightCamera.position.set(AVERAGE_IPD_METERS / 2, 0, 0);
        leftCamera.updateWorldMatrix(true, false);
        rightCamera.updateWorldMatrix(true, false);
        this.stereoCameras.length = 0;
        this.stereoCameras.push(leftCamera, rightCamera);
        camera.add(leftCamera, rightCamera);
        this.setStereoRenderMode(SimulatorRenderMode.STEREO_LEFT);
    }
    onBeforeSimulatorSceneRender() {
        this.simulatorCamera?.onBeforeSimulatorSceneRender(this.mainCamera, this.renderSimulatorSceneToCanvasBound);
    }
    onSimulatorSceneRendered() {
        this.simulatorCamera?.onSimulatorSceneRendered();
    }
    getRenderCamera() {
        return {
            [SimulatorRenderMode.DEFAULT]: this.mainCamera,
            [SimulatorRenderMode.STEREO_LEFT]: this.stereoCameras[0],
            [SimulatorRenderMode.STEREO_RIGHT]: this.stereoCameras[1],
        }[this.renderMode];
    }
    // Called by core when the simulator is running.
    renderScene() {
        if (!this.renderer)
            return;
        if (!this.options.renderToRenderTexture)
            return;
        // Allocate a new render target if the resolution changes.
        if (this.virtualSceneRenderTarget.width != this.renderer.domElement.width ||
            this.virtualSceneRenderTarget.height != this.renderer.domElement.height) {
            const stencilEnabled = !!this.virtualSceneRenderTarget?.stencilBuffer;
            this.virtualSceneRenderTarget.dispose();
            this.virtualSceneRenderTarget = new THREE.WebGLRenderTarget(this.renderer.domElement.width, this.renderer.domElement.height, { stencilBuffer: stencilEnabled });
            this.virtualSceneFullScreenQuad.material.map = this.virtualSceneRenderTarget.texture;
        }
        this.sparkRenderer =
            this.sparkRenderer || this.registry.get(SparkRendererHolder)?.renderer;
        if (this.sparkRenderer) {
            this.sparkRenderer.encodeLinear = true;
        }
        this.renderer.setRenderTarget(this.virtualSceneRenderTarget);
        this.renderer.clear();
        this.renderMainScene(this.getRenderCamera());
    }
    // Renders the simulator scene onto the main canvas.
    // Then composites the virtual render with the simulator render.
    // Called by core after renderScene.
    renderSimulatorScene() {
        this.onBeforeSimulatorSceneRender();
        this.renderSimulatorSceneToCanvas(this.getRenderCamera());
        this.onSimulatorSceneRendered();
        if (this.options.renderToRenderTexture) {
            this.virtualSceneFullScreenQuad.render(this.renderer);
        }
        else {
            // Temporary workaround since splats look faded when rendered to a render
            // texture.
            this.renderMainScene(this.getRenderCamera());
        }
    }
    renderSimulatorSceneToCanvas(camera) {
        if (this.sparkRenderer) {
            this.sparkRenderer.encodeLinear = false;
        }
        this.renderer.setRenderTarget(null);
        if (this.backgroundVideoQuad) {
            this.backgroundVideoQuad.render(this.renderer);
        }
        this.renderer.render(this.simulatorScene, camera);
        this.renderer.clearDepth();
    }
}

const DEFAULT_SCHEDULE_AHEAD_TIME = 1.0;
class AudioPlayer extends Script {
    constructor(options = {}) {
        super();
        this.options = {};
        this.audioQueue = [];
        this.nextStartTime = 0;
        this.volume = 1.0;
        this.category = 'speech';
        this.scheduleAheadTime = DEFAULT_SCHEDULE_AHEAD_TIME;
        this.options = { sampleRate: 24000, channelCount: 1, ...options };
        if (options.category) {
            this.category = options.category;
        }
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
        }
        else if (this.gainNode) {
            this.gainNode.gain.value = this.volume;
        }
    }
    async initializeAudioContext() {
        if (!this.audioContext) {
            this.audioContext = new AudioContext({
                sampleRate: this.options.sampleRate,
            });
            this.nextStartTime = this.audioContext.currentTime;
            // Create gain node for volume control
            this.gainNode = this.audioContext.createGain();
            this.gainNode.connect(this.audioContext.destination);
            this.updateGainNodeVolume();
        }
        // Ensure audio context is running (not suspended)
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }
    async playAudioChunk(base64AudioData) {
        if (!base64AudioData)
            return;
        await this.initializeAudioContext();
        const arrayBuffer = this.base64ToArrayBuffer(base64AudioData);
        const audioBuffer = this.audioContext.createBuffer(this.options.channelCount, arrayBuffer.byteLength / 2, this.options.sampleRate);
        const channelData = audioBuffer.getChannelData(0);
        const int16View = new Int16Array(arrayBuffer);
        for (let i = 0; i < int16View.length; i++) {
            channelData[i] = int16View[i] / 32768.0;
        }
        this.audioQueue.push(audioBuffer);
        this.scheduleAudioBuffers();
    }
    scheduleAudioBuffers() {
        while (this.audioQueue.length > 0 &&
            this.nextStartTime <=
                this.audioContext.currentTime + this.scheduleAheadTime) {
            const audioBuffer = this.audioQueue.shift();
            const currentTime = this.audioContext.currentTime;
            const startTime = Math.max(this.nextStartTime, currentTime);
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            // Connect through gain node for volume control
            source.connect(this.gainNode || this.audioContext.destination);
            source.onended = () => this.scheduleAudioBuffers();
            // Start playback
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
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }
    stop() {
        this.clearQueue();
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = undefined;
            this.gainNode = undefined;
            this.nextStartTime = 0; // Reset timing
        }
    }
    static isSupported() {
        return !!('AudioContext' in window);
    }
    dispose() {
        this.stop();
        super.dispose();
    }
}

const MUSIC_LIBRARY_PATH = XR_BLOCKS_ASSETS_PATH + 'musicLibrary/';
const musicLibrary = {
    ambient: MUSIC_LIBRARY_PATH + 'AmbientLoop.opus',
    background: MUSIC_LIBRARY_PATH + 'BackgroundMusic4.mp3',
    buttonHover: MUSIC_LIBRARY_PATH + 'ButtonHover.opus',
    buttonPress: MUSIC_LIBRARY_PATH + 'ButtonPress.opus',
    menuDismiss: MUSIC_LIBRARY_PATH + 'MenuDismiss.opus',
};
class BackgroundMusic extends Script {
    constructor(listener, categoryVolumes) {
        super();
        this.listener = listener;
        this.categoryVolumes = categoryVolumes;
        this.audioLoader = new THREE.AudioLoader();
        this.currentAudio = null;
        this.isPlaying = false;
        this.musicLibrary = musicLibrary;
        this.specificVolume = 0.5;
        this.musicCategory = 'music';
    }
    // Set the volume for this instance of BackgroundMusic
    setVolume(level) {
        this.specificVolume = THREE.MathUtils.clamp(level, 0.0, 1.0);
        if (this.currentAudio && this.isPlaying && this.categoryVolumes) {
            const effectiveVolume = this.categoryVolumes.getEffectiveVolume(this.musicCategory, this.specificVolume);
            this.currentAudio.setVolume(effectiveVolume);
            console.log(`BackgroundMusic volume updated to: ${effectiveVolume} (specific: ${this.specificVolume})`);
        }
    }
    playMusic(musicKey, category = 'music') {
        if (!this.categoryVolumes || !this.listener || !this.audioLoader) {
            console.error('BackgroundMusic not properly initialized.');
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
            audio.setLoop(this.musicCategory === 'music' || this.musicCategory === 'ambient');
            const effectiveVolume = this.categoryVolumes.getEffectiveVolume(this.musicCategory, this.specificVolume);
            audio.setVolume(effectiveVolume);
            console.log(`BackgroundMusic: Setting volume for "${musicKey}" to ${effectiveVolume}`);
            audio.play();
            this.currentAudio = audio;
            this.isPlaying = true;
            console.log(`BackgroundMusic: Playing "${musicKey}" in category "${this.musicCategory}"`);
        }, (xhr) => {
            console.log(`BackgroundMusic: Loading ${soundPath} - ${((xhr.loaded / xhr.total) *
                100).toFixed(0)}% loaded`);
        }, (error) => {
            console.error(`BackgroundMusic: Error loading sound ${soundPath}:`, error);
            this.currentAudio = null;
            this.isPlaying = false;
        });
    }
    stopMusic() {
        if (this.currentAudio && this.isPlaying) {
            console.log('BackgroundMusic: Stopping current audio.');
            this.currentAudio.stop();
        }
        this.currentAudio = null;
        this.isPlaying = false;
    }
    destroy() {
        console.log('BackgroundMusic Destroying...');
        this.stopMusic();
    }
}

var VolumeCategory;
(function (VolumeCategory) {
    VolumeCategory["music"] = "music";
    VolumeCategory["sfx"] = "sfx";
    VolumeCategory["speech"] = "speech";
    VolumeCategory["ui"] = "ui";
})(VolumeCategory || (VolumeCategory = {}));
class CategoryVolumes {
    constructor() {
        this.isMuted = false;
        this.masterVolume = 1.0;
        this.volumes = Object.fromEntries(Object.values(VolumeCategory).map((cat) => [cat, 1.0]));
    }
    getCategoryVolume(category) {
        return this.volumes[category] ?? 1.0;
    }
    getEffectiveVolume(category, specificVolume = 1.0) {
        if (this.isMuted)
            return 0.0;
        const categoryVol = this.getCategoryVolume(category);
        const clampedSpecificVolume = THREE.MathUtils.clamp(specificVolume, 0.0, 1.0);
        return this.masterVolume * categoryVol * clampedSpecificVolume;
    }
}

/**
 * Defines common UI sound presets with their default parameters.
 * Each preset specifies frequency, duration, and waveform type.
 */
const SOUND_PRESETS = {
    BEEP: { frequency: 1000, duration: 0.07, waveformType: 'sine' },
    CLICK: [
        { frequency: 1500, duration: 0.02, waveformType: 'triangle', delay: 0 },
    ],
    ACTIVATE: [
        { frequency: 800, duration: 0.05, waveformType: 'sine', delay: 0 },
        { frequency: 1200, duration: 0.07, waveformType: 'sine', delay: 50 },
    ],
    DEACTIVATE: [
        { frequency: 1200, duration: 0.05, waveformType: 'sine', delay: 0 },
        { frequency: 800, duration: 0.07, waveformType: 'sine', delay: 50 },
    ],
};
class SoundSynthesizer extends Script {
    constructor() {
        super(...arguments);
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
            if (this.debug) {
                console.log('SoundSynthesizer: AudioContext initialized.');
            }
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
        this._initAudioContext(); // Initialize context on first interaction
        if (!this.audioContext) {
            console.error('SoundSynthesizer: AudioContext not available. Cannot play tone.');
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
        // Stop the sound after the specified duration with a slight fade out to
        // prevent clicks
        const stopTime = this.audioContext.currentTime + duration;
        const fadeOutTime = Math.max(0.01, duration * 0.1); // Fade out over 10% of duration, min 0.01s
        gainNode.gain.exponentialRampToValueAtTime(0.00001, stopTime - fadeOutTime);
        oscillator.stop(stopTime);
    }
    /**
     * Plays a predefined sound preset.
     * @param presetName - The name of the preset (e.g., 'BEEP', 'CLICK',
     *     'ACTIVATE', 'DEACTIVATE').
     * @param volume - The volume for the preset (overrides default
     *     if present, otherwise uses this).
     */
    playPresetTone(presetName, volume = 0.5) {
        const preset = SOUND_PRESETS[presetName];
        if (!preset) {
            console.warn(`SoundSynthesizer: Preset '${presetName}' not found.`);
            return;
        }
        // Handle single tone presets
        if (!Array.isArray(preset)) {
            const tone = preset;
            this.playTone(tone.frequency, tone.duration, volume, tone.waveformType);
        }
        else {
            // Handle multi-tone sequences
            preset.forEach((toneConfig) => {
                setTimeout(() => {
                    this.playTone(toneConfig.frequency, toneConfig.duration, volume, toneConfig.waveformType);
                }, toneConfig.delay || 0);
            });
        }
    }
}

const spatialSoundLibrary = {
    ambient: 'musicLibrary/AmbientLoop.opus',
    buttonHover: 'musicLibrary/ButtonHover.opus',
    paintOneShot1: 'musicLibrary/PaintOneShot1.opus',
};
let soundIdCounter = 0;
class SpatialAudio extends Script {
    constructor(listener, categoryVolumes) {
        super();
        this.listener = listener;
        this.categoryVolumes = categoryVolumes;
        this.audioLoader = new THREE.AudioLoader();
        this.soundLibrary = spatialSoundLibrary;
        // Stores { audio: PositionalAudio, target: Object3D } by id
        this.activeSounds = new Map();
        this.specificVolume = 1.0;
        this.category = 'sfx';
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
            console.error('SpatialAudio not properly initialized or targetObject missing.');
            return null;
        }
        const soundPath = this.soundLibrary[soundKey];
        if (!soundPath) {
            console.error(`SpatialAudio: Sound key "${soundKey}" not found.`);
            return null;
        }
        const soundId = ++soundIdCounter;
        const specificVolume = options.volume !== undefined ? options.volume : this.specificVolume;
        const loop = options.loop || false;
        const refDistance = options.refDistance !== undefined
            ? options.refDistance
            : this.defaultRefDistance;
        const rolloffFactor = options.rolloffFactor !== undefined
            ? options.rolloffFactor
            : this.defaultRolloffFactor;
        console.log(`SpatialAudio: Loading sound "${soundKey}" (${soundPath})`);
        this.audioLoader.load(soundPath, (buffer) => {
            console.log(`SpatialAudio: Successfully loaded "${soundKey}"`);
            if (!this.listener) {
                console.error('SpatialAudio: Listener lost during load.');
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
                audio: audio,
                target: targetObject,
                options: options,
            });
            // Set up cleanup for non-looping sounds
            if (!loop) {
                audio.onEnded = () => {
                    console.log(`SpatialAudio: Sound "${soundKey}" (ID: ${soundId}) ended.`);
                    this._cleanupSound(soundId);
                    if (options.onEnded && typeof options.onEnded === 'function') {
                        options.onEnded();
                    }
                    // Important: Clear the onEnded handler after it runs once
                    // to prevent issues if the object is reused.
                    audio.onEnded = () => { };
                };
            }
            audio.play();
            console.log(`SpatialAudio: Playing "${soundKey}" (ID: ${soundId}) at object ${targetObject.name || targetObject.uuid}, Volume: ${effectiveVolume}`);
        }, (xhr) => {
            console.log(`SpatialAudio: Loading "${soundKey}" - ${((xhr.loaded / xhr.total) *
                100).toFixed(0)}% loaded`);
        }, (error) => {
            console.error(`SpatialAudio: Error loading sound "${soundKey}":`, error);
            this.activeSounds.delete(soundId); // Clean up if loading failed
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
            if (soundData.audio.isPlaying) {
                soundData.audio.stop();
            }
            this._cleanupSound(soundId);
        }
        else {
            console.warn(`SpatialAudio: Sound ID ${soundId} not found for stopping.`);
        }
    }
    /**
     * Internal method to remove sound from object and map.
     * @param soundId - id
     */
    _cleanupSound(soundId) {
        const soundData = this.activeSounds.get(soundId);
        if (soundData) {
            if (soundData.audio.isPlaying) {
                try {
                    soundData.audio.stop();
                }
                catch {
                    // continue regardless of error
                }
            }
            if (soundData.target && soundData.audio.parent === soundData.target) {
                soundData.target.remove(soundData.audio);
            }
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
        this.specificVolume = THREE.MathUtils.clamp(level, 0.0, 1.0);
        console.log(`SpatialAudio default specific volume set to: ${this.specificVolume}`);
    }
    /**
     * Updates the volume of all currently playing spatial sounds managed by this
     * instance.
     */
    updateAllVolumes() {
        if (!this.categoryVolumes)
            return;
        console.log(`SpatialAudio: Updating volumes for ${this.activeSounds.size} active sounds.`);
        this.activeSounds.forEach((soundData) => {
            const specificVolume = soundData.options.volume !== undefined
                ? soundData.options.volume
                : this.specificVolume;
            const effectiveVolume = this.categoryVolumes.getEffectiveVolume(this.category, specificVolume);
            soundData.audio.setVolume(effectiveVolume);
        });
    }
    destroy() {
        console.log('SpatialAudio Destroying...');
        const idsToStop = Array.from(this.activeSounds.keys());
        idsToStop.forEach((id) => this.stopSound(id));
        this.activeSounds.clear();
        console.log('SpatialAudio Destroyed.');
    }
}

class SpeechRecognizer extends Script {
    static { this.dependencies = { soundOptions: SoundOptions }; }
    constructor(soundSynthesizer) {
        super();
        this.soundSynthesizer = soundSynthesizer;
        this.isListening = false;
        this.lastTranscript = '';
        this.lastConfidence = 0;
        this.playActivationSounds = false;
        this.handleStartBound = this._handleStart.bind(this);
        this.handleResultBound = this._handleResult.bind(this);
        this.handleEndBound = this._handleEnd.bind(this);
        this.handleErrorBound = this._handleError.bind(this);
    }
    init({ soundOptions }) {
        this.options = soundOptions.speechRecognizer;
        const SpeechRecognitionAPI = window.SpeechRecognition ||
            window.webkitSpeechRecognition;
        if (!SpeechRecognitionAPI) {
            console.warn('SpeechRecognizer: Speech Recognition API not supported in this browser.');
            this.error = 'API not supported';
            return;
        }
        this.recognition = new SpeechRecognitionAPI();
        this.recognition.lang = this.options.lang;
        this.recognition.continuous = this.options.continuous;
        this.recognition.interimResults = this.options.interimResults;
        // Setup native event listeners
        this.recognition.onstart = this.handleStartBound;
        this.recognition.onresult = this.handleResultBound;
        this.recognition.onend = this.handleEndBound;
        this.recognition.onerror = this.handleErrorBound;
    }
    onSimulatorStarted() {
        this.playActivationSounds = this.options.playSimulatorActivationSounds;
    }
    start() {
        if (!this.recognition) {
            console.error('SpeechRecognizer: Not initialized.');
            return;
        }
        if (this.isListening) {
            console.warn('SpeechRecognizer: Already listening.');
            return;
        }
        try {
            this.lastTranscript = '';
            this.lastCommand = undefined;
            this.lastConfidence = 0;
            this.error = undefined;
            this.recognition.start();
            this.isListening = true;
            console.debug('SpeechRecognizer: Listening started.');
        }
        catch (e) {
            console.error('SpeechRecognizer: Error starting recognition:', e);
            this.error = e.message || 'Start failed';
            this.isListening = false;
            this.dispatchEvent({ type: 'error', error: this.error });
        }
    }
    stop() {
        if (!this.recognition || !this.isListening) {
            return;
        }
        try {
            this.recognition.stop();
            console.debug('SpeechRecognizer: Stop requested.');
        }
        catch (e) {
            console.error('SpeechRecognizer: Error stopping recognition:', e);
            this.error = e.message || 'Stop failed';
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
    // Private handler for the 'start' event
    _handleStart() {
        console.debug('SpeechRecognizer: Listening started.');
        this.dispatchEvent({ type: 'start' });
        if (this.playActivationSounds) {
            this.soundSynthesizer.playPresetTone('ACTIVATE');
        }
    }
    // Private handler for the 'result' event
    _handleResult(event) {
        let interimTranscript = '';
        let finalTranscript = '';
        let currentConfidence = 0;
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            const result = event.results[i];
            const transcript = result[0].transcript;
            if (result.isFinal) {
                finalTranscript += transcript;
                currentConfidence = result[0].confidence;
            }
            else {
                interimTranscript += transcript;
            }
        }
        this.lastTranscript = finalTranscript.trim() || interimTranscript.trim();
        this.lastConfidence = currentConfidence;
        this.lastCommand = undefined;
        if (finalTranscript && this.options.commands.length > 0) {
            const upperTranscript = finalTranscript.trim().toUpperCase();
            for (const command of this.options.commands) {
                if (upperTranscript.includes(command.toUpperCase()) &&
                    this.lastConfidence >= this.options.commandConfidenceThreshold) {
                    this.lastCommand = command;
                    console.debug(`SpeechRecognizer Detected Command: ${this.lastCommand}`);
                    break;
                }
            }
        }
        // Dispatch a 'result' event with all the relevant data
        this.dispatchEvent({
            type: 'result',
            originalEvent: event,
            transcript: this.lastTranscript,
            confidence: this.lastConfidence,
            command: this.lastCommand,
            isFinal: !!finalTranscript,
        });
    }
    // Private handler for the 'end' event (e.g., when silence is detected)
    _handleEnd() {
        this.isListening = false;
        this.dispatchEvent({ type: 'end' });
        if (this.options.continuous &&
            this.error !== 'aborted' &&
            this.error !== 'no-speech') {
            console.debug('SpeechRecognizer: Restarting continuous listening...');
            setTimeout(() => this.start(), 100);
        }
        else if (this.playActivationSounds) {
            this.soundSynthesizer.playPresetTone('DEACTIVATE');
        }
    }
    // Private handler for the 'error' event
    _handleError(event) {
        console.error('SpeechRecognizer: Error:', event.error);
        this.error = event.error;
        this.isListening = false;
        this.dispatchEvent({ type: 'error', error: event.error });
    }
    destroy() {
        this.stop();
        if (this.recognition) {
            this.recognition.onstart = null;
            this.recognition.onresult = null;
            this.recognition.onend = null;
            this.recognition.onerror = null;
            this.recognition = undefined;
        }
    }
}

class SpeechSynthesizer extends Script {
    static { this.dependencies = { soundOptions: SoundOptions }; }
    constructor(categoryVolumes, onStartCallback = () => { }, onEndCallback = () => { }, onErrorCallback = (_) => { }) {
        super();
        this.categoryVolumes = categoryVolumes;
        this.onStartCallback = onStartCallback;
        this.onEndCallback = onEndCallback;
        this.onErrorCallback = onErrorCallback;
        this.synth = window.speechSynthesis;
        this.voices = [];
        this.isSpeaking = false;
        this.debug = false;
        this.specificVolume = 1.0;
        this.speechCategory = 'speech';
        if (!this.synth) {
            console.error('SpeechSynthesizer: Speech Synthesis API not supported.');
        }
        else {
            this.loadVoices();
            if (this.synth.onvoiceschanged !== undefined) {
                this.synth.onvoiceschanged = this.loadVoices.bind(this);
            }
        }
        if (!this.categoryVolumes && this.synth) {
            console.warn('SpeechSynthesizer: CategoryVolumes not found. Volume control will use specificVolume only.');
        }
    }
    init({ soundOptions }) {
        this.options = soundOptions.speechSynthesizer;
        if (this.debug) {
            console.log('SpeechSynthesizer initialized.');
        }
    }
    loadVoices() {
        if (!this.synth)
            return;
        this.voices = this.synth.getVoices();
        if (this.debug) {
            console.log('SpeechSynthesizer: Voices loaded:', this.voices.length);
        }
        this.selectedVoice =
            this.voices.find((voice) => voice.name.includes('Google') && voice.lang.startsWith('en')) || this.voices.find((voice) => voice.lang.startsWith('en'));
        if (this.selectedVoice) {
            if (this.debug) {
                console.log('SpeechSynthesizer: Selected voice:', this.selectedVoice.name);
            }
        }
        else {
            console.warn('SpeechSynthesizer: No suitable default voice found.');
        }
    }
    setVolume(level) {
        this.specificVolume = THREE.MathUtils.clamp(level, 0.0, 1.0);
        console.log(`SpeechSynthesizer specific volume set to: ${this.specificVolume}`);
    }
    speak(text, lang = 'en-US', pitch = 1.0, rate = 1.0) {
        return new Promise((resolve, reject) => {
            if (!this.synth) {
                console.warn('SpeechSynthesizer: Cannot speak. API not supported.');
                return reject(new Error('Speech Synthesis API not supported.'));
            }
            if (this.isSpeaking) {
                if (this.options.allowInterruptions) {
                    console.warn('SpeechSynthesizer: Already speaking. Interrupting current speech.');
                    this.cancel();
                }
                else {
                    const errorMsg = 'Already speaking and interruptions are not allowed.';
                    console.warn(`SpeechSynthesizer: ${errorMsg}`);
                    return reject(new Error(errorMsg));
                }
            }
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.onstart = () => {
                this.isSpeaking = true;
                console.log('SpeechSynthesizer: Speaking started.');
                if (this.onStartCallback)
                    this.onStartCallback();
            };
            utterance.onend = () => {
                this.isSpeaking = false;
                console.log('SpeechSynthesizer: Speaking ended.');
                if (this.onEndCallback)
                    this.onEndCallback();
                resolve();
            };
            utterance.onerror = (event) => {
                if (this.options.allowInterruptions &&
                    (event.error === 'interrupted' || event.error === 'canceled')) {
                    console.warn(`SpeechSynthesizer: Speech utterance interrupted: ${event.error}`);
                    return;
                }
                // For all other errors, reject the promise.
                console.error('SpeechSynthesizer: Error occurred:', event.error);
                this.isSpeaking = false;
                this.onErrorCallback(new Error(`Speech synthesis error code ${event.error}`));
                reject(event.error);
            };
            // Find a suitable voice if not already selected or if lang changed
            let voice = this.selectedVoice;
            if (!voice || !voice.lang.startsWith(lang.substring(0, 2))) {
                voice =
                    this.voices.find((v) => v.lang === lang && v.name.includes('Google')) ||
                        this.voices.find((v) => v.lang.startsWith(lang.substring(0, 2)) &&
                            v.name.includes('Google')) ||
                        this.voices.find((v) => v.lang === lang) ||
                        this.voices.find((v) => v.lang.startsWith(lang.substring(0, 2)));
            }
            if (voice) {
                utterance.voice = voice;
                console.log(`SpeechSynthesizer: Using voice: ${voice.name} for lang ${lang}`);
            }
            else {
                utterance.lang = lang;
                console.warn(`SpeechSynthesizer: No specific voice found for lang ${lang}. Using browser default.`);
            }
            utterance.pitch = THREE.MathUtils.clamp(pitch, 0, 2);
            utterance.rate = THREE.MathUtils.clamp(rate, 0.1, 10);
            let effectiveVolume = this.specificVolume;
            if (this.categoryVolumes) {
                effectiveVolume = this.categoryVolumes.getEffectiveVolume(this.speechCategory, this.specificVolume);
            }
            else {
                effectiveVolume = THREE.MathUtils.clamp(this.specificVolume, 0.0, 1.0);
            }
            utterance.volume = effectiveVolume;
            console.log(`SpeechSynthesizer: Setting utterance volume to ${effectiveVolume}`);
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
            console.log('SpeechSynthesizer: Speech cancelled.');
        }
    }
    destroy() {
        this.cancel();
        if (this.synth && this.synth.onvoiceschanged !== undefined) {
            this.synth.onvoiceschanged = null;
        }
        this.voices = [];
        console.log('SpeechSynthesizer destroyed.');
    }
}

class CoreSound extends Script {
    constructor() {
        super(...arguments);
        this.type = 'CoreSound';
        this.name = 'Core Sound';
        this.categoryVolumes = new CategoryVolumes();
        this.soundSynthesizer = new SoundSynthesizer();
        this.listener = new THREE.AudioListener();
    }
    static { this.dependencies = { camera: THREE.Camera, soundOptions: SoundOptions }; }
    init({ camera, soundOptions, }) {
        this.options = soundOptions;
        this.backgroundMusic = new BackgroundMusic(this.listener, this.categoryVolumes);
        this.spatialAudio = new SpatialAudio(this.listener, this.categoryVolumes);
        this.audioListener = new AudioListener();
        // Initialize with 48kHz for general audio playback
        // Gemini Live uses 24kHz but that gets handled automatically via playAIAudio
        this.audioPlayer = new AudioPlayer({ sampleRate: 48000 });
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
        this.categoryVolumes.masterVolume = THREE.MathUtils.clamp(level, 0.0, 1.0);
        this.audioPlayer?.updateGainNodeVolume();
    }
    getMasterVolume() {
        return this.categoryVolumes.isMuted
            ? 0.0
            : this.categoryVolumes.masterVolume;
    }
    setCategoryVolume(category, level) {
        if (category in this.categoryVolumes.volumes) {
            this.categoryVolumes.volumes[category] = THREE.MathUtils.clamp(level, 0.0, 1.0);
        }
    }
    getCategoryVolume(category) {
        return category in this.categoryVolumes.volumes
            ? this.categoryVolumes.volumes[category]
            : 1.0;
    }
    async enableAudio(options = {}) {
        const { streamToAI = true, accumulate = false } = options;
        if (streamToAI && this.speechRecognizer?.isListening) {
            console.log('Disabling SpeechRecognizer while streaming audio.');
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
        return this.audioListener.audioContext?.sampleRate || 48000;
    }
    setAIStreaming(enabled) {
        this.audioListener?.setAIStreaming(enabled);
    }
    isAIStreamingEnabled() {
        return this.audioListener?.aiService !== null;
    }
    async playAIAudio(base64AudioData) {
        // Gemini Live API outputs audio at 24kHz
        // Only recreate AudioContext if sample rate needs to change
        const currentRate = this.audioPlayer['options'].sampleRate;
        if (currentRate !== 24000) {
            this.audioPlayer['options'].sampleRate = 24000;
            // Only stop if context exists and is different sample rate
            if (this.audioPlayer['audioContext']) {
                this.audioPlayer.stop(); // Reset context with new sample rate
            }
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
        if (!audioBuffer)
            return;
        // Update sample rate if needed
        if (sampleRate && sampleRate !== this.audioPlayer['options'].sampleRate) {
            this.audioPlayer['options'].sampleRate = sampleRate;
            this.audioPlayer.stop(); // Reset context with new sample rate
        }
        // Convert ArrayBuffer to base64
        const bytes = new Uint8Array(audioBuffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
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
    getEffectiveVolume(category, specificVolume = 1.0) {
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
}

/**
 * Conversion factor from Density-Independent Pixels (DP) to
 * distance-independent millimeters (DMM).
 */
const DP_TO_DMM = 0.868;

// Temporary variables.
const worldScale = new THREE.Vector3();
/**
 * A fundamental UI component for creating interactive user
 * interfaces. It serves as a base class for other UI elements like Panels,
 * Rows, and Columns, providing core layout logic, visibility control, and
 * interaction hooks.
 *
 * Each `View` is a `THREE.Object3D` and inherits lifecycle methods from
 * `Script`.
 */
class View extends Script {
    /**
     * Gets the effective horizontal range for child elements, normalized to 1.0
     * for the smaller dimension.
     * @returns The horizontal layout range.
     */
    get rangeX() {
        return Math.max(this.aspectRatio, 1.0);
    }
    /**
     * Gets the effective vertical range for child elements, normalized to 1.0 for
     * the smaller dimension.
     * @returns The vertical layout range.
     */
    get rangeY() {
        return Math.max(1.0 / this.aspectRatio, 1.0);
    }
    /**
     * Creates an instance of View.
     * @param options - Configuration options to apply to the view.
     * @param geometry - The geometry for the view's mesh.
     * @param material - The material for the view's mesh.
     */
    constructor(options = {}, geometry, material) {
        super();
        /** Text description of the view */
        this.name = 'View';
        /** Flag indicating View behaves as a 2D quad in layout calculations. */
        this.isQuad = true;
        /** Flag indicating if this is the root view of a layout. */
        this.isRoot = false;
        /** Type identifier for easy checking with `instanceof`. */
        this.isView = true;
        /** Determines if this view can be targeted by user input. */
        this.selectable = true;
        // --- Layout Properties ---
        /** Proportional size used in layouts like `Row` or `Col`. */
        this.weight = 0.5;
        /** The width of the view, as a 0-1 ratio of its parent's available space. */
        this.width = 1;
        /** The height of the view, as a 0-1 ratio of its parent's available space. */
        this.height = 1;
        /**
         * The local x-coordinate within the parent's layout, from -0.5 to 0.5.
         * For root view (Panel), this will be addition to the global positioning.
         */
        this.x = 0;
        /**
         * The local y-coordinate within the parent's layout, from -0.5 to 0.5.
         * For root view (Panel), this will be addition to the global positioning.
         */
        this.y = 0;
        /**
         * The local z-coordinate within the parent's layout.
         * For root view (Panel), this will be addition to the global positioning.
         */
        this.z = 0;
        /** Horizontal padding, as a 0-1 ratio of the parent's width. */
        this.paddingX = 0;
        /** Vertical padding, as a 0-1 ratio of the parent's height. */
        this.paddingY = 0;
        /** Depth padding, for z-axis adjustment to prevent z-fighting. */
        this.paddingZ = 0;
        // --- Visual Properties ---
        /** The overall opacity of the view and its children. */
        this.opacity = 1.0;
        /** The calculated aspect ratio (width / height) of this view. */
        this.aspectRatio = 1.0;
        if (geometry && material) {
            this.mesh = new THREE.Mesh(geometry, material);
            this.add(this.mesh);
        }
        Object.assign(this, options);
    }
    /**
     * Converts a value from Density-Independent Pixels (DP) to meters.
     * @param dp - The value in density-independent pixels.
     * @returns The equivalent value in meters.
     */
    static dpToMeters(dp) {
        return dp * DP_TO_DMM * 0.001;
    }
    /**
     * Converts a value from Density-Independent Pixels (DP) to local units.
     * @param dp - The value in density-independent pixels.
     * @returns The equivalent value in local units.
     */
    dpToLocalUnits(dp) {
        this.getWorldScale(worldScale);
        return View.dpToMeters(dp) / worldScale.x;
    }
    /** Makes the view and all its descendants visible. */
    show() {
        this.visible = true;
        this.traverse((child) => {
            child.visible = true;
        });
    }
    /** Makes the view and all its descendants invisible. */
    hide() {
        this.visible = false;
        this.traverse((child) => {
            child.visible = false;
        });
    }
    /**
     * Calculates and applies the position and scale for this single view based on
     * its layout properties and its parent's dimensions.
     */
    updateLayout() {
        if (this.isRoot || this.parent == null) {
            // Root views are centered and scaled directly by their width and height.
            this.aspectRatio = this.width / this.height;
            this.scale.setScalar(Math.min(this.width, this.height));
        }
        else if (this.parent instanceof View) {
            // Child views are positioned relative to their parent with padding.
            // A small depth gap is added to prevent z-fighting between UI layers.
            this.position.set((this.x + this.paddingX) * this.parent.rangeX, (this.y - this.paddingY) * this.parent.rangeY, this.paddingZ + VIEW_DEPTH_GAP);
            this.aspectRatio = (this.width / this.height) * this.parent.aspectRatio;
            this.scale.setScalar(Math.min(this.parent.rangeX * this.width, this.parent.rangeY * this.height));
            // Increment renderOrder to ensure children render on top of parents,
            // which is crucial for transparency.
            this.renderOrder = this.parent.renderOrder + 1;
        }
    }
    /** Triggers a layout update for this view and all its descendants. */
    updateLayouts() {
        this.updateLayoutsBFS();
    }
    /**
     * Performs a Breadth-First Search (BFS) traversal to update the layout tree,
     * ensuring parent layouts are calculated before their children.
     */
    updateLayoutsBFS() {
        const queue = [this];
        while (queue.length > 0) {
            const currentView = queue.shift();
            if (currentView instanceof View) {
                currentView.updateLayout();
                currentView.children.forEach((childView) => {
                    queue.push(childView);
                });
            }
        }
    }
    /**
     * Resets the layout state of this view. Intended for override by subclasses.
     */
    resetLayout() { }
    /** Resets the layout state for this view and all its descendants. */
    resetLayouts() {
        const queue = [this];
        while (queue.length > 0) {
            const currentView = queue.shift();
            if (currentView instanceof View) {
                currentView.resetLayout();
                currentView.children.forEach((childView) => {
                    queue.push(childView);
                });
            }
        }
    }
    /**
     * Overrides `THREE.Object3D.add` to automatically trigger a layout update
     * when a new `View` is added as a child.
     */
    add(...children) {
        super.add(...children);
        for (const child of children) {
            if (child instanceof View) {
                child.updateLayoutsBFS();
            }
        }
        return this;
    }
    /**
     * Hook called on a complete select action (e.g., a click) when this view is
     * the target. Intended for override by subclasses.
     * @param _id - The ID of the controller that triggered the action.
     */
    onTriggered(_id) { }
}

const FONT_FAMILIES = {
    Roboto: 'https://fonts.gstatic.com/s/roboto/v18/KFOmCnqEu92Fr1Mu4mxM.woff'};
const MATERIAL_ICONS_FONT_FILE = 'https://cdn.jsdelivr.net/gh/marella/material-icons@v1.13.14/iconfont/material-icons.woff';

// --- Dynamic Import of Troika Three Text and its dependencies ---
/** Enum for the status of the Troika dynamic import. */
var TroikaImportStatus;
(function (TroikaImportStatus) {
    TroikaImportStatus[TroikaImportStatus["PENDING"] = 0] = "PENDING";
    TroikaImportStatus[TroikaImportStatus["SUCCESS"] = 1] = "SUCCESS";
    TroikaImportStatus[TroikaImportStatus["FAILED"] = 2] = "FAILED";
})(TroikaImportStatus || (TroikaImportStatus = {}));
// --- Troika Dependency Management ---
let Text;
let troikaImportStatus = TroikaImportStatus.PENDING;
let troikaImportError;
async function importTroika() {
    if (Text)
        return true;
    try {
        const troikaModule = await import('troika-three-text');
        Text = troikaModule.Text;
        troikaImportStatus = TroikaImportStatus.SUCCESS;
        return true;
    }
    catch (error) {
        if (error instanceof Error) {
            troikaImportError = error;
        }
        troikaImportStatus = TroikaImportStatus.FAILED;
        return false;
    }
}
/**
 * A view for displaying text in 3D. It features a dual-rendering
 * system:
 * 1.  **SDF Text (Default):** Uses `troika-three-text` to render crisp,
 * high-quality text using Signed Distance Fields. This is ideal for most
 * use cases. The library is loaded dynamically on demand.
 * 2.  **HTML Canvas Fallback:** If `troika-three-text` fails to load or is
 * disabled via `useSDFText: false`, it renders text to an HTML canvas and
 * applies it as a texture to a plane.
 */
class TextView extends View {
    set text(text) {
        this._text = text;
        if (this.useSDFText && Text && this.textObj instanceof Text) {
            this.textObj.text = text;
            this.textObj.sync();
        }
        else {
            this.updateHTMLText();
        }
    }
    get text() {
        return this._text;
    }
    /**
     * TextView can render text using either Troika SDF text or HTML canvas.
     * @param options - Configuration options for the TextView.
     * @param geometry - Optional geometry for the view's background mesh.
     * @param material - Optional material for the view's background mesh.
     */
    constructor(options = {}, geometry, material) {
        super(options, geometry, material);
        /** Determines which rendering backend to use. Defaults to SDF text. */
        this.useSDFText = true;
        /** TextView resides in a panel by default. */
        this.isRoot = false;
        /** Default description of this view in Three.js DevTools. */
        this.name = 'TextView';
        /** The font file to use. Defaults to Roboto. */
        this.font = FONT_FAMILIES.Roboto;
        /** The color of the font. */
        this.fontColor = 0xffffff;
        /**
         * The maximum width the text can occupy before wrapping.
         * To fit a long TextView within a container, this value should be its
         * container's height / width to avoid it getting rendered outside.
         */
        this.maxWidth = 1.0;
        /** Layout mode. 'fitWidth' scales text to fit the view's width. */
        this.mode = 'fitWidth';
        /** Horizontal anchor point ('left', 'center', 'right'). */
        this.anchorX = 'center';
        /** Vertical anchor point ('top', 'middle', 'bottom'). */
        this.anchorY = 'middle';
        /** Horizontal alignment ('left', 'center', 'right'). */
        this.textAlign = 'center';
        /** The horizontal offset for the `imageOverlay` texture. */
        this.imageOffsetX = 0;
        /** The vertical offset for the `imageOverlay` texture. */
        this.imageOffsetY = 0;
        /** Relative local offset in X. */
        this.x = 0;
        /** Relative local offset in Y. */
        this.y = 0;
        /** Relative local width. */
        this.width = 1;
        /** Relative local height. */
        this.height = 1;
        /** The calculated height of a single line of text. */
        this.lineHeight = 0;
        /** The total number of lines after text wrapping. */
        this.lineCount = 0;
        this._onSyncCompleteBound = this.onSyncComplete.bind(this);
        this._initializeTextCalled = false;
        this._text = 'TextView';
        this.useSDFText = options.useSDFText ?? this.useSDFText;
        this.font = options.font ?? this.font;
        this.fontSize = options.fontSize ?? this.fontSize;
        this.fontSizeDp = options.fontSizeDp ?? this.fontSizeDp;
        this.fontColor = options.fontColor ?? this.fontColor;
        this.maxWidth = options.maxWidth ?? this.maxWidth;
        this.mode = options.mode ?? this.mode;
        this.anchorX = options.anchorX ?? this.anchorX;
        this.anchorY = options.anchorY ?? this.anchorY;
        this.textAlign = options.textAlign ?? this.textAlign;
        this.imageOverlay = options.imageOverlay ?? this.imageOverlay;
        this.imageOffsetX = options.imageOffsetX ?? this.imageOffsetX;
        this.imageOffsetY = options.imageOffsetY ?? this.imageOffsetY;
        this.text = options.text ?? this._text;
    }
    /**
     * Initializes the TextView. It waits for the Troika module to be imported
     * and then creates the text object, sets up aspect ratio, and loads overlays.
     */
    async init(_) {
        this.useSDFText = this.useSDFText && (await importTroika());
        this._initializeText();
    }
    /**
     * Sets the text content of the view.
     * @param text - The text to be displayed.
     */
    setText(text) {
        this.text = text;
    }
    /**
     * Updates the layout of the text object, such as its render order.
     */
    updateLayout() {
        super.updateLayout();
        if (this.textObj) {
            this.textObj.renderOrder = this.renderOrder;
            if (this.fontSizeDp === undefined) {
                switch (this.mode) {
                    case 'fitWidth':
                        this.textObj.scale.setScalar(this.rangeX);
                        break;
                }
            }
        }
        if (this.fontSizeDp && this.textObj) {
            this.createTextSDF();
        }
    }
    /**
     * Creates the text object using Troika Three Text for SDF rendering.
     * This method should only be called from _initializeText() when `useSDFText`
     * is true and the `troika-three-text` module has been successfully imported.
     */
    createTextSDF() {
        const obj = Text && this.textObj instanceof Text ? this.textObj : new Text();
        obj.text = this.text;
        obj.color = getColorHex(this.fontColor);
        obj.font = this.font;
        obj.anchorX = this.anchorX;
        obj.anchorY = this.anchorY;
        if (this.fontSizeDp !== undefined) {
            obj.fontSize = this.dpToLocalUnits(this.fontSizeDp);
        }
        else if (this.fontSize !== undefined) {
            obj.fontSize = this.fontSize;
        }
        else {
            obj.fontSize = 0.06;
        }
        obj.maxWidth = this.maxWidth;
        obj.textAlign = this.textAlign;
        // Transparent objects should not write to depth.
        if (obj.material) {
            obj.material.depthWrite = !obj.material.transparent;
        }
        obj.sync();
        this.textObj = obj;
        this.textObj.layers.mask = this.layers.mask;
        this.add(this.textObj);
    }
    /**
     * Creates a text object using an HTML canvas as a texture on a THREE.Plane.
     * This serves as a fallback when Troika is not available or `useSDFText` is
     * false. This method should only be called from _initializeText().
     */
    createTextHTML() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        const planeGeometry = new THREE.PlaneGeometry(this.width, this.height);
        const texture = new THREE.CanvasTexture(this.canvas);
        const planeMaterial = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
        });
        this.textObj = new THREE.Mesh(planeGeometry, planeMaterial);
        this.updateHTMLText();
        this.add(this.textObj);
    }
    /**
     * Updates the content of the HTML canvas when not using SDF text.
     * It clears the canvas and redraws the text with the current properties.
     */
    updateHTMLText() {
        if (!this.ctx)
            return;
        const { canvas, ctx } = this;
        // A higher resolution gives sharper text.
        const resolution = 256;
        canvas.width = this.width * resolution;
        canvas.height = this.height * resolution;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const fontSize = this.fontSizeDp !== undefined
            ? this.dpToLocalUnits(this.fontSizeDp)
            : (this.fontSize ?? 0.06);
        ctx.font = `${fontSize * resolution}px ${this.font}`;
        ctx.fillStyle = `#${getColorHex(this.fontColor).toString(16).padStart(6, '0')}`;
        // Use the configured textAlign and compute anchor positions accordingly.
        const align = this.textAlign;
        ctx.textAlign = align;
        let drawX;
        switch (align) {
            case 'left':
                drawX = 0;
                break;
            case 'right':
                drawX = canvas.width;
                break;
            default:
                drawX = canvas.width / 2;
                break;
        }
        // Map anchorY to canvas textBaseline and Y position.
        let baseline = 'middle';
        let drawY = canvas.height / 2;
        if (typeof this.anchorY === 'string') {
            if (this.anchorY.startsWith('top')) {
                baseline = 'top';
                drawY = 0;
            }
            else if (this.anchorY.startsWith('bottom')) {
                baseline = 'bottom';
                drawY = canvas.height;
            }
        }
        ctx.textBaseline = baseline;
        // TODO: add line-break for canvas-based text.
        ctx.fillText(this.text, drawX, drawY);
        if (this.textObj?.material.map) {
            this.textObj.material.map.needsUpdate = true;
        }
    }
    /**
     * Callback executed when Troika's text sync is complete.
     * It captures layout data like total height and line count.
     */
    onSyncComplete() {
        if (!this.useSDFText ||
            !(this.textObj instanceof Text) ||
            !this.textObj.textRenderInfo) {
            return;
        }
        const caretPositions = this.textObj.textRenderInfo.caretPositions;
        const numberOfChars = caretPositions.length / 4;
        let lineCount = 0;
        const firstBottom = numberOfChars > 0 ? caretPositions[0] : 0;
        let lastBottom = 999999;
        for (let i = 0; i < numberOfChars; i++) {
            const bottom = caretPositions[i * 4 + 2];
            const top = caretPositions[i * 4 + 3];
            const lineHeight = top - bottom;
            if (bottom < lastBottom - lineHeight / 2) {
                lineCount++;
                lastBottom = bottom;
            }
        }
        this.lineHeight =
            numberOfChars > 0 ? (firstBottom - lastBottom) / lineCount : 0;
        this.lineCount = lineCount;
        this.dispatchEvent({ type: 'synccomplete' });
    }
    /**
     * Private method to perform the actual initialization after the async
     * import has resolved.
     */
    _initializeText() {
        if (this._initializeTextCalled)
            return;
        this._initializeTextCalled = true;
        // Decide whether to use SDF text or fallback to HTML canvas.
        if (this.useSDFText && troikaImportStatus === TroikaImportStatus.SUCCESS) {
            this.createTextSDF();
        }
        else {
            // If the import failed, log a warning.
            if (troikaImportStatus === TroikaImportStatus.FAILED) {
                console.warn('Failed to import `troika-three-text`. For 3D text rendering, please ensure `troika-three-text`, `troika-three-utils`, `troika-worker-utils`, `bidi-js`, and `webgl-sdf-generator` are included in your importmap or installed via npm. Refer to templates/1_ui for an example. Falling back to HTML-based text rendering.', 'Error details:', troikaImportError?.message);
                // Clear the error so we don't log it repeatedly.
                troikaImportError = undefined;
            }
            this.createTextHTML();
        }
        // Applies settings that require the textObj to exist.
        if (this.useSDFText && Text && this.textObj instanceof Text) {
            this.textObj.addEventListener(
            // @ts-expect-error Missing type in Troika
            'synccomplete', this._onSyncCompleteBound);
            if (this.imageOverlay) {
                new THREE.TextureLoader().load(this.imageOverlay, (texture) => {
                    texture.colorSpace = THREE.SRGBColorSpace;
                    texture.offset.x = this.imageOffsetX;
                    const textObj = this.textObj;
                    textObj.material.map = texture;
                    textObj.sync();
                });
            }
        }
        this.updateLayout();
    }
    syncTextObj() {
        if (Text && this.textObj instanceof Text) {
            this.textObj.sync();
        }
    }
    setTextColor(color) {
        if (Text && this.textObj instanceof Text) {
            this.textObj.color = getColorHex(color);
        }
    }
    /**
     * Disposes of resources used by the TextView, such as event listeners.
     */
    dispose() {
        if (this.useSDFText &&
            this.textObj &&
            Text &&
            this.textObj instanceof Text) {
            this.textObj.removeEventListener(
            // @ts-expect-error Missing type in Troika
            'synccomplete', this._onSyncCompleteBound);
        }
        super.dispose();
    }
}

class IconButton extends TextView {
    /**
     * Overrides the parent `rangeX` to ensure the circular shape is not affected
     * by panel aspect ratio.
     */
    get rangeX() {
        return 1;
    }
    /**
     * Overrides the parent `rangeY` to ensure the circular shape is not affected
     * by panel aspect ratio.
     */
    get rangeY() {
        return 1;
    }
    /**
     * An interactive button that displays a single character icon from a font
     * file. Inherits from TextView to handle text rendering.
     * @param options - The options for the IconButton.
     */
    constructor(options = {}) {
        const { backgroundColor = 0xaaaaaa } = options;
        const radius = 0.5;
        const segments = 32;
        const geometry = new THREE.CircleGeometry(radius, segments);
        const material = new THREE.MeshBasicMaterial({
            color: backgroundColor,
            transparent: true,
            depthWrite: false,
            opacity: 0, // Start with zero opacity, will be controlled by interaction
            // logic
            side: THREE.FrontSide,
        });
        // Pass geometry and material to the TextView -> View chain.
        super(options, geometry, material);
        /** The overall opacity when the button is not being interacted with. */
        this.opacity = 1.0;
        /** The background opacity when the button is not being interacted with. */
        this.defaultOpacity = 0.0;
        /** The background color when a reticle hovers over the button. */
        this.hoverColor = 0xaaaaaa;
        /** The background opacity when a reticle hovers over the button. */
        this.hoverOpacity = 0.2;
        /** The background opacity when the button is actively being pressed. */
        this.selectedOpacity = 0.4;
        /** Indicates if the button is disabled and should not respond to interaction. */
        this.disabled = false;
        /** The icon font file to use. Defaults to Material Icons. */
        this.font = MATERIAL_ICONS_FONT_FILE;
        // Applies all provided options to this instance.
        Object.assign(this, options);
    }
    /**
     * Initializes the component and sets the render order.
     */
    async init(_) {
        await super.init();
        if (this.mesh) {
            this.mesh.renderOrder = this.renderOrder;
        }
        if (this.textObj) {
            this.textObj.renderOrder = this.renderOrder + 1;
        }
    }
    /**
  
    /**
     * Handles behavior when the cursor hovers over the button.
     */
    onHoverOver() {
        if (!this.ux)
            return;
        this.update(); // Consolidate logic in update()
    }
    /**
     * Handles behavior when the cursor moves off the button.
     */
    onHoverOut() {
        if (!this.ux)
            return;
        this.update(); // Consolidate logic in update()
    }
    /**
     * Updates the button's visual state based on hover and selection status.
     */
    update() {
        if (!this.ux)
            return;
        if (this.disabled) {
            this.mesh.material.opacity = 0.1; // Dimmed opacity when disabled
            return;
        }
        if (this.ux.isHovered() || this.ux.isSelected()) {
            this.mesh.material.opacity = this.ux.isSelected()
                ? this.selectedOpacity * this.opacity
                : this.hoverOpacity * this.opacity;
        }
        else {
            this.mesh.material.opacity = this.defaultOpacity * this.opacity;
        }
    }
    /**
     * Overrides the parent's triggered behavior to block it when disabled.
     */
    onTriggered(id) {
        if (this.disabled)
            return;
        super.onTriggered(id);
    }
    /**
     * Overrides the parent's private initialization method. This is called by the
     * parent's `init()` method after the Troika module is confirmed to be loaded.
     */
    _initializeText() {
        // First, run the parent's initialization to ensure this.textObj is created.
        super._initializeText();
        // Now that this.textObj is guaranteed to exist, run IconButton-specific
        // logic.
        if (this.textObj) {
            this.textObj.position.set(0, 0, VIEW_DEPTH_GAP);
            // Disable raycasting on the text part of the object so it doesn't
            // interfere with the main button geometry's interaction.
            this.textObj.raycast = () => { };
            // Run initial state update
            this.update();
            switch (this.mode) {
                case 'center':
                    this.textObj.scale.setScalar(this.rangeX);
                    break;
            }
            this.textObj.scale.set(1, 1, 1);
        }
        this.syncTextObj();
        // The parent _initializeText already calls updateLayout, so this is not
        // strictly necessary, but kept for clarity.
        this.updateLayout();
    }
}

class IconView extends TextView {
    constructor(options = {}) {
        super({ font: MATERIAL_ICONS_FONT_FILE, ...options });
    }
}

class ImageView extends View {
    /**
     * @param options - Configuration options. Can include properties like
     * `src`, `width`, `height`, and other properties from the base `View` class.
     */
    constructor(options = {}) {
        super(options);
        this.initCalled = false;
        this.textureLoader = new THREE.TextureLoader();
        const material = new THREE.MeshBasicMaterial({
            map: null, // Texture will be loaded and assigned in reload()
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
        });
        const geometry = new THREE.PlaneGeometry(1, 1);
        this.mesh = new THREE.Mesh(geometry, material);
        this.material = material;
        this.add(this.mesh);
    }
    /**
     * Initializes the component. Called once by the XR Blocks lifecycle.
     */
    init() {
        if (this.initCalled)
            return;
        this.initCalled = true;
        this.reload();
    }
    /**
     * Reloads the image from the `src` URL. If a texture already exists, it is
     * properly disposed of before loading the new one.
     */
    reload() {
        if (!this.src) {
            // If no source, ensure no texture is displayed.
            if (this.material.map) {
                this.material.map = null;
            }
            this.texture?.dispose();
            this.texture = undefined;
            return;
        }
        this.texture?.dispose();
        this.texture = this.textureLoader.load(this.src, (loadedTexture) => {
            loadedTexture.colorSpace = THREE.SRGBColorSpace;
            this.material.map = loadedTexture;
            // Updates layout after the image has loaded to get correct dimensions.
            this.updateLayout();
        });
    }
    /**
     * Updates the layout of the view and then adjusts the mesh scale to maintain
     * the image's aspect ratio.
     * @override
     */
    updateLayout() {
        super.updateLayout();
        if (this.mesh) {
            this.mesh.renderOrder = this.renderOrder;
        }
        this.scaleImageToCorrectAspectRatio();
    }
    /**
     * Calculates the correct scale for the image plane to fit within the view's
     * bounds without distortion.
     */
    scaleImageToCorrectAspectRatio() {
        if (this.texture?.image) {
            const { image } = this.texture;
            const textureWidth = image.width;
            const textureHeight = image.height;
            // Determines the scaling factor to fit the image within the view's range.
            const widthScaleFactor = this.rangeX / textureWidth;
            const heightScaleFactor = this.rangeY / textureHeight;
            const minScaleFactor = Math.min(widthScaleFactor, heightScaleFactor);
            // Applies the calculated scale to the mesh.
            this.mesh.scale.set(textureWidth * minScaleFactor, textureHeight * minScaleFactor, 1);
        }
    }
    /**
     * Sets a new image source and reloads it.
     * @param src - The URL of the new image to load.
     */
    load(src) {
        this.src = src;
        this.reload();
    }
}

class LabelView extends TextView {
    constructor(options = {}) {
        super(options);
        this.layers.set(UI_OVERLAY_LAYER);
    }
    createTextSDF() {
        super.createTextSDF();
        this.textObj.material.depthText = false;
        this.textObj.material.depthWrite = false;
    }
}

/**
 * Shader for the non-interactive Panel background.
 *
 * This shader renders a simple, anti-aliased rounded rectangle (squircle). It
 * can display either a solid background color or a texture map. It is more
 * performant than the SpatialPanelShader as it omits all interactive highlight
 * calculations.
 */
const SquircleShader = {
    uniforms: {
        uMainTex: { value: null },
        uUseImage: { value: 0.0 },
        uBackgroundColor: {
            value: new THREE.Vector4(0.4, 0.8, 1.0, 1.0),
        },
        uBoxSize: { value: new THREE.Vector2(0.5, 0.5) },
        uRadius: { value: 0.05 },
        uOpacity: { value: 1.0 },
    },
    vertexShader: /* glsl */ `
    #define USE_UV
    #include <common>
    #include <batching_pars_vertex>
    #include <uv_pars_vertex>
    #include <envmap_pars_vertex>
    #include <color_pars_vertex>
    #include <fog_pars_vertex>
    #include <morphtarget_pars_vertex>
    #include <skinning_pars_vertex>
    #include <logdepthbuf_pars_vertex>
    #include <clipping_planes_pars_vertex>

    void main() {
      #include <uv_vertex>
      #include <color_vertex>
      #include <morphinstance_vertex>
      #include <morphcolor_vertex>
      #include <batching_vertex>

      #if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )

        #include <beginnormal_vertex>
        #include <morphnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <defaultnormal_vertex>

      #endif

      #include <begin_vertex>
      #include <morphtarget_vertex>
      #include <skinning_vertex>
      #include <project_vertex>
      #include <logdepthbuf_vertex>
      #include <clipping_planes_vertex>

      #include <worldpos_vertex>
      #include <envmap_vertex>
      #include <fog_vertex>
    }
  `,
    fragmentShader: /* glsl */ `
    precision mediump float;

    uniform sampler2D uMainTex;
    uniform vec4 uBackgroundColor;
    uniform vec2 uBoxSize;
    uniform float uRadius;
    uniform float uUseImage;
    uniform float uOpacity;

    #define USE_UV
    #include <common>
    #include <dithering_pars_fragment>
    #include <color_pars_fragment>
    #include <uv_pars_fragment>
    #include <map_pars_fragment>
    #include <alphamap_pars_fragment>
    #include <alphatest_pars_fragment>
    #include <alphahash_pars_fragment>
    #include <aomap_pars_fragment>
    #include <lightmap_pars_fragment>
    #include <envmap_common_pars_fragment>
    #include <envmap_pars_fragment>
    #include <fog_pars_fragment>
    #include <specularmap_pars_fragment>
    #include <logdepthbuf_pars_fragment>
    #include <clipping_planes_pars_fragment>

    // Distance function for rounded box.
    float distRoundBox(vec2 p, vec2 b, float r) {
      return length(max(abs(p) - b + r, 0.0)) - r;
    }

    void main(void) {
      #include <clipping_planes_fragment>

      #include <logdepthbuf_fragment>
      #include <map_fragment>
      #include <color_fragment>
      #include <alphamap_fragment>
      #include <alphatest_fragment>
      #include <alphahash_fragment>
      #include <specularmap_fragment>
      vec2 size = uBoxSize * 1000.0;

      // Calculates the adjusted radius based on box size.
      float radius = min(size.x, size.y) * (0.05 + uRadius);
      vec2 half_size = 0.5 * size;

      // Compute the distance from the rounded box edge.
      float dist = distRoundBox(vUv * size - half_size, half_size, radius);

      // Use lerp for smooth color transition based on distance.
      vec4 colorInside = uBackgroundColor;

      if (uUseImage > 0.5) {
        colorInside = texture2D(uMainTex, vUv);
        colorInside.a = 1.0;
      }

      // Transparent black for outside.
      vec4 colorOutside = vec4(0.0, 0.0, 0.0, 0.0);

      vec4 finalColor = mix(colorInside, colorOutside, smoothstep(0.0, 1.0, dist));

      // Return premultiplied alpha.
      gl_FragColor = uOpacity * finalColor.a * vec4(finalColor.rgb, 1.0);
    }
  `,
};

class TextButton extends TextView {
    /**
     * @param options - Configuration options for the TextButton.
     */
    constructor(options = {}) {
        const geometry = new THREE.PlaneGeometry(1, 1);
        const colorVec4 = getVec4ByColorString(options.backgroundColor ?? '#000000');
        const { opacity = 0.0, radius = SquircleShader.uniforms.uRadius.value, boxSize = SquircleShader.uniforms.uBoxSize.value, } = options;
        const uniforms = {
            ...SquircleShader.uniforms,
            uBackgroundColor: { value: colorVec4 },
            uOpacity: { value: opacity },
            uAspect: { value: 1.0 },
            uRadius: { value: radius },
            uBoxSize: { value: boxSize },
        };
        const material = new THREE.ShaderMaterial({
            ...SquircleShader,
            transparent: true,
            uniforms: uniforms,
            depthWrite: false,
        });
        super(options, geometry, material);
        /** Default description of this view in Three.js DevTools. */
        this.name = 'TextButton';
        /** The font size of the text label. */
        this.fontSize = 0.05;
        /** The color of the text in its default state. */
        this.fontColor = 0xffffff;
        /** The opacity multiplier of the button. */
        this.opacity = 1.0;
        /** The intrinsic opacity of the button. */
        this.defaultOpacity = 1.0;
        /** The color of the text when the button is hovered. */
        this.hoverColor = 0xaaaaaa;
        /** The opacity multiplier of the text when the button is hovered. */
        this.hoverOpacity = 0.2;
        /** The color of the text when the button is pressed. */
        this.selectedFontColor = 0x999999;
        /** The opacity multiplier of the text when the button is pressed. */
        this.selectedOpacity = 0.4;
        /** Relative local width. */
        this.width = 0.9;
        /** Relative local height. */
        this.height = 0.9;
        /** Layout mode. */
        this.mode = 'center';
        /** The horizontal offset for the `imageOverlay` texture. */
        this.imageOffsetX = 0;
        /** The vertical offset for the `imageOverlay` texture. */
        this.imageOffsetY = 0;
        this.uniforms = uniforms;
        this.opacity = opacity;
        // Applies our own overrides to the default values.
        this.fontSize = options.fontSize ?? this.fontSize;
        this.fontColor = options.fontColor ?? this.fontColor;
        this.hoverColor = options.hoverColor ?? this.hoverColor;
        this.selectedFontColor =
            options.selectedFontColor ?? this.selectedFontColor;
        this.width = options.width ?? this.width;
        this.height = options.height ?? this.height;
    }
    /**
     * Initializes the text object after async dependencies are loaded.
     */
    async init() {
        await super.init();
        this.textObj.position.set(0, 0, VIEW_DEPTH_GAP);
        if (this.mesh) {
            this.mesh.renderOrder = this.renderOrder;
        }
        this.textObj.renderOrder = this.renderOrder + 1;
        // Disable raycasting on the text part so it doesn't interfere
        // with the main button geometry's interaction.
        this.textObj.raycast = () => { };
    }
    // TODO: Implement onHoverOver() and onHoverOut().
    update() {
        if (!this.textObj) {
            return;
        }
        // Update render order to ensure text appears on top of the button mesh
        this.textObj.renderOrder = this.renderOrder + 1;
        const ux = this.ux;
        if (ux.isHovered()) {
            if (ux.isSelected()) {
                this.setTextColor(this.selectedFontColor);
            }
            else {
                this.setTextColor(this.hoverColor);
            }
        }
        else {
            this.setTextColor(this.fontColor);
            this.uniforms.uOpacity.value = this.defaultOpacity * this.opacity;
        }
    }
}

class VideoView extends View {
    /**
     * @param options - Configuration options for the VideoView.
     */
    constructor(options = {}) {
        super(options);
        /** Default description of this view in Three.js DevTools. */
        this.name = 'VideoView';
        /** The display mode for the video ('center' preserves aspect ratio). */
        this.mode = 'center';
        /** VideoView resides in a panel by default. */
        this.isRoot = false;
        /** If true, the video will be muted. Default is true. */
        this.muted = true;
        /** If true, the video will loop. Default is true. */
        this.loop = true;
        /** If true, the video will attempt to play automatically. Default is true. */
        this.autoplay = true;
        /** If true, the video will play inline on mobile devices. Default is true. */
        this.playsInline = true;
        /** The cross-origin setting for the video element. Default is 'anonymous'. */
        this.crossOrigin = 'anonymous';
        this.videoAspectRatio = 0.0;
        // set video options if passed in
        this.autoplay = options.autoplay ?? this.autoplay;
        this.muted = options.muted ?? this.muted;
        this.loop = options.loop ?? this.loop;
        this.playsInline = options.playsInline ?? this.playsInline;
        if (options.crossOrigin)
            this.crossOrigin = options.crossOrigin;
        if (options.mode)
            this.mode = options.mode;
        const videoGeometry = new THREE.PlaneGeometry(1, 1);
        const videoMaterial = new THREE.MeshBasicMaterial({
            transparent: true,
            blending: THREE.NoBlending,
            toneMapped: false,
            depthWrite: true,
            side: THREE.DoubleSide,
            // `map` will be set based on options.texture or during load
        });
        this.mesh = new THREE.Mesh(videoGeometry, videoMaterial);
        this.material = videoMaterial;
        this.add(this.mesh);
        if (this.texture instanceof THREE.Texture) {
            this.material.map = this.texture;
        }
        else {
            this.texture = new THREE.Texture();
            this.material.map = this.texture;
        }
    }
    /**
     * Initializes the component, loading from `src` if provided in options.
     */
    init() {
        super.init(); // Calls View's init method.
        if (this.material.map instanceof THREE.VideoTexture &&
            this.material.map.image) {
            this.loadFromVideoTexture(this.material.map);
        }
        else if (this.src) {
            this.load(this.src);
        }
    }
    /**
     * Loads a video from various source types. This is the main method for
     * setting the video content.
     * @param source - The video source (URL, HTMLVideoElement, VideoTexture, or
     * VideoStream).
     */
    load(source) {
        if (source instanceof HTMLVideoElement) {
            this.loadFromVideoElement(source);
        }
        else if (source instanceof THREE.VideoTexture) {
            this.loadFromVideoTexture(source);
        }
        else if (source instanceof THREE.Texture) {
            this.loadFromTexture(source);
        }
        else if (typeof source === 'string') {
            this.loadFromURL(source);
        }
        else if (source instanceof VideoStream) {
            this.loadFromStream(source);
        }
        else {
            console.error('VideoView: Invalid video source provided.', source);
        }
    }
    /**
     * Loads video content from an VideoStream, handling the 'ready' event
     * to correctly display the stream and set the aspect ratio.
     * @param stream - The VideoStream instance.
     */
    loadFromStream(stream) {
        this.disposeStreamListener_();
        this.stream_ = stream;
        this.streamReadyCallback_ = (event) => {
            if (!this.stream_?.texture) {
                console.warn('Stream is ready, but its texture is not available.');
                return;
            }
            if (this.stream_.texture instanceof THREE.VideoTexture) {
                this.loadFromVideoTexture(this.stream_.texture);
            }
            else {
                this.loadFromTexture(this.stream_.texture);
            }
            // The event from VideoStream provides the definitive aspect ratio
            const aspectRatio = event.aspectRatio ?? event.details?.aspectRatio;
            if (aspectRatio !== undefined) {
                this.videoAspectRatio = aspectRatio;
            }
            this.updateLayout();
        };
        if (this.stream_.loaded) {
            // If the stream is already loaded, manually trigger the handler
            this.streamReadyCallback_({
                details: { aspectRatio: this.stream_.aspectRatio },
            });
        }
        else {
            // Otherwise, wait for the 'ready' event
            this.stream_.addEventListener('statechange', this.streamReadyCallback_);
        }
    }
    /**
     * Creates a video element and loads content from a URL.
     * @param url - The URL of the video file.
     */
    loadFromURL(url) {
        this.src = url;
        const videoElement = document.createElement('video');
        videoElement.muted = this.muted;
        videoElement.loop = this.loop;
        videoElement.playsInline = this.playsInline;
        videoElement.autoplay = this.autoplay;
        videoElement.crossOrigin = this.crossOrigin;
        videoElement.src = url;
        this.loadFromVideoElement(videoElement);
    }
    /**
     * Configures the view to use an existing `HTMLVideoElement`.
     * @param videoElement - The video element to use as the source.
     */
    loadFromVideoElement(videoElement) {
        this.video = videoElement;
        if (this.video.autoplay && this.video.paused) {
            this.video.play().catch((error) => {
                console.warn('VideoView: Autoplay prevented for video element.', error);
            });
        }
        const videoTextureInstance = new THREE.VideoTexture(this.video);
        videoTextureInstance.colorSpace = THREE.SRGBColorSpace;
        this.texture = videoTextureInstance; // Update internal texture reference
        this.material.map = this.texture;
        const onLoadedMetadata = () => {
            if (this.video.videoWidth && this.video.videoHeight) {
                this.videoAspectRatio =
                    this.video.videoWidth / this.video.videoHeight;
            }
            else {
                console.warn('VideoView: Video metadata loaded but dimensions are 0.');
                this.videoAspectRatio = 0; // Invalid aspect ratio
            }
            this.updateLayout(); // Update layout now that aspect ratio is known
        };
        if (this.video.readyState >= this.video.HAVE_METADATA) {
            onLoadedMetadata();
        }
        else {
            this.video.addEventListener('loadedmetadata', onLoadedMetadata, {
                once: true,
            });
        }
    }
    /**
     * Configures the view to use an existing `THREE.VideoTexture`.
     * @param videoTextureInstance - The texture to display.
     */
    loadFromVideoTexture(videoTextureInstance) {
        this.texture = videoTextureInstance;
        this.material.map = this.texture;
        this.video = this.texture.image; // Underlying video
        if (this.video && this.video.videoWidth && this.video.videoHeight) {
            this.videoAspectRatio = this.video.videoWidth / this.video.videoHeight;
            this.updateLayout();
        }
        else if (this.video) {
            this.video.addEventListener('loadedmetadata', () => {
                if (this.video.videoWidth && this.video.videoHeight) {
                    this.videoAspectRatio =
                        this.video.videoWidth / this.video.videoHeight;
                }
                else {
                    this.videoAspectRatio = 0;
                }
                this.updateLayout();
            }, { once: true });
        }
        else {
            console.warn('VideoView: VideoTexture does not have a valid underlying video element.');
            this.videoAspectRatio = 0;
            this.updateLayout();
        }
    }
    /**
     * Configures the view to use a generic texture, such as an ExternalTexture
     * produced by WebXR camera access.
     * @param textureInstance - The texture to display.
     */
    loadFromTexture(textureInstance) {
        this.texture = textureInstance;
        this.material.map = this.texture ?? null;
        this.video = undefined;
        this.updateLayout();
    }
    /** Starts video playback. */
    play() {
        if (this.video && this.video.paused) {
            this.video
                .play()
                .catch((e) => console.warn('VideoView: Error playing video:', e));
        }
    }
    /** Pauses video playback. */
    pause() {
        if (this.video && !this.video.paused) {
            this.video.pause();
        }
    }
    disposeStreamListener_() {
        if (this.stream_ && this.streamReadyCallback_) {
            this.stream_.removeEventListener('statechange', this.streamReadyCallback_);
            this.stream_ = undefined;
            this.streamReadyCallback_ = undefined;
        }
    }
    /**
     * Cleans up resources, particularly the underlying video element and texture,
     * to prevent memory leaks.
     */
    dispose() {
        this.disposeStreamListener_();
        if (this.video) {
            this.video.pause();
            this.video.removeAttribute('src');
            this.video.load();
            this.video = undefined;
        }
        if (this.texture) {
            this.texture.dispose();
            this.texture = undefined;
        }
        super.dispose();
    }
    /**
     * Updates the layout and scales the video plane to match its aspect ratio.
     * @override
     */
    updateLayout() {
        super.updateLayout();
        if (this.mode === 'stretch' ||
            this.videoAspectRatio <= 0 ||
            !this.material.map) {
            return;
        }
        this.mesh.scale.set(Math.min(this.rangeX, this.videoAspectRatio * this.rangeY), Math.min(this.rangeY, this.rangeX / this.videoAspectRatio), 1);
    }
}

const DOWN = Object.freeze(new THREE.Vector3(0, -1, 0));
const UP = Object.freeze(new THREE.Vector3(0, 1, 0));
const FORWARD = Object.freeze(new THREE.Vector3(0, 0, -1));
const BACK = Object.freeze(new THREE.Vector3(0, 0, 1));
const LEFT = Object.freeze(new THREE.Vector3(-1, 0, 0));
const RIGHT = Object.freeze(new THREE.Vector3(1, 0, 0));
const ZERO_VECTOR3 = Object.freeze(new THREE.Vector3(0, 0, 0));

// Temporary variables.
const _quaternion = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _vector3 = new THREE.Vector3();
var DragMode;
(function (DragMode) {
    DragMode["TRANSLATING"] = "TRANSLATING";
    DragMode["ROTATING"] = "ROTATING";
    DragMode["SCALING"] = "SCALING";
    DragMode["DO_NOT_DRAG"] = "DO_NOT_DRAG";
})(DragMode || (DragMode = {}));
class DragManager extends Script {
    constructor() {
        super(...arguments);
        this.mode = DragManager.IDLE;
        this.originalObjectPosition = new THREE.Vector3();
        this.originalObjectRotation = new THREE.Quaternion();
        this.originalObjectScale = new THREE.Vector3();
        this.originalController1Position = new THREE.Vector3();
        this.originalController1RotationInverse = new THREE.Quaternion();
        this.originalController1MatrixInverse = new THREE.Matrix4();
        this.originalScalingControllerDistance = 0.0;
        this.originalScalingObjectScale = new THREE.Vector3();
        this.type = 'DragManager';
        this.name = 'Drag Manager';
        this.editorIcon = 'drag_pan';
    }
    static { this.dependencies = { input: Input, camera: THREE.Camera }; }
    static { this.IDLE = 'IDLE'; }
    static { this.TRANSLATING = DragMode.TRANSLATING; }
    static { this.ROTATING = DragMode.ROTATING; }
    static { this.SCALING = DragMode.SCALING; }
    static { this.DO_NOT_DRAG = DragMode.DO_NOT_DRAG; }
    init({ input, camera }) {
        this.input = input;
        this.camera = camera;
    }
    onSelectStart(event) {
        const controller = event.target;
        const intersections = this.input.intersectionsForController.get(controller);
        if (intersections && intersections.length > 0) {
            this.beginDragging(intersections[0], controller);
        }
    }
    onSelectEnd() {
        this.mode = DragManager.IDLE;
        this.intersection = undefined;
        this.draggableObject = undefined;
    }
    update() {
        for (const controller of this.input.controllers) {
            this.updateDragging(controller);
        }
    }
    beginDragging(intersection, controller) {
        const [draggableObject, draggingMode] = this.findDraggableObjectAndDraggingMode(intersection.object);
        if (draggableObject == null ||
            draggingMode == null ||
            draggingMode == DragManager.DO_NOT_DRAG) {
            return false;
        }
        if (this.mode != DragManager.IDLE) {
            // Already dragging, switch to scaling.
            return this.beginScaling(controller);
        }
        this.draggableObject = draggableObject;
        this.mode =
            draggingMode == DragManager.ROTATING
                ? DragManager.ROTATING
                : DragManager.TRANSLATING;
        this.originalController1Position.copy(controller.position);
        this.originalController1MatrixInverse
            .compose(controller.position, controller.quaternion, controller.scale)
            .invert();
        this.originalController1RotationInverse
            .copy(controller.quaternion)
            .invert();
        this.intersection = intersection;
        this.controller1 = controller;
        this.originalObjectRotation.copy(draggableObject.quaternion);
        this.originalObjectPosition.copy(draggableObject.position);
        this.originalObjectScale.copy(draggableObject.scale);
        return true;
    }
    // Scaling is a two-handed gesture, based on the distance between the two
    // hands.
    beginScaling(controller) {
        this.controller2 = controller;
        this.originalScalingControllerDistance = _vector3
            .subVectors(this.controller1.position, this.controller2.position)
            .length();
        this.originalScalingObjectScale.copy(this.intersection.object.scale);
        this.mode = DragManager.SCALING;
        return true;
    }
    updateDragging(controller) {
        if (this.mode == DragManager.TRANSLATING) {
            return this.updateTranslating();
        }
        else if (this.mode == DragManager.ROTATING) {
            return this.updateRotating(controller);
        }
        else if (this.mode == DragManager.SCALING) {
            return this.updateScaling();
        }
        // Continue handle controller.
        return false;
    }
    updateTranslating() {
        const model = this.draggableObject;
        model.position.copy(this.originalObjectPosition);
        model.quaternion.copy(this.originalObjectRotation);
        model.scale.copy(this.originalObjectScale);
        model.updateMatrix();
        this.controller1.updateMatrix();
        model.matrix
            .premultiply(this.originalController1MatrixInverse)
            .premultiply(this.controller1.matrix);
        model.position.setFromMatrixPosition(model.matrix);
        if (model.dragFacingCamera) {
            this.turnPanelToFaceTheCamera();
        }
        return true;
    }
    updateRotating(controller) {
        if (controller != this.controller1) {
            return;
        }
        if (controller instanceof MouseController) {
            return this.updateRotatingFromMouseController(controller);
        }
        const model = this.draggableObject;
        const deltaPosition = new THREE.Vector3().subVectors(controller.position, this.originalController1Position);
        deltaPosition.applyQuaternion(this.originalController1RotationInverse);
        const offsetRotation = _quaternion.setFromAxisAngle(UP, 10.0 * deltaPosition.x);
        model.quaternion.multiplyQuaternions(offsetRotation, this.originalObjectRotation);
        return true;
    }
    updateRotatingFromMouseController(controller) {
        const model = this.draggableObject;
        const deltaRotation = _quaternion.multiplyQuaternions(controller.quaternion, this.originalController1RotationInverse);
        const rotationYawAngle = _euler.setFromQuaternion(deltaRotation, 'YXZ');
        const offsetRotation = _quaternion.setFromAxisAngle(UP, -10 * rotationYawAngle.y);
        model.quaternion.multiplyQuaternions(offsetRotation, this.originalObjectRotation);
        return true;
    }
    updateScaling() {
        const newControllerDistance = _vector3
            .subVectors(this.controller1.position, this.controller2.position)
            .length();
        const distanceRatio = newControllerDistance / this.originalScalingControllerDistance;
        const model = this.draggableObject;
        model.scale
            .copy(this.originalScalingObjectScale)
            .multiplyScalar(distanceRatio);
        return true;
    }
    turnPanelToFaceTheCamera() {
        const model = this.draggableObject;
        _vector3.subVectors(model.position, this.camera.position);
        model.quaternion.setFromAxisAngle(UP, (3 * Math.PI) / 2 - Math.atan2(_vector3.z, _vector3.x));
    }
    /**
     * Seach up the scene graph to find the first draggable object and the first
     * drag mode at or below the draggable object.
     * @param target - Child object to search.
     * @returns Array containing the first draggable object and the first drag
     *     mode.
     */
    findDraggableObjectAndDraggingMode(target) {
        let currentTarget = target;
        let draggableObject;
        let draggingMode;
        while (currentTarget && !draggableObject) {
            draggableObject = currentTarget.draggable
                ? currentTarget
                : undefined;
            draggingMode =
                draggingMode ??
                    currentTarget.draggingMode;
            currentTarget = currentTarget.parent;
        }
        return [draggableObject, draggingMode];
    }
}

/**
 *A specialized `IconButton` that provides a simple, single-click
 * way for users to end the current WebXR session.
 *
 * It inherits the visual and interactive properties of `IconButton` and adds
 * the specific logic for session termination.
 */
class ExitButton extends IconButton {
    /**
     * Declares the dependencies required by this script, which will be injected
     * by the core engine during initialization.
     */
    static { this.dependencies = {
        renderer: THREE.WebGLRenderer,
    }; }
    /**
     * @param options - Configuration options to override the button's default
     * appearance.
     */
    constructor(options = {}) {
        // Passes a default icon ('close') and any user-provided options to the
        // parent IconButton constructor.
        super({ text: 'close', ...options });
        /** The size of the 'close' icon font. */
        this.fontSize = 0.8;
        /** The base opacity when the button is not being interacted with. */
        this.defaultOpacity = 0.2;
        /** The opacity when a controller's reticle hovers over the button. */
        this.hoverOpacity = 0.8;
        /** The background color of the button's circular shape. */
        this.backgroundColor = 0xffffff;
    }
    /**
     * Initializes the component and stores the injected renderer dependency.
     * @param dependencies - The injected dependencies.
     */
    async init({ renderer }) {
        await super.init();
        this.renderer = renderer;
    }
    /**
     * This method is triggered when the button is successfully selected (e.g.,
     * clicked). It finds the active WebXR session and requests to end it.
     * @override
     */
    onTriggered() {
        console.log('ExitButton triggered: Shutting down XR session.');
        const session = this.renderer.xr.getSession();
        if (session) {
            // Asynchronously end the session. No need to await.
            session.end();
        }
    }
}

class Grid extends View {
    constructor() {
        super(...arguments);
        /**
         * The weight of the current rows in the grid.
         */
        this.rowWeight = 0;
        /**
         * The weight of the current columns in the grid.
         */
        this.colWeight = 0;
        /**
         * The summed weight to the left of the grid.
         */
        this.leftWeight = 0;
        /**
         * The summed weight to the top of the grid.
         */
        this.topWeight = 0;
        this.cols = 0;
        this.rows = 0;
    }
    /**
     * Initializes the Grid class with the provided Row, Col, and Panel
     * classes.
     * @param RowClass - The class for rows.
     * @param ColClass - The class for columns.
     * @param PanelClass - The class for panels.
     * @param OrbiterClass - The class for panels.
     */
    static init(RowClass, ColClass, PanelClass, OrbiterClass) {
        Grid.RowClass = RowClass;
        Grid.ColClass = ColClass;
        Grid.PanelClass = PanelClass;
        Grid.OrbiterClass = OrbiterClass;
    }
    /**
     * Adds an image to the grid.
     * @param options - The options for the image.
     * @returns The added image view.
     */
    addImage(options) {
        const image = new ImageView(options);
        this.add(image);
        return image;
    }
    addVideo(options) {
        const video = new VideoView(options);
        this.add(video);
        return video;
    }
    addIconButton(options = {}) {
        const iconButton = new IconButton(options);
        this.add(iconButton);
        return iconButton;
    }
    addTextButton(options = {}) {
        const iconButton = new TextButton(options);
        this.add(iconButton);
        return iconButton;
    }
    addIcon(options = {}) {
        const iconView = new IconView(options);
        this.add(iconView);
        return iconView;
    }
    addText(options = {}) {
        const textView = new TextView(options);
        this.add(textView);
        return textView;
    }
    addLabel(options) {
        const labelView = new LabelView(options);
        this.add(labelView);
        return labelView;
    }
    addOrbiter(options = {}) {
        const ui = new Grid.OrbiterClass(options);
        this.add(ui);
        return ui;
    }
    addExitButton(options = {}) {
        const ui = new ExitButton(options);
        this.add(ui);
        return ui;
    }
    /**
     * Adds a panel to the grid.
     * @param options - The options for the panel.
     * @returns The added panel.
     */
    addPanel(options = {}) {
        options.isRoot = false;
        const panel = new Grid.PanelClass(options);
        this.add(panel);
        return panel;
    }
    /**
     * Adds a row to the grid.
     * @param options - The options for the row.
     * @returns The added row.
     */
    addRow(options = {}) {
        const row = new Grid.RowClass(options);
        row.topWeight = this.rowWeight;
        row.height = row.weight;
        this.rowWeight += row.weight;
        this.add(row);
        this.rows++;
        return row;
    }
    /**
     * Adds a column to the grid.
     * @param options - The options for the column.
     * @returns The added column.
     */
    addCol(options = {}) {
        const col = new Grid.ColClass(options);
        col.leftWeight = this.colWeight;
        col.width = col.weight;
        this.colWeight += col.weight;
        this.add(col);
        this.cols++;
        return col;
    }
    /**
     * Updates the layout of the grid.
     */
    updateLayout() {
        this.x = -0.5 + (this.leftWeight + this.width / 2);
        this.y = 0.5 - (this.topWeight + this.height / 2);
        super.updateLayout();
    }
    /**
     * Initializes the layout of the grid with compose().
     */
    resetLayout() {
        this.rows = 0;
        this.cols = 0;
        this.colWeight = 0;
        this.rowWeight = 0;
        for (const child of this.children) {
            if (child instanceof Grid.RowClass) {
                child.topWeight = this.rowWeight;
                child.height = child.weight;
                this.rowWeight += child.weight;
                this.rows++;
            }
            else if (child instanceof Grid.ColClass) {
                child.leftWeight = this.colWeight;
                child.width = child.weight;
                this.colWeight += child.weight;
                this.cols++;
            }
        }
    }
}

/**
 * Shader for the interactive SpatialPanel UI component.
 *
 * This shader renders a rounded rectangle (squircle) that can display a
 * background color or texture. Its key feature is the ability to render
 * dynamic, radial "glow" highlights at the location of up to two controller
 * reticles. The highlight is constrained to the panel's border, providing clear
 * visual feedback for dragging and interaction.
 */
const SpatialPanelShader = {
    uniforms: {
        uMainTex: { value: null },
        uUseImage: { value: 0.0 },
        uBackgroundColor: {
            value: new THREE.Vector4(0.4, 0.8, 1.0, 1.0),
        },
        uBoxSize: { value: new THREE.Vector2(0.5, 0.5) },
        uRadius: { value: 0.05 },
        uReticleUVs: { value: new THREE.Vector4(0.5, 0.5, 0.5, 0.5) },
        uSelected: { value: new THREE.Vector2(0.0, 0.0) },
        uBorderWidth: { value: 0.1 },
        uHighlightRadius: { value: 0.2 },
        uOutlineWidth: { value: 0.01 },
        uOpacity: { value: 1.0 },
    },
    vertexShader: /* glsl */ `
    varying vec2 vTexCoord;

    void main() {
      vTexCoord = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,
    fragmentShader: /* glsl */ `
    precision mediump float;

    uniform sampler2D uMainTex;
    uniform vec4 uBackgroundColor;
    uniform vec2 uBoxSize;
    uniform float uRadius;
    uniform float uUseImage;

    uniform vec4 uReticleUVs;
    uniform vec2 uSelected;
    uniform float uBorderWidth;
    uniform float uHighlightRadius;
    uniform float uOutlineWidth;
    uniform float uOpacity;

    varying vec2 vTexCoord;

    // Distance function for rounded box.
    float distRoundBox(vec2 p, vec2 b, highp float r) {
      return length(max(abs(p) - b + r, 0.0)) - r;
    }

    vec4 highlight(in vec4 baseColor, in vec4 colorOutside,
                   in float distOuterUV, in float aa, in vec2 mouse, in float selected) {

      vec4 highlightColor = vec4(0.0);
      float normDist = 1.0; // Initialize outside the highlight range
      bool mousePressed = selected > 0.0;
      bool mouseHovering = selected <= 0.0 && length(uReticleUVs.xy) > 0.0;
      bool mouseNearBorder = (mouseHovering || mousePressed);
      vec4 finalColor = baseColor;

      if (mouseNearBorder) {
        // Scale mouse and fragment coordinates by the inverse of uBoxSize

        vec2 fragAspect = vTexCoord;
        fragAspect.x *= uBoxSize.x / uBoxSize.y;
        vec2 mouseAspect = mouse;
        mouseAspect.x *= uBoxSize.x / uBoxSize.y;

        // Calculate vector from mouse to fragment in aspect-corrected space
        vec2 diffAspect = fragAspect - mouseAspect;

        // Calculate the distance in the aspect-corrected space
        float distToMouseAspect = length(diffAspect);

        // Normalized distance from mouse within the highlight radius
        normDist = distToMouseAspect / uHighlightRadius;

        // Define highlight color
        float innerWhite = mousePressed ? 0.9 : 0.8;

        // Radial gradient calculation
        float radialFactor = smoothstep(1.0, 0.0, normDist); // 1 at center, 0 at edge
        highlightColor = vec4(vec3(innerWhite), 1.0) * vec4(vec3(1.0), radialFactor);

        // Calculate distance to the inner edge of the border in UV space
        float distInnerUV = distRoundBox(
          (vTexCoord - 0.5) * uBoxSize,
          (uBoxSize - uBorderWidth) * 0.5, 0.5 * uRadius);

        float highlightEdgeSharpness = 200.0;
        float innerHighlightAmount = clamp(highlightEdgeSharpness * -distOuterUV, 0.0, 1.0);
        float outerHighlightAmount = clamp(highlightEdgeSharpness * distInnerUV, 0.0, 1.0);
        float highlightAmount = min(innerHighlightAmount, outerHighlightAmount);
        vec4 highlightColor = mix(finalColor, finalColor + highlightColor, highlightColor.a);
        finalColor = mix(finalColor, highlightColor, highlightAmount);
      }
      return finalColor;
    }

    void main(void) {
      vec2 size = uBoxSize * 1000.0;
      float radius = min(size.x, size.y) * (0.05 + uRadius);
      vec2 half_size = 0.5 * size;

      // Distance to the outer edge of the round box in UV space (0-1)
      float distOuterUV = distRoundBox(vTexCoord * uBoxSize - uBoxSize * 0.5, uBoxSize * 0.5, uRadius);

      // Antialiasing delta
      float aa = fwidth(distOuterUV) * 0.8;

      // Base color: opaque inside, transparent outside
      vec4 colorInside = uBackgroundColor;
      if (uUseImage > 0.5) {
          colorInside = texture2D(uMainTex, vTexCoord);
          colorInside.a = 1.0;
      }
      vec4 colorOutside = vec4(0.0, 0.0, 0.0, 0.0);
      vec4 baseColor = mix(colorInside, colorOutside, smoothstep(0.0, aa, distOuterUV));

      vec4 finalColor1 = highlight(baseColor, colorOutside, distOuterUV, aa, uReticleUVs.xy, uSelected.x);
      vec4 finalColor2 = highlight(baseColor, colorOutside, distOuterUV, aa, uReticleUVs.zw, uSelected.y);

      gl_FragColor = uOpacity * max(finalColor1, finalColor2);
    }
  `,
};

/**
 * A specialized `THREE.Mesh` designed for rendering UI panel
 * backgrounds. It utilizes a custom shader to draw rounded rectangles
 * (squircles) and provides methods to dynamically update its appearance,
 * such as aspect ratio and size. This class is a core building block for
 * `Panel` components.
 */
class PanelMesh extends THREE.Mesh {
    /**
     * Provides convenient access to the material's shader uniforms.
     * @returns The uniforms object of the shader material.
     */
    get uniforms() {
        return this.material.uniforms;
    }
    /**
     * Creates an instance of PanelMesh.
     * @param shader - Shader for the panel mesh.
     * @param backgroundColor - The background color as a CSS string.
     * @param panelScale - The initial scale of the plane
     */
    constructor(shader, backgroundColor, panelScale = 1.0) {
        // Each mesh needs its own unique set of uniforms.
        const uniforms = THREE.UniformsUtils.clone(shader.uniforms);
        const material = new THREE.ShaderMaterial({
            uniforms: uniforms,
            vertexShader: shader.vertexShader,
            fragmentShader: shader.fragmentShader,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
        });
        const geometry = new THREE.PlaneGeometry(panelScale, panelScale);
        super(geometry, material);
        /** Text description of the PanelMesh */
        this.name = 'PanelMesh';
        if (backgroundColor) {
            uniforms.uBackgroundColor.value = getVec4ByColorString(backgroundColor);
        }
    }
    /**
     * Sets the panel's absolute dimensions (width and height) in the shader.
     * This is used by the shader to correctly calculate properties like rounded
     * corner radii.
     * @param width - The width of the panel.
     * @param height - The height of the panel.
     */
    setWidthHeight(width, height) {
        this.uniforms.uBoxSize.value.set(width, height);
    }
    /**
     * Adjusts the mesh's scale to match a given aspect ratio, preventing the
     * panel from appearing stretched.
     * @param aspectRatio - The desired width-to-height ratio.
     */
    setAspectRatio(aspectRatio) {
        this.scale.set(Math.max(aspectRatio, 1.0), Math.max(1.0 / aspectRatio, 1.0), 1.0);
    }
}

// Default panel width in density-independent pixels (DP).
const DEFAULT_WIDTH_DP = 1024;
// Default panel height in density-independent pixels (DP).
const DEFAULT_HEIGHT_DP = 720;
// Default panel width in meters, calculated from DP for root panels.
const DEFAULT_WIDTH_M = DEFAULT_WIDTH_DP * DP_TO_DMM * 0.001;
// Default panel height in meters, calculated from DP for root panels.
const DEFAULT_HEIGHT_M = DEFAULT_HEIGHT_DP * DP_TO_DMM * 0.001;
/**
 * A fundamental UI container that displays content on a 2D quad in
 * 3D space. It supports background colors, rounded corners (squircles), and can
 * be made interactive and draggable. It serves as a base for building complex
 * user interfaces.
 *
 * The panel intelligently selects a shader:
 * - `SpatialPanelShader`: For interactive, draggable panels with hover/select
 * highlights.
 * - `SquircleShader`: For static, non-interactive panels with a clean, rounded
 * look.
 */
class Panel extends View {
    static { this.dependencies = { user: User, timer: THREE.Timer }; }
    constructor(options = {}) {
        super(options);
        this.keepFacingCamera = true;
        /** Text description of the view */
        this.name = 'Panel';
        /** Type identifier for easy checking with `instanceof`. */
        this.isPanel = true;
        /** Determines if the panel can be dragged by the user. */
        this.draggable = false;
        /** Determines if the panel can be touched by the user's hands. */
        this.touchable = false;
        /**
         * If true, a root panel will automatically spawn in front of the user.
         */
        this.useDefaultPosition = true;
        /**
         * Panel by default uses borderless shader.
         * This flag indicates whether to use borderless shader for Spatial Panels.
         */
        this.useBorderlessShader = false;
        /**
         * Whether to show highlights for the spatial panel.
         */
        this.showHighlights = false;
        /** The background color of the panel, expressed as a CSS color string. */
        this.backgroundColor = '#c2c2c255';
        // --- Private Fading Animation Properties ---
        /**
         * The current state of the fading animation.
         */
        this._fadeState = 'idle';
        /**
         * Default duration for fade animations in seconds.
         */
        this._fadeDuration = 0.2;
        /**
         * Timer for the current fade animation, driven by the core clock.
         */
        this._fadeTimer = 0;
        /**
         * The current opacity value, used during animations.
         */
        this._currentOpacity = 1.0;
        /**
         * The start opacity value for the current animation.
         */
        this._startOpacity = 1.0;
        /**
         * The target opacity value for the current animation.
         */
        this._targetOpacity = 1.0;
        const isDraggable = options.draggable ?? this.draggable;
        const useBorderlessShader = options.useBorderlessShader ?? !isDraggable;
        // Draggable panels have a larger geometry for interaction padding.
        const panelScale = useBorderlessShader ? 1.0 : 1.3;
        // Use SpatialPanelShader for SpatialPanel, while developers can choose
        // useBorderlessShader=false to disable the interactive border.
        const shader = useBorderlessShader ? SquircleShader : SpatialPanelShader;
        options.useBorderlessShader = useBorderlessShader;
        this.showHighlights = !useBorderlessShader;
        // Applies user-provided options or default options.
        this.backgroundColor = options.backgroundColor ?? this.backgroundColor;
        this.draggable = isDraggable;
        this.draggingMode =
            (options.draggingMode ?? this.draggable)
                ? DragMode.TRANSLATING
                : DragMode.DO_NOT_DRAG;
        this.touchable = options.touchable ?? this.touchable;
        this.isRoot = options.isRoot ?? true;
        this.width = options.width ?? (this.isRoot ? DEFAULT_WIDTH_M : 1);
        this.height = options.height ?? (this.isRoot ? DEFAULT_HEIGHT_M : 1);
        this.showHighlights = options.showHighlights ?? this.showHighlights;
        this.useDefaultPosition =
            options.useDefaultPosition ?? this.useDefaultPosition;
        this.useBorderlessShader =
            options.useBorderlessShader ?? this.useBorderlessShader;
        this.mesh = new PanelMesh(shader, this.backgroundColor, panelScale);
        this.add(this.mesh);
        this.updateLayout();
    }
    /**
     * Initializes the panel, setting its default position if applicable.
     */
    init({ user, timer }) {
        super.init();
        this.selectable = true;
        this.timer = timer;
        // A manual position set in .position.set() will override the
        // default position to create the SpatialPanel.
        if (this.position.x !== 0 ||
            this.position.y !== 0 ||
            this.position.z !== 0) {
            this.useDefaultPosition = false;
        }
        if (this.isRoot && this.useDefaultPosition) {
            this.position.set(this.x, user.height + this.y, -user.panelDistance + this.z);
        }
        else {
            this.position.set(this.position.x + this.x, this.position.y + this.y, this.position.z + this.z);
        }
    }
    /**
     * Starts fading the panel and its children in.
     * @param duration - Optional fade duration in seconds.
     * @param onComplete - Optional callback when fade completes.
     */
    fadeIn(duration, onComplete) {
        if (this._fadeState === 'fading-in')
            return;
        this._startFade(1.0, duration, onComplete);
        this._fadeState = 'fading-in';
    }
    /**
     * Starts fading the panel and its children out.
     * @param duration - Optional fade duration in seconds.
     * @param onComplete - Optional callback when fade completes.
     */
    fadeOut(duration, onComplete) {
        if (this._fadeState === 'fading-out')
            return;
        this._startFade(0.0, duration, onComplete);
        this._fadeState = 'fading-out';
    }
    /**
     * Initiates a fade animation.
     */
    _startFade(targetOpacity, duration, onComplete) {
        this._fadeDuration = duration ?? 0.2;
        this.onFadeComplete = onComplete;
        this._fadeTimer = 0;
        this._startOpacity = this._currentOpacity;
        this._targetOpacity = targetOpacity;
        if (this._fadeDuration <= 0) {
            this._completeFade();
        }
        else {
            this._prepareMaterialsForFade();
        }
    }
    /**
     * Ensures all child materials are configured for transparency.
     */
    _prepareMaterialsForFade() {
        this.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
                const materials = Array.isArray(child.material)
                    ? child.material
                    : [child.material];
                materials.forEach((material) => {
                    material.transparent = true;
                });
            }
        });
    }
    _setMaterialOpacity(opacityValue, material) {
        if (material instanceof THREE.ShaderMaterial &&
            material.uniforms.uOpacity) {
            material.uniforms.uOpacity.value = opacityValue;
        }
        else {
            material.opacity = opacityValue;
        }
    }
    /**
     * Applies the given opacity to all materials in the hierarchy.
     */
    _applyOpacity(opacityValue) {
        this.traverse((child) => {
            if (child instanceof View)
                child.opacity = opacityValue;
            if (child instanceof THREE.Mesh && child.material) {
                if (Array.isArray(child.material)) {
                    for (const material of child.material) {
                        this._setMaterialOpacity(opacityValue, material);
                    }
                }
                else {
                    this._setMaterialOpacity(opacityValue, child.material);
                }
            }
        });
    }
    /**
     * Finalizes the fade animation, sets final visibility, and triggers callback.
     */
    _completeFade() {
        this._currentOpacity = this._targetOpacity;
        this._applyOpacity(this._currentOpacity);
        this._fadeState = 'idle';
        if (this._currentOpacity === 0)
            this.hide();
        else
            this.show();
        this.onFadeComplete?.();
    }
    /**
     * Updates the fade animation progress each frame.
     */
    update() {
        if (this._fadeState !== 'idle') {
            this._fadeTimer += this.timer.getDelta();
            const progress = Math.min(this._fadeTimer / this._fadeDuration, 1.0);
            this._currentOpacity = THREE.MathUtils.lerp(this._startOpacity, this._targetOpacity, progress);
            this._applyOpacity(this._currentOpacity);
            if (progress >= 1.0) {
                this._completeFade();
            }
        }
    }
    /**
     * Adds a Grid layout as a direct child of this panel.
     * @returns The newly created Grid instance.
     */
    addGrid() {
        const grid = new Grid();
        this.add(grid);
        return grid;
    }
    /**
     * Updates the panel's visual dimensions based on its layout properties.
     */
    updateLayout() {
        super.updateLayout();
        this.mesh.setAspectRatio(this.aspectRatio);
        const parentAspectRatio = this.isRoot || !this.parent ? 1.0 : this.parent.aspectRatio;
        this.mesh.setWidthHeight(this.width * Math.max(parentAspectRatio, 1.0), this.height * Math.max(1.0 / parentAspectRatio, 1.0));
    }
    /**
     * Gets the panel's width in meters.
     * @returns The width in meters.
     */
    getWidth() {
        return this.width;
    }
    /**
     * Gets the panel's height in meters.
     * @returns The height in meters.
     */
    getHeight() {
        return this.height;
    }
}

class Col extends Grid {
    constructor(options = {}) {
        if (options.weight === undefined) {
            options.weight = 0.5;
        }
        super(options);
    }
}

class Orbiter extends Grid {
    // These values are based on Material Design guidelines: https://developer.android.com/design/ui/xr/guides/spatial-ui
    static { this.BASE_OFFSET = 0.02; } // put the orbiter outside of the parent panel's "draggable region" by default
    static { this.BASE_ELEVATION = 0.02; } // put the orbiter at 15dp above the parent panel by default
    static { this.MAX_OUTWARD = 0.05; } // avoid the orbiter being too far away from the parent panel
    constructor(options = {}) {
        const { orbiterPosition = 'top-left', orbiterScale = 0.2, offset = 0.0, elevation = 0.0, ...gridOptions } = options;
        super(gridOptions);
        this.orbiterPosition = orbiterPosition;
        this.orbiterScale = orbiterScale;
        this.offset = offset;
        this.elevation = elevation;
    }
    init() {
        super.init();
        this.scale.set(this.orbiterScale, this.orbiterScale, 1.0);
        this._place();
    }
    _place() {
        const hx = this.rangeX * 0.5;
        const hy = this.rangeY * 0.5;
        const rightEdge = +hx;
        const leftEdge = -hx;
        const topEdge = +hy;
        const bottomEdge = -hy;
        // Clamp edge spacing so the orbiter stays within the recommended range:
        // edgeDelta == -orbiterScale / 2 corresponds to the 50% overlap boundary.
        const edgeDelta = Math.max(-this.orbiterScale / 2, Math.min(Orbiter.MAX_OUTWARD, Orbiter.BASE_OFFSET + this.offset));
        // Clamp elevation so the orbiter remains in front of the parent panel and doesn’t float excessively.
        const zDelta = Math.max(0, Math.min(Orbiter.MAX_OUTWARD, Orbiter.BASE_ELEVATION + this.elevation));
        let x = 0.0;
        let y = 0.0;
        switch (this.orbiterPosition) {
            case 'top':
                x = 0.0;
                y = topEdge + this.orbiterScale / 2 + edgeDelta;
                break;
            case 'bottom':
                x = 0.0;
                y = bottomEdge - this.orbiterScale / 2 - edgeDelta;
                break;
            case 'right':
                x = rightEdge + this.orbiterScale / 2 + edgeDelta;
                y = 0.0;
                break;
            case 'left':
                x = leftEdge - this.orbiterScale / 2 - edgeDelta;
                y = 0.0;
                break;
            case 'top-right':
                x = rightEdge - this.orbiterScale / 2;
                y = topEdge + this.orbiterScale / 2 + edgeDelta;
                break;
            case 'top-left':
                x = leftEdge + this.orbiterScale / 2;
                y = topEdge + this.orbiterScale / 2 + edgeDelta;
                break;
            case 'bottom-right':
                x = rightEdge - this.orbiterScale / 2;
                y = bottomEdge - this.orbiterScale / 2 - edgeDelta;
                break;
            case 'bottom-left':
                x = leftEdge + this.orbiterScale / 2;
                y = bottomEdge - this.orbiterScale / 2 - edgeDelta;
                break;
        }
        const z = this.position.z + zDelta;
        this.position.set(x, y, z);
    }
}

class Row extends Grid {
    constructor(options = {}) {
        if (options.weight === undefined) {
            options.weight = 0.5;
        }
        super(options);
    }
}

class SpatialPanel extends Panel {
    /**
     * Creates an instance of SpatialPanel.
     */
    constructor(options = {}) {
        options.draggable = options.draggable ?? true;
        options.dragFacingCamera = options.dragFacingCamera ?? true;
        super(options);
        /**
         * Keeps the panel facing the camera as it is dragged.
         */
        this.dragFacingCamera = true;
        // Reset the following fields with our own defaults.
        this.draggable = options.draggable ?? this.draggable;
        this.dragFacingCamera = options.dragFacingCamera ?? this.dragFacingCamera;
        this.mesh.material.visible = options.showEdge !== false;
    }
    update() {
        super.update();
        this._updateInteractionFeedback();
    }
    /**
     * Updates shader uniforms to provide visual feedback for controller
     * interactions, such as hover and selection highlights. This method is
     * optimized to only update uniforms when the state changes.
     */
    _updateInteractionFeedback() {
        if (this.useBorderlessShader || !this.showHighlights) {
            return;
        }
        const [id1, id2] = this.ux.getPrimaryTwoControllerIds();
        // --- Update Selection Uniform ---
        const isSelected1 = id1 !== null ? this.ux.selected[id1] : false;
        const isSelected2 = id2 !== null ? this.ux.selected[id2] : false;
        this.mesh.material.uniforms.uSelected.value.set(isSelected1 ? 1.0 : 0.0, isSelected2 ? 1.0 : 0.0);
        // --- Update Reticle UVs Uniform ---
        const u1 = id1 !== null ? this.ux.uvs[id1].x : -1;
        const v1 = id1 !== null ? this.ux.uvs[id1].y : -1;
        const u2 = id2 !== null ? this.ux.uvs[id2].x : -1;
        const v2 = id2 !== null ? this.ux.uvs[id2].y : -1;
        this.mesh.material.uniforms.uReticleUVs.value.set(u1, v1, u2, v2);
    }
}

/**
 * UI is a declarative 3D UI composition engine for WebXR,
 * inspired by modern frameworks like Jetpack Compose. It builds a three.js
 * scene graph from a JSON configuration, allowing for a clean separation of UI
 * structure and application logic.
 */
// Initializes the Grid class with its dependencies for declarative building.
Grid.init(Row, Col, Panel, Orbiter);
/**
 * Manages the construction and lifecycle of a declarative UI defined by a JSON
 * object. It translates the JSON structure into a hierarchy of UI objects.
 * See samples/ui for a complete example of composing UI with JSON.
 */
class UI extends Script {
    constructor() {
        super(...arguments);
        this.views = [];
    }
    /**
     * A static registry mapping string identifiers to UI component classes.
     * This allows for an extensible and declarative UI system.
     */
    static { this.ComponentRegistry = new Map(); }
    /**
     * Registers a component class with a string key, making it available to the
     * `compose` function.
     * @param typeName - The key to use in the JSON configuration.
     * @param componentClass - The class constructor of the UI component.
     */
    static registerComponent(typeName, componentClass) {
        if (UI.ComponentRegistry.has(typeName)) {
            console.warn(`UI: Component type "${typeName}" is being overwritten.`);
        }
        UI.ComponentRegistry.set(typeName, componentClass);
    }
    /**
     * Composes a UI hierarchy from a JSON object and attaches it to this UI
     * instance. This is the primary method for building a declarative UI.
     *
     * @param json - The JSON object defining the UI structure.
     * @returns The root view of the composed UI, or null if composition fails.
     */
    compose(json) {
        const rootComponent = this._composeNode(json);
        if (rootComponent) {
            this.add(rootComponent);
            rootComponent.traverse((node) => {
                if (node instanceof View) {
                    this.views.push(node);
                }
            });
        }
        return rootComponent;
    }
    /**
     * Recursively processes a single node from the UI JSON configuration.
     * @param nodeJson - The JSON node for a single UI element.
     * @returns The composed UI object for this node, or null on error.
     */
    _composeNode(nodeJson) {
        const { type, options = {}, position = { x: 0, y: 0, z: 0 }, rotation = { x: 0, y: 0, z: 0 }, children = [], } = nodeJson;
        const ComponentClass = UI.ComponentRegistry.get(type);
        if (!ComponentClass) {
            console.error(`UI Error: Unknown component type "${type}". Make sure it's registered.`);
            return null;
        }
        const componentInstance = new ComponentClass(options);
        componentInstance.position.set(position.x, position.y, position.z);
        componentInstance.rotation.set(rotation.x, rotation.y, rotation.z);
        children.forEach((childJson) => {
            const childComponent = this._composeNode(childJson);
            if (childComponent) {
                componentInstance.add(childComponent);
            }
        });
        // For layouts, ensure they update their children's positions.
        if (componentInstance instanceof Grid) {
            componentInstance.resetLayouts();
        }
        return componentInstance;
    }
}
// Pre-register the standard set of UI components.
UI.registerComponent('Panel', Panel);
UI.registerComponent('Grid', Grid);
UI.registerComponent('Row', Row);
UI.registerComponent('Col', Col);
UI.registerComponent('Orbiter', Orbiter);
UI.registerComponent('Text', TextView);
UI.registerComponent('TextView', TextView);
UI.registerComponent('Label', LabelView);
UI.registerComponent('LabelView', LabelView);
UI.registerComponent('VideoView', VideoView);
UI.registerComponent('TextButton', TextButton);
UI.registerComponent('IconButton', IconButton);
UI.registerComponent('IconView', IconView);
UI.registerComponent('Image', ImageView);
UI.registerComponent('ImageView', ImageView);
UI.registerComponent('SpatialPanel', SpatialPanel);

class LoadingSpinner extends HTMLElement {
    static { this.style = `
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
    }`; }
    static { this.innerHTML = `
    <style>
      ${LoadingSpinner.style}
    </style>
    <div class="wrapper">
      <div class="spinner"></div>
    </div>
  `; }
    connectedCallback() {
        const shadowRoot = this.attachShadow({ mode: 'open' });
        shadowRoot.innerHTML = LoadingSpinner.innerHTML;
    }
}
customElements.define('xb-blocks-loading-spinner', LoadingSpinner);
// Creates a new Loading spinner and attaches it to document.body.
function createLoadingSpinner() {
    return document.body.appendChild(document.createElement('xb-blocks-loading-spinner'));
}

/**
 * Manages the global THREE.DefaultLoadingManager instance for
 * XRBlocks and handles communication of loading progress to the parent iframe.
 * This module controls the visibility of a loading spinner
 * in the DOM based on loading events.
 *
 * Import the single instance
 * `loadingSpinnerManager` to use it throughout the application.
 */
class LoadingSpinnerManager {
    constructor() {
        /**
         * Tracks if the manager is currently loading assets.
         */
        this.isLoading = false;
        this.setupCallbacks();
    }
    showSpinner() {
        if (!this.spinnerElement) {
            this.spinnerElement = createLoadingSpinner();
        }
    }
    hideSpinner() {
        if (this.spinnerElement) {
            this.spinnerElement.remove();
            this.spinnerElement = undefined;
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
                type: 'XR_LOADING_PROGRESS',
                payload: {
                    progress: itemsLoaded / itemsTotal,
                    message: 'Loading assets...',
                },
            }, '*');
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
                type: 'XR_LOADING_PROGRESS',
                payload: {
                    progress: itemsLoaded / itemsTotal,
                    message: `Loading ${Math.round((itemsLoaded / itemsTotal) * 100)}%`,
                },
            }, '*');
        };
        /**
         * Callback function for when all loading items are complete.
         * It removes the loading spinner from the DOM and sends an
         * 'XR_LOADING_COMPLETE' message to the parent window.
         */
        THREE.DefaultLoadingManager.onLoad = () => {
            this.isLoading = false;
            this.hideSpinner();
            window.parent.postMessage({ type: 'XR_LOADING_COMPLETE' }, '*');
        };
        /**
         * Callback function for when a loading item encounters an error.
         * It removes the loading spinner from the DOM and sends an
         * 'XR_LOADING_ERROR' message to the parent window.
         * @param url - The URL of the item that failed to load.
         */
        THREE.DefaultLoadingManager.onError = (url) => {
            this.isLoading = false;
            console.warn('XRBlocks: Error loading: ' + url);
            this.hideSpinner();
            window.parent.postMessage({
                type: 'XR_LOADING_ERROR',
                payload: { url, message: 'Failed to load assets.' },
            }, '*');
        };
    }
}
const loadingSpinnerManager = new LoadingSpinnerManager();

/**
 * Manages smooth transitions between AR (transparent) and VR (colored)
 * backgrounds within an active XR session.
 */
class XRTransition extends MeshScript {
    static { this.dependencies = {
        renderer: THREE.WebGLRenderer,
        camera: THREE.Camera,
        timer: THREE.Timer,
        scene: THREE.Scene,
        options: Options,
    }; }
    constructor() {
        const geometry = new THREE.SphereGeometry(1, 64, 32);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0,
            depthTest: false,
            side: THREE.BackSide, // Render on the inside of the sphere.
        });
        super(geometry, material);
        this.ignoreReticleRaycast = true;
        /** Current XR mode, either 'AR' or 'VR'. Defaults to 'AR'. */
        this.currentMode = 'AR';
        /** The duration in seconds for the fade-in and fade-out transitions. */
        this.transitionTime = 1.5;
        this.targetAlpha = 0;
        this.defaultBackgroundColor = new THREE.Color(0xffffff);
        this.ignoreReticleRaycast = true;
        this.renderOrder = -Infinity;
    }
    init({ renderer, camera, timer, scene, options, }) {
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
    toVR({ targetAlpha = 1.0, color } = {}) {
        this.targetAlpha = THREE.MathUtils.clamp(targetAlpha, 0, 1);
        this.material.color.set(color ?? this.defaultBackgroundColor);
        this.currentMode = 'VR';
    }
    /**
     * Starts the transition to a transparent AR background.
     */
    toAR() {
        this.targetAlpha = 0.0;
        this.currentMode = 'AR';
    }
    update() {
        // Always keep the fade mesh centered on the active camera.
        if (this.renderer.xr.isPresenting) {
            this.renderer.xr.getCamera().getWorldPosition(this.position);
        }
        else {
            this.sceneCamera.getWorldPosition(this.position);
        }
        const currentOpacity = this.material.opacity;
        if (currentOpacity !== this.targetAlpha) {
            const lerpFactor = this.timer.getDelta() / this.transitionTime;
            this.material.opacity = THREE.MathUtils.lerp(currentOpacity, this.targetAlpha, lerpFactor);
            if (Math.abs(this.material.opacity - this.targetAlpha) < 0.01) {
                this.material.opacity = this.targetAlpha;
            }
        }
    }
    dispose() {
        if (this.parent) {
            this.parent.remove(this);
        }
        this.material.dispose();
        this.geometry.dispose();
    }
}

/**
 * A utility class to manage and request browser permissions for
 * Location, Camera, and Microphone.
 */
class PermissionsManager {
    /**
     * Requests permission to access the user's geolocation.
     * Note: This actually attempts to fetch the position to trigger the prompt.
     */
    async requestLocationPermission() {
        if (!('geolocation' in navigator)) {
            return {
                granted: false,
                status: 'error',
                error: 'Geolocation is not supported by this browser.',
            };
        }
        return new Promise((resolve) => {
            navigator.geolocation.getCurrentPosition(() => {
                resolve({ granted: true, status: 'granted' });
            }, (error) => {
                let errorMsg = 'Unknown error';
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        errorMsg = 'User denied the request.';
                        break;
                    case error.POSITION_UNAVAILABLE:
                        errorMsg = 'Location information is unavailable.';
                        break;
                    case error.TIMEOUT:
                        errorMsg = 'The request to get user location timed out.';
                        break;
                }
                resolve({ granted: false, status: 'denied', error: errorMsg });
            }, { timeout: 10000 } // 10 second timeout
            );
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
        return this.requestMediaPermission({ video: true, audio: true });
    }
    /**
     * Internal helper to handle getUserMedia requests.
     * Crucially, this stops the tracks immediately after permission is granted
     * so the hardware doesn't remain active.
     */
    async requestMediaPermission(constraints, options) {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            return {
                granted: false,
                status: 'error',
                error: 'Media Devices API is not supported by this browser.',
            };
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            // Permission granted. Now stop the stream to release hardware.
            stream.getTracks().forEach((track) => track.stop());
            return { granted: true, status: 'granted' };
        }
        catch (err) {
            if (this.shouldAllowVideoFallback(err, constraints, options)) {
                return { granted: true, status: 'granted' };
            }
            // Handle common getUserMedia errors
            const status = 'denied';
            let errorMessage = 'Permission denied';
            if (err instanceof Error) {
                if (err.name === 'NotFoundError' ||
                    err.name === 'DevicesNotFoundError') {
                    return {
                        granted: false,
                        status: 'error',
                        error: 'Hardware not found.',
                    };
                }
                errorMessage = err.message || errorMessage;
            }
            return { granted: false, status: status, error: errorMessage };
        }
    }
    shouldAllowVideoFallback(err, constraints, options) {
        if (!options?.allowVideoFallback || !this.isVideoOnlyRequest(constraints)) {
            return false;
        }
        return (err instanceof Error &&
            (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError'));
    }
    isVideoOnlyRequest(constraints) {
        const requestsVideo = constraints.video !== undefined && constraints.video !== false;
        const requestsAudio = constraints.audio !== undefined && constraints.audio !== false;
        return requestsVideo && !requestsAudio;
    }
    /**
     * Requests multiple permissions sequentially.
     * Returns a single result: granted is true only if ALL requested permissions are granted.
     */
    async checkAndRequestPermissions({ geolocation = false, camera = false, microphone = false, }, options) {
        const results = [];
        // 1. Handle Location
        if (geolocation) {
            const status = await this.checkPermissionStatus('geolocation');
            if (status === 'granted') {
                results.push({ granted: true, status: 'granted' });
            }
            else {
                results.push(await this.requestLocationPermission());
            }
        }
        // 2. Handle Media (Camera & Mic)
        // We group these because requestAVPermission can ask for both in one prompt
        if (camera && microphone) {
            const camStatus = await this.checkPermissionStatus('camera');
            const micStatus = await this.checkPermissionStatus('microphone');
            if (camStatus === 'granted' && micStatus === 'granted') {
                results.push({ granted: true, status: 'granted' });
            }
            else if (camStatus === 'granted') {
                // Only need mic
                results.push(await this.requestMicrophonePermission());
            }
            else if (micStatus === 'granted') {
                // Only need camera
                results.push(await this.requestCameraPermission(options));
            }
            else {
                // Need both
                results.push(await this.requestAVPermission());
            }
        }
        else if (camera) {
            const status = await this.checkPermissionStatus('camera');
            if (status === 'granted') {
                results.push({ granted: true, status: 'granted' });
            }
            else {
                results.push(await this.requestCameraPermission(options));
            }
        }
        else if (microphone) {
            const status = await this.checkPermissionStatus('microphone');
            if (status === 'granted') {
                results.push({ granted: true, status: 'granted' });
            }
            else {
                results.push(await this.requestMicrophonePermission());
            }
        }
        // 3. Aggregate results
        if (results.length === 0) {
            return { granted: true, status: 'granted' };
        }
        const allGranted = results.every((r) => r.granted);
        const anyDenied = results.find((r) => r.status === 'denied');
        const anyError = results.find((r) => r.status === 'error');
        // Aggregate errors
        const errors = results
            .filter((r) => r.error)
            .map((r) => r.error)
            .join(' | ');
        let finalStatus = 'granted';
        if (anyError)
            finalStatus = 'error';
        else if (anyDenied)
            finalStatus = 'denied';
        return {
            granted: allGranted,
            status: finalStatus,
            error: errors || undefined,
        };
    }
    /**
     * Checks the current status of a permission without triggering a prompt.
     * Useful for UI state (e.g., disabling buttons if already denied).
     * * @param permissionName - 'geolocation', 'camera', or 'microphone'
     */
    async checkPermissionStatus(permissionName) {
        if (!navigator.permissions || !navigator.permissions.query) {
            return 'unknown';
        }
        try {
            let queryName;
            // Map friendly names to API PermissionName types
            // Note: 'camera' and 'microphone' are part of the newer spec,
            // but strictly Typed TypeScript might expect specific descriptor objects.
            if (permissionName === 'geolocation') {
                queryName = 'geolocation';
            }
            else if (permissionName === 'camera' ||
                permissionName === 'microphone') {
                const descriptor = { name: permissionName };
                const result = await navigator.permissions.query(descriptor);
                return result.state;
            }
            else {
                return 'unknown';
            }
            const result = await navigator.permissions.query({ name: queryName });
            return result.state;
        }
        catch (error) {
            // Firefox and Safari have incomplete Permissions API support
            console.warn(`Error checking permission status for ${permissionName}`, error);
            return 'unknown';
        }
    }
}

/**
 * A node to hold all XR Blocks Systems.
 */
class XRSystems extends THREE.Group {
    constructor() {
        super(...arguments);
        this.type = 'XRSystems';
        this.name = 'XR Blocks Systems';
    }
}

/**
 * Core is the central engine of the XR Blocks framework, acting as a
 * singleton manager for all XR subsystems. Its primary goal is to abstract
 * low-level WebXR and THREE.js details, providing a simplified and powerful API
 * for developers and AI agents to build interactive XR applications.
 */
class Core {
    /**
     * Core is a singleton manager that manages all XR "blocks".
     * It initializes core components and abstractions like the scene, camera,
     * user, UI, AI, and input managers.
     */
    constructor() {
        /**
         * Component responsible for capturing screenshots of the XR scene for AI.
         */
        this.screenshotSynthesizer = new ScreenshotSynthesizer();
        /**
         * Component responsible for waiting for the next frame.
         */
        this.waitFrame = new WaitFrame();
        /**
         * Registry used for dependency injection on existing subsystems.
         */
        this.registry = new Registry();
        /**
         * A clock for tracking time deltas. Call clock.getDeltaTime().
         */
        this.timer = new THREE.Timer();
        /** Manages hand, mouse, gaze inputs. */
        this.input = new Input();
        /** The main camera for rendering. */
        this.camera = new THREE.PerspectiveCamera();
        /** The root scene graph for all objects. */
        this.scene = new THREE.Scene();
        /** Represents the user in the XR scene. */
        this.user = new User();
        /** Manages all UI elements. */
        this.ui = new UI();
        /** Manages all (spatial) audio playback. */
        this.sound = new CoreSound();
        /** A container to hold all the systems in the scene hierarchy. */
        this.xrSystemsGroup = new XRSystems();
        this.renderSceneBound = this.renderScene.bind(this);
        /** Manages the desktop XR simulator. */
        this.simulator = new Simulator(this.renderSceneBound);
        /** Manages drag-and-drop interactions. */
        this.dragManager = new DragManager();
        /** Manages drag-and-drop interactions. */
        this.world = new World();
        /** A shared texture loader. */
        this.textureLoader = new THREE.TextureLoader();
        this.webXRSettings = {};
        /** Whether the XR simulator is currently active. */
        this.simulatorRunning = false;
        this.depth = new Depth();
        this.ai = new AI();
        this.scriptsManager = new ScriptsManager(async (script) => {
            await callInitWithDependencyInjection(script, this.registry, this);
            if (this.physics) {
                await script.initPhysics(this.physics);
            }
        });
        this.permissionsManager = new PermissionsManager();
        if (Core.instance) {
            return Core.instance;
        }
        Core.instance = this;
        this.scene.name = 'XR Blocks Scene';
        this.scene.add(this.xrSystemsGroup);
        this.xrSystemsGroup.add(this.user, this.dragManager, this.ui, this.sound, this.world);
        this.registry.register(this.registry);
        this.registry.register(this.waitFrame);
        this.registry.register(this.scene);
        this.registry.register(this.timer);
        this.registry.register(this.input);
        this.registry.register(this.user);
        this.registry.register(this.ui);
        this.registry.register(this.sound);
        this.registry.register(this.dragManager);
        this.registry.register(this.user);
        this.registry.register(this.simulator);
        this.registry.register(this.scriptsManager);
        this.registry.register(this.depth);
        this.registry.register(this.world);
        this.registry.register(this.xrSystemsGroup);
    }
    /**
     * Initializes the Core system with a given set of options. This includes
     * setting up the renderer, enabling features like controllers, depth
     * sensing, and physics, and starting the render loop.
     * @param options - Configuration options for the
     * session.
     */
    async init(options = new Options()) {
        loadingSpinnerManager.showSpinner();
        this.registry.register(options, Options);
        this.registry.register(options.depth, DepthOptions);
        this.registry.register(options.simulator, SimulatorOptions);
        this.registry.register(options.world, WorldOptions);
        this.registry.register(options.world.meshes, MeshDetectionOptions);
        this.registry.register(options.ai, AIOptions);
        this.registry.register(options.sound, SoundOptions);
        this.registry.register(options.gestures, GestureRecognitionOptions);
        if (options.transition.enabled) {
            this.transition = new XRTransition();
            this.user.add(this.transition);
            this.registry.register(this.transition);
        }
        this.camera.copy(new THREE.PerspectiveCamera(
        /*fov=*/ 90, window.innerWidth / window.innerHeight, 
        /*near=*/ options.camera.near, 
        /*far=*/ options.camera.far));
        this.registry.register(this.camera, THREE.Camera);
        this.registry.register(this.camera, THREE.PerspectiveCamera);
        this.renderer = new THREE.WebGLRenderer({
            canvas: options.canvas,
            antialias: options.antialias,
            stencil: options.stencil,
            alpha: true,
            logarithmicDepthBuffer: options.logarithmicDepthBuffer,
        });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.xr.enabled = true;
        // disable built-in occlusion
        this.renderer.xr.getDepthSensingMesh = function () {
            return null;
        };
        this.registry.register(this.renderer);
        this.renderer.xr.setReferenceSpaceType(options.referenceSpaceType);
        if (!options.canvas) {
            const xrContainer = document.createElement('div');
            document.body.appendChild(xrContainer);
            xrContainer.appendChild(this.renderer.domElement);
        }
        this.options = options;
        // Sets up controllers.
        if (options.controllers.enabled) {
            this.input.init({
                scene: this.scene,
                systemsGroup: this.xrSystemsGroup,
                options: options,
                renderer: this.renderer,
            });
            this.input.bindSelectStart(this.scriptsManager.callSelectStartBound);
            this.input.bindSelectEnd(this.scriptsManager.callSelectEndBound);
            this.input.bindSelect(this.scriptsManager.callSelectBound);
            this.input.bindSqueezeStart(this.scriptsManager.callSqueezeStartBound);
            this.input.bindSqueezeEnd(this.scriptsManager.callSqueezeEndBound);
            this.input.bindSqueeze(this.scriptsManager.callSqueezeBound);
            this.input.bindKeyDown(this.scriptsManager.callKeyDownBound);
            this.input.bindKeyUp(this.scriptsManager.callKeyUpBound);
        }
        // Sets up device camera.
        if (options.deviceCamera?.enabled) {
            this.deviceCamera = new XRDeviceCamera(options.deviceCamera);
            this.deviceCamera.setRenderer(this.renderer);
            this.registry.register(this.deviceCamera);
        }
        const webXRRequiredFeatures = options.webxrRequiredFeatures;
        // Use camera-access when the browser supports it.
        if (options.deviceCamera?.enabled) {
            if (!this.webXRSettings.optionalFeatures) {
                this.webXRSettings.optionalFeatures = [];
            }
            this.webXRSettings.optionalFeatures.push('camera-access');
        }
        this.webXRSettings.requiredFeatures = webXRRequiredFeatures;
        // Sets up depth.
        if (options.depth.enabled) {
            webXRRequiredFeatures.push('depth-sensing');
            webXRRequiredFeatures.push('local-floor');
            this.webXRSettings.depthSensing = {
                usagePreference: [],
                dataFormatPreference: [
                    this.options.depth.useFloat32 ? 'float32' : 'luminance-alpha',
                ],
                depthTypeRequest: options.depth.depthTypeRequest,
                matchDepthView: options.depth.matchDepthView,
            };
            this.depth.init(this.camera, options.depth, this.renderer, this.registry, this.scene);
        }
        if (options.hands.enabled) {
            webXRRequiredFeatures.push('hand-tracking');
            this.user.hands = new Hands(this.input.hands);
            if (options.gestures.enabled) {
                this.gestureRecognition = new GestureRecognition();
                this.xrSystemsGroup.add(this.gestureRecognition);
                this.registry.register(this.gestureRecognition);
            }
        }
        if (options.world.planes.enabled) {
            webXRRequiredFeatures.push('plane-detection');
        }
        if (options.world.meshes.enabled) {
            webXRRequiredFeatures.push('mesh-detection');
        }
        // Sets up lighting.
        if (options.lighting.enabled) {
            webXRRequiredFeatures.push('light-estimation');
            this.lighting = new Lighting();
            this.lighting.init(options.lighting, this.renderer, this.scene, this.depth);
        }
        // Sets up physics.
        if (options.physics && options.physics.RAPIER) {
            this.physics = new Physics();
            this.registry.register(this.physics);
            await this.physics.init({ physicsOptions: options.physics });
            if (options.depth.enabled) {
                this.depth.depthMesh?.initRapierPhysics(this.physics.RAPIER, this.physics.blendedWorld);
            }
        }
        this.webXRSessionManager = new WebXRSessionManager(this.renderer, this.webXRSettings, options.xrSessionMode);
        this.webXRSessionManager.addEventListener(WebXRSessionEventType.SESSION_START, (event) => this.onXRSessionStarted(event.session));
        this.webXRSessionManager.addEventListener(WebXRSessionEventType.SESSION_END, this.onXRSessionEnded.bind(this));
        // Sets up xrButton.
        let shouldAutostartSimulator = this.options.xrButton.alwaysAutostartSimulator;
        if (!shouldAutostartSimulator && options.xrButton.enabled) {
            this.xrButton = new XRButton(this.webXRSessionManager, this.permissionsManager, options.xrButton?.appTitle, options.xrButton?.appDescription, options.xrButton?.startText, options.xrButton?.endText, options.xrButton?.invalidText, options.xrButton?.startSimulatorText, options.xrButton?.showEnterSimulatorButton, this.startSimulator.bind(this), options.permissions);
            document.body.appendChild(this.xrButton.domElement);
        }
        this.webXRSessionManager.addEventListener(WebXRSessionEventType.UNSUPPORTED, () => {
            if (this.options.enableSimulator) {
                this.xrButton?.domElement.remove();
                shouldAutostartSimulator = true;
            }
        });
        await this.webXRSessionManager.initialize();
        // Sets up postprocessing effects.
        if (options.usePostprocessing) {
            this.effects = new XREffects(this.renderer, this.scene, this.timer);
            this.simulator.effects = this.effects;
        }
        // Sets up AI services.
        if (options.ai.enabled) {
            this.registry.register(this.ai);
            this.xrSystemsGroup.add(this.ai);
            // Manually init the script in case other scripts rely on it.
            await this.scriptsManager.initScript(this.ai);
        }
        await this.scriptsManager.syncScriptsWithScene(this.scene);
        // For desktop only:
        window.addEventListener('resize', this.onWindowResize.bind(this));
        this.renderer.setAnimationLoop(this.update.bind(this));
        if (this.physics) {
            setInterval(this.physicsStep.bind(this), 1000 * this.physics.timestep);
        }
        if (this.options.reticles.enabled) {
            this.input.addReticles();
        }
        if (shouldAutostartSimulator) {
            this.startSimulator();
        }
        if (!loadingSpinnerManager.isLoading) {
            loadingSpinnerManager.hideSpinner();
        }
    }
    /**
     * The main update loop, called every frame by the renderer. It orchestrates
     * all per-frame updates for subsystems and scripts.
     *
     * Order:
     * 1. Depth
     * 2. World Perception
     * 3. Input / Reticles / UIs
     * 4. Scripts
     * @param time - The current time in milliseconds.
     * @param frame - The WebXR frame object, if in an XR session.
     */
    update(time, frame) {
        this.currentFrame = frame;
        this.timer.update(time);
        if (this.simulatorRunning) {
            this.simulator.simulatorUpdate();
        }
        this.depth.update(frame);
        // Update XR camera fallback textures.
        if (this.deviceCamera?.isUsingXRCameraAccess) {
            this.deviceCamera.updateXRCamera(frame);
        }
        if (this.lighting) {
            this.lighting.update();
        }
        // Traverse the scene to find all scripts.
        this.scriptsManager.syncScriptsWithScene(this.scene);
        // Updates reticles and UIs.
        for (const script of this.scriptsManager.scripts) {
            script.ux.reset();
        }
        this.input.update();
        // Updates scripts with user interactions.
        for (const controller of this.input.controllers) {
            if (controller.userData.selected) {
                for (const script of this.scriptsManager.scripts) {
                    script.onSelecting({ target: controller });
                }
            }
        }
        for (const controller of this.input.controllers) {
            if (controller.userData.squeezing) {
                for (const script of this.scriptsManager.scripts) {
                    script.onSqueezing({ target: controller });
                }
            }
        }
        // Run callbacks that use wait frame.
        this.waitFrame.onFrame();
        // Updates renderings.
        for (const script of this.scriptsManager.scripts) {
            script.update(time, frame);
        }
        this.renderSimulatorAndScene();
        this.screenshotSynthesizer.onAfterRender(this.renderer, this.renderSceneBound, this.deviceCamera);
        if (this.simulatorRunning) {
            this.simulator.renderSimulatorScene();
        }
    }
    /**
     * Advances the physics simulation by a fixed timestep and calls the
     * corresponding physics update on all active scripts.
     */
    physicsStep() {
        this.physics.physicsStep();
        for (const script of this.scriptsManager.scripts) {
            script.physicsStep();
        }
    }
    /**
     * Lifecycle callback executed when an XR session starts. Notifies all active
     * scripts.
     * @param session - The newly started WebXR session.
     */
    async onXRSessionStarted(session) {
        if (this.options.deviceCamera?.enabled) {
            await this.deviceCamera.init();
        }
        this.scriptsManager.onXRSessionStarted(session);
    }
    async startSimulator() {
        this.xrButton?.domElement.remove();
        this.xrSystemsGroup.add(this.simulator);
        await this.scriptsManager.initScript(this.simulator);
        this.onSimulatorStarted();
    }
    /**
     * Lifecycle callback executed when an XR session ends. Notifies all active
     * scripts.
     */
    onXRSessionEnded() {
        this.scriptsManager.onXRSessionEnded();
    }
    /**
     * Lifecycle callback executed when the desktop simulator starts. Notifies
     * all active scripts.
     */
    onSimulatorStarted() {
        this.simulatorRunning = true;
        this.scriptsManager.onSimulatorStarted();
        if (this.lighting) {
            this.lighting.simulatorRunning = true;
        }
    }
    /**
     * Handles browser window resize events to keep the camera and renderer
     * synchronized.
     */
    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
    renderSimulatorAndScene() {
        if (this.simulatorRunning) {
            this.simulator.renderScene();
        }
        else {
            this.renderScene();
        }
    }
    renderScene(cameraOverride) {
        if (this.renderSceneOverride) {
            this.renderSceneOverride(this.renderer, this.scene, cameraOverride ?? this.camera);
        }
        else if (this.effects) {
            this.effects.render();
        }
        else {
            this.renderer.render(this.scene, cameraOverride ?? this.camera);
            if (traverseUtil(this.scene, (node) => node.layers.isEnabled(UI_OVERLAY_LAYER))) {
                const originalLayers = this.camera.layers.mask;
                this.camera.layers.set(UI_OVERLAY_LAYER);
                this.renderer.render(this.scene, this.camera);
                this.camera.layers.mask = originalLayers;
            }
        }
    }
}

class OcclusionUtils {
    /**
     * Creates a simple material used for rendering objects into the occlusion
     * map. This material is intended to be used with `renderer.overrideMaterial`.
     * @returns A new instance of THREE.MeshBasicMaterial.
     */
    static createOcclusionMapOverrideMaterial() {
        return new THREE.MeshBasicMaterial();
    }
    /**
     * Modifies a material's shader in-place to incorporate distance-based
     * alpha occlusion. This is designed to be used with a material's
     * `onBeforeCompile` property. This only works with built-in three.js
     * materials.
     * @param shader - The shader object provided by onBeforeCompile.
     */
    static addOcclusionToShader(shader) {
        shader.uniforms.occlusionEnabled = { value: true };
        shader.uniforms.tOcclusionMap = { value: null };
        shader.uniforms.uOcclusionClipFromWorld = { value: new THREE.Matrix4() };
        shader.defines = { USE_UV: true, DISTANCE: true };
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', [
            'uniform mat4 uOcclusionClipFromWorld;',
            'varying vec4 vOcclusionScreenCoord;',
            '#include <common>',
        ].join('\n'))
            .replace('#include <fog_vertex>', [
            '#include <fog_vertex>',
            'vOcclusionScreenCoord = uOcclusionClipFromWorld * worldPosition;',
        ].join('\n'));
        shader.fragmentShader = shader.fragmentShader
            .replace('uniform vec3 diffuse;', [
            'uniform vec3 diffuse;',
            'uniform bool occlusionEnabled;',
            'uniform sampler2D tOcclusionMap;',
            'varying vec4 vOcclusionScreenCoord;',
        ].join('\n'))
            .replace('vec4 diffuseColor = vec4( diffuse, opacity );', [
            'vec4 diffuseColor = vec4( diffuse, opacity );',
            'vec2 occlusion_coordinates = 0.5 + 0.5 * vOcclusionScreenCoord.xy / vOcclusionScreenCoord.w;',
            'vec2 occlusion_sample = texture2D(tOcclusionMap, occlusion_coordinates.xy).rg;',
            'occlusion_sample = occlusion_sample / max(0.0001, occlusion_sample.g);',
            'float occlusion_value = clamp(occlusion_sample.r, 0.0, 1.0);',
            'diffuseColor.a *= occlusionEnabled ? occlusion_value : 1.0;',
        ].join('\n'));
    }
}

// Reusable instances to avoid creating new objects in the render loop.
const euler$1 = new THREE.Euler();
const matrix4$1 = new THREE.Matrix4();
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
    // Ensures the Y-axis rotation (yaw) is calculated first and is independent of
    // the X (pitch) and Z (roll) rotations. This prevents gimbal lock from
    // affecting the yaw value.
    euler$1.setFromQuaternion(rotation, 'YXZ');
    // Creates a new quaternion from only the yaw component (the rotation around
    // the 'up' vector).
    return target.setFromAxisAngle(UP, euler$1.y);
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
    matrix4$1.lookAt(ZERO_VECTOR3, forward, up);
    return target.setFromRotationMatrix(matrix4$1);
}
/**
 * Clamps the provided rotation's angle.
 * The rotation is modified in place.
 * @param rotation - The quaternion to clamp.
 * @param angle - The maximum allowed angle in radians.
 */
function clampRotationToAngle(rotation, angle) {
    let currentAngle = 2 * Math.acos(rotation.w);
    currentAngle = ((currentAngle + Math.PI) % (2 * Math.PI)) - Math.PI;
    if (Math.abs(currentAngle) <= angle) {
        return;
    }
    const axis = v1
        .set(rotation.x, rotation.y, rotation.z)
        .multiplyScalar(1 / Math.sqrt(1 - rotation.w * rotation.w));
    axis.normalize();
    rotation.setFromAxisAngle(axis, angle * Math.sign(currentAngle));
}

class SimulatorUserAction {
    static { this.dependencies = {}; }
    async init(_options = {}) { }
    async play(_options = {}) { }
}

const LOOK_AT_ANGLE_THRESHOLD$1 = (3 * Math.PI) / 180;
const ROTATION_SPEED_RADIANS_PER_SECOND$1 = 1;
const controllerToTargetVector = new THREE.Vector3();
const targetWorldPosition$1 = new THREE.Vector3();
const targetPositionRelativeToCamera = new THREE.Vector3();
const inverseControllerRotation = new THREE.Quaternion();
const finalRotation$1 = new THREE.Quaternion();
const deltaRotation$1 = new THREE.Quaternion();
class PinchOnButtonAction extends SimulatorUserAction {
    static { this.dependencies = {
        simulator: Simulator,
        camera: THREE.Camera,
        timer: THREE.Timer,
        input: Input,
    }; }
    constructor(target) {
        super();
        this.target = target;
    }
    async init({ simulator, camera, timer, input, }) {
        this.simulator = simulator;
        this.camera = camera;
        this.timer = timer;
        this.input = input;
    }
    controllerIsPointingAtButton(controls, camera) {
        const controllerState = controls.simulatorControllerState;
        const controllerIndex = controllerState.currentControllerIndex;
        const localControllerPosition = controllerState.localControllerPositions[controllerIndex];
        const localControllerRotation = controllerState.localControllerOrientations[controllerIndex];
        this.target.getWorldPosition(targetWorldPosition$1);
        targetPositionRelativeToCamera
            .copy(targetWorldPosition$1)
            .applyMatrix4(camera.matrixWorldInverse);
        inverseControllerRotation.copy(localControllerRotation).invert();
        controllerToTargetVector
            .copy(targetPositionRelativeToCamera)
            .sub(localControllerPosition);
        lookAtRotation(controllerToTargetVector, UP, finalRotation$1);
        const angle = ((finalRotation$1.angleTo(localControllerRotation) + Math.PI) %
            (2 * Math.PI)) -
            Math.PI;
        return angle < LOOK_AT_ANGLE_THRESHOLD$1;
    }
    rotateControllerTowardsButton(controls, camera, deltaTime) {
        const controllerState = controls.simulatorControllerState;
        const controllerIndex = controllerState.currentControllerIndex;
        const localControllerPosition = controllerState.localControllerPositions[controllerIndex];
        const localControllerRotation = controllerState.localControllerOrientations[controllerIndex];
        this.target.getWorldPosition(targetWorldPosition$1);
        targetPositionRelativeToCamera
            .copy(targetWorldPosition$1)
            .applyMatrix4(camera.matrixWorldInverse);
        inverseControllerRotation.copy(localControllerRotation).invert();
        controllerToTargetVector
            .copy(targetPositionRelativeToCamera)
            .sub(localControllerPosition);
        lookAtRotation(controllerToTargetVector, UP, finalRotation$1);
        deltaRotation$1.copy(finalRotation$1).multiply(inverseControllerRotation);
        clampRotationToAngle(deltaRotation$1, ROTATION_SPEED_RADIANS_PER_SECOND$1 * deltaTime);
        localControllerRotation.premultiply(deltaRotation$1);
    }
    pinchController() {
        const simulator = this.simulator;
        const controllerState = simulator.controls.simulatorControllerState;
        const newSelectingState = true;
        this.input.dispatchEvent({
            type: 'selectstart' ,
            target: this.input.controllers[controllerState.currentControllerIndex],
        });
        if (controllerState.currentControllerIndex == 0) {
            simulator.hands.setLeftHandPinching(newSelectingState);
        }
        else {
            simulator.hands.setRightHandPinching(newSelectingState);
        }
    }
    async play({ simulatorUser, journeyId, waitFrame, }) {
        let pinchedOnButton = false;
        while (simulatorUser.isOnJourneyId(journeyId) && !pinchedOnButton) {
            const deltaTime = this.timer.getDelta();
            if (!this.controllerIsPointingAtButton(this.simulator.controls, this.camera)) {
                this.rotateControllerTowardsButton(this.simulator.controls, this.camera, deltaTime);
            }
            else {
                this.pinchController();
                pinchedOnButton = true;
            }
            await waitFrame.waitFrame();
        }
    }
}

class ShowHandsAction extends SimulatorUserAction {
    static { this.dependencies = { simulator: Simulator }; }
    async init({ simulator }) {
        this.simulator = simulator;
    }
    async play() {
        if (this.simulator.hands) {
            this.simulator.hands.showHands();
        }
    }
}

const NEAR_TARGET_DISTANCE = 0.5;
const NEAR_TARGET_THRESHOLD = 0.1;
const LOOK_AT_ANGLE_THRESHOLD = (3 * Math.PI) / 180;
const MOVEMENT_SPEED_METERS_PER_SECOND = 1;
const ROTATION_SPEED_RADIANS_PER_SECOND = 1;
// Temporary variables.
const targetWorldPosition = new THREE.Vector3();
const cameraToTargetVector = new THREE.Vector3();
// A position close to the target to move to.
const closeToTargetPosition = new THREE.Vector3();
const deltaRotation = new THREE.Quaternion();
const finalRotation = new THREE.Quaternion();
const inverseCameraRotation = new THREE.Quaternion();
/**
 * Represents a action to walk towards a panel or object.
 */
class WalkTowardsPanelAction extends SimulatorUserAction {
    static { this.dependencies = { camera: THREE.Camera, timer: THREE.Timer }; }
    constructor(target) {
        super();
        this.target = target;
    }
    async init({ camera, timer }) {
        this.camera = camera;
        this.timer = timer;
    }
    isLookingAtTarget() {
        const camera = this.camera;
        this.target.getWorldPosition(targetWorldPosition);
        cameraToTargetVector.copy(targetWorldPosition).sub(camera.position);
        lookAtRotation(cameraToTargetVector, UP, finalRotation);
        const angle = ((finalRotation.angleTo(camera.quaternion) + Math.PI) % (2 * Math.PI)) -
            Math.PI;
        return angle < LOOK_AT_ANGLE_THRESHOLD;
    }
    isNearTarget() {
        const camera = this.camera;
        this.target.getWorldPosition(targetWorldPosition);
        cameraToTargetVector.copy(targetWorldPosition).sub(camera.position);
        return (Math.abs(cameraToTargetVector.length() - NEAR_TARGET_DISTANCE) <
            NEAR_TARGET_THRESHOLD);
    }
    lookAtTarget() {
        const camera = this.camera;
        inverseCameraRotation.copy(camera.quaternion).invert();
        this.target.getWorldPosition(targetWorldPosition);
        cameraToTargetVector.copy(targetWorldPosition).sub(camera.position);
        lookAtRotation(cameraToTargetVector, UP, finalRotation);
        camera.quaternion.copy(finalRotation);
    }
    lookTowardsTarget() {
        const camera = this.camera;
        inverseCameraRotation.copy(camera.quaternion).invert();
        const deltaTime = this.timer.getDelta();
        this.target.getWorldPosition(targetWorldPosition);
        cameraToTargetVector.copy(targetWorldPosition).sub(camera.position);
        lookAtRotation(cameraToTargetVector, UP, finalRotation);
        deltaRotation.copy(finalRotation).multiply(inverseCameraRotation);
        clampRotationToAngle(deltaRotation, ROTATION_SPEED_RADIANS_PER_SECOND * deltaTime);
        camera.quaternion.premultiply(deltaRotation);
    }
    moveTowardsTarget() {
        const camera = this.camera;
        const deltaTime = this.timer.getDelta();
        this.target.getWorldPosition(targetWorldPosition);
        cameraToTargetVector.copy(targetWorldPosition).sub(camera.position);
        closeToTargetPosition
            .copy(targetWorldPosition)
            .addScaledVector(cameraToTargetVector, -NEAR_TARGET_THRESHOLD);
        const cameraToCloseToTarget = closeToTargetPosition.sub(camera.position);
        const movementDistance = clamp(cameraToCloseToTarget.length(), 0, MOVEMENT_SPEED_METERS_PER_SECOND * deltaTime);
        camera.position.addScaledVector(cameraToCloseToTarget, movementDistance / cameraToCloseToTarget.length());
    }
    async play({ simulatorUser, journeyId, waitFrame, }) {
        let isLookingAtTarget = this.isLookingAtTarget();
        let isNearTarget = this.isNearTarget();
        let shouldContinueJourney = simulatorUser.isOnJourneyId(journeyId);
        while (shouldContinueJourney && (!isLookingAtTarget || !isNearTarget)) {
            if (!isLookingAtTarget) {
                this.lookTowardsTarget();
            }
            else {
                this.lookAtTarget();
                this.moveTowardsTarget();
            }
            await waitFrame.waitFrame();
            isLookingAtTarget = this.isLookingAtTarget();
            isNearTarget = this.isNearTarget();
            shouldContinueJourney = simulatorUser.isOnJourneyId(journeyId);
        }
    }
}

// Check the threejs version and log an error if it is too old.
function checkThreeVersion() {
    if (parseInt(THREE.REVISION) < 182) {
        console.error(`three.js version ${THREE.REVISION} is too old. Please update to version 182 or higher.`);
    }
}

checkThreeVersion();
/**
 * The global singleton instance of Core, serving as the main entry point
 * for the entire XR system.
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
// --- Function Aliases ---
// These are bound shortcuts to frequently used methods for convenience.
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
 * A shortcut for `core.scriptsManager.initScript()`. Manually initializes a
 * script and its dependencies.
 * @param script - The script to initialize.
 * @see {@link ScriptsManager.initScript}
 */
function initScript(script) {
    return core.scriptsManager.initScript(script);
}
/**
 * A shortcut for `core.scriptsManager.uninitScript()`. Disposes of a script
 * and removes it from the update loop.
 * @param script - The script to uninitialize.
 * @see {@link ScriptsManager.uninitScript}
 */
function uninitScript(script) {
    return core.scriptsManager.uninitScript(script);
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
 * A shortcut for `core.timer.getElapsed()`. Gets the total time in seconds
 * since the application started.
 * @returns The elapsed time in seconds.
 * @see {@link THREE.Timer.getElapsed}
 */
function getElapsedTime() {
    return core.timer.getElapsed();
}
/**
 * Toggles whether the reticle can target the depth-sensing mesh.
 * @param value - True to add the depth mesh as a target, false to
 * remove it.
 */
function showReticleOnDepthMesh(value) {
    if (core.depth.depthMesh) {
        core.depth.depthMesh.ignoreReticleRaycast = !value;
    }
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

/**
 * Sets the given object and all its children to only be visible in the left
 * eye.
 * @param obj - Object to show only in the left eye.
 * @returns The original object.
 */
function showOnlyInLeftEye(obj) {
    obj.layers.set(LEFT_VIEW_ONLY_LAYER);
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
    obj.layers.set(RIGHT_VIEW_ONLY_LAYER);
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
        new THREE.ImageLoader().load(url, resolve, undefined, reject);
    });
    const leftTexture = new THREE.Texture();
    leftTexture.image = image;
    leftTexture.repeat.x = 0.5;
    leftTexture.needsUpdate = true;
    const rightTexture = leftTexture.clone();
    rightTexture.offset.x = 0.5;
    rightTexture.needsUpdate = true;
    return [leftTexture, rightTexture];
}

const SVG_BASE_PATH = 'https://cdn.jsdelivr.net/gh/marella/material-symbols@v0.33.0/svg/{{weight}}/{{style}}/{{icon}}.svg';
/**
 * A View that dynamically loads and displays an icon from the Google
 * Material Symbols library as a 3D object. It constructs the icon from SVG
 * data, allowing for customization of weight, style, color, and scale.
 */
class MaterialSymbolsView extends View {
    #icon;
    get icon() {
        return this.#icon;
    }
    set icon(value) {
        if (this.#icon == value)
            return;
        this.#icon = value;
        this.updateIcon();
    }
    #iconWeight;
    get iconWeight() {
        return this.#iconWeight;
    }
    set iconWeight(value) {
        if (this.#iconWeight == value)
            return;
        this.#iconWeight = value;
        this.updateIcon();
    }
    #iconStyle;
    get iconStyle() {
        return this.#iconStyle;
    }
    set iconStyle(value) {
        if (this.#iconStyle == value)
            return;
        this.#iconStyle = value;
        this.updateIcon();
    }
    #iconColor;
    get iconColor() {
        return this.#iconColor;
    }
    set iconColor(value) {
        if (this.#iconColor == value)
            return;
        this.#iconColor = value;
        this.group?.traverse?.((child) => {
            if (child instanceof THREE.Mesh) {
                child.material?.color?.set?.(value);
            }
        });
    }
    /**
     * Construct a Material Symbol view.
     * @param options - Options for the icon.
     */
    constructor({ icon = 'sunny', iconWeight = 400, iconStyle = 'outlined', iconScale = 1, iconColor = '#FFFFFF', }) {
        super({});
        this.#icon = '';
        this.#iconWeight = 400;
        this.#iconStyle = '';
        this.#iconColor = '';
        this.iconScale = 1;
        this.icon = icon;
        this.iconWeight = iconWeight;
        this.iconStyle = iconStyle;
        this.iconScale = iconScale;
        this.iconColor = iconColor;
    }
    async init() {
        if (this.group == null) {
            await this.updateIcon();
        }
    }
    /**
     * Updates the icon displayed by loading the appropriate SVG from the Material
     * Symbols library based on the current `icon`, `iconWeight`, and `iconStyle`
     * properties.
     * @returns Promise<void>
     */
    async updateIcon() {
        if (!this.icon || !this.iconWeight || !this.iconStyle) {
            return;
        }
        const svgPath = SVG_BASE_PATH.replace('{{style}}', this.iconStyle)
            .replace('{{icon}}', this.icon)
            .replace('{{weight}}', String(this.iconWeight));
        if (svgPath == this.loadedSvgPath || svgPath == this.loadingSvgPath) {
            return;
        }
        this.loadingSvgPath = svgPath;
        const svgData = await new Promise((resolve, reject) => {
            const loader = new SVGLoader();
            loader.load(svgPath, resolve, undefined, reject);
        });
        this.loadingSvgPath = undefined;
        this.loadedSvgPath = svgPath;
        const [viewMinX, viewMinY, viewWidth, viewHeight] = 
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        svgData.xml.attributes.viewBox.value.split(' ');
        const paths = svgData.paths;
        const group = new THREE.Group();
        const scale = 1 / Math.max(viewWidth, viewHeight);
        const material = new THREE.MeshBasicMaterial({
            color: this.iconColor,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        for (let i = 0; i < paths.length; i++) {
            const path = paths[i];
            const shapes = SVGLoader.createShapes(path);
            for (let j = 0; j < shapes.length; j++) {
                const shape = shapes[j];
                const geometry = new THREE.ShapeGeometry(shape);
                const mesh = new THREE.Mesh(geometry, material);
                // Flip the icon over y.
                mesh.scale.set(scale, -scale, scale);
                // Center the icon
                mesh.position.x = -0.5 - viewMinX * scale;
                mesh.position.y = 0.5 + viewMinY * scale;
                group.add(mesh);
            }
        }
        if (this.group) {
            this.remove(this.group);
            this.group?.traverse?.((child) => {
                if ('dispose' in child && typeof child.dispose === 'function') {
                    child.dispose?.();
                }
                if (child instanceof THREE.Mesh) {
                    child.geometry?.dispose?.();
                    child.material?.dispose?.();
                }
            });
        }
        this.group = group;
        group.scale.setScalar(this.iconScale);
        this.add(group);
    }
}

/**
 * Manages the state and animation logic for a scrolling text view.
 * It tracks the total number of lines, the current scroll position (as a line
 * number), and the target line, smoothly animating between them over time.
 */
class TextScrollerState extends Script {
    constructor() {
        super(...arguments);
        this.scrollSpeedLinesPerSecond = 3;
        this.lines = 1;
        this.currentLine = 0;
        this.targetLine = 0;
        this.shouldUpdate = true;
        this.lineCount = 0;
    }
    static { this.dependencies = { timer: THREE.Timer }; }
    init({ timer }) {
        this.timer = timer;
    }
    update() {
        super.update();
        if (!this.shouldUpdate) {
            return false;
        }
        // Simple linear speed scrolling.
        const deltaTime = this.timer.getDelta();
        const deltaLines = this.scrollSpeedLinesPerSecond * deltaTime;
        const distanceToTargetLine = this.targetLine - this.currentLine;
        this.currentLine += clamp(distanceToTargetLine, -deltaLines, deltaLines);
    }
}

const vector3$2 = new THREE.Vector3();
/**
 * A simple container that represents a single, swipeable page
 * within a `Pager` component. It's a fundamental building block for creating
 * carousels or tabbed interfaces.
 */
class Page extends View {
    constructor(options = {}) {
        super(options);
    }
    updateLayout() {
        // Do not update the position.
        vector3$2.copy(this.position);
        super.updateLayout();
        this.position.copy(vector3$2);
    }
}

/**
 * A state management class for a `Pager` component. It tracks the
 * total number of pages, the current scroll position, and handles the physics
 * and animation logic for smooth, inertia-based scrolling between pages.
 */
class PagerState extends Script {
    static { this.dependencies = { timer: THREE.Timer }; }
    constructor({ pages = 1 }) {
        super();
        this.currentPage = 0;
        this.shouldUpdate = true;
        this.pages = 1;
        this.pages = pages;
    }
    init({ timer }) {
        this.timer = timer;
    }
    update() {
        super.update();
        if (!this.shouldUpdate) {
            return false;
        }
        const velocity = Math.sin(Math.PI * (this.currentPage % 1));
        const direction = (this.currentPage % 1 >= 0.5 ? 1 : -1) *
            Number(Math.abs(velocity) > 0.01);
        const targetPage = clamp(this.currentPage + direction, 0, this.pages - 1);
        const remainingDelta = Math.abs(targetPage - this.currentPage);
        this.currentPage +=
            direction * clamp(velocity * this.timer.getDelta(), 0, remainingDelta);
    }
    addPage() {
        return this.pages++;
    }
}

const vector3$1 = new THREE.Vector3();
const matrix4 = new THREE.Matrix4();
/**
 * A layout container that manages a collection of `Page` views and
 * allows the user to navigate between them, typically through swiping
 * gestures. It clips the content of its pages to create a sliding window
 * effect.
 */
class Pager extends View {
    static { this.dependencies = { renderer: THREE.WebGLRenderer, input: Input }; }
    constructor(options = {}) {
        super(options);
        this.localClippingPlanes = [
            new THREE.Plane(new THREE.Vector3(1, 0, 0), 0.5),
            new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0.5),
        ];
        this.raycastMesh = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial({ visible: false }));
        this.clippingPlanes = [];
        this.selecting = false;
        this.selectStartPositionLocal = new THREE.Vector3();
        this.selectStartPage = 0;
        this.raycastPlane = new THREE.Plane();
        this.selectingRay = new THREE.Ray();
        this.selectingRayTarget = new THREE.Vector3();
        const { state = new PagerState({ pages: 1 }), enableRaycastOnChildren = true, continuousScrolling = true, } = options;
        this.state = state;
        this.enableRaycastOnChildren = enableRaycastOnChildren;
        this.continuousScrolling = continuousScrolling;
        for (let i = 0; i < this.state.pages; i++) {
            this.add(new Page());
        }
        for (let i = 0; i < this.localClippingPlanes.length; i++) {
            this.clippingPlanes.push(this.localClippingPlanes[i].clone());
        }
    }
    init({ renderer, input }) {
        renderer.localClippingEnabled = true;
        this.input = input;
    }
    updatePageCount() {
        this.remove(this.raycastMesh);
        for (let i = this.children.length; i < this.state.pages; i++) {
            this.add(new Page());
        }
        for (let i = this.state.pages; i < this.children.length;) {
            this.children[i].dispose?.();
            this.remove(this.children[i]);
        }
        this.add(this.raycastMesh);
    }
    updatePagePositions() {
        const halfNumberOfPages = Math.floor(this.state.pages / 2);
        for (let i = 0; i < this.state.pages; i++) {
            const deltaFromCurrentPage = this.continuousScrolling && this.state.pages > 1
                ? ((i -
                    this.state.currentPage +
                    halfNumberOfPages +
                    this.state.pages) %
                    this.state.pages) -
                    halfNumberOfPages
                : i - this.state.currentPage;
            this.children[i].position.x = deltaFromCurrentPage * this.rangeX;
        }
    }
    resetClippingPlanesToLocalSpace() {
        for (let i = 0; i < this.localClippingPlanes.length && i < this.clippingPlanes.length; i++) {
            this.clippingPlanes[i].copy(this.localClippingPlanes[i]);
        }
    }
    updateClippingPlanes() {
        // Map the clipping planes back to world space.
        this.resetClippingPlanesToLocalSpace();
        this.updateWorldMatrix(/*updateParents=*/ true, /*updateChildren=*/ false);
        for (const plane of this.clippingPlanes) {
            plane.applyMatrix4(this.matrixWorld);
        }
        this.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.material.clippingPlanes = this.clippingPlanes;
            }
        });
    }
    update() {
        this.updatePageCount();
        this.updatePagePositions();
        this.updateClippingPlanes();
    }
    updateLayout() {
        super.updateLayout();
        this.raycastMesh.scale.set(this.rangeX, this.rangeY, 1.0);
    }
    onObjectSelectStart(event) {
        const controller = event.target;
        const intersections = this.input.intersectionsForController.get(controller);
        const intersectionIndex = intersections.findIndex((intersection) => intersection.object == this);
        if (intersectionIndex == -1)
            return false;
        const intersection = intersections[intersectionIndex];
        this.selecting = true;
        this.selectingController = controller;
        this.updateMatrixWorld();
        this.selectStartPositionLocal
            .copy(intersection.point)
            .applyMatrix4(matrix4.copy(this.matrixWorld).invert());
        this.raycastPlane.normal.set(0, 0, 1.0);
        this.raycastPlane.constant = 0;
        this.raycastPlane.applyMatrix4(this.matrixWorld);
        this.selectStartPage = this.state.currentPage;
        return true;
    }
    computeSelectingDelta(selectingPosition, startSelectPosition) {
        return (selectingPosition.x - startSelectPosition.x) / this.rangeX;
    }
    onSelecting() {
        if (this.selecting) {
            // Raycast to the plane;
            this.selectingRay.origin.set(0.0, 0.0, 0.0);
            this.selectingRay.direction.set(0.0, 0.0, -1);
            this.selectingController.updateMatrixWorld();
            this.selectingRay.applyMatrix4(this.selectingController.matrixWorld);
            this.selectingRay.intersectPlane(this.raycastPlane, this.selectingRayTarget);
            this.updateMatrixWorld();
            this.selectingRayTarget.applyMatrix4(matrix4.copy(this.matrixWorld).invert());
            const deltaPage = this.computeSelectingDelta(this.selectingRayTarget, this.selectStartPositionLocal);
            this.state.currentPage =
                this.continuousScrolling && this.state.pages > 1
                    ? (this.selectStartPage - deltaPage + this.state.pages) %
                        this.state.pages
                    : clamp(this.selectStartPage - deltaPage, 0, this.state.pages - 1);
        }
    }
    onObjectSelectEnd(event) {
        if (event.target == this.selectingController) {
            this.selecting = false;
        }
        return true;
    }
    /**
     * Raycast to the pager's raycastMesh so the user can scroll across pages.
     */
    raycast(raycaster, intersects) {
        const thisIntersections = [];
        this.raycastMesh.raycast(raycaster, thisIntersections);
        thisIntersections.forEach((intersection) => {
            intersection.object = this;
            intersects.push(intersection);
        });
        // Loop through children.
        if (this.enableRaycastOnChildren) {
            const childIntersections = [];
            for (const child of this.children) {
                raycaster.intersectObject(child, true, childIntersections);
            }
            // Create if the intersection is on this page.
            this.updateMatrixWorld();
            matrix4.copy(this.matrixWorld).invert();
            for (const intersection of childIntersections) {
                const pointInLocalCoordinates = vector3$1
                    .copy(intersection.point)
                    .applyMatrix4(matrix4);
                if (Math.abs(pointInLocalCoordinates.x) < 0.5) {
                    intersects.push(intersection);
                }
            }
        }
        return false;
    }
}

/**
 * A specialized `Pager` that arranges its pages vertically and
 * enables vertical swiping gestures. It is commonly used as the foundation for
 * scrollable text views.
 */
class VerticalPager extends Pager {
    constructor() {
        super(...arguments);
        this.localClippingPlanes = [
            new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.5),
            new THREE.Plane(new THREE.Vector3(0, -1, 0), 0.5),
        ];
    }
    updateLayout() {
        super.updateLayout();
        this.localClippingPlanes[0].constant = 0.5 * this.rangeY;
        this.localClippingPlanes[1].constant = 0.5 * this.rangeY;
    }
    computeSelectingDelta(selectingPosition, startSelectPosition) {
        return (selectingPosition.y - startSelectPosition.y) / this.rangeY;
    }
}

class ScrollingTroikaTextView extends View {
    constructor({ text = 'ScrollingTroikaTextView', textAlign = 'left', scrollerState = new TextScrollerState(), fontSize = 0.06, } = {}) {
        super();
        this.onTextSyncCompleteBound = this.onTextSyncComplete.bind(this);
        this.currentText = '';
        this.scrollerState = scrollerState || new TextScrollerState();
        this.pager = new VerticalPager();
        this.textViewWrapper = new View();
        this.pager.children[0].add(this.textViewWrapper);
        this.textView = new TextView({
            text: text,
            textAlign: textAlign,
            fontSize: fontSize,
            anchorX: 0,
            anchorY: 0,
        });
        this.textView.x = -0.5;
        this.textView.addEventListener('synccomplete', this.onTextSyncCompleteBound);
        this.textViewWrapper.add(this.textView);
        this.add(this.scrollerState);
        this.add(this.pager);
    }
    update() {
        this.textViewWrapper.y =
            this.textView.lineHeight *
                this.textView.aspectRatio *
                this.scrollerState.currentLine;
        this.textViewWrapper.updateLayout();
    }
    addText(text) {
        this.setText(this.currentText + text);
    }
    setText(text) {
        this.currentText = text;
        this.textView.setText(this.currentText);
    }
    onTextSyncComplete() {
        if (this.textView.lineCount > 0) {
            this.textView.y =
                -0.5 + this.textView.lineHeight * this.textView.aspectRatio;
            this.textView.updateLayout();
            this.scrollerState.lineCount = this.textView.lineCount;
            this.scrollerState.targetLine = this.textView.lineCount - 1;
            this.clipToLineHeight();
        }
    }
    clipToLineHeight() {
        const lineHeight = this.textView.lineHeight * this.textView.aspectRatio;
        const visibleLines = Math.floor(1.0 / lineHeight);
        const newHeight = visibleLines * lineHeight;
        this.pager.localClippingPlanes[1].constant = newHeight - 0.5;
    }
}

const positionDiff = new THREE.Vector3();
const rotationDiff = new THREE.Quaternion();
const euler = new THREE.Euler();
/**
 * A non-visual helper class for calculating a slider value based on
 * a controller's movement relative to an initial pose. It can derive the value
 * from either positional (for XR hands/controllers) or rotational (for mouse)
 * input, making it a flexible tool for creating virtual sliders without a
 * visible UI element.
 */
class FreestandingSlider {
    /**
     * Create a freestanding slider object.
     */
    constructor(startingValue = 0.0, minValue = 0.0, maxValue = 1.0, scale = 1.0, rotationScale) {
        this.startingValue = startingValue;
        this.minValue = minValue;
        this.maxValue = maxValue;
        this.scale = scale;
        this.initialPosition = new THREE.Vector3();
        this.initialRotationInverse = new THREE.Quaternion();
        this.rotationScale =
            rotationScale != undefined ? rotationScale : -this.scale;
    }
    /**
     * Captures the initial position and rotation to serve as the reference point
     * for the gesture.
     * @param position - The starting world position.
     * @param rotation - The starting world rotation.
     */
    setInitialPose(position, rotation) {
        this.initialPosition.copy(position);
        this.initialRotationInverse.copy(rotation).invert();
    }
    /**
     * A convenience method to capture the initial pose from a controller object.
     * @param controller - The controller to use as the reference.
     */
    setInitialPoseFromController(controller) {
        this.setInitialPose(controller.position, controller.quaternion);
    }
    /**
     * Calculates the slider value based on a new world position.
     * @param position - The current world position of the input source.
     * @returns The calculated slider value, clamped within the min/max range.
     */
    getValue(position) {
        positionDiff
            .copy(position)
            .sub(this.initialPosition)
            .applyQuaternion(this.initialRotationInverse);
        return clamp(this.startingValue + this.scale * positionDiff.x, this.minValue, this.maxValue);
    }
    /**
     * Calculates the slider value based on a new world rotation (for mouse
     * input).
     * @param rotation - The current world rotation of the input source.
     * @returns The calculated slider value, clamped within the min/max range.
     */
    getValueFromRotation(rotation) {
        rotationDiff.copy(rotation).multiply(this.initialRotationInverse);
        euler.setFromQuaternion(rotationDiff, 'YXZ');
        return clamp(this.startingValue + this.rotationScale * euler.y, this.minValue, this.maxValue);
    }
    /**
     * A polymorphic method that automatically chooses the correct calculation
     * (positional or rotational) based on the controller type.
     * @param controller - The controller providing the input.
     * @returns The calculated slider value.
     */
    getValueFromController(controller) {
        return controller instanceof MouseController
            ? this.getValueFromRotation(controller.quaternion)
            : this.getValue(controller.position);
    }
    /**
     * Updates the starting value, typically after a gesture has ended.
     * @param value - The new starting value for the next gesture.
     */
    updateValue(value) {
        this.startingValue = value;
    }
}

/**
 * The base URL for Three.js JSM examples, used for DRACO and KTX2 decoders.
 */
const jsmUrl = `https://cdn.jsdelivr.net/npm/three@0.${THREE.REVISION}.0/examples/jsm/`;
/**
 * The configured GLTFLoader instance.
 */
let gltfLoaderInstance;
function getGLTFLoader(renderer, manager) {
    if (gltfLoaderInstance) {
        return gltfLoaderInstance;
    }
    const dracoLoader = new DRACOLoader(manager);
    dracoLoader.setDecoderPath(jsmUrl + 'libs/draco/');
    dracoLoader.setDecoderConfig({ type: 'js' });
    const ktx2Loader = new KTX2Loader(manager);
    ktx2Loader.setTranscoderPath(jsmUrl + 'libs/basis/');
    if (renderer) {
        ktx2Loader.detectSupport(renderer);
    }
    gltfLoaderInstance = new GLTFLoader(manager);
    gltfLoaderInstance.setDRACOLoader(dracoLoader);
    gltfLoaderInstance.setKTX2Loader(ktx2Loader);
    return gltfLoaderInstance;
}
/**
 * Manages the loading of 3D models, automatically handling dependencies
 * like DRACO and KTX2 loaders.
 */
class ModelLoader {
    /**
     * Creates an instance of ModelLoader.
     * @param manager - The
     *     loading manager to use,
     * required for KTX2 texture support.
     */
    constructor(manager = THREE.DefaultLoadingManager) {
        this.manager = manager;
    }
    /**
     * Loads a model based on its file extension. Supports .gltf, .glb,
     * .ply, .spz, .splat, and .ksplat.
     * @returns A promise that resolves with the loaded model data (e.g., a glTF
     *     scene or a SplatMesh).
     */
    async load({ path, url = '', renderer = undefined, onProgress = undefined, }) {
        if (onProgress) {
            console.warn('ModelLoader: An onProgress callback was provided to load(), ' +
                'but a LoadingManager is in use. Progress will be reported via the ' +
                "LoadingManager's onProgress callback. The provided callback will be ignored.");
        }
        const extension = url.split('.').pop()?.toLowerCase() || '';
        const splatExtensions = ['ply', 'spz', 'splat', 'ksplat'];
        const gltfExtensions = ['gltf', 'glb'];
        if (gltfExtensions.includes(extension)) {
            return await this.loadGLTF({ path, url, renderer });
        }
        else if (splatExtensions.includes(extension)) {
            return await this.loadSplat({ url });
        }
        console.error('Unsupported file type: ' + extension);
        return null;
    }
    /**
     * Loads a 3DGS model (.ply, .spz, .splat, .ksplat).
     * @param url - The URL of the model file.
     * @returns A promise that resolves with the loaded
     * SplatMesh object.
     */
    async loadSplat({ url = '' }) {
        const { SplatMesh } = await import('@sparkjsdev/spark'); // Dynamic import
        const splatMesh = new SplatMesh({ url });
        await splatMesh.initialized;
        return splatMesh;
    }
    /**
     * Loads a GLTF or GLB model.
     * @param options - The loading options.
     * @returns A promise that resolves with the loaded glTF object.
     */
    async loadGLTF({ path, url = '', renderer = undefined, }) {
        const loader = getGLTFLoader(renderer, this.manager);
        if (path) {
            loader.setPath(path);
        }
        return new Promise((resolve, reject) => {
            loader.load(url, (gltf) => resolve(gltf), undefined, (error) => reject(error));
        });
    }
}

/**
 * Calculates the bounding box for a group of THREE.Object3D instances.
 *
 * @param objects - An array of THREE.Object3D instances.
 * @returns The computed THREE.Box3.
 */
function getGroupBoundingBox(objects) {
    const bbox = new THREE.Box3();
    if (objects.length === 0) {
        return bbox;
    }
    const parentReferences = new Map();
    for (const child of objects) {
        if (child.parent) {
            parentReferences.set(child, child.parent);
            child.removeFromParent();
        }
        bbox.expandByObject(child, true);
    }
    // Restore parent references
    for (const [child, parent] of parentReferences.entries()) {
        parent.add(child);
    }
    return bbox;
}

/**
 * A custom `THREE.BufferGeometry` that creates one rounded corner
 * piece for the `ModelViewerPlatform`. Four of these are instantiated and
 * rotated to form all corners of the platform.
 */
class ModelViewerPlatformCornerGeometry extends THREE.BufferGeometry {
    constructor(radius = 1, tube = 0.4, radialSegments = 12, tubularSegments = 48) {
        super();
        const indices = [];
        const vertices = [];
        const normals = [];
        const uvs = [];
        const center = new THREE.Vector3();
        const vertex = new THREE.Vector3();
        const normal = new THREE.Vector3();
        for (let j = 0; j <= radialSegments; j++) {
            for (let i = 0; i <= tubularSegments; i++) {
                const u = ((i / tubularSegments) * Math.PI) / 2;
                const v = (j / radialSegments) * Math.PI + (3 * Math.PI) / 2;
                vertex.x = (radius + tube * Math.cos(v)) * Math.cos(u);
                vertex.y = (radius + tube * Math.cos(v)) * Math.sin(u);
                vertex.z = tube * Math.sin(v);
                vertices.push(vertex.x, vertex.y, vertex.z);
                center.x = radius * Math.cos(u);
                center.y = radius * Math.sin(u);
                normal.subVectors(vertex, center).normalize();
                normals.push(normal.x, normal.y, normal.z);
                uvs.push(i / tubularSegments);
                uvs.push(j / radialSegments);
            }
        }
        for (let j = 1; j <= radialSegments; j++) {
            for (let i = 1; i <= tubularSegments; i++) {
                const a = (tubularSegments + 1) * j + i - 1;
                const b = (tubularSegments + 1) * (j - 1) + i - 1;
                const c = (tubularSegments + 1) * (j - 1) + i;
                const d = (tubularSegments + 1) * j + i;
                indices.push(a, b, d);
                indices.push(b, c, d);
            }
        }
        this.setIndex(indices);
        this.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        this.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        this.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    }
}

/**
 * A factory function that constructs the complete geometry for a
 * `ModelViewerPlatform`. It combines several sub-geometries: four rounded
 * corners, four straight side tubes, and the flat top and bottom surfaces.
 * @param width - The total width of the platform.
 * @param depth - The total depth of the platform.
 * @param thickness - The thickness of the platform.
 * @param cornerRadius - The radius of the rounded corners.
 * @returns A merged `THREE.BufferGeometry` for the entire platform.
 */
function createPlatformGeometry(width = 1, depth = 1, thickness = 0.02, cornerRadius = 0.03, cornerWidthSegments = 5, radialSegments = 5) {
    const sideGeometries = createPlatformSideGeometries(width, depth, thickness, cornerRadius, cornerWidthSegments, radialSegments);
    const sideGeometriesVertexCount = sideGeometries.reduce((acc, val) => {
        return acc + val.index.count;
    }, 0);
    const flatGeometries = createPlatformFlatGeometries(width, depth, thickness, cornerRadius, cornerWidthSegments);
    const flatGeometriesVertexCount = flatGeometries.reduce((acc, val) => {
        return acc + val.index.count;
    }, 0);
    const allGeometries = [...sideGeometries, ...flatGeometries];
    const mergedGeometry = BufferGeometryUtils.mergeGeometries(allGeometries);
    allGeometries.forEach((geometry) => geometry.dispose());
    mergedGeometry.addGroup(0, sideGeometriesVertexCount, 0);
    mergedGeometry.addGroup(sideGeometriesVertexCount, flatGeometriesVertexCount, 1);
    mergedGeometry.computeBoundingBox();
    return mergedGeometry;
}
function createPlatformSideGeometries(width = 1, depth = 1, thickness = 0.01, cornerRadius = 0.03, cornerWidthSegments = 5, radialSegments = 5) {
    const cornerGeometry = new ModelViewerPlatformCornerGeometry(cornerRadius, thickness / 2, radialSegments, cornerWidthSegments).rotateX(Math.PI / 2);
    const cornerGeometry1 = cornerGeometry
        .clone()
        .rotateY((2 * Math.PI) / 2)
        .translate(-(width / 2 - cornerRadius), 0, -(depth / 2 - cornerRadius));
    const cornerGeometry2 = cornerGeometry
        .clone()
        .rotateY((3 * Math.PI) / 2)
        .translate(-(width / 2 - cornerRadius), 0, depth / 2 - cornerRadius);
    const cornerGeometry3 = cornerGeometry
        .clone()
        .rotateY((4 * Math.PI) / 2)
        .translate(width / 2 - cornerRadius, 0, depth / 2 - cornerRadius);
    const cornerGeometry4 = cornerGeometry
        .rotateY((5 * Math.PI) / 2)
        .translate(width / 2 - cornerRadius, 0, -(depth / 2 - cornerRadius));
    const cornerTubes = [
        cornerGeometry1,
        cornerGeometry2,
        cornerGeometry3,
        cornerGeometry4,
    ];
    const widthTube = new THREE.CylinderGeometry(thickness / 2, thickness / 2, width - 2 * cornerRadius, radialSegments, 1, true, 0, Math.PI).rotateZ(Math.PI / 2);
    const widthTube1 = widthTube
        .clone()
        .rotateX(-Math.PI / 2)
        .translate(0, 0, -depth / 2);
    const widthTube2 = widthTube.rotateX(Math.PI / 2).translate(0, 0, depth / 2);
    const depthTube = new THREE.CylinderGeometry(thickness / 2, thickness / 2, depth - 2 * cornerRadius, radialSegments, 1, true, 0, Math.PI).rotateX(-Math.PI / 2);
    const depthTube1 = depthTube
        .clone()
        .rotateY(Math.PI)
        .translate(-width / 2, 0, 0);
    const depthTube2 = depthTube.translate(width / 2, 0, 0);
    const sideTubes = [widthTube1, widthTube2, depthTube1, depthTube2];
    return [...cornerTubes, ...sideTubes];
}
function createPlatformFlatGeometries(width = 1, depth = 1, thickness = 0.01, cornerRadius = 0.03, cornerWidthSegments = 5) {
    const widthMinusRadius = width - 2 * cornerRadius;
    const depthMinusRadius = depth - 2 * cornerRadius;
    const longQuad = new THREE.PlaneGeometry(width, depthMinusRadius).rotateX(-Math.PI / 2);
    const shortQuad = new THREE.PlaneGeometry(widthMinusRadius, cornerRadius).rotateX(-Math.PI / 2);
    const shortQuadTranslationZ = depthMinusRadius / 2 + cornerRadius / 2;
    const shortQuad1 = shortQuad.clone().translate(0, 0, shortQuadTranslationZ);
    const shortQuad2 = shortQuad.translate(0, 0, -shortQuadTranslationZ);
    const quadGeometries = [longQuad, shortQuad1, shortQuad2];
    const cornerCircle = new THREE.CircleGeometry(cornerRadius, cornerWidthSegments, 0, Math.PI / 2).rotateX(-Math.PI / 2);
    const circleTranslationZ = depthMinusRadius / 2;
    const circleTranslationX = widthMinusRadius / 2;
    const cornerCircle1 = cornerCircle
        .clone()
        .rotateY((3 * Math.PI) / 2)
        .translate(circleTranslationX, 0, circleTranslationZ);
    const cornerCircle2 = cornerCircle
        .clone()
        .rotateY((0 * Math.PI) / 2)
        .translate(circleTranslationX, 0, -circleTranslationZ);
    const cornerCircle3 = cornerCircle
        .clone()
        .rotateY((1 * Math.PI) / 2)
        .translate(-circleTranslationX, 0, -circleTranslationZ);
    const cornerCircle4 = cornerCircle
        .clone()
        .rotateY((2 * Math.PI) / 2)
        .translate(-circleTranslationX, 0, circleTranslationZ);
    const circleGeometries = [
        cornerCircle1,
        cornerCircle2,
        cornerCircle3,
        cornerCircle4,
    ];
    const topGeometries = [...quadGeometries, ...circleGeometries];
    const bottomGeometries = topGeometries.map((geometry) => {
        return geometry
            .clone()
            .rotateX(Math.PI)
            .translate(0, -thickness / 2, 0);
    });
    topGeometries.forEach((geometry) => geometry.translate(0, thickness / 2, 0));
    return [...topGeometries, ...bottomGeometries];
}

/**
 * A specialized `THREE.Mesh` that serves as the interactive base for
 * a `ModelViewer`. It has a distinct visual appearance and handles the logic
 * for fading in and out on hover. Its `draggingMode` is set to `TRANSLATING` to
 * enable movement.
 */
class ModelViewerPlatform extends THREE.Mesh {
    constructor(width, depth, thickness) {
        const geometry = createPlatformGeometry(width, depth, thickness);
        super(geometry, [
            new THREE.MeshLambertMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.0,
            }),
            new THREE.MeshLambertMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.0,
            }),
        ]);
        this.draggingMode = DragManager.TRANSLATING;
        this.opacity = new AnimatableNumber(0, 0, 0.5, 0);
    }
    update(deltaTime) {
        this.opacity.update(deltaTime);
        this.material[0].opacity = this.opacity.value;
        this.material[1].opacity = 0.5 * this.opacity.value;
        this.visible = this.opacity.value > 0.001;
    }
}

const defaultPlatformMargin = new THREE.Vector2(0.2, 0.2);
const vector3 = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const quaternion2 = new THREE.Quaternion();
class SplatAnchor extends THREE.Object3D {
    constructor() {
        super(...arguments);
        this.draggingMode = DragMode.ROTATING;
    }
}
class RotationRaycastMesh extends THREE.Mesh {
    constructor(geometry, material) {
        super(geometry, material);
        this.draggingMode = DragMode.ROTATING;
    }
}
/**
 * A comprehensive UI component for loading, displaying, and
 * interacting with 3D models (GLTF and Splats) in an XR scene. It
 * automatically creates an interactive platform for translation and provides
 * mechanisms for rotation and scaling in both desktop and XR.
 */
class ModelViewer extends Script {
    static { this.dependencies = {
        camera: THREE.Camera,
        depth: Depth,
        scene: THREE.Scene,
        renderer: THREE.WebGLRenderer,
        registry: Registry,
    }; }
    constructor({ castShadow = true, receiveShadow = true, raycastToChildren = false, }) {
        super();
        this.draggable = true;
        this.rotatable = true;
        this.scalable = true;
        this.platformAnimationSpeed = 2;
        this.platformThickness = 0.02;
        this.isOneOneScale = false;
        this.initialScale = new THREE.Vector3().setScalar(1);
        this.startAnimationOnLoad = true;
        this.clipActions = [];
        this.clock = new THREE.Clock();
        this.hoveringControllers = new Set();
        this.occludableShaders = new Set();
        this.bbox = new THREE.Box3();
        this.castShadow = castShadow;
        this.receiveShadow = receiveShadow;
        this.raycastToChildren = raycastToChildren;
    }
    async init({ camera, depth, scene, renderer, registry, }) {
        this.camera = camera;
        this.depth = depth;
        this.scene = scene;
        this.renderer = renderer;
        this.registry = registry;
        for (const shader of this.occludableShaders) {
            this.depth.occludableShaders.add(shader);
        }
        if (this.splatMesh) {
            await this.createSparkRendererIfNeeded();
            this.scene.add(this.splatMesh);
        }
    }
    async loadSplatModel({ data, onSceneLoaded = (_) => { }, platformMargin = defaultPlatformMargin, setupRaycastCylinder = true, setupRaycastBox = false, setupPlatform = true, }) {
        this.data = data;
        if (data.scale) {
            this.initialScale.copy(data.scale);
        }
        const splatMesh = await new ModelLoader().loadSplat({ url: data.model });
        this.splatMesh = splatMesh;
        splatMesh.raycast = () => { };
        this.splatAnchor = new SplatAnchor();
        this.splatAnchor.add(splatMesh);
        if (data.scale) {
            this.splatAnchor.scale.copy(data.scale);
        }
        if (data.rotation) {
            this.splatAnchor.rotation.set(THREE.MathUtils.degToRad(data.rotation.x), THREE.MathUtils.degToRad(data.rotation.y), THREE.MathUtils.degToRad(data.rotation.z));
        }
        if (data.position) {
            this.splatAnchor.position.copy(data.position);
        }
        this.add(this.splatAnchor);
        await this.createSparkRendererIfNeeded();
        await this.setupBoundingBox(data.verticallyAlignObject !== false, data.horizontallyAlignObject !== false);
        if (setupRaycastCylinder) {
            this.setupRaycastCylinder();
        }
        else if (setupRaycastBox) {
            this.setupRaycastBox();
        }
        if (setupPlatform) {
            this.setupPlatform(platformMargin);
        }
        this.setCastShadow(this.castShadow);
        this.setReceiveShadow(this.receiveShadow);
        // Return the anchor, as it's the interactive object in the scene graph
        return onSceneLoaded ? onSceneLoaded(this.splatAnchor) : this.splatAnchor;
    }
    async loadGLTFModel({ data, onSceneLoaded = () => { }, platformMargin = defaultPlatformMargin, setupRaycastCylinder = true, setupRaycastBox = false, setupPlatform = true, renderer = undefined, addOcclusionToShader = false, }) {
        this.data = data;
        if (data.scale) {
            this.initialScale.copy(data.scale);
        }
        const gltf = await new ModelLoader().loadGLTF({
            path: data.path,
            url: data.model,
            renderer: renderer,
        });
        const animationMixer = new THREE.AnimationMixer(gltf.scene);
        gltf.animations.forEach((clip) => {
            if (this.startAnimationOnLoad) {
                animationMixer.clipAction(clip).play();
            }
            else {
                this.clipActions.push(animationMixer.clipAction(clip));
            }
        });
        gltf.scene.draggingMode =
            DragManager.ROTATING;
        this.gltfMesh = gltf;
        this.animationMixer = animationMixer;
        // Set the initial scale
        if (data.scale) {
            this.gltfMesh.scene.scale.copy(data.scale);
        }
        if (data.rotation) {
            gltf.scene.rotation.set(THREE.MathUtils.degToRad(data.rotation.x), THREE.MathUtils.degToRad(data.rotation.y), THREE.MathUtils.degToRad(data.rotation.z));
        }
        if (data.position) {
            gltf.scene.position.copy(data.position);
        }
        gltf.scene.draggingMode =
            DragManager.ROTATING;
        this.add(gltf.scene);
        await this.setupBoundingBox(data.verticallyAlignObject !== false, data.horizontallyAlignObject !== false);
        if (setupRaycastCylinder) {
            this.setupRaycastCylinder();
        }
        else if (setupRaycastBox) {
            this.setupRaycastBox();
        }
        if (setupPlatform) {
            this.setupPlatform(platformMargin);
        }
        this.setCastShadow(this.castShadow);
        this.setReceiveShadow(this.receiveShadow);
        if (addOcclusionToShader) {
            for (const material of this.platform?.material || []) {
                material.onBeforeCompile = (shader) => {
                    OcclusionUtils.addOcclusionToShader(shader);
                    shader.uniforms.occlusionEnabled.value = true;
                    material.userData.shader = shader;
                    this.occludableShaders.add(shader);
                    this.depth?.occludableShaders.add(shader);
                };
            }
            this.platform?.layers.enable(OCCLUDABLE_ITEMS_LAYER);
            gltf.scene.traverse((child) => {
                if (child.isMesh) {
                    const mesh = child;
                    (mesh.material instanceof Array
                        ? mesh.material
                        : [mesh.material]).forEach((material) => {
                        material.transparent = true;
                        material.onBeforeCompile = (shader) => {
                            OcclusionUtils.addOcclusionToShader(shader);
                            shader.uniforms.occlusionEnabled.value = true;
                            this.occludableShaders.add(shader);
                            this.depth?.occludableShaders.add(shader);
                        };
                    });
                    child.layers.enable(OCCLUDABLE_ITEMS_LAYER);
                }
            });
        }
        return onSceneLoaded ? onSceneLoaded(gltf.scene) : gltf.scene;
    }
    async setupBoundingBox(verticallyAlignObject = true, horizontallyAlignObject = true) {
        if (this.splatMesh) {
            const localBbox = await this.splatMesh.getBoundingBox(false);
            if (localBbox.isEmpty()) {
                this.bbox = localBbox;
                return;
            }
            this.splatAnchor.updateMatrix();
            const localBboxOfTransformedMesh = localBbox
                .clone()
                .applyMatrix4(this.splatAnchor.matrix);
            const translationAmount = new THREE.Vector3();
            localBboxOfTransformedMesh
                .getCenter(translationAmount)
                .multiplyScalar(-1);
            if (verticallyAlignObject) {
                translationAmount.y = -localBboxOfTransformedMesh.min.y;
            }
            else {
                translationAmount.y = 0;
            }
            if (!horizontallyAlignObject) {
                translationAmount.x = 0;
                translationAmount.z = 0;
            }
            this.splatAnchor.position.add(translationAmount);
            this.bbox = localBboxOfTransformedMesh.translate(translationAmount);
        }
        else {
            const contentChildren = this.children.filter((c) => c !== this.platform &&
                c !== this.rotationRaycastMesh &&
                c !== this.controlBar);
            this.bbox = getGroupBoundingBox(contentChildren);
            if (this.bbox.isEmpty()) {
                return;
            }
            const translationAmount = new THREE.Vector3();
            this.bbox.getCenter(translationAmount).multiplyScalar(-1);
            if (verticallyAlignObject) {
                translationAmount.y = -this.bbox.min.y;
            }
            else {
                translationAmount.y = 0;
            }
            if (!horizontallyAlignObject) {
                translationAmount.x = 0;
                translationAmount.z = 0;
            }
            for (const child of contentChildren) {
                child.position.add(translationAmount);
            }
            this.bbox.translate(translationAmount);
        }
    }
    setupRaycastCylinder() {
        const bboxSize = new THREE.Vector3();
        this.bbox.getSize(bboxSize);
        const radius = 0.05 + 0.5 * Math.min(bboxSize.x, bboxSize.z);
        const rotationRaycastMesh = new RotationRaycastMesh(new THREE.CylinderGeometry(radius, radius, bboxSize.y), new THREE.MeshBasicMaterial({ color: 0x990000, wireframe: true }));
        this.bbox.getCenter(rotationRaycastMesh.position);
        this.rotationRaycastMesh = rotationRaycastMesh;
        this.rotationRaycastMesh.visible = false;
        this.add(this.rotationRaycastMesh);
    }
    setupRaycastBox() {
        if (this.rotationRaycastMesh) {
            this.rotationRaycastMesh.removeFromParent();
            this.rotationRaycastMesh.geometry.dispose();
            this.rotationRaycastMesh.material.dispose();
        }
        const bboxSize = new THREE.Vector3();
        this.bbox.getSize(bboxSize);
        const rotationRaycastMesh = new RotationRaycastMesh(new THREE.BoxGeometry(bboxSize.x, bboxSize.y, bboxSize.z), new THREE.MeshBasicMaterial({ color: 0x990000, wireframe: true }));
        this.bbox.getCenter(rotationRaycastMesh.position);
        this.rotationRaycastMesh = rotationRaycastMesh;
        this.rotationRaycastMesh.visible = false;
        this.add(this.rotationRaycastMesh);
    }
    setupPlatform(platformMargin = defaultPlatformMargin) {
        const bboxSize = new THREE.Vector3();
        this.bbox.getSize(bboxSize);
        const width = bboxSize.x + platformMargin.x;
        const depth = bboxSize.z + platformMargin.y;
        this.platform = new ModelViewerPlatform(width, depth, this.platformThickness);
        const center = new THREE.Vector3();
        this.bbox.getCenter(center);
        this.platform.position.set(center.x, -this.platformThickness / 2, center.z);
        this.add(this.platform);
    }
    update() {
        const delta = this.clock.getDelta();
        if (this.animationMixer) {
            this.animationMixer.update(delta);
        }
        if (this.platform) {
            this.platform.update(delta);
        }
        const camera = this.camera;
        if (this.controlBar != null &&
            this.controlBar.parent == this &&
            camera != null) {
            const directionToCamera = vector3
                .copy(camera.position)
                .sub(this.position);
            const distanceToCamera = directionToCamera.length();
            const pitchAngleRadians = Math.asin(directionToCamera.normalize().y);
            directionToCamera.y = 0;
            directionToCamera.normalize();
            // Make the button face the camera.
            quaternion.copy(this.quaternion).invert();
            this.controlBar.quaternion
                .setFromAxisAngle(LEFT, pitchAngleRadians)
                .premultiply(quaternion2.setFromUnitVectors(BACK, directionToCamera))
                .premultiply(quaternion);
            this.controlBar.position
                .setScalar(0)
                .addScaledVector(directionToCamera, 0.5)
                .applyQuaternion(quaternion);
            this.controlBar.position.y = 0.0;
            this.controlBar.scale.set(distanceToCamera / this.scale.x, distanceToCamera / this.scale.y, distanceToCamera / this.scale.z);
        }
    }
    onObjectSelectStart() {
        return this.draggable || this.rotatable || this.scalable;
    }
    onObjectSelectEnd() {
        return this.draggable || this.rotatable || this.scalable;
    }
    onHoverEnter(controller) {
        this.hoveringControllers.add(controller);
        if (this.platform) {
            this.platform.opacity.speed = this.platformAnimationSpeed;
        }
    }
    onHoverExit(controller) {
        this.hoveringControllers.delete(controller);
        if (this.platform && this.hoveringControllers.size == 0) {
            this.platform.opacity.speed = -this.platformAnimationSpeed;
        }
    }
    /**
     * {@inheritDoc}
     */
    raycast(raycaster, intersects) {
        const content = this.gltfMesh?.scene ?? this.splatMesh;
        if (this.raycastToChildren && content) {
            const childRaycasts = [];
            for (const child of this.children) {
                if (child != this.rotationRaycastMesh &&
                    child != this.platform &&
                    child != this.controlBar) {
                    raycaster.intersectObject(child, true, childRaycasts);
                }
            }
            intersects.push(...childRaycasts);
        }
        if (this.rotationRaycastMesh) {
            const rotationIntersects = [];
            this.rotationRaycastMesh.raycast(raycaster, rotationIntersects);
            for (const intersect of rotationIntersects) {
                intersects.push(intersect);
            }
        }
        if (this.platform) {
            const platformIntersects = [];
            this.platform.raycast(raycaster, platformIntersects);
            for (const intersect of platformIntersects) {
                intersects.push(intersect);
            }
        }
        if (this.controlBar != null && this.controlBar.parent == this) {
            const controlButtonIntersects = [];
            this.controlBar.raycast(raycaster, controlButtonIntersects);
            for (const intersect of controlButtonIntersects) {
                intersects.push(intersect);
            }
        }
        return false;
    }
    onScaleButtonClick() {
        this.scale.setScalar(1.0);
    }
    setCastShadow(castShadow) {
        this.castShadow = castShadow;
        if (this.gltfMesh) {
            this.gltfMesh.scene.traverse(function (child) {
                child.castShadow = castShadow;
            });
        }
        if (this.platform) {
            this.platform.castShadow = false;
        }
    }
    setReceiveShadow(receiveShadow) {
        this.receiveShadow = receiveShadow;
        if (this.gltfMesh) {
            this.gltfMesh.scene.traverse(function (child) {
                child.receiveShadow = receiveShadow;
            });
        }
        if (this.platform) {
            this.platform.receiveShadow = receiveShadow;
        }
    }
    getOcclusionEnabled() {
        for (const shader of this.occludableShaders) {
            return shader.uniforms.occlusionEnabled.value;
        }
        return false;
    }
    setOcclusionEnabled(enabled) {
        for (const shader of this.occludableShaders) {
            shader.uniforms.occlusionEnabled.value = enabled;
        }
    }
    playClipAnimationOnce() {
        if (this.startAnimationOnLoad || this.clipActions.length === 0) {
            return;
        }
        this.clipActions.forEach((clip) => {
            clip.reset();
            clip.clampWhenFinished = true;
            clip.loop = THREE.LoopOnce;
            clip.play();
        });
    }
    async createSparkRendererIfNeeded() {
        // We insert our own SparkRenderer configured to show Gaussians up to
        // Math.sqrt(4) standard deviations from the center, recommended for XR.
        const { SparkRenderer } = await import('@sparkjsdev/spark');
        let sparkRendererExists = false;
        this.scene.traverse((child) => {
            sparkRendererExists ||= child instanceof SparkRenderer;
        });
        if (!sparkRendererExists) {
            const sparkRenderer = new SparkRenderer({
                renderer: this.renderer,
                maxStdDev: Math.sqrt(4),
            });
            this.registry.register(new SparkRendererHolder(sparkRenderer));
            this.scene.add(sparkRenderer);
        }
    }
}

// Fork of HTMLMesh.js from three.js.
/**
 * A `View` that functions as a drawable canvas in 3D space. It uses
 * an HTML canvas as a texture on a plane, allowing users to draw on its surface
 * with their XR controllers. It supports basic drawing, undo, and redo
 * functionality.
 */
class SketchPanel extends View {
    static { this.dependencies = { user: User }; }
    constructor() {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        // Draw something on the canvas
        const ctx = canvas.getContext('2d');
        const texture = new THREE.CanvasTexture(canvas);
        const geometry = new THREE.PlaneGeometry(canvas.width * 0.001, canvas.height * 0.001);
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            toneMapped: false,
            alphaTest: 0.01,
        });
        super({}, geometry, material);
        this.activeHand = -1;
        this.activeLine = [];
        this.activeLines = [];
        this.removedLines = [];
        this.isDrawing = false;
        this.canvas = canvas;
        this.ctx = ctx;
        this.material = material;
        // view options
        this.width = canvas.width * 0.001;
        this.height = canvas.height * 0.001;
        this.scale.set(this.width, this.height, 1);
    }
    /**
     * Init the SketchPanel.
     */
    init({ user }) {
        super.init();
        this.user = user;
        this.clearCanvas();
    }
    getContext() {
        return this.ctx;
    }
    triggerUpdate() {
        this.material.map.needsUpdate = true;
    }
    onSelectStart(event) {
        if (this.activeHand !== -1) {
            // do nothing, drawing is in progress
            return;
        }
        this.activeHand = event?.target?.userData?.id ?? -1;
        if (this.activeHand === 0 || this.activeHand === 1) {
            this.activeLine = [];
            this.ctx.beginPath();
        }
    }
    onSelectEnd(event) {
        const id = event?.target?.userData?.id ?? -1;
        // check if user released an active hand
        if (id === this.activeHand) {
            // line could be empty, or contain select start only
            if (this.activeHand >= 0 && this.activeLine.length > 1) {
                this.activeLines.push(this.activeLine);
                // Added a new line, no more option for re-do
                this.removedLines = [];
            }
            this.isDrawing = false;
            this.activeLine = [];
            this.activeHand = -1;
        }
    }
    /**
     * Updates the painter's line to the current pivot position during selection.
     */
    onSelecting(event) {
        const id = event.target.userData.id;
        if (id !== this.activeHand) {
            return;
        }
        const data = this.user.getReticleIntersection(id);
        if (data) {
            if (data.object instanceof SketchPanel && data.uv) {
                const x = Math.round(data.uv.x * 1024);
                const y = Math.round(1024 - data.uv.y * 1024);
                const ctx = this.ctx;
                if (this.isDrawing) {
                    ctx.lineTo(x, y);
                    ctx.strokeStyle = 'black';
                    ctx.lineWidth = 6; // You can adjust the line width here
                    ctx.stroke();
                    this.triggerUpdate();
                    this.activeLine.push({ x, y });
                }
                else {
                    this.activeLine.push({ x, y, b: true });
                    ctx.moveTo(x, y);
                    this.isDrawing = true;
                }
            }
            else {
                // pointer exit from the SketchPanel
                this.isDrawing = false;
            }
        }
        else {
            // no plane at the pointer
            this.isDrawing = false;
        }
    }
    clearCanvas(forceUpdate = true) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height); // Fill the entire canvas
        if (forceUpdate) {
            this.triggerUpdate();
        }
    }
    removeAll() {
        this.activeLines = [];
        this.removedLines = [];
        this.clearCanvas();
    }
    undo() {
        if (this.activeLines.length === 0) {
            return;
        }
        this.ctx = this.canvas.getContext('2d');
        const line = this.activeLines.pop();
        this.removedLines.push(line);
        this.clearCanvas(false);
        this.activeLines.forEach((line) => {
            this.#drawLine(line);
        });
        this.triggerUpdate();
    }
    redo() {
        if (this.removedLines.length === 0) {
            return;
        }
        const line = this.removedLines.pop();
        this.activeLines.push(line);
        this.#drawLine(line);
        this.triggerUpdate();
    }
    #drawLine(line) {
        // common context options
        this.ctx.beginPath();
        this.ctx.strokeStyle = 'black';
        this.ctx.lineWidth = 6;
        line.forEach((point) => {
            if (point.b) {
                this.ctx.moveTo(point.x, point.y);
            }
            else {
                this.ctx.lineTo(point.x, point.y);
                this.ctx.stroke();
            }
        });
    }
    update() {
        //  empty
    }
}

/**
 * A specialized `Pager` that arranges its pages horizontally and
 * enables horizontal swiping gestures for navigation. It clips content that
 * is outside the viewable area.
 */
class HorizontalPager extends Pager {
    constructor() {
        super(...arguments);
        this.localClippingPlanes = [
            new THREE.Plane(new THREE.Vector3(1, 0, 0), 0.5),
            new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0.5),
        ];
    }
    updateLayout() {
        super.updateLayout();
        this.localClippingPlanes[0].constant = 0.5 * this.rangeX;
        this.localClippingPlanes[1].constant = 0.5 * this.rangeX;
    }
}

/**
 * A UI component that visually displays the current page and total
 * number of pages for a `Pager`. It typically renders as a series of dots
 * (e.g., "◦ ● ◦") to indicate the user's position in a carousel.
 */
class PageIndicator extends TextView {
    constructor({ pagerState }) {
        super({
            text: '',
        });
        this.emptyPageIndicator = '◦';
        this.currentPageIndicator = '•';
        this.numberOfPages = 0;
        this.previousPage = 0;
        this.pagerState = pagerState;
        this.previousPage = Math.round(pagerState.currentPage);
        this.numberOfPages = pagerState.pages;
        this.updateText();
    }
    update() {
        super.update();
        const currentPage = Math.round(this.pagerState.currentPage);
        if (this.previousPage !== currentPage ||
            this.numberOfPages !== this.pagerState.pages) {
            this.updateText();
        }
    }
    updateText() {
        const currentPage = Math.round(this.pagerState.currentPage) % this.pagerState.pages;
        const text = new Array(this.pagerState.pages).fill(this.emptyPageIndicator);
        text[currentPage] = this.currentPageIndicator;
        this.setText(text.join(''));
        this.previousPage = currentPage;
    }
}

/**
 * VideoFileStream handles video playback from a file source.
 */
class VideoFileStream extends VideoStream {
    /**
     * @param options - Configuration for the file stream.
     */
    constructor({ videoFile = undefined, willCaptureFrequently = false } = {}) {
        super({ willCaptureFrequently });
        this.videoFile_ = videoFile;
    }
    /**
     * Initializes the file stream based on the given video file.
     */
    async init() {
        await super.init();
        if (this.videoFile_) {
            this.setState_(StreamState.INITIALIZING);
            await this.initStream_();
        }
        else {
            console.warn('VideoFileStream initialized without a video file.');
            this.setState_(StreamState.IDLE);
        }
    }
    /**
     * Initializes the video stream from the provided file.
     */
    async initStream_() {
        if (!this.videoFile_) {
            throw new Error('No video file has been provided.');
        }
        this.stop_();
        this.video_.srcObject = null;
        this.video_.src =
            typeof this.videoFile_ === 'string'
                ? this.videoFile_
                : URL.createObjectURL(this.videoFile_);
        this.video_.loop = true;
        this.video_.muted = true;
        await new Promise((resolve, reject) => {
            this.video_.onloadedmetadata = () => {
                this.handleVideoStreamLoadedMetadata(resolve, reject);
            };
            this.video_.onerror = () => {
                const error = new Error('Error occurred while loading the video file.');
                this.setState_(StreamState.ERROR, { error });
                reject(error);
            };
            this.video_.play();
        });
        // After metadata is loaded, set the final STREAMING state
        this.setState_(StreamState.STREAMING, {
            width: this.width,
            height: this.height,
            aspectRatio: this.aspectRatio,
            videoFile: this.videoFile_,
        });
    }
    /**
     * Sets a new video file source and re-initializes the stream.
     * @param videoFile - The new video file to play.
     */
    async setSource(videoFile) {
        if (!videoFile) {
            console.warn('setSource called with no file. Stopping stream.');
            this.stop_();
            this.videoFile_ = undefined;
            return;
        }
        this.setState_(StreamState.INITIALIZING);
        this.videoFile_ = videoFile;
        await this.initStream_();
    }
}

export { AI, AIOptions, AVERAGE_IPD_METERS, ActiveControllers, Agent, AnimatableNumber, AudioListener, AudioPlayer, BACK, BackgroundMusic, CategoryVolumes, Col, Core, CoreSound, DEFAULT_DEVICE_CAMERA_HEIGHT, DEFAULT_DEVICE_CAMERA_WIDTH, DEFAULT_RGB_TO_DEPTH_PARAMS, DEVICE_CAMERA_PARAMETERS, DOWN, Depth, DepthMesh, DepthMeshOptions, DepthOptions, DepthTextures, DetectedObject, DetectedPlane, DeviceCameraOptions, DragManager, DragMode, ExitButton, FORWARD, FreestandingSlider, GEMINI_DEFAULT_FLASH_MODEL, GEMINI_DEFAULT_LIVE_MODEL, GamepadBindings, GamepadController, GazeController, Gemini, GeminiOptions, GenerateSkyboxTool, GestureRecognition, GestureRecognitionOptions, GetWeatherTool, Grid, HAND_BONE_IDX_CONNECTION_MAP, HAND_JOINT_COUNT, HAND_JOINT_IDX_CONNECTION_MAP, HAND_JOINT_NAMES, Handedness, Hands, HandsOptions, HorizontalPager, IconButton, IconView, ImageView, Input, InputOptions, Keycodes, LEFT, LEFT_VIEW_ONLY_LAYER, LabelView, Lighting, LightingOptions, LoadingSpinnerManager, MaterialSymbolsView, MeshScript, ModelLoader, ModelViewer, MouseController, NUM_HANDS, OCCLUDABLE_ITEMS_LAYER, ObjectDetector, ObjectsOptions, OcclusionPass, OcclusionUtils, OpenAI, OpenAIOptions, Options, PageIndicator, Pager, PagerState, Panel, PanelMesh, Physics, PhysicsOptions, PinchOnButtonAction, PlaneDetector, PlanesOptions, RIGHT, RIGHT_VIEW_ONLY_LAYER, Raycaster, Registry, Reticle, ReticleOptions, Reticles, RotationRaycastMesh, Row, SIMULATOR_HAND_POSE_NAMES, SIMULATOR_HAND_POSE_TO_JOINTS_LEFT, SIMULATOR_HAND_POSE_TO_JOINTS_RIGHT, SOUND_PRESETS, ScreenshotSynthesizer, Script, ScriptMixin, ScriptsManager, ScrollingTroikaTextView, SetSimulatorEnvironmentEvent, SetSimulatorModeEvent, ShowHandsAction, Simulator, SimulatorCamera, SimulatorControlMode, SimulatorControllerState, SimulatorControls, SimulatorDepth, SimulatorDepthMaterial, SimulatorHandPose, SimulatorHandPoseChangeRequestEvent, SimulatorHands, SimulatorInterface, SimulatorMediaDeviceInfo, SimulatorMode, SimulatorOptions, SimulatorRenderMode, SimulatorScene, SimulatorUser, SimulatorUserAction, SketchPanel, SkyboxAgent, SoundOptions, SoundSynthesizer, SparkRendererHolder, SpatialAudio, SpatialPanel, SpeechRecognizer, SpeechRecognizerOptions, SpeechSynthesizer, SpeechSynthesizerOptions, SplatAnchor, StreamState, TextButton, TextScrollerState, TextView, Tool, UI, UI_OVERLAY_LAYER, UP, UX, User, VIEW_DEPTH_GAP, VerticalPager, VideoFileStream, VideoStream, VideoView, View, VolumeCategory, WaitFrame, WalkTowardsPanelAction, World, WorldOptions, XRButton, XRDeviceCamera, XREffects, XRPass, XRTransitionOptions, XR_BLOCKS_ASSETS_PATH, ZERO_VECTOR3, add, ai, callInitWithDependencyInjection, camera, clamp, clampRotationToAngle, core, cropImage, depth, extractYaw, getCameraParametersSnapshot, getColorHex, getDeltaTime, getDeviceCameraClipFromView, getDeviceCameraWorldFromClip, getDeviceCameraWorldFromView, getElapsedTime, getUrlParamBool, getUrlParamFloat, getUrlParamInt, getUrlParameter, getVec4ByColorString, getXrCameraLeft, getXrCameraRight, init, initScript, input, intrinsicsToProjectionMatrix, lerp, loadStereoImageAsTextures, loadingSpinnerManager, lookAtRotation, objectIsDescendantOf, parseBase64DataURL, placeObjectAtIntersectionFacingTarget, print, scene, showOnlyInLeftEye, showOnlyInRightEye, showReticleOnDepthMesh, sound, timer, transformRgbUvToWorld, traverseUtil, uninitScript, urlParams, user, world, xrDepthMeshOptions, xrDepthMeshPhysicsOptions, xrDepthMeshVisualizationOptions, xrDeviceCameraEnvironmentContinuousOptions, xrDeviceCameraEnvironmentOptions, xrDeviceCameraUserContinuousOptions, xrDeviceCameraUserOptions };
//# sourceMappingURL=xrblocks.js.map
