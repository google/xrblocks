/* eslint-env browser */
import * as THREE from 'three';
import * as xb from 'xrblocks';

class SoundDemoScript extends xb.Script {
  constructor() {
    super();
    this.soundBalls = [];
    this.mainPanel = null;
    this.recordedAudioBuffer = null;
    this.isRecording = false;
    this.recordBtn = null;
    this.statusText = null;
    this.volumeText = null;
    this.recordingStartTime = 0;
    this.currentVolume = 1.0;
    this.ballJumpPhase = 0;
  }

  init() {
    this.createSoundBalls();
    this.createDemoUI();

    const light = new THREE.DirectionalLight(0xffffff, 1.5);
    light.position.set(0, 3, 0);
    this.add(light);

    const ambientLight = new THREE.AmbientLight(0x404040, 1.0);
    this.add(ambientLight);
  }

  createSoundBalls() {
    const ballPositions = [
      {x: -1.0, y: xb.user.height * 0.5, z: -1.5, color: 0xff6b6b},
      {x: 0.0, y: xb.user.height * 0.5, z: -1.5, color: 0x4ecdc4},
      {x: 1.0, y: xb.user.height * 0.5, z: -1.5, color: 0xffe66d},
    ];

    ballPositions.forEach((pos, index) => {
      const geometry = new THREE.SphereGeometry(0.1, 32, 32);
      const material = new THREE.MeshStandardMaterial({
        color: pos.color,
        metalness: 0.3,
        roughness: 0.4,
      });
      const ball = new THREE.Mesh(geometry, material);
      ball.position.set(pos.x, pos.y, pos.z);
      ball.userData.soundIndex = index;
      ball.name = `SoundBall${index}`;
      this.add(ball);
      this.soundBalls.push(ball);
    });
  }

  createDemoUI() {
    this.mainPanel = new xb.UICard({
      size: {width: 1.0, height: 0.8},
      manipulation: {
        actions: {translate: {faceCamera: true}},
        handle: {action: 'translate'},
      },
      edge: true,
      style: {backgroundColor: '#1a1a1aF0'},
    });
    this.mainPanel.position.set(
      0,
      xb.user.height + 0.2,
      -xb.user.panelDistance
    );
    this.add(this.mainPanel);

    const mainPanel = new xb.UIPanel({
      style: {
        width: '100%',
        height: '100%',
        padding: 48,
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 24,
      },
    });
    this.mainPanel.add(mainPanel);
    mainPanel.add(
      new xb.UIText({
        text: 'Sound Recorder',
        style: {fontSize: 56, color: '#4ecdc4', textAlign: 'center'},
      })
    );
    this.statusText = new xb.UIText({
      text: 'Click mic to record',
      style: {fontSize: 36, color: '#ffe66d', textAlign: 'center'},
    });
    mainPanel.add(this.statusText);

    const controls = new xb.UIPanel({
      style: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 18,
      },
    });
    this.recordBtn = new xb.UIButton({
      icon: 'mic',
      ariaLabel: 'Start recording',
      onClick: () => this.toggleRecording(),
      style: {
        flexGrow: 2,
        height: 96,
        backgroundColor: '#9177c7',
        color: '#ffffff',
        fontSize: 30,
        borderRadius: 20,
      },
    });
    const volumeDown = new xb.UIButton({
      icon: 'remove',
      ariaLabel: 'Decrease volume',
      onClick: () => this.adjustVolume(-0.1),
      style: {
        flexGrow: 1,
        height: 96,
        backgroundColor: '#333344',
        color: '#ffffff',
        fontSize: 48,
        borderRadius: 20,
      },
    });
    this.volumeText = new xb.UIText({
      text: '100%',
      style: {flexGrow: 1, color: '#4ecdc4', fontSize: 42, textAlign: 'center'},
    });
    const volumeUp = new xb.UIButton({
      icon: 'add',
      ariaLabel: 'Increase volume',
      onClick: () => this.adjustVolume(0.1),
      style: {
        flexGrow: 1,
        height: 96,
        backgroundColor: '#333344',
        color: '#ffffff',
        fontSize: 42,
        borderRadius: 20,
      },
    });
    controls.add(this.recordBtn, volumeDown, this.volumeText, volumeUp);
    mainPanel.add(controls);
    mainPanel.add(
      new xb.UIText({
        text: 'Click jumping balls to play',
        style: {fontSize: 32, color: '#888888', textAlign: 'center'},
      })
    );
  }

  async toggleRecording() {
    if (this.isRecording) {
      this.isRecording = false;
      this.updateStatus('Stopping recording...');
      await new Promise((resolve) => setTimeout(resolve, 300));
      this.recordedAudioBuffer = xb.core.sound.stopRecording();

      if (this.recordedAudioBuffer && this.recordedAudioBuffer.byteLength > 0) {
        const duration = (
          (Date.now() - this.recordingStartTime) /
          1000
        ).toFixed(1);
        this.updateStatus(`Recorded ${duration}s - Click balls to play`);
      } else {
        this.recordedAudioBuffer = null;
        this.updateStatus('Recording failed - no data captured');
      }

      this.recordBtn.icon = 'mic';
      this.recordBtn.ariaLabel = 'Start recording';
    } else {
      // Start recording using SDK
      try {
        await xb.core.sound.startRecording();

        this.isRecording = true;
        this.recordingStartTime = Date.now();
        this.updateStatus('Recording... Click mic again to stop');
        this.recordBtn.icon = 'mic_off';
        this.recordBtn.ariaLabel = 'Stop recording';
      } catch (error) {
        this.updateStatus('Recording failed - ' + error);
        this.isRecording = false;
      }
    }
  }

  async playRecording() {
    if (!this.recordedAudioBuffer) {
      this.updateStatus('No recording - click mic first!');
      return;
    }

    try {
      this.updateStatus('Playing recording...');

      const sampleRate = xb.core.sound.getRecordingSampleRate();
      await xb.core.sound.playRecordedAudio(
        this.recordedAudioBuffer,
        sampleRate
      );

      setTimeout(() => {
        if (!this.isRecording) {
          this.updateStatus('Click mic to record');
        }
      }, 2000);
    } catch (error) {
      this.updateStatus('Playback failed: ' + error);
    }
  }

  adjustVolume(delta) {
    this.currentVolume = Math.max(0, Math.min(1, this.currentVolume + delta));
    const volumePercent = Math.round(this.currentVolume * 100);

    xb.core.sound.setMasterVolume(this.currentVolume);

    if (this.volumeText) {
      this.volumeText.text = `${volumePercent}%`;
    }

    this.updateStatus(`Volume: ${volumePercent}%`);
  }

  updateStatus(message) {
    if (this.statusText) {
      this.statusText.text = message;
    }
  }

  onSelectStart(event) {
    const controller = event.target;

    this.soundBalls.forEach((ball) => {
      const intersection = xb.core.user.select(ball, controller);
      if (intersection) {
        if (this.recordedAudioBuffer) {
          this.playRecordingFromBall(ball);
          this.updateStatus(
            `Playing from ball ${ball.userData.soundIndex + 1}`
          );
        } else {
          this.updateStatus('Record something first!');
        }

        this.pulseBall(ball);
      }
    });
  }

  async playRecordingFromBall(ball) {
    if (!this.recordedAudioBuffer) return;

    try {
      const sampleRate = xb.core.sound.getRecordingSampleRate();
      const audioListener = xb.core.sound.getAudioListener();

      const audioContext = new AudioContext({sampleRate: sampleRate});

      const int16Data = new Int16Array(this.recordedAudioBuffer);
      const audioBuffer = audioContext.createBuffer(
        1,
        int16Data.length,
        sampleRate
      );
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < int16Data.length; i++) {
        channelData[i] = int16Data[i] / 32768.0;
      }

      const positionalAudio = new THREE.PositionalAudio(audioListener);
      positionalAudio.setBuffer(audioBuffer);
      positionalAudio.setRefDistance(0.5);
      positionalAudio.setRolloffFactor(2.0);
      positionalAudio.setVolume(this.currentVolume);

      ball.add(positionalAudio);
      positionalAudio.play();

      positionalAudio.onEnded = () => {
        ball.remove(positionalAudio);
        audioContext.close();
      };
    } catch (error) {
      this.updateStatus('Play recording from ball failed: ' + error);
    }
  }

  pulseBall(ball) {
    const originalScale = ball.scale.clone();
    const targetScale = originalScale.clone().multiplyScalar(1.3);
    const startTime = Date.now();
    const duration = 200;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      if (progress < 0.5) {
        const t = progress * 2;
        ball.scale.lerpVectors(originalScale, targetScale, t);
      } else {
        const t = (progress - 0.5) * 2;
        ball.scale.lerpVectors(targetScale, originalScale, t);
      }

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        ball.scale.copy(originalScale);
      }
    };

    animate();
  }

  update() {
    this.soundBalls.forEach((ball, index) => {
      ball.rotation.y += 0.01 * (index + 1);

      if (this.recordedAudioBuffer) {
        this.ballJumpPhase += 0.01;
        const jumpHeight = 0.08;
        const baseHeight = xb.user.height * 0.5;
        const jumpOffset =
          Math.abs(Math.sin(this.ballJumpPhase + (index * Math.PI) / 3)) *
          jumpHeight;
        ball.position.y = baseHeight + jumpOffset;

        const targetScale = 1.1;
        ball.scale.lerp(
          new THREE.Vector3(targetScale, targetScale, targetScale),
          0.1
        );
      } else {
        const baseHeight = xb.user.height * 0.5;
        ball.position.y = baseHeight;
        ball.scale.lerp(new THREE.Vector3(1, 1, 1), 0.1);
      }
    });
  }

  destroy() {
    if (this.isRecording) {
      xb.core.sound.disableAudio();
    }
    super.destroy();
  }
}

document.addEventListener('DOMContentLoaded', function () {
  const options = new xb.Options();
  options.reticles.enabled = true;
  options.controllers.visualizeRays = true;
  options.setAppTitle('XR Sound');

  xb.add(new SoundDemoScript());
  xb.init(options);
});
