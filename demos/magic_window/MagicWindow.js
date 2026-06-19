import * as THREE from 'three';
import * as xb from 'xrblocks';

import {SegmenterController} from './SegmenterController.js';

// Backdrop modes for the cut-out background.
//   0 = passthrough: background pixels are discarded so you see straight
//       through the window to the real world behind it.
//   1 = solid:       background replaced with a flat colour.
//   2 = gradient:    background replaced with a vertical gradient.
export const Backdrop = {
  Passthrough: 0,
  Solid: 1,
  Gradient: 2,
};

const BACKDROP_PRESETS = [
  {name: 'sunset', mode: Backdrop.Gradient, a: '#1d2b53', b: '#7e2553'},
  {name: 'teal', mode: Backdrop.Gradient, a: '#0b486b', b: '#3b8686'},
  {name: 'greenscreen', mode: Backdrop.Solid, a: '#00b140', b: '#00b140'},
  {name: 'passthrough', mode: Backdrop.Passthrough, a: '#000000', b: '#000000'},
];

// Window sizing in metres. The feed plane is WINDOW_HEIGHT tall and as wide as
// the camera's aspect ratio; the dark frame keeps a uniform WINDOW_MARGIN
// around it. Defaults to 16:9 (the camera module's default resolution) so the
// window doesn't visibly resize when the first frame arrives.
const WINDOW_HEIGHT = 0.6;
const WINDOW_MARGIN = 0.02;
const DEFAULT_ASPECT = 16 / 9;

// Builds the dark window frame as a rectangular ring (a rectangle with a
// rectangular hole the size of the feed) rather than a solid plane, so that in
// passthrough mode the discarded background pixels reveal the real world behind
// the window instead of a dark backing.
function makeFrameGeometry(w, h, margin) {
  const ow = w / 2 + margin;
  const oh = h / 2 + margin;
  const iw = w / 2;
  const ih = h / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-ow, -oh);
  shape.lineTo(ow, -oh);
  shape.lineTo(ow, oh);
  shape.lineTo(-ow, oh);
  shape.lineTo(-ow, -oh);
  const hole = new THREE.Path();
  hole.moveTo(-iw, -ih);
  hole.lineTo(-iw, ih);
  hole.lineTo(iw, ih);
  hole.lineTo(iw, -ih);
  hole.lineTo(-iw, -ih);
  shape.holes.push(hole);
  return new THREE.ShapeGeometry(shape);
}

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uCamera;
  uniform sampler2D uMask;
  uniform int uBackdrop;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uHasMask;

  void main() {
    vec3 cam = texture2D(uCamera, vUv).rgb;
    // The camera texture uses GL flipY; the mask DataTexture does not, so
    // flip the mask's v to line the two up.
    float id = texture2D(uMask, vec2(vUv.x, 1.0 - vUv.y)).r * 255.0;
    // Until the first mask arrives, show the raw feed. Category 0 is the
    // background; everything else is a person.
    bool isPerson = (uHasMask < 0.5) || (id >= 0.5);
    if (isPerson) {
      gl_FragColor = vec4(cam, 1.0);
      return;
    }
    if (uBackdrop == 0) {
      discard;
    }
    vec3 bg = (uBackdrop == 2) ? mix(uColorA, uColorB, vUv.y) : uColorA;
    gl_FragColor = vec4(bg, 1.0);
  }
`;

export class MagicWindow extends xb.Script {
  constructor() {
    super();
    this.segmenter = new SegmenterController();
    this.frameCanvas = document.createElement('canvas');
    this.frameCtx = this.frameCanvas.getContext('2d', {
      willReadFrequently: true,
    });
    this.cameraTexture = null;
    this.maskTexture = null;
    this.plane = null;
    this.material = null;
    this.backdropIndex = 0;
    this.lastGrabMs_ = 0;
    this.grabbing_ = false;
  }

  init() {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uCamera: {value: null},
        uMask: {value: null},
        uBackdrop: {value: BACKDROP_PRESETS[0].mode},
        uColorA: {value: new THREE.Color(BACKDROP_PRESETS[0].a)},
        uColorB: {value: new THREE.Color(BACKDROP_PRESETS[0].b)},
        uHasMask: {value: 0},
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      side: THREE.DoubleSide,
    });

    // Thin dark frame around the feed so the window reads as an object. A ring
    // (not a solid plane) so passthrough shows through the centre.
    this.windowFrame_ = new THREE.Mesh(
      makeFrameGeometry(
        WINDOW_HEIGHT * DEFAULT_ASPECT,
        WINDOW_HEIGHT,
        WINDOW_MARGIN
      ),
      new THREE.MeshBasicMaterial({color: 0x0a0c10})
    );
    this.windowFrame_.position.z = -0.002;

    this.plane = new THREE.Mesh(
      new THREE.PlaneGeometry(WINDOW_HEIGHT * DEFAULT_ASPECT, WINDOW_HEIGHT),
      this.material
    );
    this.plane.add(this.windowFrame_);
    this.plane.position.set(0, 1.5, -1.2);
    this.add(this.plane);

    this.segmenter.load();

    // Quick keyboard control until the spatial panel lands: B cycles backdrop.
    this.onKeyDown_ = (event) => {
      if (event.key === 'b' || event.key === 'B') {
        this.cycleBackdrop();
      }
    };
    window.addEventListener('keydown', this.onKeyDown_);
  }

  cycleBackdrop() {
    this.backdropIndex = (this.backdropIndex + 1) % BACKDROP_PRESETS.length;
    const preset = BACKDROP_PRESETS[this.backdropIndex];
    this.material.uniforms.uBackdrop.value = preset.mode;
    this.material.uniforms.uColorA.value.set(preset.a);
    this.material.uniforms.uColorB.value.set(preset.b);
  }

  get backdropName() {
    return BACKDROP_PRESETS[this.backdropIndex].name;
  }

  update() {
    const now = performance.now();
    if (this.grabbing_ || now - this.lastGrabMs_ < 66) {
      return;
    }
    this.lastGrabMs_ = now;
    this.grabFrame_();
  }

  async grabFrame_() {
    this.grabbing_ = true;
    try {
      const camera = xb.core.deviceCamera;
      if (!camera) {
        return;
      }
      const image = await camera.getSnapshot({outputFormat: 'imageData'});
      if (!image) {
        return;
      }
      if (
        this.frameCanvas.width !== image.width ||
        this.frameCanvas.height !== image.height
      ) {
        this.frameCanvas.width = image.width;
        this.frameCanvas.height = image.height;
      }
      this.frameCtx.putImageData(image, 0, 0);
      this.updateCameraTexture_();
      this.updateMask_();
    } catch (error) {
      console.warn('[magic_window] frame grab failed', error);
    } finally {
      this.grabbing_ = false;
    }
  }

  updateCameraTexture_() {
    const w = this.frameCanvas.width;
    const h = this.frameCanvas.height;
    if (
      !this.cameraTexture ||
      this.cameraTexW_ !== w ||
      this.cameraTexH_ !== h
    ) {
      // (Re)allocate the texture whenever the frame size changes; updating a
      // texture in place with a differently sized source overflows the GPU
      // allocation.
      this.cameraTexture?.dispose();
      this.cameraTexture = new THREE.CanvasTexture(this.frameCanvas);
      this.cameraTexture.colorSpace = THREE.SRGBColorSpace;
      this.cameraTexW_ = w;
      this.cameraTexH_ = h;
      this.material.uniforms.uCamera.value = this.cameraTexture;
      // Resize the window to the camera's aspect so the person isn't
      // stretched (the feed starts 4:3 but webcams are often 16:9).
      if (h > 0) {
        this.applyAspect_(w / h);
      }
    } else {
      this.cameraTexture.needsUpdate = true;
    }
  }

  /**
   * Resizes the feed plane and its frame to the given aspect ratio (width /
   * height) so the camera image and segmentation mask are shown undistorted.
   * @param {number} aspect - Camera frame aspect ratio (width / height).
   */
  applyAspect_(aspect) {
    const w = WINDOW_HEIGHT * aspect;
    this.plane.geometry.dispose();
    this.plane.geometry = new THREE.PlaneGeometry(w, WINDOW_HEIGHT);
    this.windowFrame_.geometry.dispose();
    this.windowFrame_.geometry = makeFrameGeometry(
      w,
      WINDOW_HEIGHT,
      WINDOW_MARGIN
    );
  }

  updateMask_() {
    if (!this.segmenter.isReady) {
      return;
    }
    const mask = this.segmenter.segment(this.frameCanvas);
    if (!mask) {
      return;
    }
    if (
      !this.maskTexture ||
      this.maskTexture.image.width !== mask.width ||
      this.maskTexture.image.height !== mask.height
    ) {
      this.maskTexture?.dispose();
      this.maskTexture = new THREE.DataTexture(
        mask.data,
        mask.width,
        mask.height,
        THREE.RedFormat,
        THREE.UnsignedByteType
      );
      this.maskTexture.minFilter = THREE.NearestFilter;
      this.maskTexture.magFilter = THREE.NearestFilter;
      this.maskTexture.flipY = false;
      this.material.uniforms.uMask.value = this.maskTexture;
      this.material.uniforms.uHasMask.value = 1;
    } else {
      this.maskTexture.image.data = mask.data;
    }
    this.maskTexture.needsUpdate = true;
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown_);
    this.segmenter.dispose();
    this.cameraTexture?.dispose();
    this.maskTexture?.dispose();
    this.plane.geometry.dispose();
    this.windowFrame_.geometry.dispose();
    this.windowFrame_.material.dispose();
    this.material.dispose();
  }
}
