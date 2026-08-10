import * as xb from 'xrblocks';

class AiQueryScene extends xb.Script {
  init() {
    this.response = new xb.UIText({
      text: 'Choose a prompt to send to Gemini.',
      style: {
        flexGrow: 1,
        padding: 16,
        backgroundColor: '#111722',
        borderRadius: 14,
        fontSize: 16,
        lineHeight: 1.35,
        whiteSpace: 'pre-line',
        overflow: 'hidden',
      },
    });
    this.textButton = new xb.UIButton({
      label: 'Ask about WebXR',
      icon: 'chat',
      style: {flexGrow: 1},
      onClick: () =>
        this.ask(
          {prompt: 'What is WebXR? Reply in three short sentences.'},
          'Asking Gemini about WebXR…'
        ),
    });
    this.imageButton = new xb.UIButton({
      label: 'Describe sample',
      icon: 'image',
      style: {flexGrow: 1},
      onClick: () =>
        this.ask(
          {
            type: 'multiPart',
            parts: [
              {
                inlineData: {
                  data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
                  mimeType: 'image/png',
                },
              },
              {text: 'Briefly describe this sample image.'},
            ],
          },
          'Sending a sample image to Gemini…'
        ),
    });

    const card = new xb.UICard({
      size: {width: 0.68, height: 0.48},
      manipulation: true,
      edge: true,
      style: {flexDirection: 'column', gap: 16, padding: 20},
      children: [
        new xb.UIText({
          text: 'AI Query',
          style: {fontSize: 32, fontWeight: 'bold', textAlign: 'center'},
        }),
        new xb.UIText({
          text: 'Send text or image input to Gemini.',
          style: {fontSize: 17, opacity: 0.72, textAlign: 'center'},
        }),
        this.response,
        new xb.UIPanel({
          style: {width: '100%', flexDirection: 'row', gap: 12},
          children: [this.textButton, this.imageButton],
        }),
      ],
    });
    card.position.set(0, 1.4, -1.1);
    this.add(card);
  }

  async ask(input, pendingText) {
    if (this.textButton.disabled || this.imageButton.disabled) return;
    this.setBusy(true);
    this.response.text = pendingText;
    try {
      const result = await xb.ai.query(input);
      const text = typeof result === 'string' ? result : result?.text;
      this.response.text = text || 'Gemini returned no text.';
    } catch (error) {
      this.response.text =
        error instanceof Error ? error.message : String(error);
    } finally {
      this.setBusy(false);
    }
  }

  setBusy(busy) {
    this.textButton.disabled = busy;
    this.imageButton.disabled = busy;
  }
}

const options = new xb.Options();
options.enableAI();
options.ai.promptForApiKey = true;

xb.add(new AiQueryScene());
await xb.init(options);
