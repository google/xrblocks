export class MicButtonPressedEvent extends Event {
  static type = 'micButtonPressedEvent';

  constructor() {
    super(MicButtonPressedEvent.type, {bubbles: true, composed: true});
  }
}

export class ApiKeyEnteredEvent extends Event {
  static type = 'apiKeyEntered';
  apiKey: string;

  constructor(apikey: string) {
    super(ApiKeyEnteredEvent.type, {bubbles: true, composed: true});
    this.apiKey = apikey;
  }
}
