import 'xrblocks/addons/simulator/SimulatorAddons.js';
import * as xb from 'xrblocks';
import * as THREE from 'three';
import {Text} from 'troika-three-text';

// --- Dollar $1 Recognizer Implementation ---

function distance(p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function pathLength(points) {
  let d = 0;
  for (let i = 1; i < points.length; i++) {
    d += distance(points[i - 1], points[i]);
  }
  return d;
}

function resample(points, n) {
  const interval = pathLength(points) / (n - 1);
  let D = 0;
  const newPoints = [points[0]];
  const pts = points.slice();
  let i = 1;
  while (i < pts.length) {
    const pt1 = pts[i - 1];
    const pt2 = pts[i];
    const d = distance(pt1, pt2);
    if (D + d >= interval) {
      const t = (interval - D) / d;
      const q = {
        x: pt1.x + t * (pt2.x - pt1.x),
        y: pt1.y + t * (pt2.y - pt1.y),
      };
      newPoints.push(q);
      pts.splice(i, 0, q);
      D = 0;
    } else {
      D += d;
    }
    i++;
  }
  if (newPoints.length === n - 1) {
    newPoints.push(pts[pts.length - 1]);
  }
  return newPoints;
}

function centroid(points) {
  let x = 0,
    y = 0;
  for (let i = 0; i < points.length; i++) {
    x += points[i].x;
    y += points[i].y;
  }
  return {x: x / points.length, y: y / points.length};
}

function boundingBox(points) {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (let i = 0; i < points.length; i++) {
    minX = Math.min(minX, points[i].x);
    maxX = Math.max(maxX, points[i].x);
    minY = Math.min(minY, points[i].y);
    maxY = Math.max(maxY, points[i].y);
  }
  return {x: minX, y: minY, width: maxX - minX, height: maxY - minY};
}

function rotateBy(points, radians) {
  const c = centroid(points);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const newPoints = [];
  for (let i = 0; i < points.length; i++) {
    const qx = (points[i].x - c.x) * cos - (points[i].y - c.y) * sin + c.x;
    const qy = (points[i].x - c.x) * sin + (points[i].y - c.y) * cos + c.y;
    newPoints.push({x: qx, y: qy});
  }
  return newPoints;
}

function rotateToZero(points) {
  const c = centroid(points);
  const theta = Math.atan2(points[0].y - c.y, points[0].x - c.x);
  return rotateBy(points, -theta);
}

function scaleTo(points, size) {
  const B = boundingBox(points);
  const newPoints = [];
  for (let i = 0; i < points.length; i++) {
    const qx = points[i].x * (size / B.width);
    const qy = points[i].y * (size / B.height);
    newPoints.push({x: qx, y: qy});
  }
  return newPoints;
}

function translateTo(points, pt) {
  const c = centroid(points);
  const newPoints = [];
  for (let i = 0; i < points.length; i++) {
    const qx = points[i].x + pt.x - c.x;
    const qy = points[i].y + pt.y - c.y;
    newPoints.push({x: qx, y: qy});
  }
  return newPoints;
}

function pathDistance(pts1, pts2) {
  let d = 0;
  for (let i = 0; i < pts1.length; i++) {
    d += distance(pts1[i], pts2[i]);
  }
  return d / pts1.length;
}

function distanceAtAngle(points, template, radians) {
  const newPoints = rotateBy(points, radians);
  return pathDistance(newPoints, template.points);
}

function distanceAtBestAngle(points, template, a, b, threshold) {
  const phi = 0.5 * (Math.sqrt(5) - 1);
  let x1 = phi * a + (1 - phi) * b;
  let x2 = (1 - phi) * a + phi * b;
  let f1 = distanceAtAngle(points, template, x1);
  let f2 = distanceAtAngle(points, template, x2);
  while (Math.abs(b - a) > threshold) {
    if (f1 < f2) {
      b = x2;
      x2 = x1;
      f2 = f1;
      x1 = phi * a + (1 - phi) * b;
      f1 = distanceAtAngle(points, template, x1);
    } else {
      a = x1;
      x1 = x2;
      f1 = f2;
      x2 = (1 - phi) * a + phi * b;
      f2 = distanceAtAngle(points, template, x2);
    }
  }
  return Math.min(f1, f2);
}

class DollarRecognizer {
  constructor() {
    this.templates = [];

    // Add default templates
    this.addTemplate('Triangle', [
      {x: 0, y: 0},
      {x: 50, y: 100},
      {x: 100, y: 0},
      {x: 0, y: 0},
    ]);
    this.addTemplate('Square', [
      {x: 0, y: 0},
      {x: 0, y: 100},
      {x: 100, y: 100},
      {x: 100, y: 0},
      {x: 0, y: 0},
    ]);
    this.addTemplate('V', [
      {x: 0, y: 100},
      {x: 50, y: 0},
      {x: 100, y: 100},
    ]);
    this.addTemplate('Caret', [
      {x: 0, y: 0},
      {x: 50, y: 100},
      {x: 100, y: 0},
    ]);

    // Circle
    const circlePoints = [];
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      circlePoints.push({x: Math.cos(angle) * 100, y: Math.sin(angle) * 100});
    }
    circlePoints.push(circlePoints[0]); // Close circle
    this.addTemplate('Circle', circlePoints);
  }

  addTemplate(name, points) {
    this.templates.push({
      name: name,
      points: this.preprocess(points),
    });
  }

  preprocess(points) {
    points = resample(points, 64);
    points = rotateToZero(points);
    points = scaleTo(points, 250);
    points = translateTo(points, {x: 0, y: 0});
    return points;
  }

  recognize(points) {
    points = this.preprocess(points);
    let b = Infinity;
    let u = -1;
    for (let i = 0; i < this.templates.length; i++) {
      const d = distanceAtBestAngle(
        points,
        this.templates[i],
        (-45 * Math.PI) / 180,
        (45 * Math.PI) / 180,
        (2 * Math.PI) / 180
      );
      if (d < b) {
        b = d;
        u = i;
      }
    }
    return u !== -1
      ? {
          name: this.templates[u].name,
          score: 1 - b / (0.5 * Math.sqrt(250 * 250 + 250 * 250)),
        }
      : {name: 'Unknown', score: 0};
  }
}

// --- Helper for Perfect Shapes ---

function getPerfectShapeGeometry(name) {
  const geom = new THREE.BufferGeometry();
  let points = [];
  const size = 0.05; // 5cm radius

  switch (name) {
    case 'Circle':
      for (let i = 0; i <= 32; i++) {
        const angle = (i / 32) * Math.PI * 2;
        points.push(
          new THREE.Vector3(Math.cos(angle) * size, Math.sin(angle) * size, 0)
        );
      }
      break;
    case 'Square':
      points = [
        new THREE.Vector3(-size, -size, 0),
        new THREE.Vector3(-size, size, 0),
        new THREE.Vector3(size, size, 0),
        new THREE.Vector3(size, -size, 0),
        new THREE.Vector3(-size, -size, 0),
      ];
      break;
    case 'Triangle':
      points = [
        new THREE.Vector3(0, size, 0),
        new THREE.Vector3(-size, -size, 0),
        new THREE.Vector3(size, -size, 0),
        new THREE.Vector3(0, size, 0),
      ];
      break;
    case 'V':
      points = [
        new THREE.Vector3(-size, size, 0),
        new THREE.Vector3(0, -size, 0),
        new THREE.Vector3(size, size, 0),
      ];
      break;
    case 'Caret':
      points = [
        new THREE.Vector3(-size, -size, 0),
        new THREE.Vector3(0, size, 0),
        new THREE.Vector3(size, -size, 0),
      ];
      break;
    default:
      return null;
  }

  geom.setFromPoints(points);
  return geom;
}

// --- PinchTracker Script ---

class PinchTracker extends xb.Script {
  static dependencies = {camera: THREE.Camera, scene: THREE.Scene};

  init({camera, scene}) {
    this.camera = camera;
    this.scene = scene;
    console.log('PinchTracker initialized');

    this.initHudText();
    this.initDrawing();

    this.isPinching = false;
    this.recognizer = new DollarRecognizer();
    this.capturedPoints = [];
    this.shootingLines = [];
  }

  initHudText() {
    this.hudText = new Text();
    this.hudText.text = 'Pinch to start';
    this.hudText.fontSize = 0.03;
    this.hudText.color = 0x00ffff;
    this.hudText.maxWidth = 0.5;
    this.hudText.position.set(0, 0, -0.5); // 50cm in front of camera
    this.hudText.textAlign = 'center';
    this.hudText.anchorX = 'center';
    this.hudText.anchorY = 'middle';

    this.add(this.hudText);
    this.hudText.sync();
  }

  initDrawing() {
    this.maxPoints = 1000;

    this.lineGeometry = new THREE.BufferGeometry();
    this.linePositions = new Float32Array(this.maxPoints * 3);
    this.lineGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.linePositions, 3)
    );

    this.lineMaterial = new THREE.LineBasicMaterial({
      color: 0xff0000,
      linewidth: 1,
      depthTest: false,
      transparent: true,
      opacity: 1,
    });

    this.line = new THREE.Line(this.lineGeometry, this.lineMaterial);
    this.line.renderOrder = 999;

    this.scene.add(this.line);
    this.lineGeometry.setDrawRange(0, 0);
  }

  clearLine() {
    this.capturedPoints = [];
    this.lineGeometry.setDrawRange(0, 0);
  }

  addPointToLine(pos) {
    if (this.capturedPoints.length < this.maxPoints) {
      this.capturedPoints.push(pos.clone());
      const index = this.capturedPoints.length - 1;
      this.linePositions[index * 3] = pos.x;
      this.linePositions[index * 3 + 1] = pos.y;
      this.linePositions[index * 3 + 2] = pos.z;

      this.lineGeometry.attributes.position.needsUpdate = true;
      this.lineGeometry.setDrawRange(0, this.capturedPoints.length);
      this.lineGeometry.computeBoundingSphere();
    }
  }

  recognizeGesture() {
    if (this.capturedPoints.length > 10) {
      console.log(
        `Recognizing gesture with ${this.capturedPoints.length} points`
      );

      // Project 3D points to 2D camera local space
      const points2D = this.capturedPoints.map((p) => {
        const localPos = p.clone().applyMatrix4(this.camera.matrixWorldInverse);
        return {x: localPos.x, y: localPos.y};
      });

      const result = this.recognizer.recognize(points2D);
      console.log(`Recognized: ${result.name} with score ${result.score}`);

      this.hudText.text = `Recognized: ${result.name}\nScore: ${Math.round(result.score * 100)}%`;
      this.hudText.sync();

      // Spawn shooting perfect shape
      if (result.name !== 'Unknown' && result.score > 0.6) {
        this.spawnShootingShape(result.name);
      }
    } else {
      this.hudText.text = 'Gesture too short';
      this.hudText.sync();
    }
  }

  spawnShootingShape(shapeName) {
    const geom = getPerfectShapeGeometry(shapeName);
    if (!geom) return;

    const mat = new THREE.LineBasicMaterial({
      color: 0x00ff00, // Green for recognized perfect shapes
      linewidth: 1,
      depthTest: false,
      transparent: true,
      opacity: 1,
    });

    const shootLine = new THREE.Line(geom, mat);
    shootLine.renderOrder = 999;

    // Position at the hand position (last captured point)
    const handPos = this.capturedPoints[this.capturedPoints.length - 1];
    shootLine.position.copy(handPos);

    // Rotate to face the camera
    shootLine.quaternion.copy(this.camera.quaternion);

    this.scene.add(shootLine);

    // Calculate direction: from camera to hand position
    const cameraPos = new THREE.Vector3();
    this.camera.getWorldPosition(cameraPos);
    const dir = new THREE.Vector3().subVectors(handPos, cameraPos).normalize();

    this.shootingLines.push({
      line: shootLine,
      dir: dir,
      age: 0,
      maxAge: 2.0, // 2 seconds
    });
  }

  update() {
    // Update HUD position to follow camera
    if (this.hudText && this.camera) {
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();

      this.camera.getWorldPosition(position);
      this.camera.getWorldQuaternion(quaternion);

      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion);
      this.hudText.position.copy(position).addScaledVector(forward, 0.5);
      this.hudText.quaternion.copy(quaternion);
    }

    // Update shooting lines
    const delta = xb.getDeltaTime ? xb.getDeltaTime() : 0.016;
    const speed = 2.0; // meters per second

    for (let i = this.shootingLines.length - 1; i >= 0; i--) {
      const item = this.shootingLines[i];
      item.line.position.addScaledVector(item.dir, speed * delta);
      item.age += delta;

      item.line.material.opacity = 1 - item.age / item.maxAge;

      if (item.age >= item.maxAge) {
        this.scene.remove(item.line);
        item.line.geometry.dispose();
        item.line.material.dispose();
        this.shootingLines.splice(i, 1);
      }
    }

    const leftHandIndex = 0;

    if (xb.user && xb.user.isSelecting(leftHandIndex)) {
      const hands = xb.user.hands;
      if (hands) {
        const indexTip = hands.getIndexTip(0);

        if (indexTip) {
          const worldPos = new THREE.Vector3();
          indexTip.getWorldPosition(worldPos);

          // Handle line drawing and point capture
          if (!this.isPinching) {
            this.isPinching = true;
            this.clearLine();
            this.hudText.text = 'Drawing...';
            this.hudText.sync();
          }
          this.addPointToLine(worldPos);
        }
      }
    } else {
      if (this.isPinching) {
        this.isPinching = false;
        this.recognizeGesture();
      }
    }
  }
}

const options = new xb.Options();
options.world.enabled = true;
options.hands.enabled = true;
options.simulator.modeToggle.enabled = true;
options.xrButton.showEnterSimulatorButton = true;

options.setAppTitle('Unistroke Recognizer');
options.setAppDescription(
  'Tracks left hand pinch, recognizes shapes, and shoots out perfect geometric versions.'
);

function start() {
  const tracker = new PinchTracker();
  xb.add(tracker);
  xb.init(options);
}

document.addEventListener('DOMContentLoaded', function () {
  start();
});
