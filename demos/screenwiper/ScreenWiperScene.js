import * as THREE from 'three';
import * as xb from 'xrblocks';

import {ScreenWiper} from './ScreenWiper.js';

export class ScreenWiperScene extends xb.Script {
  screenWiper = new ScreenWiper({
    width: 1.0,
    height: 1.0,
    color: new THREE.Color(0x000000),
    speed: 0.5,
    direction: 'right',
    start: 0.0,
    end: 1.0,
  });

  constructor(opts) {
    super(opts);
    this.add(this.screenWiper);
  }

  init() {
    this.screenWiper.clear(xb.core.renderer);
  }

  onSelectStart(event) {
    this.screenWiper.addActiveController(event.target);
  }

  onSelectEnd(event) {
    this.screenWiper.removeActiveController(event.target);
  }

  update() {
    this.screenWiper.update(xb.core.renderer);
  }
}