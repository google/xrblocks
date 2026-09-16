import * as THREE from 'three';
import * as xb from 'xrblocks';
import {
  AprilTagTracker,
  DEFAULT_TAG25H9_ID,
  DEFAULT_TAG25H9_SIZE_METERS,
  TAG25H9_MAX_ID,
  TAG25H9_MIN_ID,
  createAprilTagAnchorVisuals,
} from 'xrblocks/addons/apriltags/AprilTagTracker.js';

const TAG_SIZE_MM = DEFAULT_TAG25H9_SIZE_METERS * 1000;
const SURFACE = '#111923';
const SURFACE_RAISED = '#1c2938';
const CONTROL = '#263a50';
const CONTROL_HOVER = '#34516f';
const ACCENT = '#5ba7ff';
const TEXT = '#f4f8fc';
const MUTED = '#a8bbcf';
const STROKE = '#40556d';

class AprilTagAnchorDemo extends xb.Script {
  constructor() {
    super();
    this.tracker = new AprilTagTracker({
      tagId: DEFAULT_TAG25H9_ID,
      // Constant registration offset measured on Galaxy XR: without it the
      // anchor lands ~2 cm below and ~1 cm left of the printed tag. It is a
      // device-camera translation correction in metres, in the camera frame
      // (+x right, +y up, so this moves the anchor up and to the right).
      // Walking arcs give the self-calibration no head-tilt diversity, so
      // the vertical component is unobservable and must be seeded; the
      // solver refines from here whenever the geometry allows.
      calibration: {translation: [0.01, 0.02, 0]},
    });
    // Axes + outline square at the printed tag, thick enough to read from
    // across the room (see createAprilTagAnchorVisuals for why they are meshes
    // rather than AxesHelper/LineLoop).
    this.tracker.add(createAprilTagAnchorVisuals());
    this.add(this.tracker);
  }

  init() {
    this.createDashboard();
    this.updateDashboard(true);
  }

  update() {
    this.updateDashboard();
  }

  changeTagId(change) {
    const nextId = THREE.MathUtils.clamp(
      this.tracker.tagId + change,
      TAG25H9_MIN_ID,
      TAG25H9_MAX_ID
    );
    this.tracker.setTagId(nextId);
    this.updateDashboard(true);
  }

  // The dashboard is a UICard root (world-space, draggable, faces the user)
  // with UIPanel rows and UIButton / UIText leaves; see
  // docs/docs/manual/Migrating-to-v0-20-0.md for the tree conventions.
  createDashboard() {
    const card = new xb.UICard({
      size: {width: 0.52, height: 0.5},
      pixelSize: 0.00125,
      manipulation: {actions: {translate: {faceCamera: true}}},
      edge: true,
      style: {
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        gap: 13,
        padding: 22,
        backgroundColor: SURFACE,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: STROKE,
      },
    });
    card.name = 'AprilTagDashboard';
    card.position.set(0.42, 1.45, -1.05);

    card.add(
      new xb.UIText({
        text: 'AprilTag spatial anchor',
        style: {
          width: '100%',
          fontSize: 32,
          fontWeight: 'bold',
          color: TEXT,
          textAlign: 'center',
        },
      })
    );
    card.add(
      new xb.UIText({
        text: `tag25h9 | code width ${TAG_SIZE_MM.toFixed(1)} mm`,
        style: {width: '100%', fontSize: 18, color: MUTED, textAlign: 'center'},
      })
    );

    const idRow = new xb.UIPanel({
      style: {
        width: '100%',
        height: 58,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      },
    });
    card.add(idRow);
    this.createButton(idRow, '-', () => this.changeTagId(-1), {
      width: 64,
      fontSize: 32,
    });
    const idWell = new xb.UIPanel({
      style: {
        flexGrow: 1,
        height: 58,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: SURFACE_RAISED,
        borderRadius: 13,
      },
    });
    this.idText = new xb.UIText({
      text: '',
      style: {
        fontSize: 28,
        fontWeight: 'bold',
        color: TEXT,
        textAlign: 'center',
      },
    });
    idWell.add(this.idText);
    idRow.add(idWell);
    this.createButton(idRow, '+', () => this.changeTagId(1), {
      width: 64,
      fontSize: 32,
    });

    const statusWell = new xb.UIPanel({
      style: {
        width: '100%',
        flexGrow: 1,
        minHeight: 62,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        backgroundColor: SURFACE_RAISED,
        borderRadius: 13,
      },
    });
    this.statusText = new xb.UIText({
      text: '',
      style: {
        width: '100%',
        fontSize: 19,
        color: MUTED,
        textAlign: 'center',
        lineHeight: 25,
      },
    });
    statusWell.add(this.statusText);
    card.add(statusWell);

    this.diagText = new xb.UIText({
      text: '',
      style: {width: '100%', fontSize: 15, color: MUTED, textAlign: 'center'},
    });
    card.add(this.diagText);

    this.createButton(
      card,
      'Reset anchor',
      () => {
        this.tracker.resetAnchor();
        this.updateDashboard(true);
      },
      {width: '100%', height: 48, accent: true, fontSize: 20}
    );
    card.add(
      new xb.UIText({
        text: 'Axes: X red, Y green, Z blue',
        style: {width: '100%', fontSize: 16, color: MUTED, textAlign: 'center'},
      })
    );
    this.add(card);
  }

  createButton(
    parent,
    label,
    onClick,
    {width, height = 58, fontSize = 22, accent = false} = {}
  ) {
    const button = new xb.UIButton({
      ariaLabel: label,
      onClick,
      style: {
        ...(width === undefined ? {flexGrow: 1} : {width}),
        height,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: accent ? '#244b6e' : CONTROL,
        borderRadius: 13,
        borderWidth: accent ? 1 : 0,
        borderColor: accent ? ACCENT : STROKE,
        ':hover': {backgroundColor: CONTROL_HOVER},
        ':active': {backgroundColor: accent ? ACCENT : CONTROL_HOVER},
      },
      children: [
        new xb.UIText({
          text: label,
          style: {
            fontSize,
            fontWeight: accent ? 'bold' : 'normal',
            color: accent ? ACCENT : TEXT,
            textAlign: 'center',
          },
        }),
      ],
    });
    parent.add(button);
    return button;
  }

  // Retained updates: only assign text / colour when a value actually changed,
  // since every assignment re-lays-out the card.
  updateDashboard(force = false) {
    if (!this.idText || !this.statusText) return;
    const idLabel = `Tag ID ${this.tracker.tagId}`;
    if (force || idLabel !== this.lastIdLabel) {
      this.idText.text = idLabel;
      this.lastIdLabel = idLabel;
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
        : '';
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
  options.setAppTitle('AprilTag spatial anchor');

  xb.add(new AprilTagAnchorDemo());
  xb.init(options);
});
