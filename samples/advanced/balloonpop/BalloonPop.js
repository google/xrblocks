import * as THREE from 'three';
import * as xb from 'xrblocks';
import {playPopSound, playWhooshSound} from './audio.js';

// --- CONSTANTS ---
const DART_SPEED = 15.0;
const DART_GRAVITY_SCALE = 0.1;
const MENU_WIDTH = 0.85;
const PARTICLE_COUNT = 30;
const PARTICLE_LIFE = 1.0;
const BOUNDARY_RADIUS = 7.62;
const BOUNDARY_IMPULSE = 0.02;

// Physics Groups
export const GROUP_WORLD = (0x0001 << 16) | (0x0002 | 0x0004);
const GROUP_BALLOON = (0x0002 << 16) | (0x0001 | 0x0002 | 0x0004);
const GROUP_DART = (0x0004 << 16) | (0x0001 | 0x0002);

// --- UI HELPER ---
function createStepperControl(
  game,
  parent,
  labelText,
  valueRef,
  min,
  max,
  step,
  isCount
) {
  const row = new xb.UIPanel({
    style: {
      width: '100%',
      height: 78,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
  });
  const valueText = new xb.UIText({
    text: formatStepperValue(game[valueRef], labelText, isCount),
    style: {
      flexGrow: 1,
      fontSize: 28,
      textAlign: 'center',
    },
  });
  const adjust = (amount) => {
    game[valueRef] = THREE.MathUtils.clamp(game[valueRef] + amount, min, max);
    valueText.text = formatStepperValue(game[valueRef], labelText, isCount);
    game.updateScoreDisplay();
  };

  row.add(
    createControlButton('remove', `Decrease ${labelText}`, () => adjust(-step)),
    valueText,
    createControlButton('add', `Increase ${labelText}`, () => adjust(step))
  );
  parent.add(row);
}

function formatStepperValue(value, label, isCount) {
  return `${label}: ${isCount ? value : `${Math.round(value * 100)}%`}`;
}

function createControlButton(icon, ariaLabel, onClick) {
  return new xb.UIButton({
    icon,
    ariaLabel,
    onClick,
    style: {
      width: 78,
      height: 64,
      fontSize: 32,
    },
  });
}

export class BalloonGame extends xb.Script {
  constructor() {
    super();
    this.balloons = new Map();
    this.darts = new Map();
    this.particles = [];
    this.balloonCount = 10;
    this.balloonSpeed = 0.03;
    this.balloonsPopped = 0;
    this.activeDart = null;
    this.menuPanel = null;
    this.isMenuExpanded = true;
    this.physics = null;
    this.physicsWorld = null;
    this.RAPIER = null;
    this.balloonModel = null;
    this.dartModel = null;
    this.particleGeometry = null;
    this.particleMaterial = null;
    this.menuPos = new THREE.Vector3(0.6, 1.3, -1.0);
    this.menuRot = new THREE.Euler(0, -0.4, 0);
    this.gameStarted = false;
  }

  async init() {
    // Post-init Stable Activation of Depth Mesh Physics
    setTimeout(() => {
      const options = xb.core.registry.get(xb.Options);
      if (options && options.depth) {
        options.depth.enabled = true;
        if (options.depth.depthMesh) {
          options.depth.depthMesh.enabled = true;
          options.depth.depthMesh.physicsEnabled = true;
          options.depth.depthMesh.collisionGroups = GROUP_WORLD;
        }
      }
    }, 1000);

    this.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3));
    const dirLight = new THREE.DirectionalLight(0xffffff, 2);
    dirLight.position.set(1, 2, 1);
    this.add(dirLight);

    this.createPrefabs();
    this.renderMenu();
  }

  createPrefabs() {
    // --- DART ---
    this.dartModel = new THREE.Group();
    const needleMat = new THREE.MeshStandardMaterial({
      color: 0xaaaaaa,
      metalness: 1.0,
      roughness: 0.1,
    });
    const silverMat = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      metalness: 0.8,
      roughness: 0.3,
    });
    const redMat = new THREE.MeshStandardMaterial({
      color: 0xaa0000,
      roughness: 0.5,
    });
    const finMat = new THREE.MeshStandardMaterial({
      color: 0xcc0000,
      roughness: 0.6,
    });
    const needle = new THREE.Mesh(
      new THREE.ConeGeometry(0.002, 0.04, 6),
      needleMat
    );
    needle.position.y = 0.17;
    const tipHolder = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.012, 0.03, 8),
      silverMat
    );
    tipHolder.position.y = 0.135;
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.01, 0.18, 8),
      redMat
    );
    body.position.y = 0.03;
    const createFin = (rotationY) => {
      const fin = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.05, 0.002, 1, 1, 1),
        finMat
      );
      fin.position.set(0, -0.05, 0);
      fin.rotation.set(Math.PI, rotationY, 0);
      return fin;
    };
    this.dartModel.add(needle, tipHolder, body);
    this.dartModel.add(createFin(0));
    this.dartModel.add(createFin(Math.PI / 2));
    this.dartModel.add(createFin(Math.PI));
    this.dartModel.add(createFin(Math.PI * 1.5));

    // --- HIGH-FIDELITY BALLOON ---
    this.balloonModel = new THREE.Group();
    const balloonGeo = new THREE.SphereGeometry(0.5, 32, 32);
    const pos = balloonGeo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      if (v.y < 0) {
        const t = 1.0 - Math.abs(v.y) * 0.35;
        v.x *= t;
        v.z *= t;
      }
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    balloonGeo.computeVertexNormals();
    const balloonMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.2,
      metalness: 0.1,
      transparent: true,
      opacity: 0.85,
      side: THREE.FrontSide,
    });
    this.balloonModel.add(new THREE.Mesh(balloonGeo, balloonMat));
    const knotGeo = new THREE.CylinderGeometry(0.03, 0.01, 0.12, 16);
    knotGeo.translate(0, -0.54, 0);
    this.balloonModel.add(new THREE.Mesh(knotGeo, balloonMat));
    const ringGeo = new THREE.TorusGeometry(0.035, 0.015, 8, 24);
    ringGeo.rotateX(Math.PI / 2);
    ringGeo.translate(0, -0.6, 0);
    this.balloonModel.add(new THREE.Mesh(ringGeo, balloonMat));

    this.particleGeometry = new THREE.PlaneGeometry(0.08, 0.08);
    this.particleMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1.0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
  }

  initPhysics(physics) {
    this.physics = physics;
    this.physicsWorld = physics.blendedWorld;
    this.RAPIER = physics.RAPIER;
    this.spawnBalloons();
    this.renderMenu();
    this.renderReadme();
  }

  renderMenu() {
    if (this.menuPanel) {
      this.menuPos.copy(this.menuPanel.position);
      this.menuRot.copy(this.menuPanel.rotation);
      this.remove(this.menuPanel);
    }
    if (this.balloonsPopped > 0) {
      this.isMenuExpanded = false;
    }
    const menuHeight = this.isMenuExpanded ? 0.58 : 0.22;

    this.menuPanel = new xb.UICard({
      size: {width: MENU_WIDTH, height: menuHeight},
      manipulation: {
        actions: {translate: {faceCamera: false}},
        handle: {action: xb.ManipulationAction.Translate},
      },
      edge: true,
    });
    this.menuPanel.name = 'Balloon controls';
    this.menuPanel.position.copy(this.menuPos);
    this.menuPanel.rotation.copy(this.menuRot);
    this.add(this.menuPanel);

    const header = new xb.UIPanel({
      style: {
        width: '100%',
        height: 82,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
      },
    });
    const toggle = new xb.UIButton({
      label: this.isMenuExpanded ? 'Hide' : 'Show',
      disabled: this.balloonsPopped > 0,
      onClick: () => this.toggleMenu(),
      style: {
        width: 90,
        height: 64,
        fontSize: 22,
      },
    });
    this.scoreText = new xb.UIText({
      text: `${this.balloonsPopped} / ${this.balloonCount}`,
      style: {
        flexGrow: 1,
        fontSize: 38,
        fontWeight: 'bold',
        textAlign: 'center',
      },
    });
    header.add(
      toggle,
      this.scoreText,
      createControlButton('refresh', 'Reset balloons', () => this.resetGame())
    );
    this.menuPanel.add(header);

    if (this.isMenuExpanded) {
      createStepperControl(
        this,
        this.menuPanel,
        'Balloons',
        'balloonCount',
        5,
        30,
        1,
        true
      );
      createStepperControl(
        this,
        this.menuPanel,
        'Speed',
        'balloonSpeed',
        0.0,
        0.1,
        0.01,
        false
      );
    }
  }

  renderReadme() {
    this.readmePanel = new xb.UICard({
      size: {width: 0.9, height: 0.5},
    });
    this.readmePanel.name = 'Balloon Pop instructions';
    this.readmePanel.position.set(-0.5, 1.4, -1.15);
    this.readmePanel.rotation.set(0, 0.25, 0);
    this.add(this.readmePanel);

    this.readmePanel.add(
      new xb.UIText({
        text: 'BALLOON POP',
        style: {
          color: xb.ui.theme.colors.primary,
          fontSize: 38,
          fontWeight: 'bold',
          textAlign: 'center',
        },
      }),
      new xb.UIText({
        text: 'Pinch either hand to shoot.\nOn desktop, left-click to shoot and use WASD + right-click to move.',
        style: {
          flexGrow: 1,
          color: xb.ui.theme.colors.secondaryText,
          fontSize: 26,
          lineHeight: 1.35,
          textAlign: 'center',
        },
      })
    );

    const okayBtn = new xb.UIButton({
      label: 'Play',
      onClick: () => {
        this.gameStarted = true;
        this.remove(this.readmePanel);
        this.readmePanel = null;
      },
      style: {
        width: '100%',
        height: 76,
        fontSize: 30,
        fontWeight: 'bold',
        textAlign: 'center',
      },
    });
    this.readmePanel.add(okayBtn);
  }

  toggleMenu() {
    this.isMenuExpanded = !this.isMenuExpanded;
    this.renderMenu();
  }
  updateScoreDisplay() {
    if (this.scoreText)
      this.scoreText.text = `${this.balloonsPopped} / ${this.balloonCount}`;
  }
  resetGame() {
    this.spawnBalloons();
    this.renderMenu();
  }

  spawnBalloons() {
    if (!this.physicsWorld || !this.RAPIER || !this.balloonModel) return;
    this.clearBalloons();
    this.balloonsPopped = 0;
    this.updateScoreDisplay();
    const color = new THREE.Color();
    for (let i = 0; i < this.balloonCount; i++) {
      const grp = this.balloonModel.clone();
      const x = (Math.random() - 0.5) * 4,
        y = 1.5 + Math.random() * 1,
        z = -2 - Math.random() * 2;
      grp.position.set(x, y, z);
      const s = 0.7 + Math.random() * 0.6;
      grp.scale.set(s, s, s);
      color.setHSL(Math.random(), 0.95, 0.6);
      grp.traverse((c) => {
        if (c.isMesh) {
          c.material = c.material.clone();
          c.material.color.copy(color);
        }
      });
      const rb = this.physicsWorld.createRigidBody(
        this.RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(x, y, z)
          .setGravityScale(-0.05 * s)
          .setLinearDamping(0.5)
          .setAngularDamping(0.5)
      );
      const col = this.physicsWorld.createCollider(
        this.RAPIER.ColliderDesc.ball(0.5 * s)
          .setActiveEvents(this.RAPIER.ActiveEvents.COLLISION_EVENTS)
          .setRestitution(0.85)
          .setDensity(0.1)
          .setCollisionGroups(GROUP_BALLOON),
        rb
      );
      this.balloons.set(col.handle, {
        mesh: grp,
        rigidBody: rb,
        collider: col,
        color: color.clone(),
      });
      this.add(grp);
    }
  }

  clearBalloons() {
    if (!this.physicsWorld) return;
    for (const b of this.balloons.values()) {
      this.remove(b.mesh);
      this.physicsWorld.removeCollider(b.collider, false);
      this.physicsWorld.removeRigidBody(b.rigidBody);
    }
    this.balloons.clear();
  }

  spawnExplosion(position, color) {
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const mat = this.particleMaterial.clone();
      mat.color.copy(color);
      const mesh = new THREE.Mesh(this.particleGeometry, mat);
      mesh.position.copy(position);
      this.add(mesh);
      this.particles.push({
        mesh,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 4.0,
          (Math.random() - 0.5) * 4.0,
          (Math.random() - 0.5) * 4.0
        ),
        life: PARTICLE_LIFE,
      });
    }
  }

  onSelectStart(event) {
    if (!this.gameStarted) return;
    if (isDescendantOf(event.target, this.menuPanel)) return;
    if (this.activeDart) return;
    const controller = event.source.controller;
    this.activeDart = this.dartModel.clone();
    this.activeDart.position.set(0, -0.05, -0.15);
    this.activeDart.rotation.set(-Math.PI / 2, 0, 0);
    controller.add(this.activeDart);
  }

  onSelectEnd(event) {
    const ctrl = event.source.controller;
    if (!this.activeDart || !this.physicsWorld) return;
    const dart = this.activeDart;
    this.activeDart = null;
    const wPos = new THREE.Vector3(),
      wQuat = new THREE.Quaternion();
    dart.getWorldPosition(wPos);
    dart.getWorldQuaternion(wQuat);
    ctrl.remove(dart);
    dart.position.copy(wPos);
    dart.quaternion.copy(wQuat);
    this.add(dart);
    playWhooshSound();
    const rb = this.physicsWorld.createRigidBody(
      this.RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(wPos.x, wPos.y, wPos.z)
        .setRotation(wQuat)
        .setGravityScale(DART_GRAVITY_SCALE)
        .setCcdEnabled(true)
    );
    const col = this.physicsWorld.createCollider(
      this.RAPIER.ColliderDesc.capsule(0.1, 0.015)
        .setActiveEvents(this.RAPIER.ActiveEvents.COLLISION_EVENTS)
        .setSensor(true)
        .setCollisionGroups(GROUP_DART),
      rb
    );
    rb.setLinvel(
      new THREE.Vector3(0, 1, 0)
        .applyQuaternion(wQuat)
        .multiplyScalar(DART_SPEED),
      true
    );
    this.darts.set(col.handle, {mesh: dart, rigidBody: rb, collider: col});
  }

  update(time, delta) {
    if (this.physicsWorld) {
      for (const b of this.balloons.values()) {
        b.mesh.position.copy(b.rigidBody.translation());
        b.mesh.quaternion.copy(b.rigidBody.rotation());
      }
      for (const [h, d] of this.darts.entries()) {
        d.mesh.position.copy(d.rigidBody.translation());
        d.mesh.quaternion.copy(d.rigidBody.rotation());
        if (d.mesh.position.y < -5 || Math.abs(d.mesh.position.z) > 30)
          this.removeDart(h);
      }
    }
    const dt = delta || 1 / 60;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.remove(p.mesh);
        this.particles.splice(i, 1);
      } else {
        p.mesh.position.addScaledVector(p.velocity, dt);
        p.mesh.material.opacity = p.life / PARTICLE_LIFE;
        if (xb.core.camera) p.mesh.lookAt(xb.core.camera.position);
      }
    }
  }

  physicsStep() {
    if (!this.physics || !this.physicsWorld || !xb.core.camera) return;
    const camPos = xb.core.camera.position;
    const speedFactor = this.balloonSpeed / 10;
    for (const b of this.balloons.values()) {
      const s = speedFactor;
      b.rigidBody.addForce(
        {
          x: (Math.random() - 0.5) * s,
          y: (Math.random() - 0.5) * (s * 0.5),
          z: (Math.random() - 0.5) * s,
        },
        true
      );
      const p = b.rigidBody.translation();
      const dx = p.x - camPos.x,
        dz = p.z - camPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > BOUNDARY_RADIUS) {
        b.rigidBody.applyImpulse(
          {
            x: (-dx / dist) * BOUNDARY_IMPULSE,
            y: 0,
            z: (-dz / dist) * BOUNDARY_IMPULSE,
          },
          true
        );
      }
      if (p.y > 5.0)
        b.rigidBody.applyImpulse({x: 0, y: -BOUNDARY_IMPULSE, z: 0}, true);
      if (p.y < 0.5)
        b.rigidBody.applyImpulse({x: 0, y: BOUNDARY_IMPULSE, z: 0}, true);
    }
    this.physics.eventQueue.drainCollisionEvents((h1, h2, s) => {
      if (!s) return;
      if (this.darts.has(h1) && this.balloons.has(h2)) {
        this.popBalloon(h2);
        this.removeDart(h1);
      } else if (this.darts.has(h2) && this.balloons.has(h1)) {
        this.popBalloon(h1);
        this.removeDart(h2);
      }
    });
  }

  popBalloon(h) {
    const b = this.balloons.get(h);
    if (b) {
      this.spawnExplosion(b.mesh.position.clone(), b.color);
      playPopSound();
    }
    this.removeBalloon(h);
    this.balloonsPopped++;
    if (this.balloonsPopped === 1) {
      this.renderMenu();
    } else {
      this.updateScoreDisplay();
    }
  }
  removeBalloon(h) {
    const b = this.balloons.get(h);
    if (!b) return;
    this.remove(b.mesh);
    this.physicsWorld.removeCollider(b.collider, false);
    this.physicsWorld.removeRigidBody(b.rigidBody);
    this.balloons.delete(h);
  }
  removeDart(h) {
    const d = this.darts.get(h);
    if (!d) return;
    this.remove(d.mesh);
    this.physicsWorld.removeCollider(d.collider, false);
    this.physicsWorld.removeRigidBody(d.rigidBody);
    this.darts.delete(h);
  }
}

function isDescendantOf(object, ancestor) {
  for (let current = object; current; current = current.parent) {
    if (current === ancestor) return true;
  }
  return false;
}
