import * as THREE from 'three';
import * as xb from 'xrblocks';

const NUM_BARS = 64;
const RING_RADIUS = 0.6;
const BAR_WIDTH = 0.025;
const BAR_DEPTH = 0.025;
const MAX_BAR_HEIGHT = 0.4;
const MIN_BAR_HEIGHT = 0.01;
const FFT_SIZE = 128; // must be 2x NUM_BARS

// Maps a frequency bin index to an HSL hue: bass=blue, mids=green, highs=red.
function binToHue(i, total) {
  return (1 - i / total) * 240;
}

export class AudioVisualizer extends xb.Script {
  static dependencies = {camera: THREE.Camera};

  constructor() {
    super();
    this._audioCtx = null;
    this._analyser = null;
    this._dataArray = null;
    this._bars = [];
    this._barMaterials = [];
    this._isListening = false;
    this._group = new THREE.Group();
    this.add(this._group);
  }

  init({camera}) {
    this._camera = camera;
    this._buildBars();
    this._buildUi();
  }

  _buildBars() {
    const geometry = new THREE.BoxGeometry(BAR_WIDTH, 1, BAR_DEPTH);
    // Pivot at bottom: shift geometry so y=0 is at the base of each bar.
    geometry.translate(0, 0.5, 0);

    for (let i = 0; i < NUM_BARS; i++) {
      const hue = binToHue(i, NUM_BARS);
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(`hsl(${hue}, 100%, 55%)`),
        emissive: new THREE.Color(`hsl(${hue}, 100%, 20%)`),
        roughness: 0.4,
        metalness: 0.2,
      });
      this._barMaterials.push(material);

      const mesh = new THREE.Mesh(geometry, material);

      const angle = (i / NUM_BARS) * Math.PI * 2;
      mesh.position.set(
        Math.sin(angle) * RING_RADIUS,
        0,
        Math.cos(angle) * RING_RADIUS
      );
      mesh.rotation.y = -angle;
      mesh.scale.y = MIN_BAR_HEIGHT;

      this._bars.push(mesh);
      this._group.add(mesh);
    }

    // Ambient + directional light so bars catch light.
    this._group.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(0, 2, 1);
    this._group.add(dirLight);
  }

  _buildUi() {
    const panel = new xb.SpatialPanel({
      backgroundColor: '#101218e6',
      width: 0.8,
      height: 0.18,
    });
    panel.position.set(0, -0.55, 0);
    this._panel = panel;
    this.add(panel);

    const grid = panel.addGrid();

    const row = grid.addRow({weight: 1});
    const col = row.addPanel({backgroundColor: '#00000000'}).addGrid();

    col.addCol({weight: 0.15});

    this._micButton = col.addCol({weight: 0.2}).addIconButton({
      text: 'mic',
      fontSize: 0.55,
      fontColor: '#ffffff',
    });
    this._micButton.onTriggered = () => this._toggle();

    col.addCol({weight: 0.05});

    this._statusText = col.addCol({weight: 0.45}).addText({
      text: 'Pinch mic to start',
      fontColor: '#94a3b8',
      fontSize: 0.028,
      textAlign: 'left',
      anchorX: 'left',
    });
    this._statusText.x = -0.5;

    col.addCol({weight: 0.15});

    panel.updateLayouts();
  }

  async _toggle() {
    if (this._isListening) {
      this._stop();
    } else {
      await this._start();
    }
  }

  async _start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio: true});
      this._audioCtx = new AudioContext();
      const source = this._audioCtx.createMediaStreamSource(stream);
      this._stream = stream;

      this._analyser = this._audioCtx.createAnalyser();
      this._analyser.fftSize = FFT_SIZE;
      this._analyser.smoothingTimeConstant = 0.8;
      this._dataArray = new Uint8Array(this._analyser.frequencyBinCount);

      source.connect(this._analyser);

      this._isListening = true;
      this._setStatus('● Listening');
      this._micButton.setText?.('stop');
    } catch (err) {
      console.error('Microphone access denied:', err);
      this._setStatus('Mic access denied');
    }
  }

  _stop() {
    if (this._stream) {
      this._stream.getTracks().forEach((t) => t.stop());
      this._stream = null;
    }
    if (this._audioCtx) {
      this._audioCtx.close();
      this._audioCtx = null;
    }
    this._analyser = null;
    this._isListening = false;
    this._setStatus('Stopped');
    this._micButton.setText?.('mic');

    // Reset bars smoothly on next update frames via _targetScales.
    for (let i = 0; i < NUM_BARS; i++) {
      this._bars[i].scale.y = MIN_BAR_HEIGHT;
      this._barMaterials[i].emissiveIntensity = 0;
    }
  }

  _setStatus(text) {
    if (this._statusText) this._statusText.setText(text);
  }

  update(time) {
    // Keep the visualization floating 1 m in front of the camera.
    if (this._camera) {
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      this._camera.getWorldPosition(pos);
      this._camera.getWorldQuaternion(quat);
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
      this._group.position.copy(pos).addScaledVector(forward, 1.0);
      this._group.position.y -= 0.05;
      this._panel.position.copy(this._group.position);
      this._panel.position.y -= 0.5;
      this._group.quaternion.copy(quat);
      this._panel.quaternion.copy(quat);
    }

    // Slowly rotate the ring.
    const t = (time ?? performance.now()) / 1000;
    this._group.rotation.y = t * 0.25;

    if (!this._analyser || !this._dataArray) return;

    this._analyser.getByteFrequencyData(this._dataArray);

    const binCount = this._analyser.frequencyBinCount; // = NUM_BARS
    for (let i = 0; i < NUM_BARS; i++) {
      const bin = Math.min(i, binCount - 1);
      const norm = this._dataArray[bin] / 255;
      const targetHeight = MIN_BAR_HEIGHT + norm * MAX_BAR_HEIGHT;

      // Smooth toward target (lerp each frame).
      const cur = this._bars[i].scale.y;
      this._bars[i].scale.y = cur + (targetHeight - cur) * 0.3;

      // Emissive glow proportional to amplitude.
      this._barMaterials[i].emissiveIntensity = norm * 2.5;
    }
  }

  destroy() {
    this._stop();
  }
}
