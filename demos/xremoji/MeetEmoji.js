import * as THREE from 'three';
import * as xb from 'xrblocks';

import {AnimationHandler} from './AnimationHandler.js';
import {BalloonsAnimationHandler} from './BallloonsAnimationHandler.js';
import {GestureDetectionHandler} from './GestureDetectionHandler.js';

const LEFT_HAND_INDEX = 0;
const RIGHT_HAND_INDEX = 1;

const PROPRIETARY_ASSETS_PATH =
    'https://cdn.jsdelivr.net/gh/xrblocks/proprietary-assets@main/';


const BALLOONS_MODELS = [
  {
    model: {
      scale: {x: 1, y: 1, z: 1},
      rotation: {x: 0, y: 0, z: 0},
      path: PROPRIETARY_ASSETS_PATH + 'balloons/',
      model: 'scene.gltf',
      verticallyAlignObject: true
    },
    position: {x: 4, y: -1.2, z: -5},
  },
  {
    model: {
      scale: {x: 1, y: 1, z: 1},
      rotation: {x: 0, y: 0, z: 0},
      path: PROPRIETARY_ASSETS_PATH + 'balloons/',
      model: 'scene.gltf',
      verticallyAlignObject: true
    },
    position: {x: 0, y: -1, z: -5},
  },
  {
    model: {
      scale: {x: 1, y: 1, z: 1},
      rotation: {x: 0, y: 0, z: 0},
      path: PROPRIETARY_ASSETS_PATH + 'balloons/',
      model: 'scene.gltf',
      verticallyAlignObject: true
    },
    position: {x: -4, y: -1.2, z: -5},
  }
];

const VICTORY_MODELS = [
  {
    model: {
      scale: {x: 0.05, y: 0.05, z: 0.05},
      rotation: {x: 0, y: 0, z: 0},
      scene_position: {x: 0, y: 0, z: 0},
      path: PROPRIETARY_ASSETS_PATH + 'Confetti/',
      model: 'scene.gltf',
      verticallyAlignObject: true
    },
    position: {x: 34, y: -15, z: 15},
  },
  {
    model: {
      scale: {x: 0.05, y: 0.05, z: 0.05},
      rotation: {x: 0, y: 0, z: 0},
      scene_position: {x: 0, y: 0, z: 0},
      path: PROPRIETARY_ASSETS_PATH + 'Confetti/',
      model: 'scene.gltf',
      verticallyAlignObject: true
    },
    position: {x: -34, y: -15, z: 15},
  }
];

export class MeetEmoji extends xb.Script {
  constructor() {
    super();
    // Loads data.
    this.handGesture = [0, 0];

    this.playBalloonsOnUpdate = false;
    this.playConfettiOnUpdate = false;

    //
    // Initializes UI.
    //
    {
      // Make a root panel>grid>row>controlPanel>grid
      const panel = new xb.SpatialPanel({
        backgroundColor: '#00000000',
        useDefaultPosition: false,
        showEdge: false
      });
      panel.scale.set(panel.width, panel.height, 1);
      panel.isRoot = true;
      this.add(panel);

      const grid = panel.addGrid();
      // Add blank space on top of the ctrlPanel
      grid.addRow({weight: 0.4});

      // Space for orbiter
      grid.addRow({weight: 0.1});
      // control row
      const controlRow = grid.addRow({weight: 0.5});
      const ctrlPanel = controlRow.addPanel({backgroundColor: '#000000bb'});

      const ctrlGrid = ctrlPanel.addGrid();
      {
        // middle column
        const midColumn = ctrlGrid.addCol({weight: 0.9});

        // top indentation
        midColumn.addRow({weight: 0.3});

        const gesturesRow = midColumn.addRow({weight: 0.4});

        // left indentation
        gesturesRow.addCol({weight: 0.05});

        const textCol = gesturesRow.addCol({weight: 1.0});
        textCol.addRow({weight: 1.0}).addText({
          text: 'Give the victory or thumbs-up gestures a try!',
          fontColor: '#ffffff',
          fontSize: 0.05
        });

        // right indentation
        gesturesRow.addCol({weight: 0.01});

        // bottom indentation
        midColumn.addRow({weight: 0.1});
      }

      const orbiter = ctrlGrid.addOrbiter();
      orbiter.addExitButton();

      panel.updateLayouts();

      this.panel = panel;

      // Animated models
      this.victoryHandler = new AnimationHandler(VICTORY_MODELS);
      this.balloonsHandler = new BalloonsAnimationHandler(BALLOONS_MODELS);

      // Gesture detector
      this.gestureDetectionHandler = new GestureDetectionHandler();
      this.gestureDetectionHandler.registerObserver(this);
    }

    this.frameId = 0;
  }

  onGestureDetected(handIndex, result) {
    if (this.handGesture[handIndex] !== result) {
      if (result === 4) {
        if (!this.victoryHandler.isPlaying) this.playConfettiOnUpdate = true;
      } else if (result === 2) {
        if (!this.balloonsHandler.isPlaying) this.playBalloonsOnUpdate = true;
      }

      // Stub for gesture completion handler
      if (this.handGesture[handIndex] === 4 ||
          this.handGesture[handIndex] === 2) {
        this.onGestureStopped(handIndex, this.handGesture[handIndex]);
      }
      this.handGesture[handIndex] = result;
    }
  }

  onGestureStopped(handIndex, gestureIndex) {
    // TODO: we could hide animation on gesture stop
  }

  /**
   * Initializes the PaintScript.
   */
  init() {
    xb.core.renderer.localClippingEnabled = true;

    this.add(new THREE.HemisphereLight(0x888877, 0x777788, 3));
    const light = new THREE.DirectionalLight(0xffffff, 5.0);
    light.position.set(-0.5, 4, 1.0);
    this.add(light);

    this.panel.position.set(0, 1.2, -1.0);

    this.victoryHandler.init(xb.core, this.panel);
    this.balloonsHandler.init(xb.core, this.panel);
  }

  /**
   * Moves the painter to the pivot position when select starts.
   * @param {XRInputSourceEvent} event
   */
  onSelectStart(event) {}

  /**
   * Updates the painter's line to the current pivot position during selection.
   * @param {number} id The controller id.
   */
  onSelecting(id) {}


  async update() {
    if (this.playConfettiOnUpdate) {
      this.victoryHandler.play(3000);
      this.playConfettiOnUpdate = false;
    }

    if (this.playBalloonsOnUpdate) {
      this.balloonsHandler.play(3000);
      this.playBalloonsOnUpdate = false;
    }

    if (this.balloonsHandler) {
      this.balloonsHandler.onBeforeUpdate();
    }


    // Run gesture detection 12 times per second for ~60fps
    // But an avg fps for webxr is 30-60
    if (this.frameId % 5 === 0 || false) {
      const hands = xb.core.user.hands;
      if (hands != null && hands.hands && hands.hands.length == 2) {
        this.gestureDetectionHandler.postTask(
            hands.hands[LEFT_HAND_INDEX].joints, LEFT_HAND_INDEX);
        this.gestureDetectionHandler.postTask(
            hands.hands[RIGHT_HAND_INDEX].joints, RIGHT_HAND_INDEX);
      }
    }

    this.frameId++;
  }
};
