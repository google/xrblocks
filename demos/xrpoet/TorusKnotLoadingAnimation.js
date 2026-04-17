import * as THREE from 'three';

export class TorusKnotLoadingAnimation extends THREE.Points {
  ignoreReticleRaycast = true;

  constructor() {
    const baseGeometry = new THREE.TorusKnotGeometry(0.15, 0.04, 200, 40);
    const positions = baseGeometry.attributes.position.array;
    const particleCount = positions.length / 3;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const colors = new Float32Array(particleCount * 3);
    const color = new THREE.Color();

    for (let i = 0; i < particleCount; i++) {
      const x = positions[i * 3];
      const y = positions[i * 3 + 1];

      // Mix cyan and magenta based on position
      const mixRatio = (Math.sin(x * 10) + Math.cos(y * 10) + 2) / 4;
      color.setHSL(0.6 + mixRatio * 0.3, 0.8, 0.6);

      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.005,
      vertexColors: true,
      transparent: true,
      opacity: 0, // Start at 0 for fade in
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    super(geometry, material);

    this.position.set(0, 0, 0.1); // Slightly in front
    this.visible = false;
  }

  update(isProcessing) {
    if (this.visible) {
      const elapsedTime = performance.now() * 0.001;

      // Rotate on Z-axis for a flat, 2D spirograph feel
      this.rotation.z = elapsedTime * 0.4;

      // Subtle breathing/pulsing effect
      const scale = 1 + Math.sin(elapsedTime * 2) * 0.05;
      this.scale.setScalar(scale);

      // Handle fade in/out
      if (isProcessing) {
        this.material.opacity = Math.min(this.material.opacity + 0.02, 0.8);
      } else {
        this.material.opacity = Math.max(this.material.opacity - 0.02, 0);
        if (this.material.opacity === 0) {
          this.visible = false;
        }
      }
    }
  }

  show() {
    this.material.opacity = 0;
    this.visible = true;
  }
}
