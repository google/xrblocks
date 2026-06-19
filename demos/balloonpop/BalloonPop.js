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
  grid,
  labelText,
  valueRef,
  min,
  max,
  step,
  isCount
) {
  const H_BUTTON = 0.15;
  const H_VALUE_LABEL = 0.12;
  const menuHeight = game.menuPanel.height;
  const getW = (h) => h / menuHeight;

  grid.addRow({weight: getW(H_BUTTON)}).addTextButton({
    text: '+',
    fontColor: '#ffffff',
    backgroundColor: '#4285f4',
    fontSize: 0.7,
    width: 0.3,
    weight: 1.0,
  }).onTriggered = () => {
    const maxVal = isCount ? max : 0.1;
    game[valueRef] = Math.min(maxVal, game[valueRef] + step);
    game.renderMenu();
  };

  const displayValue = isCount
    ? game[valueRef]
    : Math.round(game[valueRef] * 100);
  const valueText = grid.addRow({weight: getW(H_VALUE_LABEL)}).addText({
    text: `${labelText}: ${displayValue}`,
    fontColor: '#ffffff',
    fontSize: 0.12,
    textAlign: 'center',
  });

  if (isCount) game.countValueText = valueText;
  else game.speedValueText = valueText;

  grid.addRow({weight: getW(H_BUTTON)}).addTextButton({
    text: '-',
    fontColor: '#ffffff',
    backgroundColor: '#4285f4',
    fontSize: 0.7,
    width: 0.3,
    weight: 1.0,
  }).onTriggered = () => {
    game[valueRef] = Math.max(min, game[valueRef] - step);
    game.renderMenu();
  };
  grid.addRow({weight: getW(0.01)});
}

function applyGlimmerPatch(panel) {
  if (panel.mesh && panel.mesh.material) {
    let fs = panel.mesh.material.fragmentShader;
    if (!fs.includes('Jetpack Glimmer')) {
      fs = fs.replace(
        'vec4 colorOutside = vec4(0.0, 0.0, 0.0, 0.0);',
        `// Jetpack Glimmer
        float isOutline = smoothstep(uOutlineWidth, uOutlineWidth - aa, -distOuterUV);
        colorInside = mix(colorInside, vec4(1.0, 1.0, 1.0, 1.0), isOutline);
        vec4 colorOutside = vec4(0.0, 0.0, 0.0, 0.0);`
      );
      panel.mesh.material.fragmentShader = fs;
      panel.mesh.material.needsUpdate = true;
    }
  }
}

function applySquircleBorderPatch(button) {
  if (button.mesh && button.mesh.material) {
    let fs = button.mesh.material.fragmentShader;
    if (!fs.includes('Squircle Border')) {
      fs = fs.replace(
        'vec4 finalColor = mix(colorInside, colorOutside, smoothstep(0.0, 1.0, dist));',
        `// Squircle Border
        float isOutline = smoothstep(-3.0, -1.0, dist);
        vec4 customBg = vec4(1.0, 1.0, 1.0, 0.25);
        vec4 customBorder = vec4(1.0, 1.0, 1.0, 1.0);
        vec4 myColorInside = mix(customBg, customBorder, isOutline);
        vec4 finalColor = mix(myColorInside, colorOutside, smoothstep(0.0, 1.0, dist));`
      );
      fs = fs.replace(
        'gl_FragColor = uOpacity * finalColor.a * vec4(finalColor.rgb, 1.0);',
        `// Straight Alpha Fix
        gl_FragColor = vec4(finalColor.rgb, finalColor.a * uOpacity);`
      );
      button.mesh.material.fragmentShader = fs;
      button.mesh.material.needsUpdate = true;
    }
  }
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
    this.raycaster = new THREE.Raycaster();
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
    const H_TOGGLE = 0.1;
    const H_SCORE = 0.15;
    const H_RESET = 0.15;
    const H_SPACE = 0.03;
    const H_BUTTON = 0.15;
    const H_VALUE_LABEL = 0.12;
    const headerHeight = H_TOGGLE + H_SCORE + H_RESET + H_SPACE;
    const expandedControlsHeight =
      (H_BUTTON + H_VALUE_LABEL + H_BUTTON + H_SPACE) * 2;
    if (this.balloonsPopped > 0) {
      this.isMenuExpanded = false;
    }
    const menuHeight = this.isMenuExpanded
      ? headerHeight + expandedControlsHeight
      : headerHeight;
    const getW = (h) => h / menuHeight;

    this.menuPanel = new xb.SpatialPanel({
      width: MENU_WIDTH,
      height: menuHeight,
      backgroundColor: '#00000000',
      showEdge: true,
      edgeColor: 'white',
      edgeWidth: 0.001,
    });

    applyGlimmerPatch(this.menuPanel);
    this.menuPanel.position.copy(this.menuPos);
    this.menuPanel.rotation.copy(this.menuRot);
    this.add(this.menuPanel);
    const grid = this.menuPanel.addGrid();
    grid.addRow({weight: getW(H_TOGGLE)}).addTextButton({
      text: this.isMenuExpanded ? '\u25B2' : '\u25BC',
      fontColor: this.balloonsPopped === 0 ? '#ffffff' : '#888888',
      backgroundColor: '#444444',
      fontSize: 0.7,
      weight: 1.0,
    }).onTriggered = () => {
      if (this.balloonsPopped === 0) this.toggleMenu();
    };
    this.scoreText = grid.addRow({weight: getW(H_SCORE)}).addText({
      text: `${this.balloonsPopped} / ${this.balloonCount}`,
      fontColor: '#ffffff',
      fontSize: 0.15,
      textAlign: 'center',
    });
    grid.addRow({weight: getW(H_RESET)}).addTextButton({
      text: '\u21BB',
      fontColor: '#ffffff',
      backgroundColor: '#d93025',
      fontSize: 0.7,
      weight: 1.0,
    }).onTriggered = () => this.resetGame();
    grid.addRow({weight: getW(H_SPACE)});
    if (this.isMenuExpanded) {
      createStepperControl(
        this,
        grid,
        'Balloons',
        'balloonCount',
        5,
        30,
        1,
        true
      );
      createStepperControl(
        this,
        grid,
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
    this.readmePanel = new xb.SpatialPanel({
      width: 0.9,
      height: 0.5,
      backgroundColor: '#00000000',
      showEdge: true,
      edgeColor: 'white',
      edgeWidth: 0.001,
    });
    applyGlimmerPatch(this.readmePanel);

    this.readmePanel.position.set(-0.8, 1.4, -0.8);
    this.readmePanel.rotation.set(0, Math.PI / 6, 0);
    this.add(this.readmePanel);

    const grid = this.readmePanel.addGrid();

    grid.addRow({weight: 0.65}).addText({
      text: 'Controls\n\nXR: Pinch either hand to shoot\nDesktop: WASD + Right-Click to move, Left-Click to shoot',
      fontColor: '#ffffff',
      fontSize: 0.06,
      textAlign: 'center',
    });

    const okayBtn = grid.addRow({weight: 0.35}).addTextButton({
      text: 'OK',
      fontColor: '#ffffff',
      backgroundColor: '#ffffff',
      opacity: 1.0,
      fontSize: 0.15,
      width: 0.5,
      height: 0.8,
    });
    okayBtn.onTriggered = () => {
      this.gameStarted = true;
      this.remove(this.readmePanel);
      this.readmePanel = null;
    };
    applySquircleBorderPatch(okayBtn);
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
    if (this.menuPanel && this.menuPanel.parent) {
      const ctrl = event.target,
        pos = new THREE.Vector3(),
        quat = new THREE.Quaternion();
      ctrl.getWorldPosition(pos);
      ctrl.getWorldQuaternion(quat);
      this.raycaster.set(
        pos,
        new THREE.Vector3(0, 0, -1).applyQuaternion(quat)
      );
      if (this.raycaster.intersectObject(this.menuPanel, true).length > 0)
        return;
    }
    if (this.activeDart) return;
    this.activeDart = this.dartModel.clone();
    this.activeDart.position.set(0, -0.05, -0.15);
    this.activeDart.rotation.set(-Math.PI / 2, 0, 0);
    event.target.add(this.activeDart);
  }

  onSelectEnd(event) {
    const ctrl = event.target;
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
