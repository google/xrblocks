import * as xb from "xrblocks";
//#region src/addons/ai/GeminiManager.ts
var GeminiManager = class extends xb.Script {
	constructor() {
		super();
		this.isAIRunning = false;
		this.currentInputText = "";
		this.currentOutputText = "";
		this.tools = [];
		this.cameraMimeType = "image/jpeg";
		this.cameraQuality = .8;
		this.captureMode = "camera";
		this.overlayScreenshotOnCamera = true;
	}
	init() {
		this.xrDeviceCamera = xb.core.deviceCamera;
		this.ai = xb.core.ai;
	}
	async startGeminiLive({ liveParams, model, tools, captureMode, overlayOnCamera, camera } = {}) {
		if (this.isAIRunning || !this.ai) {
			console.warn("AI already running or not available");
			return;
		}
		if (tools) this.tools = tools;
		if (captureMode) this.captureMode = captureMode;
		if (overlayOnCamera !== void 0) this.overlayScreenshotOnCamera = overlayOnCamera;
		if (camera?.quality !== void 0) this.cameraQuality = camera.quality;
		if (camera?.width !== void 0) this.cameraWidth = camera.width;
		if (camera?.height !== void 0) this.cameraHeight = camera.height;
		const intervalMs = camera?.fps ? Math.max(1, Math.round(1e3 / camera.fps)) : 1e3;
		liveParams = liveParams || {};
		liveParams.tools = liveParams.tools || [];
		liveParams.tools.push({ functionDeclarations: this.tools.map((tool) => tool.toJSON()) });
		try {
			await xb.core.sound.enableAudio();
			await this.startLiveAI(liveParams, model);
			this.startScreenshotCapture(intervalMs);
			this.isAIRunning = true;
		} catch (error) {
			console.error("Failed to start Gemini Live:", error);
			this.cleanup();
			throw error;
		}
	}
	async stopGeminiLive() {
		if (!this.isAIRunning) return;
		try {
			if (this.ai && this.ai.stopLiveSession) await this.ai.stopLiveSession();
			this.cleanup();
			this.isAIRunning = false;
			this.currentInputText = "";
			this.currentOutputText = "";
		} catch (error) {
			console.error("Failed to stop Gemini Live:", error);
		}
	}
	async startLiveAI(params, model) {
		return new Promise((resolve, reject) => {
			let opened = false;
			this.ai.setLiveCallbacks({
				onopen: () => {
					opened = true;
					resolve();
				},
				onmessage: (message) => {
					this.handleAIMessage(message);
				},
				onerror: (error) => {
					console.error("Live AI error:", error);
					reject(error);
				},
				onclose: () => {
					this.isAIRunning = false;
					this.cleanup();
					this.dispatchEvent({ type: "close" });
					if (!opened) reject(/* @__PURE__ */ new Error("Live session closed before it opened"));
				}
			});
			this.ai.startLiveSession(params, model).catch(reject);
		});
	}
	startScreenshotCapture(intervalMs = 1e3) {
		if (this.screenshotInterval) {
			console.error("Screenshot interval already running");
			return;
		}
		this.screenshotInterval = setInterval(() => {
			this.captureAndSendScreenshot();
		}, intervalMs);
	}
	async captureAndSendScreenshot() {
		try {
			const base64Image = this.captureMode === "camera" ? await this.xrDeviceCamera.getSnapshot({
				outputFormat: "base64",
				mimeType: this.cameraMimeType,
				quality: this.cameraQuality,
				...this.cameraWidth ? { width: this.cameraWidth } : {},
				...this.cameraHeight ? { height: this.cameraHeight } : {}
			}) : await xb.core.screenshotSynthesizer.getScreenshot(this.overlayScreenshotOnCamera);
			if (typeof base64Image == "string") {
				let mimeType = this.cameraMimeType;
				let base64Data = base64Image;
				if (base64Image.startsWith("data:")) {
					const match = base64Image.match(/^data:([^;,]+)[^,]*,(.*)$/s);
					if (match) {
						mimeType = match[1];
						base64Data = match[2];
					} else base64Data = base64Image.split(",")[1];
				}
				this.sendVideoFrame(base64Data, mimeType);
			}
		} catch (error) {
			console.error("Failed to capture frame:", error);
		}
	}
	sendVideoFrame(base64Image, mimeType = this.cameraMimeType) {
		if (!this.isAIRunning || !this.ai || !this.ai.sendRealtimeInput) throw new Error("AI not ready to send video frame");
		try {
			this.ai.sendRealtimeInput({ video: {
				data: base64Image,
				mimeType
			} });
		} catch (error) {
			console.error("❌ Failed to send video frame:", error);
			console.error("Error stack:", error.stack);
		}
	}
	cleanup() {
		xb.core.sound.disableAudio();
		xb.core.sound.stopAIAudio();
		if (this.screenshotInterval) {
			clearInterval(this.screenshotInterval);
			this.screenshotInterval = void 0;
		}
	}
	handleAIMessage(message) {
		if (message.data) xb.core.sound.playAIAudio(message.data);
		for (const functionCall of message.toolCall?.functionCalls ?? []) {
			const tool = this.tools.find((tool) => tool.name == functionCall.name);
			if (tool) tool.execute(functionCall.args).then((result) => {
				this.ai.sendToolResponse({ functionResponses: {
					id: functionCall.id,
					name: functionCall.name,
					response: {
						output: result.data,
						error: result.error,
						...result.metadata
					}
				} });
			}).catch((error) => console.error("Tool error:", error));
		}
		if (message.serverContent) {
			if (message.serverContent.inputTranscription) {
				const text = message.serverContent.inputTranscription.text;
				if (text) this.dispatchEvent({
					type: "inputTranscription",
					message: text
				});
			}
			if (message.serverContent.outputTranscription) {
				const text = message.serverContent.outputTranscription.text;
				if (text) this.dispatchEvent({
					type: "outputTranscription",
					message: text
				});
			}
			if (message.serverContent.interrupted) {
				xb.core.sound.stopAIAudio();
				this.dispatchEvent({ type: "interrupted" });
			}
			if (message.serverContent.turnComplete) this.dispatchEvent({ type: "turnComplete" });
		}
	}
	dispose() {
		this.cleanup();
		super.dispose();
	}
};
//#endregion
export { GeminiManager };
