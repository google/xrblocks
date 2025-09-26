import * as THREE from 'three';
import { KeyEvent, Script, SelectEvent } from '../Script';
export declare class ScriptsManager {
    private initScriptFunction;
    /** The set of all currently initialized scripts. */
    scripts: Set<Script<THREE.Object3DEventMap>>;
    callSelectStartBound: (event: SelectEvent) => void;
    callSelectEndBound: (event: SelectEvent) => void;
    callSelectBound: (event: SelectEvent) => void;
    callSqueezeStartBound: (event: SelectEvent) => void;
    callSqueezeEndBound: (event: SelectEvent) => void;
    callSqueezeBound: (event: SelectEvent) => void;
    callKeyDownBound: (event: KeyEvent) => void;
    callKeyUpBound: (event: KeyEvent) => void;
    /** The set of scripts currently being initialized. */
    private initializingScripts;
    constructor(initScriptFunction: (script: Script) => Promise<void>);
    /**
     * Initializes a script and adds it to the set of scripts which will receive
     * callbacks. This will be called automatically by Core when a script is found
     * in the scene but can also be called manually.
     * @param script - The script to initialize
     * @returns A promise which resolves when the script is initialized.
     */
    initScript(script: Script): Promise<void>;
    /**
     * Uninitializes a script calling dispose and removes it from the set of
     * scripts which will receive callbacks.
     * @param script - The script to uninitialize.
     */
    uninitScript(script: Script): void;
    /**
     * Finds all scripts in the scene and initializes them or uninitailizes them.
     * Returns a promise which resolves when all new scripts are finished
     * initalizing.
     * @param scene - The main scene which is used to find scripts.
     */
    syncScriptsWithScene(scene: THREE.Scene): Promise<void>;
    callSelectStart(event: SelectEvent): void;
    callSelectEnd(event: SelectEvent): void;
    callSelect(event: SelectEvent): void;
    callSqueezeStart(event: SelectEvent): void;
    callSqueezeEnd(event: SelectEvent): void;
    callSqueeze(event: SelectEvent): void;
    callKeyDown(event: KeyEvent): void;
    callKeyUp(event: KeyEvent): void;
    onXRSessionStarted(session: XRSession): void;
    onXRSessionEnded(): void;
    onSimulatorStarted(): void;
}
