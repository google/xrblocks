import * as THREE from 'three';
import * as xb from 'xrblocks';

/**
 * Demonstrates how to use the XRTransition component to smoothly switch
 * between AR and VR backgrounds.
 */
class MainScript extends xb.Script {
  init() {
    this.add(new THREE.HemisphereLight(0xffffff, 0x666666, /*intensity=*/ 3));

    const geometry = new THREE.CylinderGeometry(
      0.2,
      0.2,
      0.4,
      /*segments=*/ 32
    );
    const material = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.8,
    });
    this.cylinder = new THREE.Mesh(geometry, material);
    this.cylinder.position.set(
      0,
      xb.core.user.height - 0.5,
      -xb.core.user.objectDistance
    );
    this.add(this.cylinder);
  }

  /**
   * On pinch, toggle between AR and VR modes and update cylinder color.
   */
  onSelectEnd() {
    if (!xb.core.transition) {
      console.warn('XRTransition not enabled.');
      return;
    }
    this.cylinder.material.color.set(Math.random() * 0xffffff);

    // Toggle between AR and VR based on the current mode.
    if (xb.core.transition.currentMode === 'AR') {
      xb.core.transition.toVR({color: Math.random() * 0xffffff});
    } else {
      xb.core.transition.toAR();
    }
  }
}

document.addEventListener('DOMContentLoaded', function () {
  const options = new xb.Options().enableXRTransitions();
  xb.add(new MainScript());
  xb.init(options);
});
