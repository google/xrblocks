import * as xb from 'xrblocks';
import * as THREE from 'three';
import {VolumetricCloud} from 'xrblocks/addons/volumes/VolumetricCloud.js';

import {RainParticles} from './RainParticles.js';

const ASSETS_PATH = 'https://cdn.jsdelivr.net/gh/xrblocks/assets@main/';

export class RainScene extends xb.Script {
  rainParticles = new RainParticles();
  cloud = new VolumetricCloud();

  listener = null;
  rainSound = null;
  audioRequested = false;

  init() {
    this.add(this.rainParticles);
    this.rainParticles.init();
    this.add(this.cloud);

    this.listener = new THREE.AudioListener();
    xb.core.camera.add(this.listener);

    this.rainSound = new THREE.Audio(this.listener);
    const audioLoader = new THREE.AudioLoader();
    audioLoader.load(ASSETS_PATH + 'demos/rain/rain.opus', (buffer) => {
      this.rainSound.setBuffer(buffer);
      this.rainSound.setLoop(true);
      this.rainSound.setVolume(0.5);
      if (this.audioRequested) this.startAudio();
    });

    const startButton = document.getElementById('startButton');
    if (startButton) {
      startButton.addEventListener('click', () => {
        this.audioRequested = true;
        this.startAudio();
        document.getElementById('overlay')?.remove();
      });
    }
  }

  startAudio() {
    if (this.listener.context.state === 'suspended') {
      this.listener.context.resume();
    }

    if (this.rainSound.buffer && !this.rainSound.isPlaying) {
      this.rainSound.play();
    }
  }

  update() {
    const leftCamera = xb.getXrCameraLeft() || xb.core.camera;
    this.rainParticles.update(leftCamera, xb.core.depth);
    this.cloud.update(xb.core.camera, xb.core.depth);
  }
}
