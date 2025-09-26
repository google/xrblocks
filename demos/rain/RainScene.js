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

  init() {
    this.add(this.rainParticles);
    this.rainParticles.init();
    this.add(this.cloud);

    this.listener = new THREE.AudioListener();
    xb.core.camera.add(this.listener);

    this.rainSound = new THREE.Audio(this.listener);
    const audioLoader = new THREE.AudioLoader();
    audioLoader.load(
      ASSETS_PATH + 'demos/rain/rain.opus',
      (buffer) => {
        this.rainSound.setBuffer(buffer);
        this.rainSound.setLoop(true); // Loop the sound for continuous rain
        this.rainSound.setVolume(0.5); // Set a comfortable volume
        this.rainSound.play(); // Start playback
        console.log('Rain audio loaded and playing.');
      },
    );

    const startButton = document.getElementById('startButton');
    if (startButton) {
      startButton.addEventListener('click', () => {
        this.startAudio();
        startButton.remove(); // Remove the button after use
      });
    }
  }

  startAudio() {
    if (this.listener.context.state === 'suspended') {
        this.listener.context.resume();
    }
    
    if (this.rainSound.buffer) {
        this.rainSound.play(); 
        console.log('Rain audio started by user gesture.');
    }
  }

  update() {
    const leftCamera = xb.getXrCameraLeft() || xb.core.camera;
    this.rainParticles.update(leftCamera, xb.core.depth);
    this.cloud.update(xb.core.camera, xb.core.depth);
  }
}