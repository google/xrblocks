/**
 * In-scene debug quad for comparing the WebGL and WebGPU rendering paths of
 * the spatial UI samples. Paste into the devtools console (or drive it over
 * CDP) while the sample is running; call add() and remove() to A/B within ONE
 * page session — the scene lighting drifts between page loads, so cross-run
 * measurements are noise.
 *
 * Usage (any of the samples):
 *   const rig = makeDebugQuad(window.xb.core, {alpha: 0.5});
 *   rig.add();
 *   rig.remove();
 *
 * Options:
 *   color  CSS color string of the quad (default: the panels' on-screen body
 *          color measured from the reference render, rgb(85, 82, 81))
 *   alpha  material opacity (default 0.5)
 *   size   [width, height] in meters (default [0.6, 0.5])
 *   pos    [right, up, forward] offsets from the camera (default
 *          [0.55, 0.65, 2.0] — above the UI, right of the pendant lamp)
 */
export function makeDebugQuad(core, options = {}) {
  const THREE = core.THREE ?? window.THREE;
  const {
    color = 'rgb(85, 82, 81)',
    alpha = 0.5,
    size = [0.6, 0.5],
    pos = [0.55, 0.65, 2.0],
  } = options;

  let quad = null;
  return {
    add() {
      const scene = core.scene;
      const cam = core.camera;
      const mat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: alpha,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      mat.color.setStyle(color);
      quad = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]), mat);
      const p = new THREE.Vector3();
      cam.getWorldPosition(p);
      const dir = new THREE.Vector3();
      cam.getWorldDirection(dir);
      const right = new THREE.Vector3().crossVectors(dir, cam.up).normalize();
      quad.position
        .copy(p)
        .add(dir.clone().multiplyScalar(pos[2]))
        .add(new THREE.Vector3(0, pos[1], 0))
        .add(right.multiplyScalar(pos[0]));
      quad.renderOrder = 9999;
      quad.lookAt(p);
      quad.name = '__debugQuad';
      scene.add(quad);
      return quad;
    },
    remove() {
      if (quad) quad.removeFromParent();
      quad = null;
    },
  };
}
