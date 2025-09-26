import { WebXRSessionManager } from './WebXRSessionManager';
export declare class XRButton {
    private sessionManager;
    private startText;
    private endText;
    private invalidText;
    private startSimulatorText;
    startSimulator: () => void;
    domElement: HTMLDivElement;
    simulatorButtonElement: HTMLButtonElement;
    xrButtonElement: HTMLButtonElement;
    constructor(sessionManager: WebXRSessionManager, startText?: string, endText?: string, invalidText?: string, startSimulatorText?: string, enableSimulator?: boolean, showSimulatorButtonOnMobile?: boolean, startSimulator?: () => void);
    private createSimulatorButton;
    private createXRButtonElement;
    private onSessionReady;
    private showXRNotSupported;
    private onSessionStarted;
    private onSessionEnded;
}
