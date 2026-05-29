/**
 * RemoteUserAvatar: a lightweight three.js Group that visualizes a remote
 * peer using a head sphere and two hand "stick" meshes (wrist sphere +
 * up-to-five fingertip dots). It renders nothing if no pose has arrived.
 *
 * The avatar is intentionally minimal — netblocks ships a baseline that
 * works in every sample, and apps can opt into richer avatars by hiding
 * the default mesh (`avatar.defaultMesh.visible = false`) and parenting
 * their own meshes to `avatar.headPivot` / `avatar.handPivots[h]`.
 */
import * as THREE from 'three';
import * as xb from 'xrblocks';
import {InterpolatedPose} from './InterpolatedPose';
import {hashStringToIndex} from '../utils/IdUtils';

const FINGERTIP_INDICES = [4, 9, 14, 19, 24]; // thumb-tip, index-tip, middle-tip, ring-tip, pinky-tip

/**
 * Eight well-separated colors so two peers in the same room are easy to
 * tell apart at a glance. Hashing into a continuous hue space ended up
 * producing peers with near-identical hues too often (e.g., two adjacent
 * blues) — a discrete palette makes "who is who" obvious. Exported so
 * apps can match other UI (chat sender names, etc.) to the avatar color.
 */
export const AVATAR_PALETTE: number[] = [
  0xff5959, // red
  0xffa64d, // orange
  0xffd84d, // yellow
  0x5ad17a, // green
  0x4dc3ff, // cyan
  0x6a8cff, // blue
  0xb066ff, // purple
  0xff66c4, // pink
];

export interface RemoteUserAvatarOptions {
  peerId: string;
  displayName?: string;
}

export class RemoteUserAvatar extends THREE.Group {
  readonly peerId: string;
  private _displayName?: string;

  get displayName(): string | undefined {
    return this._displayName;
  }
  set displayName(name: string | undefined) {
    this.setDisplayName(name);
  }

  /** Smoothed pose buffer fed by NetSession. */
  readonly pose = new InterpolatedPose();

  /** Per-peer color derived from peerId, used to tint the default avatar. */
  readonly color: THREE.Color;

  /**
   * Subgroups consumers can re-parent custom meshes under to follow the
   * remote head / hand pose without touching netblocks internals.
   */
  readonly headPivot = new THREE.Group();
  readonly handPivots: [THREE.Group, THREE.Group] = [
    new THREE.Group(),
    new THREE.Group(),
  ];

  /** The default ball-and-stick avatar group. Hide to use your own meshes. */
  readonly defaultMesh = new THREE.Group();

  private _headSphere: THREE.Mesh;
  private _handGroups: [THREE.Group, THREE.Group];
  private _wristSpheres: [THREE.Mesh, THREE.Mesh];
  private _fingertipDots: [THREE.Mesh[], THREE.Mesh[]];
  private _nameLabel?: THREE.Object3D & {
    text?: string;
    sync?: () => void;
    dispose?: () => void;
  };
  private _nameLabelText = '';

  constructor(opts: RemoteUserAvatarOptions) {
    super();
    this.name = `RemoteUserAvatar(${opts.peerId})`;
    this.peerId = opts.peerId;
    this._displayName = opts.displayName;

    const paletteIdx = hashStringToIndex(opts.peerId, AVATAR_PALETTE.length);
    this.color = new THREE.Color(AVATAR_PALETTE[paletteIdx]);

    this.add(this.headPivot, this.handPivots[0], this.handPivots[1]);

    // Build the default mesh.
    const headMat = new THREE.MeshBasicMaterial({color: this.color});
    this._headSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 24, 16),
      headMat
    );
    this._headSphere.castShadow = false;

    const handMatA = new THREE.MeshBasicMaterial({color: this.color});
    const handMatB = new THREE.MeshBasicMaterial({color: this.color});
    const dotMat = new THREE.MeshBasicMaterial({color: this.color});

    this._wristSpheres = [
      new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 12), handMatA),
      new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 12), handMatB),
    ];
    this._handGroups = [new THREE.Group(), new THREE.Group()];
    this._fingertipDots = [[], []];
    for (let h = 0; h < 2; h++) {
      this._handGroups[h].add(this._wristSpheres[h]);
      for (let f = 0; f < FINGERTIP_INDICES.length; f++) {
        const dot = new THREE.Mesh(
          new THREE.SphereGeometry(0.01, 12, 8),
          dotMat
        );
        this._handGroups[h].add(dot);
        this._fingertipDots[h].push(dot);
      }
      this._handGroups[h].visible = false;
    }

    this.defaultMesh.add(
      this._headSphere,
      this._handGroups[0],
      this._handGroups[1]
    );
    this.add(this.defaultMesh);
    this._headSphere.visible = false; // until a pose arrives

    // Lazy-load troika SDF text for the name label so we don't pay the
    // import cost in samples that don't need it. Catch failures so a
    // missing optional dependency doesn't surface as an unhandled
    // rejection at construction time.
    this._initNameLabel().catch((err) => {
      console.warn('[netblocks] name label init failed:', err);
    });
  }

  private async _initNameLabel(): Promise<void> {
    const {Text} = await import('troika-three-text');
    if ((this as unknown as {_disposed?: boolean})._disposed) return;
    const label = new Text() as unknown as typeof this._nameLabel & object;
    (label as {text: string}).text = this._labelString();
    Object.assign(label as object, {
      fontSize: 0.04,
      color: 0xffffff,
      outlineWidth: 0.004,
      outlineColor: 0x000000,
      anchorX: 'center',
      anchorY: 'bottom',
    });
    (label as THREE.Object3D).position.set(0, 0, 0);
    this._nameLabel = label;
    this.add(label as unknown as THREE.Object3D);
    label.sync?.();
  }

  /** Sample the smoothed pose at `now` and update the local meshes. */
  applyPose(nowMs: number): void {
    if (!this.pose.hasData) return;
    const snap = this.pose.sample(nowMs);

    this.headPivot.position.copy(snap.head.position);
    this.headPivot.quaternion.copy(snap.head.quaternion);
    this._headSphere.position.copy(snap.head.position);
    this._headSphere.quaternion.copy(snap.head.quaternion);
    this._headSphere.visible = true;

    for (let h = 0; h < 2; h++) {
      const hand = snap.hands[h];
      const pivot = this.handPivots[h];
      const grp = this._handGroups[h];
      if (!hand.present) {
        grp.visible = false;
        continue;
      }
      pivot.position.copy(hand.position);
      pivot.quaternion.copy(hand.quaternion);
      this._wristSpheres[h].position.copy(hand.position);
      this._wristSpheres[h].quaternion.copy(hand.quaternion);
      grp.visible = true;
      const joints = hand.joints;
      if (joints) {
        for (let f = 0; f < FINGERTIP_INDICES.length; f++) {
          const idx = FINGERTIP_INDICES[f];
          const j = joints[idx];
          if (j) this._fingertipDots[h][f].position.copy(j);
        }
      }
    }

    // Billboard the SDF name label ~13cm above the head, facing the camera.
    if (this._nameLabel) {
      this._nameLabel.position.copy(snap.head.position);
      this._nameLabel.position.y += 0.13;
      const cam = xb.core?.camera;
      if (cam) this._nameLabel.lookAt(cam.position);
    }
  }

  /** Update the displayed name; safe to call before troika finishes loading. */
  setDisplayName(name: string | undefined): void {
    this._displayName = name;
    if (this._nameLabel) {
      this._nameLabel.text = this._labelString();
      this._nameLabel.sync?.();
    }
  }

  private _labelString(): string {
    return this._displayName || this.peerId.slice(0, 6);
  }

  dispose(): void {
    (this as unknown as {_disposed: boolean})._disposed = true;
    this._headSphere.geometry.dispose();
    (this._headSphere.material as THREE.Material).dispose();
    for (let h = 0; h < 2; h++) {
      this._wristSpheres[h].geometry.dispose();
      (this._wristSpheres[h].material as THREE.Material).dispose();
      for (const dot of this._fingertipDots[h]) {
        dot.geometry.dispose();
        (dot.material as THREE.Material).dispose();
      }
    }
    this._nameLabel?.dispose?.();
  }
}
