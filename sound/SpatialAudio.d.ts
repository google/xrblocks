import * as THREE from 'three';
import { Script } from '../core/Script.js';
import { CategoryVolumes } from './CategoryVolumes.js';
declare const spatialSoundLibrary: {
    readonly ambient: "musicLibrary/AmbientLoop.opus";
    readonly buttonHover: "musicLibrary/ButtonHover.opus";
    readonly paintOneShot1: "musicLibrary/PaintOneShot1.opus";
};
export interface PlaySoundOptions {
    loop?: boolean;
    volume?: number;
    refDistance?: number;
    rolloffFactor?: number;
    onEnded?: () => void;
}
export declare class SpatialAudio extends Script {
    private listener;
    private categoryVolumes;
    private audioLoader;
    private soundLibrary;
    private activeSounds;
    private specificVolume;
    private category;
    private defaultRefDistance;
    private defaultRolloffFactor;
    constructor(listener: THREE.AudioListener, categoryVolumes: CategoryVolumes);
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
    playSoundAtObject(soundKey: keyof typeof spatialSoundLibrary, targetObject: THREE.Object3D, options?: PlaySoundOptions): number | null;
    /**
     * Stops a specific sound instance by its ID.
     * @param soundId - The ID returned by playSoundAtObject.
     */
    stopSound(soundId: number): void;
    /**
     * Internal method to remove sound from object and map.
     * @param soundId - id
     */
    private _cleanupSound;
    /**
     * Sets the base specific volume for subsequently played spatial sounds.
     * Does NOT affect currently playing sounds (use updateAllVolumes for that).
     * @param level - Volume level (0.0 to 1.0).
     */
    setVolume(level: number): void;
    /**
     * Updates the volume of all currently playing spatial sounds managed by this
     * instance.
     */
    updateAllVolumes(): void;
    destroy(): void;
}
export {};
