import {LipsyncMouth} from 'lipsync';
import * as THREE from 'three';
import * as xb from 'xrblocks';

class LipsyncPuppet extends xb.Script {
  constructor() {
    super();
    this.started = false;
    this.cameraPosition = new THREE.Vector3();
    this.headPosition = new THREE.Vector3();
  }

  init() {
    this.buildPuppet();
    this.buildControls();

    this.add(new THREE.AmbientLight(0xffffff, 0.8));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(1, 2, 1);
    this.add(key);
  }

  buildPuppet() {
    const radius = 0.14;
    this.head = new THREE.Group();
    this.head.position.set(0.18, xb.user.height, -1.05);

    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 32, 24),
      new THREE.MeshStandardMaterial({
        color: 0xe9c9a5,
        roughness: 0.7,
        metalness: 0.02,
      })
    );
    this.head.add(shell);

    const eyeGeometry = new THREE.SphereGeometry(radius * 0.095, 12, 8);
    const eyeMaterial = new THREE.MeshBasicMaterial({color: 0x15171b});
    for (const x of [-radius * 0.31, radius * 0.31]) {
      const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
      eye.position.set(x, radius * 0.2, -radius * 0.94);
      this.head.add(eye);
    }

    this.face = new xb.StylizedFace({showEyes: false, headRadius: radius});
    this.head.add(this.face);
    this.add(this.head);
  }

  buildControls() {
    this.status = new xb.UIText({
      text: 'Microphone is off',
      style: {fontSize: 18, textAlign: 'center'},
    });
    this.micButton = new xb.UIButton({
      label: 'Start microphone',
      icon: 'mic',
      onClick: () => this.toggleMicrophone(),
    });

    const card = new xb.UICard({
      size: {width: 0.5, height: 0.34},
      manipulation: true,
      edge: {scale: true},
      children: [
        new xb.UIText({
          text: 'Lipsync puppet',
          style: {
            fontSize: 28,
            fontWeight: 'bold',
            textAlign: 'center',
          },
        }),
        new xb.UIText({
          text: 'Enable the microphone, then speak. The local audio drives the puppet mouth.',
          style: {
            fontSize: 15,
            lineHeight: 1.35,
            textAlign: 'center',
          },
        }),
        this.status,
        this.micButton,
      ],
    });
    card.position.set(-0.64, xb.user.height, -1.0);
    card.rotation.y = Math.PI / 8;
    this.add(card);
  }

  update() {
    const camera = xb.core.camera;
    if (!this.head || !camera) return;
    camera.getWorldPosition(this.cameraPosition);
    this.head.getWorldPosition(this.headPosition);
    this.head.lookAt(
      2 * this.headPosition.x - this.cameraPosition.x,
      this.headPosition.y,
      2 * this.headPosition.z - this.cameraPosition.z
    );
  }

  async toggleMicrophone() {
    if (this.micButton.disabled) return;
    if (this.started) {
      this.stopMicrophone();
      return;
    }

    this.micButton.disabled = true;
    this.status.text = 'Requesting microphone access…';
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {echoCancellation: true, noiseSuppression: true},
        video: false,
      });
      this.mouth = new LipsyncMouth(this.stream, {target: this.face});
      this.head.add(this.mouth);
      this.started = true;
      this.status.text = 'Listening · speak to animate the mouth';
      this.micButton.label = 'Stop microphone';
      this.micButton.icon = 'mic_off';
    } catch (error) {
      console.error('[avatar_lab/lipsync_puppet]', error);
      this.status.text = `Microphone failed: ${error.message}`;
    } finally {
      this.micButton.disabled = false;
    }
  }

  stopMicrophone() {
    this.started = false;
    this.mouth?.parent?.remove(this.mouth);
    this.mouth = null;
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
    this.face.setVisemes({
      jawOpen: 0,
      aa: 0,
      oo: 0,
      oh: 0,
      ee: 0,
      consonant: 0,
    });
    this.status.text = 'Microphone is off';
    this.micButton.label = 'Start microphone';
    this.micButton.icon = 'mic';
  }

  dispose() {
    this.stopMicrophone();
    this.face?.dispose();
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  xb.add(new LipsyncPuppet());
  const options = new xb.Options();
  options.enableReticles();
  options.setAppTitle('Avatar Lab · Lipsync Puppet');
  options.setAppDescription(
    'Use live microphone audio to animate a stylized avatar mouth.'
  );
  await xb.init(options);
});
