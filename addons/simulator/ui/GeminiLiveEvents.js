class MicButtonPressedEvent extends Event {
    static { this.type = 'micButtonPressedEvent'; }
    constructor() {
        super(MicButtonPressedEvent.type, { bubbles: true, composed: true });
    }
}
class ApiKeyEnteredEvent extends Event {
    static { this.type = 'apiKeyEntered'; }
    constructor(apikey) {
        super(ApiKeyEnteredEvent.type, { bubbles: true, composed: true });
        this.apiKey = apikey;
    }
}

export { ApiKeyEnteredEvent, MicButtonPressedEvent };
