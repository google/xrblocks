import * as THREE from 'three';
import * as xb from 'xrblocks';

import {MeasuringTape} from './MeasuringTape.js';

const palette = [0x0f9d58, 0xf4b400, 0x4285f4, 0xdb4437];

export class MeasureScene extends xb.Script {
  activeMeasuringTapes = new Map();
  currentColorIndex = 0;

  init() {
    this.setupLights();
  }

  setupLights() {
    const light = new THREE.DirectionalLight(0xffffff, 2.0);
    light.position.set(0.5, 1, 0.866);
    this.add(light);
    const light2 = new THREE.DirectionalLight(0xffffff, 1.0);
    light2.position.set(-1, 0.5, -0.5);
    this.add(light2);
    const light3 = new THREE.AmbientLight(0x404040, 2.0);
    this.add(light3);
  }

  onSelectStart(event) {
    const controller = event.source.controller;
    const intersection = event.intersection;
    if (!intersection) return;
    if (this.activeMeasuringTapes.has(controller)) {
      this.remove(this.activeMeasuringTapes.get(controller));
    }
    const color = palette[this.currentColorIndex];
    this.currentColorIndex = (this.currentColorIndex + 1) % palette.length;
    const measuringTape = new MeasuringTape(
      intersection.point,
      intersection.point,
      0.05,
      color
    );
    this.add(measuringTape);
    this.activeMeasuringTapes.set(controller, measuringTape);
  }

  onSelecting(event) {
    const tape = this.activeMeasuringTapes.get(event.source.controller);
    if (tape && event.intersection) {
      tape.setSecondPoint(event.intersection.point);
    }
  }

  onSelectEnd(event) {
    const controller = event.source.controller;
    this.activeMeasuringTapes.delete(controller);
  }
}
