import * as THREE from 'three';
import * as xb from 'xrblocks';
import {
  ARUCO_DICTIONARY_SIZES,
  ArucoTracker,
  createArucoAnchorVisuals,
} from 'xrblocks/addons/aruco/ArucoTracker.js';

const DICTIONARIES = Object.keys(ARUCO_DICTIONARY_SIZES);
// `?simMarker` hangs a virtual print in the desktop simulator's room so the
// whole pipeline can be exercised without a headset.
const SIM_MARKER = new URLSearchParams(location.search).has('simMarker');
// The simulator's device camera is a wide 512 px render, so the print has to
// hang close for its cells to span a few pixels each.
const SIM_MARKER_DISTANCE = 0.6;
const SURFACE = '#111923';
const CONTROL = '#263a50';
const CONTROL_HOVER = '#34516f';
const ACCENT = '#5ba7ff';
const TEXT = '#f4f8fc';
const MUTED = '#a8bbcf';
const STROKE = '#40556d';

class ArucoAnchorDemo extends xb.Script {
  constructor() {
    super();
    // No pinned calibration: the tracker self-calibrates from scratch on
    // each device (and restores what it persisted last time). Pass a
    // `calibration` seed here only for a constant offset measured on a
    // specific headset.
    this.tracker = new ArucoTracker();
    // Axes + outline square at the printed marker, thick enough to read from
    // across the room (see createArucoAnchorVisuals for why they are meshes
    // rather than AxesHelper/LineLoop).
    this.tracker.add(createArucoAnchorVisuals());
    this.add(this.tracker);
  }

  init() {
    this.createDashboard();
    this.updateDashboard(true);
  }

  update() {
    this.updateDashboard();
    if (SIM_MARKER) this.updateSimulatorMarker();
  }

  changeMarkerId(change) {
    const nextId = THREE.MathUtils.clamp(
      this.tracker.markerId + change,
      0,
      ARUCO_DICTIONARY_SIZES[this.tracker.dictionary] - 1
    );
    this.tracker.setMarkerId(nextId);
    this.updateDashboard(true);
  }

  cycleDictionary() {
    const index = DICTIONARIES.indexOf(this.tracker.dictionary);
    this.tracker.setDictionary(DICTIONARIES[(index + 1) % DICTIONARIES.length]);
    this.updateDashboard(true);
  }

  // Keeps a textured plane in the simulator scene showing the marker being
  // sought. The texture comes from the detector library itself (through the
  // tracker's worker), so it is exactly what a print would look like.
  updateSimulatorMarker() {
    const simulatorScene = xb.core.simulator?.simulatorScene;
    if (!simulatorScene || this.tracker.state === 'initializing') return;
    const key = `${this.tracker.dictionary}:${this.tracker.markerId}`;
    if (key === this.simMarkerKey) return;
    this.simMarkerKey = key;

    void this.tracker.markerSvg().then((svg) => {
      if (key !== this.simMarkerKey) return;
      // The SVG is one unit per cell: the marker plus a one-cell margin.
      const svgCells = Number(/viewBox="0 0 (\d+)/.exec(svg)?.[1] ?? 10);
      const image = new Image();
      image.onload = () => {
        if (key !== this.simMarkerKey) return;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = svgCells * 64;
        canvas
          .getContext('2d')
          .drawImage(image, 0, 0, canvas.width, canvas.height);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;

        if (!this.simMarker) {
          this.simMarker = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),
            new THREE.MeshBasicMaterial()
          );
          this.simMarker.name = 'SimulatedArucoMarker';
          const camera = xb.core.camera;
          const forward = camera.getWorldDirection(new THREE.Vector3());
          forward.y = 0;
          forward.normalize();
          this.simMarker.position
            .copy(camera.getWorldPosition(new THREE.Vector3()))
            .addScaledVector(forward, SIM_MARKER_DISTANCE)
            .add(new THREE.Vector3(0, -0.15, 0));
          // Face the viewer, then lean and turn it so the pose is not the
          // degenerate fronto-parallel one.
          this.simMarker.lookAt(camera.getWorldPosition(new THREE.Vector3()));
          this.simMarker.rotateY(THREE.MathUtils.degToRad(25));
          this.simMarker.rotateX(THREE.MathUtils.degToRad(-20));
          simulatorScene.add(this.simMarker);
          window.__arucoSim = {marker: this.simMarker, tracker: this.tracker};
        }
        this.simMarker.material.map?.dispose();
        this.simMarker.material.map = texture;
        this.simMarker.material.needsUpdate = true;
        // Scale the plane so that the black square, not the margin, is the
        // tracker's marker size.
        const planeSize =
          (this.tracker.markerSizeMeters * svgCells) / (svgCells - 2);
        this.simMarker.scale.set(planeSize, planeSize, 1);
      };
      image.src = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    });
  }

  // The dashboard is a UICard root (world-space, draggable, faces the user)
  // with UIPanel rows and UIButton / UIText leaves, built the same way as the
  // objects_3d control card: default pixel size, every text created with its
  // initial string, fixed-height rows, no flex-grow filler.
  createDashboard() {
    const card = new xb.UICard({
      size: {width: 0.6, height: 0.6},
      manipulation: {actions: {translate: {faceCamera: true}}},
      edge: true,
      style: {
        width: '100%',
        height: '100%',
        backgroundColor: SURFACE,
        borderWidth: 1,
        borderColor: STROKE,
        borderRadius: 22,
        padding: 18,
        flexDirection: 'column',
        gap: 10,
        alignItems: 'stretch',
        justifyContent: 'flex-start',
      },
    });
    card.name = 'ArucoDashboard';
    card.position.set(0.42, 1.45, -1.05);

    card.add(
      new xb.UIText({
        text: 'ArUco spatial anchor',
        style: {
          fontSize: 26,
          fontWeight: 'bold',
          color: TEXT,
          textAlign: 'center',
          width: '100%',
        },
      })
    );
    card.add(
      new xb.UIText({
        text: `Marker width ${(this.tracker.markerSizeMeters * 1000).toFixed(0)} mm (black square)`,
        style: {fontSize: 16, color: MUTED, textAlign: 'center', width: '100%'},
      })
    );
    card.add(
      new xb.UIPanel({
        style: {
          width: '100%',
          height: 2,
          backgroundColor: 'rgba(255, 255, 255, 0.12)',
          marginBottom: 4,
        },
      })
    );

    const idRow = new xb.UIPanel({
      style: {
        width: '100%',
        flexDirection: 'row',
        gap: 14,
        justifyContent: 'center',
        alignItems: 'center',
      },
    });
    const dictionaryRow = new xb.UIPanel({
      style: {
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
      },
    });
    const dictionaryButton = this.createButton(
      `Dictionary: ${this.tracker.dictionary}`,
      () => this.cycleDictionary(),
      {width: '100%'}
    );
    this.dictionaryLabel = dictionaryButton.labelText;
    dictionaryRow.add(dictionaryButton);
    card.add(dictionaryRow);

    idRow.add(
      this.createButton('-', () => this.changeMarkerId(-1), {width: 64})
    );
    this.idText = new xb.UIText({
      text: `Marker ID ${this.tracker.markerId}`,
      style: {
        width: 220,
        fontSize: 24,
        fontWeight: 'bold',
        color: TEXT,
        textAlign: 'center',
      },
    });
    idRow.add(this.idText);
    idRow.add(
      this.createButton('+', () => this.changeMarkerId(1), {width: 64})
    );
    card.add(idRow);

    this.statusText = new xb.UIText({
      text: this.tracker.status,
      style: {
        width: '100%',
        fontSize: 17,
        color: MUTED,
        textAlign: 'center',
        marginTop: 4,
      },
    });
    card.add(this.statusText);
    this.diagText = new xb.UIText({
      text: ' ',
      style: {width: '100%', fontSize: 14, color: MUTED, textAlign: 'center'},
    });
    card.add(this.diagText);

    const resetRow = new xb.UIPanel({
      style: {
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 4,
      },
    });
    resetRow.add(
      this.createButton(
        'Reset anchor',
        () => {
          this.tracker.resetAnchor();
          this.updateDashboard(true);
        },
        {width: '100%', accent: true}
      )
    );
    card.add(resetRow);
    card.add(
      new xb.UIText({
        text: 'Axes: X red, Y green, Z blue',
        style: {width: '100%', fontSize: 14, color: MUTED, textAlign: 'center'},
      })
    );
    this.add(card);
  }

  createButton(label, onClick, {width, accent = false} = {}) {
    const labelText = new xb.UIText({
      text: label,
      style: {
        fontSize: 20,
        fontWeight: 'bold',
        color: accent ? ACCENT : TEXT,
        textAlign: 'center',
      },
    });
    const button = new xb.UIButton({
      ariaLabel: label,
      onClick,
      style: {
        width,
        paddingTop: 8,
        paddingBottom: 8,
        paddingLeft: 16,
        paddingRight: 16,
        borderRadius: 12,
        backgroundColor: accent ? '#244b6e' : CONTROL,
        borderWidth: 1,
        borderColor: accent ? ACCENT : STROKE,
        alignItems: 'center',
        justifyContent: 'center',
        ':hover': {backgroundColor: CONTROL_HOVER},
        ':active': {backgroundColor: accent ? ACCENT : CONTROL_HOVER},
      },
      children: [labelText],
    });
    // Lets callers retitle the button (the dictionary toggle does).
    button.labelText = labelText;
    return button;
  }

  // Retained updates: only assign text / colour when a value actually changed,
  // since every assignment re-lays-out the card.
  updateDashboard(force = false) {
    if (!this.idText || !this.statusText) return;
    const idLabel = `Marker ID ${this.tracker.markerId}`;
    if (force || idLabel !== this.lastIdLabel) {
      this.idText.text = idLabel;
      this.lastIdLabel = idLabel;
    }
    if (force || this.tracker.dictionary !== this.lastDictionary) {
      this.dictionaryLabel.text = `Dictionary: ${this.tracker.dictionary}`;
      this.lastDictionary = this.tracker.dictionary;
    }
    if (force || this.tracker.status !== this.lastStatus) {
      this.statusText.text = this.tracker.status;
      this.statusText.style.color =
        this.tracker.state === 'tracked'
          ? '#69e6ad'
          : this.tracker.state === 'anchored'
            ? '#ffd27a'
            : MUTED;
      this.lastStatus = this.tracker.status;
    }
    if (this.diagText) {
      const diag = this.tracker.hasAnchor
        ? this.tracker.diagnosticsSummary
        : ' ';
      if (force || diag !== this.lastDiag) {
        this.diagText.text = diag;
        this.lastDiag = diag;
      }
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const options = new xb.Options();
  options.enableCamera('environment');
  options.deviceCamera.willCaptureFrequently = true;
  options.enableReticles();
  options.xrButton.showEnterSimulatorButton = true;
  options.setAppTitle('ArUco spatial anchor');

  xb.add(new ArucoAnchorDemo());
  xb.init(options);
});
