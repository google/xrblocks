import * as xb from 'xrblocks';

const INSTRUCTIONS = 'Aim the camera, then select Capture to write a poem.';

export class PoemGenerator extends xb.Script {
  static dependencies = {ai: xb.AI, deviceCamera: xb.XRDeviceCamera};

  init({ai, deviceCamera}) {
    this.ai = ai;
    this.deviceCamera = deviceCamera;
    this.isProcessing = false;
    this.createCard();
  }

  createCard() {
    const cameraPreview = new xb.UIImage({
      src: this.deviceCamera.texture,
      ariaLabel: 'Live camera preview',
      style: {
        width: 360,
        height: 202.5,
        objectFit: 'cover',
      },
    });

    this.responseText = new xb.UIText({
      text: INSTRUCTIONS,
      style: {
        flexGrow: 1,
        flexShrink: 1,
        fontSize: 29,
        lineHeight: 1.35,
        textAlign: 'left',
        verticalAlign: 'top',
        whiteSpace: 'pre-line',
        overflow: 'hidden',
      },
    });

    const poemContent = new xb.UIPanel({
      style: {
        width: '100%',
        flexGrow: 1,
        flexDirection: 'row',
        gap: 16,
        alignItems: 'flex-start',
      },
      children: [cameraPreview, this.responseText],
    });

    this.statusText = new xb.UIText({
      text: 'Ready',
      style: {
        flexGrow: 1,
        fontSize: 24,
      },
    });

    this.captureButton = new xb.UIButton({
      label: 'Capture',
      icon: 'photo_camera',
      onClick: () => void this.captureAndGeneratePoem(),
      style: {
        width: 210,
        height: 68,
        fontSize: 26,
        fontWeight: 'bold',
      },
    });

    const footer = new xb.UIPanel({
      style: {
        width: '100%',
        height: 72,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 20,
      },
      children: [this.statusText, this.captureButton],
    });

    this.card = new xb.UICard({
      size: {width: 1.05, height: 1.05},
      manipulation: {
        actions: {
          translate: {faceCamera: true},
          scale: {minScale: 0.65, maxScale: 1.75},
        },
        handle: {action: xb.ManipulationAction.Translate},
      },
      edge: {scale: true},
      children: [
        new xb.UIText({
          text: 'XR Poet',
          style: {
            height: 58,
            fontSize: 46,
            fontWeight: 'bold',
          },
        }),
        poemContent,
        footer,
      ],
    });
    this.card.position.set(0, 1.5, -1.45);
    this.add(this.card);
  }

  async captureAndGeneratePoem() {
    if (this.isProcessing) return;
    if (!this.ai.isAvailable()) {
      this.statusText.text = 'Add a Gemini API key to start.';
      return;
    }

    this.isProcessing = true;
    this.captureButton.disabled = true;
    this.statusText.text = 'Writing...';

    try {
      const snapshot = await this.deviceCamera.getSnapshot({
        outputFormat: 'base64',
      });
      if (!snapshot) throw new Error('The camera is not ready.');

      const {strippedBase64, mimeType} = xb.parseBase64DataURL(snapshot);
      const response = await this.ai.query({
        type: 'multiPart',
        parts: [
          {inlineData: {mimeType, data: strippedBase64}},
          {
            text: 'Write a lighthearted 12-line poem about this image. Return only the poem.',
          },
        ],
      });
      const poem = typeof response === 'string' ? response : response?.text;
      if (!poem) throw new Error('Gemini returned an empty response.');

      this.responseText.text = poem.trim();
      this.statusText.text = 'Completed';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.responseText.text = `Could not write the poem.\n\n${message}`;
      this.statusText.text = 'Try again';
    } finally {
      this.isProcessing = false;
      this.captureButton.disabled = false;
    }
  }
}
