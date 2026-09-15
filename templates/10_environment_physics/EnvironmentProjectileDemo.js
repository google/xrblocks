import * as THREE from 'three';
import * as xb from 'xrblocks';

const MAX_PROJECTILES = 16;

export class EnvironmentProjectileDemo extends xb.Script {
  constructor() {
    super();
    this.projectiles = [];
    this.direction = new THREE.Vector3();
    this.origin = new THREE.Vector3();
    this.geometry = new THREE.SphereGeometry(0.045, 20, 12);
    this.material = new THREE.MeshStandardMaterial({
      color: 0x54d6ff,
      roughness: 0.22,
      metalness: 0.2,
    });
  }

  init() {
    this.add(new THREE.HemisphereLight(0xffffff, 0x18233d, 2));
  }

  initPhysics(physics) {
    this.physics = physics;
    this.RAPIER = physics.RAPIER;
  }

  onSelectEnd() {
    if (!this.physics) return;
    this.launch();
  }

  launch() {
    xb.core.camera.getWorldPosition(this.origin);
    xb.core.camera.getWorldDirection(this.direction);
    const position = this.origin.clone().addScaledVector(this.direction, 0.28);
    const body = this.physics.blendedWorld.createRigidBody(
      this.RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .setLinvel(
          this.direction.x * 3.6,
          this.direction.y * 3.6,
          this.direction.z * 3.6
        )
        .setCcdEnabled(true)
    );
    this.physics.blendedWorld.createCollider(
      this.RAPIER.ColliderDesc.ball(0.045).setRestitution(0.55),
      body
    );
    const mesh = new THREE.Mesh(this.geometry, this.material);
    mesh.position.copy(position);
    this.add(mesh);
    this.projectiles.push({body, mesh, bornAt: performance.now()});
    if (this.projectiles.length > MAX_PROJECTILES)
      this.removeProjectile(this.projectiles.shift());
  }

  physicsStep() {
    const now = performance.now();
    for (const projectile of [...this.projectiles]) {
      projectile.mesh.position.copy(projectile.body.translation());
      projectile.mesh.quaternion.copy(projectile.body.rotation());
      if (
        now - projectile.bornAt > 12000 /*ms*/ ||
        projectile.mesh.position.y < -4
      )
        this.removeProjectile(projectile);
    }
  }

  removeProjectile(projectile) {
    if (!projectile) return;
    this.physics?.blendedWorld.removeRigidBody(projectile.body);
    this.remove(projectile.mesh);
    this.projectiles = this.projectiles.filter(
      (candidate) => candidate !== projectile
    );
  }

  dispose() {
    for (const projectile of [...this.projectiles])
      this.removeProjectile(projectile);
    this.geometry.dispose();
    this.material.dispose();
  }
}
