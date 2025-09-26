import * as THREE from 'three';

import {XR_BLOCKS_ASSETS_PATH} from '../constants';
import {Script} from '../core/Script';

import {CategoryVolumes} from './CategoryVolumes';

const MUSIC_LIBRARY_PATH = XR_BLOCKS_ASSETS_PATH + 'musicLibrary/';

const musicLibrary = {
  'ambient': MUSIC_LIBRARY_PATH + 'AmbientLoop.opus',
  'background': MUSIC_LIBRARY_PATH + 'BackgroundMusic4.mp3',
  'buttonHover': MUSIC_LIBRARY_PATH + 'ButtonHover.opus',
  'buttonPress': MUSIC_LIBRARY_PATH + 'ButtonPress.opus',
  'menuDismiss': MUSIC_LIBRARY_PATH + 'MenuDismiss.opus'
} as const;

class BackgroundMusic extends Script {
  private audioLoader = new THREE.AudioLoader();

  private currentAudio: THREE.Audio|null = null;
  private isPlaying = false;
  private musicLibrary = musicLibrary;

  private specificVolume = 0.5;
  private musicCategory = 'music';

  constructor(
      private listener: THREE.AudioListener,
      private categoryVolumes: CategoryVolumes) {
    super();
  }

  // Set the volume for this instance of BackgroundMusic
  setVolume(level: number) {
    this.specificVolume = THREE.MathUtils.clamp(level, 0.0, 1.0);
    if (this.currentAudio && this.isPlaying && this.categoryVolumes) {
      const effectiveVolume = this.categoryVolumes.getEffectiveVolume(
          this.musicCategory, this.specificVolume);
      this.currentAudio.setVolume(effectiveVolume);
      console.log(`BackgroundMusic volume updated to: ${
          effectiveVolume} (specific: ${this.specificVolume})`);
    }
  }

  playMusic(musicKey: keyof typeof musicLibrary, category = 'music') {
    if (!this.categoryVolumes || !this.listener || !this.audioLoader) {
      console.error('BackgroundMusic not properly initialized.');
      return;
    }
    const soundPath = this.musicLibrary[musicKey];

    if (!soundPath) {
      console.error(`BackgroundMusic: Music key "${musicKey}" not found.`);
      return;
    }

    this.stopMusic();
    console.log(`BackgroundMusic: Loading sound: ${soundPath}`);
    this.musicCategory = category;

    const listener = this.listener;

    this.audioLoader.load(
        soundPath,
        (buffer) => {
          console.log(`BackgroundMusic: Successfully loaded ${soundPath}`);
          const audio = new THREE.Audio(listener);
          audio.setBuffer(buffer);
          audio.setLoop(
              this.musicCategory === 'music' ||
              this.musicCategory === 'ambient');

          const effectiveVolume = this.categoryVolumes.getEffectiveVolume(
              this.musicCategory, this.specificVolume);
          audio.setVolume(effectiveVolume);
          console.log(`BackgroundMusic: Setting volume for "${musicKey}" to ${
              effectiveVolume}`);

          audio.play();
          this.currentAudio = audio;
          this.isPlaying = true;
          console.log(`BackgroundMusic: Playing "${musicKey}" in category "${
              this.musicCategory}"`);
        },
        (xhr) => {
          console.log(`BackgroundMusic: Loading ${soundPath} - ${
              (xhr.loaded / xhr.total * 100).toFixed(0)}% loaded`);
        },
        (error) => {
          console.error(
              `BackgroundMusic: Error loading sound ${soundPath}:`, error);
          this.currentAudio = null;
          this.isPlaying = false;
        });
  }

  stopMusic() {
    if (this.currentAudio && this.isPlaying) {
      console.log('BackgroundMusic: Stopping current audio.');
      this.currentAudio.stop();
    }
    this.currentAudio = null;
    this.isPlaying = false;
  }

  destroy() {
    console.log('BackgroundMusic Destroying...');
    this.stopMusic();
  }
}

export {BackgroundMusic};
