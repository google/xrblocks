//#region src/addons/simulator/ui/GeminiLiveEvents.ts
var MicButtonPressedEvent = class MicButtonPressedEvent extends Event {
	static {
		this.type = "micButtonPressedEvent";
	}
	constructor() {
		super(MicButtonPressedEvent.type, {
			bubbles: true,
			composed: true
		});
	}
};
var ApiKeyEnteredEvent = class ApiKeyEnteredEvent extends Event {
	static {
		this.type = "apiKeyEntered";
	}
	constructor(apikey) {
		super(ApiKeyEnteredEvent.type, {
			bubbles: true,
			composed: true
		});
		this.apiKey = apikey;
	}
};
//#endregion
export { ApiKeyEnteredEvent, MicButtonPressedEvent };
