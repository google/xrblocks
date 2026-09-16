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
  // with UIPanel rows and UIButton / UIText leaves, built the same way as the
  // objects_3d control card: default pixel size, every text created with its
  // initial string, fixed-height rows, no flex-grow filler.
  createDashboard() {
    const card = new xb.UICard({
      size: {width: 0.6, height: 0.52},
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
    card.name = 'AprilTagDashboard';
    card.position.set(0.42, 1.45, -1.05);

    card.add(
      new xb.UIText({
        text: 'AprilTag spatial anchor',
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
        text: `tag25h9 | code width ${TAG_SIZE_MM.toFixed(1)} mm`,
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
    idRow.add(this.createButton('-', () => this.changeTagId(-1), {width: 64}));
    this.idText = new xb.UIText({
      text: `Tag ID ${this.tracker.tagId}`,
      style: {
        width: 220,
        fontSize: 24,
        fontWeight: 'bold',
        color: TEXT,
        textAlign: 'center',
      },
    });
    idRow.add(this.idText);
    idRow.add(this.createButton('+', () => this.changeTagId(1), {width: 64}));
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
    return new xb.UIButton({
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
      children: [
        new xb.UIText({
          text: label,
          style: {
            fontSize: 20,
            fontWeight: 'bold',
            color: accent ? ACCENT : TEXT,
            textAlign: 'center',
          },
        }),
      ],
    });
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
  options.setAppTitle('AprilTag spatial anchor');

  xb.add(new AprilTagAnchorDemo());
  xb.init(options);
});
