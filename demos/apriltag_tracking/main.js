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

// Anchor visuals are built from SOLID GEOMETRY (cylinders and bars), not from
// AxesHelper/LineLoop. Line primitives cannot be thickened at all in WebGL:
// LineBasicMaterial.linewidth is ignored by the renderer and every line draws
// one pixel wide, so it shrinks to a barely-visible hairline at exactly the
// distance you stand to check whether the tag is being tracked. Meshes are the
// only way to get a stroke with real width.
const AXIS_LENGTH_METERS = 0.12;
const AXIS_RADIUS_METERS = 0.005;
const OUTLINE_THICKNESS_METERS = 0.008;

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
    this.tracker.add(this.createAxes());
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

  // Display-only overlays must never be raycast targets: they sit right where
  // the user points and would otherwise swallow clicks meant for the dashboard.
  makeDecorative(object3d) {
    object3d.raycast = () => {};
    for (const child of object3d.children) this.makeDecorative(child);
    return object3d;
  }

  createAxes() {
    const group = new THREE.Group();
    // One shared cylinder, pushed up its own length so it grows FROM the
    // origin rather than straddling it -- then each axis is just a rotation.
    const geometry = new THREE.CylinderGeometry(
      AXIS_RADIUS_METERS, AXIS_RADIUS_METERS, AXIS_LENGTH_METERS, 12
    );
    geometry.translate(0, AXIS_LENGTH_METERS / 2, 0);
    // Cylinders run along +Y, so Y is the untouched case. Colours match the
    // dashboard legend (X red, Y green, Z blue) and AxesHelper's convention.
    const axes = [
      [0xff3b30, [0, 0, -Math.PI / 2]],
      [0x34c759, [0, 0, 0]],
      [0x2f7bff, [Math.PI / 2, 0, 0]],
    ];
    for (const [color, rotation] of axes) {
      // Unlit on purpose: the overlay has to read the same under whatever
      // lighting the room happens to have.
      const axis = new THREE.Mesh(
        geometry, new THREE.MeshBasicMaterial({color})
      );
      axis.rotation.set(...rotation);
      group.add(axis);
    }
    return this.makeDecorative(group);
  }

  createTagOutline() {
    const size = DEFAULT_TAG25H9_SIZE_METERS;
    const half = size / 2;
    const thickness = OUTLINE_THICKNESS_METERS;
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({color: 0xffffff});
    // Each bar overhangs by one thickness so the four corners overlap and
    // close, instead of leaving a notch at every corner.
    const horizontal = new THREE.BoxGeometry(size + thickness, thickness, thickness);
    const vertical = new THREE.BoxGeometry(thickness, size + thickness, thickness);
    const bars = [
      [horizontal, 0, half],
      [horizontal, 0, -half],
      [vertical, -half, 0],
      [vertical, half, 0],
    ];
    for (const [geometry, x, y] of bars) {
      const bar = new THREE.Mesh(geometry, material);
      bar.position.set(x, y, 0);
      group.add(bar);
    }
    return this.makeDecorative(group);
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
