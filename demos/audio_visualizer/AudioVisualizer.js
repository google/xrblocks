import * as THREE from 'three';
import * as xb from 'xrblocks';

import {AudioAnalyser} from './AudioAnalyser.js';
import {FrequencyBars} from './FrequencyBars.js';
import {WaveformRing} from './WaveformRing.js';

// ─── Visualization modes ────────────────────────────────────────────────────
const MODE_BARS = 'bars';
const MODE_WAVE = 'wave';
const MODE_SPHERE = 'sphere';

// Pulse sphere constants
const SPHERE_BASE_RADIUS = 0.32;
const SPHERE_MAX_DISPLACE = 0.18;

// ─── Color themes ────────────────────────────────────────────────────────────
// Each theme is an array of THREE.Color stop-points; bars/ring lerp across them.
const THEMES = {
  spectrum: _buildSpectrum(), // full HSL sweep
  ember: _buildEmber(),       // yellow → orange → red
  frost: _buildFrost(),       // cyan → blue → purple
};
const THEME_ORDER = ['spectrum', 'ember', 'frost'];
const THEME_ICONS = ['gradient', 'local_fire_department', 'ac_unit'];

function _buildSpectrum() {
  const colors = [];
  for (let i = 0; i < 64; i++) {
    const hue = ((1 - i / 64) * 240) / 360;
    colors.push(new THREE.Color().setHSL(hue, 1.0, 0.55));
  }
  return colors;
}
function _buildEmber() {
  return [
    new THREE.Color('#facc15'), // yellow
    new THREE.Color('#f97316'), // orange
    new THREE.Color('#ef4444'), // red
  ];
}
function _buildFrost() {
  return [
    new THREE.Color('#22d3ee'), // cyan
    new THREE.Color('#3b82f6'), // blue
    new THREE.Color('#a855f7'), // purple
  ];
}

// ─── Main class ──────────────────────────────────────────────────────────────

/**
 * AudioVisualizer — xb.Script that orchestrates three audio-reactive
 * visualization modes and a draggable control panel.
 *
 * Modes: 'bars' (frequency bars + peak hold), 'wave' (waveform ring line),
 *        'sphere' (morphing icosahedron)
 *
 * Constructor options (typically from URL params via main.js):
 *   numBars   {number}  default 64
 *   radius    {number}  default 0.6
 *   smoothing {number}  default 0.8
 */
export class AudioVisualizer extends xb.Script {
  static dependencies = {camera: THREE.Camera};

  constructor({numBars = 64, radius = 0.6, smoothing = 0.8} = {}) {
    super();
    this._opts = {numBars, radius, smoothing};

    // Audio
    this._analyser = new AudioAnalyser({
      fftSize: numBars * 2,
      smoothing,
    });

    // Visual group (follows camera)
    this._vizGroup = new THREE.Group();
    this.add(this._vizGroup);

    // Mode instances
    this._barsViz = new FrequencyBars({numBars, radius});
    this._waveViz = new WaveformRing({numSamples: numBars * 2, radius});
    this._sphereGroup = new THREE.Group();

    this._vizGroup.add(this._barsViz.group);
    this._vizGroup.add(this._waveViz.group);
    this._vizGroup.add(this._sphereGroup);

    // Sphere mode setup
    this._buildSphere();

    // State
    this._mode = MODE_BARS;
    this._themeIdx = 0;
    this._panelMoved = false;

    // Reusable objects to avoid per-frame allocations in _followCamera
    this._camPos = new THREE.Vector3();
    this._camQuat = new THREE.Quaternion();
    this._camForward = new THREE.Vector3();

    // UI panel (added in init after camera is available)
    this._panel = null;
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  init({camera}) {
    this._camera = camera;

    this._applyTheme();
    this._setMode(MODE_BARS);
    this._buildUi();
    this._addLights();
    this._registerGestures();
  }

  update(time) {
    this._followCamera();

    // Slowly rotate the visualisation ring
    const t = (time ?? performance.now()) / 1000;
    this._vizGroup.rotation.y = t * 0.2;

    if (!this._analyser.isListening) return;

    if (this._mode === MODE_BARS) {
      this._barsViz.update(this._analyser);
    } else if (this._mode === MODE_WAVE) {
      this._waveViz.update(this._analyser);
    } else if (this._mode === MODE_SPHERE) {
      this._updateSphere();
    }
  }

  dispose() {
    this._analyser.stop();
    this._barsViz.dispose();
    this._waveViz.dispose();
    this._sphereMaterial?.dispose();
    this._unregisterGestures();
  }

  // ─── Camera following ──────────────────────────────────────────────────────

  _followCamera() {
    if (!this._camera) return;

    this._camera.getWorldPosition(this._camPos);
    this._camera.getWorldQuaternion(this._camQuat);
    this._camForward.set(0, 0, -1).applyQuaternion(this._camQuat);

    // Visualisation group: 1 m in front, slightly below eye level
    this._vizGroup.position
      .copy(this._camPos)
      .addScaledVector(this._camForward, 1.0);
    this._vizGroup.position.y -= 0.05;
    this._vizGroup.quaternion.copy(this._camQuat);

    // Panel: only follow if user hasn't moved it manually
    if (!this._panelMoved && this._panel) {
      this._panel.position.copy(this._vizGroup.position);
      this._panel.position.y -= 0.56;
      this._panel.quaternion.copy(this._camQuat);
    }
  }

  // ─── Sphere mode ───────────────────────────────────────────────────────────

  _buildSphere() {
    const geo = new THREE.IcosahedronGeometry(SPHERE_BASE_RADIUS, 4);
    // Store original vertex positions for reset each frame
    this._sphereOrigPos = geo.attributes.position.array.slice();
    this._sphereGeo = geo;

    this._sphereMaterial = new THREE.MeshStandardMaterial({
      color: 0x4488ff,
      emissive: 0x112244,
      emissiveIntensity: 0.8,
      roughness: 0.3,
      metalness: 0.6,
      wireframe: false,
    });

    this._sphereMesh = new THREE.Mesh(geo, this._sphereMaterial);
    this._sphereGroup.add(this._sphereMesh);
  }

  _updateSphere() {
    const freqData = this._analyser.getFrequencyData();
    const beat = this._analyser.isBeat();
    if (!freqData) return;

    const pos = this._sphereGeo.attributes.position;
    const orig = this._sphereOrigPos;
    const binCount = freqData.length;

    // For each vertex, determine which frequency bin drives it
    // by mapping the vertex's azimuthal angle to a bin index.
    for (let i = 0; i < pos.count; i++) {
      const ox = orig[i * 3];
      const oy = orig[i * 3 + 1];
      const oz = orig[i * 3 + 2];

      // Azimuthal angle 0–2π → bin index
      const azimuth = Math.atan2(oz, ox) + Math.PI; // 0–2π
      const bin = Math.min(
        Math.floor((azimuth / (Math.PI * 2)) * binCount),
        binCount - 1
      );
      const norm = freqData[bin] / 255;
      const scale = 1 + norm * (SPHERE_MAX_DISPLACE / SPHERE_BASE_RADIUS);

      pos.setXYZ(i, ox * scale, oy * scale, oz * scale);
    }
    pos.needsUpdate = true;
    this._sphereGeo.computeVertexNormals();

    // Pulse emissive on beat
    const targetEmissive = beat ? 2.5 : 0.6 + this._analyser.getRMS() * 2.0;
    this._sphereMaterial.emissiveIntensity =
      this._sphereMaterial.emissiveIntensity * 0.85 + targetEmissive * 0.15;

    // Match sphere color to active theme (use mid-theme color)
    const colors = THEMES[THEME_ORDER[this._themeIdx]];
    const midColor = colors[Math.floor(colors.length / 2)];
    this._sphereMaterial.color.lerp(midColor, 0.05);
    this._sphereMaterial.emissive.lerp(midColor, 0.03);
  }

  // ─── Mode switching ────────────────────────────────────────────────────────

  _setMode(mode) {
    this._mode = mode;
    this._barsViz.setVisible(mode === MODE_BARS);
    this._waveViz.setVisible(mode === MODE_WAVE);
    this._sphereGroup.visible = mode === MODE_SPHERE;
    this._updateModeButtons();
  }

  _updateModeButtons() {
    if (!this._modeButtons) return;
    const modes = [MODE_BARS, MODE_WAVE, MODE_SPHERE];
    for (let i = 0; i < modes.length; i++) {
      const btn = this._modeButtons[i];
      if (!btn) continue;
      btn.fontColor = modes[i] === this._mode ? '#ffffff' : '#4b5563';
    }
    // Propagate fontColor changes to the underlying troika text objects
    this._panel?.updateLayouts();
  }

  // ─── Theme switching ───────────────────────────────────────────────────────

  _applyTheme() {
    const themeName = THEME_ORDER[this._themeIdx];
    const colors = THEMES[themeName];

    // Expand theme stops to full numBars array
    const expanded = this._expandTheme(colors, this._opts.numBars);
    this._barsViz.setTheme(expanded);
    this._waveViz.setTheme(colors);
  }

  _expandTheme(stops, count) {
    const out = [];
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const scaled = t * (stops.length - 1);
      const lo = Math.floor(scaled);
      const hi = Math.min(lo + 1, stops.length - 1);
      out.push(stops[lo].clone().lerp(stops[hi], scaled - lo));
    }
    return out;
  }

  _cycleTheme() {
    this._themeIdx = (this._themeIdx + 1) % THEME_ORDER.length;
    this._applyTheme();
    if (this._paletteButton) {
      this._paletteButton.setText(THEME_ICONS[this._themeIdx]);
    }
  }

  // ─── Lights ────────────────────────────────────────────────────────────────

  _addLights() {
    this._vizGroup.add(new THREE.AmbientLight(0xffffff, 0.4));
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(1, 2, 1);
    this._vizGroup.add(dir);
  }

  // ─── UI ────────────────────────────────────────────────────────────────────

  _buildUi() {
    const panel = new xb.Panel({
      backgroundColor: '#101218ee',
      width: 0.9,
      height: 0.22,
      draggable: true,
      showHighlights: true,
    });
    this._panel = panel;
    this.add(panel);

    // Track manual drag so camera-follow stops
    panel.onSelectEnd = () => {
      this._panelMoved = true;
    };

    const grid = panel.addGrid();
    const row = grid.addRow({weight: 1});
    const inner = row.addPanel({backgroundColor: '#00000000'}).addGrid();

    // ── Spacer left
    inner.addCol({weight: 0.04});

    // ── Mic button
    this._micButton = inner.addCol({weight: 0.1}).addIconButton({
      text: 'mic',
      fontSize: 0.52,
      fontColor: '#ffffff',
    });
    this._micButton.onTriggered = () => this._toggleMic();

    // ── Divider spacer
    inner.addCol({weight: 0.03});

    // ── Separator label
    inner.addCol({weight: 0.01}).addText({
      text: '│',
      fontColor: '#374151',
      fontSize: 0.04,
    });

    inner.addCol({weight: 0.03});

    // ── Mode buttons (bars / wave / sphere)
    const modeIcons = ['equalizer', 'ssid_chart', 'circle'];
    const modes = [MODE_BARS, MODE_WAVE, MODE_SPHERE];
    this._modeButtons = [];

    for (let i = 0; i < 3; i++) {
      const btn = inner.addCol({weight: 0.1}).addIconButton({
        text: modeIcons[i],
        fontSize: 0.5,
        fontColor: '#4b5563',
      });
      const mode = modes[i];
      btn.onTriggered = () => this._setMode(mode);
      this._modeButtons.push(btn);
    }

    // ── Spacer
    inner.addCol({weight: 0.03});

    // ── Separator
    inner.addCol({weight: 0.01}).addText({
      text: '│',
      fontColor: '#374151',
      fontSize: 0.04,
    });

    inner.addCol({weight: 0.03});

    // ── Palette/theme button
    this._paletteButton = inner.addCol({weight: 0.1}).addIconButton({
      text: THEME_ICONS[0],
      fontSize: 0.48,
      fontColor: '#9ca3af',
    });
    this._paletteButton.onTriggered = () => this._cycleTheme();

    // ── Status text
    inner.addCol({weight: 0.03});

    this._statusText = inner.addCol({weight: 0.3}).addText({
      text: 'Pinch mic to start',
      fontColor: '#6b7280',
      fontSize: 0.026,
      textAlign: 'left',
      anchorX: 'left',
    });
    this._statusText.x = -0.5;

    // ── Spacer right
    inner.addCol({weight: 0.04});

    panel.updateLayouts();
    this._updateModeButtons();
  }

  // ─── Mic control ───────────────────────────────────────────────────────────

  async _toggleMic() {
    if (this._analyser.isListening) {
      this._analyser.stop();
      this._setStatus('Stopped');
      this._micButton.setText?.('mic');
      this._micButton.fontColor = '#ffffff';
    } else {
      this._setStatus('Requesting mic…');
      try {
        await this._analyser.start();
        this._setStatus('● Listening');
        this._micButton.setText?.('stop');
        this._micButton.fontColor = '#ef4444';
      } catch (err) {
        console.error('Microphone access denied:', err);
        this._setStatus('Mic access denied');
      }
    }
  }

  _setStatus(text) {
    if (this._statusText) this._statusText.setText(text);
  }

  // ─── Gesture control ───────────────────────────────────────────────────────

  /**
   * Map hand gestures to visualization modes and theme cycling.
   * Requires options.enableGestures() + per-gesture enables in main.js.
   *
   *  ✊ fist      → bars mode
   *  👆 point     → wave mode
   *  🖐 spread    → sphere mode
   *  👍 thumbs-up → cycle color theme
   */
  _registerGestures() {
    const gestures = xb.core.gestureRecognition;
    if (!gestures) return; // not enabled — panel buttons still work

    this._gestureHandler = (event) => {
      const {name} = event.detail;
      switch (name) {
        case 'fist':
          this._setMode(MODE_BARS);
          this._gestureToast('✊  Bars');
          break;
        case 'point':
          this._setMode(MODE_WAVE);
          this._gestureToast('☝  Wave');
          break;
        case 'spread':
          this._setMode(MODE_SPHERE);
          this._gestureToast('🖐  Sphere');
          break;
        case 'thumbs-up':
          this._cycleTheme();
          this._gestureToast('👍  Theme: ' + THEME_ORDER[this._themeIdx]);
          break;
      }
    };

    gestures.addEventListener('gesturestart', this._gestureHandler);
  }

  _unregisterGestures() {
    const gestures = xb.core.gestureRecognition;
    if (gestures && this._gestureHandler) {
      gestures.removeEventListener('gesturestart', this._gestureHandler);
    }
  }

  /**
   * Briefly show a gesture confirmation in the status bar, then revert.
   * @param {string} message
   */
  _gestureToast(message) {
    this._setStatus(message);
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this._toastTimer = null;
      // Revert to the appropriate idle or listening status
      this._setStatus(
        this._analyser.isListening ? '● Listening' : 'Pinch mic to start'
      );
    }, 1500);
  }
}
