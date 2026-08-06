import * as THREE from 'three';
import * as xb from 'xrblocks';

const REACTION_DURATION_MS = 3000;
const CONFETTI_COLORS = [0xff5d8f, 0xffd166, 0x06d6a0, 0x4cc9f0, 0x9b5de5];
const BALLOON_COLORS = [0xff5d8f, 0xffd166, 0x06d6a0, 0x4cc9f0, 0x9b5de5];

class CelebrationEffects extends THREE.Group {
  constructor() {
    super();
    this.confetti = this.createConfetti();
    this.balloons = this.createBalloons();
    this.confettiStart = 0;
    this.balloonsStart = 0;
  }

  createConfetti() {
    const group = new THREE.Group();
    group.visible = false;
    this.add(group);

    for (let index = 0; index < 48; index++) {
      const material = new THREE.MeshBasicMaterial({
        color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
        side: THREE.DoubleSide,
      });
      const piece = new THREE.Mesh(
        new THREE.PlaneGeometry(0.025, 0.055),
        material
      );
      piece.userData.origin = new THREE.Vector3(
        (Math.random() - 0.5) * 1.4,
        Math.random() * 0.55 + 0.35,
        (Math.random() - 0.5) * 0.35
      );
      piece.userData.speed = 0.2 + Math.random() * 0.35;
      piece.userData.spin = (Math.random() - 0.5) * 10;
      group.add(piece);
    }
    return group;
  }

  createBalloons() {
    const group = new THREE.Group();
    group.visible = false;
    this.add(group);

    for (let index = 0; index < 12; index++) {
      const balloon = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 20, 14),
        new THREE.MeshStandardMaterial({
          color: BALLOON_COLORS[index % BALLOON_COLORS.length],
          roughness: 0.35,
        })
      );
      balloon.scale.y = 1.25;
      balloon.userData.origin = new THREE.Vector3(
        (Math.random() - 0.5) * 1.25,
        -0.65 - Math.random() * 0.7,
        (Math.random() - 0.5) * 0.35
      );
      balloon.userData.speed = 0.25 + Math.random() * 0.25;
      balloon.userData.phase = Math.random() * Math.PI * 2;
      group.add(balloon);
    }
    return group;
  }

  playConfetti() {
    this.confettiStart = performance.now();
    this.confetti.visible = true;
  }

  playBalloons() {
    this.balloonsStart = performance.now();
    this.balloons.visible = true;
  }

  update() {
    const now = performance.now();
    this.updateConfetti(now);
    this.updateBalloons(now);
  }

  updateConfetti(now) {
    if (!this.confetti.visible) return;
    const elapsed = (now - this.confettiStart) / 1000;
    if (elapsed * 1000 >= REACTION_DURATION_MS) {
      this.confetti.visible = false;
      return;
    }
    for (const piece of this.confetti.children) {
      piece.position.copy(piece.userData.origin);
      piece.position.y -= elapsed * piece.userData.speed;
      piece.rotation.x = elapsed * piece.userData.spin;
      piece.rotation.z = elapsed * piece.userData.spin * 0.7;
    }
  }

  updateBalloons(now) {
    if (!this.balloons.visible) return;
    const elapsed = (now - this.balloonsStart) / 1000;
    if (elapsed * 1000 >= REACTION_DURATION_MS) {
      this.balloons.visible = false;
      return;
    }
    for (const balloon of this.balloons.children) {
      balloon.position.copy(balloon.userData.origin);
      balloon.position.y += elapsed * balloon.userData.speed;
      balloon.position.x +=
        Math.sin(elapsed * 3 + balloon.userData.phase) * 0.035;
    }
  }
}

export class MeetEmoji extends xb.Script {
  constructor() {
    super();
    this.effects = new CelebrationEffects();
    this.effects.position.set(0, 1.25, -1.35);
    this.add(this.effects);

    this.status = new xb.UIText({
      text: 'Waiting for a gesture...',
      style: {
        fontSize: 34,
        fontWeight: 'bold',
        textAlign: 'center',
      },
    });
    this.hint = new xb.UIText({
      text: 'Victory launches confetti - Thumbs up releases balloons',
      style: {fontSize: 20, textAlign: 'center'},
    });

    this.card = new xb.UICard({
      size: {width: 0.9, height: 0.32},
      manipulation: true,
      edge: {scale: true},
      style: {
        justifyContent: 'center',
        alignItems: 'stretch',
      },
      children: [
        new xb.UIText({
          text: 'XR EMOJI',
          style: {
            fontSize: 20,
            fontWeight: 'bold',
            textAlign: 'center',
          },
        }),
        this.status,
        this.hint,
      ],
    });
    this.card.name = 'XR Emoji reaction card';
    this.add(this.card);
  }

  init() {
    this.add(new THREE.HemisphereLight(0x888877, 0x777788, 3));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(-0.5, 4, 1.0);
    this.add(light);

    this.card.position.set(0, xb.user.height + 0.05, -1.25);
    this.onGestureStart = (event) => this.handleGestureStart(event.detail);
    this.onGestureEnd = (event) => this.handleGestureEnd(event.detail);
    xb.core.gestureRecognition.addEventListener(
      'gesturestart',
      this.onGestureStart
    );
    xb.core.gestureRecognition.addEventListener(
      'gestureend',
      this.onGestureEnd
    );
  }

  handleGestureStart({hand, name}) {
    if (name === 'victory') {
      this.status.text = `${hand} hand: Victory!`;
      this.effects.playConfetti();
    } else if (name === 'thumbs-up') {
      this.status.text = `${hand} hand: Thumbs up!`;
      this.effects.playBalloons();
    }
  }

  handleGestureEnd({name}) {
    if (name === 'victory' || name === 'thumbs-up') {
      this.status.text = 'Waiting for a gesture...';
    }
  }

  update() {
    this.effects.update();
  }

  dispose() {
    xb.core.gestureRecognition?.removeEventListener(
      'gesturestart',
      this.onGestureStart
    );
    xb.core.gestureRecognition?.removeEventListener(
      'gestureend',
      this.onGestureEnd
    );
  }
}
