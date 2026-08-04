import {describe, it, expect} from 'vitest';
import {TestRunner} from './TestRunner';
import * as THREE from 'three';
import {Core, Script, type SelectEvent, TextButton, Options} from 'xrblocks';

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
    // Determine which controller triggered the selection.
    const controller = event.target as unknown as {userData: {id: number}};
    const index = controller.userData.id;
    this.grabbedByHand = index;
    return true;
  }

  override onObjectSelectEnd(_event: SelectEvent) {
    this.grabbedByHand = null;
    return true;
  }
}

class GameController extends Script {
  score = 0;
  spawnedItems = new Set<THREE.Object3D>();

  spawnItem() {
    const item = new THREE.Object3D();
    this.spawnedItems.add(item);
    this.add(item);
    this.score++;
  }
}

describe('TestRunner functional examples', () => {
  it('should run Example 1: State and Lifecycle Testing', async () => {
    const script = new SimpleRotationScript();
    const runner = await TestRunner.create({
      scripts: [script],
    });

    expect(script.rotation.y).toBe(0);

    await runner.actions.step({durationMs: 16.67});
    expect(script.rotation.y).toBeGreaterThan(0);

    await runner.destroy();
  });

  it('should run Example 2: Raycasting & Hover Check', async () => {
    const hoverScript = new HoverScript();
    hoverScript.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5)));
    hoverScript.position.set(1, 0, -2); // 1m right, 2m in front of user

    const runner = await TestRunner.create({
      scripts: [hoverScript],
    });

    // Initially pointing down/away, not hovered.
    await runner.actions.step({durationMs: 100});
    expect(hoverScript.isHovered).toBe(false);

    await runner.actions.pointTo(1, hoverScript);
    await runner.actions.step({durationMs: 100});

    expect(hoverScript.isHovered).toBe(true);

    await runner.destroy();
  });

  it('should run Example 3: Correct Hand & Grab Verification', async () => {
    const grabbable = new GrabbableScript();
    grabbable.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2)));
    grabbable.position.set(0, 0, -1); // 1 meter in front of user

    const runner = await TestRunner.create({
      scripts: [grabbable],
    });

    await runner.actions.pointTo(1, grabbable);
    await runner.actions.step({
      control: {rightHand: {selectStart: true}},
      durationMs: 100,
    });

    expect(grabbable.grabbedByHand).toBe(1);

    // Release pinch
    await runner.actions.step({
      control: {rightHand: {selectEnd: true}},
      durationMs: 100,
    });

    expect(grabbable.grabbedByHand).toBeNull();

    await runner.destroy();
  });

  it('should run Example 4: UI Button Clicking & Game Logic', async () => {
    const game = new GameController();

    // Create button that triggers spawning on game controller.
    const button = new TextButton({
      text: 'Spawn Item',
    });
    button.onTriggered = () => {
      game.spawnItem();
    };
    button.position.set(0, 1.6, -1.6);

    const runner = await TestRunner.create({
      scripts: [game, button],
    });

    expect(game.score).toBe(0);

    // Point right hand (index 1) at button and click it.
    await runner.actions.pointTo(1, button);
    expect(game.score).toBe(0);
    await runner.actions.click(1);
    await runner.actions.step({durationMs: 250});

    expect(game.score).toBe(1);
    expect(game.spawnedItems.size).toBe(1);

    await runner.destroy();
  });

  it('should run Example 5: End-to-End Heuristic Gesture Recognition', async () => {
    class TestGestureScript extends Script {
      static dependencies = {core: Core};

      pinchDetected = false;
      private core?: Core;
      private _onGestureStart?: (event: Event) => void;
      private _onGestureEnd?: (event: Event) => void;

      override init({core}: {core: Core}) {
        this.core = core;
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
        const gestures = this.core?.gestureRecognition;
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

    const script = new TestGestureScript();
    const options = new Options();
    options.hands.enabled = true;
    options.enableGestures(); // Boot the gesture recognition subsystem!

    const runner = await TestRunner.create({
      scripts: [script],
      options,
    });

    expect(script.pinchDetected).toBe(false);

    await runner.actions.step({
      control: {rightHand: {selectStart: true}},
      durationMs: 400,
    });
    expect(script.pinchDetected).toBe(true);

    await runner.actions.step({
      control: {rightHand: {selectEnd: true}},
      durationMs: 250,
    });

    expect(script.pinchDetected).toBe(false);

    await runner.destroy();
  });
});
