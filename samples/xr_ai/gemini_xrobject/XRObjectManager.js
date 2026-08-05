import * as THREE from 'three';
import * as xb from 'xrblocks';

import {TouchableSphere} from './TouchableSphere.js';

const LONG_SELECT_DELAY_MS = 1000;
const HOLD_INDICATOR_RADIUS = 0.028;

/**
 * Manages the lifecycle of object detection, user interaction via voice, and
 * the visualization of detected objects as interactive spheres. This class
 * serves as the main application logic for the demo.
 * @extends {xb.Script}
 */
export class XRObjectManager extends xb.Script {
  static dependencies = {
    ai: xb.AI,
    aiOptions: xb.AIOptions,
    sound: xb.CoreSound,
    user: xb.User,
    world: xb.World,
  };

  /**
   * Initializes properties and configures the AI model for user queries.
   */
  constructor() {
    super();
    this.objectSphereRadius = 0.03;
    this.activeSphere = null;
    this.detecting = false;
    this.longSelectTimeout = null;
    this.holdStartedAt = null;
    this.holdSource = null;
    this.spheres = new Set();
    this.onSpeechResult = (event) => this.handleSpeechResult(event);
    this.onSpeechEnd = () => {
      this.activeSphere?.setActive(false);
      this.activeSphere = null;
    };

    this.holdIndicatorGeometry = new THREE.SphereGeometry(
      HOLD_INDICATOR_RADIUS,
      32,
      32
    );
    this.holdIndicatorOuterMaterial = new THREE.MeshBasicMaterial({
      color: 0x4970ff,
      transparent: true,
      opacity: 0.3,
      depthTest: false,
      depthWrite: false,
    });
    this.holdIndicatorInnerMaterial = new THREE.MeshBasicMaterial({
      color: 0x4970ff,
      transparent: true,
      opacity: 0.6,
      depthTest: false,
      depthWrite: false,
    });
    this.holdIndicatorOuter = new THREE.Mesh(
      this.holdIndicatorGeometry,
      this.holdIndicatorOuterMaterial
    );
    this.holdIndicatorInner = new THREE.Mesh(
      this.holdIndicatorGeometry,
      this.holdIndicatorInnerMaterial
    );
    this.holdIndicatorOuter.xb = {pointerEvents: 'none'};
    this.holdIndicatorInner.xb = {pointerEvents: 'none'};
    this.holdIndicatorOuter.renderOrder = 1000;
    this.holdIndicatorInner.renderOrder = 1001;
    this.holdIndicatorWorldPosition = new THREE.Vector3();
    this.holdIndicatorLocalPosition = new THREE.Vector3();

    this.userQueryConfig = {
      systemInstruction: `You're an informative and helpful AI assistant specializing in identifying and describing objects within images. Your primary goal is to provide detailed yet concise answers to user questions, making a best effort to respond even if you're not entirely sure or the image quality is poor. When describing objects, strive for maximum detail without being verbose, focusing on key characteristics. Please ignore any hands or other human body parts present in the image. User queries will always be structured like this: {object: '...', question: '...'}`,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        required: ['answer'],
        properties: {
          answer: {type: 'STRING'},
        },
      },
    };
  }

  onSelectStart(event) {
    this.cancelLongSelect();
    this.removeHoldIndicator();
    if (event.target instanceof TouchableSphere) return;
    this.holdSource = event.source;
    this.holdStartedAt = performance.now();
    this.createHoldIndicator();
    this.longSelectTimeout = setTimeout(() => {
      this.longSelectTimeout = null;
      this.holdIndicatorInner.scale.setScalar(1);
      this.sound.soundSynthesizer.playPresetTone('ACTIVATE');
      void this.queryObjectDetection();
    }, LONG_SELECT_DELAY_MS);
  }

  onSelectEnd() {
    this.cancelLongSelect();
    this.removeHoldIndicator();
  }

  cancelLongSelect() {
    if (this.longSelectTimeout === null) return;
    clearTimeout(this.longSelectTimeout);
    this.longSelectTimeout = null;
  }

  update() {
    if (this.holdStartedAt === null) return;
    if (!this.holdIndicatorOuter.parent) this.createHoldIndicator();
    this.updateHoldIndicatorPosition();
    const progress = Math.min(
      (performance.now() - this.holdStartedAt) / LONG_SELECT_DELAY_MS,
      1
    );
    this.holdIndicatorInner.scale.setScalar(progress * progress);
  }

  createHoldIndicator() {
    this.holdIndicatorInner.scale.setScalar(0.01);
    this.add(this.holdIndicatorOuter, this.holdIndicatorInner);
    this.updateHoldIndicatorPosition();
  }

  updateHoldIndicatorPosition() {
    if (!this.holdSource) return;
    const handedness =
      this.holdSource.handedness === 'left'
        ? xb.Handedness.LEFT
        : this.holdSource.handedness === 'right'
          ? xb.Handedness.RIGHT
          : xb.Handedness.NONE;
    const indexTip =
      handedness === xb.Handedness.NONE
        ? undefined
        : this.user.hands?.getIndexTip(handedness);
    if (indexTip) {
      indexTip.getWorldPosition(this.holdIndicatorWorldPosition);
    } else {
      this.holdIndicatorWorldPosition.set(0, 0, -0.08);
      this.holdSource.controller.localToWorld(this.holdIndicatorWorldPosition);
    }
    this.holdIndicatorLocalPosition.copy(this.holdIndicatorWorldPosition);
    this.worldToLocal(this.holdIndicatorLocalPosition);
    this.holdIndicatorOuter.position.copy(this.holdIndicatorLocalPosition);
    this.holdIndicatorInner.position.copy(this.holdIndicatorLocalPosition);
  }

  removeHoldIndicator() {
    this.holdIndicatorOuter.removeFromParent();
    this.holdIndicatorInner.removeFromParent();
    this.holdStartedAt = null;
    this.holdSource = null;
  }

  /**
   * Sets up listeners for the speech recognizer.
   * @override
   */
  init({ai, aiOptions, sound, user, world}) {
    this.ai = ai;
    this.aiOptions = aiOptions;
    this.sound = sound;
    this.user = user;
    this.world = world;

    if (this.sound.speechRecognizer) {
      this.sound.speechRecognizer.addEventListener(
        'result',
        this.onSpeechResult
      );
      this.sound.speechRecognizer.addEventListener('end', this.onSpeechEnd);
    } else {
      console.error('Speech recognizer not available at init.');
    }
  }

  /**
   * Processes the final transcript from a speech recognition event and queries
   * the AI with the user's question about the currently active object.
   * @param {Event} event - The speech recognition result event.
   */
  handleSpeechResult(event) {
    const {transcript, isFinal} = event;

    // We only use the final output to construct the query.
    if (!isFinal) {
      return;
    }

    if (!this.activeSphere) {
      console.warn('Speech result received, but no active sphere is set.');
      return;
    }

    // Check if the active sphere has an image to query against.
    if (!this.activeSphere.object.image) {
      const warningMsg =
        "I don't have a specific image for that object, so I can't answer questions about it.";
      console.warn(warningMsg);
      this.sound.speechSynthesizer?.speak(warningMsg);
      return;
    }

    const prompt = {
      question: transcript,
      object: this.activeSphere.object.label,
    };
    this.queryObjectInformation(
      JSON.stringify(prompt),
      this.activeSphere.object.image
    )
      .then((response) => {
        try {
          this.sound.speechSynthesizer?.speak(response);
        } catch (error) {
          console.error('Could not speak the object response:', error);
        }
      })
      .catch((error) => {
        const errorMsg =
          "I'm sorry, I had trouble processing that request. Please try again.";
        console.error('Failed to get information about the object:', error);
        this.sound.speechSynthesizer?.speak(errorMsg);
      });
  }

  /**
   * Triggers the `ObjectDetector` to find objects in the scene and creates an
   * interactive sphere for each detected object.
   */
  async queryObjectDetection() {
    if (this.detecting) return;
    if (!this.world.objects) {
      console.error(
        'ObjectDetector is not available. Ensure it is enabled in the options.'
      );
      return;
    }

    this.detecting = true;
    try {
      const detectedObjects = await this.world.objects.runDetection();
      this.clearSpheres();
      for (const detectedObject of detectedObjects) {
        this.createSphereWithLabel(detectedObject);
      }
    } catch (error) {
      console.error('Object detection failed:', error);
    } finally {
      this.detecting = false;
    }
  }

  /**
   * Sends a user's question and the cropped image of a detected object to the
   * AI for a descriptive answer.
   * @param {string} textPrompt - The JSON string containing the question and
   * object label.
   * @param {string} objectImageBase64 - The base64-encoded image of the
   * object.
   * @returns {Promise<string>} A promise that resolves with the AI's response.
   */
  async queryObjectInformation(textPrompt, objectImageBase64) {
    if (!this.ai.isAvailable()) {
      const errorMsg = 'Gemini is unavailable for object query.';
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    const originalConfig = this.aiOptions.gemini.config;
    this.aiOptions.gemini.config = this.userQueryConfig;
    const {mimeType, strippedBase64} = xb.parseBase64DataURL(objectImageBase64);

    try {
      const response = await this.ai.query({
        type: 'multiPart',
        parts: [
          {inlineData: {mimeType, data: strippedBase64}},
          {text: textPrompt},
        ],
      });
      const text = typeof response === 'string' ? response : response?.text;
      if (!text) throw new Error('Gemini returned an empty object response.');
      const parsedResponse = JSON.parse(text);
      if (typeof parsedResponse.answer !== 'string') {
        throw new Error('Gemini returned an invalid object response.');
      }
      return parsedResponse.answer;
    } finally {
      this.aiOptions.gemini.config = originalConfig;
    }
  }

  /**
   * Handles the start of a touch event on a sphere, activating speech
   * recognition.
   * @param {Event} event - The selection event from the TouchableSphere.
   */
  onSphereTouchStart(event) {
    if (
      typeof event.target !== 'object' ||
      !(event.target instanceof TouchableSphere)
    ) {
      return;
    }

    if (this.sound.speechSynthesizer?.isSpeaking) {
      event.target.setActive(false);
      return;
    }

    // Set the active sphere for the speech result handler to use.
    this.activeSphere = event.target;
    this.activeSphere.setActive(true);
    this.sound.speechRecognizer?.start();
  }

  /**
   * Handles the end of a touch event on a sphere, stopping speech recognition.
   * @param {Event} event - The selection event from the TouchableSphere.
   */
  onSphereTouchEnd(event) {
    if (
      typeof event.target !== 'object' ||
      !(event.target instanceof TouchableSphere)
    ) {
      return;
    }
    this.sound.speechRecognizer?.stop();
  }

  /**
   * Creates a `TouchableSphere` instance for a detected object and adds it to
   * the scene.
   * @param {xb.DetectedObject} detectedObject - The object data from the
   * ObjectDetector.
   */
  createSphereWithLabel(detectedObject) {
    const touchableSphereInstance = new TouchableSphere(
      detectedObject,
      this.objectSphereRadius,
      (event) => this.onSphereTouchStart(event),
      (event) => this.onSphereTouchEnd(event)
    );

    this.spheres.add(touchableSphereInstance);
    this.add(touchableSphereInstance);
  }

  clearSpheres() {
    for (const sphere of this.spheres) sphere.removeFromParent();
    this.spheres.clear();
    this.activeSphere = null;
  }

  dispose() {
    this.cancelLongSelect();
    this.removeHoldIndicator();
    this.sound?.speechRecognizer?.removeEventListener(
      'result',
      this.onSpeechResult
    );
    this.sound?.speechRecognizer?.removeEventListener('end', this.onSpeechEnd);
    this.sound?.speechRecognizer?.stop();
    this.clearSpheres();
    this.holdIndicatorGeometry.dispose();
    this.holdIndicatorOuterMaterial.dispose();
    this.holdIndicatorInnerMaterial.dispose();
  }
}
