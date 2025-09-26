import * as THREE from 'three';
import * as xb from 'xrblocks';

function easeInQuad(x) {
  return x * x;
}

function easeOutQuint(x) {
  return 1 - Math.pow(1 - x, 5);
}

export class TriggerManager extends xb.Script {
  constructor(onTrigger, {
    triggerDelay = 1000,
    triggerCooldownDuration = 5000,
    pulseAnimationDuration = 400,
    visualizerColor = 0x4970ff,
    visualizerRadius = 0.028,
  } = {}) {
    super();
    this.onTrigger = onTrigger;
    this.triggerDelay = triggerDelay;
    this.triggerCooldownDuration = triggerCooldownDuration;
    this.pulseAnimationDuration = pulseAnimationDuration;
    this.visualizerColor = visualizerColor;
    this.visualizerRadius = visualizerRadius;

    this.triggerTimeout = null;
    this.lastTriggerTime = 0;
    this.isTriggerOnCooldown = false;
    this.activeHandedness = null;
    this.triggerStartTime = 0;
    this.isPulsing = false;
    this.pulseStartTime = 0;

    this.outerVisualizer = null;
    this.innerVisualizer = null;

    this.sphereGeometry =
        new THREE.SphereGeometry(this.visualizerRadius, 32, 32);

    this.outerMaterialOpacity = 0.3;
    this.outerMaterial = new THREE.MeshBasicMaterial({
      color: this.visualizerColor,
      transparent: true,
      opacity: this.outerMaterialOpacity,
      depthWrite: false,
    });

    this.innerMaterialOpacity = 0.6;
    this.innerMaterial = new THREE.MeshBasicMaterial({
      color: this.visualizerColor,
      transparent: true,
      opacity: this.innerMaterialOpacity,
      depthWrite: false,
    });
  }

  onSelectStart(event) {
    if (event.data && event.data.handedness) {
      this.activeHandedness = event.data.handedness;
    } else {
      console.warn('Could not determine handedness from onSelectStart event.');
      this.activeHandedness = null;
    }
  }

  onSelecting(event) {
    if (this.isPulsing) {
      this.updateVisualizers();
      return;
    }

    if (this.triggerTimeout === null) {
      if (this.isTriggerOnCooldown) return;
      if (!this.activeHandedness || !xb.core.input || !xb.core.input.hands)
        return;

      const handIndex = this.activeHandedness === 'right' ? 1 : 0;
      const hand = xb.core.input.hands[handIndex];
      if (hand && hand.joints && hand.joints['index-finger-tip']) {
        const indexTip = hand.joints['index-finger-tip'];
        this.createVisualizers(indexTip);
        this.triggerStartTime = Date.now();

        this.triggerTimeout = setTimeout(() => {
          this._triggerSelection();
        }, this.triggerDelay);
      }
    }

    this.updateVisualizers();
  }

  onSelectEnd(event) {
    this.removeVisualizers();
    if (this.triggerTimeout) {
      clearTimeout(this.triggerTimeout);
      this.triggerTimeout = null;
    }
    this.activeHandedness = null;
  }

  _triggerSelection() {
    const currentTime = Date.now();
    if (currentTime - this.lastTriggerTime < this.triggerCooldownDuration) {
      return;
    }

    this.lastTriggerTime = currentTime;
    this.isTriggerOnCooldown = true;
    setTimeout(() => {
      this.isTriggerOnCooldown = false;
    }, this.triggerCooldownDuration);

    setTimeout(() => {
      if (!this.outerVisualizer) return;
      xb.core.sound.soundSynthesizer.playPresetTone('ACTIVATE');
      this.isPulsing = true;
      this.pulseStartTime = Date.now();
      setTimeout(() => {
        this.removeVisualizers();
      }, this.pulseAnimationDuration);
    }, 75);


    if (this.onTrigger) {
      this.onTrigger();
    }
  }

  createVisualizers(parent) {
    this.removeVisualizers();
    this.outerMaterial.opacity = this.outerMaterialOpacity;
    this.innerMaterial.opacity = this.innerMaterialOpacity;
    this.outerVisualizer =
        new THREE.Mesh(this.sphereGeometry, this.outerMaterial);
    parent.add(this.outerVisualizer);
    this.innerVisualizer =
        new THREE.Mesh(this.sphereGeometry, this.innerMaterial);
    this.innerVisualizer.scale.setScalar(0.01);
    parent.add(this.innerVisualizer);
  }

  updateVisualizers() {
    if (!this.innerVisualizer || this.triggerStartTime <= 0) return;

    const currentTime = Date.now();
    if (this.isPulsing) {
      const pulseElapsed = currentTime - this.pulseStartTime;
      const pulseProgress =
          Math.min(pulseElapsed / this.pulseAnimationDuration, 1.0);
      const scaleProgress = easeOutQuint(pulseProgress);
      const pulseScale = 1.0 + scaleProgress * 0.20;
      this.innerVisualizer.scale.setScalar(pulseScale);
      const fadeProgress = pulseProgress;
      this.innerMaterial.opacity = 0.5 * (1 - fadeProgress);
      this.outerMaterial.opacity = 0.2 * (1 - fadeProgress);
    } else {
      const elapsed = currentTime - this.triggerStartTime;
      const progress = Math.min(elapsed / this.triggerDelay, 1.0);
      const easedProgress = easeInQuad(progress);
      this.innerVisualizer.scale.setScalar(easedProgress);
    }
  }

  removeVisualizers() {
    if (this.outerVisualizer) {
      this.outerVisualizer.removeFromParent();
      this.outerVisualizer = null;
    }
    if (this.innerVisualizer) {
      this.innerVisualizer.removeFromParent();
      this.innerVisualizer = null;
    }
    this.triggerStartTime = 0;
    this.isPulsing = false;
    this.pulseStartTime = 0;
  }
}
