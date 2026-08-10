import * as THREE from 'three';
import * as xb from 'xrblocks';

const BASE_COLORS = {
  select: 0x0891b2,
  prevent: 0xe11d48,
  grab: 0x7c3aed,
};

const EVENT_COLORS = {
  touch: new THREE.Color(0x22d3ee),
  grab: new THREE.Color(0xe879f9),
  end: new THREE.Color(0xfacc15),
};

function handName(handIndex) {
  return handIndex === xb.Handedness.LEFT ? 'LEFT' : 'RIGHT';
}

function positionText(position) {
  return `${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)}`;
}

function createTextCard({
  name,
  position,
  size,
  title,
  text,
  accent = '#67e8f9',
  titleSize = 28,
  textSize = 17,
}) {
  const titleText = new xb.UIText({
    text: title,
    pointerEvents: 'none',
    style: {
      width: '100%',
      color: accent,
      fontSize: titleSize,
      fontWeight: 'bold',
      textAlign: 'left',
    },
  });
  const bodyText = new xb.UIText({
    text,
    pointerEvents: 'none',
    style: {
      width: '100%',
      color: '#e2e8f0',
      fontSize: textSize,
      lineHeight: 1.25,
      textAlign: 'left',
    },
  });
  const card = new xb.UICard({
    size,
    pointerEvents: 'none',
    style: {
      width: '100%',
      height: '100%',
      padding: 14,
      gap: 5,
      backgroundColor: 'rgba(7, 15, 30, 0.94)',
      borderColor: 'rgba(148, 163, 184, 0.55)',
      borderWidth: 2,
      borderRadius: 20,
    },
    children: [titleText, bodyText],
  });
  card.name = name;
  card.position.copy(position);
  return {card, bodyText};
}

class DirectTouchTarget extends xb.MeshScript {
  constructor({name, color, position, preventSelection = false}) {
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.12,
      roughness: 0.32,
      metalness: 0.08,
    });
    super(new THREE.BoxGeometry(0.19, 0.19, 0.06), material);
    this.name = name;
    this.position.copy(position);
    this.material = material;
    this.baseColor = new THREE.Color(color);
    this.preventSelection = preventSelection;
    this.activeTouches = new Set();
    this.activeGrabs = new Set();
    this.flashUntil = 0;
    this.lastEvent = 'WAITING';
    this.lastPosition = '--';
    this.statusDirty = true;
    this.counts = {
      touchStart: 0,
      touching: 0,
      touchEnd: 0,
      grabStart: 0,
      grabbing: 0,
      grabEnd: 0,
      selectStart: 0,
      selectEnd: 0,
    };

    const status = createTextCard({
      name: `${name} status`,
      position: new THREE.Vector3(position.x, 1.2, -0.63),
      size: {width: 0.245, height: 0.13},
      title: name,
      text: 'WAITING',
      accent: preventSelection ? '#fda4af' : '#67e8f9',
    });
    this.status = status.card;
    this.statusText = status.bodyText;

    this.contactMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.013, 16, 12),
      new THREE.MeshBasicMaterial({color: 0xffffff})
    );
    this.contactMarker.name = `${name} contact point`;
    this.contactMarker.visible = false;
    this.contactMarker.xb = {pointerEvents: 'none'};
  }

  setEvent(eventName, event, color) {
    this.lastEvent = `${eventName} / ${handName(event.handIndex)}`;
    this.lastPosition = positionText(event.touchPosition);
    this.contactMarker.position.copy(event.touchPosition);
    this.contactMarker.visible = true;
    this.material.emissive.copy(color);
    this.material.emissiveIntensity = 0.8;
    this.statusDirty = true;
  }

  onObjectTouchStart(event) {
    this.counts.touchStart += 1;
    this.activeTouches.add(event.handIndex);
    if (this.preventSelection) event.preventDefault();
    this.setEvent('TOUCH START', event, EVENT_COLORS.touch);
    event.stopPropagation();
  }

  onObjectTouching(event) {
    this.counts.touching += 1;
    this.setEvent('TOUCHING', event, EVENT_COLORS.touch);
    event.stopPropagation();
  }

  onObjectTouchEnd(event) {
    this.counts.touchEnd += 1;
    this.activeTouches.delete(event.handIndex);
    this.setEvent('TOUCH END', event, EVENT_COLORS.end);
    this.flashUntil = performance.now() + 350;
    event.stopPropagation();
  }

  onObjectGrabStart(event) {
    this.counts.grabStart += 1;
    this.activeGrabs.add(event.handIndex);
    this.setEvent('GRAB START', event, EVENT_COLORS.grab);
    event.stopPropagation();
  }

  onObjectGrabbing(event) {
    this.counts.grabbing += 1;
    this.setEvent('GRABBING', event, EVENT_COLORS.grab);
    event.stopPropagation();
  }

  onObjectGrabEnd(event) {
    this.counts.grabEnd += 1;
    this.activeGrabs.delete(event.handIndex);
    this.setEvent('GRAB END', event, EVENT_COLORS.end);
    this.flashUntil = performance.now() + 350;
    event.stopPropagation();
  }

  onObjectSelectStart(event) {
    this.counts.selectStart += 1;
    this.lastEvent = `SELECT START / ${event.source.type}`;
    this.statusDirty = true;
    event.stopPropagation();
  }

  onObjectSelectEnd(event) {
    this.counts.selectEnd += 1;
    this.lastEvent = `SELECT END / ${event.completed ? 'PASS' : event.reason}`;
    this.statusDirty = true;
    event.stopPropagation();
  }

  update() {
    const now = performance.now();
    if (this.activeGrabs.size > 0) {
      this.material.emissive.copy(EVENT_COLORS.grab);
      this.material.emissiveIntensity = 0.8;
    } else if (this.activeTouches.size > 0) {
      this.material.emissive.copy(EVENT_COLORS.touch);
      this.material.emissiveIntensity = 0.8;
    } else if (now >= this.flashUntil) {
      this.material.emissive.copy(this.baseColor);
      this.material.emissiveIntensity = 0.12;
      this.contactMarker.visible = false;
    }

    if (!this.statusDirty) return;
    const {counts} = this;
    this.statusText.text = [
      `TOUCH ${counts.touchStart} / ${counts.touching} / ${counts.touchEnd}`,
      `GRAB  ${counts.grabStart} / ${counts.grabbing} / ${counts.grabEnd}`,
      `SELECT ${counts.selectStart} / ${counts.selectEnd}`,
      `${this.lastEvent}  @ ${this.lastPosition}`,
    ].join('\n');
    this.statusDirty = false;
  }
}

class DirectTouchLab extends xb.Script {
  init() {
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(0.86, 0.69, 0.025),
      new THREE.MeshStandardMaterial({
        color: 0x07101f,
        roughness: 0.72,
        metalness: 0.05,
      })
    );
    board.name = 'Direct touch diagnostic board';
    board.position.set(0, 1.45, -0.68);
    board.xb = {pointerEvents: 'none'};

    const {card: title} = createTextCard({
      name: 'Direct touch lab title',
      position: new THREE.Vector3(0, 1.77, -0.64),
      size: {width: 0.76, height: 0.12},
      title: 'DIRECT TOUCH LAB',
      text: 'Touch a pad. Pinch while touching to test grab.',
      titleSize: 40,
      textSize: 22,
    });

    const targets = [
      new DirectTouchTarget({
        name: 'TOUCH + SELECT',
        color: BASE_COLORS.select,
        position: new THREE.Vector3(-0.27, 1.48, -0.62),
      }),
      new DirectTouchTarget({
        name: 'PREVENT SELECT',
        color: BASE_COLORS.prevent,
        position: new THREE.Vector3(0, 1.48, -0.62),
        preventSelection: true,
      }),
      new DirectTouchTarget({
        name: 'TOUCH + GRAB',
        color: BASE_COLORS.grab,
        position: new THREE.Vector3(0.27, 1.48, -0.62),
      }),
    ];

    this.add(board, title);
    for (const target of targets) {
      this.add(target, target.status, target.contactMarker);
      target.update();
    }

    const hemisphere = new THREE.HemisphereLight(0xdbeafe, 0x111827, 2.5);
    const key = new THREE.DirectionalLight(0xffffff, 3);
    key.position.set(-1, 2, 1);
    this.add(hemisphere, key);
  }
}

const options = new xb.Options();
options.setAppTitle('Direct Touch Lab');
options.setAppDescription(
  'Close-range checks for direct touch, direct selection, prevention, and grab callbacks.'
);
options.enableHands();
options.hands.visualization = true;
options.hands.visualizeJoints = true;
options.hands.visualizeMeshes = true;
options.simulator.defaultMode = xb.SimulatorMode.CONTROLLER;
options.simulator.defaultHand = xb.Handedness.RIGHT;
options.controllers.visualizeRays = false;
options.reticles.enabled = false;

xb.add(new DirectTouchLab());
await xb.init(options);
