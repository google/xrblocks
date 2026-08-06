import {afterAll, beforeAll, describe, it, expect} from 'vitest';
import {TestRunner} from './TestRunner';
import * as THREE from 'three';
import {Script, type SelectEvent, Options, core} from 'xrblocks';

class SimpleRotationScript extends Script {
  speed = 1.0;
  override update() {
    this.rotation.y += this.speed * 0.01;
  }
}

class HoverScript extends Script {
  isHovered = false;

  override onHoverEnter(_controller: THREE.Object3D) {
    this.isHovered = true;
  }

  override onHoverExit(_controller: THREE.Object3D) {
    this.isHovered = false;
  }
}

class GrabbableScript extends Script {
  grabbedByHand: number | null = null;

  override onObjectSelectStart(event: SelectEvent) {
    this.grabbedByHand = event.source.controller.userData.id;
    return true;
  }

  override onObjectSelectEnd(_event: SelectEvent) {
    this.grabbedByHand = null;
    return true;
  }
}

class TestGestureScript extends Script {
  pinchDetected = false;
  private _onGestureStart?: (event: Event) => void;
  private _onGestureEnd?: (event: Event) => void;

  override init() {
    const gestures = core.gestureRecognition;
    if (!gestures) return;

    this._onGestureStart = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail && detail.name === 'pinch') {
        this.pinchDetected = true;
      }
    };
    this._onGestureEnd = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail && detail.name === 'pinch') {
        this.pinchDetected = false;
      }
    };

    gestures.addEventListener('gesturestart', this._onGestureStart);
    gestures.addEventListener('gestureend', this._onGestureEnd);
  }

  override dispose() {
    const gestures = core.gestureRecognition;
    if (gestures) {
      if (this._onGestureStart) {
        gestures.removeEventListener('gesturestart', this._onGestureStart);
      }
      if (this._onGestureEnd) {
        gestures.removeEventListener('gestureend', this._onGestureEnd);
      }
    }
  }
}

describe('TestRunner functional examples', () => {
  const rotationScript = new SimpleRotationScript();
  const hoverScript = new HoverScript();
  const grabbableScript = new GrabbableScript();
  const gestureScript = new TestGestureScript();
  let runner: TestRunner;

  beforeAll(async () => {
    hoverScript.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5)));
    hoverScript.position.set(1, 0, -2);
    grabbableScript.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2)));
    grabbableScript.position.set(0, 0, -1);

    const options = new Options();
    options.hands.enabled = true;
    options.enableGestures();
    runner = await TestRunner.create({
      scripts: [rotationScript, hoverScript, grabbableScript, gestureScript],
      options,
    });
  });

  afterAll(async () => {
    await runner.destroy();
  });

  it('should run Example 1: State and Lifecycle Testing', async () => {
    expect(rotationScript.rotation.y).toBe(0);

    await runner.actions.step({durationMs: 16.67});
    expect(rotationScript.rotation.y).toBeGreaterThan(0);
  });

  it('should run Example 2: Raycasting & Hover Check', async () => {
    // Initially pointing down/away, not hovered.
    await runner.actions.step({durationMs: 100});
    expect(hoverScript.isHovered).toBe(false);

    await runner.actions.pointTo(1, hoverScript);
    await runner.actions.step({durationMs: 100});

    expect(hoverScript.isHovered).toBe(true);
  });

  it('should run Example 3: Correct Hand & Grab Verification', async () => {
    await runner.actions.pointTo(1, grabbableScript);
    await runner.actions.step({
      control: {rightHand: {selectStart: true}},
      durationMs: 100,
    });

    expect(grabbableScript.grabbedByHand).toBe(1);

    // Release pinch
    await runner.actions.step({
      control: {rightHand: {selectEnd: true}},
      durationMs: 100,
    });

    expect(grabbableScript.grabbedByHand).toBeNull();
  });

  it('should run Example 4: End-to-End Heuristic Gesture Recognition', async () => {
    expect(gestureScript.pinchDetected).toBe(false);

    await runner.actions.step({
      control: {rightHand: {selectStart: true}},
      durationMs: 400,
    });
    expect(gestureScript.pinchDetected).toBe(true);

    await runner.actions.step({
      control: {rightHand: {selectEnd: true}},
      durationMs: 250,
    });

    expect(gestureScript.pinchDetected).toBe(false);
  });
});
