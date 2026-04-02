import * as xb from 'xrblocks';

import {TouchableSphere} from './TouchableSphere.js';

/**
 * Manages the lifecycle of object detection, user interaction via voice, and
 * the visualization of detected objects as interactive spheres. This class
 * serves as the main application logic for the demo.
 * @extends {xb.Script}
 */
export class XRObjectManager extends xb.Script {
  /**
   * Initializes properties and configures the AI model for user queries.
   */
  constructor() {
    super();
    this.objectSphereRadius = 0.03;
    this.activeSphere = null;

    this.geminiConfig = {
      userQuery: {
        thinkingConfig: {
          thinkingBudget: 0,
        },
        systemInstruction: [
          {
            text: `You're an informative and helpful AI assistant specializing in identifying and describing objects within images. Your primary goal is to provide detailed yet concise answers to user questions, making a best effort to respond even if you're not entirely sure or the image quality is poor. When describing objects, strive for maximum detail without being verbose, focusing on key characteristics. Please ignore any hands or other human body parts present in the image. User queries will always be structured like this: {object: '...', question: '...'}`,
          },
        ],
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          required: ['answer'],
          properties: {
            answer: {type: 'STRING'},
          },
        },
      },
    };
  }

  /**
   * Sets up listeners for the speech recognizer.
   * @override
   */
  init() {
    if (xb.core.sound.speechRecognizer) {
      xb.core.sound.speechRecognizer.addEventListener(
        'result',
        this.handleSpeechResult.bind(this)
      );
      xb.core.sound.speechRecognizer.addEventListener('end', () => {
        this.activeSphere?.setActive(false);
        this.activeSphere = null;
      });
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
      xb.core.sound.speechSynthesizer.speak(warningMsg);
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
          const parsedResponse = JSON.parse(response);
          xb.core.sound.speechSynthesizer.speak(parsedResponse.answer);
        } catch (e) {
          console.error('Error parsing AI response JSON:', e);
        }
      })
      .catch((error) => {
        const errorMsg =
          "I'm sorry, I had trouble processing that request. Please try again.";
        console.error('Failed to get information about the object:', error);
        xb.core.sound.speechSynthesizer.speak(errorMsg);
      });
  }

  /**
   * Triggers the `ObjectDetector` to find objects in the scene and creates an
   * interactive sphere for each detected object.
   */
  async queryObjectionDetection() {
    if (!xb.core.world?.objects) {
      console.error(
        'ObjectDetector is not available. Ensure it is enabled in the options.'
      );
      return;
    }

    const detectedObjects = await xb.core.world.objects.runDetection();
    for (const detectedObject of detectedObjects) {
      this.createSphereWithLabel(detectedObject);
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
  queryObjectInformation(textPrompt, objectImageBase64) {
    if (!xb.core.ai.isAvailable()) {
      const errorMsg = 'Gemini is unavailable for object query.';
      console.error(errorMsg);
      return Promise.reject(new Error(errorMsg));
    }

    xb.core.options.ai.gemini.config = this.geminiConfig.userQuery;
    let {mimeType, strippedBase64} = xb.parseBase64DataURL(objectImageBase64);

    return xb.core.ai
      .query({
        type: 'multiPart',
        parts: [
          {inlineData: {mimeType: mimeType, data: strippedBase64}},
          {text: textPrompt},
        ],
      })
      .catch((error) => {
        console.error('AI query for object information failed:', error);
        throw error;
      });
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

    if (xb.core.sound.speechSynthesizer.isSpeaking) {
      event.target.setActive(false);
      return;
    }

    // Set the active sphere for the speech result handler to use.
    this.activeSphere = event.target;
    this.activeSphere.setActive(true);
    xb.core.sound.speechRecognizer.start();
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
    xb.core.sound.speechRecognizer.stop();
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
      'live_help'
    );

    touchableSphereInstance.onSelectStart = (event) =>
      this.onSphereTouchStart(event);
    touchableSphereInstance.onSelectEnd = (event) =>
      this.onSphereTouchEnd(event);

    xb.add(touchableSphereInstance);
  }
}
