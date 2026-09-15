import * as THREE from 'three';
import * as xb from 'xrblocks';

const COUNTDOWN_IMAGES = [
  'images/start1.webp',
  'images/start2.webp',
  'images/start3.webp',
  'images/startGo.webp',
];

const COMPUTER_IMAGES = {
  rock: 'images/gestureFistLeft.webp',
  scissors: 'images/gestureScissorsLeft.webp',
  paper: 'images/gesturePaperLeft.webp',
};

const PLAYER_IMAGES = {
  rock: 'images/gestureFistRight.webp',
  scissors: 'images/gestureScissorsRight.webp',
  paper: 'images/gesturePaperRight.webp',
};

const RESULT_IMAGES = {
  tie: 'images/resultTie.webp',
  win: 'images/resultWin.webp',
  lose: 'images/resultLose.webp',
};

const CHOICES = ['rock', 'paper', 'scissors'];
const GESTURE_CHOICES = {
  fist: 'rock',
  'open-palm': 'paper',
  spread: 'paper',
  victory: 'scissors',
};
const BEATS = {rock: 'scissors', paper: 'rock', scissors: 'paper'};

const OUTCOME_PHRASES = {
  tie: ['A draw!', "We've matched.", 'Great minds think alike.'],
  win: ['You got me.', 'Nicely done, you win.', 'The victory is yours.'],
  lose: ['Victory is mine!', 'I got you that time.', 'The round goes to me.'],
};

export class GameRps extends xb.Script {
  constructor() {
    super();
    this.state = 'idle';
    this.captureScores = new Map();
    this.timers = new Set();

    this.countdownImage = new xb.UIImage({
      src: 'images/startStart.webp',
      ariaLabel: 'Game countdown',
      style: {width: 180, height: 100, objectFit: 'contain'},
    });
    this.computerImage = this.createPlayImage('Computer gesture');
    this.playerImage = this.createPlayImage('Your gesture');
    this.resultImage = new xb.UIImage({
      src: 'images/gestureEmpty.webp',
      ariaLabel: 'Round result',
      style: {width: 116, height: 76, objectFit: 'contain'},
    });
    this.primaryText = new xb.UIText({
      text: "Let's play Rock Paper Scissors!",
      style: {
        fontSize: 28,
        fontWeight: 'bold',
        textAlign: 'center',
      },
    });
    this.secondaryText = new xb.UIText({
      text: 'Show a thumbs-up gesture to start.',
      style: {fontSize: 20, textAlign: 'center'},
    });

    const playRow = new xb.UIPanel({
      style: {
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 22,
      },
      children: [
        this.createPlayerPanel('COMPUTER', this.computerImage),
        new xb.UIImage({
          src: 'images/resultVS.webp',
          ariaLabel: 'Versus',
          style: {width: 78, height: 78, objectFit: 'contain'},
        }),
        this.createPlayerPanel('YOU', this.playerImage),
      ],
    });

    this.card = new xb.UICard({
      size: {width: 0.92, height: 'auto'},
      manipulation: true,
      edge: {scale: true},
      style: {
        alignItems: 'center',
      },
      children: [
        new xb.UIText({
          text: 'ROCK - PAPER - SCISSORS',
          style: {
            fontSize: 20,
            fontWeight: 'bold',
            textAlign: 'center',
          },
        }),
        this.countdownImage,
        playRow,
        this.resultImage,
        this.primaryText,
        this.secondaryText,
      ],
    });
    this.card.name = 'Rock Paper Scissors card';
    this.add(this.card);
  }

  createPlayImage(ariaLabel) {
    return new xb.UIImage({
      src: 'images/gestureUnknown.webp',
      ariaLabel,
      style: {width: 150, height: 150, objectFit: 'contain'},
    });
  }

  createPlayerPanel(label, image) {
    return new xb.UIPanel({
      style: {
        width: 210,
        padding: 14,
        gap: 8,
        alignItems: 'center',
      },
      children: [
        new xb.UIText({
          text: label,
          style: {fontSize: 17, textAlign: 'center'},
        }),
        image,
      ],
    });
  }

  init() {
    this.add(new THREE.HemisphereLight(0xffffff, 0x64748b, 3));
    this.card.position.set(0, xb.user.height + 0.05, -1.35);

    const gestures = xb.core.gestureRecognition;
    this.onGesture = (event) => this.handleGesture(event.detail);
    gestures.addEventListener('gesturestart', this.onGesture);
    gestures.addEventListener('gestureupdate', this.onGesture);
  }

  handleGesture({name, confidence}) {
    if (name === 'thumbs-up' && this.state === 'idle') {
      this.startRound();
      return;
    }
    const choice = GESTURE_CHOICES[name];
    if (this.state !== 'capture' || !choice) return;
    this.captureScores.set(
      choice,
      Math.max(confidence, this.captureScores.get(choice) ?? 0)
    );
  }

  startRound() {
    this.state = 'countdown';
    this.captureScores.clear();
    this.computerImage.src = 'images/gestureUnknown.webp';
    this.playerImage.src = 'images/gestureUnknown.webp';
    this.resultImage.src = 'images/gestureEmpty.webp';
    this.primaryText.text = 'Ready?';
    this.secondaryText.text = 'Make rock, paper, or scissors after GO.';

    COUNTDOWN_IMAGES.forEach((image, index) => {
      this.schedule(() => {
        this.countdownImage.src = image;
        if (index === COUNTDOWN_IMAGES.length - 1) this.beginCapture();
      }, index * 700);
    });
  }

  beginCapture() {
    this.state = 'capture';
    this.primaryText.text = 'Throw now!';
    this.captureScores.clear();
    this.schedule(() => this.finishRound(), 1100);
  }

  finishRound() {
    const playerChoice = this.bestCapturedChoice();
    if (!playerChoice) {
      this.state = 'result';
      this.primaryText.text = "I didn't catch your gesture.";
      this.secondaryText.text = 'Show thumbs up when you want to retry.';
      this.schedule(() => this.reset(), 1800);
      return;
    }

    const computerChoice = CHOICES[Math.floor(Math.random() * CHOICES.length)];
    const result = this.getOutcome(playerChoice, computerChoice);
    this.state = 'result';
    this.computerImage.src = COMPUTER_IMAGES[computerChoice];
    this.playerImage.src = PLAYER_IMAGES[playerChoice];
    this.resultImage.src = RESULT_IMAGES[result];
    this.primaryText.text = this.randomPhrase(result);
    this.secondaryText.text = `${this.titleCase(playerChoice)} vs ${this.titleCase(computerChoice)}`;
    this.schedule(() => this.reset(), 2600);
  }

  bestCapturedChoice() {
    let bestChoice;
    let bestScore = 0;
    for (const [choice, score] of this.captureScores) {
      if (score > bestScore) {
        bestChoice = choice;
        bestScore = score;
      }
    }
    return bestChoice;
  }

  getOutcome(playerChoice, computerChoice) {
    if (playerChoice === computerChoice) return 'tie';
    return BEATS[playerChoice] === computerChoice ? 'win' : 'lose';
  }

  randomPhrase(result) {
    const phrases = OUTCOME_PHRASES[result];
    return phrases[Math.floor(Math.random() * phrases.length)];
  }

  titleCase(value) {
    return value[0].toUpperCase() + value.slice(1);
  }

  reset() {
    this.state = 'idle';
    this.countdownImage.src = 'images/startStart.webp';
    this.primaryText.text = "Let's play again!";
    this.secondaryText.text = 'Show a thumbs-up gesture to start.';
  }

  schedule(callback, delayMs) {
    const timer = window.setTimeout(() => {
      this.timers.delete(timer);
      callback();
    }, delayMs);
    this.timers.add(timer);
  }

  dispose() {
    const gestures = xb.core.gestureRecognition;
    gestures?.removeEventListener('gesturestart', this.onGesture);
    gestures?.removeEventListener('gestureupdate', this.onGesture);
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers.clear();
  }
}
