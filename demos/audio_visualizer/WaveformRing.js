import * as THREE from 'three';

const WAVEFORM_DISPLACEMENT = 0.25; // max radial displacement in metres

/**
 * WaveformRing — time-domain waveform visualised as a glowing 3D line ring.
 *
 * Samples are placed around a circle of `radius`. Each sample displaces its
 * point radially inward/outward based on the audio amplitude, forming a
 * pulsing loop that reacts to the live waveform shape.
 *
 * Usage:
 *   const ring = new WaveformRing({ numSamples: 128, radius: 0.6 });
 *   scene.add(ring.group);
 *   ring.update(analyser);   // call each frame with AudioAnalyser instance
 *   ring.setTheme(colors);   // array of THREE.Color
 */
export class WaveformRing {
  /**
   * @param {object} options
   * @param {number} [options.numSamples=128]  Must match analyser.binCount.
   * @param {number} [options.radius=0.6]      Ring radius in metres.
   */
  constructor({numSamples = 128, radius = 0.6} = {}) {
    this._numSamples = numSamples;
    this._radius = radius;

    this.group = new THREE.Group();
    this._buildGeometry();
  }

  _buildGeometry() {
    // +1 point to close the loop
    const count = this._numSamples + 1;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    // Initialise at rest (no displacement)
    for (let i = 0; i < count; i++) {
      const angle = (i / this._numSamples) * Math.PI * 2;
      positions[i * 3 + 0] = Math.sin(angle) * this._radius;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = Math.cos(angle) * this._radius;
      colors[i * 3 + 0] = 0;
      colors[i * 3 + 1] = 1;
      colors[i * 3 + 2] = 1; // default cyan
    }

    this._posAttr = new THREE.BufferAttribute(positions, 3);
    this._posAttr.setUsage(THREE.DynamicDrawUsage);
    this._colorAttr = new THREE.BufferAttribute(colors, 3);
    this._colorAttr.setUsage(THREE.DynamicDrawUsage);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', this._posAttr);
    geo.setAttribute('color', this._colorAttr);

    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      linewidth: 2, // note: linewidth > 1 only works in WebGL1 on some systems
    });

    this._line = new THREE.Line(geo, mat);
    this.group.add(this._line);

    // Subtle inner glow: a second slightly smaller line in white
    const glowPositions = positions.slice();
    this._glowPosAttr = new THREE.BufferAttribute(glowPositions, 3);
    this._glowPosAttr.setUsage(THREE.DynamicDrawUsage);

    const glowGeo = new THREE.BufferGeometry();
    glowGeo.setAttribute('position', this._glowPosAttr);

    const glowMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.15,
    });
    this._glowLine = new THREE.Line(glowGeo, glowMat);
    this.group.add(this._glowLine);
  }

  /**
   * Update the line ring from waveform data.
   * @param {import('./AudioAnalyser.js').AudioAnalyser} analyser
   */
  update(analyser) {
    const waveData = analyser.getWaveformData();

    if (!waveData) {
      // Reset to rest circle
      for (let i = 0; i <= this._numSamples; i++) {
        const angle = (i / this._numSamples) * Math.PI * 2;
        this._posAttr.setXYZ(
          i,
          Math.sin(angle) * this._radius,
          0,
          Math.cos(angle) * this._radius
        );
        this._glowPosAttr.setXYZ(
          i,
          Math.sin(angle) * this._radius,
          0,
          Math.cos(angle) * this._radius
        );
      }
      this._posAttr.needsUpdate = true;
      this._glowPosAttr.needsUpdate = true;
      return;
    }

    const len = waveData.length;

    for (let i = 0; i <= this._numSamples; i++) {
      const sampleIdx = i % len;
      // waveform data: 0–255, centre at 128 → -1 to +1
      const displacement =
        ((waveData[sampleIdx] - 128) / 128) * WAVEFORM_DISPLACEMENT;

      const angle = (i / this._numSamples) * Math.PI * 2;
      const r = this._radius + displacement;

      const x = Math.sin(angle) * r;
      const z = Math.cos(angle) * r;

      this._posAttr.setXYZ(i, x, 0, z);
      this._glowPosAttr.setXYZ(i, x, 0, z);
    }

    this._posAttr.needsUpdate = true;
    this._glowPosAttr.needsUpdate = true;
  }

  /**
   * Apply a colour theme. Colors are interpolated around the ring.
   * @param {THREE.Color[]} colors
   */
  setTheme(colors) {
    if (!colors || colors.length < 2) return;
    const count = this._numSamples + 1;
    for (let i = 0; i < count; i++) {
      const t = i / this._numSamples;
      const scaled = t * (colors.length - 1);
      const lo = Math.floor(scaled);
      const hi = Math.min(lo + 1, colors.length - 1);
      const frac = scaled - lo;
      const c = colors[lo].clone().lerp(colors[hi], frac);
      this._colorAttr.setXYZ(i, c.r, c.g, c.b);
    }
    this._colorAttr.needsUpdate = true;
  }

  /** Show or hide this visualisation. */
  setVisible(visible) {
    this.group.visible = visible;
  }

  dispose() {
    this._line.geometry.dispose();
    this._line.material.dispose();
    this._glowLine.geometry.dispose();
    this._glowLine.material.dispose();
  }
}
