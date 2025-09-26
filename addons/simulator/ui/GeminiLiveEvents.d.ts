export declare class MicButtonPressedEvent extends Event {
    static type: string;
    constructor();
}
export declare class ApiKeyEnteredEvent extends Event {
    static type: string;
    apiKey: string;
    constructor(apikey: string);
}
