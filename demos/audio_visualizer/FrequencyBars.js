import * as THREE from 'three';

const BAR_WIDTH = 0.025;
const BAR_DEPTH = 0.025;
const MAX_BAR_HEIGHT = 0.4;
const MIN_BAR_HEIGHT = 0.01;

// Peak-hold decay multiplier per frame (~0.97 gives ~1s fall at 60 fps)
const PEAK_DECAY = 0.97;
// Emissive intensity when a beat fires
const BEAT_FLASH_INTENSITY = 4.0;
// Peak indicator height (thin strip above each bar)
const PEAK_BAR_HEIGHT = 0.008;

/**
 * FrequencyBars — circular ring of frequency-reactive bars with peak-hold
 * indicators and beat-flash effect.
 *
 * Usage:
 *   const bars = new FrequencyBars({ numBars: 64, radius: 0.6 });
 *   scene.add(bars.group);
 *   // each frame:
 *   bars.update(analyser);             // pass AudioAnalyser instance
 *   bars.setTheme(themeColors);        // array of THREE.Color, length = numBars
 */
export class FrequencyBars {
  /**
   * @param {object} options
   * @param {number} [options.numBars=64]   Number of bars in the ring.
   * @param {number} [options.radius=0.6]   Ring radius in metres.
   */
  constructor({numBars = 64, radius = 0.6} = {}) {
    this._numBars = numBars;
    this._radius = radius;

    this._bars = [];
    this._barMaterials = [];
    this._peaks = new Float32Array(numBars).fill(MIN_BAR_HEIGHT);
    this._peakMeshes = [];
    this._peakMaterials = [];

    this.group = new THREE.Group();
    this._buildGeometry();
  }

  _buildGeometry() {
    // Shared bar geometry — unit height, pivot at base via translate
    const barGeo = new THREE.BoxGeometry(BAR_WIDTH, 1, BAR_DEPTH);
    barGeo.translate(0, 0.5, 0);

    // Shared peak geometry — flat strip
    const peakGeo = new THREE.BoxGeometry(BAR_WIDTH * 1.2, PEAK_BAR_HEIGHT, BAR_DEPTH * 1.2);

    for (let i = 0; i < this._numBars; i++) {
      const angle = (i / this._numBars) * Math.PI * 2;
      const x = Math.sin(angle) * this._radius;
      const z = Math.cos(angle) * this._radius;

      // ── Bar ──
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x000000,
        roughness: 0.4,
        metalness: 0.2,
      });
      this._barMaterials.push(mat);

      const mesh = new THREE.Mesh(barGeo, mat);
      mesh.position.set(x, 0, z);
      mesh.rotation.y = -angle;
      mesh.scale.y = MIN_BAR_HEIGHT;
      this._bars.push(mesh);
      this.group.add(mesh);

      // ── Peak indicator ──
      const peakMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 0.8,
        roughness: 0.5,
        metalness: 0,
      });
      this._peakMaterials.push(peakMat);

      const peakMesh = new THREE.Mesh(peakGeo, peakMat);
      peakMesh.position.set(x, MIN_BAR_HEIGHT, z);
      peakMesh.rotation.y = -angle;
      this._peakMeshes.push(peakMesh);
      this.group.add(peakMesh);
    }

    // Lights local to the bar group
    this.group.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(0, 2, 1);
    this.group.add(dir);
  }

  /**
   * Update bar heights, peak hold positions, and beat flash.
   * Call once per frame with the AudioAnalyser instance.
   * @param {import('./AudioAnalyser.js').AudioAnalyser} analyser
   */
  update(analyser) {
    const freqData = analyser.getFrequencyData();
    const beat = analyser.isBeat();

    if (!freqData) {
      // Gently reset when not listening
      for (let i = 0; i < this._numBars; i++) {
        this._bars[i].scale.y = MIN_BAR_HEIGHT;
        this._peakMeshes[i].position.y = MIN_BAR_HEIGHT;
        this._peaks[i] = MIN_BAR_HEIGHT;
        this._barMaterials[i].emissiveIntensity = 0;
      }
      return;
    }

    const binCount = freqData.length;

    for (let i = 0; i < this._numBars; i++) {
      const bin = Math.min(i, binCount - 1);
      const norm = freqData[bin] / 255;
      const targetHeight = MIN_BAR_HEIGHT + norm * MAX_BAR_HEIGHT;

      // Smooth bar height
      const cur = this._bars[i].scale.y;
      const newHeight = cur + (targetHeight - cur) * 0.3;
      this._bars[i].scale.y = newHeight;

      // Peak hold — rise instantly, decay slowly
      if (newHeight > this._peaks[i]) {
        this._peaks[i] = newHeight;
      } else {
        this._peaks[i] *= PEAK_DECAY;
        if (this._peaks[i] < MIN_BAR_HEIGHT) this._peaks[i] = MIN_BAR_HEIGHT;
      }
      this._peakMeshes[i].position.y = this._peaks[i];

      // Emissive glow — boost on beat, otherwise track amplitude
      const targetEmissive = beat ? BEAT_FLASH_INTENSITY : norm * 2.5;
      this._barMaterials[i].emissiveIntensity = targetEmissive;
    }
  }

  /**
   * Apply a colour theme to all bars and peak indicators.
   * @param {THREE.Color[]} colors  Array of length numBars.
   */
  setTheme(colors) {
    for (let i = 0; i < this._numBars; i++) {
      const c = colors[i % colors.length];
      this._barMaterials[i].color.copy(c);
      this._barMaterials[i].emissive.copy(c).multiplyScalar(0.35);
      this._peakMaterials[i].color.copy(c);
      this._peakMaterials[i].emissive.copy(c);
    }
  }

  /** Show or hide this visualisation. */
  setVisible(visible) {
    this.group.visible = visible;
  }

  dispose() {
    // Geometries are shared; materials are per-bar
    for (const m of this._barMaterials) m.dispose();
    for (const m of this._peakMaterials) m.dispose();
  }
}
