import * as THREE from 'three';

import {Script} from '../core/Script.js';

import {CategoryVolumes} from './CategoryVolumes.js';

const spatialSoundLibrary = {
  'ambient': 'musicLibrary/AmbientLoop.opus',
  'buttonHover': 'musicLibrary/ButtonHover.opus',
  'paintOneShot1': 'musicLibrary/PaintOneShot1.opus',
} as const;

let soundIdCounter = 0;

export interface PlaySoundOptions {
  loop?: boolean;
  volume?: number;
  refDistance?: number;
  rolloffFactor?: number;
  onEnded?: () => void;
}

interface ActiveSound {
  audio: THREE.PositionalAudio;
  target: THREE.Object3D;
  options: PlaySoundOptions;
}

export class SpatialAudio extends Script {
  private audioLoader = new THREE.AudioLoader();
  private soundLibrary = spatialSoundLibrary;
  // Stores { audio: PositionalAudio, target: Object3D } by id
  private activeSounds = new Map<number, ActiveSound>();

  private specificVolume = 1.0;
  private category = 'sfx' as const;
  private defaultRefDistance = 1;
  private defaultRolloffFactor = 1;

  constructor(
      private listener: THREE.AudioListener,
      private categoryVolumes: CategoryVolumes) {
    super();
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
  playSoundAtObject(
      soundKey: keyof typeof spatialSoundLibrary, targetObject: THREE.Object3D,
      options: PlaySoundOptions = {}) {
    if (!this.listener || !this.audioLoader || !targetObject) {
      console.error(
          'SpatialAudio not properly initialized or targetObject missing.');
      return null;
    }

    const soundPath = this.soundLibrary[soundKey];
    if (!soundPath) {
      console.error(`SpatialAudio: Sound key "${soundKey}" not found.`);
      return null;
    }

    const soundId = ++soundIdCounter;
    const specificVolume =
        options.volume !== undefined ? options.volume : this.specificVolume;
    const loop = options.loop || false;
    const refDistance = options.refDistance !== undefined ?
        options.refDistance :
        this.defaultRefDistance;
    const rolloffFactor = options.rolloffFactor !== undefined ?
        options.rolloffFactor :
        this.defaultRolloffFactor;

    console.log(`SpatialAudio: Loading sound "${soundKey}" (${soundPath})`);

    this.audioLoader.load(
        soundPath,
        (buffer) => {
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

          const effectiveVolume = this.categoryVolumes.getEffectiveVolume(
              this.category, specificVolume);
          audio.setVolume(effectiveVolume);

          targetObject.add(audio);
          this.activeSounds.set(
              soundId, {audio: audio, target: targetObject, options: options});

          // Set up cleanup for non-looping sounds
          if (!loop) {
            audio.onEnded = () => {
              console.log(
                  `SpatialAudio: Sound "${soundKey}" (ID: ${soundId}) ended.`);
              this._cleanupSound(soundId);
              if (options.onEnded && typeof options.onEnded === 'function') {
                options.onEnded();
              }
              // Important: Clear the onEnded handler after it runs once
              // to prevent issues if the object is reused.
              audio.onEnded = () => {};
            };
          }

          audio.play();
          console.log(
              `SpatialAudio: Playing "${soundKey}" (ID: ${soundId}) at object ${
                  targetObject.name ||
                  targetObject.uuid}, Volume: ${effectiveVolume}`);
        },
        (xhr) => {
          console.log(`SpatialAudio: Loading "${soundKey}" - ${
              (xhr.loaded / xhr.total * 100).toFixed(0)}% loaded`);
        },
        (error) => {
          console.error(
              `SpatialAudio: Error loading sound "${soundKey}":`, error);
          this.activeSounds.delete(soundId);  // Clean up if loading failed
        });

    return soundId;
  }

  /**
   * Stops a specific sound instance by its ID.
   * @param soundId - The ID returned by playSoundAtObject.
   */
  stopSound(soundId: number) {
    const soundData = this.activeSounds.get(soundId);
    if (soundData) {
      console.log(`SpatialAudio: Stopping sound ID: ${soundId}`);
      if (soundData.audio.isPlaying) {
        soundData.audio.stop();
      }
      this._cleanupSound(soundId);
    } else {
      console.warn(`SpatialAudio: Sound ID ${soundId} not found for stopping.`);
    }
  }

  /**
   * Internal method to remove sound from object and map.
   * @param soundId - id
   */
  private _cleanupSound(soundId: number) {
    const soundData = this.activeSounds.get(soundId);
    if (soundData) {
      if (soundData.audio.isPlaying) {
        try {
          soundData.audio.stop();
        } catch {
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
  setVolume(level: number) {
    this.specificVolume = THREE.MathUtils.clamp(level, 0.0, 1.0);
    console.log(
        `SpatialAudio default specific volume set to: ${this.specificVolume}`);
  }

  /**
   * Updates the volume of all currently playing spatial sounds managed by this
   * instance.
   */
  updateAllVolumes() {
    if (!this.categoryVolumes) return;
    console.log(`SpatialAudio: Updating volumes for ${
        this.activeSounds.size} active sounds.`);
    this.activeSounds.forEach((soundData) => {
      const specificVolume = soundData.options.volume !== undefined ?
          soundData.options.volume :
          this.specificVolume;
      const effectiveVolume = this.categoryVolumes.getEffectiveVolume(
          this.category, specificVolume);
      soundData.audio.setVolume(effectiveVolume);
    });
  }

  destroy() {
    console.log('SpatialAudio Destroying...');
    const idsToStop = Array.from(this.activeSounds.keys());
    idsToStop.forEach(id => this.stopSound(id));

    this.activeSounds.clear();
    console.log('SpatialAudio Destroyed.');
  }
}
