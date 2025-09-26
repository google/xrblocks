import * as THREE from 'three';

import {View} from '../core/View';

/**
 * A View that displays text on a canvas and supports smooth
 * scrolling when new content is added. This component is designed as a
 * performant fallback for displaying simple, multi-line text (like logs or
 * chat messages) when advanced SDF text rendering is not needed or available.
 * It operates its own render loop using `requestAnimationFrame` to update the
 * canvas texture.
 */
export class ScrollingTextView extends View {
  options: {
    width: number,
    height: number,
    maxLines: number,
    fontSize: number,
    lineHeight: number,
    font: string,
    fillStyle: string,
    scrollingSpeed: number,
  };
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

  private lines: string[] = [];
  private startLineId = 0;
  private currentDeltaY = 0;
  private targetDeltaY = 0;
  private isResetting = false;

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(options = {}) {
    super(options);

    this.options = Object.assign(
        {
          width: 1,
          height: 1,
          maxLines: 5,
          fontSize: 0.05,
          lineHeight: 0.1,
          font: 'monospace',
          fillStyle: 'white',
          scrollingSpeed: 0.1,
        },
        options);

    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;

    const planeGeometry =
        new THREE.PlaneGeometry(this.options.width, this.options.height);
    const texture = new THREE.CanvasTexture(this.canvas);
    const planeMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
    });

    this.mesh = new THREE.Mesh(planeGeometry, planeMaterial);
    this.add(this.mesh);

    this.renderText();
  }

  getLines(text: string, maxWidth: number) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = words[0] || '';

    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      const width = this.ctx.measureText(currentLine + ' ' + word).width;
      if (width < maxWidth) {
        currentLine += ' ' + word;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    lines.push(currentLine);
    return lines;
  }

  addText(text: string) {
    const resolution = this.canvas.height / this.options.height;
    const newLines = this.getLines(text, this.canvas.width);
    this.lines.push(...newLines);

    if (this.lines.length > this.options.maxLines) {
      const newStartLineId = this.lines.length - this.options.maxLines;
      if (newStartLineId > this.startLineId) {
        if (this.isResetting) {
          this.isResetting = false;
        }

        // Calculate how much we need to scroll up to show new lines
        const linesToScroll = newStartLineId - this.startLineId;
        this.targetDeltaY = this.currentDeltaY +
            linesToScroll * this.options.lineHeight * resolution;
        this.startLineId = newStartLineId;
      }
    }
  }

  clear() {
    this.lines = [];
    this.startLineId = 0;
    this.currentDeltaY = 0;
    this.targetDeltaY = 0;
    this.isResetting = false;
    return this;
  }

  renderText() {
    requestAnimationFrame(this.renderText.bind(this));

    const canvas = this.canvas;
    const resolution = 256;
    const canvasWidth = this.options.width * resolution;
    const canvasHeight = this.options.height * resolution;

    if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
    }

    this.ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.ctx.font =
        `${this.options.fontSize * resolution}px ${this.options.font}`;
    this.ctx.fillStyle = this.options.fillStyle;
    this.ctx.textBaseline = 'top';

    this.currentDeltaY +=
        (this.targetDeltaY - this.currentDeltaY) * this.options.scrollingSpeed;

    // Smooth reset mechanism
    if (Math.abs(this.targetDeltaY - this.currentDeltaY) < 0.1) {
      if (!this.isResetting) {
        this.isResetting = true;
        this.targetDeltaY = 0;
      } else if (Math.abs(this.currentDeltaY) < 0.1) {
        this.currentDeltaY = 0;
        this.targetDeltaY = 0;
        this.isResetting = false;
      }
    }

    for (let i = this.startLineId; i < this.lines.length; i++) {
      const line = this.lines[i];
      const baseY =
          (i - this.startLineId + 1) * this.options.lineHeight * resolution;
      const y = baseY - this.currentDeltaY;
      this.ctx.fillText(line, 10, y);
    }

    this.mesh.material.map!.needsUpdate = true;
  }
}
