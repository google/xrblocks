import * as THREE from 'three';
import * as xb from 'xrblocks';

const BASE_HEIGHT = 0.018;
const CONE_HEIGHT = 0.08;
const BALL_RADIUS = 0.025;

class SpatialPlacement extends xb.Script {
  static dependencies = {
    depth: xb.Depth,
    user: xb.User,
  };

  init({depth, user}) {
    this.depth = depth;
    this.user = user;
    this.add(new THREE.HemisphereLight(0xffffff, 0x3c4043, 3));
    this.baseGeometry = new THREE.CylinderGeometry(
      0.045,
      0.045,
      BASE_HEIGHT,
      24,
      1,
      true
    );
    this.coneGeometry = new THREE.ConeGeometry(0.035, CONE_HEIGHT, 24);
    this.ballGeometry = new THREE.SphereGeometry(BALL_RADIUS, 24, 16);
    this.placedMaterial = new THREE.MeshStandardMaterial({
      color: 0x4285f4,
      roughness: 0.35,
      side: THREE.DoubleSide,
    });
    this.previewMaterial = this.placedMaterial.clone();
    this.previewMaterial.transparent = true;
    this.previewMaterial.opacity = 0.35;

    this.previewMarker = this.createMarker(this.previewMaterial, 'Depth hit');
    this.placedMarker = this.createMarker(
      this.placedMaterial,
      'Placed depth hit'
    );
    this.add(this.previewMarker, this.placedMarker);
  }

  createMarker(material, name) {
    const marker = new THREE.Group();
    marker.name = name;
    marker.visible = false;
    marker.xb = {pointerEvents: 'none'};

    const base = new THREE.Mesh(this.baseGeometry, material);
    base.position.y = BASE_HEIGHT / 2;

    const cone = new THREE.Mesh(this.coneGeometry, material);
    cone.rotation.x = Math.PI;
    cone.position.y = BASE_HEIGHT + CONE_HEIGHT / 2;

    const ball = new THREE.Mesh(this.ballGeometry, material);
    ball.position.y = BASE_HEIGHT + CONE_HEIGHT + BALL_RADIUS;

    marker.add(base, cone, ball);
    return marker;
  }

  update() {
    const hit = this.depth.depthMesh
      ? this.user.getIntersectionAt(this.depth.depthMesh)
      : null;
    this.previewMarker.visible = Boolean(hit);
    if (hit) this.placeMarker(this.previewMarker, hit);
  }

  onSelectStart(event) {
    const intersection = event.intersection;
    if (event.surface !== this.depth.depthMesh || !intersection) {
      return;
    }

    this.placeMarker(this.placedMarker, intersection);
    this.placedMarker.visible = true;
  }

  placeMarker(marker, intersection) {
    const normal = intersection.normal ?? intersection.face?.normal;
    if (!normal) {
      marker.position.copy(intersection.point);
      return;
    }

    xb.placeObjectAtIntersectionFacingTarget(
      marker,
      {...intersection, normal},
      xb.core.camera
    );
  }

  dispose() {
    this.baseGeometry.dispose();
    this.coneGeometry.dispose();
    this.ballGeometry.dispose();
    this.previewMaterial.dispose();
    this.placedMaterial.dispose();
  }
}

const options = new xb.Options();
options.enableDepth();
options.reticles.projectOnDepthMesh = true;

xb.add(new SpatialPlacement());
xb.init(options);
