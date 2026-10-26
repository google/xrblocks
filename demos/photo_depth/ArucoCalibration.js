/**
 * Optional camera calibration with a printed ArUco marker, the same flow as
 * the objects_3d demo: the addon's tracker self-calibrates the device
 * camera's extrinsics against the headset's own tracking while the user walks
 * around the marker; "Freeze" hands the recovered correction to the photo
 * pipeline. The tracker also persists a converged calibration per device, so
 * later sessions can reuse it without a marker (see CameraModel).
 */
import * as THREE from 'three';
import * as xb from 'xrblocks';
import {
  ARUCO_DICTIONARY_SIZES,
  ArucoTracker,
  DEFAULT_ARUCO_MARKER_ID,
  DEFAULT_ARUCO_MARKER_SIZE_METERS,
  createArucoAnchorVisuals,
} from 'xrblocks/addons/aruco/index.js';

const REFRESH_MS = 250;

export class ArucoCalibration {
  tracker = null;
  visuals = null;
  card = null;
  lastRefresh = 0;

  /**
   * @param onFreeze - Called with `(calibration, converged)` on "Freeze".
   * @param onClose - Called when the card closes without freezing.
   */
  constructor({onFreeze, onClose}) {
    this.onFreeze = onFreeze;
    this.onClose = onClose;
    this.markerId = xb.getUrlParamInt('markerId', DEFAULT_ARUCO_MARKER_ID);
    this.markerSizeMeters = xb.getUrlParamFloat(
      'markerSize',
      DEFAULT_ARUCO_MARKER_SIZE_METERS
    );
  }

  get isOpen() {
    return this.card !== null;
  }

  /**
   * Starts a calibration session: a live tracker with its anchor visuals and
   * a status card added to `parent`.
   */
  open(parent) {
    this.close();
    this.tracker = new ArucoTracker({
      markerId: this.markerId,
      markerSizeMeters: this.markerSizeMeters,
    });
    // Thick axes + outline square at the printed marker, readable from across
    // the room, so the registration can be eyeballed against the print.
    this.visuals = createArucoAnchorVisuals({
      markerSizeMeters: this.markerSizeMeters,
    });
    this.tracker.add(this.visuals);
    xb.add(this.tracker);

    this.idText = new xb.UIText({
      text: `Marker ID ${this.tracker.markerId}`,
      style: {fontSize: 15, fontWeight: 'bold'},
    });
    this.statusText = new xb.UIText({
      text: this.tracker.status,
      style: {fontSize: 13, lineHeight: 1.3, whiteSpace: 'pre-line'},
    });
    this.diagnosticsText = new xb.UIText({
      text: '',
      style: {fontSize: 12, lineHeight: 1.3, opacity: 0.7},
    });
    this.card = new xb.UICard({
      size: {width: 0.5, height: 'auto'},
      manipulation: true,
      edge: true,
      style: {flexDirection: 'column', gap: 10, padding: 16},
      children: [
        new xb.UIText({
          text: 'Camera calibration (ArUco)',
          style: {fontSize: 20, fontWeight: 'bold'},
        }),
        new xb.UIText({
          text:
            `${this.tracker.dictionary} | black square ` +
            `${(this.markerSizeMeters * 1000).toFixed(0)} mm. Walk a couple ` +
            'of meters around the marker, looking at it from several ' +
            'angles, then press Freeze.',
          style: {fontSize: 13, lineHeight: 1.35, opacity: 0.8},
        }),
        new xb.UIPanel({
          style: {flexDirection: 'row', gap: 8, alignItems: 'center'},
          children: [
            new xb.UIButton({
              label: '-',
              ariaLabel: 'Previous marker ID',
              onClick: () => this.nudgeMarkerId(-1),
            }),
            this.idText,
            new xb.UIButton({
              label: '+',
              ariaLabel: 'Next marker ID',
              onClick: () => this.nudgeMarkerId(1),
            }),
          ],
        }),
        this.statusText,
        this.diagnosticsText,
        new xb.UIPanel({
          style: {flexDirection: 'row', gap: 10},
          children: [
            new xb.UIButton({
              label: 'Freeze',
              icon: 'check',
              style: {flexGrow: 1},
              onClick: () => this.freeze(),
            }),
            new xb.UIButton({
              label: 'Cancel',
              icon: 'close',
              style: {flexGrow: 1},
              onClick: () => {
                this.close();
                this.onClose?.();
              },
            }),
          ],
        }),
      ],
    });
    this.card.position.set(-0.45, xb.user.height + 0.05, -1.1);
    this.card.rotation.y = 0.35;
    parent.add(this.card);
  }

  nudgeMarkerId(delta) {
    if (!this.tracker) return;
    this.tracker.setMarkerId(
      THREE.MathUtils.clamp(
        this.tracker.markerId + delta,
        0,
        ARUCO_DICTIONARY_SIZES[this.tracker.dictionary] - 1
      )
    );
    this.markerId = this.tracker.markerId;
    this.idText.text = `Marker ID ${this.markerId}`;
  }

  /** Keeps the card's live status current; call every frame. */
  update() {
    if (!this.card || !this.tracker) return;
    const now = performance.now();
    if (now - this.lastRefresh < REFRESH_MS) return;
    this.lastRefresh = now;
    const converged = this.tracker.diagnostics.calibrationConverged;
    this.statusText.text =
      `${this.tracker.status}\n` +
      (converged ? 'Calibration converged.' : 'Calibration not converged yet.');
    this.diagnosticsText.text = this.tracker.diagnosticsSummary;
  }

  /** Pauses marker detection while another consumer grabs camera frames. */
  setPaused(paused) {
    if (this.tracker && this.card) this.tracker.setDetectionPaused(paused);
  }

  freeze() {
    if (!this.tracker) return;
    this.tracker.setDetectionPaused(true);
    const calibration = this.tracker.getCalibration();
    const converged = this.tracker.diagnostics.calibrationConverged;
    // Close the card but keep the paused tracker and its anchor visuals, so
    // the frozen registration can still be compared with the print.
    this.removeCard();
    this.onFreeze?.(calibration, converged);
  }

  removeCard() {
    // Removing a Script from the scene uninitializes (disposes) it.
    this.card?.removeFromParent();
    this.card = null;
  }

  /** Ends the session: card, tracker (its worker) and visuals. */
  close() {
    this.removeCard();
    if (this.tracker) {
      xb.core.scriptsManager.uninitScript(this.tracker);
      this.tracker.removeFromParent();
      this.tracker = null;
    }
    // three.js never frees geometries or materials on removal.
    this.visuals?.dispose();
    this.visuals = null;
  }
}
