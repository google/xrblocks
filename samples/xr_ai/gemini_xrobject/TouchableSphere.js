import * as THREE from 'three';
import * as xb from 'xrblocks';

export class TouchableSphere extends xb.MeshScript {
  constructor(detectedObject, radius = 0.2, onActivate, onDeactivate) {
    const inactiveColor = new THREE.Color(0xd1e2ff);
    super(
      new THREE.SphereGeometry(radius, 32, 16),
      new THREE.MeshBasicMaterial({
        color: inactiveColor,
        transparent: true,
        opacity: 0.9,
      })
    );

    this.object = detectedObject;
    this.position.copy(detectedObject.position);
    this.inactiveColor = inactiveColor;
    this.activeColor = new THREE.Color(0x4970ff);
    this.radius = radius;
    this.onActivate = onActivate;
    this.onDeactivate = onDeactivate;
    this.active = false;
  }

  init() {
    const text = new xb.UIText({
      text: this.object.label,
      pointerEvents: 'none',
      style: {
        width: '100%',
        fontSize: 24,
        textAlign: 'center',
      },
    });
    const label = new xb.UICard({
      size: {width: 0.22, height: 0.08},
      pointerEvents: 'none',
      children: [text],
    });
    label.position.set(0, this.radius + 0.06, 0);
    label.add(new xb.FaceCamera({mode: 'spherical', smoothing: 1}));
    this.add(label);
  }

  onObjectSelectStart(event) {
    this.activate(event);
    return true;
  }

  onObjectSelectEnd(event) {
    this.deactivate(event);
    return true;
  }

  onObjectTouchStart(event) {
    this.activate(event);
    return true;
  }

  onObjectTouchEnd(event) {
    this.deactivate(event);
    return true;
  }

  activate(event) {
    if (this.active) return;
    this.setActive(true);
    this.onActivate?.(event);
  }

  deactivate(event) {
    if (!this.active) return;
    this.setActive(false);
    this.onDeactivate?.(event);
  }

  setActive(active) {
    this.active = active;
    this.material.color.copy(active ? this.activeColor : this.inactiveColor);
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
