import * as THREE from 'three';
import {Text} from 'troika-three-text';
import * as xb from 'xrblocks';

const HANDEDNESS = xb.Handedness;

class TouchableSphere extends xb.MeshScript {
  /**
   * @const {number} A multiplier to scale the icon size relative to the sphere
   * radius.
   */
  static ICON_SIZE_MULTIPLIER = 1.2;

  /**
   * @param {xb.DetectedObject} detectedObject The detected object from
   *     ObjectDetector.
   * @param {number} radius The radius of the sphere.
   * @param {string} iconName The name of the Google Icons icon to show.
   * @todo Adapt and integrate with sdk/ui.
   */
  constructor(detectedObject, radius = 0.2, iconName = 'help') {
    const inactiveColor = new THREE.Color(0xd1e2ff); // Cannot access 'this' before super()
    const geometry = new THREE.SphereGeometry(radius, 32, 16);
    const material = new THREE.MeshBasicMaterial({
      color: inactiveColor,
      transparent: true,
      opacity: 0.9,
    });
    super(geometry, material);
    this.inactiveColor = inactiveColor;
    this.activeColor = new THREE.Color(0x4970ff);
    this.textColor = new THREE.Color(0xffffff);
    this.textFontSize = 0.05;
    this.textAnchorX = 'center';
    this.textAnchorY = 'bottom';
    this.textOffsetY = 0.01; // Offset above the sphere
    this.touchDistanceThreshold = radius * 2;
    this.sphereRadius = radius;
    this.labelText = detectedObject.label;
    this.object = detectedObject;
    this.wasTouchedLastFrame = false;
    this.position.copy(detectedObject.position);

    this.iconFont =
      'https://fonts.gstatic.com/s/materialicons/v143/flUhRq6tzZclQEJ-Vdg-IuiaDsNa.woff';
    this.iconName = iconName;
    this.iconFontSize =
      this.sphereRadius * TouchableSphere.ICON_SIZE_MULTIPLIER;
    this.iconColor = new THREE.Color(0xffffff);
    this.iconMesh = null;
    this.raycaster = null;
    this.textLabel = null;
  }

  init(xrCoreInstance) {
    super.init(xrCoreInstance);

    if (this.scene && !this.parent) {
      this.scene.add(this);
    }

    // Create and configure the text label
    this.textLabel = new Text();
    this.textLabel.text = this.labelText;
    this.textLabel.fontSize = this.textFontSize;
    this.textLabel.color = this.textColor;
    this.textLabel.anchorX = this.textAnchorX;
    this.textLabel.anchorY = this.textAnchorY;

    // Position the label above the sphere
    this.textLabel.position.set(0, this.sphereRadius + this.textOffsetY, 0);

    this.add(this.textLabel); // Add label as a child of the sphere
    this.textLabel.sync();

    // Create and configure the icon
    this.iconMesh = new Text();
    this.iconMesh.text = this.iconName;
    this.iconMesh.font = this.iconFont;
    this.iconMesh.fontSize = this.iconFontSize;
    this.iconMesh.color = this.iconColor;
    this.iconMesh.anchorX = 'center';
    this.iconMesh.anchorY = 'middle';
    this.iconMesh.material.depthTest = false; // Keep icon visible
    this.iconMesh.renderOrder = this.renderOrder + 1; // Render icon on top of sphere

    // Position the icon at the center of the sphere
    this.iconMesh.position.set(0, 0, 0);
    this.add(this.iconMesh);
    this.iconMesh.sync();

    // Initialize Raycaster
    this.raycaster = new THREE.Raycaster();
  }

  update() {
    if (
      !this.material ||
      !xb.core.user ||
      !this.textLabel ||
      !xb.core?.camera
    ) {
      return;
    }
    if ((xb.core.user.controllers && !this.raycaster) || !this.iconMesh) {
      return;
    }

    let isTouchedThisFrame = false;
    let touchInitiator = null; // Will hold the controller or hand info

    // Check for controller touch (ray-based)
    for (const controller of xb.core.user.controllers) {
      if (controller && controller.visible) {
        this.raycaster.setFromXRController(controller);
        const intersections = this.raycaster.intersectObject(this, false); // 'this' is the sphere mesh

        if (intersections.length > 0) {
          isTouchedThisFrame = true;
          touchInitiator = controller;
          break; // Stop checking other controllers if one is touching
        }
      }
    }

    // Check for hand touch if XRHands is enabled and available
    if (xb.core.user.hands && !isTouchedThisFrame) {
      const sphereWorldPosition = new THREE.Vector3();
      this.getWorldPosition(sphereWorldPosition); // Get sphere's current world position

      const handednessToCheck = [HANDEDNESS.LEFT, HANDEDNESS.RIGHT];
      for (const handSide of handednessToCheck) {
        const hand = xb.core.user.hands.hands[handSide];
        if (Object.keys(hand.joints).length === 0) break;
        const indexTip = xb.core.user.hands.getIndexTip(handSide);
        if (indexTip) {
          const jointWorldPosition = new THREE.Vector3();
          indexTip.getWorldPosition(jointWorldPosition);

          const distanceToJoint =
            sphereWorldPosition.distanceTo(jointWorldPosition);
          if (
            distanceToJoint <=
            this.sphereRadius + this.touchDistanceThreshold
          ) {
            isTouchedThisFrame = true;
            touchInitiator = {type: 'hand', side: handSide, joint: indexTip};
            break; // Stop checking other hand/joints if one is touching
          }
        }
      }
    }

    // The 'target' is the sphere itself, 'initiator' is what caused the touch
    const selectEvent = {target: this, initiator: touchInitiator};

    // Handle touch state changes and trigger events
    if (isTouchedThisFrame && !this.wasTouchedLastFrame) {
      this.material.color.set(this.activeColor);
      this.onSelectStart(selectEvent);
      this.onSelect(selectEvent); // Called on the frame touch starts
    } else if (!isTouchedThisFrame && this.wasTouchedLastFrame) {
      this.material.color.set(this.inactiveColor);
      this.onSelectEnd(selectEvent);
    } else if (isTouchedThisFrame) {
      this.onSelect(selectEvent);
    }

    this.wasTouchedLastFrame = isTouchedThisFrame;

    const cameraPosition = xb.core.camera.position;
    this.iconMesh.lookAt(cameraPosition);
    this.textLabel.lookAt(cameraPosition);
  }

  /**
   * Sets the visual state (i.e., color) of the sphere to active or inactive.
   * @param {boolean} isActive Whether the sphere should be in an active state.
   */
  setActive(isActive) {
    if (!this.material) {
      return;
    }
    this.material.color.set(isActive ? this.activeColor : this.inactiveColor);
  }

  dispose() {
    if (this.textLabel) {
      this.remove(this.textLabel);
      this.textLabel.dispose();
      this.textLabel = null;
    }
    if (this.iconMesh) {
      this.remove(this.iconMesh);
      this.iconMesh.dispose();
      this.iconMesh = null;
    }
    super.dispose();
  }
}
export {TouchableSphere};
