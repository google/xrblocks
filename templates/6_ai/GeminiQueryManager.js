import * as xb from 'xrblocks';

export class GeminiQueryManager extends xb.Script {
  constructor() {
    super();
    this.panel = null;
    this.isProcessing = false;
    this.responseDisplay = null;
  }

  init() {
    this.ai = xb.core.ai;

    this.createPanel();
  }

  createPanel() {
    this.panel = new xb.SpatialPanel(
        {width: 2.5, height: 1.5, backgroundColor: '#1a1a1abb'});
    this.panel.position.set(0, 1.6, -2);
    this.add(this.panel);

    const grid = this.panel.addGrid();

    // Response area
    const responseRow = grid.addRow({weight: 0.8});
    this.responseDisplay =
        new xb.ScrollingTroikaTextView({text: '', fontSize: 0.04});
    responseRow.add(this.responseDisplay);

    const buttonRow = grid.addRow({weight: 0.2});
    const textCol = buttonRow.addCol({weight: 0.5});
    const textButton = textCol.addTextButton({
      text: 'Ask about WebXR',
      fontColor: '#ffffff',
      backgroundColor: '#4285f4',
      fontSize: 0.24,
    });

    const imageCol = buttonRow.addCol({weight: 0.5});
    const imageButton = imageCol.addTextButton({
      text: 'Send Sample Image',
      fontColor: '#ffffff',
      backgroundColor: '#34a853',
      fontSize: 0.24,
    });

    textButton.onTriggered = () => this.askText();
    imageButton.onTriggered = () => this.askImage();
  }

  async ask(parts, displayText) {
    if (this.isProcessing || !this.ai?.isAvailable()) return;

    this.isProcessing = true;
    this.responseDisplay.addText(displayText);

    try {
      const response = await this.ai.query({
        type: 'multiPart',
        parts: parts,
      });
      this.responseDisplay.addText(`🤖 AI: ${response}\n\n`);
    } catch (error) {
      this.responseDisplay.addText(`❌ Error: ${error.message}\n\n`);
    }

    this.isProcessing = false;
  }

  askText() {
    const question = 'Hello! What is WebXR?';
    const parts = [{text: question + ' reply succinctly.'}];
    const displayText = `💬 You: ${question}\n\n`;
    this.ask(parts, displayText);
  }

  askImage() {
    const question = 'What do you see in this image?';
    const image = {
      inlineData: {
        data:
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        mimeType: 'image/png'
      }
    };
    const parts = [image, {text: question}];
    const displayText = `💬 You: ${question}\n📸 [Sample image sent]\n\n`;
    this.ask(parts, displayText);
  }
}
