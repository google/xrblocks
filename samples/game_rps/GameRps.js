import * as THREE from 'three';
import * as xb from 'xrblocks';

import {GestureDetectionHandler} from './GestureDetectionHandler.js'

const LEFT_HAND_INDEX = 0;
const RIGHT_HAND_INDEX = 1;


const countdownImages = [
  'images/start1.webp', 'images/start2.webp', 'images/start3.webp',
  'images/startGo.webp'
];

const rpsLeftImages = [
  'images/gestureUnknown.webp', 'images/gestureFistLeft.webp',
  'images/gestureScissorsLeft.webp', 'images/gesturePaperLeft.webp'
];

const rpsRightImages = [
  'images/gestureUnknown.webp', 'images/gestureFistRight.webp',
  'images/gestureScissorsRight.webp', 'images/gesturePaperRight.webp'
];

const resultImages = [
  'images/resultTie.webp', 'images/resultWin.webp', 'images/resultLose.webp'
];

const gameOutcomePhrases = [
  // Phrases for a draw
  [
    'A draw!', 'We\'ve matched.', 'Great minds think alike.',
    'It\'s a stalemate.', 'We\'re even.', 'Neither of us wins this time.',
    'Looks like we\'re in sync.', 'We\'ll have to go again.',
    'A perfect match.', 'It\'s a tie.'
  ],
  // Phrases for a Gemeni lose
  [
    'You got me.', 'Nicely done, you win.', 'Ah, you were one step ahead.',
    'The victory is yours.', 'I\'ll have to get you next time.',
    'You\'ve defeated me.', 'I couldn\'t beat that.',
    'Well played, you earned it.', 'You read my mind.', 'The point goes to you.'
  ],
  // Phrases for a Gemini victory
  [
    'Victory is mine!', 'I got you that time.', 'Looks like I came out on top.',
    'I\'ll take that win.', 'Another one for my column.',
    'You\'ve been bested.', 'I predicted your move perfectly.',
    'That\'s how it\'s done.', 'I have the winning strategy.',
    'The round goes to me.'
  ],
];

export class GameRps extends xb.Script {
  constructor() {
    super();
    // List of detected gestures for the Left and right hands
    this.handGesture = [[], []];

    this.isDebug = false;

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
      this.startImageRow = grid.addRow({weight: 0.4});
      this.startImageRow.addCol({weight: 0.3});
      this.startImage = this.startImageRow.addCol({weight: 0.4}).addImage({
        src: 'images/startStart.webp'
      });
      this.startImageRow.addCol({weight: 0.3});

      if (this.isDebug) {
        //
        // UI to debug user gestures.
        //
        this.playImageRow = grid.addRow({weight: 0.2});
        this.playImageRow.addCol({weight: 0.2});
        this.imageGesture1 = this.playImageRow.addCol({weight: 0.2}).addImage({
          src: 'images/gestureEmpty.webp'
        });
        // VS text
        this.playImageRow.addCol({weight: 0.2}).addImage({
          src: 'images/resultVS.webp'
        });
        this.imageGesture2 = this.playImageRow.addCol({weight: 0.2}).addImage({
          src: 'images/gestureEmpty.webp'
        });
        this.playImageRow.addCol({weight: 0.3});
        this.playImageRow.hide();

        this.resultImageRow = grid.addRow({weight: 0.2});
        this.resultImageRow.addCol({weight: 0.4});
        this.resultImage = this.resultImageRow.addCol({weight: 0.2}).addImage({
          src: 'images/gestureEmpty.webp'
        });
        this.resultImageRow.hide();
      }

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
        midColumn.addRow({weight: 0.1});

        const gesturesRow = midColumn.addRow({weight: 0.4});

        // left indentation
        gesturesRow.addCol({weight: 0.05});

        const textCol = gesturesRow.addCol({weight: 1.0});
        this.textField1 = textCol.addRow({weight: 1.0}).addText({
          text: 'Do you want to play rock-paper-scissors with me?',
          fontColor: '#ffffff',
          fontSize: 0.045
        });
        this.textField2 = textCol.addRow({weight: 1.0}).addText({
          text: 'Do do a thumbs-up gesture to get started!',
          fontColor: '#ffffff',
          fontSize: 0.045
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

      // Gesture detector
      this.gestureDetectionHandler = new GestureDetectionHandler();
      this.gestureDetectionHandler.registerObserver(this);
    }

    // state for 1-2-3-GO
    this.state = 0;
    // delay for 1-2-3-GO
    this.delayMs = (this.isDebug ? 400 : 800);
    // Wait for 2.5 sec to enable game restart
    this.gameRestartTimeout = (this.isDebug ? 1000 : 2500);
    this.gameGestureDetectionTimeout = (this.isDebug ? 900 : 2500);

    // The gesture detection start time
    this.gestureStartTime = 0;

    // Frame counter
    this.frameId = 0;

    // Play states for both left and right hands
    this.handRpsStates = [[], []];

    // 1-2-3-GO
    this.displayNextImage = this.displayNextImage.bind(this);
  }

  displayNextImage() {
    if (this.state < countdownImages.length) {
      // Load and display the current image
      this.startImage.load(countdownImages[this.state]);
      this.state++;  // Move to the next image for the next call

      // Schedule the next image display after the delay
      setTimeout(this.displayNextImage, this.delayMs);
    } else {
      this.gestureStartTime = Date.now();
      // Enable the papter detection/disable thumb up
      this.gestureDetectionHandler.enablePaperGesture(true);

      setTimeout(() => {
        this.displayRandomGesture();
      }, this.delayMs);
    }
  }

  displayRandomGesture() {
    this.randomGesture = Math.floor(Math.random() * 3) + 1;
    if (this.isDebug) {
      this.startImageRow.hide();
      this.playImageRow.show();
      this.resultImageRow.show();
      // Load random gesture
      this.imageGesture1.load(rpsLeftImages[this.randomGesture]);
    } else {
      this.startImage.load(rpsLeftImages[this.randomGesture]);
    }
  }

  displayGameSummary(idx) {
    let result = 2;
    if (idx == 0) {
      this.textField1.setText('I didn\'t catch what you threw! Let\'s retry!');
      this.textField2.setText('Do a thumbs-up gesture when you are ready!');
    } else {
      let result = this.getRPSOutcome(this.randomGesture, idx);
      this.textField1.setText(this.getRandomPhrase(result));
      this.textField2.setText('Do a thumbs-up gesture to play more!');
    }

    //
    // Debug UI - show game summary and user gesture
    //
    if (this.isDebug) {
      // 'OTHER', 'FIST', 'VICTORY', 'PAPER'
      this.imageGesture2.load(rpsRightImages[idx < 4 ? idx : 0]);
      // Show user gesture
      this.resultImage.load(resultImages[result]);
    }
  }

  /**
   * Determines the outcome of a Rock-Paper-Scissors game.
   *
   * @param {number} playerChoice - The player's choice (1: Rock, 2: Paper, 3:
   *     Scissors).
   * @param {number} opponentChoice - The opponent's choice (1: Rock, 2: Paper,
   *     3: Scissors).
   * @returns {number} The outcome (0: Match, 1: Win, 2: Lose).
   */
  getRPSOutcome(playerChoice, opponentChoice) {
    // Check for a tie
    if (playerChoice === opponentChoice) {
      return 0;  // Match (Tie)
    }

    // Determine win/lose based on the classic rules
    // Player Wins if:
    // Rock (1) beats Scissors (3)
    // Paper (2) beats Rock (1)
    // Scissors (3) beats Paper (2)
    if (
        (playerChoice === 1 && opponentChoice === 3) ||  // Rock vs Scissors
        (playerChoice === 2 && opponentChoice === 1) ||  // Paper vs Rock
        (playerChoice === 3 && opponentChoice === 2)     // Scissors vs Paper
    ) {
      return 1;  // Win
    } else {
      return 2;  // Lose (all other cases are losses)
    }
  }

  startGame() {
    if (this.isDebug) {
      // Show 1-2-3-GO
      this.startImageRow.show();
      // Reset result images
      this.imageGesture1.load('images/gestureEmtpy.webp');
      this.imageGesture2.load('images/gestureEmpty.webp');
      this.resultImage.load('images/gestureEmpty.webp');
      // hide result
      this.playImageRow.hide();
      this.resultImageRow.hide();
    }

    this.textField1.setText('');

    // start timer for the 1-2-3-go
    this.displayNextImage();
  }

  onGestureDetected(handIndex, result) {
    // Thumb up
    if (result == 4) {
      // Ensure the game isn't currently active.
      if (this.state === 0) {
        this.startGame();
      }
      return;
    }

    if (this.gestureStartTime === 0) {
      // skip all late gesture detections
      return;
    }

    // Record all gesture changes for the
    let delta = Date.now() - this.gestureStartTime;
    //
    // Gesture detection time interval exceeded
    //
    if (delta > this.gameGestureDetectionTimeout) {
      this.gestureStartTime = 0;
      this.detectFinalGestures();

    } else {
      let len = this.handRpsStates[handIndex].length;
      if (len == 0 ||
          (this.handGesture[handIndex][len - 1] &&
           this.handGesture[handIndex][len - 1].gesture !== result)) {
        // Save gesture-duration for each hand
        this.handRpsStates[handIndex].push({gesture: result, delta: delta});
        this.handGesture[handIndex] = result;
      }
    }
  }

  detectFinalGestures() {
    // TODO: we can check both hands values
    // this.leftHandGesture =
    // this.detectRPSGesture(this.handRpsStates[LEFT_HAND_INDEX]);
    this.rightHandGesture =
        this.detectRPSGesture(this.handRpsStates[RIGHT_HAND_INDEX]);

    this.displayGameSummary(this.rightHandGesture);

    // Reset cached states
    this.handRpsStates = [[], []];

    // Disable the papter detection. Enable thumb up
    this.gestureDetectionHandler.enablePaperGesture(false);

    // add delay before user could re-start the game
    setTimeout(() => {
      // Ready to play again
      this.state = 0;
    }, this.gameRestartTimeout);
  }

  detectRPSGesture(handRpsStates, options = {}) {
    const defaultOptions = {
      // Gesture must be stable for 300ms
      stabilityDurationMs: 300,
      // Skip first gesture, if it is changed in 300ms
      initialRockIgnoreDurationMs:
          300,  // Ignore initial rock for 300ms (not directly used in this
                // solution, but kept for context)
      // gesture detection period
      maxDetectionWindowMs: this.gameGestureDetectionTimeout
    };
    const {maxDetectionWindowMs} = {...defaultOptions, ...options};

    if (!handRpsStates || handRpsStates.length === 0) {
      return 0;  // Other
    }

    // Ensure data is sorted by delta
    handRpsStates.sort((a, b) => a.delta - b.delta);

    const firstPhaseEndMs = maxDetectionWindowMs * (2 / 5);
    // Corrected to 2/5 to ensure 3/5 remaining
    const secondPhaseStartMs = maxDetectionWindowMs * (2 / 5);

    let rockStartedInFirstPhase = false;
    const gestureDurations = new Map();  // Stores {gesture: totalDurationMs}

    let prevDelta = 0;
    let prevGesture = 0;  // Initialize with 0 to handle the very first gesture

    for (let i = 0; i < handRpsStates.length; i++) {
      const {gesture, delta} = handRpsStates[i];

      // Only consider data within the max detection window
      if (delta > maxDetectionWindowMs) {
        break;
      }

      // Calculate duration for the previous gesture segment
      const duration = delta - prevDelta;

      // Accumulate duration for the previous gesture
      if (prevGesture !== 0 && prevGesture > 0 &&
          prevGesture < 4) {  // Only consider valid RPS gestures
        gestureDurations.set(
            prevGesture, (gestureDurations.get(prevGesture) || 0) + duration);
      }

      // Check if gesture '1' (rock) started in the first phase
      if (gesture === 1 && delta <= firstPhaseEndMs) {
        rockStartedInFirstPhase = true;
      }

      prevDelta = delta;
      prevGesture = gesture;
    }

    // Handle the duration of the very last segment up to maxDetectionWindowMs
    // if it extends beyond the last recorded delta
    if (prevDelta < maxDetectionWindowMs && prevGesture !== 0 &&
        prevGesture > 0 && prevGesture < 4) {
      const remainingDuration = maxDetectionWindowMs - prevDelta;
      gestureDurations.set(
          prevGesture,
          (gestureDurations.get(prevGesture) || 0) + remainingDuration);
    }

    let longestGesture = 0;
    let maxDuration = 0;
    const minRequiredDuration = 300;

    // Determine the relevant time window for finding the longest gesture
    let effectiveStartTime = 0;
    let effectiveEndTime = maxDetectionWindowMs;

    if (rockStartedInFirstPhase) {
      effectiveStartTime = secondPhaseStartMs;
    }

    // Filter and find the longest non-0 gesture within the effective time
    // window We need to re-evaluate durations based on the effective window. A
    // simpler approach is to have accumulated durations and then apply the
    // window logic. Given the accumulated durations, we now iterate through
    // them and find the longest. The previous accumulation already implicitly
    // considers the entire window. The conditional logic
    // (rockStartedInFirstPhase) means we might ignore some initial durations.
    // This requires re-calculating or filtering the `handRpsStates` based on
    // the effective window.

    // Let's re-calculate durations based on the effective window for clarity
    const filteredGestureDurations = new Map();
    let currentWindowPrevDelta = effectiveStartTime;
    let currentWindowPrevGesture =
        0;  // To track the gesture at the start of the effective window

    // Find the gesture at the effectiveStartTime
    for (let i = 0; i < handRpsStates.length; i++) {
      const {gesture, delta} = handRpsStates[i];
      if (delta >= effectiveStartTime) {
        currentWindowPrevGesture =
            prevGesture;  // The gesture *before* reaching effectiveStartTime
        if (i > 0) {
          currentWindowPrevGesture = handRpsStates[i - 1].gesture;
        } else {
          currentWindowPrevGesture =
              gesture;  // If the very first delta is already within the
                        // effective window
        }
        break;
      }
      prevGesture =
          gesture;  // Keep track of the last gesture before effectiveStartTime
    }


    for (let i = 0; i < handRpsStates.length; i++) {
      const {gesture, delta} = handRpsStates[i];

      if (delta < effectiveStartTime) {
        currentWindowPrevDelta = delta;  // Continue updating prevDelta until we
                                         // hit the effectiveStartTime
        currentWindowPrevGesture = gesture;  // Update currentWindowPrevGesture
        continue;
      }

      if (delta > effectiveEndTime) {
        // Calculate duration for the segment up to effectiveEndTime
        const duration = Math.max(
            0,
            effectiveEndTime -
                Math.max(currentWindowPrevDelta, effectiveStartTime));
        if (currentWindowPrevGesture !== 0 && currentWindowPrevGesture > 0 &&
            currentWindowPrevGesture < 4) {
          filteredGestureDurations.set(
              currentWindowPrevGesture,
              (filteredGestureDurations.get(currentWindowPrevGesture) || 0) +
                  duration);
        }
        break;  // We are past the effective end time
      }

      const segmentStart = Math.max(currentWindowPrevDelta, effectiveStartTime);
      const segmentEnd = delta;
      const duration = segmentEnd - segmentStart;

      if (currentWindowPrevGesture !== 0 && currentWindowPrevGesture > 0 &&
          currentWindowPrevGesture < 4) {
        filteredGestureDurations.set(
            currentWindowPrevGesture,
            (filteredGestureDurations.get(currentWindowPrevGesture) || 0) +
                duration);
      }

      currentWindowPrevDelta = delta;
      currentWindowPrevGesture = gesture;
    }

    // Handle the remaining duration if the last recorded delta is before
    // effectiveEndTime
    if (currentWindowPrevDelta < effectiveEndTime &&
        currentWindowPrevGesture !== 0 && currentWindowPrevGesture > 0 &&
        currentWindowPrevGesture < 4) {
      const remainingDuration = effectiveEndTime -
          Math.max(currentWindowPrevDelta, effectiveStartTime);
      filteredGestureDurations.set(
          currentWindowPrevGesture,
          (filteredGestureDurations.get(currentWindowPrevGesture) || 0) +
              remainingDuration);
    }


    for (const [gesture, duration] of filteredGestureDurations.entries()) {
      if (gesture !== 0 && duration >= minRequiredDuration) {
        if (duration > maxDuration) {
          maxDuration = duration;
          longestGesture = gesture;
        }
      }
    }

    return longestGesture;
  }

  onGestureStopped(handIndex, gestureIndex) {
    // Empty
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

    this.panel.position.set(0, xb.core.user.height, -1.0);
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
    //
    // Run gesture detection 12 times per second for ~60fps
    // But an avg fps for webxr is 30-60
    //
    if (this.frameId % 5 === 0) {
      const hands = xb.core.user.hands;
      if (hands.isValid()) {
        this.gestureDetectionHandler.postTask(
            hands.hands[LEFT_HAND_INDEX].joints, LEFT_HAND_INDEX);
        this.gestureDetectionHandler.postTask(
            hands.hands[RIGHT_HAND_INDEX].joints, RIGHT_HAND_INDEX);
      }
    }

    this.frameId++;
  }

  /**
   * Selects a random phrase from a specified category of game outcomes.
   * @param {number} categoryIndex - The index of the category (0 for victory, 1
   *     for loss, 2 for draw).
   * @returns {string|null} A randomly selected phrase from the category, or
   *     null if the index is invalid.
   */
  getRandomPhrase(categoryIndex) {
    if (categoryIndex < 0 || categoryIndex >= gameOutcomePhrases.length) {
      console.error(
          'Invalid category index provided. Please use 0 for victory, 1 for loss, or 2 for draw.');
      return null;
    }
    const phrasesArray = gameOutcomePhrases[categoryIndex];
    const randomIndex = Math.floor(Math.random() * phrasesArray.length);
    return phrasesArray[randomIndex];
  }
};
