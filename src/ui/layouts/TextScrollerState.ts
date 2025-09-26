import * as THREE from 'three';
import {Script} from '../../core/Script.js';
import {clamp} from '../../utils/utils.js';

/**
 * Manages the state and animation logic for a scrolling text view.
 * It tracks the total number of lines, the current scroll position (as a line
 * number), and the target line, smoothly animating between them over time.
 */
export class TextScrollerState extends Script {
  static dependencies = {timer: THREE.Timer};
  scrollSpeedLinesPerSecond = 3;
  lines = 1;
  currentLine = 0;
  targetLine = 0;
  shouldUpdate = true;
  timer!: THREE.Timer;
  lineCount = 0;

  init({timer}: {timer: THREE.Timer}) {
    this.timer = timer;
  }

  update() {
    super.update();
    if (!this.shouldUpdate) {
      return false;
    }
    // Simple linear speed scrolling.
    const deltaTime = this.timer.getDelta();
    const deltaLines = this.scrollSpeedLinesPerSecond * deltaTime;
    const distanceToTargetLine = this.targetLine - this.currentLine;
    this.currentLine += clamp(distanceToTargetLine, -deltaLines, deltaLines);
  }
}
