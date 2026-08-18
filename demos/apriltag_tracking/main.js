import * as uikit from '@pmndrs/uikit';
import * as THREE from 'three';
import * as xb from 'xrblocks';
import 'xrblocks/addons/simulator/SimulatorAddons.js';
import {UICore, UIPanel, UIText, raycastSortFunction} from 'uiblocks';
import {
  AprilTagTracker,
  DEFAULT_TAG25H9_ID,
  DEFAULT_TAG25H9_SIZE_METERS,
  TAG25H9_MAX_ID,
  TAG25H9_MIN_ID,
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
    this.uiCore = new UICore(this);
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
    this.tracker.add(new THREE.AxesHelper(0.12));
    this.tracker.add(this.createTagOutline());
    this.add(this.tracker);
  }

  init() {
    if (xb.core.input?.raycaster) {
      xb.core.input.raycaster.sortFunction = raycastSortFunction;
    }
    this.createDashboard();
    this.updateDashboard(true);
  }

  update() {
    this.updateDashboard();
  }

  dispose() {
    this.uiCore.dispose();
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

  createDashboard() {
    const card = this.uiCore.createCard({
      name: 'AprilTagDashboard',
      sizeX: 0.52,
      sizeY: 0.5,
      pixelSize: 0.00125,
      position: new THREE.Vector3(0.42, 1.45, -1.05),
    });
    const root = new UIPanel({
      width: '100%',
      height: '100%',
      flexDirection: 'column',
      gap: 13,
      padding: 22,
      fillColor: SURFACE,
      cornerRadius: 24,
      strokeWidth: 1,
      strokeColor: STROKE,
      strokeAlign: 'inside',
      dropShadowColor: '#000000',
      dropShadowBlur: 18,
      dropShadowSpread: 2,
    });
    card.add(root);

    root.add(
      new UIText('AprilTag spatial anchor', {
        width: '100%',
        fontSize: 27,
        fontWeight: 'bold',
        color: TEXT,
        textAlign: 'center',
      })
    );
    root.add(
      new UIText(`tag25h9 | code width ${TAG_SIZE_MM.toFixed(1)} mm`, {
        width: '100%',
        fontSize: 16,
        color: MUTED,
        textAlign: 'center',
      })
    );

    const idRow = new UIPanel({
      width: '100%',
      height: 58,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    });
    root.add(idRow);
    this.createButton(idRow, '-', () => this.changeTagId(-1), {
      width: 64,
      fontSize: 30,
    });
    const idWell = new UIPanel({
      flexGrow: 1,
      height: 58,
      alignItems: 'center',
      justifyContent: 'center',
      fillColor: SURFACE_RAISED,
      cornerRadius: 13,
      innerShadowColor: '#000000',
      innerShadowBlur: 8,
    });
    this.idText = new UIText('', {
      fontSize: 25,
      fontWeight: 'bold',
      color: TEXT,
      textAlign: 'center',
    });
    idWell.add(this.idText);
    idRow.add(idWell);
    this.createButton(idRow, '+', () => this.changeTagId(1), {
      width: 64,
      fontSize: 30,
    });

    const statusWell = new UIPanel({
      width: '100%',
      flexGrow: 1,
      minHeight: 62,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 12,
      fillColor: SURFACE_RAISED,
      cornerRadius: 13,
    });
    this.statusText = new UIText('', {
      width: '100%',
      fontSize: 17,
      color: MUTED,
      textAlign: 'center',
      maxWidth: 290,
      lineHeight: 22,
    });
    statusWell.add(this.statusText);
    root.add(statusWell);

    this.diagText = new UIText('', {
      width: '100%',
      fontSize: 13,
      color: MUTED,
      textAlign: 'center',
    });
    root.add(this.diagText);

    this.createButton(
      root,
      'Reset anchor',
      () => {
        this.tracker.resetAnchor();
        this.updateDashboard(true);
      },
      {width: '100%', height: 46, accent: true, fontSize: 18}
    );
    root.add(
      new UIText('Axes: X red, Y green, Z blue', {
        width: '100%',
        fontSize: 14,
        color: MUTED,
        textAlign: 'center',
      })
    );
  }

  createButton(
    parent,
    label,
    onClick,
    {width, height = 58, fontSize = 20, accent = false} = {}
  ) {
    let hovered = false;
    const baseColor = accent ? '#244b6e' : CONTROL;
    const button = new UIPanel({
      ...(width === undefined ? {flexGrow: 1} : {width}),
      height,
      alignItems: 'center',
      justifyContent: 'center',
      fillColor: baseColor,
      cornerRadius: 13,
      strokeWidth: accent ? 1 : 0,
      strokeColor: accent ? ACCENT : STROKE,
      strokeAlign: 'inside',
      onHoverEnter: () => {
        hovered = true;
        button.setFillColor(CONTROL_HOVER);
      },
      onHoverExit: () => {
        hovered = false;
        button.setFillColor(baseColor);
      },
      onClick: () => {
        onClick();
        if (!hovered) button.setFillColor(baseColor);
        return true;
      },
    });
    button.add(
      new UIText(label, {
        fontSize,
        fontWeight: accent ? 'bold' : 'normal',
        color: accent ? ACCENT : TEXT,
        textAlign: 'center',
      })
    );
    parent.add(button);
    return button;
  }

  updateDashboard(force = false) {
    if (!this.idText || !this.statusText) return;
    const idLabel = `Tag ID ${this.tracker.tagId}`;
    if (force || idLabel !== this.lastIdLabel) {
      this.idText.setText(idLabel);
      this.lastIdLabel = idLabel;
    }
    if (force || this.tracker.status !== this.lastStatus) {
      this.statusText.setText(this.tracker.status);
      this.statusText.setColor(
        this.tracker.state === 'tracked'
          ? '#69e6ad'
          : this.tracker.state === 'anchored'
            ? '#ffd27a'
            : MUTED
      );
      this.lastStatus = this.tracker.status;
    }
    if (this.diagText) {
      const diag = this.tracker.hasAnchor
        ? this.tracker.diagnosticsSummary
        : '';
      if (force || diag !== this.lastDiag) {
        this.diagText.setText(diag);
        this.lastDiag = diag;
      }
    }
  }

  createTagOutline() {
    const halfSize = DEFAULT_TAG25H9_SIZE_METERS / 2;
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-halfSize, halfSize, 0),
      new THREE.Vector3(halfSize, halfSize, 0),
      new THREE.Vector3(halfSize, -halfSize, 0),
      new THREE.Vector3(-halfSize, -halfSize, 0),
    ]);
    return new THREE.LineLoop(
      geometry,
      new THREE.LineBasicMaterial({color: 0xffffff})
    );
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const options = new xb.Options();
  options.enableUI();
  options.uikit.enable(uikit);
  options.enableCamera('environment');
  options.deviceCamera.willCaptureFrequently = true;
  options.reticles.enabled = true;
  options.xrButton.showEnterSimulatorButton = true;
  options.setAppTitle('AprilTag spatial anchor');

  xb.add(new AprilTagAnchorDemo());
  xb.init(options);
});
