// Fork of HTMLMesh.js from three.js.
import * as THREE from 'three';

import {SelectEvent} from '../../core/Script';
import {User} from '../../core/User';
import {View} from '../core/View';

interface LinePoint {
  x: number;
  y: number;
  b?: boolean;
}

/**
 * A `View` that functions as a drawable canvas in 3D space. It uses
 * an HTML canvas as a texture on a plane, allowing users to draw on its surface
 * with their XR controllers. It supports basic drawing, undo, and redo
 * functionality.
 */
export class SketchPanel extends View {
  static dependencies = {user: User};
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private activeHand = -1;
  private activeLine: LinePoint[] = [];
  private activeLines: LinePoint[][] = [];
  private removedLines: LinePoint[][] = [];
  private isDrawing = false;

  private user!: User;

  material: THREE.MeshBasicMaterial;

  constructor() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;

    // Draw something on the canvas
    const ctx = canvas.getContext('2d')!;
    const texture = new THREE.CanvasTexture(canvas);

    const geometry =
        new THREE.PlaneGeometry(canvas.width * 0.001, canvas.height * 0.001);

    const material = new THREE.MeshBasicMaterial(
        {map: texture, toneMapped: false, alphaTest: 0.01});

    super({}, geometry, material);
    this.canvas = canvas;
    this.ctx = ctx;
    this.material = material;

    // view options
    this.width = canvas.width * 0.001;
    this.height = canvas.height * 0.001;
    this.scale.set(this.width, this.height, 1);
  }

  /**
   * Init the SketchPanel.
   */
  init({user}: {user: User}) {
    super.init();
    this.user = user;

    this.clearCanvas();
  }

  getContext() {
    return this.ctx;
  }

  triggerUpdate() {
    this.material.map!.needsUpdate = true;
  }

  onSelectStart(event: SelectEvent) {
    if (this.activeHand !== -1) {
      // do nothing, drawing is in progress
      return;
    }
    this.activeHand = event?.target?.userData?.id ?? -1;

    if (this.activeHand === 0 || this.activeHand === 1) {
      this.activeLine = [];
      this.ctx.beginPath();
    }
  }

  onSelectEnd(event: SelectEvent) {
    const id = event?.target?.userData?.id ?? -1;
    // check if user released an active hand
    if (id === this.activeHand) {
      // line could be empty, or contain select start only
      if (this.activeHand >= 0 && this.activeLine.length > 1) {
        this.activeLines.push(this.activeLine);
        // Added a new line, no more option for re-do
        this.removedLines = [];
      }
      this.isDrawing = false;
      this.activeLine = [];
      this.activeHand = -1;
    }
  }

  /**
   * Updates the painter's line to the current pivot position during selection.
   */
  onSelecting(event: SelectEvent) {
    const id = event.target.userData.id;
    if (id !== this.activeHand) {
      return;
    }

    const data = this.user.getReticleIntersection(id);

    if (data) {
      if (data.object instanceof SketchPanel && data.uv) {
        const x = Math.round(data.uv.x * 1024);
        const y = Math.round(1024 - data.uv.y * 1024);

        const ctx = this.ctx;
        if (this.isDrawing) {
          ctx.lineTo(x, y);
          ctx.strokeStyle = 'black';
          ctx.lineWidth = 6;  // You can adjust the line width here
          ctx.stroke();

          this.triggerUpdate();
          this.activeLine.push({x, y});
        } else {
          this.activeLine.push({x, y, b: true});
          ctx.moveTo(x, y);
          this.isDrawing = true;
        }
      } else {
        // pointer exit from the SketchPanel
        this.isDrawing = false;
      }
    } else {
      // no plane at the pointer
      this.isDrawing = false;
    }
  }

  clearCanvas(forceUpdate = true) {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.fillRect(
        0, 0, this.canvas.width, this.canvas.height);  // Fill the entire canvas
    if (forceUpdate) {
      this.triggerUpdate();
    }
  }

  removeAll() {
    this.activeLines = [];
    this.removedLines = [];
    this.clearCanvas();
  }

  undo() {
    if (this.activeLines.length === 0) {
      return;
    }

    this.ctx = this.canvas.getContext('2d')!;

    const line = this.activeLines.pop()!;
    this.removedLines.push(line);

    this.clearCanvas(false);
    this.activeLines.forEach((line) => {
      this.#drawLine(line);
    });

    this.triggerUpdate();
  }

  redo() {
    if (this.removedLines.length === 0) {
      return;
    }
    const line = this.removedLines.pop()!;
    this.activeLines.push(line);
    this.#drawLine(line);
    this.triggerUpdate();
  }

  #drawLine(line: LinePoint[]) {
    // common context options
    this.ctx.beginPath();
    this.ctx.strokeStyle = 'black';
    this.ctx.lineWidth = 6;

    line.forEach((point) => {
      if (point.b) {
        this.ctx.moveTo(point.x, point.y);
      } else {
        this.ctx.lineTo(point.x, point.y);
        this.ctx.stroke();
      }
    });
  }

  update() {
    //  empty
  }
}
