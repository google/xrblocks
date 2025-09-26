import * as THREE from 'three';
import { Script } from '../core/Script';
import { CategoryVolumes } from './CategoryVolumes';
declare const musicLibrary: {
    readonly ambient: string;
    readonly background: string;
    readonly buttonHover: string;
    readonly buttonPress: string;
    readonly menuDismiss: string;
};
declare class BackgroundMusic extends Script {
    private listener;
    private categoryVolumes;
    private audioLoader;
    private currentAudio;
    private isPlaying;
    private musicLibrary;
    private specificVolume;
    private musicCategory;
    constructor(listener: THREE.AudioListener, categoryVolumes: CategoryVolumes);
    setVolume(level: number): void;
    playMusic(musicKey: keyof typeof musicLibrary, category?: string): void;
    stopMusic(): void;
    destroy(): void;
}
export { BackgroundMusic };
